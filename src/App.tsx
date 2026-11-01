import {
  createContext,
  useEffect,
  useMemo,
  useState,
  useContext,
  type FormEvent,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type {
  Json,
  ManageableContract,
  ManageableDocument,
  ManageableDocumentEntity,
  ManageableProperty,
  ManageableRentableSpace,
  ManageableTenant,
  ManageableOwner,
  DocumentCategoryOption,
  OwnerListRow,
  OwnerSummary,
  PropertyOwnershipRow,
  PropertyRow,
  ReferenceCatalogItem,
} from './lib/database.types'

type Page = 'overview' | 'properties' | 'owners' | 'contracts' | 'tenants' | 'documents'

const unavailableSections = [
  'Canoni e incassi',
  'Spese',
  'Scadenze',
]

type ReferenceCatalogState = {
  items: ReferenceCatalogItem[]
  loading: boolean
  error: string
}

type DocumentEntityType = 'OWNER' | 'PROPERTY' | 'TENANT' | 'CONTRACT'

type DocumentUploadReservation = {
  document_id: string
  document_version_id: string
  bucket: string
  storage_path: string
}

type DocumentAttachmentDraft = {
  id: string
  category: string
  file: File | null
  sensitivity: string
  reservation: DocumentUploadReservation | null
  status: 'ready' | 'uploading' | 'uploaded' | 'error'
  error: string
}

type DocumentAttachmentState = {
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

const ReferenceCatalogContext = createContext<ReferenceCatalogState>({
  items: [],
  loading: true,
  error: '',
})

function useReferenceCatalog() {
  return useContext(ReferenceCatalogContext)
}

function referenceCatalogItems(
  items: ReferenceCatalogItem[],
  catalogCode: string,
  includeInactiveCode?: string,
) {
  return items.filter((item) =>
    item.catalog_code === catalogCode
    && (item.is_active || item.code === includeInactiveCode),
  )
}

function uploadReservation(data: Json | null): DocumentUploadReservation | null {
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

async function supportedDocumentMimeType(file: File): Promise<string | null> {
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

function useDocumentAttachments(entityType: DocumentEntityType): DocumentAttachmentState {
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

async function cancelEditorWithAttachments(
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

function DocumentAttachmentFields({
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

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false)
      return
    }

    let active = true
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession)
        setAuthError('')
      }
    })

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) {
        setAuthError('Non è stato possibile verificare la sessione. Riprova.')
        console.error('Supabase session check failed', error)
      } else {
        setSession(data.session)
      }
      setCheckingSession(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  if (!isSupabaseConfigured || !supabase) {
    return <ConfigurationNotice />
  }
  const client = supabase

  if (checkingSession) {
    return <LoadingScreen label="Verifica accesso..." />
  }

  if (!session) {
    return (
      <SignIn
        error={authError}
        onError={setAuthError}
        client={client}
      />
    )
  }

  return (
    <Workspace
      email={session.user.email ?? 'Utente'}
      userId={session.user.id}
      initialName={
        typeof session.user.user_metadata?.display_name === 'string'
          ? session.user.user_metadata.display_name
          : [session.user.user_metadata?.first_name, session.user.user_metadata?.last_name]
              .filter((part): part is string => typeof part === 'string')
              .join(' ')
      }
      onSignOut={async () => {
        const { error } = await client.auth.signOut()
        if (error) {
          console.error('Supabase sign out failed', error)
          return 'Non è stato possibile uscire. Riprova.'
        }
        return null
      }}
    />
  )
}

function ConfigurationNotice() {
  return (
    <main className="config-screen">
      <div className="config-card">
        <Brand />
        <span className="eyebrow">Configurazione richiesta</span>
        <h1>Collega il progetto Supabase</h1>
        <p>
          Crea un file <code>.env</code> partendo da <code>.env.example</code>{' '}
          e configura l’URL del progetto e la chiave pubblica.
        </p>
        <p className="security-note">
          Nel browser usa solo la chiave publishable/anon. Non inserire mai la
          service role key.
        </p>
      </div>
    </main>
  )
}

function SignIn({
  error,
  onError,
  client,
}: {
  error: string
  onError: (message: string) => void
  client: NonNullable<typeof supabase>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onError('')
    setSubmitting(true)

    const { error: signInError } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      onError('Accesso non riuscito. Controlla email e password e riprova.')
      console.error('Supabase sign in failed', signInError)
    }
    setSubmitting(false)
  }

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="signin-title">
        <Brand />
        <div className="auth-heading">
          <span className="eyebrow">Area riservata</span>
          <h1 id="signin-title">Bentornata</h1>
          <p>Accedi al tuo spazio di gestione immobiliare.</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            autoComplete="username"
            id="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nome@azienda.it"
            required
            type="email"
            value={email}
          />
          <label htmlFor="password">Password</label>
          <input
            autoComplete="current-password"
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button full-width" disabled={submitting}>
            {submitting ? 'Accesso in corso…' : 'Accedi'}
          </button>
        </form>
        <p className="auth-footnote">
          L’accesso è gestito in sicurezza da Supabase Auth.
        </p>
      </section>
    </main>
  )
}

