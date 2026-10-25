-- GestioneImmobili
-- Migration: cessazione anticipata del Contratto
-- Dipendenze: contracts, contract_tenants, rent_installments,
-- audit_events, security.can_access_contract(uuid,text)

create or replace function public.terminate_contract(
    p_contract_id uuid,
    p_effective_end_date date,
    p_reason text,
    p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare
    v_contract public.contracts%rowtype;
    v_tenants_closed integer := 0;
    v_installments_not_due integer := 0;
    v_existing_response jsonb;
    v_request_hash text;
    v_correlation_id uuid := gen_random_uuid();
begin
    if auth.uid() is null then
        raise exception using errcode='P0001', message='AUTHENTICATION_REQUIRED';
    end if;

    if not security.can_access_contract(p_contract_id, 'MANAGER') then
        raise exception using errcode='P0001', message='ACCESS_DENIED';
    end if;

    if p_effective_end_date is null then
        raise exception using errcode='P0001', message='EFFECTIVE_END_DATE_REQUIRED';
    end if;

    if p_reason is null or btrim(p_reason) = '' then
        raise exception using errcode='P0001', message='TERMINATION_REASON_REQUIRED';
    end if;

    v_request_hash := encode(
        digest(
            concat_ws('|', p_contract_id::text, p_effective_end_date::text, btrim(p_reason)),
            'sha256'
        ),
        'hex'
    );

    if p_idempotency_key is not null then
        select response_payload
          into v_existing_response
          from public.idempotency_keys
         where user_id = auth.uid()
           and operation_name = 'terminate_contract'
           and idempotency_key = p_idempotency_key
         for update;

        if found then
            if exists (
                select 1 from public.idempotency_keys
                 where user_id=auth.uid()
                   and operation_name='terminate_contract'
                   and idempotency_key=p_idempotency_key
                   and request_hash<>v_request_hash
            ) then
                raise exception using errcode='P0001', message='IDEMPOTENCY_CONFLICT';
            end if;

            if v_existing_response is not null then
                return v_existing_response;
            end if;
        else
            insert into public.idempotency_keys(
                user_id, operation_name, idempotency_key,
                request_hash, status, created_at
            ) values (
                auth.uid(), 'terminate_contract', p_idempotency_key,
                v_request_hash, 'RUNNING', now()
            );
        end if;
    end if;

    select *
      into v_contract
      from public.contracts
     where id = p_contract_id
     for update;

    if not found then
        raise exception using errcode='P0001', message='CONTRACT_NOT_FOUND';
    end if;

    if p_effective_end_date < v_contract.start_date then
        raise exception using errcode='P0001', message='TERMINATION_BEFORE_CONTRACT_START';
    end if;

    if p_effective_end_date > v_contract.end_date then
        raise exception using errcode='P0001', message='TERMINATION_AFTER_CONTRACT_END';
    end if;

    -- Se già cessato alla stessa data, restituisce lo stato corrente.
    if v_contract.lifecycle_status = 'EARLY_TERMINATED'
       and v_contract.ended_at::date = p_effective_end_date then
        v_existing_response := jsonb_build_object(
            'contract_id', p_contract_id,
            'effective_end_date', p_effective_end_date,
            'tenants_closed', 0,
            'installments_not_due', 0,
            'correlation_id', v_correlation_id,
            'already_terminated', true
        );
        return v_existing_response;
    end if;

    if v_contract.lifecycle_status in ('ENDED','CANCELLED') then
        raise exception using errcode='P0001', message='CONTRACT_NOT_TERMINABLE';
    end if;

    update public.contracts
       set lifecycle_status = 'EARLY_TERMINATED',
           management_status = 'INACTIVE',
           ended_at = p_effective_end_date::timestamptz,
           updated_at = now(),
           notes = concat_ws(E'\n', notes, 'Cessazione: ' || btrim(p_reason))
     where id = p_contract_id;

    -- Intervalli semiaperti [valid_from, valid_to): valid_to è il giorno
    -- successivo all'ultimo giorno di partecipazione.
    update public.contract_tenants
       set valid_to = p_effective_end_date + 1,
           status = 'INACTIVE'
     where contract_id = p_contract_id
       and status = 'ACTIVE'
       and valid_from <= p_effective_end_date
       and (valid_to is null or valid_to > p_effective_end_date + 1);

    get diagnostics v_tenants_closed = row_count;

    -- Solo periodi non consolidati che iniziano DOPO la cessazione diventano NOT_DUE.
    -- Canoni con Incassi, anche se riferiti a periodi futuri, non vengono modificati
    -- automaticamente e richiedono una procedura esplicita di storno/rimborso.
    -- Canoni maturati entro la data restano invariati, inclusi crediti aperti.
    update public.rent_installments
       set status = 'NOT_DUE',
           closed_at = now()
     where contract_id = p_contract_id
       and period_start > p_effective_end_date
       and status = 'CREATED'
       and not exists (
           select 1
             from public.receipt_allocations ra
             join public.receipts r on r.id = ra.receipt_id
            where ra.rent_installment_id = public.rent_installments.id
              and r.status = 'RECORDED'
       );

    get diagnostics v_installments_not_due = row_count;

    insert into public.contract_changes(
        contract_id, change_type, effective_date,
        previous_values, new_values, reason
    ) values (
        p_contract_id,
        'EARLY_TERMINATION',
        p_effective_end_date,
        jsonb_build_object(
            'management_status', v_contract.management_status,
            'lifecycle_status', v_contract.lifecycle_status,
            'ended_at', v_contract.ended_at
        ),
        jsonb_build_object(
            'management_status', 'INACTIVE',
            'lifecycle_status', 'EARLY_TERMINATED',
            'ended_at', p_effective_end_date
        ),
        btrim(p_reason)
    );

    insert into public.audit_events(
        actor_user_id, action, entity_type, entity_id,
        outcome, correlation_id, metadata
    ) values (
        auth.uid(), 'CONTRACT_TERMINATED', 'CONTRACT', p_contract_id,
        'SUCCESS', v_correlation_id,
        jsonb_build_object(
            'effective_end_date', p_effective_end_date,
            'reason', btrim(p_reason),
            'tenants_closed', v_tenants_closed,
            'installments_not_due', v_installments_not_due
        )
    );

    v_existing_response := jsonb_build_object(
        'contract_id', p_contract_id,
        'effective_end_date', p_effective_end_date,
        'tenants_closed', v_tenants_closed,
        'installments_not_due', v_installments_not_due,
        'correlation_id', v_correlation_id,
        'already_terminated', false
    );

    if p_idempotency_key is not null then
        update public.idempotency_keys
           set status='COMPLETED', response_payload=v_existing_response
         where user_id=auth.uid()
           and operation_name='terminate_contract'
           and idempotency_key=p_idempotency_key;
    end if;

    return v_existing_response;
end;
$$;

comment on function public.terminate_contract(uuid,date,text,uuid) is
'Atomically terminates a contract, closes active tenants, marks only future generated installments NOT_DUE, preserves accrued credits, writes change history and audit.';

revoke all on function public.terminate_contract(uuid,date,text,uuid)
from public, anon;

grant execute on function public.terminate_contract(uuid,date,text,uuid)
to authenticated;
