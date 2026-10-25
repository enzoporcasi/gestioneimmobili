-- GestioneImmobili - Test automatico RLS documenti
-- Non distruttivo: ROLLBACK finale.
-- Richiede seed con utente A/B e migration documentale.

\set ON_ERROR_STOP on
begin;

-- Fixture profili
insert into public.profiles(id,first_name,last_name,display_name,status)
select id,'Utente',case when email='utente.a@test.local' then 'A' else 'B' end,
       case when email='utente.a@test.local' then 'Utente A' else 'Utente B' end,'ACTIVE'
from auth.users where email in ('utente.a@test.local','utente.b@test.local')
on conflict(id) do update set status='ACTIVE',updated_at=now();

-- Owner e accessi separati
insert into public.owners(id,owner_type,first_name,last_name,tax_code,status) values
('a9100000-0000-0000-0000-000000000001','NATURAL_PERSON','Owner','Doc A','DOCRLSA','ACTIVE'),
('b9200000-0000-0000-0000-000000000002','NATURAL_PERSON','Owner','Doc B','DOCRLSB','ACTIVE')
on conflict(id) do update set status='ACTIVE';

insert into public.user_owner_accesses(user_id,owner_id,role,valid_from,status)
select u.id,x.owner_id,'MANAGER',current_date,'ACTIVE'
from auth.users u join (values
 ('utente.a@test.local','a9100000-0000-0000-0000-000000000001'::uuid),
 ('utente.b@test.local','b9200000-0000-0000-0000-000000000002'::uuid)
) x(email,owner_id) on x.email=u.email
where not exists(select 1 from public.user_owner_accesses a where a.user_id=u.id and a.owner_id=x.owner_id);

insert into public.properties(id,internal_code,name,property_type,status,municipality) values
('a9300000-0000-0000-0000-000000000003','IMM-DOC-A','Immobile Documento A','APARTMENT','ACTIVE','Roma'),
('b9400000-0000-0000-0000-000000000004','IMM-DOC-B','Immobile Documento B','APARTMENT','ACTIVE','Roma')
on conflict(id) do update set status='ACTIVE';

insert into public.property_ownerships(id,property_id,owner_id,ownership_percentage,valid_from) values
('a9310000-0000-0000-0000-000000000031','a9300000-0000-0000-0000-000000000003','a9100000-0000-0000-0000-000000000001',100,current_date),
('b9410000-0000-0000-0000-000000000041','b9400000-0000-0000-0000-000000000004','b9200000-0000-0000-0000-000000000002',100,current_date)
on conflict(id) do update set valid_from=current_date,valid_to=null;

-- Simula A e prenota Documento A
select set_config('request.jwt.claims',json_build_object(
 'sub',(select id::text from auth.users where email='utente.a@test.local'),'role','authenticated')::text,true);
set local role authenticated;
create temporary table tmp_doc_a(data jsonb) on commit drop;
insert into tmp_doc_a select public.reserve_document_upload(
 'PROPERTY','a9300000-0000-0000-0000-000000000003','Documento A','CONTRACT',
 'documento-a.pdf','application/pdf',1024,'STANDARD','TEST');
reset role;

-- Simula B e prenota Documento B
select set_config('request.jwt.claims',json_build_object(
 'sub',(select id::text from auth.users where email='utente.b@test.local'),'role','authenticated')::text,true);
set local role authenticated;
create temporary table tmp_doc_b(data jsonb) on commit drop;
insert into tmp_doc_b select public.reserve_document_upload(
 'PROPERTY','b9400000-0000-0000-0000-000000000004','Documento B','CONTRACT',
 'documento-b.pdf','application/pdf',1024,'STANDARD','TEST');
reset role;

-- A vede soltanto Documento A e non può prenotare su Property B.
select set_config('request.jwt.claims',json_build_object(
 'sub',(select id::text from auth.users where email='utente.a@test.local'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare v_count int;v_title text;v_denied boolean:=false;
begin
 select count(*),min(title) into v_count,v_title from public.documents
 where title in ('Documento A','Documento B');
 if v_count<>1 or v_title<>'Documento A' then raise exception 'DOCUMENT_RLS_A_SELECT_FAILED count=%,title=%',v_count,v_title; end if;
 begin
  perform public.reserve_document_upload('PROPERTY','b9400000-0000-0000-0000-000000000004','Intrusione','OTHER','x.pdf','application/pdf',100,'STANDARD','TEST');
 exception when others then if sqlerrm like '%ACCESS_DENIED%' then v_denied:=true; else raise; end if; end;
 if not v_denied then raise exception 'DOCUMENT_RLS_A_CROSS_SCOPE_RESERVE_ALLOWED'; end if;
end $$;
reset role;

-- B vede soltanto Documento B.
select set_config('request.jwt.claims',json_build_object(
 'sub',(select id::text from auth.users where email='utente.b@test.local'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare v_count int;v_title text;
begin
 select count(*),min(title) into v_count,v_title from public.documents
 where title in ('Documento A','Documento B');
 if v_count<>1 or v_title<>'Documento B' then raise exception 'DOCUMENT_RLS_B_SELECT_FAILED count=%,title=%',v_count,v_title; end if;
end $$;
reset role;

-- Utente A non può autorizzare il Documento B.
select set_config('request.jwt.claims',json_build_object(
 'sub',(select id::text from auth.users where email='utente.a@test.local'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare v_denied boolean:=false;v_b_version uuid;
begin
 select (data->>'document_version_id')::uuid into v_b_version from tmp_doc_b;
 begin perform public.authorize_document_download(v_b_version);
 exception when others then if sqlerrm like '%ACCESS_DENIED%' then v_denied:=true; else raise; end if; end;
 if not v_denied then raise exception 'DOCUMENT_RLS_A_DOWNLOAD_B_ALLOWED'; end if;
end $$;
reset role;

rollback;
\echo 'DOCUMENT RLS TEST PASSED'
