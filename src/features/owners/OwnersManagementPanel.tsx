import { useEffect, useMemo, useState } from 'react'
import type { OwnerListRow } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { useReferenceCatalog, ownerDisplayName, referenceCatalogLabel, LoadingScreen } from '../../app/shared'
import { OwnerContactEditor, OwnerEditor } from './OwnerEditors'

export function OwnersManagementPanel({
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
