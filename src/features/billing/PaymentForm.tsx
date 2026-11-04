import { useState, type SubmitEvent } from 'react'
import type { BillingInstallment } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { FormField, formatCurrency, localDateString, referenceCatalogItems, useReferenceCatalog } from '../../app/shared'
import { billingErrorMessage, paymentAmountInCents, pendingPaymentFromJson, type PaymentRequest } from './model'

export function PaymentForm({ installment, userId, onSaved }: Readonly<{
  installment: BillingInstallment
  userId: string
  onSaved: () => void
}>) {
  const { items } = useReferenceCatalog()
  const methods = referenceCatalogItems(items, 'payment_method')
  const storageKey = `billing-payment:${userId}:${installment.id}`
  const [stored] = useState(() => {
    try { return { request: pendingPaymentFromJson(sessionStorage.getItem(storageKey), installment.id), error: '' } }
    catch { return { request: null, error: 'Non posso leggere il pagamento in sospeso. Non inviare un nuovo incasso; verifica lo storico prima di continuare.' } }
  })
  const [pending, setPending] = useState<PaymentRequest | null>(stored.request)
  const [amount, setAmount] = useState(() => stored.request?.p_amount.toFixed(2) ?? installment.active_residual.toFixed(2))
  const [date, setDate] = useState(() => stored.request?.p_payment_date ?? localDateString())
  const [method, setMethod] = useState(() => stored.request?.p_payment_method ?? methods[0]?.code ?? '')
  const [payer, setPayer] = useState(() => stored.request?.p_payer_name ?? installment.tenant_name ?? '')
  const [notes, setNotes] = useState(() => stored.request?.p_notes ?? '')
  const [error, setError] = useState(stored.error)
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const locked = pending !== null || submitting || confirmed

  function prepareRequest(): PaymentRequest | null {
    if (pending) return pending
    const cents = paymentAmountInCents(amount)
    if (cents === null || cents > Math.round(installment.active_residual * 100)) {
      setError('Inserisci un importo positivo, con massimo due decimali, non superiore al residuo.')
      return null
    }
    return {
      p_installment_id: installment.id, p_amount: cents / 100,
      p_payment_date: date, p_payment_method: method,
      p_payer_name: payer.trim() || null, p_notes: notes.trim() || null,
      p_idempotency_key: crypto.randomUUID(),
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || submitting || confirmed || stored.error) return
    setError('')
    const request = prepareRequest()
    if (!request) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(request))
    } catch {
      setError('Impossibile conservare la richiesta in questa sessione del browser. Nessun pagamento inviato.')
      return
    }
    setPending(request)
    setSubmitting(true)
    try {
      const { error: paymentError } = await supabase.rpc('record_partial_installment_payment', request)
      if (paymentError) {
        setError(billingErrorMessage(paymentError.message))
        if ((paymentError.code === 'P0001' && !paymentError.message.includes('IDEMPOTENCY_CONFLICT')) || paymentError.code === '23514') {
          sessionStorage.removeItem(storageKey)
          setPending(null)
        }
        return
      }
      setConfirmed(true)
      sessionStorage.removeItem(storageKey)
      setPending(null)
      onSaved()
    } catch {
      setError('Risposta non ricevuta. Riprova la stessa registrazione: la chiave del pagamento e conservata.')
    } finally {
      setSubmitting(false)
    }
  }

  let submitLabel = 'Registra incasso'
  if (pending) submitLabel = 'Riprova registrazione'
  if (submitting) submitLabel = 'Registrazione...'

  return (
    <section className="detail-section billing-payment-section">
      <h2>Registra incasso</h2>
      <p className="detail-muted">Residuo: {formatCurrency(installment.active_residual)}</p>
      {pending && !confirmed && <p className="billing-notice">Un pagamento attende conferma. Riprova la richiesta originale prima di registrarne altri.</p>}
      <form className="contact-editor-form" onSubmit={handleSubmit}>
        <fieldset className="billing-payment-fields" disabled={locked || Boolean(stored.error)}>
          <div className="form-grid">
            <FormField label="Importo incassato" required>
              <input aria-label="Importo incassato" type="number" min="0.01" max={installment.active_residual} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
            </FormField>
            <FormField label="Data pagamento" required>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </FormField>
            <FormField label="Metodo di pagamento" required>
              <select value={method} onChange={(event) => setMethod(event.target.value)} required>
                <option value="">Seleziona...</option>
                {methods.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </FormField>
            <FormField label="Pagatore">
              <input maxLength={200} value={payer} onChange={(event) => setPayer(event.target.value)} />
            </FormField>
          </div>
          <FormField label="Note">
            <textarea maxLength={4000} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </FormField>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-footer">
          <button type="submit" className="primary-button" disabled={submitting || confirmed || Boolean(stored.error) || (!pending && !method)}>{submitLabel}</button>
        </div>
      </form>
    </section>
  )
}