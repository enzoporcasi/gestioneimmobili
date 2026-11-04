import { lazy, Suspense, useEffect, useMemo, useState, type SubmitEvent } from 'react'
import type { AuthError, Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { ManageableOwner, PropertyRow } from './lib/database.types'
import { unavailableSections, ReferenceCatalogContext, StatCard, Brand, LoadingScreen, type Page, type ReferenceCatalogState } from './app/shared'

const PropertyTable = lazy(() => import('./features/properties/PropertyTable').then((module) => ({ default: module.PropertyTable })))
const PropertyDetailDialog = lazy(() => import('./features/properties/PropertyManagement').then((module) => ({ default: module.PropertyDetailDialog })))
const PropertyEditor = lazy(() => import('./features/properties/PropertyManagement').then((module) => ({ default: module.PropertyEditor })))
const OwnersManagementPanel = lazy(() => import('./features/owners/OwnersManagementPanel').then((module) => ({ default: module.OwnersManagementPanel })))
const DocumentsManagementPanel = lazy(() => import('./features/documents/DocumentsFeature').then((module) => ({ default: module.DocumentsManagementPanel })))
const ContractsManagementPanel = lazy(() => import('./features/contracts/ContractsManagementPanel').then((module) => ({ default: module.ContractsManagementPanel })))
const BillingManagementPanel = lazy(() => import('./features/billing/BillingManagementPanel').then((module) => ({ default: module.BillingManagementPanel })))
const ExpensesManagementPanel = lazy(() => import('./features/expenses/ExpensesManagementPanel').then((module) => ({ default: module.ExpensesManagementPanel })))
const ExpenseEditor = lazy(() => import('./features/expenses/ExpenseEditor').then((module) => ({ default: module.ExpenseEditor })))

function authenticationErrorMessage(error: AuthError, fallback: string) {
  if (error.status === 0) {
    return 'Servizio di autenticazione non raggiungibile. Verifica la connessione e riprova.'
  }
  if (error.code === 'email_not_confirmed') {
    return 'Conferma il tuo indirizzo email prima di accedere. Puoi richiedere un nuovo link di attivazione.'
  }
  if (error.status === 429) {
    return 'Troppi tentativi. Attendi prima di richiedere una nuova email o riprovare.'
  }
  return fallback
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

    const callbackParameters = new URLSearchParams(window.location.hash.slice(1))
    if (callbackParameters.has('error')) {
      setAuthError('Il link di attivazione non è valido o è scaduto. Inserisci la tua email e richiedi un nuovo link.')
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }

    let active = true
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession)
        if (nextSession) setAuthError('')
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
}: Readonly<{
  error: string
  onError: (message: string) => void
  client: NonNullable<typeof supabase>
}>) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [status, setStatus] = useState('')

  async function registerAccount() {
    const { error: signUpError } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          display_name: `${firstName.trim()} ${lastName.trim()}`,
        },
      },
    })

    if (signUpError) {
      onError(authenticationErrorMessage(signUpError, 'Registrazione non riuscita. Verifica i dati e riprova.'))
      console.error('Supabase sign up failed', signUpError)
      return
    }
    setPassword('')
    setPasswordConfirmation('')
    setMode('signin')
    setStatus('Controlla la tua email e apri il link di attivazione per confermare il tuo account prima di accedere.')
  }

  async function signIn() {
    const { error: signInError } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (signInError) {
      onError(authenticationErrorMessage(signInError, 'Accesso non riuscito. Controlla email e password e riprova.'))
      console.error('Supabase sign in failed', signInError)
    }
  }

  async function resendConfirmation() {
    onError('')
    setStatus('')
    if (!email.trim()) {
      onError('Inserisci la tua email per ricevere un nuovo link di attivazione.')
      return
    }
    setResending(true)
    try {
      const { error: resendError } = await client.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      })
      if (resendError) {
        onError(authenticationErrorMessage(resendError, 'Non è stato possibile inviare l’email di attivazione. Riprova.'))
        return
      }
      setStatus('Se l’account richiede conferma, riceverai una nuova email con il link di attivazione.')
    } catch {
      onError('Servizio di autenticazione non raggiungibile. Verifica la connessione e riprova.')
    } finally {
      setResending(false)
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    onError('')
    setStatus('')

    if (mode === 'signup' && password !== passwordConfirmation) {
      onError('Le password non coincidono.')
      return
    }
    if (mode === 'signup' && (!firstName.trim() || !lastName.trim())) {
      onError('Inserisci nome e cognome.')
      return
    }

    setSubmitting(true)

    try {
      if (mode === 'signup') {
        await registerAccount()
      } else {
        await signIn()
      }
    } catch (requestError) {
      onError('Servizio di autenticazione non raggiungibile. Verifica la connessione e riprova.')
      console.error('Supabase authentication request failed', requestError)
    } finally {
      setSubmitting(false)
    }
  }

  const isSigningUp = mode === 'signup'
  const idleSubmitLabel = isSigningUp ? 'Registrati' : 'Accedi'
  const busySubmitLabel = isSigningUp ? 'Registrazione in corso…' : 'Accesso in corso…'

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="signin-title">
        <Brand />
        <div className="auth-heading">
          <span className="eyebrow">Area riservata</span>
          <h1 id="signin-title">{isSigningUp ? 'Crea il tuo account' : 'Bentornata'}</h1>
          <p>{isSigningUp
            ? 'Registrati per iniziare a gestire i tuoi immobili.'
            : 'Accedi al tuo spazio di gestione immobiliare.'}</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          {isSigningUp && (
            <>
              <label htmlFor="first-name">Nome</label>
              <input
                autoComplete="given-name"
                id="first-name"
                onChange={(event) => setFirstName(event.target.value)}
                required
                type="text"
                value={firstName}
              />
              <label htmlFor="last-name">Cognome</label>
              <input
                autoComplete="family-name"
                id="last-name"
                onChange={(event) => setLastName(event.target.value)}
                required
                type="text"
                value={lastName}
              />
            </>
          )}
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
            autoComplete={isSigningUp ? 'new-password' : 'current-password'}
            id="password"
            minLength={isSigningUp ? 8 : undefined}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          {isSigningUp && (
            <>
              <label htmlFor="password-confirmation">Conferma password</label>
              <input
                autoComplete="new-password"
                id="password-confirmation"
                minLength={8}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                required
                type="password"
                value={passwordConfirmation}
              />
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button full-width" disabled={submitting || resending} type="submit">
            {submitting ? busySubmitLabel : idleSubmitLabel}
          </button>
        </form>
        {status && <p className="form-success"><output>{status}</output></p>}
        {!isSigningUp && (
          <button
            className="auth-mode-toggle"
            disabled={submitting || resending}
            onClick={() => void resendConfirmation()}
            type="button"
          >
            {resending ? 'Invio in corso…' : 'Invia di nuovo l’email di attivazione'}
          </button>
        )}
        <button
          className="auth-mode-toggle"
          disabled={submitting || resending}
          onClick={() => {
            setMode(isSigningUp ? 'signin' : 'signup')
            setStatus('')
            onError('')
          }}
          type="button"
        >
          {isSigningUp ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati'}
        </button>
        <p className="auth-footnote">Autenticazione protetta da Supabase Auth.</p>
      </section>
    </main>
  )
}

function useWorkspaceData(userId: string, initialName: string) {
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

  return {
    userId, userName, profileError, properties, loadingProperties, propertyError,
    referenceCatalog, manageableOwners, loadingManageableOwners, manageableOwnersError,
    refreshReferenceCatalog, refreshManageableOwners, refreshProperties,
  }
}

type WorkspaceData = ReturnType<typeof useWorkspaceData>

function usePropertyWorkflow(refreshProperties: WorkspaceData['refreshProperties']) {
  const [selectedProperty, setSelectedProperty] = useState<PropertyRow | null>(null)
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null)
  const [search, setSearch] = useState('')

  async function handleSaved(propertyId: string) {
    const refreshed = await refreshProperties()
    setSelectedProperty(refreshed?.find((property) => property.id === propertyId) ?? null)
    setEditorMode(null)
  }

  return { selectedProperty, setSelectedProperty, editorMode, setEditorMode, search, setSearch, handleSaved }
}

