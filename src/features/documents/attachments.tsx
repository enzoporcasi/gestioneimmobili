import { useEffect, useState } from 'react'
import type { Json, DocumentCategoryOption } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { FormField } from '../../app/shared'

export type DocumentEntityType = 'OWNER' | 'PROPERTY' | 'TENANT' | 'CONTRACT'

export type DocumentUploadReservation = {
  document_id: string
  document_version_id: string
  bucket: string
  storage_path: string
}

export type DocumentAttachmentDraft = {
  id: string
  category: string
  file: File | null
  sensitivity: string
  reservation: DocumentUploadReservation | null
  status: 'ready' | 'uploading' | 'uploaded' | 'error'
  error: string
}

export type DocumentAttachmentState = {
  categories: DocumentCategoryOption[]
  drafts: DocumentAttachmentDraft[]
  loading: boolean
  error: string
  uploading: boolean
  addDraft: () => void
  updateCategory: (id: string, category: string) => void
  selectFile: (id: string, file: File | null) => Promise<void>
  removeDraft: (id: string) => void
  clearUploadedDrafts: () => void
  clearUnreservedDrafts: () => void
  cancelReservedUploads: () => Promise<boolean>
  uploadForEntity: (entityId: string) => Promise<boolean>
}

export function uploadReservation(data: Json | null): DocumentUploadReservation | null {
  if (
    typeof data !== 'object'
    || data === null
    || Array.isArray(data)
    || typeof data.document_id !== 'string'
    || typeof data.document_version_id !== 'string'
    || typeof data.bucket !== 'string'
    || typeof data.storage_path !== 'string'
  ) {
    return null
  }
  return {
    document_id: data.document_id,
    document_version_id: data.document_version_id,
    bucket: data.bucket,
    storage_path: data.storage_path,
  }
}

export async function supportedDocumentMimeType(file: File): Promise<string | null> {
  if (file.size <= 0 || file.size > 20 * 1024 * 1024) return null
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  if (header.length >= 5 && new TextDecoder().decode(header.slice(0, 5)) === '%PDF-') {
    return 'application/pdf'
  }
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    header.length >= 8
    && header[0] === 0x89
    && header[1] === 0x50
    && header[2] === 0x4e
    && header[3] === 0x47
    && header[4] === 0x0d
    && header[5] === 0x0a
    && header[6] === 0x1a
    && header[7] === 0x0a
  ) {
    return 'image/png'
  }
  return null
}

