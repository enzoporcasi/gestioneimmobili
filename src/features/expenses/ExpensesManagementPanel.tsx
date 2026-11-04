import { useEffect, useState } from 'react'
import type { ExpenseAllocation, ExpensePayment, ExpenseProperty, ExpenseRow } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { DetailItem, FormField, formatCurrency, formatDate, LoadingScreen, referenceCatalogItems, referenceCatalogLabel, useReferenceCatalog } from '../../app/shared'
import { ExpenseEditor } from './ExpenseEditor'

function ExpenseDetail({ expenseId, onBack }: Readonly<{ expenseId: string; onBack: () => void }>) {
  const { items } = useReferenceCatalog()
  const [expense, setExpense] = useState<ExpenseRow | null>(null)
  const [allocations, setAllocations] = useState<ExpenseAllocation[]>([])
  const [payments, setPayments] = useState<ExpensePayment[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!supabase) return
    let active = true
    setLoading(true)
    setError('')
    void Promise.all([
      supabase.from('v_expenses_workspace').select('*').eq('id', expenseId).single(),
      supabase.from('v_expense_allocations').select('*').eq('expense_id', expenseId).order('owner_name'),
      supabase.from('v_expense_payments').select('*').eq('expense_id', expenseId).order('payment_date', { ascending: false }),
    ]).then(([expenseResult, allocationResult, paymentResult]) => {
      if (!active) return
      if (expenseResult.error || allocationResult.error || paymentResult.error) setError('Impossibile caricare il dettaglio della spesa.')
      else { setExpense(expenseResult.data); setAllocations(allocationResult.data ?? []); setPayments(paymentResult.data ?? []) }
      setLoading(false)
    })
    return () => { active = false }
  }, [expenseId, revision])
  return (
    <section className="full-page-editor">
      <header className="full-page-heading"><div><span className="eyebrow">SPESE IMMOBILE</span><h1>Dettaglio spesa</h1></div><button className="secondary-button" type="button" onClick={onBack}>Torna alle spese</button></header>
      {loading && <LoadingScreen label="Caricamento spesa..." />}
      {error && <p className="form-error" role="alert">{error}<button className="secondary-button" type="button" onClick={() => setRevision((value) => value + 1)}>Riprova</button></p>}
      {!loading && !error && expense && <>
        <div className="detail-grid">
          <DetailItem label="Immobile" value={expense.property_name} />
          <DetailItem label="Categoria" value={referenceCatalogLabel(items, 'expense_category', expense.category)} />
          <DetailItem label="Competenza" value={formatDate(expense.competence_date)} />
          <DetailItem label="Importo totale" value={formatCurrency(expense.total_amount)} />
          <DetailItem label="Stato" value={referenceCatalogLabel(items, 'expense_status', expense.status)} />
          <DetailItem label="Ripartizione" value={referenceCatalogLabel(items, 'expense_allocation_mode', expense.allocation_mode)} />
        </div>
        <section className="detail-section"><h2>Descrizione</h2><p className="detail-notes">{expense.description}</p>{expense.notes && <p className="detail-notes">{expense.notes}</p>}</section>
        <section className="detail-section"><h2>Competenze visibili</h2>
          <div className="table-scroll"><table><thead><tr><th>PROPRIETARIO</th><th>QUOTA</th><th>IMPORTO</th></tr></thead><tbody>
            {allocations.map((allocation) => <tr key={allocation.id}><td>{allocation.owner_name}</td><td>{allocation.percentage === null ? '-' : `${allocation.percentage}%`}</td><td>{formatCurrency(allocation.allocated_amount)}</td></tr>)}
          </tbody></table></div>
          {allocations.length === 0 && <p className="detail-muted">Nessuna competenza visibile nel tuo perimetro.</p>}
        </section>
        <section className="detail-section"><h2>Pagamenti visibili</h2>
          <div className="table-scroll"><table><thead><tr><th>DATA</th><th>PAGATORE</th><th>IMPORTO</th><th>METODO</th><th>STATO</th></tr></thead><tbody>
            {payments.map((payment) => <tr key={payment.id}><td>{formatDate(payment.payment_date)}</td><td>{payment.payer_name || '-'}</td><td>{formatCurrency(payment.amount)}</td><td>{payment.payment_method ? referenceCatalogLabel(items, 'payment_method', payment.payment_method) : '-'}</td><td>{referenceCatalogLabel(items, 'expense_payment_status', payment.status)}</td></tr>)}
          </tbody></table></div>
          {payments.length === 0 && <p className="detail-muted">Nessun pagamento visibile.</p>}
        </section>
      </>}
    </section>
  )
}

