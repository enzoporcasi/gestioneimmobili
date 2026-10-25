create or replace view public.v_rent_installment_balance with (security_invoker=true) as
select r.*,
 coalesce((select sum(a.allocated_amount) from public.receipt_allocations a join public.receipts rc on rc.id=a.receipt_id where a.rent_installment_id=r.id and rc.status='RECORDED'),0)::numeric(14,2) amount_received,
 (r.amount_due-r.amount_lost-coalesce((select sum(a.allocated_amount) from public.receipt_allocations a join public.receipts rc on rc.id=a.receipt_id where a.rent_installment_id=r.id and rc.status='RECORDED'),0))::numeric(14,2) active_residual,
 case when r.status in ('LOST','NOT_DUE','CANCELLED') then r.status
      when r.amount_due-r.amount_lost-coalesce((select sum(a.allocated_amount) from public.receipt_allocations a join public.receipts rc on rc.id=a.receipt_id where a.rent_installment_id=r.id and rc.status='RECORDED'),0)<=0 then 'PAID'
      when current_date>r.due_date then 'OVERDUE'
      when coalesce((select sum(a.allocated_amount) from public.receipt_allocations a join public.receipts rc on rc.id=a.receipt_id where a.rent_installment_id=r.id and rc.status='RECORDED'),0)>0 then 'PARTIAL'
      else 'CREATED' end calculated_status
from public.rent_installments r;

create or replace function public.generate_due_installments(p_reference_date date default current_date)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,security as $$
declare v_run uuid:=gen_random_uuid(); v_created int:=0; rec record; v_start date; v_end date;
begin
 insert into public.billing_generation_runs(id,reference_date,status,correlation_id) values(v_run,p_reference_date,'RUNNING',gen_random_uuid());
 for rec in select c.id contract_id,c.end_date,c.ended_at,t.* from public.contracts c join public.contract_terms t on t.contract_id=c.id
  where c.management_status='ACTIVE' and t.first_billing_period_start<=p_reference_date loop
  v_start:=rec.first_billing_period_start;
  while v_start<=p_reference_date loop
   exit when rec.ended_at is not null and v_start>rec.ended_at::date;
   v_end:=case rec.billing_frequency when 'MONTHLY' then (v_start+interval '1 month-1 day')::date when 'BIMONTHLY' then (v_start+interval '2 month-1 day')::date when 'QUARTERLY' then (v_start+interval '3 month-1 day')::date when 'SEMIANNUAL' then (v_start+interval '6 month-1 day')::date when 'ANNUAL' then (v_start+interval '1 year-1 day')::date else (v_start+make_interval(months=>rec.billing_interval)-interval '1 day')::date end;
   insert into public.rent_installments(contract_id,contract_term_id,sequence_number,period_start,period_end,due_date,amount_due,status)
   values(rec.contract_id,rec.id,(extract(year from v_start)::int*10000+extract(month from v_start)::int*100+extract(day from v_start)::int),v_start,v_end,public.calculate_due_date(v_start,rec.due_day),'CREATED',rec.base_rent_amount)
   on conflict(contract_id,period_start,period_end) do nothing;
   get diagnostics v_created=v_created+row_count;
   v_start:=case rec.billing_frequency when 'MONTHLY' then (v_start+interval '1 month')::date when 'BIMONTHLY' then (v_start+interval '2 month')::date when 'QUARTERLY' then (v_start+interval '3 month')::date when 'SEMIANNUAL' then (v_start+interval '6 month')::date when 'ANNUAL' then (v_start+interval '1 year')::date else (v_start+make_interval(months=>rec.billing_interval))::date end;
  end loop;
 end loop;
 update public.billing_generation_runs set status='COMPLETED',completed_at=now(),installments_created=v_created where id=v_run;
 return jsonb_build_object('run_id',v_run,'created',v_created);
exception when others then update public.billing_generation_runs set status='FAILED',completed_at=now(),error_summary=sqlerrm where id=v_run; raise;
end $$;
revoke all on function public.generate_due_installments(date) from public,anon,authenticated;
