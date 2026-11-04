import assert from 'node:assert/strict'
import { restoreExpenseRequest } from '../../src/features/expenses/model.ts'

const request = {
  p_property_id: 'property-test', p_rentable_space_id: null,
  p_category: 'MAINTENANCE', p_description: 'Riparazione', p_competence_date: '2026-11-04',
  p_total_amount: 125.5, p_allocation_mode: 'OWNERSHIP_QUOTAS',
  p_first_payment_amount: null, p_first_payment_date: null,
  p_payer_owner_id: null, p_payment_method: null, p_notes: null,
  p_idempotency_key: 'd0230000-0000-4000-8000-000000000003',
}
assert.equal(restoreExpenseRequest(null), null)
assert.deepEqual(restoreExpenseRequest(JSON.stringify(request)), request)
assert.throws(() => restoreExpenseRequest('{}'), /INVALID_EXPENSE_DRAFT/)
assert.throws(() => restoreExpenseRequest('null'), /INVALID_EXPENSE_DRAFT/)
assert.throws(() => restoreExpenseRequest(JSON.stringify({ ...request, p_total_amount: -1 })), /INVALID_EXPENSE_DRAFT/)
assert.throws(() => restoreExpenseRequest(JSON.stringify({ ...request, p_first_payment_amount: 200 })), /INVALID_EXPENSE_DRAFT/)
console.log('EXPENSE DRAFT VALIDATION PASSED')