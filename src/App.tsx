import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type {
  Json,
  ManageableOwner,
  OwnerListRow,
  OwnerSummary,
  PropertyOwnershipRow,
  PropertyRow,
} from './lib/database.types'

type Page = 'overview' | 'properties' | 'owners'

const unavailableSections = [
  'Contratti',
  'Canoni e incassi',
  'Spese',
  'Documenti',
  'Scadenze',
]

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
  const [manageableOwners, setManageableOwners] = useState<ManageableOwner[]>([])
  const [loadingManageableOwners, setLoadingManageableOwners] = useState(true)
  const [manageableOwnersError, setManageableOwnersError] = useState('')
  const [selectedProperty, setSelectedProperty] = useState<PropertyRow | null>(null)
  const [propertyEditorMode, setPropertyEditorMode] = useState<'create' | 'edit' | null>(null)
  const [signOutError, setSignOutError] = useState('')
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    window.matchMedia('(min-width: 761px)').matches,
  )

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
    <div className="app-shell">
      {sidebarOpen && (
        <button
          aria-label="Chiudi menu"
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}
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
            onClick={() => {
              setPage('overview')
              setSidebarOpen(false)
            }}
          >
            <span className="nav-symbol">⌂</span>
            Panoramica
          </button>
          <button
            className={`nav-item${page === 'properties' ? ' nav-item-active' : ''}`}
            onClick={() => {
              setPage('properties')
              setSidebarOpen(false)
            }}
          >
            <span className="nav-symbol">▦</span>
            Immobili
            <span className="nav-count">{properties.length}</span>
          </button>
          <button
            className={`nav-item${page === 'owners' ? ' nav-item-active' : ''}`}
            onClick={() => {
              setPage('owners')
              setSidebarOpen(false)
            }}
          >
            <span className="nav-symbol">♙</span>
            Proprietari
          </button>
          <div className="nav-divider" />
          <span className="nav-section-label">OPERATIVITÀ</span>
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
                  : 'Proprietari'}
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

        <main className="page-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">IL TUO PATRIMONIO</span>
              <h1>
                {page === 'overview'
                  ? `Ciao${userName ? `, ${userName.split(' ')[0]}` : ''}`
                  : page === 'properties'
                    ? 'Immobili'
                    : 'Proprietari'}
              </h1>
              <p>
                {page === 'overview'
                  ? 'Una vista d’insieme degli immobili a cui hai accesso.'
                  : page === 'properties'
                    ? 'Consulta gli immobili visibili nel tuo perimetro.'
                    : 'Gestisci i Proprietari presenti nel tuo perimetro di accesso.'}
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
          </div>

          {page !== 'owners' && (
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
              onOwnerCreated={async () => {
                await refreshManageableOwners()
              }}
            />
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
          <footer className="page-footer">
            <span>GestioneImmobili</span>
            <span>La gestione del tuo patrimonio, in un unico spazio.</span>
          </footer>
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
      {propertyEditorMode && (
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
      )}
    </div>
  )
}

function PropertyTable({
  properties,
  onSelect,
}: {
  properties: PropertyRow[]
  onSelect: (property: PropertyRow) => void
}) {
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
              <td>{humanize(property.property_type)}</td>
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
                  {property.status === 'ACTIVE' ? 'Attivo' : 'Inattivo'}
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
}: {
  onOwnerCreated: () => Promise<void>
}) {
  const [owners, setOwners] = useState<OwnerListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)

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
                  <th>CONTATTO</th>
                  <th>LOCALITÀ</th>
                  <th>STATO</th>
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
                    <td>{owner.owner_type === 'LEGAL_ENTITY' ? 'Persona giuridica' : 'Persona fisica'}</td>
                    <td className="muted-cell">{owner.tax_code || owner.vat_number || '—'}</td>
                    <td>{owner.email || owner.phone || '—'}</td>
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
                        {owner.status === 'ACTIVE' ? 'Attivo' : 'Inattivo'}
                      </span>
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

