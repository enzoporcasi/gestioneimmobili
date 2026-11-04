export type PaymentRequest = {
  p_installment_id: string
  p_amount: number
  p_payment_date: string
  p_payment_method: string
  p_payer_name: string | null
  p_notes: string | null
  p_idempotency_key: string
}

export const installmentStatuses: Record<string, string> = {
  CREATED: 'Da incassare', PARTIAL: 'Parziale', OVERDUE: 'Scaduto',
  PAID: 'Saldato', LOST: 'Perso', NOT_DUE: 'Non dovuto', CANCELLED: 'Annullato',
}

export function paymentAmountInCents(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null
  const [whole, fraction = ''] = normalized.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}

export function pendingPaymentFromJson(raw: string | null, installmentId: string): PaymentRequest | null {
  if (raw === null) return null
  const value: unknown = JSON.parse(raw)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('INVALID_PENDING_PAYMENT')
  const request = value as Record<string, unknown>
  if (request.p_installment_id !== installmentId
    || typeof request.p_amount !== 'number' || !Number.isFinite(request.p_amount) || request.p_amount <= 0
    || typeof request.p_payment_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(request.p_payment_date)
    || typeof request.p_payment_method !== 'string' || !request.p_payment_method.trim()
    || (request.p_payer_name !== null && typeof request.p_payer_name !== 'string')
    || (request.p_notes !== null && typeof request.p_notes !== 'string')
    || typeof request.p_idempotency_key !== 'string'
    || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(request.p_idempotency_key)) {
    throw new Error('INVALID_PENDING_PAYMENT')
  }
  return {
    p_installment_id: installmentId,
    p_amount: request.p_amount,
    p_payment_date: request.p_payment_date,
    p_payment_method: request.p_payment_method,
    p_payer_name: request.p_payer_name,
    p_notes: request.p_notes,
    p_idempotency_key: request.p_idempotency_key,
  }
}

export function billingErrorMessage(message: string) {
  const errors: Record<string, string> = {
    ACCESS_DENIED: 'Non hai i permessi Manager necessari per questa operazione.',
    CONTRACT_NOT_ACTIVE: 'Attiva il contratto prima di generare le rate.',
    PAYMENT_EXCEEDS_RESIDUAL: 'L’importo supera il residuo aggiornato della rata. Ricarica i dati.',
    INSTALLMENT_ALREADY_SETTLED: 'La rata risulta già saldata. Ricarica i dati.',
    INSTALLMENT_NOT_PAYABLE: 'Questa rata non può ricevere pagamenti.',
    IDEMPOTENCY_CONFLICT: 'La richiesta differisce dal pagamento già associato a questa chiave.',
    INVALID_PAYMENT_AMOUNT: 'Inserisci un importo positivo con al massimo due decimali.',
  }
  const match = Object.keys(errors).find((code) => message.includes(code))
  return match ? errors[match] : 'Operazione non confermata. Riprova senza modificare il pagamento.'
}