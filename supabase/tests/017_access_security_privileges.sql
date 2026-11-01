begin;

select plan(9);

select ok(
    not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind in ('r', 'p')
          and (
              not c.relrowsecurity
              or has_table_privilege('anon', c.oid, 'SELECT')
              or has_table_privilege('anon', c.oid, 'INSERT')
              or has_table_privilege('anon', c.oid, 'UPDATE')
              or has_table_privilege('anon', c.oid, 'DELETE')
              or has_table_privilege('anon', c.oid, 'TRUNCATE')
              or has_table_privilege('anon', c.oid, 'REFERENCES')
              or has_table_privilege('anon', c.oid, 'TRIGGER')
          )
    ),
    'all public tables have RLS and no table privileges are granted to anon'
);

select ok(
    not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind in ('r', 'p')
          and (
              has_table_privilege('authenticated', c.oid, 'INSERT')
              or has_table_privilege('authenticated', c.oid, 'UPDATE')
              or has_table_privilege('authenticated', c.oid, 'DELETE')
              or has_table_privilege('authenticated', c.oid, 'TRUNCATE')
              or has_table_privilege('authenticated', c.oid, 'REFERENCES')
              or has_table_privilege('authenticated', c.oid, 'TRIGGER')
          )
    ),
    'authenticated has no direct table mutation or DDL-related privileges'
);

select ok(
    not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'S'
          and (
              has_sequence_privilege('anon', c.oid, 'USAGE')
              or has_sequence_privilege('anon', c.oid, 'SELECT')
              or has_sequence_privilege('anon', c.oid, 'UPDATE')
              or has_sequence_privilege('authenticated', c.oid, 'USAGE')
              or has_sequence_privilege('authenticated', c.oid, 'SELECT')
              or has_sequence_privilege('authenticated', c.oid, 'UPDATE')
          )
    ),
    'client roles have no direct privileges on public sequences'
);

select ok(
    (
        select bool_and(
            has_column_privilege(
                'authenticated', 'public.profiles', column_name, 'UPDATE'
            )
        )
        from unnest(array[
            'first_name', 'last_name', 'display_name', 'locale', 'time_zone'
        ]) as allowed(column_name)
    )
    and not exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'profiles'
          and c.column_name not in (
              'first_name', 'last_name', 'display_name', 'locale', 'time_zone'
          )
          and has_column_privilege(
              'authenticated', 'public.profiles', c.column_name, 'UPDATE'
          )
    ),
    'authenticated can update only the approved profile columns'
);

select ok(
    has_table_privilege('authenticated', 'public.owners', 'SELECT')
    and has_table_privilege('authenticated', 'public.properties', 'SELECT'),
    'authenticated retains scoped owner and property reads'
);

select ok(
    not exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        left join pg_depend d
            on d.objid = p.oid
           and d.classid = 'pg_proc'::regclass
           and d.refclassid = 'pg_extension'::regclass
           and d.deptype = 'e'
        where p.prokind = 'f'
          and n.nspname in ('public', 'security')
          and d.objid is null
          and has_function_privilege('anon', p.oid, 'EXECUTE')
    ),
    'anon cannot execute application functions'
);

select ok(
    not exists (
        select 1
        from pg_default_acl a
        left join pg_namespace n on n.oid = a.defaclnamespace
        cross join lateral aclexplode(a.defaclacl) acl
        left join pg_roles grantee on grantee.oid = acl.grantee
        where a.defaclrole = 'postgres'::regrole
          and (
              n.nspname = 'public'
              or (a.defaclnamespace = 0 and a.defaclobjtype = 'f')
          )
          and a.defaclobjtype in ('r', 'S', 'f')
          and (
              grantee.rolname in ('anon', 'authenticated')
              or (a.defaclobjtype = 'f' and acl.grantee = 0)
          )
    ),
    'migration-owner defaults do not grant clients access to future objects'
);

select ok(
    not has_schema_privilege('anon', 'public', 'CREATE')
    and not has_schema_privilege('authenticated', 'public', 'CREATE'),
    'client roles cannot create objects in the public schema'
);

select ok(
    has_function_privilege(
        'authenticated', 'public.set_updated_at()', 'EXECUTE'
    )
    and not has_function_privilege(
        'anon', 'public.set_updated_at()', 'EXECUTE'
    ),
    'authenticated trigger behavior remains available without anonymous execution'
);

select * from finish();

rollback;
