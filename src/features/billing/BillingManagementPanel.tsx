import { useEffect, useState } from 'react'
import type { BillingContract, BillingInstallment, BillingReceipt, PropertyRow } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { FormField, formatCurrency, formatDate, LoadingScreen } from '../../app/shared'
import { InstallmentDetailPage, ReceiptTable } from './InstallmentDetailPage'
import { billingErrorMessage, installmentStatuses } from './model'

type BillingTab = 'installments' | 'receipts'
type Filters = { property: string; contract: string; status: string; from: string; to: string }
const PAGE_SIZE = 25

function InstallmentTable({ rows, onSelect }: Readonly<{ rows: BillingInstallment[]; onSelect: (id: string) => void }>) {
  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>SCADENZA</th><th>IMMOBILE / CONTRATTO</th><th>PERIODO</th><th>DOVUTO</th><th>INCASSATO</th><th>RESIDUO</th><th>STATO</th><th>AZIONI</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.due_date)}</td>
              <td><strong>{row.property_name}</strong><span className="billing-secondary">{row.contract_code} - {row.tenant_name || 'Locatario non indicato'}</span></td>
              <td>{formatDate(row.period_start)} - {formatDate(row.period_end)}</td>
              <td className="billing-number">{formatCurrency(row.amount_due)}</td>
              <td className="billing-number">{formatCurrency(row.amount_received)}</td>
              <td className="billing-number">{formatCurrency(row.active_residual)}</td>
              <td><span className="billing-status" data-status={row.calculated_status}>{installmentStatuses[row.calculated_status] ?? row.calculated_status}</span></td>
              <td><button className="text-button" type="button" onClick={() => onSelect(row.id)}>Dettaglio</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BillingFilters({ tab, filters, contracts, properties, onChange }: Readonly<{
  tab: BillingTab
  filters: Filters
  contracts: BillingContract[]
  properties: PropertyRow[]
  onChange: (key: keyof Filters, value: string) => void
}>) {
  let statuses = Object.entries(installmentStatuses)
  if (tab === 'receipts') statuses = [['RECORDED', 'Registrato'], ['REVERSED', 'Stornato']]
  const dateLabel = tab === 'installments' ? 'Scadenza' : 'Pagamento'
  return (
    <div className="billing-filters">
      <FormField label="Immobile"><select value={filters.property} onChange={(event) => onChange('property', event.target.value)}>
        <option value="">Tutti gli immobili</option>
        {properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
      </select></FormField>
      <FormField label="Contratto"><select value={filters.contract} onChange={(event) => onChange('contract', event.target.value)}>
        <option value="">Tutti i contratti</option>
        {contracts.filter((contract) => !filters.property || contract.property_id === filters.property).map((contract) => (
          <option key={contract.id} value={contract.internal_code}>{contract.internal_code}</option>
        ))}
      </select></FormField>
      <FormField label="Stato"><select value={filters.status} onChange={(event) => onChange('status', event.target.value)}>
        <option value="">Tutti gli stati</option>
        {tab === 'installments' && <option value="OPEN">Con residuo da incassare</option>}
        {statuses.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select></FormField>
      <FormField label={`${dateLabel} dal`}><input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => onChange('from', event.target.value)} /></FormField>
      <FormField label={`${dateLabel} al`}><input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => onChange('to', event.target.value)} /></FormField>
    </div>
  )
}

function BillingTotals({ tab, installments, receipts }: Readonly<{
  tab: BillingTab
  installments: BillingInstallment[]
  receipts: BillingReceipt[]
}>) {
  let totals: Array<[string, number]> = [
    ['Dovuto', installments.reduce((sum, row) => sum + row.amount_due, 0)],
    ['Incassato', installments.reduce((sum, row) => sum + row.amount_received, 0)],
    ['Residuo attivo', installments.filter((row) => !['LOST', 'NOT_DUE', 'CANCELLED'].includes(row.calculated_status)).reduce((sum, row) => sum + row.active_residual, 0)],
  ]
  if (tab === 'receipts') totals = [
    ['Incassi registrati', receipts.filter((row) => row.status === 'RECORDED').reduce((sum, row) => sum + row.amount, 0)],
    ['Incassi stornati', receipts.filter((row) => row.status === 'REVERSED').reduce((sum, row) => sum + row.amount, 0)],
  ]
  return <dl className="billing-totals" aria-label="Importi della pagina corrente">{totals.map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{formatCurrency(amount)}</dd></div>)}</dl>
}

