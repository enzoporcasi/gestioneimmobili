begin;
do $$ begin
 assert to_regclass('public.properties') is not null;
 assert to_regclass('public.rent_installments') is not null;
 assert to_regclass('public.documents') is not null;
 assert to_regprocedure('public.calculate_due_date(date,smallint)') is not null;
end $$;
rollback;
