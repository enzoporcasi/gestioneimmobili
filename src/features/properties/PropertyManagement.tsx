import { useEffect, useState, type FormEvent } from 'react'
import type { Json, ManageableOwner, OwnerSummary, PropertyOwnershipRow, PropertyRow } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { useReferenceCatalog, referenceCatalogItems, FormField, DetailItem, cadastralField, localDateString, referenceCatalogLabel, propertyRpcErrorMessage, LoadingScreen } from '../../app/shared'
import { useDocumentAttachments, DocumentAttachmentFields, cancelEditorWithAttachments } from '../documents/attachments'
import { OwnerEditor } from '../owners/OwnerEditors'

export type PropertyAllocationDraft = {
  ownerId: string
  percentage: string
}

export type PropertyFormValues = {
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

export function PropertyDetailDialog({
  property,
  manageableOwners,
  onClose,
  onEdit,
  onAddExpense,
}: Readonly<{
  property: PropertyRow
  manageableOwners: ManageableOwner[]
  onClose: () => void
  onEdit: () => void
  onAddExpense: () => void
}>) {
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
          {canEdit && <button className="secondary-button" onClick={onAddExpense} type="button">Nuova spesa</button>}
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

export function PropertyEditor({
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
    if (attachments.drafts.some((draft) => !draft.file)) {
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

    if (attachments.drafts.length > 0) {
      if (mode === 'create') {
        setCreatedPropertyId(result.data.property_id)
      }
      const uploaded = await attachments.uploadForEntity(result.data.property_id)
      if (!uploaded) {
        setSubmitting(false)
        setSubmitError(
          mode === 'create'
            ? 'Immobile salvato. Uno o più allegati non sono ancora stati caricati: riprova prima di uscire.'
            : 'Modifiche salvate. Uno o più allegati non sono ancora stati caricati: riprova prima di uscire.',
        )
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

          <DocumentAttachmentFields attachments={attachments} disabled={submitting} />

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
