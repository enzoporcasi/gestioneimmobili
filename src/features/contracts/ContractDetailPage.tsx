import { useState } from 'react'
import type { ManageableContract } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { useReferenceCatalog, DetailItem, formatDate, formatCurrency, referenceCatalogLabel, contractRpcErrorMessage } from '../../app/shared'
import { useDocumentAttachments, DocumentAttachmentFields, cancelEditorWithAttachments } from '../documents/attachments'

export function ContractDetailPage({
  contract,
  onBack,
  onChanged,
}: {
  contract: ManageableContract
  onBack: () => void
  onChanged: () => Promise<void>
}) {
  const { items: catalogItems } = useReferenceCatalog()
  const attachments = useDocumentAttachments('CONTRACT')
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState(false)
  const [uploadingAttachments, setUploadingAttachments] = useState(false)
  const [attachmentMessage, setAttachmentMessage] = useState('')

  async function toggleStatus() {
    if (!supabase) {
      setError('Connessione al database non disponibile.')
      return
    }
    setUpdating(true)
    setError('')
    const { error: updateError } = await supabase.rpc('set_contract_management_status', {
      p_contract_id: contract.contract_id,
      p_management_status: contract.management_status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
    })
    setUpdating(false)
    if (updateError) {
      setError(contractRpcErrorMessage(updateError.message))
      console.error('Contract status update failed', updateError)
      return
    }
    await onChanged()
  }

  async function uploadAttachments() {
    setError('')
    setAttachmentMessage('')
    if (attachments.drafts.length === 0 || attachments.drafts.some((draft) => !draft.file)) {
      setError('Aggiungi almeno un documento e seleziona un file per ogni riga.')
      return
    }
    setUploadingAttachments(true)
    const uploaded = await attachments.uploadForEntity(contract.contract_id)
    setUploadingAttachments(false)
    if (!uploaded) {
      setError('Alcuni documenti non sono stati completati. Correggi o riprova le righe indicate.')
      return
    }
    const count = attachments.drafts.length
    attachments.clearUploadedDrafts()
    setAttachmentMessage(`${count} ${count === 1 ? 'documento caricato' : 'documenti caricati'}. In attesa delle verifiche di sicurezza.`)
  }

  return (
    <section className="full-page-editor">
      <header className="full-page-heading">
        <div>
          <span className="eyebrow">SCHEDA CONTRATTO</span>
          <h1>{contract.internal_code}</h1>
          <p>{contract.property_name} · {contract.tenant_name}</p>
        </div>
        <button
          className="secondary-button"
          disabled={uploadingAttachments}
          onClick={() => void cancelEditorWithAttachments(attachments, onBack, setError)}
          type="button"
        >
          Torna ai contratti
        </button>
      </header>
      <div className="detail-grid contract-detail-grid">
        <DetailItem label="Immobile" value={contract.property_name} />
        <DetailItem label="Oggetto" value={contract.object_type === 'WHOLE_PROPERTY' ? 'Intero immobile' : contract.rentable_space_names} />
        <DetailItem label="Tipo contratto" value={referenceCatalogLabel(catalogItems, 'contract_type', contract.contract_type)} />
        <DetailItem
          label="Canone concordato"
          value={contract.agreed_rent_applied ? 'Applicato' : 'Non applicato'}
        />
        <DetailItem
          label="Regime fiscale"
          value={
            contract.tax_regime === 'CEDOLARE_SECCA'
              ? 'Cedolare secca'
              : contract.tax_regime === 'ORDINARIO'
                ? 'Ordinario'
                : 'Non specificato'
          }
        />
        {contract.transitory_reason && (
          <DetailItem label="Esigenza transitoria" value={contract.transitory_reason} />
        )}
        <DetailItem label="Locatario" value={contract.tenant_name} />
        <DetailItem label="Email" value={contract.tenant_email || 'Non indicata'} />
        <DetailItem label="Cellulare" value={contract.tenant_phone || 'Non indicato'} />
        <DetailItem label="Decorrenza" value={formatDate(contract.start_date)} />
        <DetailItem label="Scadenza" value={formatDate(contract.end_date)} />
        <DetailItem label="Canone" value={`${formatCurrency(contract.base_rent_amount)} · ${referenceCatalogLabel(catalogItems, 'billing_frequency', contract.billing_frequency)}`} />
        <DetailItem label="Giorno di pagamento" value={`Entro il giorno ${contract.due_day} del periodo`} />
        <DetailItem label="Deposito cauzionale" value={contract.security_deposit_amount === null ? 'Non indicato' : formatCurrency(contract.security_deposit_amount)} />
        <DetailItem label="Stato gestionale" value={referenceCatalogLabel(catalogItems, 'contract_management_status', contract.management_status)} />
        <DetailItem label="Ciclo di vita" value={referenceCatalogLabel(catalogItems, 'contract_lifecycle_status', contract.lifecycle_status)} />
      </div>
      {contract.notes && (
        <section className="detail-section">
          <h3>Note</h3>
          <p className="detail-notes">{contract.notes}</p>
        </section>
      )}
      <section className="detail-section">
        <h3>Aggiungi documenti al contratto</h3>
        <DocumentAttachmentFields
          attachments={attachments}
          disabled={uploadingAttachments}
        />
        {attachmentMessage && <p className="document-success" role="status">{attachmentMessage}</p>}
        <button
          className="primary-button"
          disabled={uploadingAttachments || attachments.loading || attachments.drafts.length === 0}
          onClick={() => void uploadAttachments()}
          type="button"
        >
          {uploadingAttachments ? 'Caricamento…' : 'Carica documenti'}
        </button>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-footer">
        <button className="primary-button" disabled={updating} onClick={() => void toggleStatus()} type="button">
          {updating ? 'Aggiornamento…' : contract.management_status === 'ACTIVE' ? 'Disattiva contratto' : 'Attiva contratto'}
        </button>
        <button className="secondary-button" onClick={onBack} type="button">Torna ai contratti</button>
      </div>
      <p className="data-footnote">Le rate vengono generate esclusivamente per contratti attivi.</p>
    </section>
  )
}