function OwnerEditor({
  onCancel,
  onSaved,
  nested = false,
}: {
  onCancel: () => void
  onSaved: (ownerId: string) => Promise<void>
  nested?: boolean
}) {
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

  function updateValue(field: keyof OwnerFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError('')
    if (!supabase) {
      setSubmitError('Connessione al database non disponibile.')
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
    setSubmitting(false)

    if (error) {
      setSubmitError(ownerRpcErrorMessage(error.message))
      console.error('Owner creation RPC failed', error)
      return
    }

    if (!data?.owner_id) {
      setSubmitError('Il salvataggio non ha restituito l’identificativo del Proprietario.')
      console.error('Owner creation RPC returned no owner id', data)
      return
    }

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
            onClick={onCancel}
            type="button"
          >
            ×
          </button>
        </div>

        <form className="property-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-section">
            <h3>Tipo di soggetto</h3>
            <div className="owner-type-switch" role="group" aria-label="Tipo di Proprietario">
              <button
                aria-pressed={values.ownerType === 'NATURAL_PERSON'}
                className={values.ownerType === 'NATURAL_PERSON' ? 'owner-type-active' : ''}
                onClick={() => updateValue('ownerType', 'NATURAL_PERSON')}
                type="button"
              >
                Persona fisica
              </button>
              <button
                aria-pressed={values.ownerType === 'LEGAL_ENTITY'}
                className={values.ownerType === 'LEGAL_ENTITY' ? 'owner-type-active' : ''}
                onClick={() => updateValue('ownerType', 'LEGAL_ENTITY')}
                type="button"
              >
                Persona giuridica
              </button>
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
              <FormField label="Telefono">
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

          {submitError && <p className="form-error" role="alert">{submitError}</p>}
          <div className="dialog-footer">
            <button className="primary-button" disabled={submitting} type="submit">
              {submitting ? 'Salvataggio…' : 'Crea Proprietario'}
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
    </div>
  )
}

function ownerDisplayName(owner: OwnerSummary) {
  return owner.business_name ||
    [owner.first_name, owner.last_name].filter(Boolean).join(' ') ||
    'Proprietario'
}

function ownerRpcErrorMessage(message: string) {
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

const propertyTypes = [
  ['APARTMENT', 'Appartamento'],
  ['COMMERCIAL', 'Commerciale'],
  ['GARAGE', 'Garage'],
  ['PARKING', 'Posto auto'],
  ['STORAGE', 'Deposito'],
  ['LAND', 'Terreno'],
  ['OTHER', 'Altro'],
]

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
          <DetailItem label="Tipologia" value={humanize(property.property_type)} />
          <DetailItem
            label="Stato"
            value={property.status === 'ACTIVE' ? 'Attivo' : 'Inattivo'}
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

    if (!supabase) {
      setSubmitError('Connessione al database non disponibile.')
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

    setSubmitting(false)
    if (result.error) {
      setSubmitError(propertyRpcErrorMessage(result.error.message))
      console.error(`Property ${mode} RPC failed`, result.error)
      return
    }

    if (!result.data?.property_id) {
      setSubmitError('Il salvataggio non ha restituito l’identificativo dell’immobile.')
      console.error(`Property ${mode} RPC returned no property id`, result.data)
      return
    }

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
    <div className="dialog-backdrop">
      <section
        aria-labelledby="property-editor-title"
        aria-modal="true"
        className="dialog-card editor-dialog"
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">
              {mode === 'create' ? 'NUOVO IMMOBILE' : 'MODIFICA IMMOBILE'}
            </span>
            <h2 id="property-editor-title">
              {mode === 'create' ? 'Inserisci un immobile' : 'Modifica i dati'}
            </h2>
            <p>
              {mode === 'create'
                ? 'I dati e le quote vengono salvati insieme in modo sicuro.'
                : 'Aggiorna i dati descrittivi dell’immobile.'}
            </p>
          </div>
          <button
            aria-label="Chiudi modulo"
            className="dialog-close"
            onClick={onCancel}
            type="button"
          >
            ×
          </button>
        </div>

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
                  {propertyTypes.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                  {!propertyTypes.some(([value]) => value === values.propertyType) && (
                    <option value={values.propertyType}>
                      {humanize(values.propertyType)}
                    </option>
                  )}
                </select>
              </FormField>
              {mode === 'edit' && (
                <FormField label="Stato" required>
                  <select
                    onChange={(event) => updateValue('status', event.target.value)}
                    value={values.status}
                  >
                    <option value="ACTIVE">Attivo</option>
                    <option value="INACTIVE">Inattivo</option>
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

          {submitError && (
            <p className="form-error" role="alert">{submitError}</p>
          )}
          <div className="dialog-footer">
            <button
              className="primary-button"
              disabled={
                submitting ||
                (mode === 'create' &&
                  (!createOwnerSelectionAvailable || loadingManageableOwners))
              }
              type="submit"
            >
              {submitting
                ? 'Salvataggio…'
                : mode === 'create'
                  ? 'Crea immobile'
                  : 'Salva modifiche'}
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
    </div>
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
