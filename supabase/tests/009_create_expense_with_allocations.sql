-- GestioneImmobili - Test create_expense_with_allocations
-- Non distruttivo: ROLLBACK finale.
-- Richiede seed con utente.a@test.local.

\set ON_ERROR_STOP on
begin;

do $$
declare v_count integer;
begin
 select count(*) into v_count from auth.users where lower(trim(email))='utente.a@test.local';
 if v_count<>1 then raise exception 'EXPENSE_TEST_USER_MISSING'; end if;
 select count(*) into v_count from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='create_expense_with_allocations';
 if v_count<>1 then raise exception 'EXPENSE_TEST_RPC_MISSING'; end if;
end $$;

insert into public.profiles(id,first_name,last_name,display_name,status)
select id,'Utente','A','Utente A','ACTIVE' from auth.users where lower(trim(email))='utente.a@test.local'
on conflict(id) do update set status='ACTIVE',updated_at=now();

-- Due Owner, entrambi gestiti dall'Utente A per il test.
insert into public.owners(id,owner_type,first_name,last_name,tax_code,status) values
('91000000-0000-0000-0000-000000000001','NATURAL_PERSON','Owner','A','EXPENSEOWNERA','ACTIVE'),
('92000000-0000-0000-0000-000000000002','NATURAL_PERSON','Owner','B','EXPENSEOWNERB','ACTIVE')
on conflict(id) do update set status='ACTIVE',updated_at=now();

insert into public.user_owner_accesses(user_id,owner_id,role,valid_from,status)
select u.id,x.owner_id,'MANAGER',current_date,'ACTIVE'
from auth.users u
cross join (values
 ('91000000-0000-0000-0000-000000000001'::uuid),
 ('92000000-0000-0000-0000-000000000002'::uuid)
) x(owner_id)
where lower(trim(u.email))='utente.a@test.local'
and not exists(select 1 from public.user_owner_accesses a where a.user_id=u.id and a.owner_id=x.owner_id);

insert into public.properties(id,internal_code,name,property_type,status,municipality)
values('93000000-0000-0000-0000-000000000003','IMM-EXPENSE-TEST','Immobile test Spese','APARTMENT','ACTIVE','Roma')
on conflict(id) do update set status='ACTIVE',updated_at=now();

insert into public.property_ownerships (
    id,
    property_id,
    owner_id,
    ownership_percentage,
    valid_from
)
values
(
    '93100000-0000-0000-0000-000000000031',
    '93000000-0000-0000-0000-000000000003',
    '91000000-0000-0000-0000-000000000001',
    50,
    current_date
),
(
    '93200000-0000-0000-0000-000000000032',
    '93000000-0000-0000-0000-000000000003',
    '92000000-0000-0000-0000-000000000002',
    50,
    current_date
)
on conflict (id) do update
set
    ownership_percentage = 50,
    valid_from = current_date,
    valid_to = null;
-- Rimuove eventuali fixture omonime, comunque annullate dal rollback.
delete from public.owner_settlement_items where property_id='93000000-0000-0000-0000-000000000003';
delete from public.expense_payments where expense_id in (select id from public.expenses where property_id='93000000-0000-0000-0000-000000000003');
delete from public.expense_allocations where expense_id in (select id from public.expenses where property_id='93000000-0000-0000-0000-000000000003');
delete from public.audit_events where entity_type='EXPENSE' and metadata->>'property_id'='93000000-0000-0000-0000-000000000003';
delete from public.expenses where property_id='93000000-0000-0000-0000-000000000003';
delete from public.idempotency_keys where operation_name='create_expense_with_allocations' and idempotency_key in (
 '94000000-0000-0000-0000-000000000004','95000000-0000-0000-0000-000000000005');

-- Simulazione JWT.
select set_config('request.jwt.claims',json_build_object(
 'sub',(select id::text from auth.users where lower(trim(email))='utente.a@test.local'),
 'role','authenticated')::text,true);
set local role authenticated;

-- Spesa €600, 50/50, pagata tutta da Owner A.
select public.create_expense_with_allocations(
 '93000000-0000-0000-0000-000000000003'::uuid,
 null,
 'MAINTENANCE',
 'Manutenzione straordinaria test',
 date '2027-06-15',
 600.00,
 'OWNERSHIP_QUOTAS',
 null,
 600.00,
 date '2027-06-15',
 '91000000-0000-0000-0000-000000000001'::uuid,
 'BANK_TRANSFER',
 'Fixture automatica Spese',
 '94000000-0000-0000-0000-000000000004'::uuid
);
reset role;

-- Verifiche principali.
do $$
declare
 v_expense uuid; v_status text; v_alloc_count int; v_alloc_total numeric;
 v_a_amount numeric; v_b_amount numeric; v_payment_count int; v_payment_total numeric;
 v_settlement_count int; v_settlement_amount numeric; v_creditor uuid; v_debtor uuid;
 v_audit_count int;
