alter function public.record_partial_installment_payment(uuid, numeric, date, text, uuid, text, text)
    set schema security;
alter function security.record_partial_installment_payment(uuid, numeric, date, text, uuid, text, text)
    rename to record_partial_installment_payment_core;
revoke all on function security.record_partial_installment_payment_core(uuid, numeric, date, text, uuid, text, text)
    from public, anon, authenticated;

create or replace function public.record_partial_installment_payment(
    p_installment_id uuid,
    p_amount numeric,
    p_payment_date date,
    p_payment_method text,
    p_payer_tenant_id uuid default null,
    p_payer_name text default null,
    p_notes text default null,
    p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare
    v_user_id uuid := auth.uid();
    v_request_hash text;
    v_entry public.idempotency_keys%rowtype;
    v_response jsonb;
begin
    if v_user_id is null then
        raise exception 'AUTHENTICATION_REQUIRED';
    end if;

    if security.can_access_installment(p_installment_id, 'MANAGER') is not true then
        raise exception 'ACCESS_DENIED';
    end if;

    if p_idempotency_key is null then
        raise exception 'IDEMPOTENCY_KEY_REQUIRED';
    end if;

    v_request_hash := encode(
        extensions.digest(
            convert_to(jsonb_build_object(
                'installment_id', p_installment_id,
                'amount', trim_scale(p_amount),
                'payment_date', p_payment_date,
                'payment_method', btrim(p_payment_method),
                'payer_tenant_id', p_payer_tenant_id,
                'payer_name', nullif(btrim(p_payer_name), ''),
                'notes', p_notes
            )::text, 'UTF8'),
            'sha256'
        ),
        'hex'
    );

    insert into public.idempotency_keys (
        user_id, operation_name, idempotency_key, request_hash, status
    )
    values (
        v_user_id, 'record_partial_installment_payment', p_idempotency_key,
        v_request_hash, 'IN_PROGRESS'
    )
    on conflict (user_id, operation_name, idempotency_key) do nothing;

    select * into v_entry
    from public.idempotency_keys
    where user_id = v_user_id
      and operation_name = 'record_partial_installment_payment'
      and idempotency_key = p_idempotency_key
    for update;

    if v_entry.request_hash is distinct from v_request_hash then
        raise exception 'IDEMPOTENCY_CONFLICT';
    end if;

    if v_entry.status = 'COMPLETED' and v_entry.response_payload is not null then
        return v_entry.response_payload;
    end if;

    if v_entry.status is distinct from 'IN_PROGRESS' then
        raise exception 'IDEMPOTENCY_STATE_INVALID';
    end if;

    v_response := security.record_partial_installment_payment_core(
        p_installment_id, p_amount, p_payment_date, p_payment_method,
        p_payer_tenant_id, p_payer_name, p_notes
    );

    update public.idempotency_keys
    set status = 'COMPLETED', response_payload = v_response
    where id = v_entry.id;

    return v_response;
end;
$$;

revoke all on function public.record_partial_installment_payment(uuid, numeric, date, text, uuid, text, text, uuid)
    from public, anon;
grant execute on function public.record_partial_installment_payment(uuid, numeric, date, text, uuid, text, text, uuid)
    to authenticated;