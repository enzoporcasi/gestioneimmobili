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

export type ManageableProperty = {
  property_id: string
  internal_code: string
  property_name: string
  municipality: string
}

export type ManageableRentableSpace = {
  space_id: string
  space_code: string
  space_name: string
}

export type ManageableTenant = {
  tenant_id: string
  property_id: string
  tenant_type: string
  first_name: string | null
  last_name: string | null
  business_name: string | null
  tax_code: string | null
  email: string | null
  phone: string | null
}

export type ManageableContract = {
  contract_id: string
  internal_code: string
  property_id: string
  property_name: string
  object_type: string
  contract_type: string
  management_status: string
  lifecycle_status: string
  start_date: string
  end_date: string
  security_deposit_amount: number | null
  base_rent_amount: number
  billing_frequency: string
  due_day: number
  tenant_id: string
  tenant_name: string
  tenant_email: string | null
  tenant_phone: string | null
  rentable_space_names: string
  notes: string | null
  agreed_rent_applied: boolean
  tax_regime: string | null
  transitory_reason: string | null
}

export type ReferenceCatalogItem = {
  catalog_code: string
  code: string
  label: string
  sort_order: number
  is_active: boolean
}

export type DocumentCategoryOption = {
  code: string
  label: string
  minimum_sensitivity: string
  sort_order: number
}

export type ManageableDocumentEntity = {
  entity_type: 'OWNER' | 'PROPERTY' | 'TENANT' | 'CONTRACT'
  entity_id: string
  display_name: string
}

export type ManageableDocument = {
  document_id: string
  entity_type: ManageableDocumentEntity['entity_type']
  entity_id: string
  entity_label: string
  title: string
  category: string
  category_label: string | null
  original_file_name: string
  mime_type: string | null
  size_bytes: number | null
  upload_status: string
  malware_scan_status: string
  document_version_id: string
  created_at: string
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
      update_owner_contact_details: {
        Args: {
          p_owner_id: string
          p_email?: string | null
          p_phone?: string | null
        }
        Returns: {
          owner_id: string
          email: string | null
          phone: string | null
        }
      }
      list_manageable_properties: {
        Args: Record<PropertyKey, never>
        Returns: ManageableProperty[]
      }
      list_manageable_rentable_spaces: {
        Args: { p_property_id: string }
        Returns: ManageableRentableSpace[]
      }
      list_manageable_tenants: {
        Args: Record<PropertyKey, never>
        Returns: ManageableTenant[]
      }
      list_manageable_contracts: {
        Args: Record<PropertyKey, never>
        Returns: ManageableContract[]
      }
      create_tenant_for_property: {
        Args: {
          p_property_id: string
          p_tenant_type: string
          p_first_name?: string | null
          p_last_name?: string | null
          p_business_name?: string | null
          p_tax_code?: string | null
          p_email?: string | null
          p_phone?: string | null
          p_address_line1?: string | null
          p_postal_code?: string | null
          p_municipality?: string | null
          p_province?: string | null
          p_notes?: string | null
        }
        Returns: { tenant_id: string }
      }
      create_legal_contract_with_term: {
        Args: {
          p_property_id: string
          p_internal_code: string
          p_contract_type: string
          p_start_date: string
          p_end_date: string
          p_base_rent_amount: number
          p_billing_frequency: string
          p_due_day: number
          p_tenant_id: string
          p_security_deposit_amount?: number | null
          p_first_billing_period_start?: string | null
          p_rentable_space_ids?: string[]
          p_notes?: string | null
          p_agreed_rent_applied?: boolean
          p_cedolare_secca?: boolean
          p_transitory_reason?: string | null
        }
        Returns: {
          contract_id: string
          management_status: string
          agreed_rent_applied: boolean
          tax_regime: string
        }
      }
      set_contract_management_status: {
        Args: {
          p_contract_id: string
          p_management_status: string
        }
        Returns: {
          contract_id: string
          management_status: string
          lifecycle_status: string
        }
      }
      list_reference_catalog_items: {
        Args: Record<PropertyKey, never>
        Returns: ReferenceCatalogItem[]
      }
      list_document_categories: {
        Args: { p_entity_type: string }
        Returns: DocumentCategoryOption[]
      }
      list_manageable_document_entities: {
        Args: Record<PropertyKey, never>
        Returns: ManageableDocumentEntity[]
      }
      list_manageable_documents: {
        Args: Record<PropertyKey, never>
        Returns: ManageableDocument[]
      }
      get_document_security_mode: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      reserve_document_upload: {
        Args: {
          p_entity_type: string
          p_entity_id: string
          p_title: string
          p_category: string
          p_original_file_name: string
          p_declared_mime_type: string
          p_expected_size_bytes: number
          p_sensitivity?: string
          p_link_role?: string | null
        }
        Returns: Json
      }
      finalize_document_upload: {
        Args: {
          p_document_version_id: string
          p_actual_mime_type: string
          p_actual_size_bytes: number
          p_checksum?: string | null
        }
        Returns: Json
      }
      cancel_document_upload: {
        Args: { p_document_version_id: string }
        Returns: Json
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
