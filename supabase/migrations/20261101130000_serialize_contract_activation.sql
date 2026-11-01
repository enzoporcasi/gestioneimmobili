create or replace function public.set_contract_management_status(
    p_contract_id uuid,
    p_management_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare
    v_actor_id uuid := auth.uid();
    v_contract public.contracts%rowtype;
    v_property_status text;
    v_lifecycle_status text;
begin
    if v_actor_id is null then
        raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
    end if;
    if p_management_status is null or p_management_status not in ('ACTIVE', 'INACTIVE') then
        raise exception using errcode = 'P0001', message = 'INVALID_CONTRACT_STATUS';
    end if;

    select c.* into v_contract
    from public.contracts c
    where c.id = p_contract_id
    for update;
    if not found or not security.can_access_property(v_contract.property_id, 'MANAGER') then
        raise exception using errcode = 'P0001', message = 'ACCESS_DENIED';
    end if;
    if not exists (
        select 1 from public.profiles p
        where p.id = v_actor_id and p.status = 'ACTIVE' and p.archived_at is null
    ) then
        raise exception using errcode = 'P0001', message = 'ACCESS_DENIED';
    end if;

    select p.status into v_property_status
    from public.properties p
    where p.id = v_contract.property_id
    for update;
    if p_management_status = 'ACTIVE'
       and (v_property_status is distinct from 'ACTIVE' or v_contract.end_date < current_date) then
        raise exception using errcode = 'P0001', message = 'CONTRACT_NOT_ACTIVATABLE';
    end if;

    if p_management_status = 'ACTIVE' and exists (
        select 1
        from public.contracts existing
        where existing.id <> v_contract.id
          and existing.property_id = v_contract.property_id
          and existing.management_status = 'ACTIVE'
          and existing.start_date <= v_contract.end_date
          and v_contract.start_date <= existing.end_date
          and (
              existing.object_type = 'WHOLE_PROPERTY'
              or v_contract.object_type = 'WHOLE_PROPERTY'
              or exists (
                  select 1
                  from public.contract_rentable_spaces a
                  join public.contract_rentable_spaces b
                    on b.rentable_space_id = a.rentable_space_id
                  where a.contract_id = v_contract.id
                    and b.contract_id = existing.id
              )
          )
    ) then
        raise exception using errcode = 'P0001', message = 'CONTRACT_OBJECT_ALREADY_RENTED';
    end if;

    v_lifecycle_status := case
        when p_management_status = 'INACTIVE' then 'DRAFT'
        when v_contract.start_date > current_date then 'SCHEDULED'
        else 'IN_PROGRESS'
    end;

    update public.contracts
    set management_status = p_management_status,
        lifecycle_status = v_lifecycle_status,
        activated_at = case
            when p_management_status = 'ACTIVE' then coalesce(activated_at, now())
            else activated_at
        end,
        updated_at = now()
    where id = p_contract_id;

    insert into public.audit_events (
        actor_user_id, action, entity_type, entity_id, outcome,
        before_snapshot, after_snapshot
    )
    values (
        v_actor_id,
        'CONTRACT_STATUS_UPDATED',
        'CONTRACT',
        p_contract_id,
        'SUCCESS',
        jsonb_build_object('management_status', v_contract.management_status),
        jsonb_build_object('management_status', p_management_status)
    );

    return jsonb_build_object(
        'contract_id', p_contract_id,
        'management_status', p_management_status,
        'lifecycle_status', v_lifecycle_status
    );
end;
$$;
