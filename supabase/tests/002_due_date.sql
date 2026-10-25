do $$ begin
 assert public.calculate_due_date('2027-02-01',31)=date '2027-02-28';
 assert public.calculate_due_date('2028-02-01',31)=date '2028-02-29';
 assert public.calculate_due_date('2100-02-01',31)=date '2100-02-28';
 assert public.calculate_due_date('2000-02-01',31)=date '2000-02-29';
 assert public.calculate_due_date('2027-04-01',31)=date '2027-04-30';
end $$;
