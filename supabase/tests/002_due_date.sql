do $$
begin
    assert public.calculate_due_date(
        date '2027-02-01',
        31::smallint
    ) = date '2027-02-28';

    assert public.calculate_due_date(
        date '2028-02-01',
        31::smallint
    ) = date '2028-02-29';

    assert public.calculate_due_date(
        date '2100-02-01',
        31::smallint
    ) = date '2100-02-28';

    assert public.calculate_due_date(
        date '2000-02-01',
        31::smallint
    ) = date '2000-02-29';

    assert public.calculate_due_date(
        date '2027-04-01',
        31::smallint
    ) = date '2027-04-30';

    assert public.calculate_due_date(
        date '2027-05-01',
        31::smallint
    ) = date '2027-05-31';

    assert public.calculate_due_date(
        date '2027-02-01',
        29::smallint
    ) = date '2027-02-28';

    assert public.calculate_due_date(
        date '2028-02-01',
        29::smallint
    ) = date '2028-02-29';
end;
$$;