import { useEffect, useState, type SubmitEvent } from 'react'
import type { ExpenseOwnership, ExpenseProperty } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { FormField, localDateString, referenceCatalogItems, useReferenceCatalog } from '../../app/shared'
import { paymentAmountInCents } from '../billing/model'
import { expenseErrorMessage, restoreExpenseRequest, type ExpenseRequest } from './model'

export function ExpenseEditor({ initialProperty, userId, onCancel, onSaved }: Readonly<{
  initialProperty?: ExpenseProperty
  userId: string
  onCancel: () => void
  onSaved: (expenseId: string) => void
}>) {
  const { items, loading: catalogLoading } = useReferenceCatalog()
  const categories = referenceCatalogItems(items, 'expense_category')
  const methods = referenceCatalogItems(items, 'payment_method')
  const storageKey = `expense-request:${userId}`
  const [stored] = useState(() => {
    try { return { request: restoreExpenseRequest(sessionStorage.getItem(storageKey)), error: '' } }
    catch { return { request: null, error: 'La richiesta in sospeso non e leggibile. Verifica le spese prima di inviarne una nuova.' } }
  })
  const [pending, setPending] = useState<ExpenseRequest | null>(stored.request)
  const [propertyId, setPropertyId] = useState(initialProperty?.id ?? stored.request?.p_property_id ?? '')
  const [category, setCategory] = useState(stored.request?.p_category ?? categories[0]?.code ?? '')
  const [description, setDescription] = useState(stored.request?.p_description ?? '')
  const [competenceDate, setCompetenceDate] = useState(stored.request?.p_competence_date ?? localDateString())
  const [amount, setAmount] = useState(stored.request?.p_total_amount.toFixed(2) ?? '')
  const [notes, setNotes] = useState(stored.request?.p_notes ?? '')
  const [hasPayment, setHasPayment] = useState(stored.request?.p_first_payment_amount !== null && stored.request?.p_first_payment_amount !== undefined)
  const [paymentAmount, setPaymentAmount] = useState(stored.request?.p_first_payment_amount?.toFixed(2) ?? '')
  const [paymentDate, setPaymentDate] = useState(stored.request?.p_first_payment_date ?? localDateString())
  const [payer, setPayer] = useState(stored.request?.p_payer_owner_id ?? '')
  const [method, setMethod] = useState(stored.request?.p_payment_method ?? methods[0]?.code ?? '')
  const [properties, setProperties] = useState<ExpenseProperty[]>([])
  const [ownerships, setOwnerships] = useState<ExpenseOwnership[]>([])
  const [loadingProperties, setLoadingProperties] = useState(true)
  const [loadingOwners, setLoadingOwners] = useState(false)
  const [error, setError] = useState(stored.error)
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const contextConflict = Boolean(initialProperty && pending && initialProperty.id !== pending.p_property_id)
  const locked = Boolean(pending) || submitting || confirmed

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.from('v_expense_properties').select('*').order('name').then(({ data, error: queryError }) => {
      if (!active) return
      if (queryError) setError('Impossibile caricare gli immobili gestibili.')
      else setProperties((data ?? []).filter((property) => property.can_manage))
      setLoadingProperties(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    setOwnerships([])
    if (!supabase || !propertyId || !competenceDate) return
    let active = true
    setLoadingOwners(true)
    void supabase.from('v_expense_ownerships').select('*').eq('property_id', propertyId)
      .lte('valid_from', competenceDate).or(`valid_to.is.null,valid_to.gt.${competenceDate}`).order('owner_name')
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) setError('Impossibile caricare i Proprietari pagatori.')
        else setOwnerships(data ?? [])
        setLoadingOwners(false)
      })
    return () => { active = false }
  }, [propertyId, competenceDate])

  function prepareRequest(): ExpenseRequest | null {
    if (pending) return pending
    const cents = paymentAmountInCents(amount)
    if (!propertyId || !category || !description.trim() || !competenceDate || cents === null || cents > 99999999999999) {
      setError('Completa i campi obbligatori e inserisci un importo positivo con massimo due decimali.')
      return null
    }
    const paidCents = hasPayment ? paymentAmountInCents(paymentAmount) : null
    if (hasPayment && (paidCents === null || paidCents > cents || !paymentDate || !payer || !method)) {
      setError('Completa il primo pagamento con un importo positivo non superiore alla spesa e un Proprietario pagatore.')
      return null
    }
    return {
      p_property_id: propertyId, p_rentable_space_id: null,
      p_category: category, p_description: description.trim(), p_competence_date: competenceDate,
      p_total_amount: cents / 100, p_allocation_mode: 'OWNERSHIP_QUOTAS',
      p_first_payment_amount: paidCents === null ? null : paidCents / 100,
      p_first_payment_date: hasPayment ? paymentDate : null,
      p_payer_owner_id: hasPayment ? payer : null, p_payment_method: hasPayment ? method : null,
      p_notes: notes.trim() || null, p_idempotency_key: crypto.randomUUID(),
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || submitting || confirmed || contextConflict || stored.error) return
    setError('')
    const request = prepareRequest()
    if (!request) return
    try { sessionStorage.setItem(storageKey, JSON.stringify(request)) }
    catch { setError('Impossibile conservare la richiesta in questa scheda. Nessuna spesa inviata.'); return }
    setPending(request)
    setSubmitting(true)
    try {
      const { data, error: createError } = await supabase.rpc('create_expense_with_allocations', request)
      if (createError) {
        setError(expenseErrorMessage(createError.message))
        if ((createError.code === 'P0001' && !createError.message.includes('IDEMPOTENCY_CONFLICT')) || createError.code === '23514') {
          sessionStorage.removeItem(storageKey)
          setPending(null)
        }
        return
      }
      setConfirmed(true)
      sessionStorage.removeItem(storageKey)
      setPending(null)
      onSaved(data.expense_id)
    } catch { setError('Risposta non ricevuta. Riprova la stessa registrazione per evitare duplicati.') }
    finally { setSubmitting(false) }
  }

  let submitLabel = 'Salva spesa'
  if (pending) submitLabel = 'Riprova registrazione'
  if (submitting) submitLabel = 'Salvataggio...'
  const canManageProperty = properties.some((property) => property.id === propertyId)

  return (
    <section className="full-page-editor">
      <header className="full-page-heading">
        <div><span className="eyebrow">SPESE IMMOBILE</span><h1>Nuova spesa</h1>{initialProperty && <p>{initialProperty.name}</p>}</div>
        <button className="secondary-button" type="button" disabled={submitting} onClick={onCancel}>Annulla</button>
      </header>
      {contextConflict && <p className="form-error" role="alert">Una spesa di un altro immobile attende conferma. Riprendila dalla sezione Spese prima di continuare.</p>}
      {pending && !contextConflict && <p className="billing-notice">Una spesa attende conferma. Il nuovo tentativo riutilizza la richiesta originale.</p>}
      <form className="contact-editor-form" onSubmit={handleSubmit}>
        <fieldset className="billing-payment-fields" disabled={locked || contextConflict || Boolean(stored.error)}>
          <div className="form-grid">
            <FormField label="Immobile" required>
              {initialProperty ? <input value={initialProperty.name} readOnly /> : <select value={propertyId} required disabled={loadingProperties}
                onChange={(event) => { setPropertyId(event.target.value); setPayer('') }}>
                <option value="">Seleziona immobile...</option>
                {properties.map((property) => <option key={property.id} value={property.id}>{property.name} - {property.internal_code}</option>)}
              </select>}
            </FormField>
            <FormField label="Categoria" required><select required value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">Seleziona...</option>{categories.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select></FormField>
            <FormField label="Data di competenza" required><input type="date" required value={competenceDate} onChange={(event) => { setCompetenceDate(event.target.value); setPayer('') }} /></FormField>
            <FormField label="Importo totale" required><input type="number" min="0.01" max="999999999999.99" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} /></FormField>
          </div>
          <FormField label="Descrizione" required><input required maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} /></FormField>
          <FormField label="Note"><textarea rows={3} maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} /></FormField>
          <p className="detail-muted">Ripartizione tra Proprietari secondo le quote valide alla data di competenza.</p>
          <label className="expense-payment-toggle"><input type="checkbox" checked={hasPayment} onChange={(event) => setHasPayment(event.target.checked)} />Registra anche un primo pagamento</label>
          {hasPayment && <div className="form-grid">
            <FormField label="Importo pagato" required><input type="number" min="0.01" max={amount || undefined} step="0.01" required value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></FormField>
            <FormField label="Data pagamento" required><input type="date" required value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></FormField>
            <FormField label="Proprietario pagatore" required><select required value={payer} disabled={loadingOwners} onChange={(event) => setPayer(event.target.value)}>
              <option value="">Seleziona...</option>{ownerships.map((owner) => <option key={owner.id} value={owner.owner_id}>{owner.owner_name}</option>)}
            </select></FormField>
            <FormField label="Metodo di pagamento" required><select required value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="">Seleziona...</option>{methods.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </select></FormField>
          </div>}
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-footer">
          <button className="primary-button" type="submit" disabled={submitting || confirmed || catalogLoading || loadingProperties || contextConflict || Boolean(stored.error) || (!pending && !canManageProperty)}>{submitLabel}</button>
          <button className="secondary-button" type="button" disabled={submitting} onClick={onCancel}>Annulla</button>
        </div>
      </form>
    </section>
  )
}