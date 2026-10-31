create or replace function public.create_owner_with_access(
    p_owner_type text,
    p_first_name text default null,
    p_last_name text default null,
    p_business_name text default null,
    p_tax_code text default null,
    p_vat_number text default null,
    p_email text default null,
    p_phone text default null,
    p_address_line1 text default null,
    p_address_line2 text default null,
    p_postal_code text default null,
    p_municipality text default null,
    p_province text default null,
    p_country_code text default 'IT',
    p_iban text default null,
    p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_actor_id uuid := auth.uid();
    v_owner_id uuid := gen_random_uuid();
    v_constraint_name text;
    v_first_name text := nullif(btrim(p_first_name), '');
    v_last_name text := nullif(btrim(p_last_name), '');
    v_business_name text := nullif(btrim(p_business_name), '');
    v_tax_code text := nullif(upper(regexp_replace(btrim(p_tax_code), '\s+', '', 'g')), '');
    v_vat_number text := nullif(upper(regexp_replace(btrim(p_vat_number), '\s+', '', 'g')), '');
    v_email text := nullif(lower(btrim(p_email)), '');
    v_iban text := nullif(upper(regexp_replace(btrim(p_iban), '\s+', '', 'g')), '');
begin
    if v_actor_id is null then
        raise exception using
            errcode = 'P0001',
            message = 'AUTHENTICATION_REQUIRED';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_actor_id
          and p.status = 'ACTIVE'
          and p.archived_at is null
    ) then
        raise exception using
            errcode = 'P0001',
            message = 'ACCESS_DENIED';
    end if;

    if p_owner_type is null
       or p_owner_type not in ('NATURAL_PERSON', 'LEGAL_ENTITY') then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_OWNER_TYPE';
    end if;

    if (p_owner_type = 'NATURAL_PERSON'
        and (v_first_name is null or v_last_name is null))
       or (p_owner_type = 'LEGAL_ENTITY' and v_business_name is null) then
        raise exception using
            errcode = 'P0001',
            message = 'REQUIRED_OWNER_FIELD_MISSING';
    end if;

    if p_country_code is null
       or btrim(p_country_code) !~ '^[A-Za-z]{2}$' then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_COUNTRY_CODE';
    end if;

    if v_tax_code is not null and length(v_tax_code) > 32 then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_OWNER_TAX_CODE';
    end if;

    if v_vat_number is not null and length(v_vat_number) > 32 then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_OWNER_VAT_NUMBER';
    end if;

    if v_email is not null
       and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_OWNER_EMAIL';
    end if;

    if v_iban is not null and length(v_iban) > 34 then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_OWNER_IBAN';
    end if;

    insert into public.owners (
        id,
        owner_type,
        first_name,
        last_name,
        business_name,
        tax_code,
        vat_number,
        email,
        phone,
        address_line1,
        address_line2,
        postal_code,
        municipality,
        province,
        country_code,
        iban,
        notes,
        status
    )
    values (
        v_owner_id,
        p_owner_type,
        case when p_owner_type = 'NATURAL_PERSON' then v_first_name end,
        case when p_owner_type = 'NATURAL_PERSON' then v_last_name end,
        case when p_owner_type = 'LEGAL_ENTITY' then v_business_name end,
        v_tax_code,
        v_vat_number,
        v_email,
        nullif(btrim(p_phone), ''),
        nullif(btrim(p_address_line1), ''),
        nullif(btrim(p_address_line2), ''),
        nullif(btrim(p_postal_code), ''),
        nullif(btrim(p_municipality), ''),
        nullif(upper(btrim(p_province)), ''),
        upper(btrim(p_country_code)),
        v_iban,
        nullif(btrim(p_notes), ''),
        'ACTIVE'
    );

    insert into public.user_owner_accesses (
        user_id,
        owner_id,
        role,
        valid_from,
        status
    )
    values (
        v_actor_id,
        v_owner_id,
        'ADMINISTRATOR',
        current_date,
        'ACTIVE'
    );

    insert into public.audit_events (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        outcome,
        metadata
    )
    values (
        v_actor_id,
        'OWNER_CREATED',
        'OWNER',
        v_owner_id,
        'SUCCESS',
        jsonb_build_object('owner_type', p_owner_type)
    );

    return jsonb_build_object('owner_id', v_owner_id);
exception
    when unique_violation then
        get stacked diagnostics v_constraint_name = constraint_name;
        if v_constraint_name = 'owners_tax_code_uq' then
            raise exception using
                errcode = 'P0001',
                message = 'OWNER_TAX_CODE_ALREADY_EXISTS';
        elsif v_constraint_name = 'owners_vat_number_uq' then
            raise exception using
                errcode = 'P0001',
                message = 'OWNER_VAT_NUMBER_ALREADY_EXISTS';
        end if;
        raise;
end;
$$;

revoke all on function public.create_owner_with_access(
    text, text, text, text, text, text, text, text,
    text, text, text, text, text, text, text, text
)
from public, anon;

grant execute on function public.create_owner_with_access(
    text, text, text, text, text, text, text, text,
    text, text, text, text, text, text, text, text
)
to authenticated;