export function BillingManagementPanel({ properties, userId, onFullPageChange }: Readonly<{
  properties: PropertyRow[]
  userId: string
  onFullPageChange: (open: boolean) => void
}>) {
  const [tab, setTab] = useState<BillingTab>('installments')
  const [filters, setFilters] = useState<Filters>({ property: '', contract: '', status: 'OPEN', from: '', to: '' })
  const [page, setPage] = useState(0)
  const [contracts, setContracts] = useState<BillingContract[]>([])
  const [installments, setInstallments] = useState<BillingInstallment[]>([])
  const [receipts, setReceipts] = useState<BillingReceipt[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.from('v_billing_contracts').select('*').order('internal_code').then(({ data, error: contractError }) => {
      if (!active) return
      if (contractError) setError('Impossibile caricare i contratti disponibili.')
      else setContracts(data ?? [])
    })
    return () => { active = false }
  }, [revision])

  useEffect(() => () => onFullPageChange(false), [onFullPageChange])

  useEffect(() => {
    if (!supabase) return
    if (filters.from && filters.to && filters.from > filters.to) {
      setError('La data iniziale deve precedere quella finale.')
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError('')
    const dateColumn = tab === 'installments' ? 'due_date' : 'payment_date'
    const orderColumn = tab === 'installments' ? 'id' : 'allocation_id'
    let query = supabase.from(tab === 'installments' ? 'v_billing_installments' : 'v_billing_receipts')
      .select('*', { count: 'exact' }).order(dateColumn, { ascending: tab === 'installments' }).order(orderColumn)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (filters.property) query = query.eq('property_id', filters.property)
    if (filters.contract) query = query.eq('contract_code', filters.contract)
    if (filters.from) query = query.gte(dateColumn, filters.from)
    if (filters.to) query = query.lte(dateColumn, filters.to)
    if (filters.status === 'OPEN') query = query.gt('active_residual', 0).not('calculated_status', 'in', '(LOST,NOT_DUE,CANCELLED)')
    else if (filters.status) query = query.filter(tab === 'installments' ? 'calculated_status' : 'status', 'eq', filters.status)
    void query.then(({ data, count: resultCount, error: queryError }) => {
      if (!active) return
      if (queryError) {
        setError('Impossibile caricare canoni e incassi. Riprova.')
        setInstallments([])
        setReceipts([])
        setCount(0)
      } else {
        if (tab === 'installments') setInstallments((data ?? []) as BillingInstallment[])
        else setReceipts((data ?? []) as BillingReceipt[])
        setCount(resultCount ?? 0)
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [tab, filters, page, revision])

  function changeFilter(key: keyof Filters, value: string) {
    setFilters((current) => {
      const next = { ...current, [key]: value }
      if (key === 'property') next.contract = ''
      return next
    })
    setPage(0)
  }

  function changeTab(next: BillingTab) {
    setTab(next)
    setFilters((current) => ({ ...current, status: next === 'installments' ? 'OPEN' : 'RECORDED' }))
    setPage(0)
    setMessage('')
  }

  function openDetail(id: string) {
    setSelectedId(id)
    onFullPageChange(true)
  }

  const selectedContract = contracts.find((contract) => contract.internal_code === filters.contract)
  async function generateInstallments() {
    if (!supabase || !selectedContract || generating) return
    setGenerating(true)
    setError('')
    setMessage('')
    try {
      const { data, error: generationError } = await supabase.rpc('generate_contract_installments', { p_contract_id: selectedContract.id })
      if (generationError) { setError(billingErrorMessage(generationError.message)); return }
      setMessage(`Rate generate: ${data.installments_created}.`)
      setRevision((value) => value + 1)
      setPage(0)
    } catch { setError('Generazione non confermata. Puoi riprovare senza creare rate duplicate.') }
    finally { setGenerating(false) }
  }

  if (selectedId) return <InstallmentDetailPage installmentId={selectedId} userId={userId} onBack={() => {
    setSelectedId(null)
    onFullPageChange(false)
    setRevision((value) => value + 1)
  }} />

  let table = <InstallmentTable rows={installments} onSelect={openDetail} />
  if (tab === 'receipts') table = <ReceiptTable receipts={receipts} onSelect={openDetail} />
  if (count === 0) table = <div className="empty-state"><h3>Nessun risultato</h3><p>Nessun movimento corrisponde ai filtri selezionati.</p></div>
  if (loading) table = <LoadingScreen label="Caricamento canoni e incassi..." compact />

  return (
    <section className="billing-workspace">
      <div className="billing-toolbar">
        <div className="owner-type-switch" aria-label="Vista economica">
          <button type="button" aria-pressed={tab === 'installments'} className={tab === 'installments' ? 'owner-type-active' : ''} onClick={() => changeTab('installments')}>Rate</button>
          <button type="button" aria-pressed={tab === 'receipts'} className={tab === 'receipts' ? 'owner-type-active' : ''} onClick={() => changeTab('receipts')}>Incassi</button>
        </div>
        <div className="card-actions">
          <button className="secondary-button" type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)}>Aggiorna elenco</button>
          {tab === 'installments' && contracts.some((contract) => contract.can_generate) && <button className="primary-button" type="button"
            disabled={generating || !selectedContract?.can_generate || selectedContract.management_status !== 'ACTIVE'}
            title="Genera le rate maturate fino a oggi per il contratto selezionato"
            onClick={() => void generateInstallments()}>{generating ? 'Generazione...' : 'Genera rate maturate'}</button>}
        </div>
      </div>
      <BillingFilters tab={tab} filters={filters} contracts={contracts} properties={properties} onChange={changeFilter} />
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success"><output>{message}</output></p>}
      {!loading && <><BillingTotals tab={tab} installments={installments} receipts={receipts} /><p className="billing-scope">Importi della pagina corrente</p></>}
      {table}
      <div className="billing-pagination">
        <span>{count} risultati - Pagina {page + 1} di {Math.max(1, Math.ceil(count / PAGE_SIZE))}</span>
        <div className="card-actions">
          <button className="secondary-button" type="button" disabled={loading || page === 0} onClick={() => setPage((value) => value - 1)}>Precedente</button>
          <button className="secondary-button" type="button" disabled={loading || (page + 1) * PAGE_SIZE >= count} onClick={() => setPage((value) => value + 1)}>Successiva</button>
        </div>
      </div>
    </section>
  )
}