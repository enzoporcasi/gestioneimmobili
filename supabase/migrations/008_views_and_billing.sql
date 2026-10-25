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

create or replace function public.generate_due_installments(
    p_reference_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare
    v_run uuid := gen_random_uuid();
    v_created integer := 0;
    v_rows integer := 0;

    rec record;

    v_start date;
    v_end date;
begin
    if p_reference_date is null then
        raise exception
            using
                errcode = '22004',
                message = 'REFERENCE_DATE_REQUIRED';
    end if;

    insert into public.billing_generation_runs (
        id,
        reference_date,
        status,
        correlation_id
    )
    values (
        v_run,
        p_reference_date,
        'RUNNING',
        gen_random_uuid()
    );

    for rec in
        select
            c.id as contract_id,
            c.start_date as contract_start_date,
            c.end_date as contract_end_date,
            c.ended_at,

            t.id as contract_term_id,
            t.valid_from as term_valid_from,
            t.valid_to as term_valid_to,
            t.base_rent_amount,
            t.billing_frequency,
            t.billing_interval,
            t.first_billing_period_start,
            t.due_day

        from public.contracts c

        join public.contract_terms t
          on t.contract_id = c.id

        where c.management_status = 'ACTIVE'
          and t.first_billing_period_start <= p_reference_date

        order by
            c.id,
            t.valid_from
    loop
        if rec.billing_frequency not in (
            'MONTHLY',
            'BIMONTHLY',
            'QUARTERLY',
            'SEMIANNUAL',
            'ANNUAL',
            'CUSTOM'
        ) then
            raise exception
                using
                    errcode = 'P0001',
                    message = 'UNSUPPORTED_BILLING_FREQUENCY',
                    detail = 'Contract term ID: '
                        || rec.contract_term_id::text;
        end if;

        if rec.due_day is null
           or rec.due_day < 1
           or rec.due_day > 31 then
            raise exception
                using
                    errcode = 'P0001',
                    message = 'INVALID_DUE_DAY',
                    detail = 'Contract term ID: '
                        || rec.contract_term_id::text;
        end if;

        if rec.billing_frequency = 'CUSTOM'
           and (
               rec.billing_interval is null
               or rec.billing_interval <= 0
           ) then
            raise exception
                using
                    errcode = 'P0001',
                    message = 'INVALID_CUSTOM_BILLING_INTERVAL',
                    detail = 'Contract term ID: '
                        || rec.contract_term_id::text;
        end if;

        /*
         * Il periodo parte dalla prima mensilità/primo periodo,
         * ma non può iniziare prima della validità del Term.
         */
        v_start := greatest(
            rec.first_billing_period_start,
            rec.term_valid_from
        );

        while v_start <= p_reference_date loop

            /*
             * Non generare periodi con inizio successivo
             * alla scadenza contrattuale.
             */
            exit when v_start > rec.contract_end_date;

            /*
             * Se il Contratto è terminato anticipatamente,
             * non generare periodi successivi alla cessazione.
             */
            exit when rec.ended_at is not null
                      and v_start > rec.ended_at::date;

            /*
             * Gli intervalli dei Term sono semiaperti:
             * [valid_from, valid_to)
             */
            exit when rec.term_valid_to is not null
                      and v_start >= rec.term_valid_to;

            v_end :=
                case rec.billing_frequency

                    when 'MONTHLY' then
                        (
                            v_start
                            + interval '1 month'
                            - interval '1 day'
                        )::date

                    when 'BIMONTHLY' then
                        (
                            v_start
                            + interval '2 months'
                            - interval '1 day'
                        )::date

                    when 'QUARTERLY' then
                        (
                            v_start
                            + interval '3 months'
                            - interval '1 day'
                        )::date

                    when 'SEMIANNUAL' then
                        (
                            v_start
                            + interval '6 months'
                            - interval '1 day'
                        )::date

                    when 'ANNUAL' then
                        (
                            v_start
                            + interval '1 year'
                            - interval '1 day'
                        )::date

                    when 'CUSTOM' then
                        (
                            v_start
                            + make_interval(
                                months => rec.billing_interval
                            )
                            - interval '1 day'
                        )::date

                    else null
                end;

            /*
             * Il CASE precedente non può produrre NULL,
             * perché la frequenza è già stata validata.
             */
            if v_end is null then
                raise exception
                    using
                        errcode = 'P0001',
                        message = 'BILLING_PERIOD_CALCULATION_FAILED';
            end if;

            insert into public.rent_installments (
                contract_id,
                contract_term_id,
                sequence_number,
                period_start,
                period_end,
                due_date,
                amount_due,
                status
            )
            values (
                rec.contract_id,
                rec.contract_term_id,

                /*
                 * Progressivo deterministico basato
                 * sull'inizio del periodo.
                 */
                (
                    extract(year from v_start)::integer * 10000
                    + extract(month from v_start)::integer * 100
                    + extract(day from v_start)::integer
                ),

                v_start,
                v_end,

                public.calculate_due_date(
                    v_start,
                    rec.due_day
                ),

                rec.base_rent_amount,
                'CREATED'
            )
            on conflict (
                contract_id,
                period_start,
                period_end
            )
            do nothing;

            get diagnostics v_rows = row_count;

            v_created := v_created + v_rows;

            v_start :=
                case rec.billing_frequency

                    when 'MONTHLY' then
                        (v_start + interval '1 month')::date

                    when 'BIMONTHLY' then
                        (v_start + interval '2 months')::date

                    when 'QUARTERLY' then
                        (v_start + interval '3 months')::date

                    when 'SEMIANNUAL' then
                        (v_start + interval '6 months')::date

                    when 'ANNUAL' then
                        (v_start + interval '1 year')::date

                    when 'CUSTOM' then
                        (
                            v_start
                            + make_interval(
                                months => rec.billing_interval
                            )
                        )::date

                    else null
                end;

            if v_start is null then
                raise exception
                    using
                        errcode = 'P0001',
                        message = 'NEXT_BILLING_PERIOD_CALCULATION_FAILED';
            end if;

        end loop;
    end loop;

    update public.billing_generation_runs
       set status = 'COMPLETED',
           completed_at = now(),
           installments_created = v_created
     where id = v_run;

    return jsonb_build_object(
        'run_id',
        v_run,
        'reference_date',
        p_reference_date,
        'installments_created',
        v_created
    );
end;
$$;
revoke all 
on function public.generate_due_installments(date) 
from public,anon,authenticated;