type PropertyWorkflow = ReturnType<typeof usePropertyWorkflow>
type WorkspacePageProps = Readonly<{
  page: Page
  data: WorkspaceData
  workflow: PropertyWorkflow
  fullPageWorkflowOpen: boolean
  onPageChange: (page: Page) => void
  onFullPageChange: (open: boolean) => void
  expenseProperty: PropertyRow | null
  onCancelExpense: () => void
  onExpenseSaved: () => void
}>

const workspacePages: Record<Page, { label: string; symbol: string; description: string }> = {
  overview: { label: 'Panoramica', symbol: '⌂', description: 'Una vista d’insieme degli immobili a cui hai accesso.' },
  properties: { label: 'Immobili', symbol: '▦', description: 'Consulta gli immobili visibili nel tuo perimetro.' },
  owners: { label: 'Proprietari', symbol: '♙', description: 'Gestisci i Proprietari presenti nel tuo perimetro di accesso.' },
  contracts: { label: 'Contratti', symbol: '▤', description: 'Gestisci i contratti collegati agli immobili e ai Locatari.' },
  tenants: { label: 'Locatari', symbol: '♧', description: 'Consulta i Locatari collegati agli immobili che gestisci.' },
  documents: { label: 'Documenti', symbol: '▧', description: 'Allega e consulta i documenti dei Proprietari, degli immobili, dei Locatari e dei contratti.' },
  billing: { label: 'Canoni e incassi', symbol: '€', description: 'Consulta rate, residui e incassi del tuo patrimonio.' },
  expenses: { label: 'Spese', symbol: '−', description: 'Consulta e registra le spese degli immobili nel tuo perimetro.' },
}

