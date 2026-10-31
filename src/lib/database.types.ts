export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type PropertyRow = {
  id: string
  internal_code: string
  name: string
  property_type: string
  status: string
  address_line1: string | null
  address_line2: string | null
  postal_code: string | null
  municipality: string
  province: string | null
  country_code: string
  cadastral_data: Json | null
  surface_sqm: number | null
  notes: string | null
}

export type ManageableOwner = {
  owner_id: string
  owner_name: string
  owner_type: string
}

export type PropertyOwnershipRow = {
  id: string
  property_id: string
  owner_id: string
  ownership_percentage: number
  valid_from: string
  valid_to: string | null
}

export type OwnerSummary = {
  id: string
  owner_type: string
  first_name: string | null
  last_name: string | null
  business_name: string | null
}

export type OwnerListRow = OwnerSummary & {
  tax_code: string | null
  vat_number: string | null
  email: string | null
  phone: string | null
  status: string
  municipality: string | null
  province: string | null
}

type PropertyInsert = Omit<PropertyRow, 'id'> & { id?: string }
type PropertyUpdate = Partial<Omit<PropertyRow, 'id'>>

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          first_name: string
          last_name: string
          display_name: string | null
        }
        Insert: {
          id: string
          first_name: string
          last_name: string
          display_name?: string | null
        }
        Update: Partial<{
          first_name: string
          last_name: string
          display_name: string | null
        }>
        Relationships: []
      }
      owners: {
        Row: {
          id: string
          owner_type: string
          first_name: string | null
          last_name: string | null
          business_name: string | null
          tax_code: string | null
          vat_number: string | null
          email: string | null
          phone: string | null
          status: string
          municipality: string | null
          province: string | null
        }
        Insert: {
          id?: string
          owner_type: string
          first_name?: string | null
          last_name?: string | null
          business_name?: string | null
          tax_code?: string | null
          vat_number?: string | null
          email?: string | null
          phone?: string | null
          status?: string
          municipality?: string | null
          province?: string | null
        }
        Update: Partial<{
          owner_type: string
          first_name: string | null
          last_name: string | null
          business_name: string | null
          tax_code: string | null
          vat_number: string | null
          email: string | null
          phone: string | null
          status: string
          municipality: string | null
          province: string | null
        }>
        Relationships: []
      }
      property_ownerships: {
        Row: PropertyOwnershipRow
        Insert: Omit<PropertyOwnershipRow, 'id'> & { id?: string }
        Update: Partial<Omit<PropertyOwnershipRow, 'id'>>
        Relationships: []
      }
      properties: {
        Row: PropertyRow
        Insert: PropertyInsert
        Update: PropertyUpdate
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      list_manageable_owners: {
        Args: Record<PropertyKey, never>
        Returns: ManageableOwner[]
      }
      create_owner_with_access: {
        Args: {
          p_owner_type: string
          p_first_name?: string | null
          p_last_name?: string | null
          p_business_name?: string | null
          p_tax_code?: string | null
          p_vat_number?: string | null
          p_email?: string | null
          p_phone?: string | null
          p_address_line1?: string | null
          p_address_line2?: string | null
          p_postal_code?: string | null
          p_municipality?: string | null
          p_province?: string | null
          p_country_code?: string
          p_iban?: string | null
          p_notes?: string | null
        }
        Returns: { owner_id: string }
      }
      create_property_with_ownership: {
        Args: {
          p_internal_code: string
          p_name: string
          p_property_type: string
          p_municipality: string
          p_ownerships: Json
          p_address_line1?: string | null
          p_address_line2?: string | null
          p_postal_code?: string | null
          p_province?: string | null
          p_country_code?: string
          p_surface_sqm?: number | null
          p_notes?: string | null
          p_cadastral_data?: Json
        }
        Returns: { property_id: string }
      }
      update_property_details: {
        Args: {
          p_property_id: string
          p_internal_code: string
          p_name: string
          p_property_type: string
          p_status: string
          p_municipality: string
          p_address_line1?: string | null
          p_address_line2?: string | null
          p_postal_code?: string | null
          p_province?: string | null
          p_country_code?: string
          p_surface_sqm?: number | null
          p_notes?: string | null
          p_cadastral_data?: Json
        }
        Returns: { property_id: string }
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
