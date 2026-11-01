import { useEffect, useState } from 'react'
import type { ManageableContract, ManageableProperty, ManageableTenant } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { useReferenceCatalog, formatDate, formatCurrency, tenantDisplayName, referenceCatalogLabel, LoadingScreen, type Page } from '../../app/shared'
import { ContractDetailPage } from './ContractDetailPage'
import { TenantEditor } from './TenantEditor'
import { ContractEditor } from './ContractEditor'

export function ContractsManagementPanel({
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
