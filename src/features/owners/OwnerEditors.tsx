import { useState, type FormEvent } from 'react'
import type { OwnerListRow } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'
import { useReferenceCatalog, referenceCatalogItems, ownerDisplayName, ownerRpcErrorMessage, FormField, DetailItem, referenceCatalogLabel } from '../../app/shared'
import { useDocumentAttachments, DocumentAttachmentFields, cancelEditorWithAttachments } from '../documents/attachments'

export type OwnerFormValues = {
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

export function OwnerContactEditor({
  owner,
  onCancel,
  onSaved,
}: {
  owner: OwnerListRow
  onCancel: () => void
  onSaved: (email: string | null, phone: string | null) => Promise<void>
}) {
  const { items: catalogItems } = useReferenceCatalog()
  const attachments = useDocumentAttachments('OWNER')
  const [email, setEmail] = useState(owner.email ?? '')
  const [phone, setPhone] = useState(owner.phone ?? '')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [ownerDetailsSaved, setOwnerDetailsSaved] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError('')
    if (attachments.drafts.some((draft) => !draft.file)) {
      setSubmitError('Per ogni documento aggiunto seleziona un file oppure rimuovi la riga.')
      return
    }

    if (ownerDetailsSaved) {
      setSubmitting(true)
      const uploaded = await attachments.uploadForEntity(owner.id)
      setSubmitting(false)
      if (!uploaded) {
        setSubmitError('Contatti salvati. Uno o più allegati non sono ancora stati caricati: riprova prima di uscire.')
        return
      }
      await onSaved(email || null, phone || null)
      return
    }

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
    setEmail(data.email ?? '')
    setPhone(data.phone ?? '')
    setOwnerDetailsSaved(true)

    if (attachments.drafts.length > 0) {
      setSubmitting(true)
      const uploaded = await attachments.uploadForEntity(owner.id)
      setSubmitting(false)
      if (!uploaded) {
        setSubmitError('Contatti salvati. Uno o più allegati non sono ancora stati caricati: riprova prima di uscire.')
        return
      }
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
        <button
          className="secondary-button"
          disabled={submitting}
          onClick={() => void cancelEditorWithAttachments(attachments, onCancel, setSubmitError)}
          type="button"
        >
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

        <DocumentAttachmentFields attachments={attachments} disabled={submitting} />

        {submitError && <p className="form-error" role="alert">{submitError}</p>}
        <div className="dialog-footer">
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting
              ? 'Salvataggio…'
              : ownerDetailsSaved
                ? 'Riprova allegati'
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
    </section>
  )
}

export function OwnerEditor({
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
