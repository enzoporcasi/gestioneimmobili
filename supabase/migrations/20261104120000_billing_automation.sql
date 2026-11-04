insert into public.reference_catalog_items (catalog_code, code, label, sort_order) values
    ('notification_delivery_status', 'PROCESSING', 'In invio', 4),
    ('notification_delivery_status', 'CANCELLED', 'Annullata', 5)
on conflict (catalog_code, code) do nothing;

alter table public.notification_rules add column automation_key text unique;
alter table public.notification_deliveries add column automation_key text unique;
alter table public.notification_deliveries add column lease_token uuid;
alter table public.notification_deliveries add column lease_until timestamptz;
create index notification_deliveries_pending_idx on public.notification_deliveries(status, scheduled_at);

create table security.billing_automation_state (
    singleton boolean primary key default true check(singleton),
    last_generation_at timestamptz
);
insert into security.billing_automation_state default values;
alter table security.billing_automation_state enable row level security;
revoke all on security.billing_automation_state from public, anon, authenticated;

create function security.rent_notification_payload(p_delivery_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, security
as $$
    select jsonb_build_object(
        'delivery_id', delivery.id,
        'recipient_email', account.email,
        'property_name', property.name,
        'contract_code', contract.internal_code,
        'due_date', installment.due_date,
        'residual', balance.active_residual,
        'stage', case when rule.offset_minutes > 0 then 'UPCOMING'
            when rule.offset_minutes = 0 then 'DUE' else 'OVERDUE' end
    )
    from public.notification_deliveries delivery
    join public.notification_rules rule on rule.id = delivery.notification_rule_id
    join public.deadlines deadline on deadline.id = rule.deadline_id
    join public.rent_installments installment on installment.id = deadline.source_id
    join public.v_rent_installment_balance balance on balance.id = installment.id
    join public.contracts contract on contract.id = installment.contract_id
    join public.properties property on property.id = contract.property_id
    join public.profiles profile on profile.id = rule.recipient_user_id
    join auth.users account on account.id = profile.id
    where delivery.id = p_delivery_id and delivery.automation_key is not null
      and deadline.source_type = 'RENT_INSTALLMENT'
      and deadline.status in ('TODO', 'IN_PROGRESS')
      and rule.enabled and rule.channel = 'EMAIL'
      and profile.status = 'ACTIVE' and profile.archived_at is null
      and account.email_confirmed_at is not null and account.deleted_at is null
      and account.email is not null and (account.banned_until is null or account.banned_until < now())
      and balance.active_residual > 0
      and installment.status not in ('LOST', 'NOT_DUE', 'CANCELLED')
      and (
          (rule.offset_minutes > 0 and installment.due_date > (now() at time zone 'Europe/Rome')::date)
          or (rule.offset_minutes = 0 and installment.due_date = (now() at time zone 'Europe/Rome')::date)
          or (rule.offset_minutes < 0 and installment.due_date < (now() at time zone 'Europe/Rome')::date)
      )
      and exists (
          select 1 from public.user_owner_accesses access
          join public.property_ownerships ownership on ownership.owner_id = access.owner_id
          where access.user_id = profile.id and ownership.property_id = property.id
            and access.status = 'ACTIVE' and access.role in ('MANAGER', 'ADMINISTRATOR')
            and current_date >= access.valid_from and (access.valid_to is null or current_date < access.valid_to)
            and current_date >= ownership.valid_from and (ownership.valid_to is null or current_date < ownership.valid_to)
      );
$$;
revoke all on function security.rent_notification_payload(uuid) from public, anon, authenticated;

create or replace function public.run_billing_automation()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare
    v_today date := (now() at time zone 'Europe/Rome')::date;
    v_generation jsonb := '{}'::jsonb;
    v_generation_error text;
    v_enqueued integer;
begin
    if not pg_try_advisory_xact_lock(hashtextextended('billing_automation', 0)) then
        return jsonb_build_object('busy', true);
    end if;

    if exists (select 1 from security.billing_automation_state
        where singleton and (last_generation_at is null or last_generation_at < now() - interval '15 minutes')) then
        begin
            v_generation := public.generate_due_installments(v_today);
        exception when others then
            v_generation_error := sqlstate;
            insert into public.security_events(event_type, severity, outcome, details)
            values ('BILLING_AUTOMATION_FAILED', 'HIGH', 'FAILED', jsonb_build_object('sqlstate', sqlstate));
        end;
        update security.billing_automation_state set last_generation_at = now() where singleton;
    end if;

    update public.deadlines deadline set status = 'COMPLETED', completed_at = now()
    where deadline.generator_key like 'rent:%' and deadline.status in ('TODO', 'IN_PROGRESS')
      and exists (select 1 from public.v_rent_installment_balance balance
          where balance.id = deadline.source_id
            and (balance.active_residual <= 0 or balance.status in ('LOST', 'NOT_DUE', 'CANCELLED')));

    insert into public.deadlines(title, category, due_at, priority, responsible_user_id, source_type, source_id, generator_key)
    select distinct 'Canone ' || contract.internal_code, 'PAYMENT',
        (installment.due_date + time '09:00') at time zone 'Europe/Rome', 'MEDIUM', profile.id,
        'RENT_INSTALLMENT', installment.id, 'rent:' || installment.id::text || ':' || profile.id::text
    from public.rent_installments installment
    join public.v_rent_installment_balance balance on balance.id = installment.id
    join public.contracts contract on contract.id = installment.contract_id
    join public.property_ownerships ownership on ownership.property_id = contract.property_id
    join public.user_owner_accesses access on access.owner_id = ownership.owner_id
    join public.profiles profile on profile.id = access.user_id
    join auth.users account on account.id = profile.id
    where balance.active_residual > 0 and installment.status not in ('LOST', 'NOT_DUE', 'CANCELLED')
      and access.status = 'ACTIVE' and access.role in ('MANAGER', 'ADMINISTRATOR')
      and profile.status = 'ACTIVE' and profile.archived_at is null
      and account.email_confirmed_at is not null and account.deleted_at is null
      and current_date >= access.valid_from and (access.valid_to is null or current_date < access.valid_to)
      and current_date >= ownership.valid_from and (ownership.valid_to is null or current_date < ownership.valid_to)
    on conflict (generator_key) do nothing;

    insert into public.notification_rules(deadline_id, recipient_user_id, channel, offset_minutes, automation_key)
    select deadline.id, deadline.responsible_user_id, 'EMAIL', reminder.offset_minutes,
        deadline.generator_key || ':' || reminder.stage
    from public.deadlines deadline
    cross join (values ('UPCOMING', 4320), ('DUE', 0), ('OVERDUE', -1440)) reminder(stage, offset_minutes)
    where deadline.generator_key like 'rent:%' and deadline.status = 'TODO'
    on conflict (automation_key) do nothing;

    insert into public.notification_deliveries(notification_rule_id, scheduled_at, automation_key)
    select rule.id, deadline.due_at - make_interval(mins => rule.offset_minutes), rule.automation_key
    from public.notification_rules rule
    join public.deadlines deadline on deadline.id = rule.deadline_id
    join public.rent_installments installment on installment.id = deadline.source_id
    where rule.automation_key is not null and deadline.generator_key like 'rent:%'
      and rule.enabled and deadline.status = 'TODO'
      and (rule.offset_minutes < 0
          or (rule.offset_minutes = 0 and installment.due_date >= v_today)
          or (rule.offset_minutes > 0 and installment.due_date > v_today))
    on conflict (automation_key) do nothing;
    get diagnostics v_enqueued = row_count;

    update public.notification_deliveries delivery set status = 'CANCELLED', lease_token = null, lease_until = null,
        last_error_code = 'NO_LONGER_APPLICABLE'
    where delivery.automation_key is not null and delivery.status = 'SCHEDULED'
            and (delivery.scheduled_at <= now() or exists (
                    select 1 from public.notification_rules rule
                    join public.deadlines deadline on deadline.id = rule.deadline_id
                    where rule.id = delivery.notification_rule_id and deadline.status in ('COMPLETED', 'CANCELLED')
            ))
      and security.rent_notification_payload(delivery.id) is null;

    return jsonb_build_object('installments_created', coalesce((v_generation->>'installments_created')::integer, 0),
        'notifications_enqueued', v_enqueued, 'generation_error', v_generation_error);
end;
$$;
revoke all on function public.run_billing_automation() from public, anon, authenticated;
grant execute on function public.run_billing_automation() to service_role;

create function public.claim_rent_notification()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare
    v_delivery public.notification_deliveries%rowtype;
    v_payload jsonb;
    v_token uuid;
begin
    update public.notification_deliveries set status = 'FAILED', last_error_code = 'MAX_ATTEMPTS', lease_token = null, lease_until = null
    where automation_key is not null and status = 'PROCESSING' and lease_until < now() and attempt_count >= 5;

    for v_delivery in
        select * from public.notification_deliveries
        where automation_key is not null and attempt_count < 5
          and ((status = 'SCHEDULED' and scheduled_at <= now()) or (status = 'PROCESSING' and lease_until < now()))
        order by scheduled_at, id for update skip locked limit 100
    loop
        v_payload := security.rent_notification_payload(v_delivery.id);
        if v_payload is null then
            update public.notification_deliveries set status = 'CANCELLED', lease_token = null, lease_until = null,
                last_error_code = 'NO_LONGER_APPLICABLE' where id = v_delivery.id;
            continue;
        end if;
        v_token := gen_random_uuid();
        update public.notification_deliveries set status = 'PROCESSING', attempt_count = attempt_count + 1,
            lease_token = v_token, lease_until = now() + interval '2 minutes' where id = v_delivery.id;
        return v_payload || jsonb_build_object('lease_token', v_token);
    end loop;
    return null;
end;
$$;
revoke all on function public.claim_rent_notification() from public, anon, authenticated;
grant execute on function public.claim_rent_notification() to service_role;

create function public.complete_rent_notification(p_delivery_id uuid, p_lease_token uuid, p_sent boolean, p_provider_ref text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare
    v_delivery public.notification_deliveries%rowtype;
begin
    select * into v_delivery from public.notification_deliveries where id = p_delivery_id for update;
    if not found or v_delivery.status <> 'PROCESSING' or v_delivery.lease_token is distinct from p_lease_token
        or v_delivery.lease_until <= now() then raise exception 'INVALID_NOTIFICATION_LEASE'; end if;
    if p_sent is null then raise exception 'NOTIFICATION_RESULT_REQUIRED'; end if;
    update public.notification_deliveries set
        status = case when p_sent then 'SENT' when attempt_count >= 5 then 'FAILED' else 'SCHEDULED' end,
        sent_at = case when p_sent then now() else null end,
        provider_message_ref = case when p_sent then left(p_provider_ref, 255) else null end,
        last_error_code = case when p_sent then null else 'SMTP_SEND_FAILED' end,
        scheduled_at = case when p_sent then scheduled_at else now() + make_interval(secs => (30 * power(2, attempt_count))::integer) end,
        lease_token = null, lease_until = null
    where id = p_delivery_id;
end;
$$;
revoke all on function public.complete_rent_notification(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.complete_rent_notification(uuid, uuid, boolean, text) to service_role;