export function useDocumentAttachments(entityType: DocumentEntityType): DocumentAttachmentState {
  const [categories, setCategories] = useState<DocumentCategoryOption[]>([])
  const [drafts, setDrafts] = useState<DocumentAttachmentDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      setError('Connessione al database non disponibile.')
      return
    }
    let active = true
    setLoading(true)
    setError('')
    void supabase.rpc('list_document_categories', { p_entity_type: entityType }).then(({ data, error: categoryError }) => {
      if (!active) return
      if (categoryError) {
        setError('Non è stato possibile caricare le tipologie dei documenti.')
        console.error('Document category query failed', categoryError)
      } else {
        setCategories(data ?? [])
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [entityType])

  function addDraft() {
    const category = categories[0]
    if (!category) {
      setError('Non sono disponibili tipologie di documento per questa entità.')
      return
    }
    setDrafts((current) => [...current, {
      id: crypto.randomUUID(),
      category: category.code,
      file: null,
      sensitivity: category.minimum_sensitivity,
      reservation: null,
      status: 'ready',
      error: '',
    }])
    setError('')
  }

  function updateCategory(id: string, categoryCode: string) {
    const category = categories.find((item) => item.code === categoryCode)
    if (!category) return
    setDrafts((current) => current.map((draft) =>
      draft.id === id && !draft.reservation
        ? {
            ...draft,
            category: category.code,
            sensitivity: category.minimum_sensitivity,
            error: '',
          }
        : draft,
    ))
  }

  async function selectFile(id: string, file: File | null) {
    if (!file) return
    const mimeType = await supportedDocumentMimeType(file)
    if (!mimeType) {
      setDrafts((current) => current.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              file: null,
              status: 'error',
              error: file.size > 20 * 1024 * 1024
                ? 'Il file supera il limite di 20 MB.'
                : 'Formato non supportato: scegli un PDF, JPG o PNG valido.',
            }
          : draft,
      ))
      return
    }
    setDrafts((current) => current.map((draft) =>
      draft.id === id && !draft.reservation
        ? { ...draft, file, status: 'ready', error: '' }
        : draft,
    ))
  }

  function removeDraft(id: string) {
    setDrafts((current) => current.filter((draft) =>
      draft.id !== id || draft.reservation !== null || draft.status === 'uploaded',
    ))
  }

  function clearUploadedDrafts() {
    setDrafts((current) => current.filter((draft) => draft.status !== 'uploaded'))
  }

  function clearUnreservedDrafts() {
    setDrafts((current) => current.filter((draft) => draft.reservation !== null))
  }

  async function cancelReservedUploads(): Promise<boolean> {
    if (!supabase) {
      setError('Connessione al database non disponibile.')
      return false
    }

    const reservations = drafts.filter((draft) =>
      draft.reservation !== null && draft.status !== 'uploaded',
    )
    if (reservations.length === 0) return true

    setUploading(true)
    setError('')
    for (const draft of reservations) {
      const reservation = draft.reservation
      if (!reservation) continue
      const { error: cancelError } = await supabase.rpc('cancel_document_upload', {
        p_document_version_id: reservation.document_version_id,
      })
      if (cancelError) {
        console.error('Reserved document upload cancellation failed', cancelError)
        setError('Non è stato possibile annullare un caricamento incompleto. La schermata resta aperta: riprova.')
        setUploading(false)
        return false
      }
      setDrafts((current) => current.map((item) =>
        item.id === draft.id
          ? { ...item, reservation: null, status: 'ready', error: '' }
          : item,
      ))
    }
    setUploading(false)
    return true
  }

  async function uploadForEntity(entityId: string): Promise<boolean> {
    if (!supabase) {
      setError('Connessione al database non disponibile.')
      return false
    }
    setUploading(true)
    setError('')
    let success = true

    for (const draft of drafts) {
      if (draft.status === 'uploaded') continue
      if (!draft.file) {
        setDrafts((current) => current.map((item) =>
          item.id === draft.id ? { ...item, status: 'error', error: 'Seleziona un file oppure rimuovi questa riga.' } : item,
        ))
        success = false
        continue
      }

      let reservation = draft.reservation
      try {
      const mimeType = await supportedDocumentMimeType(draft.file)
      if (!mimeType) {
        setDrafts((current) => current.map((item) =>
          item.id === draft.id ? { ...item, status: 'error', error: 'Il file non è più valido o supera 20 MB.' } : item,
        ))
        success = false
        continue
      }

      setDrafts((current) => current.map((item) =>
        item.id === draft.id ? { ...item, status: 'uploading', error: '' } : item,
      ))

      if (!reservation) {
        const { data, error: reserveError } = await supabase.rpc('reserve_document_upload', {
          p_entity_type: entityType,
          p_entity_id: entityId,
          p_title: draft.file.name,
          p_category: draft.category,
          p_original_file_name: draft.file.name,
          p_declared_mime_type: mimeType,
          p_expected_size_bytes: draft.file.size,
          p_sensitivity: draft.sensitivity,
        })
        if (reserveError) {
          console.error('Document upload reservation failed', reserveError)
          setDrafts((current) => current.map((item) =>
            item.id === draft.id
              ? { ...item, status: 'error', error: 'Non è stato possibile preparare il caricamento. Riprova.' }
              : item,
          ))
          success = false
          continue
        }
        reservation = uploadReservation(data)
        if (!reservation) {
          console.error('Document upload reservation returned an invalid response', data)
          setDrafts((current) => current.map((item) =>
            item.id === draft.id
              ? { ...item, status: 'error', error: 'La risposta del server non è valida. Riprova.' }
              : item,
          ))
          success = false
          continue
        }
        setDrafts((current) => current.map((item) =>
          item.id === draft.id ? { ...item, reservation } : item,
        ))
      }

      const { error: storageError } = await supabase.storage
        .from(reservation.bucket)
        .upload(reservation.storage_path, draft.file, {
          contentType: mimeType,
          upsert: false,
        })

      let checksum: string | null = null
      if (globalThis.crypto?.subtle) {
        const fileBytes = await draft.file.arrayBuffer()
        const digest = await globalThis.crypto.subtle.digest('SHA-256', fileBytes)
        checksum = Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('')
      }

      const { data: finalizeData, error: finalizeError } = await supabase.rpc('finalize_document_upload', {
        p_document_version_id: reservation.document_version_id,
        p_actual_mime_type: mimeType,
        p_actual_size_bytes: draft.file.size,
        p_checksum: checksum,
      })
      if (finalizeError || typeof finalizeData !== 'object' || finalizeData === null
        || Array.isArray(finalizeData) || finalizeData.upload_status !== 'PENDING_SCAN') {
        if (storageError) console.error('Document Storage upload failed', storageError)
        if (finalizeError) console.error('Document upload finalization failed', finalizeError)
        setDrafts((current) => current.map((item) =>
          item.id === draft.id
            ? {
                ...item,
                status: 'error',
                reservation,
                error: 'Caricamento non completato. La registrazione è stata salvata; puoi riprovare.',
              }
            : item,
        ))
        success = false
        continue
      }

      setDrafts((current) => current.map((item) =>
        item.id === draft.id
          ? {
              ...item,
              status: 'uploaded',
              reservation,
              error: '',
            }
          : item,
      ))
      } catch (uploadError) {
        console.error('Unexpected document upload error', uploadError)
        setDrafts((current) => current.map((item) =>
          item.id === draft.id
            ? {
                ...item,
                status: 'error',
                reservation,
                error: 'Si è verificato un errore durante il caricamento. Riprova.',
              }
            : item,
        ))
        success = false
      }
    }

    setUploading(false)
    return success
  }

  return {
    categories,
    drafts,
    loading,
    error,
    uploading,
    addDraft,
    updateCategory,
    selectFile,
    removeDraft,
    clearUploadedDrafts,
    clearUnreservedDrafts,
    cancelReservedUploads,
    uploadForEntity,
  }
}

