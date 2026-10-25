begin;
do $$ begin
 begin insert into public.owner_settlement_items(property_id,creditor_owner_id,debtor_owner_id,amount,status) values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),-1,'OPEN'); raise exception 'expected constraint'; exception when check_violation or foreign_key_violation then null; end;
end $$;
rollback;
