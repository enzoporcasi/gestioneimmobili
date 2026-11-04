import { useEffect, useState } from 'react'
import type { BillingInstallment, BillingReceipt } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { DetailItem, formatCurrency, formatDate, LoadingScreen, referenceCatalogLabel, useReferenceCatalog } from '../../app/shared'
import { PaymentForm } from './PaymentForm'
import { installmentStatuses } from './model'

function hasPendingPayment(userId: string, installmentId: string) {
  try { return sessionStorage.getItem(`billing-payment:${userId}:${installmentId}`) !== null }
  catch { return false }
}

export function ReceiptTable({ receipts, onSelect }: Readonly<{
  receipts: BillingReceipt[]
  onSelect?: (id: string) => void
}>) {
  const { items } = useReferenceCatalog()
  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>DATA</th><th>CONTRATTO</th><th>IMPORTO</th><th>METODO</th><th>PAGATORE</th><th>STATO</th><th>NOTE</th>{onSelect && <th>RATA</th>}</tr></thead>
        <tbody>
          {receipts.map((receipt) => (
            <tr key={receipt.allocation_id}>
              <td>{formatDate(receipt.payment_date)}</td>
              <td>{receipt.contract_code}</td>
              <td className="billing-number">{formatCurrency(receipt.amount)}</td>
              <td>{receipt.payment_method ? referenceCatalogLabel(items, 'payment_method', receipt.payment_method) : 'Non indicato'}</td>
              <td>{receipt.payer_name || 'Non indicato'}</td>
              <td>{receipt.status === 'RECORDED' ? 'Registrato' : 'Stornato'}</td>
              <td className="billing-note">{receipt.notes || '-'}</td>
              {onSelect && <td><button className="text-button" type="button" onClick={() => onSelect(receipt.installment_id)}>Dettaglio</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function InstallmentDetailPage({ installmentId, userId, onBack }: Readonly<{
  installmentId: string
  userId: string
  onBack: () => void
}>) {
  const [installment, setInstallment] = useState<BillingInstallment | null>(null)
  const [receipts, setReceipts] = useState<BillingReceipt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!supabase) return
    let active = true
    setLoading(true)
    setError('')
    void Promise.all([
      supabase.from('v_billing_installments').select('*').eq('id', installmentId).single(),
      supabase.from('v_billing_receipts').select('*').eq('installment_id', installmentId).order('payment_date', { ascending: false }).order('created_at', { ascending: false }),
    ]).then(([installmentResult, receiptResult]) => {
      if (!active) return
      if (installmentResult.error || receiptResult.error) {
        setError('Impossibile caricare rata e incassi. Verifica i permessi e riprova.')
        setInstallment(null)
      } else {
        setInstallment(installmentResult.data)
        setReceipts(receiptResult.data ?? [])
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [installmentId, revision])

  let body = <LoadingScreen label="Caricamento rata..." />
  if (!loading && installment) {
    const payable = installment.active_residual > 0 && !['LOST', 'NOT_DUE', 'CANCELLED'].includes(installment.calculated_status)
    body = (
      <>
        <div className="detail-grid">
          <DetailItem label="Immobile" value={installment.property_name} />
          <DetailItem label="Contratto" value={installment.contract_code} />
          <DetailItem label="Locatario" value={installment.tenant_name || 'Non indicato'} />
          <DetailItem label="Periodo" value={`${formatDate(installment.period_start)} - ${formatDate(installment.period_end)}`} />
          <DetailItem label="Scadenza" value={formatDate(installment.due_date)} />
          <DetailItem label="Stato" value={installmentStatuses[installment.calculated_status] ?? installment.calculated_status} />
          <DetailItem label="Dovuto" value={formatCurrency(installment.amount_due)} />
          <DetailItem label="Incassato" value={formatCurrency(installment.amount_received)} />
          <DetailItem label="Residuo" value={formatCurrency(installment.active_residual)} />
          {installment.amount_lost > 0 && <DetailItem label="Importo perso" value={formatCurrency(installment.amount_lost)} />}
        </div>
        <section className="detail-section">
          <h2>Storico incassi</h2>
          {receipts.length > 0 && <ReceiptTable receipts={receipts} />}
          {receipts.length === 0 && <p className="detail-muted">Nessun incasso registrato per questa rata.</p>}
        </section>
        {installment.can_record_payment && (payable || hasPendingPayment(userId, installment.id)) && (
          <PaymentForm key={`${installment.id}-${installment.active_residual}`} installment={installment} userId={userId} onSaved={() => {
            setMessage('Incasso registrato correttamente.')
            setRevision((value) => value + 1)
          }} />
        )}
      </>
    )
  }
  if (!loading && error) {
    body = <div className="inline-error" role="alert">{error}<button className="secondary-button" type="button" onClick={() => setRevision((value) => value + 1)}>Riprova</button></div>
  }

  return (
    <section className="full-page-editor billing-detail">
      <header className="full-page-heading">
        <div><span className="eyebrow">CANONI E INCASSI</span><h1>Dettaglio rata</h1></div>
        <button className="secondary-button" type="button" onClick={onBack}>Torna all'elenco</button>
      </header>
      {message && <p className="form-success"><output>{message}</output></p>}
      {body}
    </section>
  )
}