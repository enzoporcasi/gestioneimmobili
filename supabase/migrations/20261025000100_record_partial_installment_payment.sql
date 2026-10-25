-- GestioneImmobili
-- Migration: RPC per pagamenti parziali dei Canoni
-- Versione: 1.0
-- Dipendenze:
--   public.rent_installments
--   public.contracts
--   public.receipts
--   public.receipt_allocations
--   public.audit_events
--   security.can_access_installment(uuid, text)

create or replace function public.record_partial_installment_payment(
    p_installment_id uuid,
    p_amount numeric,
    p_payment_date date,
    p_payment_method text,
    p_payer_tenant_id uuid default null,
    p_payer_name text default null,
    p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare
    v_installment public.rent_installments%rowtype;
    v_property_id uuid;
    v_received numeric(14,2);
    v_residual numeric(14,2);
    v_new_residual numeric(14,2);
    v_receipt_id uuid;
    v_allocation_id uuid;
    v_calculated_status text;
    v_correlation_id uuid := gen_random_uuid();
begin
    -- 1. Autenticazione e autorizzazione.
    if auth.uid() is null then
        raise exception using
            errcode = 'P0001',
            message = 'AUTHENTICATION_REQUIRED';
    end if;

    if not security.can_access_installment(
        p_installment_id,
        'MANAGER'
    ) then
        raise exception using
            errcode = 'P0001',
            message = 'ACCESS_DENIED';
    end if;

    -- 2. Validazione input.
    if p_amount is null or p_amount <= 0 then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_PAYMENT_AMOUNT';
    end if;

    if p_payment_date is null then
        raise exception using
            errcode = 'P0001',
            message = 'PAYMENT_DATE_REQUIRED';
    end if;

    if p_payment_method is null
       or btrim(p_payment_method) = '' then
        raise exception using
            errcode = 'P0001',
            message = 'PAYMENT_METHOD_REQUIRED';
    end if;

    -- 3. Lock del Canone per serializzare pagamenti concorrenti.
    select *
      into v_installment
      from public.rent_installments
     where id = p_installment_id
     for update;

    if not found then
        raise exception using
            errcode = 'P0001',
            message = 'INSTALLMENT_NOT_FOUND';
    end if;

    if v_installment.status in (
        'LOST',
        'NOT_DUE',
        'CANCELLED'
    ) then
        raise exception using
            errcode = 'P0001',
            message = 'INSTALLMENT_NOT_PAYABLE';
    end if;

    -- 4. Calcolo autorevole del totale già incassato.
    select coalesce(sum(ra.allocated_amount), 0)::numeric(14,2)
      into v_received
      from public.receipt_allocations ra
      join public.receipts r
        on r.id = ra.receipt_id
       and r.status = 'RECORDED'
     where ra.rent_installment_id = p_installment_id;

    v_residual := (
        v_installment.amount_due
        - v_installment.amount_lost
        - v_received
    )::numeric(14,2);

    if v_residual <= 0 then
        raise exception using
            errcode = 'P0001',
            message = 'INSTALLMENT_ALREADY_SETTLED';
    end if;

    -- MVP: sovrappagamento non consentito.
    if p_amount > v_residual then
        raise exception using
            errcode = 'P0001',
            message = 'PAYMENT_EXCEEDS_RESIDUAL',
            detail = format(
                'Payment amount %s exceeds residual %s',
                p_amount,
                v_residual
            );
    end if;

    select c.property_id
      into v_property_id
      from public.contracts c
     where c.id = v_installment.contract_id;

    if v_property_id is null then
        raise exception using
            errcode = 'P0001',
            message = 'CONTRACT_PROPERTY_NOT_FOUND';
    end if;

    -- 5. Creazione atomica dell'Incasso.
    insert into public.receipts (
        property_id,
        payer_tenant_id,
        payer_name,
        payment_date,
        amount,
        currency,
        payment_method,
        status,
        notes
    )
    values (
        v_property_id,
        p_payer_tenant_id,
        nullif(btrim(p_payer_name), ''),
        p_payment_date,
        p_amount,
        'EUR',
        btrim(p_payment_method),
        'RECORDED',
        p_notes
    )
    returning id into v_receipt_id;

    -- 6. Allocazione al Canone nella stessa transazione.
    insert into public.receipt_allocations (
        receipt_id,
        rent_installment_id,
        allocated_amount
    )
    values (
        v_receipt_id,
        p_installment_id,
        p_amount
    )
    returning id into v_allocation_id;

    v_new_residual := (v_residual - p_amount)::numeric(14,2);

    if v_new_residual = 0 then
        v_calculated_status := 'PAID';
    elsif p_payment_date > v_installment.due_date then
        v_calculated_status := 'OVERDUE';
    else
        v_calculated_status := 'PARTIAL';
    end if;

    -- Lo stato PARTIAL/OVERDUE è derivato dalla view.
    -- Aggiorniamo soltanto lo stato terminale PAID per coerenza
    -- con la colonna fisica e impostiamo closed_at.
    if v_new_residual = 0 then
        update public.rent_installments
           set status = 'PAID',
               closed_at = now()
         where id = p_installment_id;
    end if;

    -- 7. Audit nella stessa transazione.
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
        case
            when v_new_residual = 0
                then 'INSTALLMENT_PAID'
            else 'INSTALLMENT_PARTIAL_PAYMENT_RECORDED'
        end,
        'RENT_INSTALLMENT',
        p_installment_id,
        'SUCCESS',
        v_correlation_id,
        jsonb_build_object(
            'receipt_id', v_receipt_id,
            'allocation_id', v_allocation_id,
            'payment_amount', p_amount,
            'previous_residual', v_residual,
            'new_residual', v_new_residual,
            'calculated_status', v_calculated_status
        )
    );

    -- 8. Risposta minimizzata.
    return jsonb_build_object(
        'installment_id', p_installment_id,
        'receipt_id', v_receipt_id,
        'allocation_id', v_allocation_id,
        'payment_amount', p_amount,
        'amount_received', v_received + p_amount,
        'active_residual', v_new_residual,
        'calculated_status', v_calculated_status,
        'correlation_id', v_correlation_id
    );
end;
$$;

comment on function public.record_partial_installment_payment(
    uuid,
    numeric,
    date,
    text,
    uuid,
    text,
    text
) is
'Atomic partial/full installment payment. Enforces MANAGER scope, locks the installment, prevents overpayment, creates receipt/allocation/audit, and returns the new balance.';

-- Privilegi: nessun accesso pubblico o anonimo.
revoke all on function public.record_partial_installment_payment(
    uuid,
    numeric,
    date,
    text,
    uuid,
    text,
    text
) from public, anon;

grant execute on function public.record_partial_installment_payment(
    uuid,
    numeric,
    date,
    text,
    uuid,
    text,
    text
) to authenticated;
