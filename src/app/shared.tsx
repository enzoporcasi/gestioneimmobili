import { createContext, useContext, type ReactNode } from 'react'
import type { Json, ManageableTenant, OwnerSummary, ReferenceCatalogItem } from '../lib/database.types'

export type Page = 'overview' | 'properties' | 'owners' | 'contracts' | 'tenants' | 'documents'

export const unavailableSections = [
  'Canoni e incassi',
  'Spese',
  'Scadenze',
]

export type ReferenceCatalogState = {
  items: ReferenceCatalogItem[]
  loading: boolean
  error: string
}

export const ReferenceCatalogContext = createContext<ReferenceCatalogState>({
  items: [],
  loading: true,
  error: '',
})

export function useReferenceCatalog() {
  return useContext(ReferenceCatalogContext)
}

export function referenceCatalogItems(
  items: ReferenceCatalogItem[],
  catalogCode: string,
  includeInactiveCode?: string,
) {
  return items.filter((item) =>
    item.catalog_code === catalogCode
    && (item.is_active || item.code === includeInactiveCode),
  )
}

export function ownerDisplayName(owner: OwnerSummary) {
  return owner.business_name ||
    [owner.first_name, owner.last_name].filter(Boolean).join(' ') ||
    'Proprietario'
}

export function ownerRpcErrorMessage(message: string) {
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

export function FormField({
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

export function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value || 'Non indicato'}</strong>
    </div>
  )
}

export function cadastralField(
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

export function localDateString() {
  const now = new Date()
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return localDate.toISOString().slice(0, 10)
}

export function addMonthsToDate(value: string, months: number) {
  const [year, month, day] = value.split('-').map(Number)
  const targetMonthStart = new Date(Date.UTC(year, month - 1 + months, 1))
  const targetYear = targetMonthStart.getUTCFullYear()
  const targetMonth = targetMonthStart.getUTCMonth()
  const targetMonthLength = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const targetDay = Math.min(day, targetMonthLength)
  return new Date(Date.UTC(targetYear, targetMonth, targetDay)).toISOString().slice(0, 10)
}

export function subtractOneDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

export function initialContractEndDate(contractType: string, startDate: string) {
  const durationMonths: Record<string, number> = {
    RESIDENTIAL_FREE: 48,
    RESIDENTIAL_AGREED: 36,
    COMMERCIAL: 72,
  }
  const months = durationMonths[contractType]
  return months ? subtractOneDay(addMonthsToDate(startDate, months)) : ''
}

export function minimumTransitoryEndDate(startDate: string) {
  return subtractOneDay(addMonthsToDate(startDate, 1))
}

export function maximumTransitoryEndDate(startDate: string) {
  return subtractOneDay(addMonthsToDate(startDate, 18))
}

export function isValidTransitoryDuration(startDate: string, endDate: string) {
  return endDate >= minimumTransitoryEndDate(startDate)
    && endDate <= maximumTransitoryEndDate(startDate)
}

export function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

export function tenantDisplayName(tenant: Pick<ManageableTenant, 'business_name' | 'first_name' | 'last_name'>) {
  return tenant.business_name || [tenant.first_name, tenant.last_name].filter(Boolean).join(' ') || 'Locatario'
}

export function referenceCatalogLabel(
  items: ReferenceCatalogItem[],
  catalogCode: string,
  code: string,
) {
  return items.find((item) => item.catalog_code === catalogCode && item.code === code)?.label
    ?? humanize(code)
}

export function contractRpcErrorMessage(message: string) {
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

export function propertyRpcErrorMessage(message: string) {
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

export function StatCard({
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

export function Brand({
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

export function BrandMark() {
  return (
    <span aria-hidden="true" className="brand-mark">
      <span />
      <span />
      <span />
    </span>
  )
}

export function LoadingScreen({
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

export function humanize(value: string) {
  return value
    .toLocaleLowerCase('it-IT')
    .replaceAll('_', ' ')
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase('it-IT'))
}
