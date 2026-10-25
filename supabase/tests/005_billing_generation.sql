-- Integration fixture required: active contract + term with first_billing_period_start.
-- Execute generate_due_installments twice and assert one installment per period.
select 'Billing generation integration test requires seeded contract fixtures' as instruction;
