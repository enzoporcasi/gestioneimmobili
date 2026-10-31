export type PropertyRow = {
  id: string
  internal_code: string
  name: string
  property_type: string
  status: string
  municipality: string
  province: string | null
  country_code: string
  surface_sqm: number | null
}

export type Database = {
  public: {
    Tables: {
      properties: {
        Row: PropertyRow
        Insert: Omit<PropertyRow, 'id'> & { id?: string }
        Update: Partial<Omit<PropertyRow, 'id'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
