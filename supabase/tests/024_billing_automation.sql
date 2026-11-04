\set ON_ERROR_STOP on
begin;
insert into public.owners(id, owner_type, first_name, last_name)
values ('d0250000-0000-0000-0000-000000000001', 'NATURAL_PERSON', 'Owner', 'Automation Test');
insert into public.user_owner_accesses(user_id, owner_id, role, valid_from)
values ('796c3053-6a28-4ff5-aa08-06129dcf942e', 'd0250000-0000-0000-0000-000000000001', 'MANAGER', current_date);
insert into public.properties(id, internal_code, name, property_type, municipality)
values ('d0250000-0000-0000-0000-000000000002', 'AUTOMATION-025', 'Immobile Automation Test', 'APARTMENT', 'Roma');
insert into public.property_ownerships(property_id, owner_id, ownership_percentage, valid_from)
values ('d0250000-0000-0000-0000-000000000002', 'd0250000-0000-0000-0000-000000000001', 100, current_date);
insert into public.contracts(id, internal_code, property_id, object_type, contract_type, management_status, start_date, end_date)
values ('d0250000-0000-0000-0000-000000000003', 'AUTOMATION-CONTRACT-025', 'd0250000-0000-0000-0000-000000000002',
    'WHOLE_PROPERTY', 'RESIDENTIAL_FREE', 'ACTIVE', (date_trunc('month', current_date) - interval '1 month')::date, (current_date + interval '4 years')::date);
insert into public.contract_terms(contract_id, valid_from, base_rent_amount, billing_frequency, first_billing_period_start, due_day)
values ('d0250000-0000-0000-0000-000000000003', (date_trunc('month', current_date) - interval '1 month')::date,
    1000, 'MONTHLY', (date_trunc('month', current_date) - interval '1 month')::date, 5);
update security.billing_automation_state set last_generation_at = null;

set local role service_role;
select public.run_billing_automation();
select public.run_billing_automation();
reset role;

do $$
declare
    v_count integer;
    v_delivery uuid;
    v_job jsonb;
begin
    select count(*) into v_count from public.rent_installments where contract_id = 'd0250000-0000-0000-0000-000000000003';
    if v_count <> 2 then raise exception 'AUTOMATIC_GENERATION_OR_DEDUP_FAILED'; end if;
    if exists (select automation_key from public.notification_deliveries where automation_key is not null group by automation_key having count(*) > 1) then
        raise exception 'NOTIFICATION_DEDUP_FAILED';
    end if;
    if exists (select 1 from public.notification_deliveries delivery
        join public.notification_rules rule on rule.id = delivery.notification_rule_id
        join public.deadlines deadline on deadline.id = rule.deadline_id
        join public.rent_installments installment on installment.id = deadline.source_id
        where installment.contract_id = 'd0250000-0000-0000-0000-000000000003'
          and installment.due_date > (now() at time zone 'Europe/Rome')::date
          and rule.offset_minutes <= 0 and delivery.status <> 'SCHEDULED') then
        raise exception 'FUTURE_NOTIFICATION_CANCELLED_TOO_EARLY';
    end if;
    select delivery.id into strict v_delivery from public.notification_deliveries delivery
    join public.notification_rules rule on rule.id = delivery.notification_rule_id
    join public.deadlines deadline on deadline.id = rule.deadline_id
    join public.rent_installments installment on installment.id = deadline.source_id
    where installment.contract_id = 'd0250000-0000-0000-0000-000000000003'
      and installment.period_start < date_trunc('month', current_date)::date and rule.offset_minutes < 0;
    update public.notification_deliveries set scheduled_at = now() - interval '100 years' where id = v_delivery;
    v_job := public.claim_rent_notification();
    if (v_job->>'delivery_id')::uuid <> v_delivery or v_job->>'stage' <> 'OVERDUE' then
        raise exception 'NOTIFICATION_CLAIM_FAILED';
    end if;
    if public.claim_rent_notification()->>'delivery_id' = v_delivery::text then
        raise exception 'NOTIFICATION_DOUBLE_CLAIM';
    end if;
    begin
        perform public.complete_rent_notification(v_delivery, gen_random_uuid(), true);
        raise exception 'NOTIFICATION_INVALID_LEASE_ACCEPTED';
    exception when raise_exception then
        if sqlerrm <> 'INVALID_NOTIFICATION_LEASE' then raise; end if;
    end;
    perform public.complete_rent_notification(v_delivery, (v_job->>'lease_token')::uuid, false);
    if not exists (select 1 from public.notification_deliveries where id = v_delivery and status = 'SCHEDULED' and attempt_count = 1 and scheduled_at > now()) then
        raise exception 'NOTIFICATION_RETRY_FAILED';
    end if;
    update public.notification_deliveries set scheduled_at = now() - interval '100 years' where id = v_delivery;
    v_job := public.claim_rent_notification();
    perform public.complete_rent_notification(v_delivery, (v_job->>'lease_token')::uuid, true, 'test-message');
    if not exists (select 1 from public.notification_deliveries where id = v_delivery and status = 'SENT' and sent_at is not null) then
        raise exception 'NOTIFICATION_COMPLETION_FAILED';
    end if;
    if has_function_privilege('authenticated', 'public.run_billing_automation()', 'EXECUTE')
        or has_function_privilege('anon', 'public.claim_rent_notification()', 'EXECUTE')
        or has_function_privilege('authenticated', 'public.complete_rent_notification(uuid,uuid,boolean,text)', 'EXECUTE') then
        raise exception 'AUTOMATION_CLIENT_PRIVILEGES_UNSAFE';
    end if;

    update public.notification_deliveries set status = 'SCHEDULED', attempt_count = 0,
        scheduled_at = now() - interval '100 years' where id = v_delivery;
    update public.user_owner_accesses set status = 'INACTIVE'
    where owner_id = 'd0250000-0000-0000-0000-000000000001';
    perform public.claim_rent_notification();
    if not exists (select 1 from public.notification_deliveries where id = v_delivery and status = 'CANCELLED') then
        raise exception 'NOTIFICATION_REVOKED_ACCESS_NOT_CANCELLED';
    end if;
    update public.user_owner_accesses set status = 'ACTIVE'
    where owner_id = 'd0250000-0000-0000-0000-000000000001';
end;
$$;

update public.rent_installments set amount_lost = amount_due, status = 'LOST'
where contract_id = 'd0250000-0000-0000-0000-000000000003';
select public.run_billing_automation();
do $$
begin
    if exists (select 1 from public.notification_deliveries delivery
        join public.notification_rules rule on rule.id = delivery.notification_rule_id
        join public.deadlines deadline on deadline.id = rule.deadline_id
        join public.rent_installments installment on installment.id = deadline.source_id
        where installment.contract_id = 'd0250000-0000-0000-0000-000000000003' and delivery.status = 'SCHEDULED') then
        raise exception 'CLOSED_INSTALLMENT_NOTIFICATION_NOT_CANCELLED';
    end if;
end;
$$;
rollback;
\echo 'BILLING AUTOMATION TEST PASSED'