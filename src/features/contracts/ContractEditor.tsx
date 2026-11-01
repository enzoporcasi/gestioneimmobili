import { useEffect, useState, type FormEvent } from 'react'
import type { ManageableProperty, ManageableRentableSpace, ManageableTenant } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { useReferenceCatalog, referenceCatalogItems, FormField, localDateString, initialContractEndDate, minimumTransitoryEndDate, maximumTransitoryEndDate, isValidTransitoryDuration, tenantDisplayName, contractRpcErrorMessage, LoadingScreen } from '../../app/shared'
import { useDocumentAttachments, DocumentAttachmentFields, cancelEditorWithAttachments } from '../documents/attachments'

export function ContractEditor({
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
