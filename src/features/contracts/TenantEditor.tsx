import { useState, type FormEvent } from 'react'
import type { ManageableProperty } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { useReferenceCatalog, referenceCatalogItems, FormField, contractRpcErrorMessage } from '../../app/shared'
import { useDocumentAttachments, DocumentAttachmentFields, cancelEditorWithAttachments } from '../documents/attachments'

export function TenantEditor({
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
