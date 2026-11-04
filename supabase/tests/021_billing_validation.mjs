import assert from 'node:assert/strict'
import { paymentAmountInCents, pendingPaymentFromJson } from '../../src/features/billing/model.ts'

assert.equal(paymentAmountInCents('250,50'), 25050)
assert.equal(paymentAmountInCents('0.01'), 1)
assert.equal(paymentAmountInCents(' 1000 '), 100000)
for (const value of ['', '0', '-1', '1.001', '1e3', 'Infinity', '1,2,3']) {
  assert.equal(paymentAmountInCents(value), null, `Invalid payment: ${value}`)
}
const pending = {
  p_installment_id: 'installment-test', p_amount: 250.5,
  p_payment_date: '2026-11-04', p_payment_method: 'BANK_TRANSFER',
  p_payer_name: 'Pagatore', p_notes: null,
  p_idempotency_key: 'd0210000-0000-4000-8000-000000000001',
}
assert.equal(pendingPaymentFromJson(null, pending.p_installment_id), null)
assert.deepEqual(pendingPaymentFromJson(JSON.stringify(pending), pending.p_installment_id), pending)
assert.throws(() => pendingPaymentFromJson(JSON.stringify(pending), 'other-installment'), /INVALID_PENDING_PAYMENT/)
assert.throws(() => pendingPaymentFromJson(JSON.stringify({ ...pending, p_idempotency_key: '' }), pending.p_installment_id), /INVALID_PENDING_PAYMENT/)
assert.throws(() => pendingPaymentFromJson('null', pending.p_installment_id), /INVALID_PENDING_PAYMENT/)
console.log('BILLING AMOUNT AND PENDING PAYMENT VALIDATION PASSED')