do $$ declare t text; begin
 foreach t in array array['profiles','owners','user_owner_accesses','properties','property_ownerships','rentable_spaces','tenants','contracts','contract_rentable_spaces','contract_tenants','contract_terms','contract_changes','rent_installments','receipts','receipt_allocations','expenses','expense_allocations','expense_payments','owner_settlement_items','documents','document_versions','deadlines','notification_rules','notification_deliveries','legal_acceptances','data_subject_requests'] loop execute format('alter table public.%I enable row level security',t); end loop;
end $$;

create policy profiles_self_select on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy owners_select on public.owners for select to authenticated using(security.can_access_owner(id,'VIEWER'));
create policy properties_select on public.properties for select to authenticated using(security.can_access_property(id,'VIEWER'));
create policy ownerships_select on public.property_ownerships for select to authenticated using(security.can_access_property(property_id,'VIEWER'));
create policy spaces_select on public.rentable_spaces for select to authenticated using(security.can_access_property(property_id,'VIEWER'));
create policy contracts_select on public.contracts for select to authenticated using(security.can_access_property(property_id,'VIEWER'));
create policy installments_select on public.rent_installments for select to authenticated using(security.can_access_contract(contract_id,'VIEWER'));
create policy expenses_select on public.expenses for select to authenticated using(security.can_access_property(property_id,'VIEWER'));
create policy legal_acceptances_self on public.legal_acceptances for select to authenticated using(user_id=(select auth.uid()));
create policy dsr_self on public.data_subject_requests for select to authenticated using(user_id=(select auth.uid()));

revoke all on all tables in schema public from anon;
revoke insert,update,delete on all tables in schema public from authenticated;
grant select on public.profiles,public.owners,public.properties,public.property_ownerships,public.rentable_spaces,public.contracts,public.rent_installments,public.v_rent_installment_balance,public.expenses,public.legal_acceptances,public.data_subject_requests to authenticated;
grant update(first_name,last_name,display_name,locale,time_zone) on public.profiles to authenticated;