function WorkspaceNavigationButton({ page, activePage, count, onPageChange }: Readonly<{
  page: Page
  activePage: Page
  count?: number
  onPageChange: (page: Page) => void
}>) {
  const entry = workspacePages[page]
  return (
    <button
      className={`nav-item${page === activePage ? ' nav-item-active' : ''}`}
      onClick={() => onPageChange(page)}
      type="button"
    >
      <span className="nav-symbol">{entry.symbol}</span>
      {' '}
      {entry.label}
      {count !== undefined && <span className="nav-count">{count}</span>}
    </button>
  )
}

function WorkspaceSidebar({ page, propertyCount, open, onToggle, onPageChange }: Readonly<{
  page: Page
  propertyCount: number
  open: boolean
  onToggle: () => void
  onPageChange: (page: Page) => void
}>) {
  const mainPages: Page[] = ['overview', 'properties', 'owners', 'contracts', 'tenants']
  return (
    <aside className={`sidebar${open ? ' sidebar-open' : ' sidebar-collapsed'}`}>
      <div className="sidebar-brand"><Brand onToggle={onToggle} expanded={open} /></div>
      <div className="workspace-label">GESTIONE PATRIMONIO</div>
      <nav aria-label="Navigazione principale" className="main-nav">
        {mainPages.map((entry) => (
          <WorkspaceNavigationButton
            key={entry}
            page={entry}
            activePage={page}
            count={entry === 'properties' ? propertyCount : undefined}
            onPageChange={onPageChange}
          />
        ))}
        <div className="nav-divider" />
        <span className="nav-section-label">OPERATIVITÀ</span>
        <WorkspaceNavigationButton page="billing" activePage={page} onPageChange={onPageChange} />
        <WorkspaceNavigationButton page="expenses" activePage={page} onPageChange={onPageChange} />
        <WorkspaceNavigationButton page="documents" activePage={page} onPageChange={onPageChange} />
        {unavailableSections.map((section) => (
          <div className="nav-item nav-item-disabled" key={section}>
            <span className="nav-symbol">○</span>
            {' '}
            {section}
            <span className="soon-dot" title="In sviluppo" />
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy-chip">
          <span className="privacy-indicator" />
          {' '}
          Accesso protetto
        </div>
        <span className="sidebar-version">GestioneImmobili · Web</span>
      </div>
    </aside>
  )
}

function WorkspaceTopbar({ page, email, sidebarOpen, profileError, signOutError, onOpenSidebar, onSignOut }: Readonly<{
  page: Page
  email: string
  sidebarOpen: boolean
  profileError: string
  signOutError: string
  onOpenSidebar: () => void
  onSignOut: () => Promise<void>
}>) {
  return (
    <header className="topbar">
      {!sidebarOpen && <Brand onToggle={onOpenSidebar} expanded={false} />}
      <div className="breadcrumb">
        <span>Workspace</span>
        <span className="breadcrumb-separator">/</span>
        <strong>{workspacePages[page].label}</strong>
      </div>
      <div className="topbar-user">
        {profileError && <span className="signout-error" role="alert">{profileError}</span>}
        {signOutError && <span className="signout-error" role="alert">{signOutError}</span>}
        <div className="user-copy">
          <span className="user-name">{email}</span>
          <span className="user-role">Account autenticato</span>
        </div>
        <div aria-hidden="true" className="user-avatar">{email.charAt(0).toLocaleUpperCase('it-IT')}</div>
        <button className="signout-button" onClick={() => void onSignOut()} type="button">Esci</button>
      </div>
    </header>
  )
}

function WorkspacePageHeading({ page, userName }: Readonly<{ page: Page; userName: string }>) {
  const greeting = userName ? `Ciao, ${userName.split(' ')[0]}` : 'Ciao'
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">IL TUO PATRIMONIO</span>
        <h1>{page === 'overview' ? greeting : workspacePages[page].label}</h1>
        <p>{workspacePages[page].description}</p>
      </div>
      <div className="today-label">
        <span className="today-dot" />
        {new Intl.DateTimeFormat('it-IT', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        }).format(new Date())}
      </div>
    </div>
  )
}

function WorkspaceStats({ properties, loading }: Readonly<{ properties: PropertyRow[]; loading: boolean }>) {
  const activeProperties = properties.filter((property) => property.status === 'ACTIVE').length
  const municipalities = new Set(properties.map((property) => property.municipality)).size
  return (
    <section aria-label="Riepilogo immobili" className="stats-grid">
      <StatCard label="Immobili visibili" value={loading ? '—' : properties.length.toString()} detail="Nel tuo perimetro" icon="⌂" />
      <StatCard label="In gestione" value={loading ? '—' : activeProperties.toString()} detail="Stato attivo" icon="↗" />
      <StatCard label="Comuni" value={loading ? '—' : municipalities.toString()} detail="Località presenti" icon="◎" />
    </section>
  )
}

function WorkspacePropertyEditor({ data, workflow }: Readonly<{ data: WorkspaceData; workflow: PropertyWorkflow }>) {
  const mode = workflow.editorMode
  if (!mode) return null
  return (
    <Suspense fallback={<LoadingScreen label="Caricamento editor immobile…" />}>
      <PropertyEditor
        key={`${mode}-${workflow.selectedProperty?.id ?? 'new'}`}
        manageableOwners={data.manageableOwners}
        loadingManageableOwners={data.loadingManageableOwners}
        manageableOwnersError={data.manageableOwnersError}
        mode={mode}
        onCancel={() => workflow.setEditorMode(null)}
        onRefreshManageableOwners={data.refreshManageableOwners}
        onSaved={workflow.handleSaved}
        property={mode === 'edit' ? workflow.selectedProperty : null}
      />
    </Suspense>
  )
}

function PropertyListBody({ page, data, filteredProperties, onSelect }: Readonly<{
  page: Page
  data: WorkspaceData
  filteredProperties: PropertyRow[]
  onSelect: (property: PropertyRow) => void
}>) {
  if (data.propertyError) {
    return (
      <div className="inline-error" role="alert">
        <span>{data.propertyError}</span>
        <button className="allocation-add-button" onClick={() => void data.refreshProperties()} type="button">Ricarica</button>
      </div>
    )
  }
  if (data.loadingProperties) return <LoadingScreen label="Caricamento immobili..." compact />
  if (filteredProperties.length === 0) {
    const hasProperties = data.properties.length > 0
    return (
      <div className="empty-state">
        <div className="empty-icon">⌂</div>
        <h3>{hasProperties ? 'Nessun risultato' : 'Nessun immobile visibile'}</h3>
        <p>{hasProperties
          ? 'Prova a modificare i termini di ricerca.'
          : 'Quando il tuo account avrà accesso a un immobile, lo troverai qui.'}</p>
      </div>
    )
  }
  return (
    <Suspense fallback={<LoadingScreen label="Caricamento immobili…" compact />}>
      <PropertyTable properties={page === 'overview' ? filteredProperties.slice(0, 5) : filteredProperties} onSelect={onSelect} />
    </Suspense>
  )
}

function WorkspacePropertyList({ page, data, workflow }: Readonly<{
  page: Page
  data: WorkspaceData
  workflow: PropertyWorkflow
}>) {
  const filteredProperties = useMemo(() => {
    const query = workflow.search.trim().toLocaleLowerCase('it-IT')
    if (!query) return data.properties
    return data.properties.filter((property) =>
      [property.name, property.internal_code, property.municipality, property.province ?? '']
        .join(' ').toLocaleLowerCase('it-IT').includes(query),
    )
  }, [data.properties, workflow.search])
  const propertyNoun = data.properties.length === 1 ? 'immobile' : 'immobili'
  const listDescription = `${data.properties.length} ${propertyNoun} nel tuo perimetro`
  const missingOwnerTitle = data.manageableOwners.length === 0 && !data.loadingManageableOwners
    ? 'Serve almeno un Proprietario attivo nel tuo perimetro di gestione.'
    : undefined
  return (
    <section className="content-card">
      <div className="card-heading">
        <div>
          <h2>{page === 'overview' ? 'Immobili recenti' : 'Elenco immobili'}</h2>
          <p>{page === 'overview' ? 'Gli immobili disponibili per il tuo account.' : listDescription}</p>
        </div>
        <div className="card-actions">
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Cerca immobili"
              onChange={(event) => workflow.setSearch(event.target.value)}
              placeholder="Cerca per nome, codice o città"
              value={workflow.search}
            />
          </label>
          {page === 'properties' && (
            <button
              className="primary-button compact-button"
              disabled={data.loadingManageableOwners}
              onClick={() => workflow.setEditorMode('create')}
              title={data.manageableOwnersError || missingOwnerTitle}
              type="button"
            >
              + Nuovo immobile
            </button>
          )}
        </div>
      </div>
      <PropertyListBody page={page} data={data} filteredProperties={filteredProperties} onSelect={workflow.setSelectedProperty} />
      <div className="data-footnote">I dati mostrati rispettano il perimetro di accesso del tuo account.</div>
    </section>
  )
}

function WorkspaceFeaturePage({ page, data, workflow, onPageChange, onFullPageChange }: WorkspacePageProps) {
  switch (page) {
    case 'expenses':
      return (
        <Suspense fallback={<LoadingScreen label="Caricamento Spese..." />}>
          <ExpensesManagementPanel userId={data.userId} onFullPageChange={onFullPageChange} />
        </Suspense>
      )
    case 'billing':
      return (
        <Suspense fallback={<LoadingScreen label="Caricamento Canoni e incassi..." />}>
          <BillingManagementPanel properties={data.properties} userId={data.userId} onFullPageChange={onFullPageChange} />
        </Suspense>
      )
    case 'owners':
      return (
        <Suspense fallback={<LoadingScreen label="Caricamento Proprietari…" />}>
          <OwnersManagementPanel onOwnerEditorOpenChange={onFullPageChange} onOwnerCreated={async () => { await data.refreshManageableOwners() }} />
        </Suspense>
      )
    case 'contracts':
    case 'tenants':
      return (
        <Suspense fallback={<LoadingScreen label="Caricamento contratti e Locatari…" />}>
          <ContractsManagementPanel onFullPageChange={onFullPageChange} onPageChange={onPageChange} page={page} />
        </Suspense>
      )
    case 'documents':
      return (
        <Suspense fallback={<LoadingScreen label="Caricamento Documenti…" />}>
          <DocumentsManagementPanel />
        </Suspense>
      )
    default:
      return <WorkspacePropertyList page={page} data={data} workflow={workflow} />
  }
}

function WorkspacePage(props: WorkspacePageProps) {
  const { page, data, workflow, fullPageWorkflowOpen } = props
  if (props.expenseProperty) return (
    <Suspense fallback={<LoadingScreen label="Caricamento nuova spesa..." />}>
      <ExpenseEditor initialProperty={{ ...props.expenseProperty, can_manage: true }} userId={data.userId} onCancel={props.onCancelExpense} onSaved={props.onExpenseSaved} />
    </Suspense>
  )
  if (workflow.editorMode) return <WorkspacePropertyEditor data={data} workflow={workflow} />
  return (
    <>
      {!fullPageWorkflowOpen && <WorkspacePageHeading page={page} userName={data.userName} />}
      {!fullPageWorkflowOpen && (page === 'overview' || page === 'properties') && (
        <WorkspaceStats properties={data.properties} loading={data.loadingProperties} />
      )}
      <WorkspaceFeaturePage {...props} />
      {!fullPageWorkflowOpen && (
        <footer className="page-footer">
          <span>GestioneImmobili</span>
          <span>La gestione del tuo patrimonio, in un unico spazio.</span>
        </footer>
      )}
    </>
  )
}

function Workspace({ email, userId, initialName, onSignOut }: Readonly<{
  email: string
  userId: string
  initialName: string
  onSignOut: () => Promise<string | null>
}>) {
  const [page, setPage] = useState<Page>('overview')
  const [fullPageWorkflowOpen, setFullPageWorkflowOpen] = useState(false)
  const [expenseProperty, setExpenseProperty] = useState<PropertyRow | null>(null)
  const [signOutError, setSignOutError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 761px)').matches)
  const data = useWorkspaceData(userId, initialName)
  const workflow = usePropertyWorkflow(data.refreshProperties)

  async function handleSignOut() {
    const error = await onSignOut()
    setSignOutError(error ?? '')
  }

  return (
    <ReferenceCatalogContext.Provider value={data.referenceCatalog}>
      <div className="app-shell">
        <WorkspaceSidebar
          page={page}
          propertyCount={data.properties.length}
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((open) => !open)}
          onPageChange={(nextPage) => { setExpenseProperty(null); setPage(nextPage) }}
        />
        <div className="main-column">
          <WorkspaceTopbar
            page={page}
            email={email}
            sidebarOpen={sidebarOpen}
            profileError={data.profileError}
            signOutError={signOutError}
            onOpenSidebar={() => setSidebarOpen(true)}
            onSignOut={handleSignOut}
          />
          <main className={`page-content${workflow.editorMode || fullPageWorkflowOpen || expenseProperty ? ' page-content-full' : ''}`}>
            {data.referenceCatalog.error && (
              <div className="inline-error" role="alert">
                <span>{data.referenceCatalog.error}</span>
                <button className="allocation-add-button" onClick={() => void data.refreshReferenceCatalog()} type="button">Ricarica</button>
              </div>
            )}
            <WorkspacePage
              page={page}
              data={data}
              workflow={workflow}
              fullPageWorkflowOpen={fullPageWorkflowOpen}
              onPageChange={setPage}
              onFullPageChange={setFullPageWorkflowOpen}
              expenseProperty={expenseProperty}
              onCancelExpense={() => {
                workflow.setSelectedProperty(expenseProperty)
                setExpenseProperty(null)
              }}
              onExpenseSaved={() => {
                setExpenseProperty(null)
                setPage('expenses')
              }}
            />
          </main>
        </div>
        {workflow.selectedProperty && !workflow.editorMode && (
          <Suspense fallback={<LoadingScreen label="Caricamento dettaglio immobile…" />}>
            <PropertyDetailDialog
              manageableOwners={data.manageableOwners}
              onClose={() => workflow.setSelectedProperty(null)}
              onEdit={() => workflow.setEditorMode('edit')}
              onAddExpense={() => {
                setExpenseProperty(workflow.selectedProperty)
                workflow.setSelectedProperty(null)
              }}
              property={workflow.selectedProperty}
            />
          </Suspense>
        )}
      </div>
    </ReferenceCatalogContext.Provider>
  )
}

export default App