export function ExpensesManagementPanel({ userId, onFullPageChange }: Readonly<{
  userId: string
  onFullPageChange: (open: boolean) => void
}>) {
  const { items } = useReferenceCatalog()
  const [properties, setProperties] = useState<ExpenseProperty[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [propertyId, setPropertyId] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  const [flow, setFlow] = useState<'list' | 'create' | 'detail'>('list')
  const [selectedId, setSelectedId] = useState('')
  const pageSize = 25

  useEffect(() => () => onFullPageChange(false), [onFullPageChange])
  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.from('v_expense_properties').select('*').order('name').then(({ data, error: propertyError }) => {
      if (!active) return
      if (propertyError) setError('Impossibile caricare gli immobili visibili.')
      else setProperties(data ?? [])
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!supabase) return
    let active = true
    setLoading(true)
    setError('')
    let query = supabase.from('v_expenses_workspace').select('*', { count: 'exact' })
      .order('competence_date', { ascending: false }).order('id').range(page * pageSize, (page + 1) * pageSize - 1)
    if (propertyId) query = query.eq('property_id', propertyId)
    if (category) query = query.eq('category', category)
    if (status) query = query.eq('status', status)
    void query.then(({ data, count: resultCount, error: queryError }) => {
      if (!active) return
      if (queryError) { setError('Impossibile caricare le spese. Riprova.'); setExpenses([]); setCount(0) }
      else { setExpenses(data ?? []); setCount(resultCount ?? 0) }
      setLoading(false)
    })
    return () => { active = false }
  }, [propertyId, category, status, page, revision])

  function showList() { setFlow('list'); onFullPageChange(false); setRevision((value) => value + 1) }
  if (flow === 'create') return <ExpenseEditor userId={userId} onCancel={showList} onSaved={(id) => {
    setSelectedId(id); setFlow('detail'); setMessage('Spesa registrata correttamente.')
  }} />
  if (flow === 'detail') return <>{message && <p className="form-success"><output>{message}</output></p>}<ExpenseDetail expenseId={selectedId} onBack={showList} /></>

  return (
    <section className="expense-workspace">
      <div className="billing-toolbar"><h2>Elenco spese</h2><div className="card-actions">
        <button className="secondary-button" type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)}>Aggiorna elenco</button>
        {properties.some((property) => property.can_manage) && <button className="primary-button" type="button" onClick={() => { setFlow('create'); setMessage(''); onFullPageChange(true) }}>Nuova spesa</button>}
      </div></div>
      <div className="billing-filters">
        <FormField label="Immobile"><select value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setPage(0) }}><option value="">Tutti gli immobili</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></FormField>
        <FormField label="Categoria"><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(0) }}><option value="">Tutte le categorie</option>{referenceCatalogItems(items, 'expense_category').map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></FormField>
        <FormField label="Stato"><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }}><option value="">Tutti gli stati</option>{referenceCatalogItems(items, 'expense_status').map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></FormField>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <LoadingScreen label="Caricamento spese..." compact />}
      {!loading && expenses.length === 0 && <div className="empty-state"><h3>Nessuna spesa</h3><p>Nessuna spesa corrisponde ai filtri selezionati.</p></div>}
      {!loading && expenses.length > 0 && <div className="table-scroll"><table>
        <thead><tr><th>COMPETENZA</th><th>IMMOBILE</th><th>CATEGORIA</th><th>DESCRIZIONE</th><th>IMPORTO</th><th>STATO</th><th>AZIONI</th></tr></thead>
        <tbody>{expenses.map((expense) => <tr key={expense.id}>
          <td>{formatDate(expense.competence_date)}</td><td>{expense.property_name}</td><td>{referenceCatalogLabel(items, 'expense_category', expense.category)}</td><td className="billing-note">{expense.description}</td><td className="billing-number">{formatCurrency(expense.total_amount)}</td><td>{referenceCatalogLabel(items, 'expense_status', expense.status)}</td>
          <td><button className="text-button" type="button" onClick={() => { setSelectedId(expense.id); setMessage(''); setFlow('detail'); onFullPageChange(true) }}>Dettaglio</button></td>
        </tr>)}</tbody>
      </table></div>}
      <div className="billing-pagination"><span>{count} spese - Pagina {page + 1} di {Math.max(1, Math.ceil(count / pageSize))}</span><div className="card-actions">
        <button className="secondary-button" type="button" disabled={loading || page === 0} onClick={() => setPage((value) => value - 1)}>Precedente</button>
        <button className="secondary-button" type="button" disabled={loading || (page + 1) * pageSize >= count} onClick={() => setPage((value) => value + 1)}>Successiva</button>
      </div></div>
    </section>
  )
}