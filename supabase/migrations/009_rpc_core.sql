create or replace function public.mark_installment_paid(p_installment_id uuid,p_payment_date date,p_method text,p_payer_tenant_id uuid default null,p_payer_name text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,security as $$
declare r public.rent_installments%rowtype; v_received numeric; v_residual numeric; v_receipt uuid;
begin
 if not security.can_access_installment(p_installment_id,'MANAGER') then raise exception 'ACCESS_DENIED'; end if;
 select * into r from public.rent_installments where id=p_installment_id for update;
 if not found then raise exception 'ENTITY_NOT_FOUND'; end if;
 select coalesce(sum(a.allocated_amount),0) into v_received from public.receipt_allocations a join public.receipts rc on rc.id=a.receipt_id and rc.status='RECORDED' where a.rent_installment_id=r.id;
 v_residual:=r.amount_due-r.amount_lost-v_received;
 if v_residual<=0 or r.status in ('LOST','NOT_DUE','CANCELLED') then raise exception 'INSTALLMENT_NOT_PAYABLE'; end if;
 insert into public.receipts(property_id,payer_tenant_id,payer_name,payment_date,amount,payment_method)
 select c.property_id,p_payer_tenant_id,p_payer_name,p_payment_date,v_residual,p_method from public.contracts c where c.id=r.contract_id returning id into v_receipt;
 insert into public.receipt_allocations(receipt_id,rent_installment_id,allocated_amount) values(v_receipt,r.id,v_residual);
 insert into public.audit_events(actor_user_id,action,entity_type,entity_id,outcome) values(auth.uid(),'INSTALLMENT_PAID','RENT_INSTALLMENT',r.id,'SUCCESS');
 return jsonb_build_object('receipt_id',v_receipt,'amount',v_residual);
end $$;
revoke all on function public.mark_installment_paid(uuid,date,text,uuid,text) from public,anon;
grant execute on function public.mark_installment_paid(uuid,date,text,uuid,text) to authenticated;
