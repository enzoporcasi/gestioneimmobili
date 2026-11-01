import { useEffect, useState } from 'react'
import type { ManageableDocument, ManageableDocumentEntity } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { FormField, LoadingScreen } from '../../app/shared'
import { useDocumentAttachments, DocumentAttachmentFields, formatFileSize, type DocumentEntityType } from './attachments'

export function DocumentsManagementPanel() {
  const [entityType, setEntityType] = useState<DocumentEntityType>('PROPERTY')
  const [entityId, setEntityId] = useState('')
  const [entities, setEntities] = useState<ManageableDocumentEntity[]>([])
  const [documents, setDocuments] = useState<ManageableDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const attachments = useDocumentAttachments(entityType)

  async function loadDocuments() {
    if (!supabase) {
      setError('Connessione al database non disponibile.')
      setLoading(false)
      return
    }
    setError('')
    const [entityResult, documentResult] = await Promise.all([
      supabase.rpc('list_manageable_document_entities'),
      supabase.rpc('list_manageable_documents'),
    ])
    const errors = [entityResult.error, documentResult.error].filter(Boolean)
    if (errors.length > 0) {
      setError('Non è stato possibile caricare entità e documenti.')
      console.error('Document workspace queries failed', errors)
    } else {
      setEntities(entityResult.data ?? [])
      setDocuments(documentResult.data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadDocuments()
  }, [])

  useEffect(() => {
    setEntityId('')
    setMessage('')
  }, [entityType])

  async function handleUpload() {
    setError('')
    setMessage('')
    if (!entityId) {
      setError('Seleziona l’entità a cui collegare i documenti.')
      return
    }
    if (attachments.drafts.length === 0 || attachments.drafts.some((draft) => !draft.file)) {
      setError('Aggiungi almeno un documento e seleziona un file per ogni riga.')
      return
    }
    setUploading(true)
    const uploaded = await attachments.uploadForEntity(entityId)
    setUploading(false)
    if (!uploaded) {
      setError('Alcuni documenti non sono stati completati. Correggi o riprova le righe indicate.')
      return
    }
    const count = attachments.drafts.length
    attachments.clearUploadedDrafts()
    setMessage(`${count} ${count === 1 ? 'documento caricato' : 'documenti caricati'}. In attesa delle verifiche di sicurezza.`)
    await loadDocuments()
  }

  async function clearDocumentSelection() {
    const hasReservedUploads = attachments.drafts.some((draft) =>
      draft.reservation !== null && draft.status !== 'uploaded',
    )
    if (
      hasReservedUploads
      && !window.confirm('Ci sono caricamenti incompleti. Vuoi annullarli e pulire la selezione?')
    ) {
      return
    }
    if (!await attachments.cancelReservedUploads()) {
      setError('Non è stato possibile annullare i caricamenti incompleti.')
      return
    }
    attachments.clearUnreservedDrafts()
  }

  async function openDocument(document: ManageableDocument) {
    if (!supabase) {
      setError('Connessione al database non disponibile.')
      return
    }
    const popup = window.open('about:blank', '_blank')
    if (!popup) {
      setError('Il browser ha bloccato l’apertura del documento. Consenti i popup e riprova.')
      return
    }
    popup.opener = null
    const { data, error: downloadError } = await supabase.functions.invoke(
      'create-document-download-url',
      { body: { document_version_id: document.document_version_id } },
    )
    if (downloadError || typeof data?.signed_url !== 'string') {
      popup.close()
      setError('Il documento non è disponibile per il download.')
      console.error('Document download URL request failed', downloadError)
      return
    }
    let signedUrl: URL
    try {
      signedUrl = new URL(data.signed_url)
    } catch (urlError) {
      popup.close()
      setError('Il server ha restituito un collegamento non valido.')
      console.error('Document download URL is invalid', urlError)
      return
    }
    if (!['https:', 'http:'].includes(signedUrl.protocol)) {
      popup.close()
      setError('Il server ha restituito un collegamento non sicuro.')
      return
    }
    popup.location.href = signedUrl.toString()
  }

  const entityTypeLabels: Record<DocumentEntityType, string> = {
    OWNER: 'Proprietario',
    PROPERTY: 'Immobile',
    TENANT: 'Locatario',
    CONTRACT: 'Contratto',
  }
  const visibleEntities = entities.filter((entity) => entity.entity_type === entityType)
  const hasPendingDocuments = attachments.drafts.some((draft) => draft.status === 'error')

  return (
    <div className="document-workspace">
      <section className="content-card">
        <div className="card-heading">
          <div>
            <h2>Allega documenti</h2>
            <p>Collega i file a un’entità già presente nel tuo perimetro di gestione.</p>
          </div>
        </div>
        <div className="document-entity-selector">
          <FormField label="Tipo di entità" required>
            <select
              disabled={attachments.drafts.length > 0 || uploading}
              onChange={(event) => setEntityType(event.target.value as DocumentEntityType)}
              value={entityType}
            >
              {(Object.keys(entityTypeLabels) as DocumentEntityType[]).map((type) => (
                <option key={type} value={type}>{entityTypeLabels[type]}</option>
              ))}
            </select>
          </FormField>
          <FormField label={entityTypeLabels[entityType]} required>
            <select
              disabled={loading || visibleEntities.length === 0 || attachments.drafts.length > 0 || uploading}
              onChange={(event) => setEntityId(event.target.value)}
              required
              value={entityId}
            >
              <option value="">Seleziona…</option>
              {visibleEntities.map((entity) => (
                <option key={entity.entity_id} value={entity.entity_id}>{entity.display_name}</option>
              ))}
            </select>
          </FormField>
        </div>
        {loading ? (
          <LoadingScreen label="Caricamento entità e documenti…" compact />
        ) : visibleEntities.length === 0 ? (
          <p className="detail-muted">Non hai entità di questo tipo nel tuo perimetro Manager.</p>
        ) : null}
        <DocumentAttachmentFields
          attachments={attachments}
          disabled={uploading || !entityId}
        />
        {(error || attachments.error) && (
          <p className="form-error" role="alert">{error || attachments.error}</p>
        )}
        {message && <p className="document-success" role="status">{message}</p>}
        <div className="dialog-footer">
          <button
            className="primary-button"
            disabled={uploading || !entityId || attachments.drafts.length === 0 || attachments.loading}
            onClick={() => void handleUpload()}
            type="button"
          >
            {uploading ? 'Caricamento…' : hasPendingDocuments ? 'Riprova caricamenti' : 'Carica documenti'}
          </button>
          <button
            className="secondary-button"
            disabled={uploading}
            onClick={() => void clearDocumentSelection()}
            type="button"
          >
            Pulisci selezione
          </button>
          <button className="secondary-button" disabled={loading} onClick={() => void loadDocuments()} type="button">
            Aggiorna elenco
          </button>
        </div>
      </section>

      <section className="content-card">
        <div className="card-heading">
          <div>
            <h2>Documenti registrati</h2>
            <p>{documents.length} {documents.length === 1 ? 'documento' : 'documenti'} visibili nel tuo perimetro.</p>
          </div>
        </div>
        {error && documents.length === 0 ? (
          <div className="inline-error" role="alert">{error}</div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">▧</div>
            <h3>Nessun documento ancora</h3>
            <p>Quando alleghi un file a un Proprietario, Immobile, Locatario o Contratto, lo troverai qui.</p>
          </div>
        ) : (
          <div className="document-list">
            {documents.map((document) => {
              const isAvailable = document.upload_status === 'AVAILABLE'
                && document.malware_scan_status === 'CLEAN'
              return (
                <article className="document-list-item" key={`${document.document_id}-${document.entity_type}-${document.entity_id}`}>
                  <div className="document-list-copy">
                    <strong>{document.category_label ?? document.category}</strong>
                    <span>{entityTypeLabels[document.entity_type]} · {document.entity_label}</span>
                    <span>{document.original_file_name} · {formatFileSize(document.size_bytes)}</span>
                  </div>
                  <div className="document-list-actions">
                    <span className={`document-status-badge${isAvailable ? ' document-status-ready' : ''}`}>
                      {isAvailable
                        ? 'Verificato'
                        : document.upload_status === 'PENDING_SCAN'
                          ? 'In verifica'
                          : document.upload_status === 'RESERVED'
                            ? 'Upload incompleto'
                            : document.upload_status}
                    </span>
                    {isAvailable && (
                      <button className="secondary-button" onClick={() => void openDocument(document)} type="button">
                        Scarica
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
        <p className="detail-muted">I documenti restano privati e sono scaricabili solo dopo la scansione di sicurezza.</p>
      </section>
    </div>
  )
}
