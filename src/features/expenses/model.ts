export type ExpenseRequest = {
  p_property_id: string
  p_rentable_space_id: null
  p_category: string
  p_description: string
  p_competence_date: string
  p_total_amount: number
  p_allocation_mode: 'OWNERSHIP_QUOTAS'
  p_first_payment_amount: number | null
  p_first_payment_date: string | null
  p_payer_owner_id: string | null
  p_payment_method: string | null
  p_notes: string | null
  p_idempotency_key: string
}

export function restoreExpenseRequest(raw: string | null): ExpenseRequest | null {
  if (raw === null) return null
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('INVALID_EXPENSE_DRAFT')
  const request = parsed as Record<string, unknown>
  for (const field of ['p_property_id', 'p_category', 'p_description', 'p_competence_date', 'p_idempotency_key']) {
    if (typeof request[field] !== 'string' || !request[field].trim()) throw new Error('INVALID_EXPENSE_DRAFT')
  }
  if (typeof request.p_total_amount !== 'number' || !Number.isFinite(request.p_total_amount) || request.p_total_amount <= 0
    || request.p_allocation_mode !== 'OWNERSHIP_QUOTAS' || request.p_rentable_space_id !== null) {
    throw new Error('INVALID_EXPENSE_DRAFT')
  }
  for (const field of ['p_first_payment_date', 'p_payer_owner_id', 'p_payment_method', 'p_notes']) {
    if (request[field] !== null && typeof request[field] !== 'string') throw new Error('INVALID_EXPENSE_DRAFT')
  }
  if (request.p_first_payment_amount !== null
    && (typeof request.p_first_payment_amount !== 'number' || !Number.isFinite(request.p_first_payment_amount)
      || request.p_first_payment_amount <= 0 || request.p_first_payment_amount > request.p_total_amount)) {
    throw new Error('INVALID_EXPENSE_DRAFT')
  }
  return request as ExpenseRequest
}

export function expenseErrorMessage(message: string) {
  const errors: Record<string, string> = {
    ACCESS_DENIED: 'Non hai i permessi Manager su questo immobile.',
    OWNERSHIP_STRUCTURE_NOT_FOUND: 'Non ci sono quote di proprieta valide alla data di competenza.',
    OWNERSHIP_TOTAL_NOT_100: 'Le quote alla data di competenza non totalizzano il 100%.',
    INVALID_FIRST_PAYMENT_AMOUNT: 'Il pagamento deve essere positivo e non superare la spesa.',
    PAYER_OWNER_NOT_IN_EXPENSE_ALLOCATION: 'Il Proprietario pagatore non partecipa alla ripartizione della spesa.',
    IDEMPOTENCY_CONFLICT: 'La richiesta differisce dalla spesa gia associata a questa chiave. Non creare un duplicato.',
  }
  const match = Object.keys(errors).find((code) => message.includes(code))
  return match ? errors[match] : 'Operazione non confermata. Riprova la stessa registrazione.'
}