-- Verifica che il Manager possa aggiornare solo email e cellulare del Proprietario.
\set ON_ERROR_STOP on

begin;

insert into public.owners (
    id, owner_type, first_name, last_name, tax_code, email, phone, status
)
values (
    'c5000000-0000-0000-0000-000000000005',
    'NATURAL_PERSON',
    'Proprietario',
    'Contatti Test',
    'OWNERCONTACTTEST',
    'old@example.test',
    '111111',
    'ACTIVE'
)
on conflict (id) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name,
    tax_code = excluded.tax_code,
    email = excluded.email,
    phone = excluded.phone,
    status = excluded.status;

insert into public.user_owner_accesses (
    user_id, owner_id, role, valid_from, status
)
select
    '796c3053-6a28-4ff5-aa08-06129dcf942e',
    'c5000000-0000-0000-0000-000000000005',
    'MANAGER',
    current_date,
    'ACTIVE'
where not exists (
    select 1
    from public.user_owner_accesses
    where user_id = '796c3053-6a28-4ff5-aa08-06129dcf942e'
      and owner_id = 'c5000000-0000-0000-0000-000000000005'
      and status = 'ACTIVE'
);

select set_config(
    'request.jwt.claims',
    json_build_object(
        'sub', '796c3053-6a28-4ff5-aa08-06129dcf942e',
        'role', 'authenticated'
    )::text,
    true
);
set local role authenticated;

do $$
declare
    v_result jsonb;
begin
    v_result := public.update_owner_contact_details(
        'c5000000-0000-0000-0000-000000000005',
        ' New.Owner@Example.Test ',
        ' 333444 '
    );

    if v_result ->> 'email' <> 'new.owner@example.test'
       or v_result ->> 'phone' <> '333444' then
        raise exception 'OWNER_CONTACT_UPDATE_NORMALIZATION_FAILED';
    end if;

    if not exists (
        select 1
        from public.owners
        where id = 'c5000000-0000-0000-0000-000000000005'
          and email = 'new.owner@example.test'
          and phone = '333444'
          and first_name = 'Proprietario'
          and last_name = 'Contatti Test'
          and tax_code = 'OWNERCONTACTTEST'
          and status = 'ACTIVE'
    ) then
        raise exception 'OWNER_CONTACT_UPDATE_CHANGED_OTHER_FIELDS_OR_FAILED';
    end if;
end;
$$;

select set_config(
    'request.jwt.claims',
    json_build_object(
        'sub', '4a30d9e0-04aa-42f0-93c6-977247230a9c',
        'role', 'authenticated'
    )::text,
    true
);

do $$
begin
    perform public.update_owner_contact_details(
        'c5000000-0000-0000-0000-000000000005',
        'unauthorized@example.test',
        '999'
    );
    raise exception 'UNAUTHORIZED_OWNER_CONTACT_UPDATE_WAS_ALLOWED';
exception
    when others then
        if sqlerrm <> 'ACCESS_DENIED' then
            raise;
        end if;
end;
$$;

reset role;
rollback;
