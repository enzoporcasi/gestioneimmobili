-- GestioneImmobili
-- Migration: creazione atomica Spesa con competenze, eventuale primo
-- Pagamento e Conguagli tra Proprietari.
--
-- Modalità:
--   OWNERSHIP_QUOTAS -> le competenze derivano dalle Quote valide alla
--                       data di competenza.
--   MANUAL           -> p_manual_allocations è un array JSON:
--                       [{"owner_id":"uuid","allocated_amount":300.00}, ...]
--
-- I Conguagli vengono generati in questa RPC soltanto se il primo Pagamento
-- salda integralmente la Spesa. Per pagamenti parziali saranno ricalcolati
-- dalla futura RPC record_expense_payment.

create or replace function public.create_expense_with_allocations(
    p_property_id uuid,
    p_rentable_space_id uuid,
    p_category text,
    p_description text,
    p_competence_date date,
    p_total_amount numeric,
    p_allocation_mode text,
    p_manual_allocations jsonb default null,
    p_first_payment_amount numeric default null,
    p_first_payment_date date default null,
    p_payer_owner_id uuid default null,
    p_payment_method text default null,
    p_notes text default null,
    p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security, extensions
as $$
declare
    v_expense_id uuid := gen_random_uuid();
    v_payment_id uuid;
    v_correlation_id uuid := gen_random_uuid();
    v_request_hash text;
    v_existing_response jsonb;
    v_allocated_total numeric(14,2) := 0;
    v_percentage_total numeric(12,6) := 0;
    v_owner_count integer := 0;
    v_settlement_count integer := 0;
    v_expense_status text := 'TO_PAY';
    v_credit numeric(14,2);
    rec record;
begin
    -- ========================================================
    -- 1. Autenticazione, autorizzazione e input
    -- ========================================================
    if auth.uid() is null then
        raise exception using
            errcode = 'P0001',
            message = 'AUTHENTICATION_REQUIRED';
    end if;

    if not security.can_access_property(p_property_id, 'MANAGER') then
        raise exception using
            errcode = 'P0001',
            message = 'ACCESS_DENIED';
    end if;

    if p_competence_date is null then
        raise exception using
            errcode = 'P0001',
            message = 'COMPETENCE_DATE_REQUIRED';
    end if;

    if p_total_amount is null or p_total_amount <= 0 then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_EXPENSE_AMOUNT';
    end if;

    if p_category is null or btrim(p_category) = '' then
        raise exception using
            errcode = 'P0001',
            message = 'EXPENSE_CATEGORY_REQUIRED';
    end if;

    if p_description is null or btrim(p_description) = '' then
        raise exception using
            errcode = 'P0001',
            message = 'EXPENSE_DESCRIPTION_REQUIRED';
    end if;

    if p_allocation_mode not in ('OWNERSHIP_QUOTAS', 'MANUAL') then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_ALLOCATION_MODE';
    end if;

    if p_rentable_space_id is not null
       and not exists (
           select 1
             from public.rentable_spaces rs
            where rs.id = p_rentable_space_id
              and rs.property_id = p_property_id
       ) then
        raise exception using
            errcode = 'P0001',
            message = 'SPACE_PROPERTY_MISMATCH';
    end if;

    if p_first_payment_amount is not null then
        if p_first_payment_amount <= 0
           or p_first_payment_amount > p_total_amount then
            raise exception using
                errcode = 'P0001',
                message = 'INVALID_FIRST_PAYMENT_AMOUNT';
        end if;

        if p_first_payment_date is null then
            raise exception using
                errcode = 'P0001',
                message = 'PAYMENT_DATE_REQUIRED';
        end if;

        if p_payer_owner_id is null then
            raise exception using
                errcode = 'P0001',
                message = 'PAYER_OWNER_REQUIRED';
        end if;

        if p_payment_method is null or btrim(p_payment_method) = '' then
            raise exception using
                errcode = 'P0001',
                message = 'PAYMENT_METHOD_REQUIRED';
        end if;
    elsif p_first_payment_date is not null
       or p_payer_owner_id is not null
       or p_payment_method is not null then
        raise exception using
            errcode = 'P0001',
            message = 'PAYMENT_AMOUNT_REQUIRED';
    end if;

    -- Lock transazionale della Property per coordinare Quote e Spese.
    perform pg_advisory_xact_lock(hashtextextended(p_property_id::text, 0));

    -- ========================================================
    -- 2. Idempotenza
    -- ========================================================
    v_request_hash := encode(
        extensions.digest(
            convert_to(
                concat_ws(
                    '|',
                    p_property_id::text,
                    coalesce(p_rentable_space_id::text, ''),
                    btrim(p_category),
                    btrim(p_description),
                    p_competence_date::text,
                    p_total_amount::text,
                    p_allocation_mode,
                    coalesce(p_manual_allocations::text, ''),
                    coalesce(p_first_payment_amount::text, ''),
                    coalesce(p_first_payment_date::text, ''),
                    coalesce(p_payer_owner_id::text, ''),
                    coalesce(p_payment_method, ''),
                    coalesce(p_notes, '')
                ),
                'UTF8'
            ),
            'sha256'
        ),
        'hex'
    );

    if p_idempotency_key is not null then
        select response_payload
          into v_existing_response
          from public.idempotency_keys
         where user_id = auth.uid()
           and operation_name = 'create_expense_with_allocations'
           and idempotency_key = p_idempotency_key
         for update;

        if found then
            if exists (
                select 1
                  from public.idempotency_keys
                 where user_id = auth.uid()
                   and operation_name = 'create_expense_with_allocations'
                   and idempotency_key = p_idempotency_key
                   and request_hash <> v_request_hash
            ) then
                raise exception using
                    errcode = 'P0001',
                    message = 'IDEMPOTENCY_CONFLICT';
            end if;

            if v_existing_response is not null then
                return v_existing_response;
            end if;
        else
            insert into public.idempotency_keys (
                user_id,
                operation_name,
                idempotency_key,
                request_hash,
                status,
                created_at
            )
            values (
                auth.uid(),
                'create_expense_with_allocations',
                p_idempotency_key,
                v_request_hash,
                'RUNNING',
                now()
            );
        end if;
    end if;

    -- ========================================================
    -- 3. Crea Spesa
    -- ========================================================
    insert into public.expenses (
        id,
        property_id,
        rentable_space_id,
        category,
        description,
        competence_date,
        total_amount,
        currency,
        status,
        allocation_mode,
        notes
    )
    values (
        v_expense_id,
        p_property_id,
        p_rentable_space_id,
        btrim(p_category),
        btrim(p_description),
        p_competence_date,
        p_total_amount,
        'EUR',
        'TO_PAY',
        p_allocation_mode,
        p_notes
    );

    -- ========================================================
    -- 4A. Ripartizione automatica secondo Quote storiche
    -- ========================================================
    if p_allocation_mode = 'OWNERSHIP_QUOTAS' then
        select count(*), coalesce(sum(ownership_percentage), 0)
          into v_owner_count, v_percentage_total
          from public.property_ownerships po
         where po.property_id = p_property_id
           and p_competence_date >= po.valid_from
           and (
               po.valid_to is null
               or p_competence_date < po.valid_to
           );

        if v_owner_count = 0 then
            raise exception using
                errcode = 'P0001',
                message = 'OWNERSHIP_STRUCTURE_NOT_FOUND';
        end if;

        if round(v_percentage_total, 4) <> 100.0000 then
            raise exception using
                errcode = 'P0001',
                message = 'OWNERSHIP_TOTAL_NOT_100',
                detail = format(
                    'Ownership total at %s is %s',
                    p_competence_date,
                    v_percentage_total
                );
        end if;

        -- Calcola importi arrotondati. L'eventuale differenza di centesimi
        -- viene attribuita all'Owner con percentuale maggiore e UUID minore
        -- come spareggio deterministico.
        with calculated as (
            select
                po.id as ownership_id,
                po.owner_id,
                po.ownership_percentage,
                round(
                    p_total_amount
                    * po.ownership_percentage
                    / 100.0,
                    2
                ) as allocated_amount,
                row_number() over (
                    order by
                        po.ownership_percentage desc,
                        po.owner_id
                ) as adjustment_rank
            from public.property_ownerships po
            where po.property_id = p_property_id
              and p_competence_date >= po.valid_from
              and (
                  po.valid_to is null
                  or p_competence_date < po.valid_to
              )
        ),
        totals as (
            select coalesce(sum(allocated_amount), 0) as rounded_total
            from calculated
        )
        insert into public.expense_allocations (
            expense_id,
            owner_id,
            ownership_id,
            percentage,
            allocated_amount,
            allocation_reason
        )
        select
            v_expense_id,
            c.owner_id,
            c.ownership_id,
            c.ownership_percentage,
            c.allocated_amount
                + case
                    when c.adjustment_rank = 1
                        then p_total_amount - t.rounded_total
                    else 0
                  end,
            'OWNERSHIP_QUOTAS_AT_COMPETENCE_DATE'
        from calculated c
        cross join totals t;

    -- ========================================================
    -- 4B. Ripartizione manuale
    -- ========================================================
    else
        if p_manual_allocations is null
           or jsonb_typeof(p_manual_allocations) <> 'array'
           or jsonb_array_length(p_manual_allocations) = 0 then
            raise exception using
                errcode = 'P0001',
                message = 'MANUAL_ALLOCATIONS_REQUIRED';
        end if;

        if exists (
            select 1
              from jsonb_array_elements(p_manual_allocations) e
             where not (e ? 'owner_id')
                or not (e ? 'allocated_amount')
                or (e->>'owner_id') is null
                or (e->>'allocated_amount') is null
        ) then
            raise exception using
                errcode = 'P0001',
                message = 'INVALID_MANUAL_ALLOCATION_ITEM';
        end if;

        -- Niente Owner duplicati.
        if exists (
            select 1
              from (
                  select (e->>'owner_id')::uuid as owner_id, count(*)
                  from jsonb_array_elements(p_manual_allocations) e
                  group by (e->>'owner_id')::uuid
                  having count(*) > 1
              ) duplicates
        ) then
            raise exception using
                errcode = 'P0001',
                message = 'DUPLICATE_OWNER_ALLOCATION';
        end if;

        -- Gli Owner manuali devono appartenere all'assetto valido alla data.
        if exists (
            select 1
              from jsonb_array_elements(p_manual_allocations) e
             where not exists (
                 select 1
                   from public.property_ownerships po
                  where po.property_id = p_property_id
                    and po.owner_id = (e->>'owner_id')::uuid
                    and p_competence_date >= po.valid_from
                    and (
                        po.valid_to is null
                        or p_competence_date < po.valid_to
                    )
             )
        ) then
            raise exception using
                errcode = 'P0001',
                message = 'MANUAL_ALLOCATION_OWNER_OUT_OF_SCOPE';
        end if;

        if exists (
            select 1
              from jsonb_array_elements(p_manual_allocations) e
             where (e->>'allocated_amount')::numeric < 0
        ) then
            raise exception using
                errcode = 'P0001',
                message = 'INVALID_MANUAL_ALLOCATION_AMOUNT';
        end if;

        select round(sum((e->>'allocated_amount')::numeric), 2)
          into v_allocated_total
          from jsonb_array_elements(p_manual_allocations) e;

        if v_allocated_total <> round(p_total_amount, 2) then
            raise exception using
                errcode = 'P0001',
                message = 'EXPENSE_ALLOCATION_MISMATCH',
                detail = format(
                    'Allocated total %s differs from expense total %s',
                    v_allocated_total,
                    p_total_amount
                );
        end if;

        insert into public.expense_allocations (
            expense_id,
            owner_id,
            ownership_id,
            percentage,
            allocated_amount,
            allocation_reason
        )
        select
            v_expense_id,
            (e->>'owner_id')::uuid,
            po.id,
            case
                when p_total_amount = 0 then 0
                else round(
                    ((e->>'allocated_amount')::numeric
                    / p_total_amount) * 100,
                    4
                )
            end,
            round((e->>'allocated_amount')::numeric, 2),
            coalesce(
                nullif(e->>'reason', ''),
                'MANUAL_ALLOCATION'
            )
        from jsonb_array_elements(p_manual_allocations) e
        join public.property_ownerships po
          on po.property_id = p_property_id
         and po.owner_id = (e->>'owner_id')::uuid
         and p_competence_date >= po.valid_from
         and (
             po.valid_to is null
             or p_competence_date < po.valid_to
         );
    end if;

    select coalesce(sum(allocated_amount), 0), count(*)
      into v_allocated_total, v_owner_count
      from public.expense_allocations
     where expense_id = v_expense_id;

    if round(v_allocated_total, 2) <> round(p_total_amount, 2) then
        raise exception using
            errcode = 'P0001',
            message = 'EXPENSE_ALLOCATION_MISMATCH';
    end if;

    -- ========================================================
    -- 5. Eventuale primo Pagamento
    -- ========================================================
    if p_first_payment_amount is not null then
        if not exists (
            select 1
              from public.expense_allocations ea
             where ea.expense_id = v_expense_id
               and ea.owner_id = p_payer_owner_id
        ) then
            raise exception using
                errcode = 'P0001',
                message = 'PAYER_OWNER_NOT_IN_EXPENSE_ALLOCATION';
        end if;

        insert into public.expense_payments (
            expense_id,
            payer_owner_id,
            payment_date,
            amount,
            payment_method,
            status,
            notes
        )
        values (
            v_expense_id,
            p_payer_owner_id,
            p_first_payment_date,
            p_first_payment_amount,
            btrim(p_payment_method),
            'RECORDED',
            'Primo pagamento contestuale alla creazione della Spesa'
        )
        returning id into v_payment_id;

        if p_first_payment_amount = p_total_amount then
            v_expense_status := 'PAID';
        else
            v_expense_status := 'PARTIALLY_PAID';
        end if;

        update public.expenses
           set status = v_expense_status
         where id = v_expense_id;
    end if;

    -- ========================================================
    -- 6. Conguagli: solo Spesa saldata integralmente
    -- ========================================================
    if p_first_payment_amount = p_total_amount then
        select
            p_total_amount - ea.allocated_amount
          into v_credit
          from public.expense_allocations ea
         where ea.expense_id = v_expense_id
           and ea.owner_id = p_payer_owner_id;

        if v_credit > 0 then
            insert into public.owner_settlement_items (
                property_id,
                expense_id,
                creditor_owner_id,
                debtor_owner_id,
                amount,
                status,
                calculated_at
            )
            select
                p_property_id,
                v_expense_id,
                p_payer_owner_id,
                ea.owner_id,
                ea.allocated_amount,
                'OPEN',
                now()
            from public.expense_allocations ea
            where ea.expense_id = v_expense_id
              and ea.owner_id <> p_payer_owner_id
              and ea.allocated_amount > 0;

            get diagnostics v_settlement_count = row_count;
        end if;
    end if;

    -- ========================================================
    -- 7. Audit e risposta idempotente
    -- ========================================================
    insert into public.audit_events (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        outcome,
        correlation_id,
        metadata
    )
    values (
        auth.uid(),
        'EXPENSE_CREATED',
        'EXPENSE',
        v_expense_id,
        'SUCCESS',
        v_correlation_id,
        jsonb_build_object(
            'property_id', p_property_id,
            'allocation_mode', p_allocation_mode,
            'total_amount', p_total_amount,
            'allocation_count', v_owner_count,
            'payment_id', v_payment_id,
            'payment_amount', p_first_payment_amount,
            'settlement_count', v_settlement_count,
            'expense_status', v_expense_status
        )
    );

    v_existing_response := jsonb_build_object(
        'expense_id', v_expense_id,
        'payment_id', v_payment_id,
        'total_amount', p_total_amount,
        'allocated_total', v_allocated_total,
        'allocation_count', v_owner_count,
        'settlement_count', v_settlement_count,
        'expense_status', v_expense_status,
        'correlation_id', v_correlation_id
    );

    if p_idempotency_key is not null then
        update public.idempotency_keys
           set status = 'COMPLETED',
               response_payload = v_existing_response
         where user_id = auth.uid()
           and operation_name = 'create_expense_with_allocations'
           and idempotency_key = p_idempotency_key;
    end if;

    return v_existing_response;
end;
$$;

comment on function public.create_expense_with_allocations(
    uuid,
    uuid,
    text,
    text,
    date,
    numeric,
    text,
    jsonb,
    numeric,
    date,
    uuid,
    text,
    text,
    uuid
) is
'Atomically creates an expense, validates and inserts ownership/manual allocations, optionally records the first payment, creates owner settlements when fully paid, audits the operation, and supports idempotency.';

revoke all on function public.create_expense_with_allocations(
    uuid,
    uuid,
    text,
    text,
    date,
    numeric,
    text,
    jsonb,
    numeric,
    date,
    uuid,
    text,
    text,
    uuid
) from public, anon;

grant execute on function public.create_expense_with_allocations(
    uuid,
    uuid,
    text,
    text,
    date,
    numeric,
    text,
    jsonb,
    numeric,
    date,
    uuid,
    text,
    text,
    uuid
) to authenticated;
