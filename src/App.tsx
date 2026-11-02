import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { ManageableOwner, PropertyRow } from './lib/database.types'
import { unavailableSections, ReferenceCatalogContext, StatCard, Brand, LoadingScreen, type Page, type ReferenceCatalogState } from './app/shared'

const PropertyTable = lazy(() => import('./features/properties/PropertyTable').then((module) => ({ default: module.PropertyTable })))
const PropertyDetailDialog = lazy(() => import('./features/properties/PropertyManagement').then((module) => ({ default: module.PropertyDetailDialog })))
const PropertyEditor = lazy(() => import('./features/properties/PropertyManagement').then((module) => ({ default: module.PropertyEditor })))
const OwnersManagementPanel = lazy(() => import('./features/owners/OwnersManagementPanel').then((module) => ({ default: module.OwnersManagementPanel })))
const DocumentsManagementPanel = lazy(() => import('./features/documents/DocumentsFeature').then((module) => ({ default: module.DocumentsManagementPanel })))
const ContractsManagementPanel = lazy(() => import('./features/contracts/ContractsManagementPanel').then((module) => ({ default: module.ContractsManagementPanel })))

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
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onError('')
    setStatus('')

    if (mode === 'signup' && password !== passwordConfirmation) {
      onError('Le password non coincidono.')
      return
    }

    setSubmitting(true)

    try {
      if (mode === 'signup') {
        const { error: signUpError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              display_name: `${firstName.trim()} ${lastName.trim()}`,
            },
          },
        })

        if (signUpError) {
          onError('Registrazione non riuscita. Verifica i dati e riprova.')
          console.error('Supabase sign up failed', signUpError)
        } else {
          setStatus('Registrazione completata. Se richiesto, controlla la tua email per confermare l’account.')
        }
      } else {
        const { error: signInError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (signInError) {
          onError('Accesso non riuscito. Controlla email e password e riprova.')
          console.error('Supabase sign in failed', signInError)
        }
      }
    } catch (requestError) {
      onError(mode === 'signup'
        ? 'Registrazione non riuscita. Verifica i dati e riprova.'
        : 'Accesso non riuscito. Riprova.')
      console.error('Supabase authentication request failed', requestError)
    } finally {
      setSubmitting(false)
    }
  }

  const isSigningUp = mode === 'signup'

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
          <button className="primary-button full-width" disabled={submitting}>
            {submitting
              ? (isSigningUp ? 'Registrazione in corso…' : 'Accesso in corso…')
              : (isSigningUp ? 'Registrati' : 'Accedi')}
          </button>
        </form>
        {status && <p className="form-success" role="status">{status}</p>}
        <button
          className="auth-mode-toggle"
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
            <Suspense fallback={<LoadingScreen label="Caricamento editor immobile…" />}>
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
            </Suspense>
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
            <Suspense fallback={<LoadingScreen label="Caricamento Proprietari…" />}>
              <OwnersManagementPanel
                onOwnerEditorOpenChange={setFullPageWorkflowOpen}
                onOwnerCreated={async () => {
                  await refreshManageableOwners()
                }}
              />
            </Suspense>
          ) : page === 'contracts' || page === 'tenants' ? (
            <Suspense fallback={<LoadingScreen label="Caricamento contratti e Locatari…" />}>
              <ContractsManagementPanel
                onFullPageChange={setFullPageWorkflowOpen}
                onPageChange={setPage}
                page={page}
              />
            </Suspense>
          ) : page === 'documents' ? (
            <Suspense fallback={<LoadingScreen label="Caricamento Documenti…" />}>
              <DocumentsManagementPanel />
            </Suspense>
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
              <Suspense fallback={<LoadingScreen label="Caricamento immobili…" compact />}>
                <PropertyTable
                  properties={
                    page === 'overview'
                      ? filteredProperties.slice(0, 5)
                      : filteredProperties
                  }
                  onSelect={setSelectedProperty}
                />
              </Suspense>
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
        <Suspense fallback={<LoadingScreen label="Caricamento dettaglio immobile…" />}>
          <PropertyDetailDialog
            manageableOwners={manageableOwners}
            onClose={() => setSelectedProperty(null)}
            onEdit={() => setPropertyEditorMode('edit')}
            property={selectedProperty}
          />
        </Suspense>
      )}
    </div>
    </ReferenceCatalogContext.Provider>
  )
}

export default App