function Workspace({
  email,
  userId,
  initialName,
  onSignOut,
}: {
  email: string
  userId: string
  initialName: string
  onSignOut: () => Promise<string | null>
}) {
  const [page, setPage] = useState<Page>('overview')
  const [userName, setUserName] = useState(initialName.trim())
  const [profileError, setProfileError] = useState('')
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [loadingProperties, setLoadingProperties] = useState(true)
  const [propertyError, setPropertyError] = useState('')
  const [referenceCatalog, setReferenceCatalog] = useState<ReferenceCatalogState>({
    items: [],
    loading: true,
    error: '',
  })
  const [manageableOwners, setManageableOwners] = useState<ManageableOwner[]>([])
  const [loadingManageableOwners, setLoadingManageableOwners] = useState(true)
  const [manageableOwnersError, setManageableOwnersError] = useState('')
  const [selectedProperty, setSelectedProperty] = useState<PropertyRow | null>(null)
  const [propertyEditorMode, setPropertyEditorMode] = useState<'create' | 'edit' | null>(null)
  const [fullPageWorkflowOpen, setFullPageWorkflowOpen] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    window.matchMedia('(min-width: 761px)').matches,
  )

  async function refreshReferenceCatalog() {
    if (!supabase) return
    setReferenceCatalog((current) => ({ ...current, loading: true, error: '' }))
    const { data, error } = await supabase.rpc('list_reference_catalog_items')
    if (error) {
      setReferenceCatalog((current) => ({
        ...current,
        loading: false,
        error: 'Non è stato possibile caricare i cataloghi di riferimento.',
      }))
      console.error('Reference catalog query failed', error)
      return
    }
    setReferenceCatalog({ items: data ?? [], loading: false, error: '' })
  }

  useEffect(() => {
    void refreshReferenceCatalog()
  }, [])

  useEffect(() => {
    if (!supabase) return

    let active = true
    void supabase
      .from('profiles')
      .select('first_name, last_name, display_name')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setProfileError('Non è stato possibile caricare il nome del profilo.')
          console.error('Profile query failed', error)
        } else if (data) {
          const fullName = `${data.first_name} ${data.last_name}`.trim()
          setUserName(data.display_name?.trim() || fullName || initialName.trim())
        }
      })

    return () => {
      active = false
    }
  }, [initialName, userId])

  useEffect(() => {
    if (!supabase) return

    let active = true
    setLoadingProperties(true)
    setPropertyError('')

    void supabase
      .from('properties')
      .select(
        'id, internal_code, name, property_type, status, address_line1, address_line2, postal_code, municipality, province, country_code, cadastral_data, surface_sqm, notes',
      )
      .order('name')
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setPropertyError(
            'Non è stato possibile caricare gli immobili. Verifica che il tuo account abbia accesso al patrimonio.',
          )
          console.error('Properties query failed', error)
        } else {
          setProperties(data ?? [])
        }
        setLoadingProperties(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!supabase) return

    let active = true
    void supabase.rpc('list_manageable_owners').then(({ data, error }) => {
      if (!active) return
      if (error) {
        setManageableOwnersError(
          'Non è stato possibile verificare i Proprietari che puoi gestire.',
        )
        console.error('Manageable owners query failed', error)
      } else {
        setManageableOwners(data ?? [])
        setManageableOwnersError('')
      }
      setLoadingManageableOwners(false)
    })

    return () => {
      active = false
    }
  }, [])

  async function refreshManageableOwners(): Promise<ManageableOwner[] | null> {
    if (!supabase) return null
    setLoadingManageableOwners(true)
    const { data, error } = await supabase.rpc('list_manageable_owners')
    if (error) {
      setManageableOwnersError(
        'Proprietario creato, ma non è stato possibile aggiornare il perimetro di gestione.',
      )
      console.error('Manageable owners refresh failed', error)
    } else {
      setManageableOwners(data ?? [])
      setManageableOwnersError('')
    }
    setLoadingManageableOwners(false)
    return error ? null : data ?? []
  }

  async function refreshProperties() {
    if (!supabase) return null

    const { data, error } = await supabase
      .from('properties')
      .select(
        'id, internal_code, name, property_type, status, address_line1, address_line2, postal_code, municipality, province, country_code, cadastral_data, surface_sqm, notes',
      )
      .order('name')

    if (error) {
      setPropertyError('Immobile salvato, ma non è stato possibile aggiornare l’elenco.')
      console.error('Properties refresh failed', error)
      return null
    }

    setPropertyError('')
    setProperties(data ?? [])
    return data ?? []
  }

  const filteredProperties = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('it-IT')
    if (!query) return properties
    return properties.filter((property) =>
      [
        property.name,
        property.internal_code,
        property.municipality,
        property.province ?? '',
      ]
        .join(' ')
        .toLocaleLowerCase('it-IT')
        .includes(query),
    )
  }, [properties, search])

  const activeProperties = properties.filter(
    (property) => property.status === 'ACTIVE',
  ).length
  const municipalities = new Set(
    properties.map((property) => property.municipality),
  ).size
  const canCreateProperty = !loadingManageableOwners

  async function handleSignOut() {
    const error = await onSignOut()
    setSignOutError(error ?? '')
  }

  return (
    <ReferenceCatalogContext.Provider value={referenceCatalog}>
    <div className="app-shell">
      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ' sidebar-collapsed'}`}>
        <div className="sidebar-brand">
          <Brand
            onToggle={() => setSidebarOpen((open) => !open)}
            expanded={sidebarOpen}
          />
        </div>
        <div className="workspace-label">GESTIONE PATRIMONIO</div>
        <nav aria-label="Navigazione principale" className="main-nav">
          <button
            className={`nav-item${page === 'overview' ? ' nav-item-active' : ''}`}
            onClick={() => setPage('overview')}
          >
            <span className="nav-symbol">⌂</span>
            Panoramica
          </button>
          <button
            className={`nav-item${page === 'properties' ? ' nav-item-active' : ''}`}
            onClick={() => setPage('properties')}
          >
            <span className="nav-symbol">▦</span>
            Immobili
            <span className="nav-count">{properties.length}</span>
          </button>
          <button
            className={`nav-item${page === 'owners' ? ' nav-item-active' : ''}`}
            onClick={() => setPage('owners')}
          >
            <span className="nav-symbol">♙</span>
            Proprietari
          </button>
          <button
            className={`nav-item${page === 'contracts' ? ' nav-item-active' : ''}`}
            onClick={() => setPage('contracts')}
          >
            <span className="nav-symbol">▤</span>
            Contratti
          </button>
          <button
            className={`nav-item${page === 'tenants' ? ' nav-item-active' : ''}`}
            onClick={() => setPage('tenants')}
          >
            <span className="nav-symbol">♧</span>
            Locatari
          </button>
          <div className="nav-divider" />
          <span className="nav-section-label">OPERATIVITÀ</span>
          <button
            className={`nav-item${page === 'documents' ? ' nav-item-active' : ''}`}
            onClick={() => setPage('documents')}
          >
            <span className="nav-symbol">▧</span>
            Documenti
          </button>
          {unavailableSections.map((section) => (
            <div className="nav-item nav-item-disabled" key={section}>
              <span className="nav-symbol">○</span>
              {section}
              <span className="soon-dot" title="In sviluppo" />
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-chip">
            <span className="privacy-indicator" />
            Accesso protetto
          </div>
          <span className="sidebar-version">GestioneImmobili · Web</span>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          {!sidebarOpen && (
            <Brand
              onToggle={() => setSidebarOpen(true)}
              expanded={false}
            />
          )}
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-separator">/</span>
            <strong>
              {page === 'overview'
                ? 'Panoramica'
                : page === 'properties'
                  ? 'Immobili'
                  : page === 'owners'
                    ? 'Proprietari'
                    : page === 'contracts'
                      ? 'Contratti'
                      : page === 'tenants'
                        ? 'Locatari'
                        : 'Documenti'}
            </strong>
          </div>
          <div className="topbar-user">
            {profileError && (
              <span className="signout-error" role="alert">
                {profileError}
              </span>
            )}
            {signOutError && (
              <span className="signout-error" role="alert">
                {signOutError}
              </span>
            )}
            <div className="user-copy">
              <span className="user-name">{email}</span>
              <span className="user-role">Account autenticato</span>
            </div>
            <div aria-hidden="true" className="user-avatar">
              {email.charAt(0).toLocaleUpperCase('it-IT')}
            </div>
            <button className="signout-button" onClick={() => void handleSignOut()}>
              Esci
            </button>
          </div>
        </header>

        <main
          className={`page-content${
            propertyEditorMode || fullPageWorkflowOpen ? ' page-content-full' : ''
          }`}
        >
          {referenceCatalog.error && (
            <div className="inline-error" role="alert">
              <span>{referenceCatalog.error}</span>
              <button
                className="allocation-add-button"
                onClick={() => void refreshReferenceCatalog()}
                type="button"
              >
                Ricarica
              </button>
            </div>
          )}
          {propertyEditorMode ? (
            <PropertyEditor
              key={`${propertyEditorMode}-${selectedProperty?.id ?? 'new'}`}
              manageableOwners={manageableOwners}
              loadingManageableOwners={loadingManageableOwners}
              manageableOwnersError={manageableOwnersError}
              mode={propertyEditorMode}
              onCancel={() => setPropertyEditorMode(null)}
              onRefreshManageableOwners={refreshManageableOwners}
              onSaved={async (propertyId) => {
                const refreshed = await refreshProperties()
                const updatedProperty =
                  refreshed?.find((property) => property.id === propertyId) ?? null
                setSelectedProperty(updatedProperty)
                setPropertyEditorMode(null)
              }}
              property={propertyEditorMode === 'edit' ? selectedProperty : null}
            />
          ) : (
          <>
          {!fullPageWorkflowOpen && <div className="page-heading">
            <div>
              <span className="eyebrow">IL TUO PATRIMONIO</span>
              <h1>
                {page === 'overview'
                  ? `Ciao${userName ? `, ${userName.split(' ')[0]}` : ''}`
                  : page === 'properties'
                    ? 'Immobili'
                    : page === 'owners'
                      ? 'Proprietari'
                      : page === 'contracts'
                        ? 'Contratti'
                        : page === 'tenants'
                          ? 'Locatari'
                          : 'Documenti'}
              </h1>
              <p>
                {page === 'overview'
                  ? 'Una vista d’insieme degli immobili a cui hai accesso.'
                  : page === 'properties'
                    ? 'Consulta gli immobili visibili nel tuo perimetro.'
                    : page === 'owners'
                      ? 'Gestisci i Proprietari presenti nel tuo perimetro di accesso.'
                      : page === 'contracts'
                        ? 'Gestisci i contratti collegati agli immobili e ai Locatari.'
                        : page === 'tenants'
                          ? 'Consulta i Locatari collegati agli immobili che gestisci.'
                          : 'Allega e consulta i documenti dei Proprietari, degli immobili, dei Locatari e dei contratti.'}
              </p>
            </div>
            <div className="today-label">
              <span className="today-dot" />
              {new Intl.DateTimeFormat('it-IT', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }).format(new Date())}
            </div>
          </div>}

          {!fullPageWorkflowOpen && (page === 'overview' || page === 'properties') && (
          <section aria-label="Riepilogo immobili" className="stats-grid">
            <StatCard
              label="Immobili visibili"
              value={loadingProperties ? '—' : properties.length.toString()}
              detail="Nel tuo perimetro"
              icon="⌂"
            />
            <StatCard
              label="In gestione"
              value={loadingProperties ? '—' : activeProperties.toString()}
              detail="Stato attivo"
              icon="↗"
            />
            <StatCard
              label="Comuni"
              value={loadingProperties ? '—' : municipalities.toString()}
              detail="Località presenti"
              icon="◎"
            />
          </section>
          )}

          {page === 'owners' ? (
            <OwnersManagementPanel
              onOwnerEditorOpenChange={setFullPageWorkflowOpen}
              onOwnerCreated={async () => {
                await refreshManageableOwners()
              }}
            />
          ) : page === 'contracts' || page === 'tenants' ? (
            <ContractsManagementPanel
              onFullPageChange={setFullPageWorkflowOpen}
              onPageChange={setPage}
              page={page}
            />
          ) : page === 'documents' ? (
            <DocumentsManagementPanel />
          ) : (
          <section className="content-card">
            <div className="card-heading">
              <div>
                <h2>{page === 'overview' ? 'Immobili recenti' : 'Elenco immobili'}</h2>
                <p>
                  {page === 'overview'
                    ? 'Gli immobili disponibili per il tuo account.'
                    : `${properties.length} ${
                        properties.length === 1 ? 'immobile' : 'immobili'
                      } nel tuo perimetro`}
                </p>
              </div>
              <div className="card-actions">
                <label className="search-box">
                  <span aria-hidden="true">⌕</span>
                  <input
                    aria-label="Cerca immobili"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Cerca per nome, codice o città"
                    value={search}
                  />
                </label>
                {page === 'properties' && (
                  <button
                    className="primary-button compact-button"
                    disabled={!canCreateProperty}
                    onClick={() => setPropertyEditorMode('create')}
                    title={
                      manageableOwnersError ||
                      (manageableOwners.length === 0 && !loadingManageableOwners
                        ? 'Serve almeno un Proprietario attivo nel tuo perimetro di gestione.'
                        : undefined)
                    }
                    type="button"
                  >
                    + Nuovo immobile
                  </button>
                )}
              </div>
            </div>

            {propertyError ? (
              <div className="inline-error" role="alert">
                <span>{propertyError}</span>
                <button
                  className="allocation-add-button"
                  onClick={() => void refreshProperties()}
                >
                  Ricarica
                </button>
              </div>
            ) : loadingProperties ? (
              <LoadingScreen label="Caricamento immobili..." compact />
            ) : filteredProperties.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">⌂</div>
                <h3>
                  {properties.length === 0
                    ? 'Nessun immobile visibile'
                    : 'Nessun risultato'}
                </h3>
                <p>
                  {properties.length === 0
                    ? 'Quando il tuo account avrà accesso a un immobile, lo troverai qui.'
                    : 'Prova a modificare i termini di ricerca.'}
                </p>
              </div>
            ) : (
              <PropertyTable
                properties={
                  page === 'overview'
                    ? filteredProperties.slice(0, 5)
                    : filteredProperties
                }
                onSelect={setSelectedProperty}
              />
            )}
            <div className="data-footnote">
              I dati mostrati rispettano il perimetro di accesso del tuo account.
            </div>
          </section>
          )}
          {!fullPageWorkflowOpen && <footer className="page-footer">
            <span>GestioneImmobili</span>
            <span>La gestione del tuo patrimonio, in un unico spazio.</span>
          </footer>}
          </>
          )}
        </main>
      </div>
      {selectedProperty && !propertyEditorMode && (
        <PropertyDetailDialog
          manageableOwners={manageableOwners}
          onClose={() => setSelectedProperty(null)}
          onEdit={() => setPropertyEditorMode('edit')}
          property={selectedProperty}
        />
      )}
    </div>
    </ReferenceCatalogContext.Provider>
  )
}

function PropertyTable({
  properties,
  onSelect,
}: {
  properties: PropertyRow[]
  onSelect: (property: PropertyRow) => void
}) {
  const { items: catalogItems } = useReferenceCatalog()
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>IMMOBILE</th>
            <th>CODICE</th>
            <th>TIPOLOGIA</th>
            <th>LOCALITÀ</th>
            <th>SUPERFICIE</th>
            <th>STATO</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((property) => (
            <tr key={property.id}>
              <td>
                <div className="property-name-cell">
                  <span className="property-icon">⌂</span>
                  <button
                    className="property-open-button"
                    onClick={() => onSelect(property)}
                    type="button"
                  >
                    {property.name}
                  </button>
                </div>
              </td>
              <td className="muted-cell">{property.internal_code}</td>
              <td>{referenceCatalogLabel(catalogItems, 'property_type', property.property_type)}</td>
              <td>
                {property.municipality}
                {property.province ? ` (${property.province})` : ''}
              </td>
              <td>
                {property.surface_sqm
                  ? `${new Intl.NumberFormat('it-IT').format(
                      property.surface_sqm,
                    )} m²`
                  : '—'}
              </td>
              <td>
                <span
                  className={`status-pill ${
                    property.status === 'ACTIVE' ? 'status-active' : 'status-inactive'
                  }`}
                >
                  <span />
                  {referenceCatalogLabel(catalogItems, 'entity_status', property.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type OwnerFormValues = {
  ownerType: 'NATURAL_PERSON' | 'LEGAL_ENTITY'
  firstName: string
  lastName: string
  businessName: string
  taxCode: string
  vatNumber: string
  email: string
  phone: string
  addressLine1: string
  addressLine2: string
  postalCode: string
  municipality: string
  province: string
  countryCode: string
  iban: string
  notes: string
}

function OwnersManagementPanel({
  onOwnerCreated,
  onOwnerEditorOpenChange,
}: {
  onOwnerCreated: () => Promise<void>
  onOwnerEditorOpenChange: (open: boolean) => void
}) {
  const { items: catalogItems } = useReferenceCatalog()
  const [owners, setOwners] = useState<OwnerListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedOwner, setSelectedOwner] = useState<OwnerListRow | null>(null)

  async function loadOwners() {
    if (!supabase) {
      setLoading(false)
      setError('Connessione al database non disponibile.')
      return
    }

    setLoading(true)
    setError('')
    const { data, error: ownersError } = await supabase
      .from('owners')
      .select(
        'id, owner_type, first_name, last_name, business_name, tax_code, vat_number, email, phone, status, municipality, province',
      )
      .order('business_name', { nullsFirst: false })
      .order('last_name', { nullsFirst: false })

    if (ownersError) {
      setError('Non è stato possibile caricare i Proprietari nel tuo perimetro.')
      console.error('Owners query failed', ownersError)
    } else {
      setOwners(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadOwners()
  }, [])

  const filteredOwners = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('it-IT')
    if (!query) return owners
    return owners.filter((owner) =>
      [
        ownerDisplayName(owner),
        owner.tax_code ?? '',
        owner.vat_number ?? '',
        owner.email ?? '',
        owner.phone ?? '',
        owner.municipality ?? '',
        owner.province ?? '',
      ]
        .join(' ')
        .toLocaleLowerCase('it-IT')
        .includes(query),
    )
  }, [owners, search])

  if (selectedOwner) {
    return (
      <OwnerContactEditor
        owner={selectedOwner}
        onCancel={() => {
          setSelectedOwner(null)
          onOwnerEditorOpenChange(false)
        }}
        onSaved={async (email, phone) => {
          setOwners((current) =>
            current.map((owner) =>
              owner.id === selectedOwner.id ? { ...owner, email, phone } : owner,
            ),
          )
          setSelectedOwner(null)
          onOwnerEditorOpenChange(false)
        }}
      />
    )
  }

  return (
    <>
      <section className="content-card">
        <div className="card-heading">
          <div>
            <h2>Elenco Proprietari</h2>
            <p>
              {owners.length}{' '}
              {owners.length === 1
                ? 'Proprietario visibile nel tuo perimetro'
                : 'Proprietari visibili nel tuo perimetro'}
            </p>
          </div>
          <div className="card-actions">
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Cerca Proprietari"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cerca per nominativo, codice o città"
                value={search}
              />
            </label>
            <button
              className="primary-button compact-button"
              onClick={() => setShowCreateForm(true)}
              type="button"
            >
              + Nuovo Proprietario
            </button>
          </div>
        </div>

        {error ? (
          <div className="inline-error" role="alert">
            <span>{error}</span>
            <button className="text-button" onClick={() => void loadOwners()} type="button">
              Riprova
            </button>
          </div>
        ) : loading ? (
          <LoadingScreen label="Caricamento Proprietari..." compact />
        ) : filteredOwners.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">♙</div>
            <h3>{owners.length === 0 ? 'Nessun Proprietario visibile' : 'Nessun risultato'}</h3>
            <p>
              {owners.length === 0
                ? 'Registra il primo Proprietario: riceverai automaticamente i permessi di amministrazione sul suo perimetro.'
                : 'Prova a modificare i termini di ricerca.'}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>PROPRIETARIO</th>
                  <th>TIPO</th>
                  <th>CODICE FISCALE / P. IVA</th>
                  <th>EMAIL</th>
                  <th>CELLULARE</th>
                  <th>LOCALITÀ</th>
                  <th>STATO</th>
                  <th>AZIONI</th>
                </tr>
              </thead>
              <tbody>
                {filteredOwners.map((owner) => (
                  <tr key={owner.id}>
                    <td>
                      <div className="property-name-cell">
                        <span className="property-icon">♙</span>
                        <span>{ownerDisplayName(owner)}</span>
                      </div>
                    </td>
                    <td>{referenceCatalogLabel(catalogItems, 'owner_type', owner.owner_type)}</td>
                    <td className="muted-cell">{owner.tax_code || owner.vat_number || '—'}</td>
                    <td>{owner.email || '—'}</td>
                    <td>{owner.phone || '—'}</td>
                    <td>
                      {[owner.municipality, owner.province]
                        .filter(Boolean)
                        .join(' (')
                        .concat(owner.municipality && owner.province ? ')' : '') || '—'}
                    </td>
                    <td>
                      <span
                        className={`status-pill ${
                          owner.status === 'ACTIVE' ? 'status-active' : 'status-inactive'
                        }`}
                      >
                        <span />
                        {referenceCatalogLabel(catalogItems, 'entity_status', owner.status)}
                      </span>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => {
                          setSelectedOwner(owner)
                          onOwnerEditorOpenChange(true)
                        }}
                        type="button"
                      >
                        Modifica
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="data-footnote">
          I Proprietari visibili e le relative informazioni rispettano il perimetro di accesso del tuo account.
        </div>
      </section>
      {showCreateForm && (
        <OwnerEditor
          onCancel={() => setShowCreateForm(false)}
          onSaved={async (_ownerId) => {
            setShowCreateForm(false)
            await Promise.all([loadOwners(), onOwnerCreated()])
          }}
        />
      )}
    </>
  )
}

function DocumentsManagementPanel() {
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

function formatFileSize(size: number | null) {
  if (size === null) return 'Dimensione non disponibile'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function ContractsManagementPanel({
  page,
  onPageChange,
  onFullPageChange,
}: {
  page: 'contracts' | 'tenants'
  onPageChange: (page: Page) => void
  onFullPageChange: (open: boolean) => void
}) {
  const { items: catalogItems } = useReferenceCatalog()
  const [contracts, setContracts] = useState<ManageableContract[]>([])
  const [tenants, setTenants] = useState<ManageableTenant[]>([])
  const [properties, setProperties] = useState<ManageableProperty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [flow, setFlow] = useState<'list' | 'new-contract' | 'new-tenant' | 'detail'>('list')
  const [selectedContract, setSelectedContract] = useState<ManageableContract | null>(null)

  async function loadManagementData(showInitialLoading = false) {
    if (!supabase) {
      setError('Connessione al database non disponibile.')
      setLoading(false)
      return
    }
    if (showInitialLoading) setLoading(true)
    else setRefreshing(true)
    setError('')
    const [contractResult, tenantResult, propertyResult] = await Promise.all([
      supabase.rpc('list_manageable_contracts'),
      supabase.rpc('list_manageable_tenants'),
      supabase.rpc('list_manageable_properties'),
    ])
    const errors = [
      contractResult.error,
      tenantResult.error,
      propertyResult.error,
    ].filter(Boolean)
    if (errors.length > 0) {
      setError('Non è stato possibile caricare contratti, Locatari o immobili gestibili.')
      console.error('Contract management queries failed', errors)
    } else {
      setContracts(contractResult.data ?? [])
      setTenants(tenantResult.data ?? [])
      setProperties(propertyResult.data ?? [])
    }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    void loadManagementData(true)
  }, [])

  useEffect(() => {
    setFlow('list')
    setSelectedContract(null)
    onFullPageChange(false)
  }, [page, onFullPageChange])

  async function refreshAndReturn() {
    await loadManagementData()
    setFlow('list')
    setSelectedContract(null)
    onFullPageChange(false)
  }

  if (flow === 'new-tenant') {
    return (
      <TenantEditor
        properties={properties}
        onCancel={() => {
          setFlow('list')
          onFullPageChange(false)
        }}
        onSaved={refreshAndReturn}
      />
    )
  }

  if (flow === 'new-contract') {
    return (
      <ContractEditor
        properties={properties}
        tenants={tenants}
        onCancel={() => {
          setFlow('list')
          onFullPageChange(false)
        }}
        onCreateTenant={() => {
          setFlow('new-tenant')
          onFullPageChange(true)
        }}
        onSaved={refreshAndReturn}
      />
    )
  }

  if (flow === 'detail' && selectedContract) {
    return (
      <ContractDetailPage
        contract={selectedContract}
        onBack={() => {
          setFlow('list')
          setSelectedContract(null)
          onFullPageChange(false)
        }}
        onChanged={async () => {
          if (!supabase) return
          const { data, error: contractsError } = await supabase.rpc('list_manageable_contracts')
          if (contractsError) {
            setError('Stato del contratto aggiornato, ma non è stato possibile ricaricare i dati.')
            console.error('Contracts refresh after status update failed', contractsError)
          } else {
            setContracts(data ?? [])
            setSelectedContract(
              data?.find((row) => row.contract_id === selectedContract.contract_id) ?? null,
            )
          }
        }}
      />
    )
  }

  if (loading) return <LoadingScreen label="Caricamento contratti e Locatari..." />

  return (
    <section className="content-card">
      <div className="card-heading">
        <div>
          <h2>{page === 'contracts' ? 'Contratti' : 'Locatari'}</h2>
          <p>
            {page === 'contracts'
              ? `${contracts.length} ${contracts.length === 1 ? 'contratto gestibile' : 'contratti gestibili'}`
              : `${tenants.length} ${tenants.length === 1 ? 'Locatario' : 'Locatari'} nel tuo perimetro`}
          </p>
        </div>
        <div className="card-actions">
          <div aria-label="Sezione" className="owner-type-switch">
            <button
              aria-pressed={page === 'contracts'}
              className={page === 'contracts' ? 'owner-type-active' : ''}
              onClick={() => onPageChange('contracts')}
              type="button"
            >
              Contratti
            </button>
            <button
              aria-pressed={page === 'tenants'}
              className={page === 'tenants' ? 'owner-type-active' : ''}
              onClick={() => onPageChange('tenants')}
              type="button"
            >
              Locatari
            </button>
          </div>
          <button
            className="primary-button compact-button"
            disabled={refreshing || (page === 'contracts' && properties.length === 0)}
            onClick={() => {
              setFlow(page === 'contracts' ? 'new-contract' : 'new-tenant')
              onFullPageChange(true)
            }}
            type="button"
          >
            {page === 'contracts' ? '+ Nuovo contratto' : '+ Nuovo Locatario'}
          </button>
        </div>
      </div>

      {error && <div className="inline-error" role="alert">{error}</div>}
      {page === 'contracts' ? (
        contracts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">▤</div>
            <h3>Nessun contratto presente</h3>
            <p>Crea prima un Locatario, poi registra il contratto associato a un immobile gestito.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>CODICE</th>
                  <th>IMMOBILE</th>
                  <th>LOCATARIO</th>
                  <th>PERIODO</th>
                  <th>CANONE</th>
                  <th>STATO</th>
                  <th>AZIONI</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => (
                  <tr key={contract.contract_id}>
                    <td>{contract.internal_code}</td>
                    <td>{contract.property_name}</td>
                    <td>{contract.tenant_name}</td>
                    <td>{formatDate(contract.start_date)} – {formatDate(contract.end_date)}</td>
                    <td>{formatCurrency(contract.base_rent_amount)} / {referenceCatalogLabel(catalogItems, 'billing_frequency', contract.billing_frequency)}</td>
                    <td>
                      <span className={`status-pill ${contract.management_status === 'ACTIVE' ? 'status-active' : 'status-inactive'}`}>
                        <span />
                        {referenceCatalogLabel(catalogItems, 'contract_management_status', contract.management_status)}
                      </span>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => {
                          setSelectedContract(contract)
                          setFlow('detail')
                          onFullPageChange(true)
                        }}
                        type="button"
                      >
                        Dettaglio
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : tenants.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">♧</div>
          <h3>Nessun Locatario presente</h3>
          <p>Registra un Locatario e collegalo a uno degli immobili che gestisci.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>LOCATARIO</th>
                <th>TIPO</th>
                <th>CODICE FISCALE / P. IVA</th>
                <th>EMAIL</th>
                <th>CELLULARE</th>
                <th>IMMOBILE ASSOCIATO</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={`${tenant.tenant_id}-${tenant.property_id}`}>
                  <td>{tenantDisplayName(tenant)}</td>
                  <td>{referenceCatalogLabel(catalogItems, 'tenant_type', tenant.tenant_type)}</td>
                  <td>{tenant.tax_code || '—'}</td>
                  <td>{tenant.email || '—'}</td>
                  <td>{tenant.phone || '—'}</td>
                  <td>{properties.find((property) => property.property_id === tenant.property_id)?.property_name ?? 'Immobile non disponibile'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="data-footnote">
        Sono mostrati solo gli elementi collegati agli immobili nel tuo perimetro di gestione.
      </div>
    </section>
  )
}

function ContractDetailPage({
  contract,
  onBack,
  onChanged,
}: {
  contract: ManageableContract
  onBack: () => void
  onChanged: () => Promise<void>
}) {
  const { items: catalogItems } = useReferenceCatalog()
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState(false)

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

  return (
    <section className="full-page-editor">
      <header className="full-page-heading">
        <div>
          <span className="eyebrow">SCHEDA CONTRATTO</span>
          <h1>{contract.internal_code}</h1>
          <p>{contract.property_name} · {contract.tenant_name}</p>
        </div>
        <button className="secondary-button" onClick={onBack} type="button">Torna ai contratti</button>
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

function TenantEditor({
  properties,
  onCancel,
  onSaved,
}: {
  properties: ManageableProperty[]
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const { items: catalogItems, loading: catalogLoading, error: catalogError } = useReferenceCatalog()
  const attachments = useDocumentAttachments('TENANT')
  const [values, setValues] = useState({
    propertyId: properties[0]?.property_id ?? '',
    tenantType: 'NATURAL_PERSON',
    firstName: '',
    lastName: '',
    businessName: '',
    taxCode: '',
    email: '',
    phone: '',
    addressLine1: '',
    postalCode: '',
    municipality: '',
    province: '',
    notes: '',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null)

  function updateValue(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (createdTenantId) {
      setSubmitting(true)
      const uploaded = await attachments.uploadForEntity(createdTenantId)
      setSubmitting(false)
      if (!uploaded) {
        setError('Locatario salvato. Uno o più allegati non sono ancora stati caricati: riprova prima di uscire.')
        return
      }
      await onSaved()
      return
    }
    if (!supabase) {
      setError('Connessione al database non disponibile.')
      return
    }
    if (catalogLoading || catalogError) {
      setError(catalogError || 'Caricamento dei cataloghi di riferimento in corso.')
      return
    }
    if (attachments.drafts.some((draft) => !draft.file)) {
      setError('Per ogni documento aggiunto seleziona un file oppure rimuovi la riga.')
      return
    }
    setSubmitting(true)
    const { data, error: createError } = await supabase.rpc('create_tenant_for_property', {
      p_property_id: values.propertyId,
      p_tenant_type: values.tenantType,
      p_first_name: values.firstName,
      p_last_name: values.lastName,
      p_business_name: values.businessName,
      p_tax_code: values.taxCode,
      p_email: values.email,
      p_phone: values.phone,
      p_address_line1: values.addressLine1,
      p_postal_code: values.postalCode,
      p_municipality: values.municipality,
      p_province: values.province,
      p_notes: values.notes,
    })
    if (createError) {
      setSubmitting(false)
      setError(contractRpcErrorMessage(createError.message))
      console.error('Tenant creation failed', createError)
      return
    }
    if (!data?.tenant_id) {
      setSubmitting(false)
      setError('Il salvataggio non ha restituito l’identificativo del Locatario.')
      console.error('Tenant creation returned no id', data)
      return
    }
    setCreatedTenantId(data.tenant_id)
    if (attachments.drafts.length > 0) {
      const uploaded = await attachments.uploadForEntity(data.tenant_id)
      if (!uploaded) {
        setSubmitting(false)
        setError('Locatario salvato. Uno o più allegati non sono ancora stati caricati: riprova prima di uscire.')
        return
      }
    }
    setSubmitting(false)
    await onSaved()
  }

  return (
    <section className="full-page-editor">
      <header className="full-page-heading">
        <div>
          <span className="eyebrow">ANAGRAFICA LOCATARIO</span>
          <h1>Nuovo Locatario</h1>
          <p>Il Locatario viene associato all’immobile scelto e reso disponibile nei relativi contratti.</p>
        </div>
        <button
          className="secondary-button"
          onClick={() => void cancelEditorWithAttachments(attachments, onCancel, setError)}
          type="button"
        >
          Annulla
        </button>
      </header>
      {properties.length === 0 ? (
        <div className="inline-error" role="alert">
          Per registrare un Locatario devi avere almeno un immobile attivo nel tuo perimetro Manager.
        </div>
      ) : (
        <form className="contract-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-section">
            <h3>Immobile di riferimento</h3>
            <FormField label="Immobile" required>
              <select
                onChange={(event) => updateValue('propertyId', event.target.value)}
                required
                value={values.propertyId}
              >
                {properties.map((property) => (
                  <option key={property.property_id} value={property.property_id}>
                    {property.internal_code} · {property.property_name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="form-section">
            <h3>Dati anagrafici</h3>
            <div className="owner-type-switch" aria-label="Tipo Locatario">
              {referenceCatalogItems(catalogItems, 'tenant_type', values.tenantType).map(({ code, label }) => (
                <button
                  aria-pressed={values.tenantType === code}
                  className={values.tenantType === code ? 'owner-type-active' : ''}
                  key={code}
                  onClick={() => updateValue('tenantType', code)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="form-grid">
              {values.tenantType === 'NATURAL_PERSON' ? (
                <>
                  <FormField label="Nome" required>
                    <input onChange={(event) => updateValue('firstName', event.target.value)} required value={values.firstName} />
                  </FormField>
                  <FormField label="Cognome" required>
                    <input onChange={(event) => updateValue('lastName', event.target.value)} required value={values.lastName} />
                  </FormField>
                </>
              ) : (
                <FormField label={values.tenantType === 'SOLE_PROPRIETOR' ? 'Nome ditta individuale' : 'Ragione sociale'} required>
                  <input onChange={(event) => updateValue('businessName', event.target.value)} required value={values.businessName} />
                </FormField>
              )}
              <FormField label="Codice fiscale / Partita IVA">
                <input maxLength={32} onChange={(event) => updateValue('taxCode', event.target.value)} value={values.taxCode} />
              </FormField>
              <FormField label="Email">
                <input autoComplete="email" maxLength={254} onChange={(event) => updateValue('email', event.target.value)} type="email" value={values.email} />
              </FormField>
              <FormField label="Numero di cellulare">
                <input autoComplete="tel" maxLength={50} onChange={(event) => updateValue('phone', event.target.value)} type="tel" value={values.phone} />
              </FormField>
              <FormField label="Indirizzo">
                <input onChange={(event) => updateValue('addressLine1', event.target.value)} value={values.addressLine1} />
              </FormField>
              <FormField label="CAP">
                <input autoComplete="postal-code" onChange={(event) => updateValue('postalCode', event.target.value)} value={values.postalCode} />
              </FormField>
              <FormField label="Comune">
                <input onChange={(event) => updateValue('municipality', event.target.value)} value={values.municipality} />
              </FormField>
              <FormField label="Provincia">
                <input maxLength={2} onChange={(event) => updateValue('province', event.target.value)} value={values.province} />
              </FormField>
            </div>
          </div>
          <div className="form-section">
            <h3>Note</h3>
            <textarea onChange={(event) => updateValue('notes', event.target.value)} rows={3} value={values.notes} />
          </div>
          <DocumentAttachmentFields attachments={attachments} disabled={submitting} />
          {(catalogError || error) && <p className="form-error" role="alert">{catalogError || error}</p>}
          <div className="dialog-footer">
            <button className="primary-button" disabled={submitting || (catalogLoading && attachments.drafts.length > 0)} type="submit">
              {submitting
                ? 'Salvataggio…'
                : createdTenantId
                  ? 'Riprova allegati'
                  : 'Crea Locatario'}
            </button>
            <button
              className="secondary-button"
              disabled={submitting}
              onClick={() => void cancelEditorWithAttachments(attachments, onCancel, setError)}
              type="button"
            >
              Annulla
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

function ContractEditor({
  properties,
  tenants,
  onCancel,
  onCreateTenant,
  onSaved,
}: {
  properties: ManageableProperty[]
  tenants: ManageableTenant[]
  onCancel: () => void
  onCreateTenant: () => void
  onSaved: () => Promise<void>
}) {
  const { items: catalogItems, loading: catalogLoading, error: catalogError } = useReferenceCatalog()
  const attachments = useDocumentAttachments('CONTRACT')
  const today = localDateString()
  const [values, setValues] = useState({
    propertyId: properties[0]?.property_id ?? '',
    internalCode: '',
    contractType: 'RESIDENTIAL_FREE',
    startDate: today,
    endDate: initialContractEndDate('RESIDENTIAL_FREE', today),
    agreedRentApplied: false,
    cedolareSecca: false,
    transitoryReason: '',
    firstPeriodStart: today,
    baseRent: '',
    billingFrequency: 'MONTHLY',
    dueDay: '5',
    deposit: '',
    tenantId: '',
    notes: '',
  })
  const [spaces, setSpaces] = useState<ManageableRentableSpace[]>([])
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([])
  const [loadingSpaces, setLoadingSpaces] = useState(false)
  const [spaceError, setSpaceError] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [createdContractId, setCreatedContractId] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase || !values.propertyId) {
      setSpaces([])
      setSelectedSpaceIds([])
      return
    }
    let active = true
    setLoadingSpaces(true)
    setSpaceError('')
    void supabase.rpc('list_manageable_rentable_spaces', {
      p_property_id: values.propertyId,
    }).then(({ data, error: spacesError }) => {
      if (!active) return
      if (spacesError) {
        setSpaceError('Non è stato possibile caricare le porzioni locabili.')
        console.error('Manageable rentable spaces query failed', spacesError)
        setSpaces([])
      } else {
        setSpaces(data ?? [])
      }
      setSelectedSpaceIds([])
      setLoadingSpaces(false)
    })
    return () => {
      active = false
    }
  }, [values.propertyId])

  const propertyTenants = tenants.filter((tenant) => tenant.property_id === values.propertyId)
  const residentialContract = values.contractType !== 'COMMERCIAL'

  function updateValue<Field extends keyof typeof values>(
    field: Field,
    value: (typeof values)[Field],
  ) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  function updateContractType(contractType: string) {
    setValues((current) => ({
      ...current,
      contractType,
      endDate:
        contractType === 'TRANSITORY'
          ? ''
          : initialContractEndDate(contractType, current.startDate),
      agreedRentApplied: contractType === 'RESIDENTIAL_AGREED',
      cedolareSecca: contractType === 'COMMERCIAL' ? false : current.cedolareSecca,
      transitoryReason: contractType === 'TRANSITORY' ? current.transitoryReason : '',
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (createdContractId) {
      setSubmitting(true)
      const uploaded = await attachments.uploadForEntity(createdContractId)
      setSubmitting(false)
      if (!uploaded) {
        setError('Contratto salvato. Uno o più allegati non sono ancora stati caricati: riprova prima di uscire.')
        return
      }
      await onSaved()
      return
    }
    if (catalogLoading || catalogError) {
      setError(catalogError || 'Caricamento dei cataloghi di riferimento in corso.')
      return
    }
    if (!supabase) {
      setError('Connessione al database non disponibile.')
      return
    }
    if (!values.tenantId) {
      setError('Seleziona un Locatario già associato all’immobile o registrane uno nuovo.')
      return
    }
    if (attachments.drafts.some((draft) => !draft.file)) {
      setError('Per ogni documento aggiunto seleziona un file oppure rimuovi la riga.')
      return
    }
    if (values.contractType === 'TRANSITORY' && !values.transitoryReason.trim()) {
      setError('Per un contratto transitorio è obbligatorio indicare l’esigenza transitoria.')
      return
    }
    if (values.contractType === 'TRANSITORY' && !isValidTransitoryDuration(values.startDate, values.endDate)) {
      setError('La durata del contratto transitorio deve essere compresa tra 1 e 18 mesi.')
      return
    }
    if (
      values.contractType !== 'TRANSITORY'
      && values.endDate !== initialContractEndDate(values.contractType, values.startDate)
    ) {
      setError('La scadenza non corrisponde alla durata iniziale prevista per la tipologia selezionata.')
      return
    }
    const rent = Number(values.baseRent)
    const deposit = values.deposit.trim() ? Number(values.deposit) : null
    if (!Number.isFinite(rent) || rent < 0 || (deposit !== null && (!Number.isFinite(deposit) || deposit < 0))) {
      setError('Canone e deposito devono essere importi validi e non negativi.')
      return
    }

    setSubmitting(true)
    const { data, error: createError } = await supabase.rpc('create_legal_contract_with_term', {
      p_property_id: values.propertyId,
      p_internal_code: values.internalCode,
      p_contract_type: values.contractType,
      p_start_date: values.startDate,
      p_end_date: values.endDate,
      p_base_rent_amount: rent,
      p_billing_frequency: values.billingFrequency,
      p_due_day: Number(values.dueDay),
      p_tenant_id: values.tenantId,
      p_security_deposit_amount: deposit,
      p_first_billing_period_start: values.firstPeriodStart,
      p_rentable_space_ids: selectedSpaceIds,
      p_notes: values.notes,
      p_agreed_rent_applied: values.agreedRentApplied,
      p_cedolare_secca: values.cedolareSecca,
      p_transitory_reason: values.contractType === 'TRANSITORY' ? values.transitoryReason.trim() : null,
    })
    if (createError) {
      setSubmitting(false)
      setError(contractRpcErrorMessage(createError.message))
      console.error('Contract creation failed', createError)
      return
    }
    if (!data?.contract_id) {
      setSubmitting(false)
      setError('Il salvataggio non ha restituito l’identificativo del contratto.')
      console.error('Contract creation returned no id', data)
      return
    }
    setCreatedContractId(data.contract_id)
    if (attachments.drafts.length > 0) {
      const uploaded = await attachments.uploadForEntity(data.contract_id)
      if (!uploaded) {
        setSubmitting(false)
        setError('Contratto salvato. Uno o più allegati non sono ancora stati caricati: riprova prima di uscire.')
        return
      }
    }
    setSubmitting(false)
    await onSaved()
  }

  const selectedProperty = properties.find((property) => property.property_id === values.propertyId)

  return (
    <section className="full-page-editor">
      <header className="full-page-heading">
        <div>
          <span className="eyebrow">NUOVO CONTRATTO</span>
          <h1>Registra un contratto</h1>
          <p>Il contratto viene creato inattivo. Attivalo dalla scheda per abilitare la generazione delle rate.</p>
        </div>
        <button
          className="secondary-button"
          onClick={() => void cancelEditorWithAttachments(attachments, onCancel, setError)}
          type="button"
        >
          Annulla
        </button>
      </header>
      {properties.length === 0 ? (
        <div className="inline-error" role="alert">Non hai immobili attivi nel tuo perimetro Manager.</div>
      ) : (
        <form className="contract-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-section">
            <h3>Immobile e Locatario</h3>
            <div className="form-grid">
              <FormField label="Immobile" required>
                <select onChange={(event) => updateValue('propertyId', event.target.value)} required value={values.propertyId}>
                  {properties.map((property) => (
                    <option key={property.property_id} value={property.property_id}>
                      {property.internal_code} · {property.property_name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Locatario" required>
                <select onChange={(event) => updateValue('tenantId', event.target.value)} required value={values.tenantId}>
                  <option value="">Seleziona un Locatario</option>
                  {propertyTenants.map((tenant) => (
                    <option key={tenant.tenant_id} value={tenant.tenant_id}>
                      {tenantDisplayName(tenant)}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <button className="text-button tenant-create-link" onClick={onCreateTenant} type="button">
              + Registra un nuovo Locatario
            </button>
            {propertyTenants.length === 0 && (
              <p className="form-error">Nessun Locatario è ancora associato a questo immobile.</p>
            )}
          </div>

          <div className="form-section">
            <h3>Dati contrattuali</h3>
            <div className="form-grid">
              <FormField label="Codice contratto" required>
                <input maxLength={100} onChange={(event) => updateValue('internalCode', event.target.value)} required value={values.internalCode} />
              </FormField>
              <FormField label="Tipologia" required>
                <select onChange={(event) => updateContractType(event.target.value)} value={values.contractType}>
                  {referenceCatalogItems(catalogItems, 'contract_type', values.contractType).map(({ code, label }) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Decorrenza" required>
                <input
                  onChange={(event) => {
                    const startDate = event.target.value
                    setValues((current) => ({
                      ...current,
                      startDate,
                      endDate:
                        current.contractType === 'TRANSITORY'
                          ? current.endDate
                          : initialContractEndDate(current.contractType, startDate),
                      firstPeriodStart:
                        current.firstPeriodStart === current.startDate
                          ? startDate
                          : current.firstPeriodStart,
                    }))
                  }}
                  required
                  type="date"
                  value={values.startDate}
                />
              </FormField>
              <FormField label="Scadenza" required>
                <input
                  max={values.contractType === 'TRANSITORY' ? maximumTransitoryEndDate(values.startDate) : undefined}
                  min={values.contractType === 'TRANSITORY' ? minimumTransitoryEndDate(values.startDate) : undefined}
                  onChange={(event) => updateValue('endDate', event.target.value)}
                  readOnly={values.contractType !== 'TRANSITORY'}
                  required
                  type="date"
                  value={values.endDate}
                />
              </FormField>
              <FormField label="Canone per periodo (€)" required>
                <input min="0" onChange={(event) => updateValue('baseRent', event.target.value)} required step="0.01" type="number" value={values.baseRent} />
              </FormField>
              <FormField label="Periodicità" required>
                <select onChange={(event) => updateValue('billingFrequency', event.target.value)} value={values.billingFrequency}>
                  {referenceCatalogItems(catalogItems, 'billing_frequency', values.billingFrequency).map(({ code, label }) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Primo periodo di fatturazione" required>
                <input min={values.startDate} max={values.endDate || undefined} onChange={(event) => updateValue('firstPeriodStart', event.target.value)} required type="date" value={values.firstPeriodStart} />
              </FormField>
              <FormField label="Giorno di scadenza" required>
                <input max="31" min="1" onChange={(event) => updateValue('dueDay', event.target.value)} required type="number" value={values.dueDay} />
              </FormField>
              <FormField label="Deposito cauzionale (€)">
                <input min="0" onChange={(event) => updateValue('deposit', event.target.value)} step="0.01" type="number" value={values.deposit} />
              </FormField>
            </div>
            <p className="detail-muted">
              {values.contractType === 'TRANSITORY'
                ? 'Indica una necessità temporanea concreta. Per i contratti oltre 30 giorni occorre allegare documentazione idonea; verifica l’accordo territoriale applicabile e i relativi limiti di canone.'
                : values.contractType === 'RESIDENTIAL_AGREED'
                  ? 'Il canone concordato è un elemento necessario del contratto 3+2 e deve rispettare l’accordo territoriale applicabile.'
                  : values.contractType === 'COMMERCIAL'
                    ? 'Durata iniziale minima di 6 anni, con rinnovo di 6 anni (salve le eccezioni previste per specifiche attività).'
                    : 'Durata iniziale minima di 4 anni, con rinnovo di 4 anni.'}
            </p>
            {values.contractType === 'TRANSITORY' && (
              <FormField label="Esigenza transitoria" required>
                <textarea
                  onChange={(event) => updateValue('transitoryReason', event.target.value)}
                  required
                  rows={3}
                  value={values.transitoryReason}
                />
              </FormField>
            )}
          </div>

          <div className="form-section">
            <h3>Canone concordato e regime fiscale</h3>
            {values.contractType === 'TRANSITORY' ? (
              <label className="contract-legal-option">
                <input
                  checked={values.agreedRentApplied}
                  onChange={(event) => updateValue('agreedRentApplied', event.target.checked)}
                  type="checkbox"
                />
                <span>Applica il canone concordato secondo l’accordo territoriale (opzionale per il contratto transitorio)</span>
              </label>
            ) : values.contractType === 'RESIDENTIAL_AGREED' ? (
              <p className="detail-muted">Canone concordato applicato: è obbligatorio per il contratto 3+2.</p>
            ) : (
              <p className="detail-muted">
                {values.contractType === 'RESIDENTIAL_FREE'
                  ? 'Il canone concordato non si applica al contratto 4+4 a canone libero.'
                  : 'Il canone concordato non si applica ai contratti commerciali 6+6.'}
              </p>
            )}
            {residentialContract && (
              <label className="contract-legal-option">
                <input
                  checked={values.cedolareSecca}
                  onChange={(event) => updateValue('cedolareSecca', event.target.checked)}
                  type="checkbox"
                />
                <span>
                  Cedolare secca (opzionale; verifica i requisiti del locatore e dell’immobile. La scelta comporta la rinuncia agli aggiornamenti del canone)
                </span>
              </label>
            )}
            {residentialContract && (
              <p className="detail-muted">
                Aliquota ordinaria del 21%; l’aliquota ridotta è prevista solo nei casi stabiliti dalla legge.
              </p>
            )}
          </div>

          {selectedProperty && (
            <div className="form-section">
              <h3>Oggetto della locazione</h3>
              <p>Se non selezioni porzioni, il contratto riguarda l’intero immobile.</p>
              {spaceError ? (
                <p className="form-error" role="alert">{spaceError}</p>
              ) : loadingSpaces ? (
                <LoadingScreen label="Caricamento porzioni..." compact />
              ) : spaces.length === 0 ? (
                <p className="detail-muted">Nessuna porzione locabile attiva: il contratto riguarderà l’intero immobile.</p>
              ) : (
                <div className="contract-space-list">
                  {spaces.map((space) => (
                    <label className="contract-space-option" key={space.space_id}>
                      <input
                        checked={selectedSpaceIds.includes(space.space_id)}
                        onChange={(event) => setSelectedSpaceIds((current) =>
                          event.target.checked
                            ? [...current, space.space_id]
                            : current.filter((id) => id !== space.space_id),
                        )}
                        type="checkbox"
                      />
                      <span>{space.space_code} · {space.space_name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="form-section">
            <h3>Note</h3>
            <textarea onChange={(event) => updateValue('notes', event.target.value)} rows={3} value={values.notes} />
          </div>
          <DocumentAttachmentFields attachments={attachments} disabled={submitting} />
          {(catalogError || error) && <p className="form-error" role="alert">{catalogError || error}</p>}
          <div className="dialog-footer">
            <button className="primary-button" disabled={submitting || loadingSpaces || catalogLoading || Boolean(catalogError)} type="submit">
              {submitting
                ? 'Salvataggio…'
                : createdContractId
                  ? 'Riprova allegati'
                  : 'Crea contratto inattivo'}
            </button>
            <button
              className="secondary-button"
              disabled={submitting}
              onClick={() => void cancelEditorWithAttachments(attachments, onCancel, setError)}
              type="button"
            >
              Annulla
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

function OwnerContactEditor({
  owner,
  onCancel,
  onSaved,
}: {
  owner: OwnerListRow
  onCancel: () => void
  onSaved: (email: string | null, phone: string | null) => Promise<void>
}) {
  const { items: catalogItems } = useReferenceCatalog()
  const [email, setEmail] = useState(owner.email ?? '')
  const [phone, setPhone] = useState(owner.phone ?? '')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError('')
    if (!supabase) {
      setSubmitError('Connessione al database non disponibile.')
      return
    }

    setSubmitting(true)
    const { data, error } = await supabase.rpc('update_owner_contact_details', {
      p_owner_id: owner.id,
      p_email: email,
      p_phone: phone,
    })
    setSubmitting(false)

    if (error) {
      setSubmitError(ownerRpcErrorMessage(error.message))
      console.error('Owner contact update RPC failed', error)
      return
    }
    if (!data?.owner_id) {
      setSubmitError('Il salvataggio non ha restituito l’identificativo del Proprietario.')
      console.error('Owner contact update RPC returned no owner id', data)
      return
    }
    await onSaved(data.email ?? null, data.phone ?? null)
  }

  return (
    <section aria-labelledby="owner-editor-title" className="full-page-editor">
      <header className="full-page-heading">
        <div>
          <span className="eyebrow">ANAGRAFICA PROPRIETARIO</span>
          <h1 id="owner-editor-title">Modifica Proprietario</h1>
          <p>{ownerDisplayName(owner)} · Gli altri dati anagrafici sono in sola lettura.</p>
        </div>
        <button className="secondary-button" onClick={onCancel} type="button">
          Annulla
        </button>
      </header>

      <form className="contact-editor-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="form-section">
          <h3>Dati anagrafici</h3>
          <div className="detail-grid owner-readonly-grid">
            <DetailItem
              label="Tipo"
              value={referenceCatalogLabel(catalogItems, 'owner_type', owner.owner_type)}
            />
            <DetailItem
              label="Codice fiscale / Partita IVA"
              value={owner.tax_code || owner.vat_number || 'Non indicato'}
            />
            <DetailItem
              label="Località"
              value={
                [owner.municipality, owner.province].filter(Boolean).join(' (')
                  .concat(owner.municipality && owner.province ? ')' : '') || 'Non indicata'
              }
            />
            <DetailItem
              label="Stato"
              value={referenceCatalogLabel(catalogItems, 'entity_status', owner.status)}
            />
          </div>
        </div>

        <div className="form-section">
          <h3>Contatti modificabili</h3>
          <div className="form-grid">
            <FormField label="Email">
              <input
                autoComplete="email"
                maxLength={254}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
            </FormField>
            <FormField label="Numero di cellulare">
              <input
                autoComplete="tel"
                maxLength={50}
                onChange={(event) => setPhone(event.target.value)}
                type="tel"
                value={phone}
              />
            </FormField>
          </div>
        </div>

        {submitError && <p className="form-error" role="alert">{submitError}</p>}
        <div className="dialog-footer">
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? 'Salvataggio…' : 'Salva modifiche'}
          </button>
          <button
            className="secondary-button"
            disabled={submitting}
            onClick={onCancel}
            type="button"
          >
            Annulla
          </button>
        </div>
      </form>
    </section>
  )
}

function OwnerEditor({
  onCancel,
  onSaved,
  nested = false,
}: {
  onCancel: () => void
  onSaved: (ownerId: string) => Promise<void>
  nested?: boolean
}) {
  const { items: catalogItems, loading: catalogLoading, error: catalogError } = useReferenceCatalog()
  const attachments = useDocumentAttachments('OWNER')
  const [values, setValues] = useState<OwnerFormValues>({
    ownerType: 'NATURAL_PERSON',
    firstName: '',
    lastName: '',
    businessName: '',
    taxCode: '',
    vatNumber: '',
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    postalCode: '',
    municipality: '',
    province: '',
    countryCode: 'IT',
    iban: '',
    notes: '',
  })
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [createdOwnerId, setCreatedOwnerId] = useState<string | null>(null)

  function updateValue(field: keyof OwnerFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError('')
    if (createdOwnerId) {
      setSubmitting(true)
      const uploaded = await attachments.uploadForEntity(createdOwnerId)
      setSubmitting(false)
      if (!uploaded) {
        setSubmitError('Proprietario salvato. Uno o più allegati non sono ancora stati caricati: riprova prima di uscire.')
        return
      }
      await onSaved(createdOwnerId)
      return
    }
    if (!supabase) {
      setSubmitError('Connessione al database non disponibile.')
      return
    }
    if (catalogLoading || catalogError) {
      setSubmitError(catalogError || 'Caricamento dei cataloghi di riferimento in corso.')
      return
    }
    if (attachments.drafts.some((draft) => !draft.file)) {
      setSubmitError('Per ogni documento aggiunto seleziona un file oppure rimuovi la riga.')
      return
    }

    setSubmitting(true)
    const { data, error } = await supabase.rpc('create_owner_with_access', {
      p_owner_type: values.ownerType,
      p_first_name: values.ownerType === 'NATURAL_PERSON' ? values.firstName.trim() : null,
      p_last_name: values.ownerType === 'NATURAL_PERSON' ? values.lastName.trim() : null,
      p_business_name: values.ownerType === 'LEGAL_ENTITY' ? values.businessName.trim() : null,
      p_tax_code: values.taxCode,
      p_vat_number: values.vatNumber,
      p_email: values.email,
      p_phone: values.phone,
      p_address_line1: values.addressLine1,
      p_address_line2: values.addressLine2,
      p_postal_code: values.postalCode,
      p_municipality: values.municipality,
      p_province: values.province,
      p_country_code: values.countryCode.trim().toUpperCase(),
      p_iban: values.iban,
      p_notes: values.notes,
    })
    if (error) {
      setSubmitting(false)
      setSubmitError(ownerRpcErrorMessage(error.message))
      console.error('Owner creation RPC failed', error)
      return
    }

    if (!data?.owner_id) {
      setSubmitting(false)
      setSubmitError('Il salvataggio non ha restituito l’identificativo del Proprietario.')
      console.error('Owner creation RPC returned no owner id', data)
      return
    }

    setCreatedOwnerId(data.owner_id)
    if (attachments.drafts.length > 0) {
      const uploaded = await attachments.uploadForEntity(data.owner_id)
      if (!uploaded) {
        setSubmitting(false)
        setSubmitError('Proprietario salvato. Uno o più allegati non sono ancora stati caricati: riprova prima di uscire.')
        return
      }
    }
    setSubmitting(false)
    await onSaved(data.owner_id)
  }

  return (
    <div className={`dialog-backdrop${nested ? ' dialog-backdrop-nested' : ''}`}>
      <section
        aria-labelledby="owner-editor-title"
        aria-modal="true"
        className="dialog-card editor-dialog"
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">NUOVO PROPRIETARIO</span>
            <h2 id="owner-editor-title">Registra un Proprietario</h2>
            <p>Ti verrà assegnato automaticamente il ruolo di amministratore sul suo perimetro.</p>
          </div>
          <button
            aria-label="Chiudi modulo"
            className="dialog-close"
            onClick={() => void cancelEditorWithAttachments(attachments, onCancel, setSubmitError)}
            type="button"
          >
            ×
          </button>
        </div>

        <form className="property-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-section">
            <h3>Tipo di soggetto</h3>
            <div className="owner-type-switch" role="group" aria-label="Tipo di Proprietario">
              {referenceCatalogItems(catalogItems, 'owner_type', values.ownerType).map(({ code, label }) => (
                <button
                  aria-pressed={values.ownerType === code}
                  className={values.ownerType === code ? 'owner-type-active' : ''}
                  key={code}
                  onClick={() => {
                    if (code === 'NATURAL_PERSON' || code === 'LEGAL_ENTITY') {
                      updateValue('ownerType', code)
                    }
                  }}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="form-grid owner-form-grid">
              {values.ownerType === 'NATURAL_PERSON' ? (
                <>
                  <FormField label="Nome" required>
                    <input
                      autoComplete="given-name"
                      maxLength={200}
                      onChange={(event) => updateValue('firstName', event.target.value)}
                      required
                      value={values.firstName}
                    />
                  </FormField>
                  <FormField label="Cognome" required>
                    <input
                      autoComplete="family-name"
                      maxLength={200}
                      onChange={(event) => updateValue('lastName', event.target.value)}
                      required
                      value={values.lastName}
                    />
                  </FormField>
                </>
              ) : (
                <FormField label="Ragione sociale" required>
                  <input
                    autoComplete="organization"
                    maxLength={200}
                    onChange={(event) => updateValue('businessName', event.target.value)}
                    required
                    value={values.businessName}
                  />
                </FormField>
              )}
              <FormField label="Codice fiscale">
                <input
                  autoComplete="off"
                  maxLength={32}
                  onChange={(event) => updateValue('taxCode', event.target.value)}
                  value={values.taxCode}
                />
              </FormField>
              <FormField label="Partita IVA">
                <input
                  autoComplete="off"
                  maxLength={32}
                  onChange={(event) => updateValue('vatNumber', event.target.value)}
                  value={values.vatNumber}
                />
              </FormField>
            </div>
          </div>

          <div className="form-section">
            <h3>Contatti</h3>
            <div className="form-grid">
              <FormField label="Email">
                <input
                  autoComplete="email"
                  onChange={(event) => updateValue('email', event.target.value)}
                  type="email"
                  value={values.email}
                />
              </FormField>
              <FormField label="Numero di cellulare">
                <input
                  autoComplete="tel"
                  onChange={(event) => updateValue('phone', event.target.value)}
                  type="tel"
                  value={values.phone}
                />
              </FormField>
              <FormField label="Indirizzo">
                <input
                  autoComplete="address-line1"
                  onChange={(event) => updateValue('addressLine1', event.target.value)}
                  value={values.addressLine1}
                />
              </FormField>
              <FormField label="Dettaglio indirizzo">
                <input
                  autoComplete="address-line2"
                  onChange={(event) => updateValue('addressLine2', event.target.value)}
                  value={values.addressLine2}
                />
              </FormField>
              <FormField label="CAP">
                <input
                  autoComplete="postal-code"
                  onChange={(event) => updateValue('postalCode', event.target.value)}
                  value={values.postalCode}
                />
              </FormField>
              <FormField label="Comune">
                <input
                  autoComplete="address-level2"
                  onChange={(event) => updateValue('municipality', event.target.value)}
                  value={values.municipality}
                />
              </FormField>
              <FormField label="Provincia">
                <input
                  autoComplete="address-level1"
                  maxLength={2}
                  onChange={(event) => updateValue('province', event.target.value)}
                  value={values.province}
                />
              </FormField>
              <FormField label="Codice Paese" required>
                <input
                  autoComplete="country"
                  maxLength={2}
                  onChange={(event) => updateValue('countryCode', event.target.value)}
                  required
                  value={values.countryCode}
                />
              </FormField>
            </div>
          </div>

          <div className="form-section">
            <h3>Dati amministrativi</h3>
            <FormField label="IBAN">
              <input
                autoComplete="off"
                maxLength={34}
                onChange={(event) => updateValue('iban', event.target.value)}
                value={values.iban}
              />
            </FormField>
            <FormField label="Note">
              <textarea
                onChange={(event) => updateValue('notes', event.target.value)}
                rows={3}
                value={values.notes}
              />
            </FormField>
          </div>

          <DocumentAttachmentFields attachments={attachments} disabled={submitting} />

          {(catalogError || submitError) && <p className="form-error" role="alert">{catalogError || submitError}</p>}
          <div className="dialog-footer">
            <button className="primary-button" disabled={submitting || (catalogLoading && attachments.drafts.length > 0)} type="submit">
              {submitting
                ? 'Salvataggio…'
                : createdOwnerId
                  ? 'Riprova allegati'
                  : 'Crea Proprietario'}
            </button>
            <button
              className="secondary-button"
              disabled={submitting}
              onClick={() => void cancelEditorWithAttachments(attachments, onCancel, setSubmitError)}
              type="button"
            >
              Annulla
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function ownerDisplayName(owner: OwnerSummary) {
  return owner.business_name ||
    [owner.first_name, owner.last_name].filter(Boolean).join(' ') ||
    'Proprietario'
}

function ownerRpcErrorMessage(message: string) {
  if (message.includes('INVALID_OWNER_EMAIL')) {
    return 'Inserisci un indirizzo email valido.'
  }
  if (message.includes('INVALID_OWNER_PHONE')) {
    return 'Il numero di cellulare non può superare 50 caratteri.'
  }
  if (message.includes('OWNER_NOT_FOUND')) {
    return 'Il Proprietario selezionato non è più disponibile.'
  }
  if (message.includes('OWNER_TAX_CODE_ALREADY_EXISTS')) {
    return 'Esiste già un Proprietario con questo codice fiscale.'
  }
  if (message.includes('OWNER_VAT_NUMBER_ALREADY_EXISTS')) {
    return 'Esiste già un Proprietario con questa partita IVA.'
  }
  if (message.includes('REQUIRED_OWNER_FIELD_MISSING')) {
    return 'Inserisci tutti i dati obbligatori per il tipo di soggetto scelto.'
  }
  if (message.includes('INVALID_OWNER_TYPE')) {
    return 'Il tipo di Proprietario selezionato non è valido.'
  }
  if (message.includes('INVALID_COUNTRY_CODE')) {
    return 'Inserisci un codice Paese di due lettere, ad esempio IT.'
  }
  if (message.includes('INVALID_OWNER_EMAIL')) {
    return 'Inserisci un indirizzo email valido.'
  }
  if (message.includes('INVALID_OWNER_TAX_CODE')) {
    return 'Il codice fiscale non può superare 32 caratteri.'
  }
  if (message.includes('INVALID_OWNER_VAT_NUMBER')) {
    return 'La partita IVA non può superare 32 caratteri.'
  }
  if (message.includes('INVALID_OWNER_IBAN')) {
    return 'L’IBAN non può superare 34 caratteri.'
  }
  if (message.includes('ACCESS_DENIED')) {
    return 'Il tuo account non è attivo o non è autorizzato a creare Proprietari.'
  }
  return 'Non è stato possibile creare il Proprietario. Controlla i dati e riprova.'
}

type PropertyAllocationDraft = {
  ownerId: string
  percentage: string
}

type PropertyFormValues = {
  internalCode: string
  name: string
  propertyType: string
  status: string
  addressLine1: string
  addressLine2: string
  postalCode: string
  municipality: string
  province: string
  countryCode: string
  surfaceSqm: string
  cadastralSheet: string
  cadastralParcel: string
  cadastralSubaltern: string
  cadastralCategory: string
  cadastralClass: string
  cadastralIncome: string
  notes: string
}

function PropertyDetailDialog({
  property,
  manageableOwners,
  onClose,
  onEdit,
}: {
  property: PropertyRow
  manageableOwners: ManageableOwner[]
  onClose: () => void
  onEdit: () => void
}) {
  const { items: catalogItems } = useReferenceCatalog()
  const [ownerships, setOwnerships] = useState<PropertyOwnershipRow[]>([])
  const [ownersById, setOwnersById] = useState<Map<string, OwnerSummary>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      setError('Connessione al database non disponibile.')
      return
    }

    const client = supabase
    let active = true
    void client
      .from('property_ownerships')
      .select('id, property_id, owner_id, ownership_percentage, valid_from, valid_to')
      .eq('property_id', property.id)
      .order('valid_from')
      .then(async ({ data, error: ownershipError }) => {
        if (!active) return
        if (ownershipError) {
          setError('Non è stato possibile caricare le quote proprietarie.')
          console.error('Property ownership query failed', ownershipError)
          setLoading(false)
          return
        }

        const currentDate = localDateString()
        const currentOwnerships = (data ?? []).filter(
          (ownership) =>
            ownership.valid_from <= currentDate &&
            (ownership.valid_to === null || currentDate < ownership.valid_to),
        )
        setOwnerships(currentOwnerships)

        const ownerIds = [...new Set(currentOwnerships.map((ownership) => ownership.owner_id))]
        if (ownerIds.length > 0) {
          const { data: owners, error: ownersError } = await client
            .from('owners')
            .select('id, owner_type, first_name, last_name, business_name')
            .in('id', ownerIds)

          if (!active) return
          if (ownersError) {
            setError('Non è stato possibile caricare i nominativi dei Proprietari.')
            console.error('Property owners query failed', ownersError)
          } else {
            setOwnersById(new Map((owners ?? []).map((owner) => [owner.id, owner])))
          }
        }
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [property.id])

  const manageableOwnerIds = new Set(
    manageableOwners.map((owner) => owner.owner_id),
  )
  const canEdit = ownerships.some((ownership) =>
    manageableOwnerIds.has(ownership.owner_id),
  )

  return (
    <div className="dialog-backdrop">
      <section
        aria-labelledby="property-detail-title"
        aria-modal="true"
        className="dialog-card"
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">SCHEDA IMMOBILE</span>
            <h2 id="property-detail-title">{property.name}</h2>
            <p>{property.internal_code}</p>
          </div>
          <button
            aria-label="Chiudi scheda immobile"
            className="dialog-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="detail-grid">
          <DetailItem label="Tipologia" value={referenceCatalogLabel(catalogItems, 'property_type', property.property_type)} />
          <DetailItem
            label="Stato"
            value={referenceCatalogLabel(catalogItems, 'entity_status', property.status)}
          />
          <DetailItem
            label="Indirizzo"
            value={
              [property.address_line1, property.address_line2]
                .filter(Boolean)
                .join(', ') || 'Non indicato'
            }
          />
          <DetailItem
            label="Comune"
            value={`${property.postal_code ? `${property.postal_code} ` : ''}${property.municipality}${property.province ? ` (${property.province})` : ''}`}
          />
          <DetailItem label="Paese" value={property.country_code} />
          <DetailItem
            label="Superficie"
            value={
              property.surface_sqm === null
                ? 'Non indicata'
                : `${new Intl.NumberFormat('it-IT').format(property.surface_sqm)} m²`
            }
          />
        </div>

        <section className="detail-section">
          <h3>Dati catastali</h3>
          <div className="detail-grid cadastral-grid">
            <DetailItem label="Foglio" value={cadastralField(property.cadastral_data, 'sheet')} />
            <DetailItem label="Particella" value={cadastralField(property.cadastral_data, 'parcel')} />
            <DetailItem label="Subalterno" value={cadastralField(property.cadastral_data, 'subaltern')} />
            <DetailItem label="Categoria" value={cadastralField(property.cadastral_data, 'category')} />
            <DetailItem label="Classe" value={cadastralField(property.cadastral_data, 'class')} />
            <DetailItem label="Rendita catastale" value={cadastralField(property.cadastral_data, 'income')} />
          </div>
        </section>

        <section className="detail-section">
          <h3>Proprietari e quote</h3>
          {error ? (
            <p className="form-error" role="alert">{error}</p>
          ) : loading ? (
            <LoadingScreen label="Caricamento quote..." compact />
          ) : ownerships.length === 0 ? (
            <p className="detail-muted">Nessuna quota attiva disponibile.</p>
          ) : (
            <ul className="ownership-list">
              {ownerships.map((ownership) => {
                const owner = ownersById.get(ownership.owner_id)
                const ownerName =
                  owner?.business_name ||
                  [owner?.first_name, owner?.last_name].filter(Boolean).join(' ') ||
                  'Proprietario non accessibile'
                return (
                  <li key={ownership.id}>
                    <span>{ownerName}</span>
                    <strong>
                      {new Intl.NumberFormat('it-IT', {
                        maximumFractionDigits: 4,
                      }).format(ownership.ownership_percentage)}%
                    </strong>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {property.notes && (
          <section className="detail-section">
            <h3>Note</h3>
            <p className="detail-notes">{property.notes}</p>
          </section>
        )}

        <div className="dialog-footer">
          {canEdit && (
            <button className="primary-button" onClick={onEdit} type="button">
              Modifica immobile
            </button>
          )}
          <button className="secondary-button" onClick={onClose} type="button">
            Chiudi
          </button>
        </div>
      </section>
    </div>
  )
}

function PropertyEditor({
  mode,
  property,
  manageableOwners,
  loadingManageableOwners,
  manageableOwnersError,
  onCancel,
  onRefreshManageableOwners,
  onSaved,
}: {
  mode: 'create' | 'edit'
  property: PropertyRow | null
  manageableOwners: ManageableOwner[]
  loadingManageableOwners: boolean
  manageableOwnersError: string
  onCancel: () => void
  onRefreshManageableOwners: () => Promise<ManageableOwner[] | null>
  onSaved: (propertyId: string) => Promise<void>
}) {
  const { items: catalogItems, loading: catalogLoading, error: catalogError } = useReferenceCatalog()
  const attachments = useDocumentAttachments('PROPERTY')
  const [values, setValues] = useState<PropertyFormValues>(() => ({
    internalCode: property?.internal_code ?? '',
    name: property?.name ?? '',
    propertyType: property?.property_type ?? 'APARTMENT',
    status: property?.status ?? 'ACTIVE',
    addressLine1: property?.address_line1 ?? '',
    addressLine2: property?.address_line2 ?? '',
    postalCode: property?.postal_code ?? '',
    municipality: property?.municipality ?? '',
    province: property?.province ?? '',
    countryCode: property?.country_code ?? 'IT',
    surfaceSqm: property?.surface_sqm?.toString() ?? '',
    cadastralSheet: cadastralField(property?.cadastral_data ?? null, 'sheet', ''),
    cadastralParcel: cadastralField(property?.cadastral_data ?? null, 'parcel', ''),
    cadastralSubaltern: cadastralField(property?.cadastral_data ?? null, 'subaltern', ''),
    cadastralCategory: cadastralField(property?.cadastral_data ?? null, 'category', ''),
    cadastralClass: cadastralField(property?.cadastral_data ?? null, 'class', ''),
    cadastralIncome: cadastralField(property?.cadastral_data ?? null, 'income', ''),
    notes: property?.notes ?? '',
  }))
  const [allocations, setAllocations] = useState<PropertyAllocationDraft[]>([])
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [createdPropertyId, setCreatedPropertyId] = useState<string | null>(null)
  const [creatingOwnerForAllocation, setCreatingOwnerForAllocation] = useState<number | null>(null)
  const allocationTotal = allocations.reduce(
    (sum, allocation) => sum + (Number(allocation.percentage) || 0),
    0,
  )

  useEffect(() => {
    if (
      mode === 'create' &&
      !loadingManageableOwners &&
      !manageableOwnersError &&
      allocations.length === 0
    ) {
      setAllocations([
        {
          ownerId: manageableOwners[0]?.owner_id ?? '',
          percentage: manageableOwners.length > 0 ? '100' : '',
        },
      ])
    }
  }, [
    allocations.length,
    loadingManageableOwners,
    manageableOwners,
    manageableOwnersError,
    mode,
  ])

  function updateValue(field: keyof PropertyFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  function changeAllocation(
    index: number,
    field: keyof PropertyAllocationDraft,
    value: string,
  ) {
    setAllocations((current) =>
      current.map((allocation, allocationIndex) =>
        allocationIndex === index
          ? { ...allocation, [field]: value }
          : allocation,
      ),
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError('')

    if (createdPropertyId) {
      setSubmitting(true)
      const uploaded = await attachments.uploadForEntity(createdPropertyId)
      setSubmitting(false)
      if (!uploaded) {
        setSubmitError('Immobile salvato. Uno o più allegati non sono ancora stati caricati: riprova prima di uscire.')
        return
      }
      await onSaved(createdPropertyId)
      return
    }

    if (!supabase) {
      setSubmitError('Connessione al database non disponibile.')
      return
    }
    if (catalogLoading || catalogError) {
      setSubmitError(catalogError || 'Caricamento dei cataloghi di riferimento in corso.')
      return
    }
    if (mode === 'create' && attachments.drafts.some((draft) => !draft.file)) {
      setSubmitError('Per ogni documento aggiunto seleziona un file oppure rimuovi la riga.')
      return
    }

    const surface = values.surfaceSqm.trim()
      ? Number(values.surfaceSqm)
      : null
    if (
      surface !== null &&
      (!Number.isFinite(surface) || surface <= 0 || surface > 99999999.99)
    ) {
      setSubmitError('La superficie deve essere maggiore di zero e non superare 99.999.999,99 m².')
      return
    }

    let cadastralData: Json | null = null
    const cadastralFields: Record<string, string> = {
      sheet: values.cadastralSheet,
      parcel: values.cadastralParcel,
      subaltern: values.cadastralSubaltern,
      category: values.cadastralCategory,
      class: values.cadastralClass,
      income: values.cadastralIncome,
    }
    const populatedCadastralFields = Object.fromEntries(
      Object.entries(cadastralFields)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value !== ''),
    )
    if (Object.keys(populatedCadastralFields).length > 0) {
      cadastralData = populatedCadastralFields
    }

    setSubmitting(true)
    if (mode === 'create') {
      if (allocationTotal > 100) {
        setSubmitError('La somma delle percentuali non può superare il 100%.')
        setSubmitting(false)
        return
      }

      const percentages = allocations.map((allocation) =>
        Number(allocation.percentage),
      )
      if (
        allocations.length === 0 ||
        allocations.some(
          (allocation, index) =>
            !allocation.ownerId ||
            !Number.isFinite(percentages[index]) ||
            percentages[index] <= 0 ||
            percentages[index] > 100,
        )
      ) {
        setSubmitError('Inserisci Proprietari e quote maggiori di 0 e non superiori al 100%.')
        setSubmitting(false)
        return
      }

      const total = percentages.reduce((sum, percentage) => sum + percentage, 0)
      if (Math.round(total * 10000) !== 1000000) {
        setSubmitError('La somma delle quote deve essere esattamente il 100%.')
        setSubmitting(false)
        return
      }
    }

    const commonFields = {
      p_internal_code: values.internalCode.trim(),
      p_name: values.name.trim(),
      p_property_type: values.propertyType,
      p_municipality: values.municipality.trim(),
      p_address_line1: values.addressLine1,
      p_address_line2: values.addressLine2,
      p_postal_code: values.postalCode,
      p_province: values.province,
      p_country_code: values.countryCode.trim().toUpperCase(),
      p_surface_sqm: surface,
      p_notes: values.notes,
      p_cadastral_data: cadastralData,
    }

    const result =
      mode === 'create'
        ? await supabase.rpc('create_property_with_ownership', {
            ...commonFields,
            p_ownerships: allocations.map((allocation) => ({
              owner_id: allocation.ownerId,
              ownership_percentage: Number(allocation.percentage),
            })),
          })
        : await supabase.rpc('update_property_details', {
            ...commonFields,
            p_property_id: property?.id ?? '',
            p_status: values.status,
          })

    if (result.error) {
      setSubmitting(false)
      setSubmitError(propertyRpcErrorMessage(result.error.message))
      console.error(`Property ${mode} RPC failed`, result.error)
      return
    }

    if (!result.data?.property_id) {
      setSubmitting(false)
      setSubmitError('Il salvataggio non ha restituito l’identificativo dell’immobile.')
      console.error(`Property ${mode} RPC returned no property id`, result.data)
      return
    }

    if (mode === 'create' && attachments.drafts.length > 0) {
      setCreatedPropertyId(result.data.property_id)
      const uploaded = await attachments.uploadForEntity(result.data.property_id)
      if (!uploaded) {
        setSubmitting(false)
        setSubmitError('Immobile salvato. Uno o più allegati non sono ancora stati caricati: riprova prima di uscire.')
        return
      }
    }
    setSubmitting(false)
    await onSaved(result.data.property_id)
  }

  const createOwnerSelectionAvailable =
    mode === 'edit' || manageableOwners.length > 0
  const selectedOwnerIds = new Set(
    allocations.map((allocation) => allocation.ownerId).filter(Boolean),
  )
  const hasUnselectedAllocation = allocations.some(
    (allocation) => !allocation.ownerId,
  )
  const nextAvailableOwner = manageableOwners.find(
    (owner) => !selectedOwnerIds.has(owner.owner_id),
  )

  return (
    <section aria-labelledby="property-editor-title" className="full-page-editor">
        <header className="full-page-heading">
          <div>
            <span className="eyebrow">
              {mode === 'create' ? 'NUOVO IMMOBILE' : 'MODIFICA IMMOBILE'}
            </span>
            <h1 id="property-editor-title">
              {mode === 'create' ? 'Inserisci un immobile' : 'Modifica i dati'}
            </h1>
            <p>
              {mode === 'create'
                ? 'I dati e le quote vengono salvati insieme in modo sicuro.'
                : 'Aggiorna i dati descrittivi dell’immobile.'}
            </p>
          </div>
          <button
            aria-label="Annulla e torna indietro"
            className="dialog-close"
            onClick={() => void cancelEditorWithAttachments(attachments, onCancel, setSubmitError)}
            type="button"
          >
            ×
          </button>
        </header>

        <form className="property-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-section">
            <h3>Dati generali</h3>
            <div className="form-grid">
              <FormField label="Codice interno" required>
                <input
                  autoComplete="off"
                  maxLength={100}
                  onChange={(event) => updateValue('internalCode', event.target.value)}
                  required
                  value={values.internalCode}
                />
              </FormField>
              <FormField label="Denominazione" required>
                <input
                  maxLength={200}
                  onChange={(event) => updateValue('name', event.target.value)}
                  required
                  value={values.name}
                />
              </FormField>
              <FormField label="Tipologia" required>
                <select
                  onChange={(event) => updateValue('propertyType', event.target.value)}
                  required
                  value={values.propertyType}
                >
                  {referenceCatalogItems(catalogItems, 'property_type', values.propertyType).map(({ code, label }) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </FormField>
              {mode === 'edit' && (
                <FormField label="Stato" required>
                  <select
                    onChange={(event) => updateValue('status', event.target.value)}
                    value={values.status}
                  >
                    {referenceCatalogItems(catalogItems, 'entity_status', values.status).map(({ code, label }) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                </FormField>
              )}
              <FormField label="Indirizzo">
                <input
                  onChange={(event) => updateValue('addressLine1', event.target.value)}
                  value={values.addressLine1}
                />
              </FormField>
              <FormField label="Dettaglio indirizzo">
                <input
                  onChange={(event) => updateValue('addressLine2', event.target.value)}
                  value={values.addressLine2}
                />
              </FormField>
              <FormField label="CAP">
                <input
                  autoComplete="postal-code"
                  onChange={(event) => updateValue('postalCode', event.target.value)}
                  value={values.postalCode}
                />
              </FormField>
              <FormField label="Comune" required>
                <input
                  onChange={(event) => updateValue('municipality', event.target.value)}
                  required
                  value={values.municipality}
                />
              </FormField>
              <FormField label="Provincia">
                <input
                  maxLength={2}
                  onChange={(event) => updateValue('province', event.target.value)}
                  value={values.province}
                />
              </FormField>
              <FormField label="Codice Paese" required>
                <input
                  maxLength={2}
                  onChange={(event) => updateValue('countryCode', event.target.value)}
                  required
                  value={values.countryCode}
                />
              </FormField>
              <FormField label="Superficie (m²)">
                <input
                  min="0.01"
                  max="99999999.99"
                  onChange={(event) => updateValue('surfaceSqm', event.target.value)}
                  step="0.01"
                  type="number"
                  value={values.surfaceSqm}
                />
              </FormField>
            </div>
          </div>

          <div className="form-section">
            <h3>Dati catastali</h3>
            <div className="form-grid cadastral-form-grid">
              <FormField label="Foglio">
                <input
                  onChange={(event) => updateValue('cadastralSheet', event.target.value)}
                  value={values.cadastralSheet}
                />
              </FormField>
              <FormField label="Particella">
                <input
                  onChange={(event) => updateValue('cadastralParcel', event.target.value)}
                  value={values.cadastralParcel}
                />
              </FormField>
              <FormField label="Subalterno">
                <input
                  onChange={(event) => updateValue('cadastralSubaltern', event.target.value)}
                  value={values.cadastralSubaltern}
                />
              </FormField>
              <FormField label="Categoria">
                <input
                  onChange={(event) => updateValue('cadastralCategory', event.target.value)}
                  value={values.cadastralCategory}
                />
              </FormField>
              <FormField label="Classe">
                <input
                  onChange={(event) => updateValue('cadastralClass', event.target.value)}
                  value={values.cadastralClass}
                />
              </FormField>
              <FormField label="Rendita catastale (€)">
                <input
                  onChange={(event) => updateValue('cadastralIncome', event.target.value)}
                  value={values.cadastralIncome}
                />
              </FormField>
            </div>
          </div>

          {mode === 'create' && (
            <div className="form-section">
              <div className="section-heading-row">
                <div>
                  <h3>Proprietari e quote</h3>
                  <p>La somma delle quote deve essere pari al 100%.</p>
                </div>
                {allocationTotal < 100 && (
                  <button
                    className="text-button"
                    disabled={
                      loadingManageableOwners ||
                      Boolean(manageableOwnersError) ||
                      hasUnselectedAllocation ||
                      allocationTotal > 100
                    }
                    onClick={() => {
                      setAllocations((current) => [
                        ...current,
                        { ownerId: nextAvailableOwner?.owner_id ?? '', percentage: '' },
                      ])
                    }}
                    type="button"
                  >
                    + Aggiungi proprietario
                  </button>
                )}
              </div>
              {loadingManageableOwners ? (
                <LoadingScreen label="Caricamento Proprietari..." compact />
              ) : manageableOwnersError ? (
                <p className="form-error" role="alert">{manageableOwnersError}</p>
              ) : (
                <>
                  {manageableOwners.length === 0 && (
                    <p className="detail-muted">
                      Non hai Proprietari nel tuo perimetro. Seleziona «Nuovo proprietario» nell’elenco per registrarne uno.
                    </p>
                  )}
                  <div className="allocation-list">
                    {allocations.map((allocation, index) => (
                      <div className="allocation-row" key={`allocation-${index}`}>
                        <label className="form-field">
                          <span>Proprietario</span>
                          <select
                            onChange={(event) => {
                              if (event.target.value === '__create_new_owner__') {
                                setCreatingOwnerForAllocation(index)
                                return
                              }
                              changeAllocation(index, 'ownerId', event.target.value)
                            }}
                            required
                            value={allocation.ownerId}
                          >
                            {!allocation.ownerId && (
                              <option disabled value="">
                                Seleziona un Proprietario
                              </option>
                            )}
                            {manageableOwners.map((owner) => (
                              <option
                                disabled={allocations.some(
                                  (other, otherIndex) =>
                                    otherIndex !== index &&
                                    other.ownerId === owner.owner_id,
                                )}
                                key={owner.owner_id}
                                value={owner.owner_id}
                              >
                                {owner.owner_name}
                              </option>
                            ))}
                            <option value="__create_new_owner__">+ Nuovo proprietario</option>
                          </select>
                        </label>
                        <label className="form-field">
                          <span>Quota (%)</span>
                          <input
                            max="100"
                            min="0.0001"
                            onChange={(event) =>
                              changeAllocation(index, 'percentage', event.target.value)
                            }
                            required
                            step="0.0001"
                            type="number"
                            value={allocation.percentage}
                          />
                        </label>
                        {allocations.length > 1 && (
                          <button
                            aria-label="Rimuovi proprietario"
                            className="allocation-remove"
                            onClick={() =>
                              setAllocations((current) =>
                                current.filter((_, allocationIndex) => allocationIndex !== index),
                              )
                            }
                            type="button"
                          >
                            Rimuovi
                          </button>
                        )}
                      </div>
                    ))}
                    <p className="allocation-total">
                      Totale:{' '}
                      {new Intl.NumberFormat('it-IT', {
                        maximumFractionDigits: 4,
                      }).format(allocationTotal)}%
                    </p>
                    {allocationTotal > 100 && (
                      <p className="form-error" role="alert">
                        La somma delle percentuali non può superare il 100%.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="form-section">
            <h3>Note</h3>
            <textarea
              onChange={(event) => updateValue('notes', event.target.value)}
              rows={3}
              value={values.notes}
            />
          </div>

          {mode === 'create' && (
            <DocumentAttachmentFields attachments={attachments} disabled={submitting} />
          )}

          {(catalogError || submitError) && (
            <p className="form-error" role="alert">{catalogError || submitError}</p>
          )}
          <div className="dialog-footer">
            <button
              className="primary-button"
              disabled={
                submitting ||
                catalogLoading ||
                Boolean(catalogError) ||
                (mode === 'create' &&
                  (!createOwnerSelectionAvailable || loadingManageableOwners))
              }
              type="submit"
            >
              {submitting
                ? 'Salvataggio…'
                : createdPropertyId
                  ? 'Riprova allegati'
                  : mode === 'create'
                  ? 'Crea immobile'
                  : 'Salva modifiche'}
            </button>
            <button
              className="secondary-button"
              disabled={submitting}
              onClick={() => void cancelEditorWithAttachments(attachments, onCancel, setSubmitError)}
              type="button"
            >
              Annulla
            </button>
          </div>
        </form>
      {creatingOwnerForAllocation !== null && (
        <OwnerEditor
          nested
          onCancel={() => setCreatingOwnerForAllocation(null)}
          onSaved={async (ownerId) => {
            const refreshedOwners = await onRefreshManageableOwners()
            setCreatingOwnerForAllocation(null)
            if (refreshedOwners?.some((owner) => owner.owner_id === ownerId)) {
              changeAllocation(creatingOwnerForAllocation, 'ownerId', ownerId)
            } else {
              setSubmitError(
                'Proprietario creato, ma non è stato possibile aggiornare l’elenco. Riprova a ricaricare i Proprietari.',
              )
            }
          }}
        />
      )}
    </section>
  )
}

function FormField({
  label,
  required = false,
  children,
}: {
  label: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="form-field">
      <span>{label}{required ? ' *' : ''}</span>
      {children}
    </label>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value || 'Non indicato'}</strong>
    </div>
  )
}

function cadastralField(
  value: Json | null,
  key: string,
  fallback = 'Non indicato',
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
  const field = value[key]
  return typeof field === 'string' || typeof field === 'number'
    ? String(field)
    : fallback
}

function localDateString() {
  const now = new Date()
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return localDate.toISOString().slice(0, 10)
}

function addMonthsToDate(value: string, months: number) {
  const [year, month, day] = value.split('-').map(Number)
  const targetMonthStart = new Date(Date.UTC(year, month - 1 + months, 1))
  const targetYear = targetMonthStart.getUTCFullYear()
  const targetMonth = targetMonthStart.getUTCMonth()
  const targetMonthLength = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const targetDay = Math.min(day, targetMonthLength)
  return new Date(Date.UTC(targetYear, targetMonth, targetDay)).toISOString().slice(0, 10)
}

function subtractOneDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function initialContractEndDate(contractType: string, startDate: string) {
  const durationMonths: Record<string, number> = {
    RESIDENTIAL_FREE: 48,
    RESIDENTIAL_AGREED: 36,
    COMMERCIAL: 72,
  }
  const months = durationMonths[contractType]
  return months ? subtractOneDay(addMonthsToDate(startDate, months)) : ''
}

function minimumTransitoryEndDate(startDate: string) {
  return subtractOneDay(addMonthsToDate(startDate, 1))
}

function maximumTransitoryEndDate(startDate: string) {
  return subtractOneDay(addMonthsToDate(startDate, 18))
}

function isValidTransitoryDuration(startDate: string, endDate: string) {
  return endDate >= minimumTransitoryEndDate(startDate)
    && endDate <= maximumTransitoryEndDate(startDate)
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

function tenantDisplayName(tenant: Pick<ManageableTenant, 'business_name' | 'first_name' | 'last_name'>) {
  return tenant.business_name || [tenant.first_name, tenant.last_name].filter(Boolean).join(' ') || 'Locatario'
}

function referenceCatalogLabel(
  items: ReferenceCatalogItem[],
  catalogCode: string,
  code: string,
) {
  return items.find((item) => item.catalog_code === catalogCode && item.code === code)?.label
    ?? humanize(code)
}

function contractRpcErrorMessage(message: string) {
  if (message.includes('ACCESS_DENIED')) {
    return 'Non hai i permessi Manager necessari per questa operazione.'
  }
  if (message.includes('PROPERTY_NOT_ACTIVE')) {
    return 'L’immobile non è attivo o non è più disponibile.'
  }
  if (message.includes('INVALID_CONTRACT_CODE') || message.includes('contracts_internal_code_key')) {
    return 'Inserisci un codice contratto valido e non già utilizzato.'
  }
  if (message.includes('INVALID_CONTRACT_TYPE')) {
    return 'La tipologia di contratto selezionata non è valida.'
  }
  if (message.includes('INVALID_LEGAL_CONTRACT_TYPE')) {
    return 'Seleziona una delle tipologie legali disponibili.'
  }
  if (message.includes('CONTRACT_DURATION_BELOW_LEGAL_MINIMUM')) {
    return 'La durata iniziale è inferiore al minimo previsto per la tipologia selezionata.'
  }
  if (message.includes('INVALID_TRANSITORY_DURATION')) {
    return 'La durata del contratto transitorio deve essere compresa tra 1 e 18 mesi.'
  }
  if (message.includes('TRANSITORY_REASON_REQUIRED')) {
    return 'Per un contratto transitorio è obbligatorio indicare l’esigenza transitoria.'
  }
  if (message.includes('TRANSITORY_REASON_TOO_LONG')) {
    return 'La motivazione transitoria non può superare 4.000 caratteri.'
  }
  if (message.includes('AGREED_RENT_REQUIRED')) {
    return 'Il contratto 3+2 richiede l’applicazione del canone concordato.'
  }
  if (message.includes('AGREED_RENT_NOT_APPLICABLE')) {
    return 'Il canone concordato selezionato non è applicabile a questa tipologia.'
  }
  if (message.includes('CEDOLARE_NOT_APPLICABLE')) {
    return 'La cedolare secca non è applicabile ai contratti commerciali.'
  }
  if (message.includes('INVALID_CONTRACT_DATES')) {
    return 'Le date del contratto non sono valide: la scadenza deve essere uguale o successiva alla decorrenza.'
  }
  if (message.includes('INVALID_BASE_RENT')) {
    return 'Inserisci un canone valido e non negativo.'
  }
  if (message.includes('INVALID_SECURITY_DEPOSIT')) {
    return 'Inserisci un deposito cauzionale valido e non negativo.'
  }
  if (message.includes('INVALID_BILLING_FREQUENCY')) {
    return 'La periodicità selezionata non è valida.'
  }
  if (message.includes('INVALID_DUE_DAY')) {
    return 'Il giorno di scadenza deve essere compreso tra 1 e 31.'
  }
  if (message.includes('INVALID_FIRST_BILLING_PERIOD')) {
    return 'Il primo periodo di fatturazione deve rientrare nella durata del contratto.'
  }
  if (message.includes('TENANT_NOT_ACCESSIBLE')) {
    return 'Il Locatario selezionato non è associato a questo immobile.'
  }
  if (message.includes('CONTRACT_OBJECT_ALREADY_RENTED')) {
    return 'L’immobile o una delle porzioni selezionate è già locata in un contratto attivo nello stesso periodo.'
  }
  if (message.includes('INVALID_RENTABLE_SPACE') || message.includes('DUPLICATE_RENTABLE_SPACE')) {
    return 'Una o più porzioni selezionate non sono disponibili per questo immobile.'
  }
  if (message.includes('INVALID_TENANT_TYPE')) {
    return 'Il tipo di Locatario selezionato non è valido.'
  }
  if (message.includes('REQUIRED_TENANT_FIELD_MISSING')) {
    return 'Completa il nome e cognome oppure la ragione sociale del Locatario.'
  }
  if (message.includes('INVALID_TENANT_EMAIL')) {
    return 'Inserisci un indirizzo email valido.'
  }
  if (message.includes('INVALID_TENANT_PHONE')) {
    return 'Il numero di cellulare non può superare 50 caratteri.'
  }
  if (message.includes('INVALID_TENANT_TAX_CODE')) {
    return 'Il codice fiscale o la Partita IVA non può superare 32 caratteri.'
  }
  if (message.includes('CONTRACT_NOT_ACTIVATABLE')) {
    return 'Immobile non attivo o data di scadenza del contratto già passata.'
  }
  return 'Non è stato possibile completare l’operazione. Verifica i dati e riprova.'
}

function propertyRpcErrorMessage(message: string) {
  if (message.includes('OWNERSHIP_PERCENTAGE_MUST_TOTAL_100')) {
    return 'La somma delle quote deve essere esattamente il 100%.'
  }
  if (message.includes('ACCESS_DENIED')) {
    return 'Non hai i permessi per gestire questo immobile o Proprietario.'
  }
  if (message.includes('INVALID_PROPERTY_SURFACE')) {
    return 'La superficie deve essere maggiore di zero e non superare 99.999.999,99 m².'
  }
  if (message.includes('INVALID_COUNTRY_CODE')) {
    return 'Inserisci un codice Paese di due lettere, ad esempio IT.'
  }
  if (message.includes('INVALID_PROPERTY_STATUS')) {
    return 'Lo stato selezionato non è valido.'
  }
  if (
    message.includes('INVALID_OWNERSHIP_ALLOCATION') ||
    message.includes('OWNERSHIP_ALLOCATIONS_REQUIRED')
  ) {
    return 'Inserisci una ripartizione delle quote valida.'
  }
  if (message.includes('REQUIRED_PROPERTY_FIELD_MISSING')) {
    return 'Compila tutti i campi obbligatori.'
  }
  if (
    message.includes('duplicate key') ||
    message.includes('properties_internal_code')
  ) {
    return 'Il codice interno è già utilizzato. Scegline un altro.'
  }
  return 'Non è stato possibile salvare l’immobile. Controlla i dati e riprova.'
}

function StatCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string
  value: string
  detail: string
  icon: string
}) {
  return (
    <article className="stat-card">
      <div className="stat-topline">
        <span>{label}</span>
        <span aria-hidden="true" className="stat-icon">
          {icon}
        </span>
      </div>
      <strong>{value}</strong>
      <span className="stat-detail">{detail}</span>
    </article>
  )
}

function Brand({
  onToggle,
  expanded,
}: {
  onToggle?: () => void
  expanded?: boolean
}) {
  return (
    <div className="brand">
      {onToggle ? (
        <button
          aria-expanded={expanded}
          aria-label={expanded ? 'Nascondi menu laterale' : 'Apri menu laterale'}
          className="brand-mark-button"
          onClick={onToggle}
          type="button"
        >
          <BrandMark />
        </button>
      ) : (
        <BrandMark />
      )}
      <span>
        Gestione<span className="brand-light">Immobili</span>
      </span>
    </div>
  )
}

function BrandMark() {
  return (
    <span aria-hidden="true" className="brand-mark">
      <span />
      <span />
      <span />
    </span>
  )
}

function LoadingScreen({
  label,
  compact = false,
}: {
  label: string
  compact?: boolean
}) {
  return (
    <div
      aria-live="polite"
      className={`loading-screen${compact ? ' loading-compact' : ''}`}
      role="status"
    >
      <span className="spinner" />
      <span>{label}</span>
    </div>
  )
}

function humanize(value: string) {
  return value
    .toLocaleLowerCase('it-IT')
    .replaceAll('_', ' ')
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase('it-IT'))
}

export default App