begin
 select id,status into v_expense,v_status from public.expenses
 where property_id='93000000-0000-0000-0000-000000000003'
 and description='Manutenzione straordinaria test';
 if v_expense is null or v_status<>'PAID' then raise exception 'EXPENSE_TEST_STATUS_FAILED expense=%, status=%',v_expense,v_status; end if;

 select count(*),sum(allocated_amount),
 max(allocated_amount) filter(where owner_id='91000000-0000-0000-0000-000000000001'),
 max(allocated_amount) filter(where owner_id='92000000-0000-0000-0000-000000000002')
 into v_alloc_count,v_alloc_total,v_a_amount,v_b_amount
 from public.expense_allocations where expense_id=v_expense;
 if v_alloc_count<>2 or v_alloc_total<>600 or v_a_amount<>300 or v_b_amount<>300 then
  raise exception 'EXPENSE_TEST_ALLOCATIONS_FAILED count=%, total=%, A=%, B=%',v_alloc_count,v_alloc_total,v_a_amount,v_b_amount;
 end if;

 select count(*),sum(amount) into v_payment_count,v_payment_total
 from public.expense_payments where expense_id=v_expense and status='RECORDED';
 if v_payment_count<>1 or v_payment_total<>600 then raise exception 'EXPENSE_TEST_PAYMENT_FAILED count=%, total=%',v_payment_count,v_payment_total; end if;

 select
    count(*),
    sum(amount),
    min(creditor_owner_id::text)::uuid,
    min(debtor_owner_id::text)::uuid
into
    v_settlement_count,
    v_settlement_amount,
    v_creditor,
    v_debtor
from public.owner_settlement_items
where expense_id = v_expense
  and status = 'OPEN';
 if v_settlement_count<>1 or v_settlement_amount<>300
 or v_creditor<>'91000000-0000-0000-0000-000000000001'::uuid
 or v_debtor<>'92000000-0000-0000-0000-000000000002'::uuid then
  raise exception 'EXPENSE_TEST_SETTLEMENT_FAILED count=%, amount=%, creditor=%, debtor=%',v_settlement_count,v_settlement_amount,v_creditor,v_debtor;
 end if;

 select count(*) into v_audit_count from public.audit_events
 where entity_id=v_expense and action='EXPENSE_CREATED' and outcome='SUCCESS';
 if v_audit_count<>1 then raise exception 'EXPENSE_TEST_AUDIT_FAILED count=%',v_audit_count; end if;
end $$;

-- Retry con stessa chiave e stessi input: nessun duplicato.
select set_config('request.jwt.claims',json_build_object(
 'sub',(select id::text from auth.users where lower(trim(email))='utente.a@test.local'),
 'role','authenticated')::text,true);
set local role authenticated;
select public.create_expense_with_allocations(
 '93000000-0000-0000-0000-000000000003'::uuid,null,'MAINTENANCE','Manutenzione straordinaria test',
 date '2027-06-15',600.00,'OWNERSHIP_QUOTAS',null,600.00,date '2027-06-15',
 '91000000-0000-0000-0000-000000000001'::uuid,'BANK_TRANSFER','Fixture automatica Spese',
 '94000000-0000-0000-0000-000000000004'::uuid);
reset role;

do $$
declare v_e int;v_a int;v_p int;v_s int;v_k int;
begin
 select count(*) into v_e from public.expenses where property_id='93000000-0000-0000-0000-000000000003';
 select count(*) into v_a from public.expense_allocations where expense_id in(select id from public.expenses where property_id='93000000-0000-0000-0000-000000000003');
 select count(*) into v_p from public.expense_payments where expense_id in(select id from public.expenses where property_id='93000000-0000-0000-0000-000000000003');
 select count(*) into v_s from public.owner_settlement_items where property_id='93000000-0000-0000-0000-000000000003';
 select count(*) into v_k from public.idempotency_keys where operation_name='create_expense_with_allocations' and idempotency_key='94000000-0000-0000-0000-000000000004';
 if v_e<>1 or v_a<>2 or v_p<>1 or v_s<>1 or v_k<>1 then raise exception 'EXPENSE_TEST_IDEMPOTENCY_FAILED e=%,a=%,p=%,s=%,k=%',v_e,v_a,v_p,v_s,v_k; end if;
end $$;

-- Ripartizione manuale non quadrata: deve fallire senza creare Spesa.
select set_config('request.jwt.claims',json_build_object(
 'sub',(select id::text from auth.users where lower(trim(email))='utente.a@test.local'),
 'role','authenticated')::text,true);
set local role authenticated;
do $$
declare v_failed boolean:=false;
begin
 begin
  perform public.create_expense_with_allocations(
   '93000000-0000-0000-0000-000000000003'::uuid,null,'OTHER','Manuale non quadrata',
   date '2027-06-16',600.00,'MANUAL',
   jsonb_build_array(
    jsonb_build_object('owner_id','91000000-0000-0000-0000-000000000001','allocated_amount',300),
    jsonb_build_object('owner_id','92000000-0000-0000-0000-000000000002','allocated_amount',299)
   ),null,null,null,null,null,'95000000-0000-0000-0000-000000000005'::uuid
  );
 exception when others then
  if sqlerrm like '%EXPENSE_ALLOCATION_MISMATCH%' then v_failed:=true; else raise; end if;
 end;
 if not v_failed then raise exception 'EXPENSE_TEST_MANUAL_MISMATCH_DID_NOT_FAIL'; end if;
end $$;
reset role;

do $$
declare v_count int;
begin
 select count(*) into v_count from public.expenses where property_id='93000000-0000-0000-0000-000000000003' and description='Manuale non quadrata';
 if v_count<>0 then raise exception 'EXPENSE_TEST_MANUAL_MISMATCH_SIDE_EFFECT count=%',v_count; end if;
end $$;

-- Output diagnostico.
select e.id,e.total_amount,e.status,ea.owner_id,ea.percentage,ea.allocated_amount
from public.expenses e join public.expense_allocations ea on ea.expense_id=e.id
where e.property_id='93000000-0000-0000-0000-000000000003'
order by ea.owner_id;

select property_id,expense_id,creditor_owner_id,debtor_owner_id,amount,status
from public.owner_settlement_items
where property_id='93000000-0000-0000-0000-000000000003';

rollback;
\echo 'CREATE EXPENSE WITH ALLOCATIONS TEST PASSED'
