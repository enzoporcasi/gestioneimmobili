import type { PropertyRow } from '../../lib/database.types'
import { useReferenceCatalog, referenceCatalogLabel } from '../../app/shared'

export function PropertyTable({
  properties,
  onSelect,
}: {
  properties: PropertyRow[]
  onSelect: (property: PropertyRow) => void
}) {
  const { items: catalogItems } = useReferenceCatalog()
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
              <td>{referenceCatalogLabel(catalogItems, 'property_type', property.property_type)}</td>
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
                  {referenceCatalogLabel(catalogItems, 'entity_status', property.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