export async function cancelEditorWithAttachments(
  attachments: DocumentAttachmentState,
  onCancel: () => void,
  setEditorError: (message: string) => void,
) {
  const hasReservedUploads = attachments.drafts.some((draft) =>
    draft.reservation !== null && draft.status !== 'uploaded',
  )
  if (
    hasReservedUploads
    && !window.confirm('Ci sono caricamenti incompleti. Vuoi annullarli e uscire?')
  ) {
    return
  }
  if (!await attachments.cancelReservedUploads()) {
    setEditorError('Non è stato possibile annullare i caricamenti incompleti. Riprova prima di uscire.')
    return
  }
  onCancel()
}

export function formatFileSize(size: number | null) {
  if (size === null) return 'Dimensione non disponibile'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentAttachmentFields({
  attachments,
  disabled,
}: {
  attachments: DocumentAttachmentState
  disabled: boolean
}) {
  const canAdd = !attachments.loading && !attachments.error && attachments.categories.length > 0
  return (
    <div className="form-section">
      <h3>Documenti allegati</h3>
      <p>Facoltativi. PDF, JPG o PNG fino a 20 MB. I file vengono verificati prima di essere resi disponibili.</p>
      {attachments.loading && <p className="detail-muted">Caricamento tipologie documentali…</p>}
      {attachments.error && <p className="form-error" role="alert">{attachments.error}</p>}
      {attachments.drafts.map((draft, index) => (
        <div className="document-attachment-row" key={draft.id}>
          <FormField label="Tipologia" required>
            <select
              disabled={disabled || Boolean(draft.reservation) || draft.status === 'uploaded'}
              onChange={(event) => attachments.updateCategory(draft.id, event.target.value)}
              required
              value={draft.category}
            >
              {attachments.categories.map((category) => (
                <option key={category.code} value={category.code}>{category.label}</option>
              ))}
            </select>
          </FormField>
          <div className="document-file-actions">
            <span className="document-file-name">{draft.file?.name ?? 'Nessun file selezionato'}</span>
            <label className="secondary-button document-file-button">
              Seleziona file
              <input
                accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                aria-label={`Seleziona file per allegato ${index + 1}`}
                disabled={disabled || Boolean(draft.reservation) || draft.status === 'uploaded'}
                onChange={(event) => {
                  void attachments.selectFile(draft.id, event.currentTarget.files?.[0] ?? null)
                  event.currentTarget.value = ''
                }}
                type="file"
              />
            </label>
            <label className="secondary-button document-file-button">
              Scatta foto
              <input
                accept="image/jpeg,image/png"
                aria-label={`Scatta foto per allegato ${index + 1}`}
                capture="environment"
                disabled={disabled || Boolean(draft.reservation) || draft.status === 'uploaded'}
                onChange={(event) => {
                  void attachments.selectFile(draft.id, event.currentTarget.files?.[0] ?? null)
                  event.currentTarget.value = ''
                }}
                type="file"
              />
            </label>
            {draft.status === 'uploaded' ? (
              <span className="document-upload-status">Caricato · in attesa di scansione</span>
            ) : !draft.reservation ? (
              <button
                className="text-button"
                disabled={disabled}
                onClick={() => attachments.removeDraft(draft.id)}
                type="button"
              >
                Rimuovi
              </button>
            ) : null}
          </div>
          {draft.error && <p className="form-error document-upload-error" role="alert">{draft.error}</p>}
        </div>
      ))}
      <button
        className="secondary-button document-add-button"
        disabled={disabled || !canAdd}
        onClick={attachments.addDraft}
        type="button"
      >
        + Aggiungi documento
      </button>
      <p className="detail-muted">Per ora puoi scegliere file dal dispositivo o scattare una foto da mobile; le integrazioni dirette con i cloud arriveranno in una fase successiva.</p>
    </div>
  )
}
