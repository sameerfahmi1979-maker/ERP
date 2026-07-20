export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      approval_roles: {
        Row: {
          amount_limit: number | null
          can_approve: boolean
          can_delegate: boolean
          can_reject: boolean
          created_at: string
          created_by: number | null
          currency_code: string | null
          deleted_at: string | null
          description: string | null
          escalation_role_id: number | null
          id: number
          is_active: boolean
          level_number: number
          module_code: string | null
          owner_company_id: number | null
          role_code: string
          role_name: string
          scope: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          amount_limit?: number | null
          can_approve?: boolean
          can_delegate?: boolean
          can_reject?: boolean
          created_at?: string
          created_by?: number | null
          currency_code?: string | null
          deleted_at?: string | null
          description?: string | null
          escalation_role_id?: number | null
          id?: never
          is_active?: boolean
          level_number: number
          module_code?: string | null
          owner_company_id?: number | null
          role_code: string
          role_name: string
          scope?: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          amount_limit?: number | null
          can_approve?: boolean
          can_delegate?: boolean
          can_reject?: boolean
          created_at?: string
          created_by?: number | null
          currency_code?: string | null
          deleted_at?: string | null
          description?: string | null
          escalation_role_id?: number | null
          id?: never
          is_active?: boolean
          level_number?: number
          module_code?: string | null
          owner_company_id?: number | null
          role_code?: string
          role_name?: string
          scope?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_roles_escalation_role_id_fkey"
            columns: ["escalation_role_id"]
            isOneToOne: false
            referencedRelation: "approval_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_roles_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_roles_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_roles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      areas_zones: {
        Row: {
          area_code: string
          area_type_code: string | null
          city_id: number
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          id: number
          is_active: boolean
          is_locked: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          area_code: string
          area_type_code?: string | null
          city_id: number
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          area_code?: string
          area_type_code?: string | null
          city_id?: number
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "areas_zones_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_profile_id: number | null
          branch_id: number | null
          created_at: string
          entity_id: number | null
          entity_name: string | null
          entity_reference: string | null
          id: number
          ip_address: string | null
          module_code: string | null
          new_values: Json | null
          old_values: Json | null
          owner_company_id: number | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_profile_id?: number | null
          branch_id?: number | null
          created_at?: string
          entity_id?: number | null
          entity_name?: string | null
          entity_reference?: string | null
          id?: number
          ip_address?: string | null
          module_code?: string | null
          new_values?: Json | null
          old_values?: Json | null
          owner_company_id?: number | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_profile_id?: number | null
          branch_id?: number | null
          created_at?: string
          entity_id?: number | null
          entity_name?: string | null
          entity_reference?: string | null
          id?: number
          ip_address?: string | null
          module_code?: string | null
          new_values?: Json | null
          old_values?: Json | null
          owner_company_id?: number | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_profile_id_fkey"
            columns: ["actor_user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
        ]
      }
      authority_types: {
        Row: {
          authority_code: string
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          authority_code: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          authority_code?: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "authority_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authority_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      banks: {
        Row: {
          bank_code: string
          bank_name_ar: string | null
          bank_name_en: string
          bank_type_code: string | null
          contact_email: string | null
          contact_phone: string | null
          country_id: number | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          description_ar: string | null
          description_en: string | null
          id: number
          is_active: boolean
          is_locked: boolean
          is_system: boolean
          notes: string | null
          short_name: string | null
          sort_order: number
          swift_code: string | null
          updated_at: string
          updated_by: number | null
          website_url: string | null
        }
        Insert: {
          bank_code: string
          bank_name_ar?: string | null
          bank_name_en: string
          bank_type_code?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          description_ar?: string | null
          description_en?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          notes?: string | null
          short_name?: string | null
          sort_order?: number
          swift_code?: string | null
          updated_at?: string
          updated_by?: number | null
          website_url?: string | null
        }
        Update: {
          bank_code?: string
          bank_name_ar?: string | null
          bank_name_en?: string
          bank_type_code?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          description_ar?: string | null
          description_en?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          notes?: string | null
          short_name?: string | null
          sort_order?: number
          swift_code?: string | null
          updated_at?: string
          updated_by?: number | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "banks_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banks_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_breakdown_items: {
        Row: {
          billing_calculation_id: string | null
          created_at: string | null
          demand_charge: number | null
          demand_kw: number | null
          duration_minutes: number
          end_time: string
          energy_charge: number
          energy_kwh: number
          id: string
          line_total: number
          period_name: string
          rate_per_kwh: number
          rate_period_id: string | null
          start_time: string
        }
        Insert: {
          billing_calculation_id?: string | null
          created_at?: string | null
          demand_charge?: number | null
          demand_kw?: number | null
          duration_minutes: number
          end_time: string
          energy_charge: number
          energy_kwh: number
          id?: string
          line_total: number
          period_name: string
          rate_per_kwh: number
          rate_period_id?: string | null
          start_time: string
        }
        Update: {
          billing_calculation_id?: string | null
          created_at?: string | null
          demand_charge?: number | null
          demand_kw?: number | null
          duration_minutes?: number
          end_time?: string
          energy_charge?: number
          energy_kwh?: number
          id?: string
          line_total?: number
          period_name?: string
          rate_per_kwh?: number
          rate_period_id?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_breakdown_items_billing_calculation_id_fkey"
            columns: ["billing_calculation_id"]
            isOneToOne: false
            referencedRelation: "billing_calculations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_breakdown_items_rate_period_id_fkey"
            columns: ["rate_period_id"]
            isOneToOne: false
            referencedRelation: "rate_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_calculations: {
        Row: {
          breakdown: Json | null
          calculation_date: string | null
          created_at: string | null
          currency: string | null
          fees: number | null
          id: string
          rate_structure_id: string | null
          session_id: string | null
          subtotal: number
          taxes: number | null
          total_amount: number
        }
        Insert: {
          breakdown?: Json | null
          calculation_date?: string | null
          created_at?: string | null
          currency?: string | null
          fees?: number | null
          id?: string
          rate_structure_id?: string | null
          session_id?: string | null
          subtotal: number
          taxes?: number | null
          total_amount: number
        }
        Update: {
          breakdown?: Json | null
          calculation_date?: string | null
          created_at?: string | null
          currency?: string | null
          fees?: number | null
          id?: string
          rate_structure_id?: string | null
          session_id?: string | null
          subtotal?: number
          taxes?: number | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_calculations_rate_structure_id_fkey"
            columns: ["rate_structure_id"]
            isOneToOne: false
            referencedRelation: "rate_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_calculations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "charging_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          area: string | null
          area_zone_id: number | null
          branch_code: string
          branch_manager_user_id: number | null
          branch_name_ar: string | null
          branch_name_en: string
          branch_type: string | null
          city: string | null
          city_id: number | null
          closing_date: string | null
          contact_email: string | null
          contact_person_name: string | null
          contact_phone: string | null
          cost_center_id: number | null
          created_at: string
          created_by: number | null
          default_work_calendar_id: number | null
          email: string | null
          emirate: string | null
          emirate_id: number | null
          has_warehouse: boolean | null
          has_weighbridge: boolean | null
          has_workshop: boolean | null
          has_yard: boolean | null
          id: number
          internal_reference_number: string | null
          is_main_branch: boolean | null
          latitude: number | null
          legal_branch_name: string | null
          longitude: number | null
          makani_number: string | null
          notes: string | null
          opening_date: string | null
          operating_status: string | null
          owner_company_id: number
          phone: string | null
          po_box: string | null
          profit_center_id: number | null
          status: string
          trade_license_branch_ref: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          area?: string | null
          area_zone_id?: number | null
          branch_code: string
          branch_manager_user_id?: number | null
          branch_name_ar?: string | null
          branch_name_en: string
          branch_type?: string | null
          city?: string | null
          city_id?: number | null
          closing_date?: string | null
          contact_email?: string | null
          contact_person_name?: string | null
          contact_phone?: string | null
          cost_center_id?: number | null
          created_at?: string
          created_by?: number | null
          default_work_calendar_id?: number | null
          email?: string | null
          emirate?: string | null
          emirate_id?: number | null
          has_warehouse?: boolean | null
          has_weighbridge?: boolean | null
          has_workshop?: boolean | null
          has_yard?: boolean | null
          id?: number
          internal_reference_number?: string | null
          is_main_branch?: boolean | null
          latitude?: number | null
          legal_branch_name?: string | null
          longitude?: number | null
          makani_number?: string | null
          notes?: string | null
          opening_date?: string | null
          operating_status?: string | null
          owner_company_id: number
          phone?: string | null
          po_box?: string | null
          profit_center_id?: number | null
          status?: string
          trade_license_branch_ref?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          area?: string | null
          area_zone_id?: number | null
          branch_code?: string
          branch_manager_user_id?: number | null
          branch_name_ar?: string | null
          branch_name_en?: string
          branch_type?: string | null
          city?: string | null
          city_id?: number | null
          closing_date?: string | null
          contact_email?: string | null
          contact_person_name?: string | null
          contact_phone?: string | null
          cost_center_id?: number | null
          created_at?: string
          created_by?: number | null
          default_work_calendar_id?: number | null
          email?: string | null
          emirate?: string | null
          emirate_id?: number | null
          has_warehouse?: boolean | null
          has_weighbridge?: boolean | null
          has_workshop?: boolean | null
          has_yard?: boolean | null
          id?: number
          internal_reference_number?: string | null
          is_main_branch?: boolean | null
          latitude?: number | null
          legal_branch_name?: string | null
          longitude?: number | null
          makani_number?: string | null
          notes?: string | null
          opening_date?: string | null
          operating_status?: string | null
          owner_company_id?: number
          phone?: string | null
          po_box?: string | null
          profit_center_id?: number | null
          status?: string
          trade_license_branch_ref?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_area_zone_id_fkey"
            columns: ["area_zone_id"]
            isOneToOne: false
            referencedRelation: "areas_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_branch_manager_user_id_fkey"
            columns: ["branch_manager_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_default_work_calendar_id_fkey"
            columns: ["default_work_calendar_id"]
            isOneToOne: false
            referencedRelation: "work_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_profit_center_id_fkey"
            columns: ["profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      charging_sessions: {
        Row: {
          calculated_cost: number
          card_number: string
          charge_id: string
          co2_reduction_kg: number | null
          connector_number: string | null
          connector_type: string | null
          created_at: string | null
          duration_minutes: number
          duration_text: string | null
          end_date: string
          end_soc_percent: number | null
          end_time: string
          end_ts: string
          energy_consumed_kwh: number
          has_billing_calculation: boolean | null
          id: string
          import_batch_id: string | null
          max_demand_kw: number | null
          notes: string | null
          operator_id: string | null
          shift_id: string | null
          start_date: string
          start_soc_percent: number | null
          start_time: string
          start_ts: string
          station_code: string | null
          station_id: string | null
          transaction_id: string
          updated_at: string | null
          user_identifier: string | null
        }
        Insert: {
          calculated_cost: number
          card_number: string
          charge_id: string
          co2_reduction_kg?: number | null
          connector_number?: string | null
          connector_type?: string | null
          created_at?: string | null
          duration_minutes: number
          duration_text?: string | null
          end_date: string
          end_soc_percent?: number | null
          end_time: string
          end_ts: string
          energy_consumed_kwh: number
          has_billing_calculation?: boolean | null
          id?: string
          import_batch_id?: string | null
          max_demand_kw?: number | null
          notes?: string | null
          operator_id?: string | null
          shift_id?: string | null
          start_date: string
          start_soc_percent?: number | null
          start_time: string
          start_ts: string
          station_code?: string | null
          station_id?: string | null
          transaction_id: string
          updated_at?: string | null
          user_identifier?: string | null
        }
        Update: {
          calculated_cost?: number
          card_number?: string
          charge_id?: string
          co2_reduction_kg?: number | null
          connector_number?: string | null
          connector_type?: string | null
          created_at?: string | null
          duration_minutes?: number
          duration_text?: string | null
          end_date?: string
          end_soc_percent?: number | null
          end_time?: string
          end_ts?: string
          energy_consumed_kwh?: number
          has_billing_calculation?: boolean | null
          id?: string
          import_batch_id?: string | null
          max_demand_kw?: number | null
          notes?: string | null
          operator_id?: string | null
          shift_id?: string | null
          start_date?: string
          start_soc_percent?: number | null
          start_time?: string
          start_ts?: string
          station_code?: string | null
          station_id?: string | null
          transaction_id?: string
          updated_at?: string | null
          user_identifier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charging_sessions_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_sessions_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_sessions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charging_sessions_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          city_code: string
          country_id: number | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          emirate_id: number
          id: number
          is_active: boolean
          is_locked: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          city_code: string
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id: number
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          city_code?: string
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cities_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cities_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_addresses: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          address_type_code: string | null
          area_zone_id: number | null
          building_name: string | null
          city_id: number | null
          consultant_id: number
          country_id: number | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          emirate_id: number | null
          id: number
          is_active: boolean
          is_billing_address: boolean
          is_locked: boolean
          is_primary: boolean
          is_shipping_address: boolean
          is_system: boolean
          latitude: number | null
          longitude: number | null
          makani_number: string | null
          notes: string | null
          po_box: string | null
          sort_order: number
          status_code: string
          street_name: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          address_type_code?: string | null
          area_zone_id?: number | null
          building_name?: string | null
          city_id?: number | null
          consultant_id: number
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number | null
          id?: number
          is_active?: boolean
          is_billing_address?: boolean
          is_locked?: boolean
          is_primary?: boolean
          is_shipping_address?: boolean
          is_system?: boolean
          latitude?: number | null
          longitude?: number | null
          makani_number?: string | null
          notes?: string | null
          po_box?: string | null
          sort_order?: number
          status_code?: string
          street_name?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          address_type_code?: string | null
          area_zone_id?: number | null
          building_name?: string | null
          city_id?: number | null
          consultant_id?: number
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number | null
          id?: number
          is_active?: boolean
          is_billing_address?: boolean
          is_locked?: boolean
          is_primary?: boolean
          is_shipping_address?: boolean
          is_system?: boolean
          latitude?: number | null
          longitude?: number | null
          makani_number?: string | null
          notes?: string | null
          po_box?: string | null
          sort_order?: number
          status_code?: string
          street_name?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "consultant_addresses_area_zone_id_fkey"
            columns: ["area_zone_id"]
            isOneToOne: false
            referencedRelation: "areas_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_addresses_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_addresses_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_addresses_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_addresses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_addresses_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_addresses_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_addresses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_bank_details: {
        Row: {
          account_name: string
          account_number: string
          bank_account_type_code: string | null
          bank_id: number | null
          consultant_id: number
          created_at: string
          created_by: number | null
          currency_id: number | null
          iban: string | null
          id: number
          is_active: boolean
          is_primary: boolean
          notes: string | null
          swift_code: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          account_name: string
          account_number: string
          bank_account_type_code?: string | null
          bank_id?: number | null
          consultant_id: number
          created_at?: string
          created_by?: number | null
          currency_id?: number | null
          iban?: string | null
          id?: number
          is_active?: boolean
          is_primary?: boolean
          notes?: string | null
          swift_code?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_account_type_code?: string | null
          bank_id?: number | null
          consultant_id?: number
          created_at?: string
          created_by?: number | null
          currency_id?: number | null
          iban?: string | null
          id?: number
          is_active?: boolean
          is_primary?: boolean
          notes?: string | null
          swift_code?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "consultant_bank_details_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_bank_details_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_bank_details_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_bank_details_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_bank_details_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_contacts: {
        Row: {
          consultant_id: number
          contact_code: string
          contact_name_ar: string | null
          contact_name_en: string
          contact_type_code: string | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          department: string | null
          designation: string | null
          email: string | null
          id: number
          is_active: boolean
          is_authorized_signatory: boolean
          is_decision_maker: boolean
          is_finance_contact: boolean
          is_locked: boolean
          is_operations_contact: boolean
          is_primary: boolean
          is_system: boolean
          mobile: string | null
          notes: string | null
          phone: string | null
          preferred_communication_code: string | null
          sort_order: number
          status_code: string
          updated_at: string
          updated_by: number | null
          whatsapp: string | null
        }
        Insert: {
          consultant_id: number
          contact_code: string
          contact_name_ar?: string | null
          contact_name_en: string
          contact_type_code?: string | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: number
          is_active?: boolean
          is_authorized_signatory?: boolean
          is_decision_maker?: boolean
          is_finance_contact?: boolean
          is_locked?: boolean
          is_operations_contact?: boolean
          is_primary?: boolean
          is_system?: boolean
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          preferred_communication_code?: string | null
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
          whatsapp?: string | null
        }
        Update: {
          consultant_id?: number
          contact_code?: string
          contact_name_ar?: string | null
          contact_name_en?: string
          contact_type_code?: string | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: number
          is_active?: boolean
          is_authorized_signatory?: boolean
          is_decision_maker?: boolean
          is_finance_contact?: boolean
          is_locked?: boolean
          is_operations_contact?: boolean
          is_primary?: boolean
          is_system?: boolean
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          preferred_communication_code?: string | null
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultant_contacts_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_contacts_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_contacts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_documents: {
        Row: {
          consultant_id: number
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          document_name: string
          document_number: string | null
          document_type_code: string | null
          expiry_date: string | null
          expiry_reminder_days: number | null
          file_path: string | null
          has_expiry: boolean
          id: number
          is_active: boolean
          is_locked: boolean
          is_required: boolean
          is_system: boolean
          is_verified: boolean
          issue_date: string | null
          notes: string | null
          sort_order: number
          status_code: string
          updated_at: string
          updated_by: number | null
          verified_at: string | null
          verified_by: number | null
        }
        Insert: {
          consultant_id: number
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          document_name: string
          document_number?: string | null
          document_type_code?: string | null
          expiry_date?: string | null
          expiry_reminder_days?: number | null
          file_path?: string | null
          has_expiry?: boolean
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_required?: boolean
          is_system?: boolean
          is_verified?: boolean
          issue_date?: string | null
          notes?: string | null
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
          verified_at?: string | null
          verified_by?: number | null
        }
        Update: {
          consultant_id?: number
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          document_name?: string
          document_number?: string | null
          document_type_code?: string | null
          expiry_date?: string | null
          expiry_reminder_days?: number | null
          file_path?: string | null
          has_expiry?: boolean
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_required?: boolean
          is_system?: boolean
          is_verified?: boolean
          issue_date?: string | null
          notes?: string | null
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
          verified_at?: string | null
          verified_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "consultant_documents_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_documents_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_specializations: {
        Row: {
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          specialization_code: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          specialization_code: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          specialization_code?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "consultant_specializations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_specializations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consultant_types: {
        Row: {
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          type_code: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          type_code: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          type_code?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "consultant_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultant_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consultants: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          area_zone_id: number | null
          cicpa_registration_number: string | null
          city_id: number | null
          consultant_category_code: string | null
          consultant_code: string
          consultant_name_ar: string | null
          consultant_name_en: string
          consultant_type_code: string
          country_id: number | null
          created_at: string
          created_by: number | null
          currency_id: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          emirate_id: number | null
          icv_certificate_number: string | null
          icv_certification_body: string | null
          icv_company_type: string | null
          icv_document_path: string | null
          icv_expiry_date: string | null
          icv_financial_year_end_date: string | null
          icv_issue_date: string | null
          icv_score_percentage: number | null
          icv_status_code: string | null
          icv_version: string | null
          id: number
          is_active: boolean
          is_locked: boolean
          is_system: boolean
          license_expiry_date: string | null
          makani_number: string | null
          notes: string | null
          payment_term_id: number | null
          po_box: string | null
          primary_email: string | null
          primary_mobile: string | null
          primary_phone: string | null
          sort_order: number
          status_code: string
          tax_type_id: number | null
          trade_license_number: string | null
          trn: string | null
          updated_at: string
          updated_by: number | null
          website_url: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          area_zone_id?: number | null
          cicpa_registration_number?: string | null
          city_id?: number | null
          consultant_category_code?: string | null
          consultant_code: string
          consultant_name_ar?: string | null
          consultant_name_en: string
          consultant_type_code: string
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          currency_id?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number | null
          icv_certificate_number?: string | null
          icv_certification_body?: string | null
          icv_company_type?: string | null
          icv_document_path?: string | null
          icv_expiry_date?: string | null
          icv_financial_year_end_date?: string | null
          icv_issue_date?: string | null
          icv_score_percentage?: number | null
          icv_status_code?: string | null
          icv_version?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          license_expiry_date?: string | null
          makani_number?: string | null
          notes?: string | null
          payment_term_id?: number | null
          po_box?: string | null
          primary_email?: string | null
          primary_mobile?: string | null
          primary_phone?: string | null
          sort_order?: number
          status_code?: string
          tax_type_id?: number | null
          trade_license_number?: string | null
          trn?: string | null
          updated_at?: string
          updated_by?: number | null
          website_url?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          area_zone_id?: number | null
          cicpa_registration_number?: string | null
          city_id?: number | null
          consultant_category_code?: string | null
          consultant_code?: string
          consultant_name_ar?: string | null
          consultant_name_en?: string
          consultant_type_code?: string
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          currency_id?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number | null
          icv_certificate_number?: string | null
          icv_certification_body?: string | null
          icv_company_type?: string | null
          icv_document_path?: string | null
          icv_expiry_date?: string | null
          icv_financial_year_end_date?: string | null
          icv_issue_date?: string | null
          icv_score_percentage?: number | null
          icv_status_code?: string | null
          icv_version?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          license_expiry_date?: string | null
          makani_number?: string | null
          notes?: string | null
          payment_term_id?: number | null
          po_box?: string | null
          primary_email?: string | null
          primary_mobile?: string | null
          primary_phone?: string | null
          sort_order?: number
          status_code?: string
          tax_type_id?: number | null
          trade_license_number?: string | null
          trn?: string | null
          updated_at?: string
          updated_by?: number | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultants_area_zone_id_fkey"
            columns: ["area_zone_id"]
            isOneToOne: false
            referencedRelation: "areas_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultants_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultants_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultants_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultants_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultants_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultants_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultants_payment_term_id_fkey"
            columns: ["payment_term_id"]
            isOneToOne: false
            referencedRelation: "payment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultants_tax_type_id_fkey"
            columns: ["tax_type_id"]
            isOneToOne: false
            referencedRelation: "tax_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultants_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          branch_id: number | null
          cost_center_code: string
          cost_center_name_ar: string | null
          cost_center_name_en: string
          cost_center_type_code: string | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          description_ar: string | null
          description_en: string | null
          id: number
          is_active: boolean
          is_locked: boolean
          is_system: boolean
          notes: string | null
          owner_company_id: number | null
          parent_cost_center_id: number | null
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          branch_id?: number | null
          cost_center_code: string
          cost_center_name_ar?: string | null
          cost_center_name_en: string
          cost_center_type_code?: string | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          description_ar?: string | null
          description_en?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          notes?: string | null
          owner_company_id?: number | null
          parent_cost_center_id?: number | null
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          branch_id?: number | null
          cost_center_code?: string
          cost_center_name_ar?: string | null
          cost_center_name_en?: string
          cost_center_type_code?: string | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          description_ar?: string | null
          description_en?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          notes?: string | null
          owner_company_id?: number | null
          parent_cost_center_id?: number | null
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_parent_cost_center_id_fkey"
            columns: ["parent_cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          country_code: string
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          default_currency_code: string | null
          id: number
          is_active: boolean
          is_gcc: boolean
          is_locked: boolean
          is_system: boolean
          is_uae: boolean
          iso3_code: string
          name_ar: string | null
          name_en: string
          nationality_ar: string | null
          nationality_en: string
          phone_code: string | null
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          country_code: string
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          default_currency_code?: string | null
          id?: number
          is_active?: boolean
          is_gcc?: boolean
          is_locked?: boolean
          is_system?: boolean
          is_uae?: boolean
          iso3_code: string
          name_ar?: string | null
          name_en: string
          nationality_ar?: string | null
          nationality_en: string
          phone_code?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          country_code?: string
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          default_currency_code?: string | null
          id?: number
          is_active?: boolean
          is_gcc?: boolean
          is_locked?: boolean
          is_system?: boolean
          is_uae?: boolean
          iso3_code?: string
          name_ar?: string | null
          name_en?: string
          nationality_ar?: string | null
          nationality_en?: string
          phone_code?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: []
      }
      currencies: {
        Row: {
          created_at: string
          created_by: number | null
          currency_code: string
          currency_name_ar: string | null
          currency_name_en: string
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          decimal_places: number
          description_ar: string | null
          description_en: string | null
          id: number
          is_active: boolean
          is_base_currency: boolean
          is_locked: boolean
          is_system: boolean
          notes: string | null
          sort_order: number
          symbol: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          currency_code: string
          currency_name_ar?: string | null
          currency_name_en: string
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          decimal_places?: number
          description_ar?: string | null
          description_en?: string | null
          id?: number
          is_active?: boolean
          is_base_currency?: boolean
          is_locked?: boolean
          is_system?: boolean
          notes?: string | null
          sort_order?: number
          symbol?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          currency_code?: string
          currency_name_ar?: string | null
          currency_name_en?: string
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          decimal_places?: number
          description_ar?: string | null
          description_en?: string | null
          id?: number
          is_active?: boolean
          is_base_currency?: boolean
          is_locked?: boolean
          is_system?: boolean
          notes?: string | null
          sort_order?: number
          symbol?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "currencies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "currencies_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "currencies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_categories: {
        Row: {
          category_code: string
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          category_code: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          category_code?: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_statuses: {
        Row: {
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          status_code: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          status_code: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_statuses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_statuses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          branch_id: number | null
          cost_center_id: number | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          department_code: string
          department_head_user_id: number | null
          department_name_ar: string | null
          department_name_en: string
          description: string | null
          effective_from: string | null
          effective_to: string | null
          id: number
          is_active: boolean
          owner_company_id: number
          parent_department_id: number | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          branch_id?: number | null
          cost_center_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          department_code: string
          department_head_user_id?: number | null
          department_name_ar?: string | null
          department_name_en: string
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: never
          is_active?: boolean
          owner_company_id: number
          parent_department_id?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          branch_id?: number | null
          cost_center_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          department_code?: string
          department_head_user_id?: number | null
          department_name_ar?: string | null
          department_name_en?: string
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: never
          is_active?: boolean
          owner_company_id?: number
          parent_department_id?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_department_head_user_id_fkey"
            columns: ["department_head_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_parent_department_id_fkey"
            columns: ["parent_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      designations: {
        Row: {
          created_at: string
          created_by: number | null
          deleted_at: string | null
          department_id: number | null
          description: string | null
          designation_code: string
          designation_name_ar: string | null
          designation_name_en: string
          has_approval_authority: boolean
          id: number
          is_active: boolean
          is_authorized_signatory: boolean
          is_safety_critical: boolean
          is_supervisor: boolean
          job_level: string | null
          management_level: string | null
          owner_company_id: number | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          department_id?: number | null
          description?: string | null
          designation_code: string
          designation_name_ar?: string | null
          designation_name_en: string
          has_approval_authority?: boolean
          id?: never
          is_active?: boolean
          is_authorized_signatory?: boolean
          is_safety_critical?: boolean
          is_supervisor?: boolean
          job_level?: string | null
          management_level?: string | null
          owner_company_id?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          department_id?: number | null
          description?: string | null
          designation_code?: string
          designation_name_ar?: string | null
          designation_name_en?: string
          has_approval_authority?: boolean
          id?: never
          is_active?: boolean
          is_authorized_signatory?: boolean
          is_safety_critical?: boolean
          is_supervisor?: boolean
          job_level?: string | null
          management_level?: string | null
          owner_company_id?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "designations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designations_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designations_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "designations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_ai_entity_match_candidates: {
        Row: {
          ai_generated: boolean
          ai_result_id: number | null
          candidate_key: string | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          document_id: number | null
          id: number
          match_method: string | null
          match_reason: string | null
          match_score: number | null
          match_signal: string | null
          resolution_code: string | null
          resolution_note: string | null
          resolved_at: string | null
          review_queue_item_id: number | null
          reviewed_at: string | null
          reviewed_by: number | null
          source_text_summary: string | null
          status: string
          target_display_name: string | null
          target_entity_id: number
          target_entity_type: string
          updated_at: string
          upload_session_id: number | null
        }
        Insert: {
          ai_generated?: boolean
          ai_result_id?: number | null
          candidate_key?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          document_id?: number | null
          id?: never
          match_method?: string | null
          match_reason?: string | null
          match_score?: number | null
          match_signal?: string | null
          resolution_code?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          review_queue_item_id?: number | null
          reviewed_at?: string | null
          reviewed_by?: number | null
          source_text_summary?: string | null
          status?: string
          target_display_name?: string | null
          target_entity_id: number
          target_entity_type: string
          updated_at?: string
          upload_session_id?: number | null
        }
        Update: {
          ai_generated?: boolean
          ai_result_id?: number | null
          candidate_key?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          document_id?: number | null
          id?: never
          match_method?: string | null
          match_reason?: string | null
          match_score?: number | null
          match_signal?: string | null
          resolution_code?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          review_queue_item_id?: number | null
          reviewed_at?: string | null
          reviewed_by?: number | null
          source_text_summary?: string | null
          status?: string
          target_display_name?: string | null
          target_entity_id?: number
          target_entity_type?: string
          updated_at?: string
          upload_session_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_ai_entity_match_candidates_ai_result_id_fkey"
            columns: ["ai_result_id"]
            isOneToOne: false
            referencedRelation: "dms_ai_extraction_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_entity_match_candidates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_entity_match_candidates_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_entity_match_candidates_review_queue_item_id_fkey"
            columns: ["review_queue_item_id"]
            isOneToOne: false
            referencedRelation: "dms_review_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_entity_match_candidates_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_entity_match_candidates_upload_session_id_fkey"
            columns: ["upload_session_id"]
            isOneToOne: false
            referencedRelation: "dms_upload_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_ai_erp_apply_correction_proposals: {
        Row: {
          applied_at: string | null
          applied_by: number | null
          cancelled_at: string | null
          confirmed_at: string | null
          confirmed_by: number | null
          conflict_reason: string | null
          conflict_status: string | null
          correction_apply_run_id: number | null
          correction_mode: string
          correction_value_json: Json | null
          created_at: string
          current_value_summary: string | null
          document_id: number | null
          failed_at: string | null
          failure_reason: string | null
          id: number
          original_applied_summary: string | null
          original_apply_item_id: number
          original_apply_run_id: number
          original_before_summary: string | null
          proposal_code: string | null
          proposed_correction_summary: string | null
          requested_by: number
          status: string
          target_field: string
          target_module: string
          target_record_id: number | null
          target_table: string
          updated_at: string
          value_type: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: number | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: number | null
          conflict_reason?: string | null
          conflict_status?: string | null
          correction_apply_run_id?: number | null
          correction_mode?: string
          correction_value_json?: Json | null
          created_at?: string
          current_value_summary?: string | null
          document_id?: number | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: never
          original_applied_summary?: string | null
          original_apply_item_id: number
          original_apply_run_id: number
          original_before_summary?: string | null
          proposal_code?: string | null
          proposed_correction_summary?: string | null
          requested_by: number
          status?: string
          target_field: string
          target_module: string
          target_record_id?: number | null
          target_table: string
          updated_at?: string
          value_type: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: number | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: number | null
          conflict_reason?: string | null
          conflict_status?: string | null
          correction_apply_run_id?: number | null
          correction_mode?: string
          correction_value_json?: Json | null
          created_at?: string
          current_value_summary?: string | null
          document_id?: number | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: never
          original_applied_summary?: string | null
          original_apply_item_id?: number
          original_apply_run_id?: number
          original_before_summary?: string | null
          proposal_code?: string | null
          proposed_correction_summary?: string | null
          requested_by?: number
          status?: string
          target_field?: string
          target_module?: string
          target_record_id?: number | null
          target_table?: string
          updated_at?: string
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "dms_ai_erp_apply_correction_propos_correction_apply_run_id_fkey"
            columns: ["correction_apply_run_id"]
            isOneToOne: false
            referencedRelation: "dms_ai_erp_apply_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_erp_apply_correction_proposa_original_apply_item_id_fkey"
            columns: ["original_apply_item_id"]
            isOneToOne: false
            referencedRelation: "dms_ai_erp_apply_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_erp_apply_correction_proposal_original_apply_run_id_fkey"
            columns: ["original_apply_run_id"]
            isOneToOne: false
            referencedRelation: "dms_ai_erp_apply_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_erp_apply_correction_proposals_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_erp_apply_correction_proposals_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_erp_apply_correction_proposals_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_erp_apply_correction_proposals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_ai_erp_apply_items: {
        Row: {
          applied_at: string | null
          applied_by: number | null
          applied_value_summary: string | null
          apply_run_id: number
          confidence: number | null
          confirmed: boolean
          created_at: string
          current_value_summary: string | null
          failure_reason: string | null
          id: number
          proposed_value_summary: string | null
          requires_confirmation: boolean
          skip_reason: string | null
          source_field_code: string | null
          source_id: number | null
          source_type: string
          status: string
          target_display_label: string | null
          target_field: string
          target_record_id: number | null
          target_table: string
          updated_at: string
          value_type: string | null
        }
        Insert: {
          applied_at?: string | null
          applied_by?: number | null
          applied_value_summary?: string | null
          apply_run_id: number
          confidence?: number | null
          confirmed?: boolean
          created_at?: string
          current_value_summary?: string | null
          failure_reason?: string | null
          id?: never
          proposed_value_summary?: string | null
          requires_confirmation?: boolean
          skip_reason?: string | null
          source_field_code?: string | null
          source_id?: number | null
          source_type: string
          status?: string
          target_display_label?: string | null
          target_field: string
          target_record_id?: number | null
          target_table: string
          updated_at?: string
          value_type?: string | null
        }
        Update: {
          applied_at?: string | null
          applied_by?: number | null
          applied_value_summary?: string | null
          apply_run_id?: number
          confidence?: number | null
          confirmed?: boolean
          created_at?: string
          current_value_summary?: string | null
          failure_reason?: string | null
          id?: never
          proposed_value_summary?: string | null
          requires_confirmation?: boolean
          skip_reason?: string | null
          source_field_code?: string | null
          source_id?: number | null
          source_type?: string
          status?: string
          target_display_label?: string | null
          target_field?: string
          target_record_id?: number | null
          target_table?: string
          updated_at?: string
          value_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_ai_erp_apply_items_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_erp_apply_items_apply_run_id_fkey"
            columns: ["apply_run_id"]
            isOneToOne: false
            referencedRelation: "dms_ai_erp_apply_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_ai_erp_apply_runs: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          confirmed_by: number | null
          created_at: string
          deleted_at: string | null
          document_id: number | null
          error_message: string | null
          failed_at: string | null
          id: number
          requested_by: number
          review_queue_item_id: number | null
          run_code: string | null
          source_id: number | null
          source_type: string
          started_at: string | null
          status: string
          target_module: string
          target_record_id: number | null
          target_table: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_by?: number | null
          created_at?: string
          deleted_at?: string | null
          document_id?: number | null
          error_message?: string | null
          failed_at?: string | null
          id?: never
          requested_by: number
          review_queue_item_id?: number | null
          run_code?: string | null
          source_id?: number | null
          source_type: string
          started_at?: string | null
          status?: string
          target_module: string
          target_record_id?: number | null
          target_table: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_by?: number | null
          created_at?: string
          deleted_at?: string | null
          document_id?: number | null
          error_message?: string | null
          failed_at?: string | null
          id?: never
          requested_by?: number
          review_queue_item_id?: number | null
          run_code?: string | null
          source_id?: number | null
          source_type?: string
          started_at?: string | null
          status?: string
          target_module?: string
          target_record_id?: number | null
          target_table?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dms_ai_erp_apply_runs_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_erp_apply_runs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_erp_apply_runs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_erp_apply_runs_review_queue_item_id_fkey"
            columns: ["review_queue_item_id"]
            isOneToOne: false
            referencedRelation: "dms_review_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_ai_extraction_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: number | null
          document_id: number | null
          duration_ms: number | null
          error_message: string | null
          file_id: number | null
          id: number
          input_text_hash: string | null
          job_type: string
          model: string | null
          prompt_version: string | null
          provider: string | null
          provider_config_id: number | null
          retry_count: number
          run_source: string | null
          started_at: string | null
          status: string
          updated_at: string
          upload_session_id: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: number | null
          document_id?: number | null
          duration_ms?: number | null
          error_message?: string | null
          file_id?: number | null
          id?: never
          input_text_hash?: string | null
          job_type: string
          model?: string | null
          prompt_version?: string | null
          provider?: string | null
          provider_config_id?: number | null
          retry_count?: number
          run_source?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          upload_session_id?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: number | null
          document_id?: number | null
          duration_ms?: number | null
          error_message?: string | null
          file_id?: number | null
          id?: never
          input_text_hash?: string | null
          job_type?: string
          model?: string | null
          prompt_version?: string | null
          provider?: string | null
          provider_config_id?: number | null
          retry_count?: number
          run_source?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          upload_session_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_ai_extraction_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_extraction_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_extraction_jobs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "dms_document_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_extraction_jobs_provider_config_id_fkey"
            columns: ["provider_config_id"]
            isOneToOne: false
            referencedRelation: "erp_ai_provider_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_extraction_jobs_upload_session_id_fkey"
            columns: ["upload_session_id"]
            isOneToOne: false
            referencedRelation: "dms_upload_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_ai_extraction_results: {
        Row: {
          ai_status: string
          classification_confidence: string | null
          classification_reason: string | null
          classification_score: number | null
          created_at: string
          document_id: number | null
          expiry_date_suggestion: string | null
          extracted_fields_json: Json | null
          field_confidence_json: Json | null
          file_id: number | null
          id: number
          issue_date_suggestion: string | null
          job_id: number
          raw_ocr_text: string | null
          raw_response_json: Json | null
          result_type: string | null
          review_action: string | null
          reviewed_at: string | null
          reviewed_by: number | null
          suggested_description: string | null
          suggested_document_type_id: number | null
          suggested_links_json: Json | null
          suggested_title: string | null
          upload_session_id: number | null
        }
        Insert: {
          ai_status?: string
          classification_confidence?: string | null
          classification_reason?: string | null
          classification_score?: number | null
          created_at?: string
          document_id?: number | null
          expiry_date_suggestion?: string | null
          extracted_fields_json?: Json | null
          field_confidence_json?: Json | null
          file_id?: number | null
          id?: never
          issue_date_suggestion?: string | null
          job_id: number
          raw_ocr_text?: string | null
          raw_response_json?: Json | null
          result_type?: string | null
          review_action?: string | null
          reviewed_at?: string | null
          reviewed_by?: number | null
          suggested_description?: string | null
          suggested_document_type_id?: number | null
          suggested_links_json?: Json | null
          suggested_title?: string | null
          upload_session_id?: number | null
        }
        Update: {
          ai_status?: string
          classification_confidence?: string | null
          classification_reason?: string | null
          classification_score?: number | null
          created_at?: string
          document_id?: number | null
          expiry_date_suggestion?: string | null
          extracted_fields_json?: Json | null
          field_confidence_json?: Json | null
          file_id?: number | null
          id?: never
          issue_date_suggestion?: string | null
          job_id?: number
          raw_ocr_text?: string | null
          raw_response_json?: Json | null
          result_type?: string | null
          review_action?: string | null
          reviewed_at?: string | null
          reviewed_by?: number | null
          suggested_description?: string | null
          suggested_document_type_id?: number | null
          suggested_links_json?: Json | null
          suggested_title?: string | null
          upload_session_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_ai_extraction_results_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_extraction_results_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "dms_document_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_extraction_results_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "dms_ai_extraction_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_extraction_results_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_extraction_results_suggested_document_type_id_fkey"
            columns: ["suggested_document_type_id"]
            isOneToOne: false
            referencedRelation: "dms_document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_extraction_results_upload_session_id_fkey"
            columns: ["upload_session_id"]
            isOneToOne: false
            referencedRelation: "dms_upload_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_ai_job_attempts: {
        Row: {
          attempt_number: number
          completed_at: string | null
          cost_estimate: number | null
          duration_ms: number | null
          error_code: string | null
          id: number
          job_id: number
          model_name: string | null
          provider_code: string | null
          safe_error_message: string | null
          started_at: string
          status: string
          token_count_in: number | null
          token_count_out: number | null
          usage_log_id: number | null
          worker_id: string | null
        }
        Insert: {
          attempt_number: number
          completed_at?: string | null
          cost_estimate?: number | null
          duration_ms?: number | null
          error_code?: string | null
          id?: never
          job_id: number
          model_name?: string | null
          provider_code?: string | null
          safe_error_message?: string | null
          started_at?: string
          status: string
          token_count_in?: number | null
          token_count_out?: number | null
          usage_log_id?: number | null
          worker_id?: string | null
        }
        Update: {
          attempt_number?: number
          completed_at?: string | null
          cost_estimate?: number | null
          duration_ms?: number | null
          error_code?: string | null
          id?: never
          job_id?: number
          model_name?: string | null
          provider_code?: string | null
          safe_error_message?: string | null
          started_at?: string
          status?: string
          token_count_in?: number | null
          token_count_out?: number | null
          usage_log_id?: number | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_ai_job_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "dms_ai_job_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_job_attempts_usage_log_id_fkey"
            columns: ["usage_log_id"]
            isOneToOne: false
            referencedRelation: "erp_ai_usage_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_ai_job_queue: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          created_by: number | null
          failed_at: string | null
          id: number
          idempotency_key: string | null
          job_status: string
          job_type: string
          last_error_code: string | null
          last_error_message: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload_json: Json
          priority: number
          related_ai_result_id: number | null
          related_approve_run_id: number | null
          related_document_id: number | null
          related_upload_session_id: number | null
          run_after: string
          safe_error_json: Json | null
          started_at: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          created_by?: number | null
          failed_at?: string | null
          id?: never
          idempotency_key?: string | null
          job_status?: string
          job_type: string
          last_error_code?: string | null
          last_error_message?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload_json?: Json
          priority?: number
          related_ai_result_id?: number | null
          related_approve_run_id?: number | null
          related_document_id?: number | null
          related_upload_session_id?: number | null
          run_after?: string
          safe_error_json?: Json | null
          started_at?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          created_by?: number | null
          failed_at?: string | null
          id?: never
          idempotency_key?: string | null
          job_status?: string
          job_type?: string
          last_error_code?: string | null
          last_error_message?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload_json?: Json
          priority?: number
          related_ai_result_id?: number | null
          related_approve_run_id?: number | null
          related_document_id?: number | null
          related_upload_session_id?: number | null
          run_after?: string
          safe_error_json?: Json | null
          started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dms_ai_job_queue_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_job_queue_related_ai_result_id_fkey"
            columns: ["related_ai_result_id"]
            isOneToOne: false
            referencedRelation: "dms_ai_extraction_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_job_queue_related_approve_run_id_fkey"
            columns: ["related_approve_run_id"]
            isOneToOne: false
            referencedRelation: "dms_approve_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_job_queue_related_document_id_fkey"
            columns: ["related_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_job_queue_related_upload_session_id_fkey"
            columns: ["related_upload_session_id"]
            isOneToOne: false
            referencedRelation: "dms_upload_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_ai_link_suggestions: {
        Row: {
          confidence: number | null
          created_at: string
          deleted_at: string | null
          document_id: number
          entity_id: number | null
          entity_name: string | null
          entity_type: string
          id: number
          reason: string | null
          reviewed_at: string | null
          reviewed_by: number | null
          status: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          deleted_at?: string | null
          document_id: number
          entity_id?: number | null
          entity_name?: string | null
          entity_type: string
          id?: never
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          deleted_at?: string | null
          document_id?: number
          entity_id?: number | null
          entity_name?: string | null
          entity_type?: string
          id?: never
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dms_ai_link_suggestions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_ai_tag_suggestions: {
        Row: {
          confidence: number | null
          created_at: string
          deleted_at: string | null
          document_id: number
          id: number
          reason: string | null
          reviewed_at: string | null
          reviewed_by: number | null
          status: string
          suggested_by_user_id: number | null
          suggested_tag_name: string | null
          tag_id: number | null
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          deleted_at?: string | null
          document_id: number
          id?: never
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: number | null
          status?: string
          suggested_by_user_id?: number | null
          suggested_tag_name?: string | null
          tag_id?: number | null
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          deleted_at?: string | null
          document_id?: number
          id?: never
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: number | null
          status?: string
          suggested_by_user_id?: number | null
          suggested_tag_name?: string | null
          tag_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dms_ai_tag_suggestions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_tag_suggestions_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "dms_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_ai_validation_findings: {
        Row: {
          ai_generated: boolean
          ai_result_id: number | null
          ai_value_summary: string | null
          confidence: number | null
          created_at: string
          created_by: number | null
          current_value_summary: string | null
          deleted_at: string | null
          document_id: number | null
          evidence_json: Json | null
          expected_value_summary: string | null
          field_code: string | null
          finding_key: string | null
          finding_type: string
          id: number
          metadata_definition_id: number | null
          reason_message: string | null
          resolution_code: string | null
          resolution_note: string | null
          resolved_at: string | null
          review_queue_item_id: number | null
          reviewed_at: string | null
          reviewed_by: number | null
          rule_code: string
          rule_label: string | null
          rule_version: string | null
          severity: string
          source_module: string | null
          status: string
          updated_at: string
          upload_session_id: number | null
        }
        Insert: {
          ai_generated?: boolean
          ai_result_id?: number | null
          ai_value_summary?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: number | null
          current_value_summary?: string | null
          deleted_at?: string | null
          document_id?: number | null
          evidence_json?: Json | null
          expected_value_summary?: string | null
          field_code?: string | null
          finding_key?: string | null
          finding_type: string
          id?: never
          metadata_definition_id?: number | null
          reason_message?: string | null
          resolution_code?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          review_queue_item_id?: number | null
          reviewed_at?: string | null
          reviewed_by?: number | null
          rule_code: string
          rule_label?: string | null
          rule_version?: string | null
          severity?: string
          source_module?: string | null
          status?: string
          updated_at?: string
          upload_session_id?: number | null
        }
        Update: {
          ai_generated?: boolean
          ai_result_id?: number | null
          ai_value_summary?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: number | null
          current_value_summary?: string | null
          deleted_at?: string | null
          document_id?: number | null
          evidence_json?: Json | null
          expected_value_summary?: string | null
          field_code?: string | null
          finding_key?: string | null
          finding_type?: string
          id?: never
          metadata_definition_id?: number | null
          reason_message?: string | null
          resolution_code?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          review_queue_item_id?: number | null
          reviewed_at?: string | null
          reviewed_by?: number | null
          rule_code?: string
          rule_label?: string | null
          rule_version?: string | null
          severity?: string
          source_module?: string | null
          status?: string
          updated_at?: string
          upload_session_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_ai_validation_findings_ai_result_id_fkey"
            columns: ["ai_result_id"]
            isOneToOne: false
            referencedRelation: "dms_ai_extraction_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_validation_findings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_validation_findings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_validation_findings_metadata_definition_id_fkey"
            columns: ["metadata_definition_id"]
            isOneToOne: false
            referencedRelation: "dms_metadata_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_validation_findings_review_queue_item_id_fkey"
            columns: ["review_queue_item_id"]
            isOneToOne: false
            referencedRelation: "dms_review_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_validation_findings_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_ai_validation_findings_upload_session_id_fkey"
            columns: ["upload_session_id"]
            isOneToOne: false
            referencedRelation: "dms_upload_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_approve_runs: {
        Row: {
          ai_result_id: number | null
          completed_at: string | null
          created_at: string
          document_id: number | null
          error_code: string | null
          error_message: string | null
          final_storage_bucket: string | null
          final_storage_path: string | null
          id: number
          metadata_json: Json | null
          run_key: string
          stage: string | null
          started_at: string
          started_by: number | null
          status: string
          updated_at: string
          upload_session_id: number
        }
        Insert: {
          ai_result_id?: number | null
          completed_at?: string | null
          created_at?: string
          document_id?: number | null
          error_code?: string | null
          error_message?: string | null
          final_storage_bucket?: string | null
          final_storage_path?: string | null
          id?: never
          metadata_json?: Json | null
          run_key: string
          stage?: string | null
          started_at?: string
          started_by?: number | null
          status?: string
          updated_at?: string
          upload_session_id: number
        }
        Update: {
          ai_result_id?: number | null
          completed_at?: string | null
          created_at?: string
          document_id?: number | null
          error_code?: string | null
          error_message?: string | null
          final_storage_bucket?: string | null
          final_storage_path?: string | null
          id?: never
          metadata_json?: Json | null
          run_key?: string
          stage?: string | null
          started_at?: string
          started_by?: number | null
          status?: string
          updated_at?: string
          upload_session_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "dms_approve_runs_ai_result_id_fkey"
            columns: ["ai_result_id"]
            isOneToOne: false
            referencedRelation: "dms_ai_extraction_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_approve_runs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_approve_runs_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_approve_runs_upload_session_id_fkey"
            columns: ["upload_session_id"]
            isOneToOne: false
            referencedRelation: "dms_upload_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_document_access_rules: {
        Row: {
          created_at: string
          created_by: number | null
          deleted_at: string | null
          document_id: number | null
          document_type_id: number | null
          granted: boolean
          id: number
          permission: string
          principal_id: number
          principal_type: string
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          document_id?: number | null
          document_type_id?: number | null
          granted?: boolean
          id?: never
          permission: string
          principal_id: number
          principal_type: string
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          document_id?: number | null
          document_type_id?: number | null
          granted?: boolean
          id?: never
          permission?: string
          principal_id?: number
          principal_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "dms_document_access_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_access_rules_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_access_rules_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "dms_document_types"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_document_approvals: {
        Row: {
          action: string
          actioned_at: string
          actioned_by: number | null
          comments: string | null
          created_at: string
          document_id: number
          id: number
          is_current: boolean
          reason: string | null
          step_id: number | null
          submitted_at: string | null
          submitted_by: number | null
          updated_at: string | null
          updated_by: number | null
          workflow_id: number | null
        }
        Insert: {
          action: string
          actioned_at?: string
          actioned_by?: number | null
          comments?: string | null
          created_at?: string
          document_id: number
          id?: never
          is_current?: boolean
          reason?: string | null
          step_id?: number | null
          submitted_at?: string | null
          submitted_by?: number | null
          updated_at?: string | null
          updated_by?: number | null
          workflow_id?: number | null
        }
        Update: {
          action?: string
          actioned_at?: string
          actioned_by?: number | null
          comments?: string | null
          created_at?: string
          document_id?: number
          id?: never
          is_current?: boolean
          reason?: string | null
          step_id?: number | null
          submitted_at?: string | null
          submitted_by?: number | null
          updated_at?: string | null
          updated_by?: number | null
          workflow_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_document_approvals_actioned_by_fkey"
            columns: ["actioned_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_approvals_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_approvals_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "dms_document_workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_approvals_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_approvals_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_approvals_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "dms_document_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_document_categories: {
        Row: {
          category_code: string
          created_at: string
          created_by: number | null
          deleted_at: string | null
          description: string | null
          icon: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          category_code: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          category_code?: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          description?: string | null
          icon?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_document_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_document_comments: {
        Row: {
          comment_text: string
          created_at: string
          created_by: number | null
          deleted_at: string | null
          document_id: number
          id: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          comment_text: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          document_id: number
          id?: never
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          comment_text?: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          document_id?: number
          id?: never
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_document_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_comments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_comments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_document_content: {
        Row: {
          content_text: string | null
          content_text_char_count: number | null
          content_text_sha256: string | null
          content_text_source: string | null
          content_text_updated_at: string | null
          created_at: string
          document_id: number
          id: number
          is_truncated: boolean
          updated_at: string
        }
        Insert: {
          content_text?: string | null
          content_text_char_count?: number | null
          content_text_sha256?: string | null
          content_text_source?: string | null
          content_text_updated_at?: string | null
          created_at?: string
          document_id: number
          id?: never
          is_truncated?: boolean
          updated_at?: string
        }
        Update: {
          content_text?: string | null
          content_text_char_count?: number | null
          content_text_sha256?: string | null
          content_text_source?: string | null
          content_text_updated_at?: string | null
          created_at?: string
          document_id?: number
          id?: never
          is_truncated?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dms_document_content_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_document_content_chunks: {
        Row: {
          char_count: number
          chunk_hash: string
          chunk_index: number
          chunk_text: string
          content_hash: string
          content_id: number | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          document_id: number
          embedded_at: string | null
          embedding: string | null
          embedding_error_code: string | null
          embedding_error_message: string | null
          embedding_model: string | null
          embedding_provider: string | null
          embedding_status: string
          id: number
          is_active: boolean
          language: string | null
          page_end: number | null
          page_start: number | null
          source_kind: string
          token_estimate: number | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          char_count: number
          chunk_hash: string
          chunk_index: number
          chunk_text: string
          content_hash: string
          content_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          document_id: number
          embedded_at?: string | null
          embedding?: string | null
          embedding_error_code?: string | null
          embedding_error_message?: string | null
          embedding_model?: string | null
          embedding_provider?: string | null
          embedding_status?: string
          id?: never
          is_active?: boolean
          language?: string | null
          page_end?: number | null
          page_start?: number | null
          source_kind?: string
          token_estimate?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          char_count?: number
          chunk_hash?: string
          chunk_index?: number
          chunk_text?: string
          content_hash?: string
          content_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          document_id?: number
          embedded_at?: string | null
          embedding?: string | null
          embedding_error_code?: string | null
          embedding_error_message?: string | null
          embedding_model?: string | null
          embedding_provider?: string | null
          embedding_status?: string
          id?: never
          is_active?: boolean
          language?: string | null
          page_end?: number | null
          page_start?: number | null
          source_kind?: string
          token_estimate?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_document_content_chunks_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "dms_document_content"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_content_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_document_events: {
        Row: {
          description: string | null
          document_id: number | null
          event_type: string
          id: number
          metadata_json: Json | null
          performed_at: string
          performed_by: number | null
        }
        Insert: {
          description?: string | null
          document_id?: number | null
          event_type: string
          id?: never
          metadata_json?: Json | null
          performed_at?: string
          performed_by?: number | null
        }
        Update: {
          description?: string | null
          document_id?: number | null
          event_type?: string
          id?: never
          metadata_json?: Json | null
          performed_at?: string
          performed_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_document_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_events_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_document_files: {
        Row: {
          created_at: string
          created_by: number | null
          deleted_at: string | null
          document_id: number
          file_name: string
          file_role: string
          file_size_bytes: number
          id: number
          integrity_checked_at: string | null
          integrity_error_message: string | null
          integrity_status: string
          language: string | null
          mime_type: string
          ocr_completed_at: string | null
          ocr_confidence: number | null
          ocr_error_message: string | null
          ocr_language: string | null
          ocr_model: string | null
          ocr_page_count: number | null
          ocr_provider: string | null
          ocr_started_at: string | null
          ocr_status: string
          ocr_text: string | null
          page_count: number | null
          sha256_hash: string | null
          storage_bucket: string
          storage_path: string
          version_id: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          document_id: number
          file_name: string
          file_role?: string
          file_size_bytes: number
          id?: never
          integrity_checked_at?: string | null
          integrity_error_message?: string | null
          integrity_status?: string
          language?: string | null
          mime_type: string
          ocr_completed_at?: string | null
          ocr_confidence?: number | null
          ocr_error_message?: string | null
          ocr_language?: string | null
          ocr_model?: string | null
          ocr_page_count?: number | null
          ocr_provider?: string | null
          ocr_started_at?: string | null
          ocr_status?: string
          ocr_text?: string | null
          page_count?: number | null
          sha256_hash?: string | null
          storage_bucket: string
          storage_path: string
          version_id?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          document_id?: number
          file_name?: string
          file_role?: string
          file_size_bytes?: number
          id?: never
          integrity_checked_at?: string | null
          integrity_error_message?: string | null
          integrity_status?: string
          language?: string | null
          mime_type?: string
          ocr_completed_at?: string | null
          ocr_confidence?: number | null
          ocr_error_message?: string | null
          ocr_language?: string | null
          ocr_model?: string | null
          ocr_page_count?: number | null
          ocr_provider?: string | null
          ocr_started_at?: string | null
          ocr_status?: string
          ocr_text?: string | null
          page_count?: number | null
          sha256_hash?: string | null
          storage_bucket?: string
          storage_path?: string
          version_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_document_files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_files_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_files_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "dms_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_document_links: {
        Row: {
          created_at: string
          deleted_at: string | null
          document_id: number
          entity_id: number
          entity_type: string
          id: number
          is_primary: boolean
          link_role: string | null
          linked_at: string
          linked_by: number | null
          notes: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          document_id: number
          entity_id: number
          entity_type: string
          id?: never
          is_primary?: boolean
          link_role?: string | null
          linked_at?: string
          linked_by?: number | null
          notes?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          document_id?: number
          entity_id?: number
          entity_type?: string
          id?: never
          is_primary?: boolean
          link_role?: string | null
          linked_at?: string
          linked_by?: number | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_document_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_links_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_document_metadata_values: {
        Row: {
          created_at: string
          created_by: number | null
          definition_id: number
          deleted_at: string | null
          document_id: number
          id: number
          updated_at: string
          updated_by: number | null
          value_boolean: boolean | null
          value_date: string | null
          value_datetime: string | null
          value_json: Json | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          definition_id: number
          deleted_at?: string | null
          document_id: number
          id?: never
          updated_at?: string
          updated_by?: number | null
          value_boolean?: boolean | null
          value_date?: string | null
          value_datetime?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          definition_id?: number
          deleted_at?: string | null
          document_id?: number
          id?: never
          updated_at?: string
          updated_by?: number | null
          value_boolean?: boolean | null
          value_date?: string | null
          value_datetime?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_document_metadata_values_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_metadata_values_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "dms_metadata_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_metadata_values_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_metadata_values_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_document_tags: {
        Row: {
          created_at: string
          created_by: number | null
          document_id: number
          tag_id: number
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          document_id: number
          tag_id: number
        }
        Update: {
          created_at?: string
          created_by?: number | null
          document_id?: number
          tag_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "dms_document_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_tags_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "dms_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_document_types: {
        Row: {
          ai_extraction_schema: Json | null
          ai_suggestions_approved_at: string | null
          ai_suggestions_generated_at: string | null
          allowed_entity_types: string[]
          category_id: number
          created_at: string
          created_by: number | null
          default_confidentiality: string
          default_retention_days: number | null
          deleted_at: string | null
          description: string | null
          id: number
          is_active: boolean
          is_renewable: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          requires_approval: boolean
          requires_expiry_tracking: boolean
          sort_order: number
          type_code: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          ai_extraction_schema?: Json | null
          ai_suggestions_approved_at?: string | null
          ai_suggestions_generated_at?: string | null
          allowed_entity_types?: string[]
          category_id: number
          created_at?: string
          created_by?: number | null
          default_confidentiality?: string
          default_retention_days?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_renewable?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          requires_approval?: boolean
          requires_expiry_tracking?: boolean
          sort_order?: number
          type_code: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          ai_extraction_schema?: Json | null
          ai_suggestions_approved_at?: string | null
          ai_suggestions_generated_at?: string | null
          allowed_entity_types?: string[]
          category_id?: number
          created_at?: string
          created_by?: number | null
          default_confidentiality?: string
          default_retention_days?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_renewable?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          requires_approval?: boolean
          requires_expiry_tracking?: boolean
          sort_order?: number
          type_code?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_document_types_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "dms_document_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_document_versions: {
        Row: {
          change_notes: string | null
          created_at: string
          created_by: number | null
          document_id: number
          id: number
          is_current: boolean
          version_label: string | null
          version_number: number
        }
        Insert: {
          change_notes?: string | null
          created_at?: string
          created_by?: number | null
          document_id: number
          id?: never
          is_current?: boolean
          version_label?: string | null
          version_number: number
        }
        Update: {
          change_notes?: string | null
          created_at?: string
          created_by?: number | null
          document_id?: number
          id?: never
          is_current?: boolean
          version_label?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "dms_document_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_document_workflow_steps: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          is_final: boolean
          is_initial: boolean
          requires_role: string | null
          sort_order: number
          step_code: string
          step_name: string
          workflow_id: number
        }
        Insert: {
          created_at?: string
          id?: never
          is_active?: boolean
          is_final?: boolean
          is_initial?: boolean
          requires_role?: string | null
          sort_order?: number
          step_code: string
          step_name: string
          workflow_id: number
        }
        Update: {
          created_at?: string
          id?: never
          is_active?: boolean
          is_final?: boolean
          is_initial?: boolean
          requires_role?: string | null
          sort_order?: number
          step_code?: string
          step_name?: string
          workflow_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "dms_document_workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "dms_document_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_document_workflows: {
        Row: {
          created_at: string
          created_by: number | null
          deleted_at: string | null
          description: string | null
          document_type_id: number | null
          id: number
          is_active: boolean
          name_ar: string | null
          name_en: string
          updated_at: string
          updated_by: number | null
          workflow_code: string
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          description?: string | null
          document_type_id?: number | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en: string
          updated_at?: string
          updated_by?: number | null
          workflow_code: string
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          description?: string | null
          document_type_id?: number | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en?: string
          updated_at?: string
          updated_by?: number | null
          workflow_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "dms_document_workflows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_workflows_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "dms_document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_document_workflows_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_documents: {
        Row: {
          ai_risk_level: string | null
          ai_risk_reasons_json: Json | null
          ai_risk_score: number | null
          ai_risk_updated_at: string | null
          ai_status: string
          ai_summary: string | null
          ai_summary_error: string | null
          ai_summary_input_char_count: number | null
          ai_summary_input_truncated: boolean | null
          ai_summary_model: string | null
          ai_summary_status: string | null
          ai_summary_updated_at: string | null
          ai_warnings_json: Json | null
          approval_status: string | null
          archived_at: string | null
          category_id: number
          completeness_score: number | null
          confidentiality_level: string
          content_tsv: unknown
          created_at: string
          created_by: number | null
          current_version_id: number | null
          deleted_at: string | null
          description: string | null
          document_no: string
          document_type_id: number
          expiry_date: string | null
          expiry_override_at: string | null
          expiry_override_by: number | null
          expiry_override_reason: string | null
          expiry_tracking_override: string | null
          id: number
          is_archived: boolean
          issue_date: string | null
          legacy_document_code: string | null
          migrated_from_table: string | null
          missing_fields_json: Json | null
          ocr_last_run_at: string | null
          ocr_status: string
          ocr_text_available: boolean
          owner_user_id: number | null
          owning_branch_id: number | null
          owning_company_id: number | null
          party_id: number | null
          reminder_policy_id: number | null
          review_status: string
          status: string
          submitted_at: string | null
          submitted_by: number | null
          summary_embedding: string | null
          summary_embedding_error: string | null
          summary_embedding_model: string | null
          summary_embedding_source: string | null
          summary_embedding_status: string | null
          summary_embedding_updated_at: string | null
          superseded_by_document_id: number | null
          title: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          ai_risk_level?: string | null
          ai_risk_reasons_json?: Json | null
          ai_risk_score?: number | null
          ai_risk_updated_at?: string | null
          ai_status?: string
          ai_summary?: string | null
          ai_summary_error?: string | null
          ai_summary_input_char_count?: number | null
          ai_summary_input_truncated?: boolean | null
          ai_summary_model?: string | null
          ai_summary_status?: string | null
          ai_summary_updated_at?: string | null
          ai_warnings_json?: Json | null
          approval_status?: string | null
          archived_at?: string | null
          category_id: number
          completeness_score?: number | null
          confidentiality_level?: string
          content_tsv?: unknown
          created_at?: string
          created_by?: number | null
          current_version_id?: number | null
          deleted_at?: string | null
          description?: string | null
          document_no: string
          document_type_id: number
          expiry_date?: string | null
          expiry_override_at?: string | null
          expiry_override_by?: number | null
          expiry_override_reason?: string | null
          expiry_tracking_override?: string | null
          id?: never
          is_archived?: boolean
          issue_date?: string | null
          legacy_document_code?: string | null
          migrated_from_table?: string | null
          missing_fields_json?: Json | null
          ocr_last_run_at?: string | null
          ocr_status?: string
          ocr_text_available?: boolean
          owner_user_id?: number | null
          owning_branch_id?: number | null
          owning_company_id?: number | null
          party_id?: number | null
          reminder_policy_id?: number | null
          review_status?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: number | null
          summary_embedding?: string | null
          summary_embedding_error?: string | null
          summary_embedding_model?: string | null
          summary_embedding_source?: string | null
          summary_embedding_status?: string | null
          summary_embedding_updated_at?: string | null
          superseded_by_document_id?: number | null
          title: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          ai_risk_level?: string | null
          ai_risk_reasons_json?: Json | null
          ai_risk_score?: number | null
          ai_risk_updated_at?: string | null
          ai_status?: string
          ai_summary?: string | null
          ai_summary_error?: string | null
          ai_summary_input_char_count?: number | null
          ai_summary_input_truncated?: boolean | null
          ai_summary_model?: string | null
          ai_summary_status?: string | null
          ai_summary_updated_at?: string | null
          ai_warnings_json?: Json | null
          approval_status?: string | null
          archived_at?: string | null
          category_id?: number
          completeness_score?: number | null
          confidentiality_level?: string
          content_tsv?: unknown
          created_at?: string
          created_by?: number | null
          current_version_id?: number | null
          deleted_at?: string | null
          description?: string | null
          document_no?: string
          document_type_id?: number
          expiry_date?: string | null
          expiry_override_at?: string | null
          expiry_override_by?: number | null
          expiry_override_reason?: string | null
          expiry_tracking_override?: string | null
          id?: never
          is_archived?: boolean
          issue_date?: string | null
          legacy_document_code?: string | null
          migrated_from_table?: string | null
          missing_fields_json?: Json | null
          ocr_last_run_at?: string | null
          ocr_status?: string
          ocr_text_available?: boolean
          owner_user_id?: number | null
          owning_branch_id?: number | null
          owning_company_id?: number | null
          party_id?: number | null
          reminder_policy_id?: number | null
          review_status?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: number | null
          summary_embedding?: string | null
          summary_embedding_error?: string | null
          summary_embedding_model?: string | null
          summary_embedding_source?: string | null
          summary_embedding_status?: string | null
          summary_embedding_updated_at?: string | null
          superseded_by_document_id?: number | null
          title?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "dms_document_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "dms_document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_documents_expiry_override_by_fkey"
            columns: ["expiry_override_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_documents_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_documents_owning_branch_id_fkey"
            columns: ["owning_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_documents_owning_company_id_fkey"
            columns: ["owning_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_documents_owning_company_id_fkey"
            columns: ["owning_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_documents_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_documents_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_documents_superseded_by_document_id_fkey"
            columns: ["superseded_by_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dms_documents_current_version"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "dms_document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_dms_documents_retention_policy"
            columns: ["reminder_policy_id"]
            isOneToOne: false
            referencedRelation: "dms_retention_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_expiry_reminders: {
        Row: {
          assigned_to: number | null
          created_at: string
          department_code: string | null
          dismissal_reason: string | null
          dismissed_at: string | null
          dismissed_by: number | null
          document_id: number
          escalation_level: number
          id: number
          last_notification_at: string | null
          notification_status: string
          recipients_json: Json | null
          reminder_date: string
          reminder_days_before: number
          retry_count: number
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: number | null
          created_at?: string
          department_code?: string | null
          dismissal_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: number | null
          document_id: number
          escalation_level?: number
          id?: never
          last_notification_at?: string | null
          notification_status?: string
          recipients_json?: Json | null
          reminder_date: string
          reminder_days_before: number
          retry_count?: number
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: number | null
          created_at?: string
          department_code?: string | null
          dismissal_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: number | null
          document_id?: number
          escalation_level?: number
          id?: never
          last_notification_at?: string | null
          notification_status?: string
          recipients_json?: Json | null
          reminder_date?: string
          reminder_days_before?: number
          retry_count?: number
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dms_expiry_reminders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_expiry_reminders_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_expiry_reminders_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_intake_review_values: {
        Row: {
          confidence_label: string | null
          confidence_score: number | null
          created_at: string
          field_code: string
          field_label: string | null
          field_scope: string
          field_type: string | null
          id: number
          review_status: string
          reviewed_value_json: Json | null
          source_snippet: string | null
          suggested_value_json: Json | null
          updated_at: string
          upload_session_id: number
        }
        Insert: {
          confidence_label?: string | null
          confidence_score?: number | null
          created_at?: string
          field_code: string
          field_label?: string | null
          field_scope: string
          field_type?: string | null
          id?: never
          review_status?: string
          reviewed_value_json?: Json | null
          source_snippet?: string | null
          suggested_value_json?: Json | null
          updated_at?: string
          upload_session_id: number
        }
        Update: {
          confidence_label?: string | null
          confidence_score?: number | null
          created_at?: string
          field_code?: string
          field_label?: string | null
          field_scope?: string
          field_type?: string | null
          id?: never
          review_status?: string
          reviewed_value_json?: Json | null
          source_snippet?: string | null
          suggested_value_json?: Json | null
          updated_at?: string
          upload_session_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "dms_intake_review_values_upload_session_id_fkey"
            columns: ["upload_session_id"]
            isOneToOne: false
            referencedRelation: "dms_upload_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_metadata_definitions: {
        Row: {
          ai_confidence_threshold: number | null
          ai_example_values: Json | null
          ai_expected_format: string | null
          ai_field_hint: string | null
          ai_keywords: Json | null
          ai_negative_keywords: Json | null
          ai_possible_labels_ar: Json | null
          ai_possible_labels_en: Json | null
          ai_rules_json: Json | null
          ai_suggestion_trigger_document_id: number | null
          created_at: string
          created_by: number | null
          created_from_ai_suggestion: boolean
          deleted_at: string | null
          document_type_id: number
          field_code: string
          field_group: string | null
          field_label_ar: string | null
          field_label_en: string
          field_section: string | null
          field_type: string
          help_text_ar: string | null
          help_text_en: string | null
          id: number
          is_active: boolean
          is_ai_extractable: boolean
          is_filterable: boolean
          is_required: boolean
          is_searchable: boolean
          is_unique: boolean
          metadata_version: number
          normalization_rule: string | null
          options_json: Json | null
          placeholder_ar: string | null
          placeholder_en: string | null
          review_required_if_low_confidence: boolean
          review_required_if_missing: boolean
          show_in_detail: boolean
          show_in_list: boolean
          show_in_review: boolean
          show_in_upload_review: boolean
          sort_order: number
          updated_at: string
          updated_by: number | null
          validation_json: Json | null
        }
        Insert: {
          ai_confidence_threshold?: number | null
          ai_example_values?: Json | null
          ai_expected_format?: string | null
          ai_field_hint?: string | null
          ai_keywords?: Json | null
          ai_negative_keywords?: Json | null
          ai_possible_labels_ar?: Json | null
          ai_possible_labels_en?: Json | null
          ai_rules_json?: Json | null
          ai_suggestion_trigger_document_id?: number | null
          created_at?: string
          created_by?: number | null
          created_from_ai_suggestion?: boolean
          deleted_at?: string | null
          document_type_id: number
          field_code: string
          field_group?: string | null
          field_label_ar?: string | null
          field_label_en: string
          field_section?: string | null
          field_type: string
          help_text_ar?: string | null
          help_text_en?: string | null
          id?: never
          is_active?: boolean
          is_ai_extractable?: boolean
          is_filterable?: boolean
          is_required?: boolean
          is_searchable?: boolean
          is_unique?: boolean
          metadata_version?: number
          normalization_rule?: string | null
          options_json?: Json | null
          placeholder_ar?: string | null
          placeholder_en?: string | null
          review_required_if_low_confidence?: boolean
          review_required_if_missing?: boolean
          show_in_detail?: boolean
          show_in_list?: boolean
          show_in_review?: boolean
          show_in_upload_review?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
          validation_json?: Json | null
        }
        Update: {
          ai_confidence_threshold?: number | null
          ai_example_values?: Json | null
          ai_expected_format?: string | null
          ai_field_hint?: string | null
          ai_keywords?: Json | null
          ai_negative_keywords?: Json | null
          ai_possible_labels_ar?: Json | null
          ai_possible_labels_en?: Json | null
          ai_rules_json?: Json | null
          ai_suggestion_trigger_document_id?: number | null
          created_at?: string
          created_by?: number | null
          created_from_ai_suggestion?: boolean
          deleted_at?: string | null
          document_type_id?: number
          field_code?: string
          field_group?: string | null
          field_label_ar?: string | null
          field_label_en?: string
          field_section?: string | null
          field_type?: string
          help_text_ar?: string | null
          help_text_en?: string | null
          id?: never
          is_active?: boolean
          is_ai_extractable?: boolean
          is_filterable?: boolean
          is_required?: boolean
          is_searchable?: boolean
          is_unique?: boolean
          metadata_version?: number
          normalization_rule?: string | null
          options_json?: Json | null
          placeholder_ar?: string | null
          placeholder_en?: string | null
          review_required_if_low_confidence?: boolean
          review_required_if_missing?: boolean
          show_in_detail?: boolean
          show_in_list?: boolean
          show_in_review?: boolean
          show_in_upload_review?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
          validation_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_metadata_definitions_ai_suggestion_trigger_document_id_fkey"
            columns: ["ai_suggestion_trigger_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_metadata_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_metadata_definitions_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "dms_document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_metadata_definitions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_notification_queue: {
        Row: {
          bridge_attempt_count: number
          bridge_status: string
          bridged_at: string | null
          channel: string
          created_at: string
          delivery_attempts: number
          dismissed_at: string | null
          document_id: number | null
          email_delivery_status: string | null
          email_sent_at: string | null
          global_email_queue_id: number | null
          global_notification_id: number | null
          id: number
          last_bridge_error: string | null
          last_error: string | null
          message: string
          metadata_json: Json | null
          notification_type: string
          read_at: string | null
          recipient_email: string | null
          recipient_user_id: number | null
          reminder_id: number | null
          renewal_request_id: number | null
          scheduled_for: string
          sent_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          bridge_attempt_count?: number
          bridge_status?: string
          bridged_at?: string | null
          channel?: string
          created_at?: string
          delivery_attempts?: number
          dismissed_at?: string | null
          document_id?: number | null
          email_delivery_status?: string | null
          email_sent_at?: string | null
          global_email_queue_id?: number | null
          global_notification_id?: number | null
          id?: never
          last_bridge_error?: string | null
          last_error?: string | null
          message: string
          metadata_json?: Json | null
          notification_type: string
          read_at?: string | null
          recipient_email?: string | null
          recipient_user_id?: number | null
          reminder_id?: number | null
          renewal_request_id?: number | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          bridge_attempt_count?: number
          bridge_status?: string
          bridged_at?: string | null
          channel?: string
          created_at?: string
          delivery_attempts?: number
          dismissed_at?: string | null
          document_id?: number | null
          email_delivery_status?: string | null
          email_sent_at?: string | null
          global_email_queue_id?: number | null
          global_notification_id?: number | null
          id?: never
          last_bridge_error?: string | null
          last_error?: string | null
          message?: string
          metadata_json?: Json | null
          notification_type?: string
          read_at?: string | null
          recipient_email?: string | null
          recipient_user_id?: number | null
          reminder_id?: number | null
          renewal_request_id?: number | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dms_notification_queue_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_notification_queue_global_email_queue_id_fkey"
            columns: ["global_email_queue_id"]
            isOneToOne: false
            referencedRelation: "erp_email_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_notification_queue_global_notification_id_fkey"
            columns: ["global_notification_id"]
            isOneToOne: false
            referencedRelation: "erp_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_notification_queue_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_notification_queue_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "dms_expiry_reminders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_notification_queue_renewal_request_id_fkey"
            columns: ["renewal_request_id"]
            isOneToOne: false
            referencedRelation: "dms_renewal_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_notification_settings: {
        Row: {
          config_name: string
          created_at: string
          created_by: number | null
          email_enabled: boolean
          id: number
          in_app_enabled: boolean
          include_document_creator: boolean
          include_document_owner: boolean
          is_enabled: boolean
          notes: string | null
          recipient_roles: Json
          recipient_user_ids: Json
          reminder_days_before: Json
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          config_name?: string
          created_at?: string
          created_by?: number | null
          email_enabled?: boolean
          id?: number
          in_app_enabled?: boolean
          include_document_creator?: boolean
          include_document_owner?: boolean
          is_enabled?: boolean
          notes?: string | null
          recipient_roles?: Json
          recipient_user_ids?: Json
          reminder_days_before?: Json
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          config_name?: string
          created_at?: string
          created_by?: number | null
          email_enabled?: boolean
          id?: number
          in_app_enabled?: boolean
          include_document_creator?: boolean
          include_document_owner?: boolean
          is_enabled?: boolean
          notes?: string | null
          recipient_roles?: Json
          recipient_user_ids?: Json
          reminder_days_before?: Json
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_notification_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_notification_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_party_document_migration_map: {
        Row: {
          dms_document_id: number
          id: number
          legacy_document_code: string | null
          migrated_at: string
          migration_notes: string | null
          party_document_id: number
          party_id: number
        }
        Insert: {
          dms_document_id: number
          id?: never
          legacy_document_code?: string | null
          migrated_at?: string
          migration_notes?: string | null
          party_document_id: number
          party_id: number
        }
        Update: {
          dms_document_id?: number
          id?: never
          legacy_document_code?: string | null
          migrated_at?: string
          migration_notes?: string | null
          party_document_id?: number
          party_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "dms_party_document_migration_map_dms_document_id_fkey"
            columns: ["dms_document_id"]
            isOneToOne: true
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_party_document_migration_map_party_document_id_fkey"
            columns: ["party_document_id"]
            isOneToOne: true
            referencedRelation: "party_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_renewal_requests: {
        Row: {
          assigned_to: number | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          document_id: number
          id: number
          new_expiry_date: string | null
          notes: string | null
          old_expiry_date: string | null
          priority: string
          renewal_no: string | null
          replacement_document_id: number | null
          replacement_version_id: number | null
          requested_at: string
          requested_by: number | null
          status: string
          target_renewal_date: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          assigned_to?: number | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          document_id: number
          id?: never
          new_expiry_date?: string | null
          notes?: string | null
          old_expiry_date?: string | null
          priority?: string
          renewal_no?: string | null
          replacement_document_id?: number | null
          replacement_version_id?: number | null
          requested_at?: string
          requested_by?: number | null
          status?: string
          target_renewal_date?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          assigned_to?: number | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          document_id?: number
          id?: never
          new_expiry_date?: string | null
          notes?: string | null
          old_expiry_date?: string | null
          priority?: string
          renewal_no?: string | null
          replacement_document_id?: number | null
          replacement_version_id?: number | null
          requested_at?: string
          requested_by?: number | null
          status?: string
          target_renewal_date?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_renewal_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_renewal_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_renewal_requests_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_renewal_requests_replacement_document_id_fkey"
            columns: ["replacement_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_renewal_requests_replacement_version_id_fkey"
            columns: ["replacement_version_id"]
            isOneToOne: false
            referencedRelation: "dms_document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_renewal_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_renewal_requests_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_required_document_rules: {
        Row: {
          blocks_activation: boolean
          branch_id: number | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          department_id: number | null
          document_type_id: number | null
          effective_from: string | null
          effective_to: string | null
          entity_subtype: string | null
          entity_type: string
          id: number
          is_active: boolean
          is_required: boolean
          notes: string | null
          owner_company_id: number | null
          reminder_days_before_expiry: number[] | null
          requires_expiry_date: boolean
          requires_issue_date: boolean
          rule_code: string
          rule_name: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          blocks_activation?: boolean
          branch_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          department_id?: number | null
          document_type_id?: number | null
          effective_from?: string | null
          effective_to?: string | null
          entity_subtype?: string | null
          entity_type: string
          id?: never
          is_active?: boolean
          is_required?: boolean
          notes?: string | null
          owner_company_id?: number | null
          reminder_days_before_expiry?: number[] | null
          requires_expiry_date?: boolean
          requires_issue_date?: boolean
          rule_code: string
          rule_name: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          blocks_activation?: boolean
          branch_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          department_id?: number | null
          document_type_id?: number | null
          effective_from?: string | null
          effective_to?: string | null
          entity_subtype?: string | null
          entity_type?: string
          id?: never
          is_active?: boolean
          is_required?: boolean
          notes?: string | null
          owner_company_id?: number | null
          reminder_days_before_expiry?: number[] | null
          requires_expiry_date?: boolean
          requires_issue_date?: boolean
          rule_code?: string
          rule_name?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_required_document_rules_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_required_document_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_required_document_rules_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_required_document_rules_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "dms_document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_required_document_rules_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_required_document_rules_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_required_document_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_retention_policies: {
        Row: {
          action_on_expiry: string
          applies_to_types: string[] | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          description: string | null
          id: number
          is_active: boolean
          name_ar: string | null
          name_en: string
          policy_code: string
          retain_for_days: number | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          action_on_expiry?: string
          applies_to_types?: string[] | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en: string
          policy_code: string
          retain_for_days?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          action_on_expiry?: string
          applies_to_types?: string[] | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en?: string
          policy_code?: string
          retain_for_days?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_retention_policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_retention_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_review_queue: {
        Row: {
          ai_job_id: number | null
          ai_result_id: number | null
          assigned_at: string | null
          assigned_to: number | null
          confidence: number | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          document_id: number | null
          due_at: string | null
          entity_match_candidate_id: number | null
          field_code: string | null
          id: number
          idempotency_key: string | null
          metadata_definition_id: number | null
          notes: string | null
          payload_json: Json | null
          priority: string
          queued_at: string
          reason_code: string | null
          reason_message: string | null
          resolution_code: string | null
          resolution_note: string | null
          resolved_at: string | null
          review_completed_at: string | null
          review_started_at: string | null
          review_type: string
          reviewed_at: string | null
          reviewed_by: number | null
          source_id: string | null
          source_type: string | null
          status: string
          updated_at: string
          updated_by: number | null
          upload_session_id: number | null
          validation_finding_id: number | null
        }
        Insert: {
          ai_job_id?: number | null
          ai_result_id?: number | null
          assigned_at?: string | null
          assigned_to?: number | null
          confidence?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          document_id?: number | null
          due_at?: string | null
          entity_match_candidate_id?: number | null
          field_code?: string | null
          id?: never
          idempotency_key?: string | null
          metadata_definition_id?: number | null
          notes?: string | null
          payload_json?: Json | null
          priority?: string
          queued_at?: string
          reason_code?: string | null
          reason_message?: string | null
          resolution_code?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          review_completed_at?: string | null
          review_started_at?: string | null
          review_type?: string
          reviewed_at?: string | null
          reviewed_by?: number | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          updated_at?: string
          updated_by?: number | null
          upload_session_id?: number | null
          validation_finding_id?: number | null
        }
        Update: {
          ai_job_id?: number | null
          ai_result_id?: number | null
          assigned_at?: string | null
          assigned_to?: number | null
          confidence?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          document_id?: number | null
          due_at?: string | null
          entity_match_candidate_id?: number | null
          field_code?: string | null
          id?: never
          idempotency_key?: string | null
          metadata_definition_id?: number | null
          notes?: string | null
          payload_json?: Json | null
          priority?: string
          queued_at?: string
          reason_code?: string | null
          reason_message?: string | null
          resolution_code?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          review_completed_at?: string | null
          review_started_at?: string | null
          review_type?: string
          reviewed_at?: string | null
          reviewed_by?: number | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          updated_at?: string
          updated_by?: number | null
          upload_session_id?: number | null
          validation_finding_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_review_queue_ai_job_id_fkey"
            columns: ["ai_job_id"]
            isOneToOne: false
            referencedRelation: "dms_ai_job_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_review_queue_ai_result_id_fkey"
            columns: ["ai_result_id"]
            isOneToOne: false
            referencedRelation: "dms_ai_extraction_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_review_queue_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_review_queue_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_review_queue_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_review_queue_entity_match_candidate_id_fkey"
            columns: ["entity_match_candidate_id"]
            isOneToOne: false
            referencedRelation: "dms_ai_entity_match_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_review_queue_metadata_definition_id_fkey"
            columns: ["metadata_definition_id"]
            isOneToOne: false
            referencedRelation: "dms_metadata_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_review_queue_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_review_queue_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_review_queue_upload_session_id_fkey"
            columns: ["upload_session_id"]
            isOneToOne: false
            referencedRelation: "dms_upload_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_review_queue_validation_finding_id_fkey"
            columns: ["validation_finding_id"]
            isOneToOne: false
            referencedRelation: "dms_ai_validation_findings"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_saved_searches: {
        Row: {
          created_at: string
          deleted_at: string | null
          filter_json: Json
          id: number
          is_shared: boolean
          search_name: string
          updated_at: string
          user_id: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          filter_json: Json
          id?: never
          is_shared?: boolean
          search_name: string
          updated_at?: string
          user_id: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          filter_json?: Json
          id?: never
          is_shared?: boolean
          search_name?: string
          updated_at?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "dms_saved_searches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_tags: {
        Row: {
          color_hex: string | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          id: number
          is_active: boolean
          is_system: boolean
          tag_code: string | null
          tag_name: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          color_hex?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          tag_code?: string | null
          tag_name: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          color_hex?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          tag_code?: string | null
          tag_name?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_tags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_upload_batches: {
        Row: {
          approved_files: number
          batch_code: string
          created_at: string
          created_by: number | null
          deleted_at: string | null
          entity_id: number | null
          entity_type: string | null
          failed_files: number
          id: number
          processed_files: number
          status: string
          total_files: number
          updated_at: string
        }
        Insert: {
          approved_files?: number
          batch_code: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          entity_id?: number | null
          entity_type?: string | null
          failed_files?: number
          id?: never
          processed_files?: number
          status?: string
          total_files?: number
          updated_at?: string
        }
        Update: {
          approved_files?: number
          batch_code?: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          entity_id?: number | null
          entity_type?: string | null
          failed_files?: number
          id?: never
          processed_files?: number
          status?: string
          total_files?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dms_upload_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dms_upload_sessions: {
        Row: {
          ai_job_id: number | null
          ai_result_id: number | null
          approve_error: string | null
          approve_run_id: number | null
          approve_status: string | null
          approved_at: string | null
          batch_id: number | null
          cleanup_error_message: string | null
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          discard_reason: string | null
          discarded_at: string | null
          document_id: number | null
          duplicate_document_id: number | null
          error_message: string | null
          expires_at: string | null
          file_size_bytes: number
          id: number
          intake_status: string
          is_duplicate: boolean
          mime_type: string
          orchestration_completed_at: string | null
          orchestration_source: string | null
          orchestration_started_at: string | null
          orchestration_status: string
          orchestration_steps_json: Json | null
          orchestration_triggered_by_approve_run_id: number | null
          original_filename: string
          review_completed_at: string | null
          review_started_at: string | null
          review_status: string
          reviewed_by: number | null
          session_code: string
          sha256_hash: string | null
          status: string
          temp_cleaned_at: string | null
          temp_storage_path: string | null
          updated_at: string
          uploaded_at: string
          uploaded_by: number | null
        }
        Insert: {
          ai_job_id?: number | null
          ai_result_id?: number | null
          approve_error?: string | null
          approve_run_id?: number | null
          approve_status?: string | null
          approved_at?: string | null
          batch_id?: number | null
          cleanup_error_message?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          discard_reason?: string | null
          discarded_at?: string | null
          document_id?: number | null
          duplicate_document_id?: number | null
          error_message?: string | null
          expires_at?: string | null
          file_size_bytes: number
          id?: never
          intake_status?: string
          is_duplicate?: boolean
          mime_type: string
          orchestration_completed_at?: string | null
          orchestration_source?: string | null
          orchestration_started_at?: string | null
          orchestration_status?: string
          orchestration_steps_json?: Json | null
          orchestration_triggered_by_approve_run_id?: number | null
          original_filename: string
          review_completed_at?: string | null
          review_started_at?: string | null
          review_status?: string
          reviewed_by?: number | null
          session_code: string
          sha256_hash?: string | null
          status?: string
          temp_cleaned_at?: string | null
          temp_storage_path?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: number | null
        }
        Update: {
          ai_job_id?: number | null
          ai_result_id?: number | null
          approve_error?: string | null
          approve_run_id?: number | null
          approve_status?: string | null
          approved_at?: string | null
          batch_id?: number | null
          cleanup_error_message?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          discard_reason?: string | null
          discarded_at?: string | null
          document_id?: number | null
          duplicate_document_id?: number | null
          error_message?: string | null
          expires_at?: string | null
          file_size_bytes?: number
          id?: never
          intake_status?: string
          is_duplicate?: boolean
          mime_type?: string
          orchestration_completed_at?: string | null
          orchestration_source?: string | null
          orchestration_started_at?: string | null
          orchestration_status?: string
          orchestration_steps_json?: Json | null
          orchestration_triggered_by_approve_run_id?: number | null
          original_filename?: string
          review_completed_at?: string | null
          review_started_at?: string | null
          review_status?: string
          reviewed_by?: number | null
          session_code?: string
          sha256_hash?: string | null
          status?: string
          temp_cleaned_at?: string | null
          temp_storage_path?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dms_upload_sessions_ai_job_id_fkey"
            columns: ["ai_job_id"]
            isOneToOne: false
            referencedRelation: "dms_ai_extraction_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_upload_sessions_ai_result_id_fkey"
            columns: ["ai_result_id"]
            isOneToOne: false
            referencedRelation: "dms_ai_extraction_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_upload_sessions_approve_run_id_fkey"
            columns: ["approve_run_id"]
            isOneToOne: false
            referencedRelation: "dms_approve_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_upload_sessions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "dms_upload_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_upload_sessions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_upload_sessions_duplicate_document_id_fkey"
            columns: ["duplicate_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_upload_sessions_orchestration_triggered_by_approve_run_fkey"
            columns: ["orchestration_triggered_by_approve_run_id"]
            isOneToOne: false
            referencedRelation: "dms_approve_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_upload_sessions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dms_upload_sessions_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      emirates: {
        Row: {
          abbreviation_ar: string | null
          abbreviation_en: string
          country_id: number | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          emirate_code: string
          id: number
          is_active: boolean
          is_locked: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          region_type_code: string | null
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          abbreviation_ar?: string | null
          abbreviation_en: string
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_code: string
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          region_type_code?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          abbreviation_ar?: string | null
          abbreviation_en?: string
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_code?: string
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          region_type_code?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "emirates_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_access_cards: {
        Row: {
          access_type_id: number
          application_reference: string | null
          card_number: string | null
          client_authority: string | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          dms_document_id: number | null
          employee_id: number
          expiry_date: string | null
          id: number
          issue_date: string | null
          notes: string | null
          renewal_status: string
          status: string
          updated_at: string
          updated_by: number | null
          work_site_id: number | null
        }
        Insert: {
          access_type_id: number
          application_reference?: string | null
          card_number?: string | null
          client_authority?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          employee_id: number
          expiry_date?: string | null
          id?: never
          issue_date?: string | null
          notes?: string | null
          renewal_status?: string
          status?: string
          updated_at?: string
          updated_by?: number | null
          work_site_id?: number | null
        }
        Update: {
          access_type_id?: number
          application_reference?: string | null
          card_number?: string | null
          client_authority?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          employee_id?: number
          expiry_date?: string | null
          id?: never
          issue_date?: string | null
          notes?: string | null
          renewal_status?: string
          status?: string
          updated_at?: string
          updated_by?: number | null
          work_site_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_access_cards_access_type_id_fkey"
            columns: ["access_type_id"]
            isOneToOne: false
            referencedRelation: "hr_access_card_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_access_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_access_cards_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_access_cards_dms_document_id_fkey"
            columns: ["dms_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_access_cards_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_access_cards_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_access_cards_work_site_id_fkey"
            columns: ["work_site_id"]
            isOneToOne: false
            referencedRelation: "work_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_accommodation_records: {
        Row: {
          accommodation_location: string | null
          accommodation_type: string | null
          assigned_from: string
          assigned_to: string | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          employee_id: number
          id: number
          notes: string | null
          room_or_bed_no: string | null
          status: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          accommodation_location?: string | null
          accommodation_type?: string | null
          assigned_from: string
          assigned_to?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id: number
          id?: never
          notes?: string | null
          room_or_bed_no?: string | null
          status?: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          accommodation_location?: string | null
          accommodation_type?: string | null
          assigned_from?: string
          assigned_to?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id?: number
          id?: never
          notes?: string | null
          room_or_bed_no?: string | null
          status?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_accommodation_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_accommodation_records_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_accommodation_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_accommodation_records_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_approval_requests: {
        Row: {
          approval_role_id: number | null
          approval_type: string
          approved_at: string | null
          approved_by: number | null
          cancelled_at: string | null
          cancelled_by: number | null
          created_at: string
          created_by: number | null
          decision_reason: string | null
          deleted_at: string | null
          deleted_by: number | null
          employee_id: number
          id: number
          rejected_at: string | null
          rejected_by: number | null
          related_record_id: number | null
          related_record_type: string | null
          request_status: string
          request_title: string
          requested_at: string
          requested_by: number | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          approval_role_id?: number | null
          approval_type: string
          approved_at?: string | null
          approved_by?: number | null
          cancelled_at?: string | null
          cancelled_by?: number | null
          created_at?: string
          created_by?: number | null
          decision_reason?: string | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id: number
          id?: never
          rejected_at?: string | null
          rejected_by?: number | null
          related_record_id?: number | null
          related_record_type?: string | null
          request_status?: string
          request_title: string
          requested_at?: string
          requested_by?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          approval_role_id?: number | null
          approval_type?: string
          approved_at?: string | null
          approved_by?: number | null
          cancelled_at?: string | null
          cancelled_by?: number | null
          created_at?: string
          created_by?: number | null
          decision_reason?: string | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id?: number
          id?: never
          rejected_at?: string | null
          rejected_by?: number | null
          related_record_id?: number | null
          related_record_type?: string | null
          request_status?: string
          request_title?: string
          requested_at?: string
          requested_by?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_approval_requests_approval_role_id_fkey"
            columns: ["approval_role_id"]
            isOneToOne: false
            referencedRelation: "approval_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_approval_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_approval_requests_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_approval_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_approval_requests_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_approval_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_approval_requests_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_approval_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_approval_requests_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_assets: {
        Row: {
          asset_description: string
          asset_reference: string | null
          asset_type: string
          condition_on_issue: string | null
          condition_on_return: string | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          dms_document_id: number | null
          employee_id: number
          id: number
          issued_date: string
          notes: string | null
          return_due_date: string | null
          returned_date: string | null
          status: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          asset_description: string
          asset_reference?: string | null
          asset_type: string
          condition_on_issue?: string | null
          condition_on_return?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          employee_id: number
          id?: never
          issued_date?: string
          notes?: string | null
          return_due_date?: string | null
          returned_date?: string | null
          status?: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          asset_description?: string
          asset_reference?: string | null
          asset_type?: string
          condition_on_issue?: string | null
          condition_on_return?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          employee_id?: number
          id?: never
          issued_date?: string
          notes?: string | null
          return_due_date?: string | null
          returned_date?: string | null
          status?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assets_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assets_dms_document_id_fkey"
            columns: ["dms_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_assignments: {
        Row: {
          assignment_status: string
          assignment_type: string
          branch_id: number | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          department_id: number | null
          designation_id: number | null
          effective_from: string
          effective_to: string | null
          employee_id: number
          id: number
          notes: string | null
          owner_company_id: number | null
          reporting_manager_id: number | null
          supervisor_id: number | null
          updated_at: string
          updated_by: number | null
          work_site_id: number | null
        }
        Insert: {
          assignment_status?: string
          assignment_type?: string
          branch_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          department_id?: number | null
          designation_id?: number | null
          effective_from: string
          effective_to?: string | null
          employee_id: number
          id?: never
          notes?: string | null
          owner_company_id?: number | null
          reporting_manager_id?: number | null
          supervisor_id?: number | null
          updated_at?: string
          updated_by?: number | null
          work_site_id?: number | null
        }
        Update: {
          assignment_status?: string
          assignment_type?: string
          branch_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          department_id?: number | null
          designation_id?: number | null
          effective_from?: string
          effective_to?: string | null
          employee_id?: number
          id?: never
          notes?: string | null
          owner_company_id?: number | null
          reporting_manager_id?: number | null
          supervisor_id?: number | null
          updated_at?: string
          updated_by?: number | null
          work_site_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_assignments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assignments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assignments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assignments_designation_id_fkey"
            columns: ["designation_id"]
            isOneToOne: false
            referencedRelation: "designations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assignments_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assignments_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assignments_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assignments_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assignments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_assignments_work_site_id_fkey"
            columns: ["work_site_id"]
            isOneToOne: false
            referencedRelation: "work_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_attendance_corrections: {
        Row: {
          corrected_by: number
          correction_reason: string
          created_at: string
          employee_id: number
          id: number
          new_values_json: Json | null
          old_values_json: Json | null
          summary_id: number
        }
        Insert: {
          corrected_by: number
          correction_reason: string
          created_at?: string
          employee_id: number
          id?: never
          new_values_json?: Json | null
          old_values_json?: Json | null
          summary_id: number
        }
        Update: {
          corrected_by?: number
          correction_reason?: string
          created_at?: string
          employee_id?: number
          id?: never
          new_values_json?: Json | null
          old_values_json?: Json | null
          summary_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_attendance_corrections_corrected_by_fkey"
            columns: ["corrected_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_attendance_corrections_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_attendance_corrections_summary_id_fkey"
            columns: ["summary_id"]
            isOneToOne: false
            referencedRelation: "employee_attendance_daily_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_attendance_daily_summary: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: number | null
          attendance_date: string
          attendance_type: string
          created_at: string
          created_by: number | null
          early_out_minutes: number
          employee_id: number
          first_in_at: string | null
          id: number
          is_missing_punch: boolean
          last_out_at: string | null
          late_minutes: number
          notes: string | null
          overtime_hours: number
          total_hours: number | null
          updated_at: string
          updated_by: number | null
          work_site_id: number | null
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: number | null
          attendance_date: string
          attendance_type: string
          created_at?: string
          created_by?: number | null
          early_out_minutes?: number
          employee_id: number
          first_in_at?: string | null
          id?: never
          is_missing_punch?: boolean
          last_out_at?: string | null
          late_minutes?: number
          notes?: string | null
          overtime_hours?: number
          total_hours?: number | null
          updated_at?: string
          updated_by?: number | null
          work_site_id?: number | null
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: number | null
          attendance_date?: string
          attendance_type?: string
          created_at?: string
          created_by?: number | null
          early_out_minutes?: number
          employee_id?: number
          first_in_at?: string | null
          id?: never
          is_missing_punch?: boolean
          last_out_at?: string | null
          late_minutes?: number
          notes?: string | null
          overtime_hours?: number
          total_hours?: number | null
          updated_at?: string
          updated_by?: number | null
          work_site_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_attendance_daily_summary_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_attendance_daily_summary_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_attendance_daily_summary_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_attendance_daily_summary_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_attendance_daily_summary_work_site_id_fkey"
            columns: ["work_site_id"]
            isOneToOne: false
            referencedRelation: "work_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_attendance_punches: {
        Row: {
          created_at: string
          created_by: number | null
          device_reference: string | null
          employee_id: number
          external_reference: string | null
          id: number
          notes: string | null
          punch_datetime: string
          punch_source: string | null
          punch_type: string
          work_site_id: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          device_reference?: string | null
          employee_id: number
          external_reference?: string | null
          id?: never
          notes?: string | null
          punch_datetime: string
          punch_source?: string | null
          punch_type: string
          work_site_id?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          device_reference?: string | null
          employee_id?: number
          external_reference?: string | null
          id?: never
          notes?: string | null
          punch_datetime?: string
          punch_source?: string | null
          punch_type?: string
          work_site_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_attendance_punches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_attendance_punches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_attendance_punches_work_site_id_fkey"
            columns: ["work_site_id"]
            isOneToOne: false
            referencedRelation: "work_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_clearance_items: {
        Row: {
          clearance_area: string
          cleared_at: string | null
          cleared_by: number | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          employee_id: number
          eos_case_id: number
          id: number
          item_status: string
          item_title: string
          notes: string | null
          responsible_user_id: number | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          clearance_area: string
          cleared_at?: string | null
          cleared_by?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id: number
          eos_case_id: number
          id?: never
          item_status?: string
          item_title: string
          notes?: string | null
          responsible_user_id?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          clearance_area?: string
          cleared_at?: string | null
          cleared_by?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id?: number
          eos_case_id?: number
          id?: never
          item_status?: string
          item_title?: string
          notes?: string | null
          responsible_user_id?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_clearance_items_cleared_by_fkey"
            columns: ["cleared_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_clearance_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_clearance_items_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_clearance_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_clearance_items_eos_case_id_fkey"
            columns: ["eos_case_id"]
            isOneToOne: false
            referencedRelation: "employee_eos_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_clearance_items_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_clearance_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_dependents: {
        Row: {
          created_at: string
          created_by: number | null
          date_of_birth: string | null
          deleted_at: string | null
          deleted_by: number | null
          dependent_name_ar: string | null
          dependent_name_en: string
          dms_document_id: number | null
          emirates_id_expiry: string | null
          emirates_id_number: string | null
          employee_id: number
          id: number
          is_active: boolean
          is_covered_on_medical: boolean
          medical_insurance_card: string | null
          medical_insurance_expiry: string | null
          medical_insurance_policy: string | null
          medical_insurance_provider: string | null
          nationality_id: number | null
          notes: string | null
          passport_expiry: string | null
          passport_number: string | null
          relationship_type_id: number
          residence_visa_expiry: string | null
          residence_visa_number: string | null
          sponsored_by: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          date_of_birth?: string | null
          deleted_at?: string | null
          deleted_by?: number | null
          dependent_name_ar?: string | null
          dependent_name_en: string
          dms_document_id?: number | null
          emirates_id_expiry?: string | null
          emirates_id_number?: string | null
          employee_id: number
          id?: never
          is_active?: boolean
          is_covered_on_medical?: boolean
          medical_insurance_card?: string | null
          medical_insurance_expiry?: string | null
          medical_insurance_policy?: string | null
          medical_insurance_provider?: string | null
          nationality_id?: number | null
          notes?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          relationship_type_id: number
          residence_visa_expiry?: string | null
          residence_visa_number?: string | null
          sponsored_by?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          date_of_birth?: string | null
          deleted_at?: string | null
          deleted_by?: number | null
          dependent_name_ar?: string | null
          dependent_name_en?: string
          dms_document_id?: number | null
          emirates_id_expiry?: string | null
          emirates_id_number?: string | null
          employee_id?: number
          id?: never
          is_active?: boolean
          is_covered_on_medical?: boolean
          medical_insurance_card?: string | null
          medical_insurance_expiry?: string | null
          medical_insurance_policy?: string | null
          medical_insurance_provider?: string | null
          nationality_id?: number | null
          notes?: string | null
          passport_expiry?: string | null
          passport_number?: string | null
          relationship_type_id?: number
          residence_visa_expiry?: string | null
          residence_visa_number?: string | null
          sponsored_by?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_dependents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_dependents_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_dependents_dms_document_id_fkey"
            columns: ["dms_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_dependents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_dependents_nationality_id_fkey"
            columns: ["nationality_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_dependents_relationship_type_id_fkey"
            columns: ["relationship_type_id"]
            isOneToOne: false
            referencedRelation: "hr_relationship_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_dependents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_disciplinary_records: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by_employee: boolean
          action_taken: string | null
          created_at: string
          created_by: number | null
          creates_operational_block: boolean
          deleted_at: string | null
          deleted_by: number | null
          description: string | null
          disciplinary_type: string
          dms_document_id: number | null
          employee_id: number
          id: number
          incident_date: string | null
          issued_by: number | null
          operational_block_id: number | null
          record_date: string
          severity: string
          status: string
          subject: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by_employee?: boolean
          action_taken?: string | null
          created_at?: string
          created_by?: number | null
          creates_operational_block?: boolean
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          disciplinary_type: string
          dms_document_id?: number | null
          employee_id: number
          id?: never
          incident_date?: string | null
          issued_by?: number | null
          operational_block_id?: number | null
          record_date?: string
          severity?: string
          status?: string
          subject: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by_employee?: boolean
          action_taken?: string | null
          created_at?: string
          created_by?: number | null
          creates_operational_block?: boolean
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          disciplinary_type?: string
          dms_document_id?: number | null
          employee_id?: number
          id?: never
          incident_date?: string | null
          issued_by?: number | null
          operational_block_id?: number | null
          record_date?: string
          severity?: string
          status?: string
          subject?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_disciplinary_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_disciplinary_records_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_disciplinary_records_dms_document_id_fkey"
            columns: ["dms_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_disciplinary_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_disciplinary_records_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_disciplinary_records_operational_block_id_fkey"
            columns: ["operational_block_id"]
            isOneToOne: false
            referencedRelation: "employee_operational_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_disciplinary_records_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_document_links: {
        Row: {
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          dms_document_id: number
          employee_id: number
          id: number
          related_record_id: number | null
          related_record_type: string | null
          relation_purpose: string | null
          verification_status: string
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id: number
          employee_id: number
          id?: never
          related_record_id?: number | null
          related_record_type?: string | null
          relation_purpose?: string | null
          verification_status?: string
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number
          employee_id?: number
          id?: never
          related_record_id?: number | null
          related_record_type?: string | null
          relation_purpose?: string | null
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_document_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_document_links_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_document_links_dms_document_id_fkey"
            columns: ["dms_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_document_links_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_eos_cases: {
        Row: {
          case_status: string
          clearance_completed: boolean
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          dms_document_id: number | null
          employee_id: number
          eos_type: string
          final_settlement_status: string
          id: number
          last_working_date: string | null
          notes: string | null
          notice_date: string | null
          reason: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          case_status?: string
          clearance_completed?: boolean
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          employee_id: number
          eos_type: string
          final_settlement_status?: string
          id?: never
          last_working_date?: string | null
          notes?: string | null
          notice_date?: string | null
          reason?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          case_status?: string
          clearance_completed?: boolean
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          employee_id?: number
          eos_type?: string
          final_settlement_status?: string
          id?: never
          last_working_date?: string | null
          notes?: string | null
          notice_date?: string | null
          reason?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_eos_cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_eos_cases_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_eos_cases_dms_document_id_fkey"
            columns: ["dms_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_eos_cases_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_eos_cases_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_hr_actions: {
        Row: {
          action_date: string
          action_status: string
          action_title: string
          action_type: string
          approval_request_id: number | null
          assigned_to: number | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          dms_document_id: number | null
          due_date: string | null
          employee_id: number
          id: number
          notes: string | null
          related_record_id: number | null
          related_record_type: string | null
          requires_approval: boolean
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          action_date?: string
          action_status?: string
          action_title: string
          action_type: string
          approval_request_id?: number | null
          assigned_to?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          due_date?: string | null
          employee_id: number
          id?: never
          notes?: string | null
          related_record_id?: number | null
          related_record_type?: string | null
          requires_approval?: boolean
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          action_date?: string
          action_status?: string
          action_title?: string
          action_type?: string
          approval_request_id?: number | null
          assigned_to?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          due_date?: string | null
          employee_id?: number
          id?: never
          notes?: string | null
          related_record_id?: number | null
          related_record_type?: string | null
          requires_approval?: boolean
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_hr_actions_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_hr_actions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_hr_actions_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_hr_actions_dms_document_id_fkey"
            columns: ["dms_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_hr_actions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_hr_actions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_hr_actions_approval_request"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "employee_approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_hr_notes: {
        Row: {
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          employee_id: number
          id: number
          note_text: string
          note_type: string
          related_record_id: number | null
          related_record_type: string | null
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id: number
          id?: never
          note_text: string
          note_type?: string
          related_record_id?: number | null
          related_record_type?: string | null
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id?: number
          id?: never
          note_text?: string
          note_type?: string
          related_record_id?: number | null
          related_record_type?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_hr_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_hr_notes_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_hr_notes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_identity_documents: {
        Row: {
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          dms_document_id: number | null
          document_number: string
          document_type_id: number
          emirates_id_application_no: string | null
          employee_id: number
          expiry_date: string | null
          id: number
          issue_city_id: number | null
          issue_country_id: number | null
          issue_date: string | null
          issuing_authority: string | null
          issuing_authority_party_id: number | null
          issuing_emirate_id: number | null
          labour_card_number: string | null
          mohre_person_code: string | null
          notes: string | null
          place_of_issue: string | null
          profession_on_document: string | null
          renewal_status: string
          sponsor_company_id: number | null
          status: string
          uid_number: string | null
          updated_at: string
          updated_by: number | null
          verification_status: string
          verified_at: string | null
          verified_by: number | null
          visa_file_number: string | null
          work_permit_number: string | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          document_number: string
          document_type_id: number
          emirates_id_application_no?: string | null
          employee_id: number
          expiry_date?: string | null
          id?: never
          issue_city_id?: number | null
          issue_country_id?: number | null
          issue_date?: string | null
          issuing_authority?: string | null
          issuing_authority_party_id?: number | null
          issuing_emirate_id?: number | null
          labour_card_number?: string | null
          mohre_person_code?: string | null
          notes?: string | null
          place_of_issue?: string | null
          profession_on_document?: string | null
          renewal_status?: string
          sponsor_company_id?: number | null
          status?: string
          uid_number?: string | null
          updated_at?: string
          updated_by?: number | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: number | null
          visa_file_number?: string | null
          work_permit_number?: string | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          document_number?: string
          document_type_id?: number
          emirates_id_application_no?: string | null
          employee_id?: number
          expiry_date?: string | null
          id?: never
          issue_city_id?: number | null
          issue_country_id?: number | null
          issue_date?: string | null
          issuing_authority?: string | null
          issuing_authority_party_id?: number | null
          issuing_emirate_id?: number | null
          labour_card_number?: string | null
          mohre_person_code?: string | null
          notes?: string | null
          place_of_issue?: string | null
          profession_on_document?: string | null
          renewal_status?: string
          sponsor_company_id?: number | null
          status?: string
          uid_number?: string | null
          updated_at?: string
          updated_by?: number | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: number | null
          visa_file_number?: string | null
          work_permit_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_identity_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_identity_documents_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_identity_documents_dms_document_id_fkey"
            columns: ["dms_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_identity_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "hr_identity_document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_identity_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_identity_documents_issue_city_id_fkey"
            columns: ["issue_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_identity_documents_issue_country_id_fkey"
            columns: ["issue_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_identity_documents_issuing_authority_party_id_fkey"
            columns: ["issuing_authority_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_identity_documents_issuing_emirate_id_fkey"
            columns: ["issuing_emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_identity_documents_sponsor_company_id_fkey"
            columns: ["sponsor_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_identity_documents_sponsor_company_id_fkey"
            columns: ["sponsor_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_identity_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_identity_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_leave_balances: {
        Row: {
          balance_days: number | null
          carry_forward: number
          created_at: string
          created_by: number | null
          employee_id: number
          entitled_days: number
          id: number
          leave_type_id: number
          leave_year: number
          updated_at: string
          updated_by: number | null
          used_days: number
        }
        Insert: {
          balance_days?: number | null
          carry_forward?: number
          created_at?: string
          created_by?: number | null
          employee_id: number
          entitled_days?: number
          id?: never
          leave_type_id: number
          leave_year: number
          updated_at?: string
          updated_by?: number | null
          used_days?: number
        }
        Update: {
          balance_days?: number | null
          carry_forward?: number
          created_at?: string
          created_by?: number | null
          employee_id?: number
          entitled_days?: number
          id?: never
          leave_type_id?: number
          leave_year?: number
          updated_at?: string
          updated_by?: number | null
          used_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_leave_balances_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leave_balances_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leave_balances_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_leave_requests: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: number | null
          cancelled_at: string | null
          cancelled_by: number | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          employee_id: number
          end_date: string
          id: number
          leave_type_id: number
          notes: string | null
          reason: string | null
          rejected_at: string | null
          rejected_by: number | null
          request_date: string
          return_date: string | null
          sick_cert_dms_id: number | null
          start_date: string
          total_days: number | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: number | null
          cancelled_at?: string | null
          cancelled_by?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id: number
          end_date: string
          id?: never
          leave_type_id: number
          notes?: string | null
          reason?: string | null
          rejected_at?: string | null
          rejected_by?: number | null
          request_date?: string
          return_date?: string | null
          sick_cert_dms_id?: number | null
          start_date: string
          total_days?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: number | null
          cancelled_at?: string | null
          cancelled_by?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id?: number
          end_date?: string
          id?: never
          leave_type_id?: number
          notes?: string | null
          reason?: string | null
          rejected_at?: string | null
          rejected_by?: number | null
          request_date?: string
          return_date?: string | null
          sick_cert_dms_id?: number | null
          start_date?: string
          total_days?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_leave_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leave_requests_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leave_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leave_requests_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leave_requests_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leave_requests_sick_cert_dms_id_fkey"
            columns: ["sick_cert_dms_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_leave_requests_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_medical_insurances: {
        Row: {
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          dependent_count_covered: number | null
          dependent_coverage_included: boolean
          dms_document_id: number | null
          effective_date: string | null
          employee_covered: boolean
          employee_id: number
          expiry_date: string
          id: number
          insurance_card_number: string | null
          insurance_provider: string
          issue_date: string | null
          network_class: string | null
          notes: string | null
          owner_company_id: number | null
          policy_number: string
          renewal_status: string
          status: string
          tpa: string | null
          updated_at: string
          updated_by: number | null
          verification_status: string
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dependent_count_covered?: number | null
          dependent_coverage_included?: boolean
          dms_document_id?: number | null
          effective_date?: string | null
          employee_covered?: boolean
          employee_id: number
          expiry_date: string
          id?: never
          insurance_card_number?: string | null
          insurance_provider: string
          issue_date?: string | null
          network_class?: string | null
          notes?: string | null
          owner_company_id?: number | null
          policy_number: string
          renewal_status?: string
          status?: string
          tpa?: string | null
          updated_at?: string
          updated_by?: number | null
          verification_status?: string
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dependent_count_covered?: number | null
          dependent_coverage_included?: boolean
          dms_document_id?: number | null
          effective_date?: string | null
          employee_covered?: boolean
          employee_id?: number
          expiry_date?: string
          id?: never
          insurance_card_number?: string | null
          insurance_provider?: string
          issue_date?: string | null
          network_class?: string | null
          notes?: string | null
          owner_company_id?: number | null
          policy_number?: string
          renewal_status?: string
          status?: string
          tpa?: string | null
          updated_at?: string
          updated_by?: number | null
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_medical_insurances_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_medical_insurances_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_medical_insurances_dms_document_id_fkey"
            columns: ["dms_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_medical_insurances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_medical_insurances_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_medical_insurances_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_medical_insurances_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_medical_records: {
        Row: {
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          dms_document_id: number | null
          employee_id: number
          examination_date: string
          fit_for_work: boolean
          id: number
          medical_center: string | null
          medical_record_type_id: number
          next_examination_date: string | null
          notes: string | null
          report_number: string | null
          required_for_noc: boolean
          required_for_site: boolean
          required_for_visa: boolean
          restriction_details: string | null
          result: string
          updated_at: string
          updated_by: number | null
          work_restrictions: boolean
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          employee_id: number
          examination_date: string
          fit_for_work?: boolean
          id?: never
          medical_center?: string | null
          medical_record_type_id: number
          next_examination_date?: string | null
          notes?: string | null
          report_number?: string | null
          required_for_noc?: boolean
          required_for_site?: boolean
          required_for_visa?: boolean
          restriction_details?: string | null
          result: string
          updated_at?: string
          updated_by?: number | null
          work_restrictions?: boolean
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          employee_id?: number
          examination_date?: string
          fit_for_work?: boolean
          id?: never
          medical_center?: string | null
          medical_record_type_id?: number
          next_examination_date?: string | null
          notes?: string | null
          report_number?: string | null
          required_for_noc?: boolean
          required_for_site?: boolean
          required_for_visa?: boolean
          restriction_details?: string | null
          result?: string
          updated_at?: string
          updated_by?: number | null
          work_restrictions?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "employee_medical_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_medical_records_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_medical_records_dms_document_id_fkey"
            columns: ["dms_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_medical_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_medical_records_medical_record_type_id_fkey"
            columns: ["medical_record_type_id"]
            isOneToOne: false
            referencedRelation: "hr_medical_record_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_medical_records_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_operational_blocks: {
        Row: {
          block_reason: string
          block_status: string
          block_type: string
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          effective_from: string
          effective_to: string | null
          employee_id: number
          id: number
          notes: string | null
          related_record_id: number | null
          related_record_type: string | null
          release_reason: string | null
          released_at: string | null
          released_by: number | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          block_reason: string
          block_status?: string
          block_type: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          effective_from?: string
          effective_to?: string | null
          employee_id: number
          id?: never
          notes?: string | null
          related_record_id?: number | null
          related_record_type?: string | null
          release_reason?: string | null
          released_at?: string | null
          released_by?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          block_reason?: string
          block_status?: string
          block_type?: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          effective_from?: string
          effective_to?: string | null
          employee_id?: number
          id?: never
          notes?: string | null
          related_record_id?: number | null
          related_record_type?: string | null
          release_reason?: string | null
          released_at?: string | null
          released_by?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_operational_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_operational_blocks_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_operational_blocks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_operational_blocks_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_operational_blocks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_overtime_records: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: number | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          employee_id: number
          hours: number
          id: number
          notes: string | null
          overtime_date: string
          reason: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id: number
          hours: number
          id?: never
          notes?: string | null
          overtime_date: string
          reason?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id?: number
          hours?: number
          id?: never
          notes?: string | null
          overtime_date?: string
          reason?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_overtime_records_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_overtime_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_overtime_records_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_overtime_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_overtime_records_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_payroll_holds: {
        Row: {
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          employee_id: number
          hold_date: string
          hold_reason: string
          id: number
          is_active: boolean
          notes: string | null
          release_date: string | null
          released_by: number | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id: number
          hold_date?: string
          hold_reason: string
          id?: never
          is_active?: boolean
          notes?: string | null
          release_date?: string | null
          released_by?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id?: number
          hold_date?: string
          hold_reason?: string
          id?: never
          is_active?: boolean
          notes?: string | null
          release_date?: string | null
          released_by?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_payroll_holds_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_holds_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_holds_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_holds_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_holds_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_payroll_profiles: {
        Row: {
          created_at: string
          created_by: number | null
          currency: string
          deleted_at: string | null
          deleted_by: number | null
          effective_date: string
          employee_id: number
          id: number
          notes: string | null
          payroll_group_id: number | null
          payroll_status: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: number | null
          effective_date: string
          employee_id: number
          id?: never
          notes?: string | null
          payroll_group_id?: number | null
          payroll_status?: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: number | null
          effective_date?: string
          employee_id?: number
          id?: never
          notes?: string | null
          payroll_group_id?: number | null
          payroll_status?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_payroll_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_profiles_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_profiles_payroll_group_id_fkey"
            columns: ["payroll_group_id"]
            isOneToOne: false
            referencedRelation: "hr_payroll_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_performance_records: {
        Row: {
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          dms_document_id: number | null
          employee_id: number
          id: number
          improvement_areas: string | null
          next_review_date: string | null
          rating: string | null
          review_date: string
          review_period_end: string | null
          review_period_start: string | null
          review_type: string
          reviewer_id: number | null
          status: string
          strengths: string | null
          summary: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          employee_id: number
          id?: never
          improvement_areas?: string | null
          next_review_date?: string | null
          rating?: string | null
          review_date?: string
          review_period_end?: string | null
          review_period_start?: string | null
          review_type: string
          reviewer_id?: number | null
          status?: string
          strengths?: string | null
          summary?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          employee_id?: number
          id?: never
          improvement_areas?: string | null
          next_review_date?: string | null
          rating?: string | null
          review_date?: string
          review_period_end?: string | null
          review_period_start?: string | null
          review_type?: string
          reviewer_id?: number | null
          status?: string
          strengths?: string | null
          summary?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_performance_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_performance_records_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_performance_records_dms_document_id_fkey"
            columns: ["dms_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_performance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_performance_records_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_performance_records_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_ppe_issues: {
        Row: {
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          dms_document_id: number | null
          employee_id: number
          expiry_or_replacement_date: string | null
          id: number
          issued_by: number | null
          issued_date: string
          notes: string | null
          ppe_item: string
          quantity: number
          returned_date: string | null
          standard_or_size: string | null
          status: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          employee_id: number
          expiry_or_replacement_date?: string | null
          id?: never
          issued_by?: number | null
          issued_date?: string
          notes?: string | null
          ppe_item: string
          quantity?: number
          returned_date?: string | null
          standard_or_size?: string | null
          status?: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          employee_id?: number
          expiry_or_replacement_date?: string | null
          id?: never
          issued_by?: number | null
          issued_date?: string
          notes?: string | null
          ppe_item?: string
          quantity?: number
          returned_date?: string | null
          standard_or_size?: string | null
          status?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_ppe_issues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_ppe_issues_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_ppe_issues_dms_document_id_fkey"
            columns: ["dms_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_ppe_issues_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_ppe_issues_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_ppe_issues_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_pro_processes: {
        Row: {
          assigned_to: number | null
          completed_date: string | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          employee_id: number
          id: number
          notes: string | null
          priority: string
          process_status: string
          process_title: string
          process_type_id: number | null
          related_document_id: number | null
          related_record_id: number | null
          related_record_type: string | null
          request_date: string
          submitted_date: string | null
          target_date: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          assigned_to?: number | null
          completed_date?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id: number
          id?: never
          notes?: string | null
          priority?: string
          process_status?: string
          process_title: string
          process_type_id?: number | null
          related_document_id?: number | null
          related_record_id?: number | null
          related_record_type?: string | null
          request_date?: string
          submitted_date?: string | null
          target_date?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          assigned_to?: number | null
          completed_date?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id?: number
          id?: never
          notes?: string | null
          priority?: string
          process_status?: string
          process_title?: string
          process_type_id?: number | null
          related_document_id?: number | null
          related_record_id?: number | null
          related_record_type?: string | null
          request_date?: string
          submitted_date?: string | null
          target_date?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_pro_processes_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_pro_processes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_pro_processes_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_pro_processes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_pro_processes_process_type_id_fkey"
            columns: ["process_type_id"]
            isOneToOne: false
            referencedRelation: "hr_pro_process_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_pro_processes_related_document_id_fkey"
            columns: ["related_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_pro_processes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_recruitment_links: {
        Row: {
          candidate_id: number | null
          conversion_notes: string | null
          converted_at: string
          converted_by: number | null
          created_at: string
          created_by: number | null
          employee_id: number
          id: number
          offer_id: number | null
          requisition_id: number | null
        }
        Insert: {
          candidate_id?: number | null
          conversion_notes?: string | null
          converted_at?: string
          converted_by?: number | null
          created_at?: string
          created_by?: number | null
          employee_id: number
          id?: never
          offer_id?: number | null
          requisition_id?: number | null
        }
        Update: {
          candidate_id?: number | null
          conversion_notes?: string | null
          converted_at?: string
          converted_by?: number | null
          created_at?: string
          created_by?: number | null
          employee_id?: number
          id?: never
          offer_id?: number | null
          requisition_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_recruitment_links_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_recruitment_links_converted_by_fkey"
            columns: ["converted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_recruitment_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_recruitment_links_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_recruitment_links_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "hr_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_recruitment_links_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "hr_job_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_role_requirements: {
        Row: {
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          designation_id: number | null
          employee_id: number
          expiry_date: string | null
          id: number
          is_met: boolean
          is_required: boolean
          met_record_id: number | null
          met_record_type: string | null
          required_reference_id: number | null
          requirement_name: string
          requirement_source: string | null
          requirement_type: string
          status: string
          updated_at: string
          updated_by: number | null
          waived_at: string | null
          waived_by: number | null
          waiver_reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          designation_id?: number | null
          employee_id: number
          expiry_date?: string | null
          id?: never
          is_met?: boolean
          is_required?: boolean
          met_record_id?: number | null
          met_record_type?: string | null
          required_reference_id?: number | null
          requirement_name: string
          requirement_source?: string | null
          requirement_type: string
          status?: string
          updated_at?: string
          updated_by?: number | null
          waived_at?: string | null
          waived_by?: number | null
          waiver_reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          designation_id?: number | null
          employee_id?: number
          expiry_date?: string | null
          id?: never
          is_met?: boolean
          is_required?: boolean
          met_record_id?: number | null
          met_record_type?: string | null
          required_reference_id?: number | null
          requirement_name?: string
          requirement_source?: string | null
          requirement_type?: string
          status?: string
          updated_at?: string
          updated_by?: number | null
          waived_at?: string | null
          waived_by?: number | null
          waiver_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_role_requirements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_role_requirements_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_role_requirements_designation_id_fkey"
            columns: ["designation_id"]
            isOneToOne: false
            referencedRelation: "designations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_role_requirements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_role_requirements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_role_requirements_waived_by_fkey"
            columns: ["waived_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_salary_components: {
        Row: {
          amount: number
          component_type_id: number
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          effective_from: string
          effective_to: string | null
          employee_id: number
          id: number
          is_active: boolean
          notes: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          amount: number
          component_type_id: number
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          effective_from: string
          effective_to?: string | null
          employee_id: number
          id?: never
          is_active?: boolean
          notes?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          amount?: number
          component_type_id?: number
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          effective_from?: string
          effective_to?: string | null
          employee_id?: number
          id?: never
          is_active?: boolean
          notes?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_salary_components_component_type_id_fkey"
            columns: ["component_type_id"]
            isOneToOne: false
            referencedRelation: "hr_salary_component_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_salary_components_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_salary_components_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_salary_components_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_salary_components_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_salary_revisions: {
        Row: {
          approved_by: number | null
          created_at: string
          created_by: number | null
          effective_date: string
          employee_id: number
          id: number
          new_gross: number | null
          old_gross: number | null
          revision_reason: string | null
        }
        Insert: {
          approved_by?: number | null
          created_at?: string
          created_by?: number | null
          effective_date: string
          employee_id: number
          id?: never
          new_gross?: number | null
          old_gross?: number | null
          revision_reason?: string | null
        }
        Update: {
          approved_by?: number | null
          created_at?: string
          created_by?: number | null
          effective_date?: string
          employee_id?: number
          id?: never
          new_gross?: number | null
          old_gross?: number | null
          revision_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_salary_revisions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_salary_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_salary_revisions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_shift_assignments: {
        Row: {
          attendance_required: boolean
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          effective_from: string
          effective_to: string | null
          employee_id: number
          id: number
          notes: string | null
          overtime_eligible: boolean
          updated_at: string
          updated_by: number | null
          weekly_off_day: string | null
          work_calendar_id: number | null
          work_shift_id: number | null
        }
        Insert: {
          attendance_required?: boolean
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          effective_from: string
          effective_to?: string | null
          employee_id: number
          id?: never
          notes?: string | null
          overtime_eligible?: boolean
          updated_at?: string
          updated_by?: number | null
          weekly_off_day?: string | null
          work_calendar_id?: number | null
          work_shift_id?: number | null
        }
        Update: {
          attendance_required?: boolean
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          effective_from?: string
          effective_to?: string | null
          employee_id?: number
          id?: never
          notes?: string | null
          overtime_eligible?: boolean
          updated_at?: string
          updated_by?: number | null
          weekly_off_day?: string | null
          work_calendar_id?: number | null
          work_shift_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_shift_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_shift_assignments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_shift_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_shift_assignments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_shift_assignments_work_calendar_id_fkey"
            columns: ["work_calendar_id"]
            isOneToOne: false
            referencedRelation: "work_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_shift_assignments_work_shift_id_fkey"
            columns: ["work_shift_id"]
            isOneToOne: false
            referencedRelation: "work_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_site_readiness: {
        Row: {
          access_card_record_id: number | null
          checked_at: string
          checked_by: number | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          employee_id: number
          id: number
          medical_record_id: number | null
          missing_requirements_json: Json | null
          notes: string | null
          readiness_status: string
          required_access_card_type_id: number | null
          training_record_ids: number[] | null
          updated_at: string
          updated_by: number | null
          work_site_id: number
        }
        Insert: {
          access_card_record_id?: number | null
          checked_at?: string
          checked_by?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id: number
          id?: never
          medical_record_id?: number | null
          missing_requirements_json?: Json | null
          notes?: string | null
          readiness_status?: string
          required_access_card_type_id?: number | null
          training_record_ids?: number[] | null
          updated_at?: string
          updated_by?: number | null
          work_site_id: number
        }
        Update: {
          access_card_record_id?: number | null
          checked_at?: string
          checked_by?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id?: number
          id?: never
          medical_record_id?: number | null
          missing_requirements_json?: Json | null
          notes?: string | null
          readiness_status?: string
          required_access_card_type_id?: number | null
          training_record_ids?: number[] | null
          updated_at?: string
          updated_by?: number | null
          work_site_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_site_readiness_access_card_record_id_fkey"
            columns: ["access_card_record_id"]
            isOneToOne: false
            referencedRelation: "employee_access_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_site_readiness_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_site_readiness_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_site_readiness_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_site_readiness_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_site_readiness_medical_record_id_fkey"
            columns: ["medical_record_id"]
            isOneToOne: false
            referencedRelation: "employee_medical_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_site_readiness_required_access_card_type_id_fkey"
            columns: ["required_access_card_type_id"]
            isOneToOne: false
            referencedRelation: "hr_access_card_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_site_readiness_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_site_readiness_work_site_id_fkey"
            columns: ["work_site_id"]
            isOneToOne: false
            referencedRelation: "work_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_status_events: {
        Row: {
          created_at: string
          created_by: number | null
          effective_date: string | null
          employee_id: number
          id: number
          new_status: string
          old_status: string | null
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          effective_date?: string | null
          employee_id: number
          id?: never
          new_status: string
          old_status?: string | null
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          effective_date?: string | null
          employee_id?: number
          id?: never
          new_status?: string
          old_status?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_status_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_status_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_training_certificates: {
        Row: {
          approval_body: string | null
          certificate_number: string | null
          completion_date: string | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          dms_document_id: number | null
          employee_id: number
          expiry_date: string | null
          id: number
          notes: string | null
          provider: string | null
          required_for_designation: boolean
          required_for_site: boolean
          status: string
          training_category_id: number | null
          training_type_id: number
          updated_at: string
          updated_by: number | null
          verification_status: string
        }
        Insert: {
          approval_body?: string | null
          certificate_number?: string | null
          completion_date?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          employee_id: number
          expiry_date?: string | null
          id?: never
          notes?: string | null
          provider?: string | null
          required_for_designation?: boolean
          required_for_site?: boolean
          status?: string
          training_category_id?: number | null
          training_type_id: number
          updated_at?: string
          updated_by?: number | null
          verification_status?: string
        }
        Update: {
          approval_body?: string | null
          certificate_number?: string | null
          completion_date?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          employee_id?: number
          expiry_date?: string | null
          id?: never
          notes?: string | null
          provider?: string | null
          required_for_designation?: boolean
          required_for_site?: boolean
          status?: string
          training_category_id?: number | null
          training_type_id?: number
          updated_at?: string
          updated_by?: number | null
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_training_certificates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_training_certificates_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_training_certificates_dms_document_id_fkey"
            columns: ["dms_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_training_certificates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_training_certificates_training_category_id_fkey"
            columns: ["training_category_id"]
            isOneToOne: false
            referencedRelation: "hr_training_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_training_certificates_training_type_id_fkey"
            columns: ["training_type_id"]
            isOneToOne: false
            referencedRelation: "hr_training_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_training_certificates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_wps_profiles: {
        Row: {
          account_holder_name: string | null
          account_number: string | null
          bank_id: number | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          employee_id: number
          exchange_house: string | null
          iban: string | null
          id: number
          labour_card_number: string | null
          mohre_establishment_id: number | null
          mohre_person_code: string | null
          salary_effective_date: string | null
          salary_payment_method: string
          updated_at: string
          updated_by: number | null
          wps_applicable: boolean
          wps_status: string
        }
        Insert: {
          account_holder_name?: string | null
          account_number?: string | null
          bank_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id: number
          exchange_house?: string | null
          iban?: string | null
          id?: never
          labour_card_number?: string | null
          mohre_establishment_id?: number | null
          mohre_person_code?: string | null
          salary_effective_date?: string | null
          salary_payment_method?: string
          updated_at?: string
          updated_by?: number | null
          wps_applicable?: boolean
          wps_status?: string
        }
        Update: {
          account_holder_name?: string | null
          account_number?: string | null
          bank_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          employee_id?: number
          exchange_house?: string | null
          iban?: string | null
          id?: never
          labour_card_number?: string | null
          mohre_establishment_id?: number | null
          mohre_person_code?: string | null
          salary_effective_date?: string | null
          salary_payment_method?: string
          updated_at?: string
          updated_by?: number | null
          wps_applicable?: boolean
          wps_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_wps_profiles_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_wps_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_wps_profiles_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_wps_profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_wps_profiles_mohre_establishment_id_fkey"
            columns: ["mohre_establishment_id"]
            isOneToOne: false
            referencedRelation: "hr_mohre_establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_wps_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          actual_joining_date: string | null
          blood_group: string | null
          branch_id: number | null
          contract_end_date: string | null
          contract_start_date: string | null
          contract_type: string | null
          created_at: string
          created_by: number | null
          date_of_birth: string
          deleted_at: string | null
          deleted_by: number | null
          department_id: number | null
          designation_id: number | null
          emergency_contact_mobile: string
          emergency_contact_name: string
          emergency_contact_relationship_type_id: number | null
          employee_category_id: number | null
          employee_code: string
          employee_status: string
          employment_type_id: number | null
          full_name_ar: string | null
          full_name_en: string
          gender: string
          home_country_address: string | null
          id: number
          inactive_date: string | null
          inactive_reason: string | null
          joining_date: string
          known_name: string | null
          marital_status: string | null
          mobile_number: string
          mohre_establishment_id: number | null
          nationality_id: number | null
          notice_period_days: number | null
          owner_company_id: number
          personal_email: string | null
          photo_dms_document_id: number | null
          primary_work_site_id: number | null
          probation_end_date: string | null
          probation_start_date: string | null
          reporting_manager_id: number | null
          sponsor_company_id: number | null
          supervisor_id: number | null
          uae_address: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          actual_joining_date?: string | null
          blood_group?: string | null
          branch_id?: number | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          contract_type?: string | null
          created_at?: string
          created_by?: number | null
          date_of_birth: string
          deleted_at?: string | null
          deleted_by?: number | null
          department_id?: number | null
          designation_id?: number | null
          emergency_contact_mobile: string
          emergency_contact_name: string
          emergency_contact_relationship_type_id?: number | null
          employee_category_id?: number | null
          employee_code: string
          employee_status?: string
          employment_type_id?: number | null
          full_name_ar?: string | null
          full_name_en: string
          gender: string
          home_country_address?: string | null
          id?: never
          inactive_date?: string | null
          inactive_reason?: string | null
          joining_date: string
          known_name?: string | null
          marital_status?: string | null
          mobile_number: string
          mohre_establishment_id?: number | null
          nationality_id?: number | null
          notice_period_days?: number | null
          owner_company_id: number
          personal_email?: string | null
          photo_dms_document_id?: number | null
          primary_work_site_id?: number | null
          probation_end_date?: string | null
          probation_start_date?: string | null
          reporting_manager_id?: number | null
          sponsor_company_id?: number | null
          supervisor_id?: number | null
          uae_address?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          actual_joining_date?: string | null
          blood_group?: string | null
          branch_id?: number | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          contract_type?: string | null
          created_at?: string
          created_by?: number | null
          date_of_birth?: string
          deleted_at?: string | null
          deleted_by?: number | null
          department_id?: number | null
          designation_id?: number | null
          emergency_contact_mobile?: string
          emergency_contact_name?: string
          emergency_contact_relationship_type_id?: number | null
          employee_category_id?: number | null
          employee_code?: string
          employee_status?: string
          employment_type_id?: number | null
          full_name_ar?: string | null
          full_name_en?: string
          gender?: string
          home_country_address?: string | null
          id?: never
          inactive_date?: string | null
          inactive_reason?: string | null
          joining_date?: string
          known_name?: string | null
          marital_status?: string | null
          mobile_number?: string
          mohre_establishment_id?: number | null
          nationality_id?: number | null
          notice_period_days?: number | null
          owner_company_id?: number
          personal_email?: string | null
          photo_dms_document_id?: number | null
          primary_work_site_id?: number | null
          probation_end_date?: string | null
          probation_start_date?: string | null
          reporting_manager_id?: number | null
          sponsor_company_id?: number | null
          supervisor_id?: number | null
          uae_address?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_designation_id_fkey"
            columns: ["designation_id"]
            isOneToOne: false
            referencedRelation: "designations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_emergency_contact_relationship_type_id_fkey"
            columns: ["emergency_contact_relationship_type_id"]
            isOneToOne: false
            referencedRelation: "hr_relationship_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_employee_category_id_fkey"
            columns: ["employee_category_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_employment_type_id_fkey"
            columns: ["employment_type_id"]
            isOneToOne: false
            referencedRelation: "hr_employment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_mohre_establishment_id_fkey"
            columns: ["mohre_establishment_id"]
            isOneToOne: false
            referencedRelation: "hr_mohre_establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_nationality_id_fkey"
            columns: ["nationality_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_photo_dms_document_id_fkey"
            columns: ["photo_dms_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_primary_work_site_id_fkey"
            columns: ["primary_work_site_id"]
            isOneToOne: false
            referencedRelation: "work_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_sponsor_company_id_fkey"
            columns: ["sponsor_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_sponsor_company_id_fkey"
            columns: ["sponsor_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ai_assistant_action_drafts: {
        Row: {
          action_code: string
          created_at: string
          deleted_at: string | null
          draft_payload_json: Json
          id: number
          reviewed_at: string | null
          reviewed_by: number | null
          safety_class: string
          session_id: number
          status: string
          target_entity_id: number | null
          target_entity_type: string | null
        }
        Insert: {
          action_code: string
          created_at?: string
          deleted_at?: string | null
          draft_payload_json?: Json
          id?: never
          reviewed_at?: string | null
          reviewed_by?: number | null
          safety_class: string
          session_id: number
          status?: string
          target_entity_id?: number | null
          target_entity_type?: string | null
        }
        Update: {
          action_code?: string
          created_at?: string
          deleted_at?: string | null
          draft_payload_json?: Json
          id?: never
          reviewed_at?: string | null
          reviewed_by?: number | null
          safety_class?: string
          session_id?: number
          status?: string
          target_entity_id?: number | null
          target_entity_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_ai_assistant_action_drafts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_assistant_action_drafts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "erp_ai_assistant_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ai_assistant_messages: {
        Row: {
          created_at: string
          id: number
          message_text: string
          output_type: string | null
          role: string
          safe_metadata_json: Json
          session_id: number
        }
        Insert: {
          created_at?: string
          id?: never
          message_text: string
          output_type?: string | null
          role: string
          safe_metadata_json?: Json
          session_id: number
        }
        Update: {
          created_at?: string
          id?: never
          message_text?: string
          output_type?: string | null
          role?: string
          safe_metadata_json?: Json
          session_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_ai_assistant_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "erp_ai_assistant_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ai_assistant_sessions: {
        Row: {
          context_entity_id: number | null
          context_entity_type: string | null
          created_at: string
          deleted_at: string | null
          id: number
          message_count: number
          owner_user_profile_id: number
          session_code: string
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          context_entity_id?: number | null
          context_entity_type?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: never
          message_count?: number
          owner_user_profile_id: number
          session_code: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          context_entity_id?: number | null
          context_entity_type?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: never
          message_count?: number
          owner_user_profile_id?: number
          session_code?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_ai_assistant_sessions_owner_user_profile_id_fkey"
            columns: ["owner_user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ai_audit_explanations: {
        Row: {
          created_at: string
          created_by: number | null
          deleted_at: string | null
          entity_id: number | null
          entity_type: string | null
          explanation_text: string
          id: number
          model_name: string | null
          prompt_version: string | null
          scope: string
          scope_end: string | null
          scope_start: string | null
          source_id: number | null
          source_type: string
          summary_json: Json
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          entity_id?: number | null
          entity_type?: string | null
          explanation_text: string
          id?: never
          model_name?: string | null
          prompt_version?: string | null
          scope: string
          scope_end?: string | null
          scope_start?: string | null
          source_id?: number | null
          source_type: string
          summary_json?: Json
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          entity_id?: number | null
          entity_type?: string | null
          explanation_text?: string
          id?: never
          model_name?: string | null
          prompt_version?: string | null
          scope?: string
          scope_end?: string | null
          scope_start?: string | null
          source_id?: number | null
          source_type?: string
          summary_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "erp_ai_audit_explanations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ai_compliance_finding_events: {
        Row: {
          actor_user_id: number | null
          created_at: string
          event_data_json: Json | null
          event_type: string
          finding_id: number
          id: number
        }
        Insert: {
          actor_user_id?: number | null
          created_at?: string
          event_data_json?: Json | null
          event_type: string
          finding_id: number
          id?: never
        }
        Update: {
          actor_user_id?: number | null
          created_at?: string
          event_data_json?: Json | null
          event_type?: string
          finding_id?: number
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "erp_ai_compliance_finding_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_compliance_finding_events_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "erp_ai_compliance_findings"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ai_compliance_findings: {
        Row: {
          actual_value: string | null
          ai_reason: string | null
          confidence_score: number
          created_at: string
          created_by: number | null
          deleted_at: string | null
          detection_method: string
          document_id: number | null
          entity_id: number
          entity_type: string
          evidence_json: Json | null
          expected_value: string | null
          field_code: string | null
          finding_key: string
          finding_type: string
          id: number
          recommended_action: string | null
          resolved_at: string | null
          resolved_by: number | null
          review_decision: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: number | null
          severity: string
          source_duplicate_candidate_id: number | null
          source_field_suggestion_id: number | null
          source_rule_id: number | null
          status: string
          updated_at: string
          updated_by: number | null
          waived_at: string | null
          waived_by: number | null
          waiver_reason: string | null
        }
        Insert: {
          actual_value?: string | null
          ai_reason?: string | null
          confidence_score?: number
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          detection_method?: string
          document_id?: number | null
          entity_id: number
          entity_type: string
          evidence_json?: Json | null
          expected_value?: string | null
          field_code?: string | null
          finding_key: string
          finding_type: string
          id?: never
          recommended_action?: string | null
          resolved_at?: string | null
          resolved_by?: number | null
          review_decision?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: number | null
          severity?: string
          source_duplicate_candidate_id?: number | null
          source_field_suggestion_id?: number | null
          source_rule_id?: number | null
          status?: string
          updated_at?: string
          updated_by?: number | null
          waived_at?: string | null
          waived_by?: number | null
          waiver_reason?: string | null
        }
        Update: {
          actual_value?: string | null
          ai_reason?: string | null
          confidence_score?: number
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          detection_method?: string
          document_id?: number | null
          entity_id?: number
          entity_type?: string
          evidence_json?: Json | null
          expected_value?: string | null
          field_code?: string | null
          finding_key?: string
          finding_type?: string
          id?: never
          recommended_action?: string | null
          resolved_at?: string | null
          resolved_by?: number | null
          review_decision?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: number | null
          severity?: string
          source_duplicate_candidate_id?: number | null
          source_field_suggestion_id?: number | null
          source_rule_id?: number | null
          status?: string
          updated_at?: string
          updated_by?: number | null
          waived_at?: string | null
          waived_by?: number | null
          waiver_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_ai_compliance_findings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_compliance_findings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_compliance_findings_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_compliance_findings_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_compliance_findings_source_duplicate_candidate_id_fkey"
            columns: ["source_duplicate_candidate_id"]
            isOneToOne: false
            referencedRelation: "erp_ai_duplicate_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_compliance_findings_source_field_suggestion_id_fkey"
            columns: ["source_field_suggestion_id"]
            isOneToOne: false
            referencedRelation: "erp_ai_field_suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_compliance_findings_source_rule_id_fkey"
            columns: ["source_rule_id"]
            isOneToOne: false
            referencedRelation: "dms_required_document_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_compliance_findings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_compliance_findings_waived_by_fkey"
            columns: ["waived_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ai_data_quality_finding_events: {
        Row: {
          created_at: string
          created_by: number | null
          event_note: string | null
          event_type: string
          finding_id: number | null
          id: number
          safe_metadata_json: Json
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          event_note?: string | null
          event_type: string
          finding_id?: number | null
          id?: never
          safe_metadata_json?: Json
        }
        Update: {
          created_at?: string
          created_by?: number | null
          event_note?: string | null
          event_type?: string
          finding_id?: number | null
          id?: never
          safe_metadata_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "erp_ai_data_quality_finding_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_data_quality_finding_events_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "erp_ai_data_quality_findings"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ai_data_quality_findings: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string
          detected_at: string
          entity_id: number | null
          entity_type: string
          finding_key: string
          id: number
          last_seen_at: string
          recommendation: string | null
          resolved_at: string | null
          resolved_by: number | null
          reviewed_at: string | null
          reviewed_by: number | null
          rule_category: string
          rule_code: string
          safe_evidence_json: Json
          severity: string
          source_field: string | null
          source_table: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description: string
          detected_at?: string
          entity_id?: number | null
          entity_type: string
          finding_key: string
          id?: never
          last_seen_at?: string
          recommendation?: string | null
          resolved_at?: string | null
          resolved_by?: number | null
          reviewed_at?: string | null
          reviewed_by?: number | null
          rule_category: string
          rule_code: string
          safe_evidence_json?: Json
          severity: string
          source_field?: string | null
          source_table?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string
          detected_at?: string
          entity_id?: number | null
          entity_type?: string
          finding_key?: string
          id?: never
          last_seen_at?: string
          recommendation?: string | null
          resolved_at?: string | null
          resolved_by?: number | null
          reviewed_at?: string | null
          reviewed_by?: number | null
          rule_category?: string
          rule_code?: string
          safe_evidence_json?: Json
          severity?: string
          source_field?: string | null
          source_table?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_ai_data_quality_findings_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_data_quality_findings_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ai_duplicate_candidate_events: {
        Row: {
          actor_user_id: number | null
          candidate_id: number
          created_at: string
          event_data_json: Json | null
          event_type: string
          id: number
        }
        Insert: {
          actor_user_id?: number | null
          candidate_id: number
          created_at?: string
          event_data_json?: Json | null
          event_type: string
          id?: never
        }
        Update: {
          actor_user_id?: number | null
          candidate_id?: number
          created_at?: string
          event_data_json?: Json | null
          event_type?: string
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "erp_ai_duplicate_candidate_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_duplicate_candidate_events_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "erp_ai_duplicate_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ai_duplicate_candidates: {
        Row: {
          ai_reason: string | null
          candidate_key: string
          candidate_type: string
          confidence_score: number
          conflict_field: string | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          detection_method: string
          entity_id_a: number
          entity_id_b: number | null
          entity_type_a: string
          entity_type_b: string | null
          evidence_json: Json | null
          id: number
          resolved_at: string | null
          resolved_by: number | null
          review_decision: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: number | null
          source_document_id: number | null
          status: string
          updated_at: string
          updated_by: number | null
          value_a: string | null
          value_b: string | null
        }
        Insert: {
          ai_reason?: string | null
          candidate_key: string
          candidate_type: string
          confidence_score?: number
          conflict_field?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          detection_method?: string
          entity_id_a: number
          entity_id_b?: number | null
          entity_type_a: string
          entity_type_b?: string | null
          evidence_json?: Json | null
          id?: never
          resolved_at?: string | null
          resolved_by?: number | null
          review_decision?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: number | null
          source_document_id?: number | null
          status?: string
          updated_at?: string
          updated_by?: number | null
          value_a?: string | null
          value_b?: string | null
        }
        Update: {
          ai_reason?: string | null
          candidate_key?: string
          candidate_type?: string
          confidence_score?: number
          conflict_field?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          detection_method?: string
          entity_id_a?: number
          entity_id_b?: number | null
          entity_type_a?: string
          entity_type_b?: string | null
          evidence_json?: Json | null
          id?: never
          resolved_at?: string | null
          resolved_by?: number | null
          review_decision?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: number | null
          source_document_id?: number | null
          status?: string
          updated_at?: string
          updated_by?: number | null
          value_a?: string | null
          value_b?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_ai_duplicate_candidates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_duplicate_candidates_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_duplicate_candidates_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_duplicate_candidates_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_duplicate_candidates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ai_feature_flags: {
        Row: {
          created_at: string
          description: string | null
          feature_code: string
          feature_name: string
          id: number
          is_enabled: boolean
          min_confidence_threshold: number
          notes: string | null
          requires_human_review: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          feature_code: string
          feature_name: string
          id?: never
          is_enabled?: boolean
          min_confidence_threshold?: number
          notes?: string | null
          requires_human_review?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          feature_code?: string
          feature_name?: string
          id?: never
          is_enabled?: boolean
          min_confidence_threshold?: number
          notes?: string | null
          requires_human_review?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      erp_ai_field_suggestion_events: {
        Row: {
          actor_user_id: number | null
          created_at: string
          event_data_json: Json | null
          event_type: string
          id: number
          suggestion_id: number
        }
        Insert: {
          actor_user_id?: number | null
          created_at?: string
          event_data_json?: Json | null
          event_type: string
          id?: never
          suggestion_id: number
        }
        Update: {
          actor_user_id?: number | null
          created_at?: string
          event_data_json?: Json | null
          event_type?: string
          id?: never
          suggestion_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_ai_field_suggestion_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_field_suggestion_events_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "erp_ai_field_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ai_field_suggestions: {
        Row: {
          accepted_at: string | null
          accepted_by: number | null
          ai_reason: string | null
          applied_at: string | null
          applied_by: number | null
          apply_error: string | null
          confidence_score: number | null
          created_at: string
          created_by: number | null
          current_value: string | null
          deleted_at: string | null
          entity_id: number
          entity_type: string
          field_label: string
          field_type: string
          generation_batch_id: number | null
          id: number
          prompt_version: string | null
          rejected_at: string | null
          rejected_by: number | null
          source_document_id: number | null
          source_document_type: string | null
          source_excerpt: string | null
          source_file_id: number | null
          status: string
          suggested_value: string | null
          suggested_value_json: Json | null
          suggestion_type: string
          target_field: string
          target_table: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: number | null
          ai_reason?: string | null
          applied_at?: string | null
          applied_by?: number | null
          apply_error?: string | null
          confidence_score?: number | null
          created_at?: string
          created_by?: number | null
          current_value?: string | null
          deleted_at?: string | null
          entity_id: number
          entity_type: string
          field_label: string
          field_type: string
          generation_batch_id?: number | null
          id?: never
          prompt_version?: string | null
          rejected_at?: string | null
          rejected_by?: number | null
          source_document_id?: number | null
          source_document_type?: string | null
          source_excerpt?: string | null
          source_file_id?: number | null
          status?: string
          suggested_value?: string | null
          suggested_value_json?: Json | null
          suggestion_type: string
          target_field: string
          target_table: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: number | null
          ai_reason?: string | null
          applied_at?: string | null
          applied_by?: number | null
          apply_error?: string | null
          confidence_score?: number | null
          created_at?: string
          created_by?: number | null
          current_value?: string | null
          deleted_at?: string | null
          entity_id?: number
          entity_type?: string
          field_label?: string
          field_type?: string
          generation_batch_id?: number | null
          id?: never
          prompt_version?: string | null
          rejected_at?: string | null
          rejected_by?: number | null
          source_document_id?: number | null
          source_document_type?: string | null
          source_excerpt?: string | null
          source_file_id?: number | null
          status?: string
          suggested_value?: string | null
          suggested_value_json?: Json | null
          suggestion_type?: string
          target_field?: string
          target_table?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_ai_field_suggestions_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_field_suggestions_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_field_suggestions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_field_suggestions_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_field_suggestions_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_field_suggestions_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "dms_document_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_field_suggestions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ai_model_cost_rates: {
        Row: {
          created_at: string
          created_by: number | null
          currency_code: string
          display_name: string | null
          effective_from: string
          effective_to: string | null
          id: number
          input_cost_per_1m_tokens: number | null
          is_active: boolean
          model_id: string
          output_cost_per_1m_tokens: number | null
          provider_type: string
          rate_type: string
          requires_confirmation: boolean
          source_note: string | null
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          currency_code?: string
          display_name?: string | null
          effective_from: string
          effective_to?: string | null
          id?: never
          input_cost_per_1m_tokens?: number | null
          is_active?: boolean
          model_id: string
          output_cost_per_1m_tokens?: number | null
          provider_type: string
          rate_type?: string
          requires_confirmation?: boolean
          source_note?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: number | null
          currency_code?: string
          display_name?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: never
          input_cost_per_1m_tokens?: number | null
          is_active?: boolean
          model_id?: string
          output_cost_per_1m_tokens?: number | null
          provider_type?: string
          rate_type?: string
          requires_confirmation?: boolean
          source_note?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_ai_model_cost_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ai_provider_configs: {
        Row: {
          api_endpoint: string | null
          api_version: string | null
          confidence_threshold: number
          config_code: string
          config_json: Json | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          id: number
          is_active: boolean
          is_default: boolean
          is_enabled: boolean
          last_test_at: string | null
          last_test_message: string | null
          last_test_status: string | null
          masked_secret_preview: string | null
          model_id: string | null
          notes: string | null
          provider_name: string
          provider_type: string
          purpose: string
          requires_human_review: boolean
          secret_ref: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          api_endpoint?: string | null
          api_version?: string | null
          confidence_threshold?: number
          config_code: string
          config_json?: Json | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          id?: never
          is_active?: boolean
          is_default?: boolean
          is_enabled?: boolean
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_status?: string | null
          masked_secret_preview?: string | null
          model_id?: string | null
          notes?: string | null
          provider_name: string
          provider_type: string
          purpose?: string
          requires_human_review?: boolean
          secret_ref?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          api_endpoint?: string | null
          api_version?: string | null
          confidence_threshold?: number
          config_code?: string
          config_json?: Json | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          id?: never
          is_active?: boolean
          is_default?: boolean
          is_enabled?: boolean
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_status?: string | null
          masked_secret_preview?: string | null
          model_id?: string | null
          notes?: string | null
          provider_name?: string
          provider_type?: string
          purpose?: string
          requires_human_review?: boolean
          secret_ref?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_ai_provider_configs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_provider_configs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ai_recent_searches: {
        Row: {
          created_at: string
          deleted_at: string | null
          entity_types: Json
          id: number
          result_count: number
          search_mode: string
          search_text: string
          user_id: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          entity_types?: Json
          id?: never
          result_count?: number
          search_mode?: string
          search_text: string
          user_id: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          entity_types?: Json
          id?: never
          result_count?: number
          search_mode?: string
          search_text?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_ai_recent_searches_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ai_risk_score_events: {
        Row: {
          actor_id: number | null
          created_at: string
          event_payload_json: Json
          event_type: string
          id: number
          new_risk_level: string | null
          new_risk_score: number | null
          notes: string | null
          prior_risk_level: string | null
          prior_risk_score: number | null
          risk_score_id: number
        }
        Insert: {
          actor_id?: number | null
          created_at?: string
          event_payload_json?: Json
          event_type: string
          id?: never
          new_risk_level?: string | null
          new_risk_score?: number | null
          notes?: string | null
          prior_risk_level?: string | null
          prior_risk_score?: number | null
          risk_score_id: number
        }
        Update: {
          actor_id?: number | null
          created_at?: string
          event_payload_json?: Json
          event_type?: string
          id?: never
          new_risk_level?: string | null
          new_risk_score?: number | null
          notes?: string | null
          prior_risk_level?: string | null
          prior_risk_score?: number | null
          risk_score_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_ai_risk_score_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_risk_score_events_risk_score_id_fkey"
            columns: ["risk_score_id"]
            isOneToOne: false
            referencedRelation: "erp_ai_risk_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ai_risk_scores: {
        Row: {
          calculated_at: string
          calculated_by: number | null
          calculation_method: string
          created_at: string
          created_by: number | null
          deleted_at: string | null
          entity_id: number
          entity_type: string
          id: number
          review_decision: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: number | null
          risk_breakdown_json: Json
          risk_confidence: number
          risk_level: string
          risk_reasons_json: Json
          risk_score: number
          source_counts_json: Json
          stale_at: string | null
          stale_reason: string | null
          status: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          calculated_at?: string
          calculated_by?: number | null
          calculation_method?: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          entity_id: number
          entity_type: string
          id?: never
          review_decision?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: number | null
          risk_breakdown_json?: Json
          risk_confidence?: number
          risk_level: string
          risk_reasons_json?: Json
          risk_score: number
          source_counts_json?: Json
          stale_at?: string | null
          stale_reason?: string | null
          status?: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          calculated_at?: string
          calculated_by?: number | null
          calculation_method?: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          entity_id?: number
          entity_type?: string
          id?: never
          review_decision?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: number | null
          risk_breakdown_json?: Json
          risk_confidence?: number
          risk_level?: string
          risk_reasons_json?: Json
          risk_score?: number
          source_counts_json?: Json
          stale_at?: string | null
          stale_reason?: string | null
          status?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_ai_risk_scores_calculated_by_fkey"
            columns: ["calculated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_risk_scores_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_risk_scores_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_risk_scores_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_ai_usage_logs: {
        Row: {
          ai_job_id: number | null
          created_at: string
          created_by: number | null
          document_id: number | null
          duration_ms: number | null
          error_message: string | null
          estimated_cost: number | null
          feature_area: string
          id: number
          input_token_count: number | null
          metadata_json: Json | null
          model_id: string | null
          operation_type: string
          output_token_count: number | null
          provider_config_id: number | null
          status: string
          upload_session_id: number | null
        }
        Insert: {
          ai_job_id?: number | null
          created_at?: string
          created_by?: number | null
          document_id?: number | null
          duration_ms?: number | null
          error_message?: string | null
          estimated_cost?: number | null
          feature_area: string
          id?: never
          input_token_count?: number | null
          metadata_json?: Json | null
          model_id?: string | null
          operation_type: string
          output_token_count?: number | null
          provider_config_id?: number | null
          status: string
          upload_session_id?: number | null
        }
        Update: {
          ai_job_id?: number | null
          created_at?: string
          created_by?: number | null
          document_id?: number | null
          duration_ms?: number | null
          error_message?: string | null
          estimated_cost?: number | null
          feature_area?: string
          id?: never
          input_token_count?: number | null
          metadata_json?: Json | null
          model_id?: string | null
          operation_type?: string
          output_token_count?: number | null
          provider_config_id?: number | null
          status?: string
          upload_session_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_ai_usage_logs_ai_job_id_fkey"
            columns: ["ai_job_id"]
            isOneToOne: false
            referencedRelation: "dms_ai_job_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_usage_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_usage_logs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_usage_logs_provider_config_id_fkey"
            columns: ["provider_config_id"]
            isOneToOne: false
            referencedRelation: "erp_ai_provider_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_ai_usage_logs_upload_session_id_fkey"
            columns: ["upload_session_id"]
            isOneToOne: false
            referencedRelation: "dms_upload_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_app_branding_settings: {
        Row: {
          app_name: string
          app_short_name: string | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          footer_text: string | null
          id: number
          is_active: boolean
          login_subtitle: string | null
          login_title: string | null
          settings_code: string
          support_email: string | null
          support_phone: string | null
          tagline: string | null
          theme_accent_color: string | null
          theme_primary_color: string | null
          theme_secondary_color: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          app_name?: string
          app_short_name?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          footer_text?: string | null
          id?: never
          is_active?: boolean
          login_subtitle?: string | null
          login_title?: string | null
          settings_code: string
          support_email?: string | null
          support_phone?: string | null
          tagline?: string | null
          theme_accent_color?: string | null
          theme_primary_color?: string | null
          theme_secondary_color?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          app_name?: string
          app_short_name?: string | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          footer_text?: string | null
          id?: never
          is_active?: boolean
          login_subtitle?: string | null
          login_title?: string | null
          settings_code?: string
          support_email?: string | null
          support_phone?: string | null
          tagline?: string | null
          theme_accent_color?: string | null
          theme_primary_color?: string | null
          theme_secondary_color?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_app_branding_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_app_branding_settings_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_app_branding_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_branding_assets: {
        Row: {
          app_settings_id: number | null
          asset_scope: string
          asset_type: string
          branding_profile_id: number | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          file_size_bytes: number | null
          height_px: number | null
          id: number
          is_active: boolean
          mime_type: string
          original_filename: string | null
          owner_company_id: number | null
          replaced_by_asset_id: number | null
          storage_bucket: string
          storage_path: string
          updated_at: string
          updated_by: number | null
          version_no: number
          width_px: number | null
        }
        Insert: {
          app_settings_id?: number | null
          asset_scope: string
          asset_type: string
          branding_profile_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          file_size_bytes?: number | null
          height_px?: number | null
          id?: never
          is_active?: boolean
          mime_type: string
          original_filename?: string | null
          owner_company_id?: number | null
          replaced_by_asset_id?: number | null
          storage_bucket?: string
          storage_path: string
          updated_at?: string
          updated_by?: number | null
          version_no?: number
          width_px?: number | null
        }
        Update: {
          app_settings_id?: number | null
          asset_scope?: string
          asset_type?: string
          branding_profile_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          file_size_bytes?: number | null
          height_px?: number | null
          id?: never
          is_active?: boolean
          mime_type?: string
          original_filename?: string | null
          owner_company_id?: number | null
          replaced_by_asset_id?: number | null
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          updated_by?: number | null
          version_no?: number
          width_px?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_branding_assets_app_settings_id_fkey"
            columns: ["app_settings_id"]
            isOneToOne: false
            referencedRelation: "erp_app_branding_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_branding_assets_branding_profile_id_fkey"
            columns: ["branding_profile_id"]
            isOneToOne: false
            referencedRelation: "erp_report_branding_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_branding_assets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_branding_assets_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_branding_assets_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_branding_assets_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_branding_assets_replaced_by_asset_id_fkey"
            columns: ["replaced_by_asset_id"]
            isOneToOne: false
            referencedRelation: "erp_branding_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_branding_assets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_email_feature_flags: {
        Row: {
          created_at: string
          feature_code: string
          feature_name: string
          id: number
          is_enabled: boolean
          notes: string | null
          requires_approval: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          feature_code: string
          feature_name: string
          id?: never
          is_enabled?: boolean
          notes?: string | null
          requires_approval?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          feature_code?: string
          feature_name?: string
          id?: never
          is_enabled?: boolean
          notes?: string | null
          requires_approval?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      erp_email_provider_configs: {
        Row: {
          auth_mode: string
          authority_url: string | null
          client_id: string | null
          config_json: Json | null
          created_at: string
          created_by: number | null
          daily_send_limit: number | null
          default_recipient_for_tests: string | null
          deleted_at: string | null
          graph_base_url: string | null
          id: number
          is_active: boolean
          is_default: boolean
          is_enabled: boolean
          last_test_at: string | null
          last_test_message: string | null
          last_test_status: string | null
          masked_secret_preview: string | null
          notes: string | null
          provider_code: string
          provider_name: string
          provider_type: string
          reply_to_email: string | null
          secret_ref: string | null
          send_mode: string
          sender_display_name: string | null
          sender_email: string | null
          tenant_id: string | null
          throttle_per_minute: number | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          auth_mode?: string
          authority_url?: string | null
          client_id?: string | null
          config_json?: Json | null
          created_at?: string
          created_by?: number | null
          daily_send_limit?: number | null
          default_recipient_for_tests?: string | null
          deleted_at?: string | null
          graph_base_url?: string | null
          id?: never
          is_active?: boolean
          is_default?: boolean
          is_enabled?: boolean
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_status?: string | null
          masked_secret_preview?: string | null
          notes?: string | null
          provider_code: string
          provider_name: string
          provider_type: string
          reply_to_email?: string | null
          secret_ref?: string | null
          send_mode?: string
          sender_display_name?: string | null
          sender_email?: string | null
          tenant_id?: string | null
          throttle_per_minute?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          auth_mode?: string
          authority_url?: string | null
          client_id?: string | null
          config_json?: Json | null
          created_at?: string
          created_by?: number | null
          daily_send_limit?: number | null
          default_recipient_for_tests?: string | null
          deleted_at?: string | null
          graph_base_url?: string | null
          id?: never
          is_active?: boolean
          is_default?: boolean
          is_enabled?: boolean
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_status?: string | null
          masked_secret_preview?: string | null
          notes?: string | null
          provider_code?: string
          provider_name?: string
          provider_type?: string
          reply_to_email?: string | null
          secret_ref?: string | null
          send_mode?: string
          sender_display_name?: string | null
          sender_email?: string | null
          tenant_id?: string | null
          throttle_per_minute?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_email_provider_configs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_email_provider_configs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_email_queue: {
        Row: {
          attempt_count: number
          bcc_emails: string[] | null
          cancelled_at: string | null
          cc_emails: string[] | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          external_message_id: string | null
          from_email: string | null
          html_body: string | null
          id: number
          last_error: string | null
          max_attempts: number
          next_retry_at: string | null
          notification_id: number | null
          priority: string
          processing_started_at: string | null
          provider_config_id: number | null
          queue_code: string | null
          reply_to_email: string | null
          scheduled_for: string
          sent_at: string | null
          source_entity_id: number | null
          source_entity_type: string | null
          source_module: string
          status: string
          subject: string
          template_code: string | null
          template_variables_json: Json | null
          text_body: string | null
          to_emails: string[]
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          bcc_emails?: string[] | null
          cancelled_at?: string | null
          cc_emails?: string[] | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          external_message_id?: string | null
          from_email?: string | null
          html_body?: string | null
          id?: never
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          notification_id?: number | null
          priority?: string
          processing_started_at?: string | null
          provider_config_id?: number | null
          queue_code?: string | null
          reply_to_email?: string | null
          scheduled_for?: string
          sent_at?: string | null
          source_entity_id?: number | null
          source_entity_type?: string | null
          source_module: string
          status?: string
          subject: string
          template_code?: string | null
          template_variables_json?: Json | null
          text_body?: string | null
          to_emails: string[]
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          bcc_emails?: string[] | null
          cancelled_at?: string | null
          cc_emails?: string[] | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          external_message_id?: string | null
          from_email?: string | null
          html_body?: string | null
          id?: never
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          notification_id?: number | null
          priority?: string
          processing_started_at?: string | null
          provider_config_id?: number | null
          queue_code?: string | null
          reply_to_email?: string | null
          scheduled_for?: string
          sent_at?: string | null
          source_entity_id?: number | null
          source_entity_type?: string | null
          source_module?: string
          status?: string
          subject?: string
          template_code?: string | null
          template_variables_json?: Json | null
          text_body?: string | null
          to_emails?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_email_queue_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_email_queue_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "erp_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_email_queue_provider_config_id_fkey"
            columns: ["provider_config_id"]
            isOneToOne: false
            referencedRelation: "erp_email_provider_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_email_send_logs: {
        Row: {
          attempt_count: number
          bcc_emails: string[] | null
          cc_emails: string[] | null
          created_at: string
          created_by: number | null
          duration_ms: number | null
          external_message_id: string | null
          feature_area: string
          from_email: string | null
          id: number
          last_error: string | null
          message_preview: string | null
          metadata_json: Json | null
          operation_type: string
          provider_config_id: number | null
          status: string
          subject: string | null
          to_emails: string[] | null
        }
        Insert: {
          attempt_count?: number
          bcc_emails?: string[] | null
          cc_emails?: string[] | null
          created_at?: string
          created_by?: number | null
          duration_ms?: number | null
          external_message_id?: string | null
          feature_area: string
          from_email?: string | null
          id?: never
          last_error?: string | null
          message_preview?: string | null
          metadata_json?: Json | null
          operation_type: string
          provider_config_id?: number | null
          status: string
          subject?: string | null
          to_emails?: string[] | null
        }
        Update: {
          attempt_count?: number
          bcc_emails?: string[] | null
          cc_emails?: string[] | null
          created_at?: string
          created_by?: number | null
          duration_ms?: number | null
          external_message_id?: string | null
          feature_area?: string
          from_email?: string | null
          id?: never
          last_error?: string | null
          message_preview?: string | null
          metadata_json?: Json | null
          operation_type?: string
          provider_config_id?: number | null
          status?: string
          subject?: string | null
          to_emails?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_email_send_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_email_send_logs_provider_config_id_fkey"
            columns: ["provider_config_id"]
            isOneToOne: false
            referencedRelation: "erp_email_provider_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_notification_delivery_logs: {
        Row: {
          attempt_number: number | null
          created_at: string
          created_by: number | null
          delivery_channel: string
          duration_ms: number | null
          email_queue_id: number | null
          error_message: string | null
          external_message_id: string | null
          id: number
          message: string | null
          metadata_json: Json | null
          notification_id: number | null
          provider_config_id: number | null
          status: string
        }
        Insert: {
          attempt_number?: number | null
          created_at?: string
          created_by?: number | null
          delivery_channel: string
          duration_ms?: number | null
          email_queue_id?: number | null
          error_message?: string | null
          external_message_id?: string | null
          id?: never
          message?: string | null
          metadata_json?: Json | null
          notification_id?: number | null
          provider_config_id?: number | null
          status: string
        }
        Update: {
          attempt_number?: number | null
          created_at?: string
          created_by?: number | null
          delivery_channel?: string
          duration_ms?: number | null
          email_queue_id?: number | null
          error_message?: string | null
          external_message_id?: string | null
          id?: never
          message?: string | null
          metadata_json?: Json | null
          notification_id?: number | null
          provider_config_id?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_notification_delivery_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_notification_delivery_logs_email_queue_id_fkey"
            columns: ["email_queue_id"]
            isOneToOne: false
            referencedRelation: "erp_email_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_notification_delivery_logs_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "erp_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_notification_delivery_logs_provider_config_id_fkey"
            columns: ["provider_config_id"]
            isOneToOne: false
            referencedRelation: "erp_email_provider_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_notification_templates: {
        Row: {
          created_at: string
          created_by: number | null
          default_channel_email: boolean
          default_channel_in_app: boolean
          default_severity: string
          deleted_at: string | null
          html_template: string | null
          id: number
          is_active: boolean
          is_system: boolean
          notification_type: string
          source_module: string
          subject_template: string
          template_code: string
          template_name: string
          text_template: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          default_channel_email?: boolean
          default_channel_in_app?: boolean
          default_severity?: string
          deleted_at?: string | null
          html_template?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          notification_type: string
          source_module: string
          subject_template: string
          template_code: string
          template_name: string
          text_template: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          default_channel_email?: boolean
          default_channel_in_app?: boolean
          default_severity?: string
          deleted_at?: string | null
          html_template?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          notification_type?: string
          source_module?: string
          subject_template?: string
          template_code?: string
          template_name?: string
          text_template?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_notification_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_notification_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_notifications: {
        Row: {
          action_label: string | null
          action_url: string | null
          archived_at: string | null
          channel_email: boolean
          channel_in_app: boolean
          created_at: string
          created_by: number | null
          deleted_at: string | null
          dismissed_at: string | null
          id: number
          message: string
          metadata_json: Json | null
          notification_code: string | null
          notification_type: string
          read_at: string | null
          recipient_email: string | null
          recipient_role_code: string | null
          recipient_user_id: number | null
          scheduled_for: string
          severity: string
          source_entity_id: number | null
          source_entity_type: string | null
          source_module: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          action_label?: string | null
          action_url?: string | null
          archived_at?: string | null
          channel_email?: boolean
          channel_in_app?: boolean
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          dismissed_at?: string | null
          id?: never
          message: string
          metadata_json?: Json | null
          notification_code?: string | null
          notification_type: string
          read_at?: string | null
          recipient_email?: string | null
          recipient_role_code?: string | null
          recipient_user_id?: number | null
          scheduled_for?: string
          severity?: string
          source_entity_id?: number | null
          source_entity_type?: string | null
          source_module: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          action_label?: string | null
          action_url?: string | null
          archived_at?: string | null
          channel_email?: boolean
          channel_in_app?: boolean
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          dismissed_at?: string | null
          id?: never
          message?: string
          metadata_json?: Json | null
          notification_code?: string | null
          notification_type?: string
          read_at?: string | null
          recipient_email?: string | null
          recipient_role_code?: string | null
          recipient_user_id?: number | null
          scheduled_for?: string
          severity?: string
          source_entity_id?: number | null
          source_entity_type?: string | null
          source_module?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_output_public_links: {
        Row: {
          access_level: string
          branding_profile_id: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by_user_profile_id: number | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          document_date: string | null
          document_ref: string | null
          document_subtitle: string | null
          document_title: string
          download_enabled: boolean
          download_file_mime_type: string | null
          download_file_name: string | null
          download_file_path: string | null
          expires_at: string | null
          id: number
          issued_at: string
          issued_by_user_profile_id: number | null
          last_viewed_at: string | null
          output_type: string
          owner_company_id: number | null
          public_payload_json: Json
          public_token: string
          public_url_path: string
          report_run_id: number | null
          source_entity_id: number | null
          source_entity_type: string | null
          source_module: string
          source_record_ref: string | null
          status: string
          superseded_by_link_id: number | null
          template_id: number | null
          updated_at: string
          updated_by: number | null
          verification_summary_json: Json
          view_count: number
        }
        Insert: {
          access_level?: string
          branding_profile_id?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_user_profile_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          document_date?: string | null
          document_ref?: string | null
          document_subtitle?: string | null
          document_title: string
          download_enabled?: boolean
          download_file_mime_type?: string | null
          download_file_name?: string | null
          download_file_path?: string | null
          expires_at?: string | null
          id?: number
          issued_at?: string
          issued_by_user_profile_id?: number | null
          last_viewed_at?: string | null
          output_type: string
          owner_company_id?: number | null
          public_payload_json?: Json
          public_token: string
          public_url_path: string
          report_run_id?: number | null
          source_entity_id?: number | null
          source_entity_type?: string | null
          source_module: string
          source_record_ref?: string | null
          status?: string
          superseded_by_link_id?: number | null
          template_id?: number | null
          updated_at?: string
          updated_by?: number | null
          verification_summary_json?: Json
          view_count?: number
        }
        Update: {
          access_level?: string
          branding_profile_id?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_user_profile_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          document_date?: string | null
          document_ref?: string | null
          document_subtitle?: string | null
          document_title?: string
          download_enabled?: boolean
          download_file_mime_type?: string | null
          download_file_name?: string | null
          download_file_path?: string | null
          expires_at?: string | null
          id?: number
          issued_at?: string
          issued_by_user_profile_id?: number | null
          last_viewed_at?: string | null
          output_type?: string
          owner_company_id?: number | null
          public_payload_json?: Json
          public_token?: string
          public_url_path?: string
          report_run_id?: number | null
          source_entity_id?: number | null
          source_entity_type?: string | null
          source_module?: string
          source_record_ref?: string | null
          status?: string
          superseded_by_link_id?: number | null
          template_id?: number | null
          updated_at?: string
          updated_by?: number | null
          verification_summary_json?: Json
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_output_public_links_branding_profile_id_fkey"
            columns: ["branding_profile_id"]
            isOneToOne: false
            referencedRelation: "erp_report_branding_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_output_public_links_cancelled_by_user_profile_id_fkey"
            columns: ["cancelled_by_user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_output_public_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_output_public_links_issued_by_user_profile_id_fkey"
            columns: ["issued_by_user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_output_public_links_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_output_public_links_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_output_public_links_report_run_id_fkey"
            columns: ["report_run_id"]
            isOneToOne: false
            referencedRelation: "erp_report_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_output_public_links_superseded_by_link_id_fkey"
            columns: ["superseded_by_link_id"]
            isOneToOne: false
            referencedRelation: "erp_output_public_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_output_public_links_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "erp_report_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_output_public_links_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_report_branding_profiles: {
        Row: {
          address_block_ar: string | null
          address_block_en: string | null
          created_at: string | null
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          email: string | null
          footer_text_ar: string | null
          footer_text_en: string | null
          id: number
          is_active: boolean | null
          is_default_for_company: boolean | null
          is_group_profile: boolean | null
          is_neutral_profile: boolean | null
          legal_name_ar: string | null
          legal_name_en: string | null
          logo_url: string | null
          owner_company_id: number | null
          phone: string | null
          po_box: string | null
          profile_code: string
          profile_name: string
          profile_type: string
          signatory_name: string | null
          signatory_title_ar: string | null
          signatory_title_en: string | null
          signature_url: string | null
          small_logo_url: string | null
          stamp_url: string | null
          theme_header_bg_color: string | null
          theme_header_text_color: string | null
          theme_primary_color: string | null
          theme_secondary_color: string | null
          trade_license_no: string | null
          trade_name_ar: string | null
          trade_name_en: string | null
          trn: string | null
          updated_at: string | null
          updated_by: number | null
          watermark_text: string | null
          watermark_url: string | null
          website: string | null
        }
        Insert: {
          address_block_ar?: string | null
          address_block_en?: string | null
          created_at?: string | null
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          email?: string | null
          footer_text_ar?: string | null
          footer_text_en?: string | null
          id?: never
          is_active?: boolean | null
          is_default_for_company?: boolean | null
          is_group_profile?: boolean | null
          is_neutral_profile?: boolean | null
          legal_name_ar?: string | null
          legal_name_en?: string | null
          logo_url?: string | null
          owner_company_id?: number | null
          phone?: string | null
          po_box?: string | null
          profile_code: string
          profile_name: string
          profile_type?: string
          signatory_name?: string | null
          signatory_title_ar?: string | null
          signatory_title_en?: string | null
          signature_url?: string | null
          small_logo_url?: string | null
          stamp_url?: string | null
          theme_header_bg_color?: string | null
          theme_header_text_color?: string | null
          theme_primary_color?: string | null
          theme_secondary_color?: string | null
          trade_license_no?: string | null
          trade_name_ar?: string | null
          trade_name_en?: string | null
          trn?: string | null
          updated_at?: string | null
          updated_by?: number | null
          watermark_text?: string | null
          watermark_url?: string | null
          website?: string | null
        }
        Update: {
          address_block_ar?: string | null
          address_block_en?: string | null
          created_at?: string | null
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          email?: string | null
          footer_text_ar?: string | null
          footer_text_en?: string | null
          id?: never
          is_active?: boolean | null
          is_default_for_company?: boolean | null
          is_group_profile?: boolean | null
          is_neutral_profile?: boolean | null
          legal_name_ar?: string | null
          legal_name_en?: string | null
          logo_url?: string | null
          owner_company_id?: number | null
          phone?: string | null
          po_box?: string | null
          profile_code?: string
          profile_name?: string
          profile_type?: string
          signatory_name?: string | null
          signatory_title_ar?: string | null
          signatory_title_en?: string | null
          signature_url?: string | null
          small_logo_url?: string | null
          stamp_url?: string | null
          theme_header_bg_color?: string | null
          theme_header_text_color?: string | null
          theme_primary_color?: string | null
          theme_secondary_color?: string | null
          trade_license_no?: string | null
          trade_name_ar?: string | null
          trade_name_en?: string | null
          trn?: string | null
          updated_at?: string | null
          updated_by?: number | null
          watermark_text?: string | null
          watermark_url?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_report_branding_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_branding_profiles_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_branding_profiles_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_branding_profiles_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_branding_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_report_column_profiles: {
        Row: {
          column_config_json: Json
          created_at: string
          deleted_at: string | null
          deleted_by: number | null
          id: number
          is_default: boolean
          is_shared: boolean
          profile_name: string
          report_id: number
          updated_at: string
          user_profile_id: number
        }
        Insert: {
          column_config_json?: Json
          created_at?: string
          deleted_at?: string | null
          deleted_by?: number | null
          id?: never
          is_default?: boolean
          is_shared?: boolean
          profile_name: string
          report_id: number
          updated_at?: string
          user_profile_id: number
        }
        Update: {
          column_config_json?: Json
          created_at?: string
          deleted_at?: string | null
          deleted_by?: number | null
          id?: never
          is_default?: boolean
          is_shared?: boolean
          profile_name?: string
          report_id?: number
          updated_at?: string
          user_profile_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_report_column_profiles_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_column_profiles_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "erp_report_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_column_profiles_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_report_delivery_logs: {
        Row: {
          attachment_filename: string | null
          attachment_format: string | null
          attachment_size_bytes: number | null
          body_preview: string | null
          created_at: string | null
          created_by: number | null
          delivery_status: string | null
          delivery_type: string | null
          error_message: string | null
          id: number
          provider: string | null
          provider_response_code: string | null
          recipient_bcc: string[] | null
          recipient_cc: string[] | null
          recipient_to: string[] | null
          run_id: number | null
          sent_at: string | null
          subject: string | null
          success: boolean | null
        }
        Insert: {
          attachment_filename?: string | null
          attachment_format?: string | null
          attachment_size_bytes?: number | null
          body_preview?: string | null
          created_at?: string | null
          created_by?: number | null
          delivery_status?: string | null
          delivery_type?: string | null
          error_message?: string | null
          id?: never
          provider?: string | null
          provider_response_code?: string | null
          recipient_bcc?: string[] | null
          recipient_cc?: string[] | null
          recipient_to?: string[] | null
          run_id?: number | null
          sent_at?: string | null
          subject?: string | null
          success?: boolean | null
        }
        Update: {
          attachment_filename?: string | null
          attachment_format?: string | null
          attachment_size_bytes?: number | null
          body_preview?: string | null
          created_at?: string | null
          created_by?: number | null
          delivery_status?: string | null
          delivery_type?: string | null
          error_message?: string | null
          id?: never
          provider?: string | null
          provider_response_code?: string | null
          recipient_bcc?: string[] | null
          recipient_cc?: string[] | null
          recipient_to?: string[] | null
          run_id?: number | null
          sent_at?: string | null
          subject?: string | null
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_report_delivery_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_delivery_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "erp_report_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_report_registry: {
        Row: {
          branding_source_path: string | null
          branding_strategy: string | null
          column_schema_json: Json | null
          created_at: string | null
          created_by: number | null
          default_orientation: string | null
          default_output_formats: string[] | null
          default_template_id: number | null
          deleted_at: string | null
          deleted_by: number | null
          description_ar: string | null
          description_en: string | null
          filter_schema_json: Json | null
          id: number
          is_active: boolean | null
          is_letter_type: boolean | null
          is_system: boolean | null
          module_code: string
          numbering_rule_code: string | null
          report_category: string
          report_code: string
          report_name_ar: string | null
          report_name_en: string
          required_permissions: string[] | null
          sensitive_field_rules_json: Json | null
          sensitive_profile: string | null
          sort_order: number | null
          supports_numbering: boolean | null
          supports_scheduling: boolean | null
          updated_at: string | null
          updated_by: number | null
        }
        Insert: {
          branding_source_path?: string | null
          branding_strategy?: string | null
          column_schema_json?: Json | null
          created_at?: string | null
          created_by?: number | null
          default_orientation?: string | null
          default_output_formats?: string[] | null
          default_template_id?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description_ar?: string | null
          description_en?: string | null
          filter_schema_json?: Json | null
          id?: never
          is_active?: boolean | null
          is_letter_type?: boolean | null
          is_system?: boolean | null
          module_code: string
          numbering_rule_code?: string | null
          report_category: string
          report_code: string
          report_name_ar?: string | null
          report_name_en: string
          required_permissions?: string[] | null
          sensitive_field_rules_json?: Json | null
          sensitive_profile?: string | null
          sort_order?: number | null
          supports_numbering?: boolean | null
          supports_scheduling?: boolean | null
          updated_at?: string | null
          updated_by?: number | null
        }
        Update: {
          branding_source_path?: string | null
          branding_strategy?: string | null
          column_schema_json?: Json | null
          created_at?: string | null
          created_by?: number | null
          default_orientation?: string | null
          default_output_formats?: string[] | null
          default_template_id?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description_ar?: string | null
          description_en?: string | null
          filter_schema_json?: Json | null
          id?: never
          is_active?: boolean | null
          is_letter_type?: boolean | null
          is_system?: boolean | null
          module_code?: string
          numbering_rule_code?: string | null
          report_category?: string
          report_code?: string
          report_name_ar?: string | null
          report_name_en?: string
          required_permissions?: string[] | null
          sensitive_field_rules_json?: Json | null
          sensitive_profile?: string | null
          sort_order?: number | null
          supports_numbering?: boolean | null
          supports_scheduling?: boolean | null
          updated_at?: string | null
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_report_registry_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_registry_default_template_id_fkey"
            columns: ["default_template_id"]
            isOneToOne: false
            referencedRelation: "erp_report_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_registry_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_registry_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_report_runs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          duration_ms: number | null
          email_delivery_status: string | null
          email_sent: boolean | null
          email_to: string[] | null
          error_message: string | null
          filters_json: Json | null
          id: number
          numbering_issued: string | null
          output_format: string
          owner_company_ids: number[] | null
          redaction_summary_json: Json | null
          report_code: string
          report_id: number | null
          resolved_branding_profile_id: number | null
          row_count: number | null
          run_by: number | null
          run_reference: string | null
          run_status: string | null
          selected_template_id: number | null
          sensitive_data_included: boolean | null
          sensitive_profile: string | null
          started_at: string | null
          template_selected_manually: boolean | null
          was_multi_company: boolean | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          email_delivery_status?: string | null
          email_sent?: boolean | null
          email_to?: string[] | null
          error_message?: string | null
          filters_json?: Json | null
          id?: never
          numbering_issued?: string | null
          output_format: string
          owner_company_ids?: number[] | null
          redaction_summary_json?: Json | null
          report_code: string
          report_id?: number | null
          resolved_branding_profile_id?: number | null
          row_count?: number | null
          run_by?: number | null
          run_reference?: string | null
          run_status?: string | null
          selected_template_id?: number | null
          sensitive_data_included?: boolean | null
          sensitive_profile?: string | null
          started_at?: string | null
          template_selected_manually?: boolean | null
          was_multi_company?: boolean | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          email_delivery_status?: string | null
          email_sent?: boolean | null
          email_to?: string[] | null
          error_message?: string | null
          filters_json?: Json | null
          id?: never
          numbering_issued?: string | null
          output_format?: string
          owner_company_ids?: number[] | null
          redaction_summary_json?: Json | null
          report_code?: string
          report_id?: number | null
          resolved_branding_profile_id?: number | null
          row_count?: number | null
          run_by?: number | null
          run_reference?: string | null
          run_status?: string | null
          selected_template_id?: number | null
          sensitive_data_included?: boolean | null
          sensitive_profile?: string | null
          started_at?: string | null
          template_selected_manually?: boolean | null
          was_multi_company?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_report_runs_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "erp_report_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_runs_resolved_branding_profile_id_fkey"
            columns: ["resolved_branding_profile_id"]
            isOneToOne: false
            referencedRelation: "erp_report_branding_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_runs_run_by_fkey"
            columns: ["run_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_runs_selected_template_id_fkey"
            columns: ["selected_template_id"]
            isOneToOne: false
            referencedRelation: "erp_report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_report_saved_filters: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: number | null
          filter_name: string
          filters_json: Json
          id: number
          is_default: boolean
          is_shared: boolean
          report_id: number
          updated_at: string
          user_profile_id: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: number | null
          filter_name: string
          filters_json?: Json
          id?: never
          is_default?: boolean
          is_shared?: boolean
          report_id: number
          updated_at?: string
          user_profile_id: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: number | null
          filter_name?: string
          filters_json?: Json
          id?: never
          is_default?: boolean
          is_shared?: boolean
          report_id?: number
          updated_at?: string
          user_profile_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_report_saved_filters_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_saved_filters_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "erp_report_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_saved_filters_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_report_schedules: {
        Row: {
          created_at: string
          created_by: number
          day_of_month: number | null
          day_of_week: number | null
          deleted_at: string | null
          deleted_by: number | null
          email_body_template: string | null
          email_subject_template: string | null
          filters_json: Json
          frequency: string
          id: number
          is_active: boolean
          last_run_at: string | null
          last_status: string | null
          next_run_at: string | null
          output_format: string
          owner_company_id: number | null
          recipient_cc: string[] | null
          recipient_to: string[]
          report_id: number
          schedule_code: string | null
          schedule_name: string
          selected_template_id: number | null
          time_of_day: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: number
          day_of_month?: number | null
          day_of_week?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          email_body_template?: string | null
          email_subject_template?: string | null
          filters_json?: Json
          frequency: string
          id?: never
          is_active?: boolean
          last_run_at?: string | null
          last_status?: string | null
          next_run_at?: string | null
          output_format?: string
          owner_company_id?: number | null
          recipient_cc?: string[] | null
          recipient_to?: string[]
          report_id: number
          schedule_code?: string | null
          schedule_name: string
          selected_template_id?: number | null
          time_of_day?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: number
          day_of_month?: number | null
          day_of_week?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          email_body_template?: string | null
          email_subject_template?: string | null
          filters_json?: Json
          frequency?: string
          id?: never
          is_active?: boolean
          last_run_at?: string | null
          last_status?: string | null
          next_run_at?: string | null
          output_format?: string
          owner_company_id?: number | null
          recipient_cc?: string[] | null
          recipient_to?: string[]
          report_id?: number
          schedule_code?: string | null
          schedule_name?: string
          selected_template_id?: number | null
          time_of_day?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_report_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_schedules_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_schedules_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_schedules_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_schedules_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "erp_report_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_schedules_selected_template_id_fkey"
            columns: ["selected_template_id"]
            isOneToOne: false
            referencedRelation: "erp_report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_report_template_events: {
        Row: {
          actor_user_profile_id: number | null
          event_type: string
          id: number
          notes: string | null
          occurred_at: string
          payload_json: Json
          template_id: number
        }
        Insert: {
          actor_user_profile_id?: number | null
          event_type: string
          id?: number
          notes?: string | null
          occurred_at?: string
          payload_json?: Json
          template_id: number
        }
        Update: {
          actor_user_profile_id?: number | null
          event_type?: string
          id?: number
          notes?: string | null
          occurred_at?: string
          payload_json?: Json
          template_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_report_template_events_actor_user_profile_id_fkey"
            columns: ["actor_user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_template_events_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "erp_report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_report_templates: {
        Row: {
          approval_notes: string | null
          approved_at: string | null
          approved_by: number | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: number | null
          body_html_ar: string | null
          body_html_en: string | null
          body_layout_json: Json | null
          branding_profile_id: number | null
          created_at: string | null
          created_by: number | null
          custom_css: string | null
          default_orientation: string | null
          deleted_at: string | null
          deleted_by: number | null
          font_family: string | null
          footer_layout_json: Json | null
          governance_status: string
          header_layout_json: Json | null
          id: number
          is_active: boolean | null
          is_default: boolean | null
          language_mode: string | null
          page_size: string | null
          parent_template_id: number | null
          published_at: string | null
          published_by: number | null
          rejected_at: string | null
          rejected_by: number | null
          rejection_reason: string | null
          requires_stamp_permission: boolean | null
          security_review_at: string | null
          security_review_by: number | null
          security_review_notes: string | null
          security_review_status: string
          show_address: boolean | null
          show_license: boolean | null
          show_logo: boolean | null
          show_signatory: boolean | null
          show_small_logo: boolean | null
          show_stamp: boolean | null
          show_trn: boolean | null
          show_watermark: boolean | null
          style_json: Json | null
          submitted_at: string | null
          submitted_by: number | null
          template_code: string
          template_name: string
          template_type: string
          updated_at: string | null
          updated_by: number | null
          version_no: number | null
          visual_editor_engine: string | null
          visual_layout_schema_version: number | null
          visual_layout_updated_at: string | null
          visual_layout_updated_by: number | null
          watermark_text: string | null
        }
        Insert: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: number | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: number | null
          body_html_ar?: string | null
          body_html_en?: string | null
          body_layout_json?: Json | null
          branding_profile_id?: number | null
          created_at?: string | null
          created_by?: number | null
          custom_css?: string | null
          default_orientation?: string | null
          deleted_at?: string | null
          deleted_by?: number | null
          font_family?: string | null
          footer_layout_json?: Json | null
          governance_status?: string
          header_layout_json?: Json | null
          id?: never
          is_active?: boolean | null
          is_default?: boolean | null
          language_mode?: string | null
          page_size?: string | null
          parent_template_id?: number | null
          published_at?: string | null
          published_by?: number | null
          rejected_at?: string | null
          rejected_by?: number | null
          rejection_reason?: string | null
          requires_stamp_permission?: boolean | null
          security_review_at?: string | null
          security_review_by?: number | null
          security_review_notes?: string | null
          security_review_status?: string
          show_address?: boolean | null
          show_license?: boolean | null
          show_logo?: boolean | null
          show_signatory?: boolean | null
          show_small_logo?: boolean | null
          show_stamp?: boolean | null
          show_trn?: boolean | null
          show_watermark?: boolean | null
          style_json?: Json | null
          submitted_at?: string | null
          submitted_by?: number | null
          template_code: string
          template_name: string
          template_type: string
          updated_at?: string | null
          updated_by?: number | null
          version_no?: number | null
          visual_editor_engine?: string | null
          visual_layout_schema_version?: number | null
          visual_layout_updated_at?: string | null
          visual_layout_updated_by?: number | null
          watermark_text?: string | null
        }
        Update: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: number | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: number | null
          body_html_ar?: string | null
          body_html_en?: string | null
          body_layout_json?: Json | null
          branding_profile_id?: number | null
          created_at?: string | null
          created_by?: number | null
          custom_css?: string | null
          default_orientation?: string | null
          deleted_at?: string | null
          deleted_by?: number | null
          font_family?: string | null
          footer_layout_json?: Json | null
          governance_status?: string
          header_layout_json?: Json | null
          id?: never
          is_active?: boolean | null
          is_default?: boolean | null
          language_mode?: string | null
          page_size?: string | null
          parent_template_id?: number | null
          published_at?: string | null
          published_by?: number | null
          rejected_at?: string | null
          rejected_by?: number | null
          rejection_reason?: string | null
          requires_stamp_permission?: boolean | null
          security_review_at?: string | null
          security_review_by?: number | null
          security_review_notes?: string | null
          security_review_status?: string
          show_address?: boolean | null
          show_license?: boolean | null
          show_logo?: boolean | null
          show_signatory?: boolean | null
          show_small_logo?: boolean | null
          show_stamp?: boolean | null
          show_trn?: boolean | null
          show_watermark?: boolean | null
          style_json?: Json | null
          submitted_at?: string | null
          submitted_by?: number | null
          template_code?: string
          template_name?: string
          template_type?: string
          updated_at?: string | null
          updated_by?: number | null
          version_no?: number | null
          visual_editor_engine?: string | null
          visual_layout_schema_version?: number | null
          visual_layout_updated_at?: string | null
          visual_layout_updated_by?: number | null
          watermark_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_report_templates_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_templates_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_templates_branding_profile_id_fkey"
            columns: ["branding_profile_id"]
            isOneToOne: false
            referencedRelation: "erp_report_branding_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_templates_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_templates_parent_template_id_fkey"
            columns: ["parent_template_id"]
            isOneToOne: false
            referencedRelation: "erp_report_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_templates_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_templates_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_templates_security_review_by_fkey"
            columns: ["security_review_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_templates_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_report_templates_visual_layout_updated_by_fkey"
            columns: ["visual_layout_updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_charges: {
        Row: {
          amount: number
          charge_name: string
          charge_type: string
          created_at: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          is_active: boolean | null
          station_id: string | null
        }
        Insert: {
          amount: number
          charge_name: string
          charge_type: string
          created_at?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          station_id?: string | null
        }
        Update: {
          amount?: number
          charge_name?: string
          charge_type?: string
          created_at?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          station_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_charges_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      global_lookup_categories: {
        Row: {
          category_code: string
          category_name_ar: string | null
          category_name_en: string
          category_scope: string
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          description: string | null
          id: number
          is_active: boolean
          is_locked: boolean
          is_system: boolean
          module_code: string | null
          sort_order: number
          supports_color: boolean
          supports_effective_dates: boolean
          supports_hierarchy: boolean
          supports_icon: boolean
          supports_metadata: boolean
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          category_code: string
          category_name_ar?: string | null
          category_name_en: string
          category_scope?: string
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          description?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          module_code?: string | null
          sort_order?: number
          supports_color?: boolean
          supports_effective_dates?: boolean
          supports_hierarchy?: boolean
          supports_icon?: boolean
          supports_metadata?: boolean
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          category_code?: string
          category_name_ar?: string | null
          category_name_en?: string
          category_scope?: string
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          description?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          module_code?: string | null
          sort_order?: number
          supports_color?: boolean
          supports_effective_dates?: boolean
          supports_hierarchy?: boolean
          supports_icon?: boolean
          supports_metadata?: boolean
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: []
      }
      global_lookup_values: {
        Row: {
          badge_variant: string | null
          category_id: number
          color_hex: string | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          description: string | null
          effective_from: string | null
          effective_to: string | null
          icon_name: string | null
          id: number
          is_active: boolean
          is_default: boolean
          is_locked: boolean
          is_system: boolean
          metadata_json: Json
          parent_value_id: number | null
          sort_order: number
          updated_at: string
          updated_by: number | null
          value_code: string
          value_label_ar: string | null
          value_label_en: string
        }
        Insert: {
          badge_variant?: string | null
          category_id: number
          color_hex?: string | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          icon_name?: string | null
          id?: number
          is_active?: boolean
          is_default?: boolean
          is_locked?: boolean
          is_system?: boolean
          metadata_json?: Json
          parent_value_id?: number | null
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
          value_code: string
          value_label_ar?: string | null
          value_label_en: string
        }
        Update: {
          badge_variant?: string | null
          category_id?: number
          color_hex?: string | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          description?: string | null
          effective_from?: string | null
          effective_to?: string | null
          icon_name?: string | null
          id?: number
          is_active?: boolean
          is_default?: boolean
          is_locked?: boolean
          is_system?: boolean
          metadata_json?: Json
          parent_value_id?: number | null
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
          value_code?: string
          value_label_ar?: string | null
          value_label_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_lookup_values_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "global_lookup_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_lookup_values_parent_value_id_fkey"
            columns: ["parent_value_id"]
            isOneToOne: false
            referencedRelation: "global_lookup_values"
            referencedColumns: ["id"]
          },
        ]
      }
      global_numbering_generated_references: {
        Row: {
          cancelled_at: string | null
          cancelled_reason: string | null
          consumed_at: string | null
          created_at: string
          created_by: number | null
          document_prefix: string
          document_type_code: string
          generated_at: string
          generated_by: number | null
          generated_reference_number: string
          generated_sequence_number: number
          generation_reason: string | null
          generation_status: string
          id: number
          manual_override_reason: string | null
          manual_override_used: boolean
          module_code: string
          numbering_rule_id: number
          reserved_at: string | null
          sequence_state_id: number | null
          target_record_id: number | null
          target_table_name: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          consumed_at?: string | null
          created_at?: string
          created_by?: number | null
          document_prefix: string
          document_type_code: string
          generated_at?: string
          generated_by?: number | null
          generated_reference_number: string
          generated_sequence_number: number
          generation_reason?: string | null
          generation_status?: string
          id?: number
          manual_override_reason?: string | null
          manual_override_used?: boolean
          module_code: string
          numbering_rule_id: number
          reserved_at?: string | null
          sequence_state_id?: number | null
          target_record_id?: number | null
          target_table_name?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          consumed_at?: string | null
          created_at?: string
          created_by?: number | null
          document_prefix?: string
          document_type_code?: string
          generated_at?: string
          generated_by?: number | null
          generated_reference_number?: string
          generated_sequence_number?: number
          generation_reason?: string | null
          generation_status?: string
          id?: number
          manual_override_reason?: string | null
          manual_override_used?: boolean
          module_code?: string
          numbering_rule_id?: number
          reserved_at?: string | null
          sequence_state_id?: number | null
          target_record_id?: number | null
          target_table_name?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "global_numbering_generated_references_numbering_rule_id_fkey"
            columns: ["numbering_rule_id"]
            isOneToOne: false
            referencedRelation: "global_numbering_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_numbering_generated_references_sequence_state_id_fkey"
            columns: ["sequence_state_id"]
            isOneToOne: false
            referencedRelation: "global_numbering_sequence_states"
            referencedColumns: ["id"]
          },
        ]
      }
      global_numbering_rules: {
        Row: {
          allow_gaps: boolean
          allow_manual_override: boolean
          cancelled_number_policy: string
          created_at: string
          created_by: number | null
          current_sequence_number: number
          description: string | null
          document_prefix: string
          document_type_code: string
          document_type_name: string
          duplicate_prevention_scope: string
          effective_from: string | null
          effective_to: string | null
          format_template: string
          id: number
          is_active: boolean
          is_locked: boolean
          manual_override_requires_permission: boolean
          module_code: string
          module_name: string
          next_sequence_number: number
          notes: string | null
          padding_character: string
          reserve_on_draft: boolean
          reserve_on_submit: boolean
          reset_policy: string
          rule_code: string
          rule_name: string
          separator: string
          sequence_length: number
          starting_sequence_number: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          allow_gaps?: boolean
          allow_manual_override?: boolean
          cancelled_number_policy?: string
          created_at?: string
          created_by?: number | null
          current_sequence_number?: number
          description?: string | null
          document_prefix: string
          document_type_code: string
          document_type_name: string
          duplicate_prevention_scope?: string
          effective_from?: string | null
          effective_to?: string | null
          format_template?: string
          id?: number
          is_active?: boolean
          is_locked?: boolean
          manual_override_requires_permission?: boolean
          module_code: string
          module_name: string
          next_sequence_number?: number
          notes?: string | null
          padding_character?: string
          reserve_on_draft?: boolean
          reserve_on_submit?: boolean
          reset_policy?: string
          rule_code: string
          rule_name: string
          separator?: string
          sequence_length?: number
          starting_sequence_number?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          allow_gaps?: boolean
          allow_manual_override?: boolean
          cancelled_number_policy?: string
          created_at?: string
          created_by?: number | null
          current_sequence_number?: number
          description?: string | null
          document_prefix?: string
          document_type_code?: string
          document_type_name?: string
          duplicate_prevention_scope?: string
          effective_from?: string | null
          effective_to?: string | null
          format_template?: string
          id?: number
          is_active?: boolean
          is_locked?: boolean
          manual_override_requires_permission?: boolean
          module_code?: string
          module_name?: string
          next_sequence_number?: number
          notes?: string | null
          padding_character?: string
          reserve_on_draft?: boolean
          reserve_on_submit?: boolean
          reset_policy?: string
          rule_code?: string
          rule_name?: string
          separator?: string
          sequence_length?: number
          starting_sequence_number?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: []
      }
      global_numbering_sequence_states: {
        Row: {
          created_at: string
          created_by: number | null
          document_prefix: string
          document_type_code: string
          id: number
          last_generated_at: string | null
          last_generated_reference: string | null
          last_sequence_number: number
          module_code: string
          next_sequence_number: number
          numbering_rule_id: number
          reset_period_key: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          document_prefix: string
          document_type_code: string
          id?: number
          last_generated_at?: string | null
          last_generated_reference?: string | null
          last_sequence_number?: number
          module_code: string
          next_sequence_number?: number
          numbering_rule_id: number
          reset_period_key?: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          document_prefix?: string
          document_type_code?: string
          id?: number
          last_generated_at?: string | null
          last_generated_reference?: string | null
          last_sequence_number?: number
          module_code?: string
          next_sequence_number?: number
          numbering_rule_id?: number
          reset_period_key?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "global_numbering_sequence_states_numbering_rule_id_fkey"
            columns: ["numbering_rule_id"]
            isOneToOne: false
            referencedRelation: "global_numbering_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      government_authorities: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          area_zone_id: number | null
          authority_category_code: string | null
          authority_code: string
          authority_name_ar: string | null
          authority_name_en: string
          authority_type_code: string
          city_id: number | null
          country_id: number | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          emirate_id: number | null
          id: number
          is_active: boolean
          is_locked: boolean
          is_system: boolean
          jurisdiction_level_code: string | null
          notes: string | null
          po_box: string | null
          primary_email: string | null
          primary_mobile: string | null
          primary_phone: string | null
          sort_order: number
          status_code: string
          updated_at: string
          updated_by: number | null
          website_url: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          area_zone_id?: number | null
          authority_category_code?: string | null
          authority_code: string
          authority_name_ar?: string | null
          authority_name_en: string
          authority_type_code: string
          city_id?: number | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          jurisdiction_level_code?: string | null
          notes?: string | null
          po_box?: string | null
          primary_email?: string | null
          primary_mobile?: string | null
          primary_phone?: string | null
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
          website_url?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          area_zone_id?: number | null
          authority_category_code?: string | null
          authority_code?: string
          authority_name_ar?: string | null
          authority_name_en?: string
          authority_type_code?: string
          city_id?: number | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          jurisdiction_level_code?: string | null
          notes?: string | null
          po_box?: string | null
          primary_email?: string | null
          primary_mobile?: string | null
          primary_phone?: string | null
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "government_authorities_area_zone_id_fkey"
            columns: ["area_zone_id"]
            isOneToOne: false
            referencedRelation: "areas_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authorities_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authorities_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authorities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authorities_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authorities_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authorities_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      government_authority_addresses: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          address_type_code: string | null
          area_zone_id: number | null
          building_name: string | null
          city_id: number | null
          country_id: number | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          emirate_id: number | null
          government_authority_id: number
          id: number
          is_active: boolean
          is_billing_address: boolean
          is_locked: boolean
          is_primary: boolean
          is_shipping_address: boolean
          is_system: boolean
          latitude: number | null
          longitude: number | null
          makani_number: string | null
          notes: string | null
          po_box: string | null
          sort_order: number
          status_code: string
          street_name: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          address_type_code?: string | null
          area_zone_id?: number | null
          building_name?: string | null
          city_id?: number | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number | null
          government_authority_id: number
          id?: number
          is_active?: boolean
          is_billing_address?: boolean
          is_locked?: boolean
          is_primary?: boolean
          is_shipping_address?: boolean
          is_system?: boolean
          latitude?: number | null
          longitude?: number | null
          makani_number?: string | null
          notes?: string | null
          po_box?: string | null
          sort_order?: number
          status_code?: string
          street_name?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          address_type_code?: string | null
          area_zone_id?: number | null
          building_name?: string | null
          city_id?: number | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number | null
          government_authority_id?: number
          id?: number
          is_active?: boolean
          is_billing_address?: boolean
          is_locked?: boolean
          is_primary?: boolean
          is_shipping_address?: boolean
          is_system?: boolean
          latitude?: number | null
          longitude?: number | null
          makani_number?: string | null
          notes?: string | null
          po_box?: string | null
          sort_order?: number
          status_code?: string
          street_name?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "government_authority_addresses_area_zone_id_fkey"
            columns: ["area_zone_id"]
            isOneToOne: false
            referencedRelation: "areas_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authority_addresses_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authority_addresses_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authority_addresses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authority_addresses_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authority_addresses_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authority_addresses_government_authority_id_fkey"
            columns: ["government_authority_id"]
            isOneToOne: false
            referencedRelation: "government_authorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authority_addresses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      government_authority_contacts: {
        Row: {
          contact_code: string
          contact_name_ar: string | null
          contact_name_en: string
          contact_type_code: string | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          department: string | null
          designation: string | null
          email: string | null
          government_authority_id: number
          id: number
          is_active: boolean
          is_authorized_signatory: boolean
          is_decision_maker: boolean
          is_finance_contact: boolean
          is_locked: boolean
          is_operations_contact: boolean
          is_primary: boolean
          is_system: boolean
          mobile: string | null
          notes: string | null
          phone: string | null
          preferred_communication_code: string | null
          sort_order: number
          status_code: string
          updated_at: string
          updated_by: number | null
          whatsapp: string | null
        }
        Insert: {
          contact_code: string
          contact_name_ar?: string | null
          contact_name_en: string
          contact_type_code?: string | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          government_authority_id: number
          id?: number
          is_active?: boolean
          is_authorized_signatory?: boolean
          is_decision_maker?: boolean
          is_finance_contact?: boolean
          is_locked?: boolean
          is_operations_contact?: boolean
          is_primary?: boolean
          is_system?: boolean
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          preferred_communication_code?: string | null
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
          whatsapp?: string | null
        }
        Update: {
          contact_code?: string
          contact_name_ar?: string | null
          contact_name_en?: string
          contact_type_code?: string | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          government_authority_id?: number
          id?: number
          is_active?: boolean
          is_authorized_signatory?: boolean
          is_decision_maker?: boolean
          is_finance_contact?: boolean
          is_locked?: boolean
          is_operations_contact?: boolean
          is_primary?: boolean
          is_system?: boolean
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          preferred_communication_code?: string | null
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "government_authority_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authority_contacts_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authority_contacts_government_authority_id_fkey"
            columns: ["government_authority_id"]
            isOneToOne: false
            referencedRelation: "government_authorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authority_contacts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      government_authority_documents: {
        Row: {
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          document_name: string
          document_number: string | null
          document_type_code: string | null
          expiry_date: string | null
          expiry_reminder_days: number | null
          file_path: string | null
          government_authority_id: number
          has_expiry: boolean
          id: number
          is_active: boolean
          is_locked: boolean
          is_required: boolean
          is_system: boolean
          is_verified: boolean
          issue_date: string | null
          notes: string | null
          sort_order: number
          status_code: string
          updated_at: string
          updated_by: number | null
          verified_at: string | null
          verified_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          document_name: string
          document_number?: string | null
          document_type_code?: string | null
          expiry_date?: string | null
          expiry_reminder_days?: number | null
          file_path?: string | null
          government_authority_id: number
          has_expiry?: boolean
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_required?: boolean
          is_system?: boolean
          is_verified?: boolean
          issue_date?: string | null
          notes?: string | null
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
          verified_at?: string | null
          verified_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          document_name?: string
          document_number?: string | null
          document_type_code?: string | null
          expiry_date?: string | null
          expiry_reminder_days?: number | null
          file_path?: string | null
          government_authority_id?: number
          has_expiry?: boolean
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_required?: boolean
          is_system?: boolean
          is_verified?: boolean
          issue_date?: string | null
          notes?: string | null
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
          verified_at?: string | null
          verified_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "government_authority_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authority_documents_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authority_documents_government_authority_id_fkey"
            columns: ["government_authority_id"]
            isOneToOne: false
            referencedRelation: "government_authorities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authority_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "government_authority_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_access_card_types: {
        Row: {
          code: string
          created_at: string
          created_by: number | null
          default_expiry_alert_days: number
          deleted_at: string | null
          deleted_by: number | null
          description: string | null
          id: number
          is_active: boolean
          name_ar: string | null
          name_en: string
          requires_client_authority: boolean
          requires_work_site: boolean
          scope_type: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: number | null
          default_expiry_alert_days?: number
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en: string
          requires_client_authority?: boolean
          requires_work_site?: boolean
          scope_type?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: number | null
          default_expiry_alert_days?: number
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en?: string
          requires_client_authority?: boolean
          requires_work_site?: boolean
          scope_type?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_access_card_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_access_card_types_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_access_card_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_approval_workflows: {
        Row: {
          approval_role_id: number | null
          approval_step: number
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          escalation_role_id: number | null
          id: number
          is_active: boolean
          is_required: boolean
          sla_hours: number | null
          updated_at: string
          updated_by: number | null
          workflow_code: string
          workflow_name_ar: string | null
          workflow_name_en: string
          workflow_type: string
        }
        Insert: {
          approval_role_id?: number | null
          approval_step?: number
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          escalation_role_id?: number | null
          id?: never
          is_active?: boolean
          is_required?: boolean
          sla_hours?: number | null
          updated_at?: string
          updated_by?: number | null
          workflow_code: string
          workflow_name_ar?: string | null
          workflow_name_en: string
          workflow_type: string
        }
        Update: {
          approval_role_id?: number | null
          approval_step?: number
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          escalation_role_id?: number | null
          id?: never
          is_active?: boolean
          is_required?: boolean
          sla_hours?: number | null
          updated_at?: string
          updated_by?: number | null
          workflow_code?: string
          workflow_name_ar?: string | null
          workflow_name_en?: string
          workflow_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_approval_workflows_approval_role_id_fkey"
            columns: ["approval_role_id"]
            isOneToOne: false
            referencedRelation: "approval_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_approval_workflows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_approval_workflows_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_approval_workflows_escalation_role_id_fkey"
            columns: ["escalation_role_id"]
            isOneToOne: false
            referencedRelation: "approval_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_approval_workflows_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_candidate_documents: {
        Row: {
          candidate_id: number
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          dms_document_id: number
          document_purpose: string | null
          id: number
          notes: string | null
          verification_status: string
        }
        Insert: {
          candidate_id: number
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id: number
          document_purpose?: string | null
          id?: never
          notes?: string | null
          verification_status?: string
        }
        Update: {
          candidate_id?: number
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number
          document_purpose?: string | null
          id?: never
          notes?: string | null
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_candidate_documents_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_candidate_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_candidate_documents_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_candidate_documents_dms_document_id_fkey"
            columns: ["dms_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_candidates: {
        Row: {
          agency_name: string | null
          availability_date: string | null
          candidate_code: string | null
          candidate_status: string
          created_at: string
          created_by: number | null
          current_employer: string | null
          current_location: string | null
          current_position: string | null
          date_of_birth: string | null
          deleted_at: string | null
          deleted_by: number | null
          email: string | null
          expected_salary: number | null
          full_name_ar: string | null
          full_name_en: string
          gender: string | null
          id: number
          mobile_number: string | null
          nationality_id: number | null
          notes: string | null
          notice_period_days: number | null
          pipeline_stage: string
          rating: string | null
          referred_by_employee_id: number | null
          requisition_id: number | null
          source: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          agency_name?: string | null
          availability_date?: string | null
          candidate_code?: string | null
          candidate_status?: string
          created_at?: string
          created_by?: number | null
          current_employer?: string | null
          current_location?: string | null
          current_position?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          deleted_by?: number | null
          email?: string | null
          expected_salary?: number | null
          full_name_ar?: string | null
          full_name_en: string
          gender?: string | null
          id?: never
          mobile_number?: string | null
          nationality_id?: number | null
          notes?: string | null
          notice_period_days?: number | null
          pipeline_stage?: string
          rating?: string | null
          referred_by_employee_id?: number | null
          requisition_id?: number | null
          source?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          agency_name?: string | null
          availability_date?: string | null
          candidate_code?: string | null
          candidate_status?: string
          created_at?: string
          created_by?: number | null
          current_employer?: string | null
          current_location?: string | null
          current_position?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          deleted_by?: number | null
          email?: string | null
          expected_salary?: number | null
          full_name_ar?: string | null
          full_name_en?: string
          gender?: string | null
          id?: never
          mobile_number?: string | null
          nationality_id?: number | null
          notes?: string | null
          notice_period_days?: number | null
          pipeline_stage?: string
          rating?: string | null
          referred_by_employee_id?: number | null
          requisition_id?: number | null
          source?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_candidates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_candidates_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_candidates_nationality_id_fkey"
            columns: ["nationality_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_candidates_referred_by_employee_id_fkey"
            columns: ["referred_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_candidates_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "hr_job_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_candidates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employee_categories: {
        Row: {
          code: string
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          description: string | null
          id: number
          is_active: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_categories_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employment_types: {
        Row: {
          code: string
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          description: string | null
          id: number
          is_active: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employment_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employment_types_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employment_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_grades: {
        Row: {
          code: string
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          description: string | null
          grade_level: number | null
          id: number
          is_active: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          grade_level?: number | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          grade_level?: number | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_grades_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_grades_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_grades_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_identity_document_types: {
        Row: {
          code: string
          created_at: string
          created_by: number | null
          default_expiry_alert_days: number
          deleted_at: string | null
          deleted_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_government_document: boolean
          is_sensitive: boolean
          name_ar: string | null
          name_en: string
          requires_document_number: boolean
          requires_expiry_date: boolean
          requires_issue_date: boolean
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: number | null
          default_expiry_alert_days?: number
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_government_document?: boolean
          is_sensitive?: boolean
          name_ar?: string | null
          name_en: string
          requires_document_number?: boolean
          requires_expiry_date?: boolean
          requires_issue_date?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: number | null
          default_expiry_alert_days?: number
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_government_document?: boolean
          is_sensitive?: boolean
          name_ar?: string | null
          name_en?: string
          requires_document_number?: boolean
          requires_expiry_date?: boolean
          requires_issue_date?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_identity_document_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_identity_document_types_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_identity_document_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_interviews: {
        Row: {
          candidate_id: number
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          feedback: string | null
          id: number
          interview_datetime: string | null
          interview_location: string | null
          interview_round: string
          interview_status: string
          interviewer_id: number | null
          next_step: string | null
          requisition_id: number | null
          result: string | null
          score: number | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          candidate_id: number
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          feedback?: string | null
          id?: never
          interview_datetime?: string | null
          interview_location?: string | null
          interview_round?: string
          interview_status?: string
          interviewer_id?: number | null
          next_step?: string | null
          requisition_id?: number | null
          result?: string | null
          score?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          candidate_id?: number
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          feedback?: string | null
          id?: never
          interview_datetime?: string | null
          interview_location?: string | null
          interview_round?: string
          interview_status?: string
          interviewer_id?: number | null
          next_step?: string | null
          requisition_id?: number | null
          result?: string | null
          score?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_interviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_interviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_interviews_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_interviews_interviewer_id_fkey"
            columns: ["interviewer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_interviews_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "hr_job_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_interviews_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_job_requisitions: {
        Row: {
          branch_id: number | null
          budgeted_salary_max: number | null
          budgeted_salary_min: number | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          department_id: number | null
          designation_id: number | null
          employee_category_id: number | null
          employment_type_id: number | null
          hiring_manager_id: number | null
          id: number
          job_description: string | null
          notes: string | null
          owner_company_id: number | null
          priority: string
          requested_by: number | null
          requirements: string | null
          requisition_code: string | null
          requisition_status: string
          requisition_title: string
          target_start_date: string | null
          updated_at: string
          updated_by: number | null
          vacancies_count: number
          work_site_id: number | null
        }
        Insert: {
          branch_id?: number | null
          budgeted_salary_max?: number | null
          budgeted_salary_min?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          department_id?: number | null
          designation_id?: number | null
          employee_category_id?: number | null
          employment_type_id?: number | null
          hiring_manager_id?: number | null
          id?: never
          job_description?: string | null
          notes?: string | null
          owner_company_id?: number | null
          priority?: string
          requested_by?: number | null
          requirements?: string | null
          requisition_code?: string | null
          requisition_status?: string
          requisition_title: string
          target_start_date?: string | null
          updated_at?: string
          updated_by?: number | null
          vacancies_count?: number
          work_site_id?: number | null
        }
        Update: {
          branch_id?: number | null
          budgeted_salary_max?: number | null
          budgeted_salary_min?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          department_id?: number | null
          designation_id?: number | null
          employee_category_id?: number | null
          employment_type_id?: number | null
          hiring_manager_id?: number | null
          id?: never
          job_description?: string | null
          notes?: string | null
          owner_company_id?: number | null
          priority?: string
          requested_by?: number | null
          requirements?: string | null
          requisition_code?: string | null
          requisition_status?: string
          requisition_title?: string
          target_start_date?: string | null
          updated_at?: string
          updated_by?: number | null
          vacancies_count?: number
          work_site_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_job_requisitions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_job_requisitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_job_requisitions_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_job_requisitions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_job_requisitions_designation_id_fkey"
            columns: ["designation_id"]
            isOneToOne: false
            referencedRelation: "designations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_job_requisitions_employee_category_id_fkey"
            columns: ["employee_category_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_job_requisitions_employment_type_id_fkey"
            columns: ["employment_type_id"]
            isOneToOne: false
            referencedRelation: "hr_employment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_job_requisitions_hiring_manager_id_fkey"
            columns: ["hiring_manager_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_job_requisitions_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_job_requisitions_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_job_requisitions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_job_requisitions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_job_requisitions_work_site_id_fkey"
            columns: ["work_site_id"]
            isOneToOne: false
            referencedRelation: "work_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_types: {
        Row: {
          allow_half_day: boolean
          code: string
          created_at: string
          created_by: number | null
          default_entitlement_days: number | null
          deleted_at: string | null
          deleted_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_paid: boolean
          name_ar: string | null
          name_en: string
          requires_approval: boolean
          requires_document: boolean
          reset_basis: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          allow_half_day?: boolean
          code: string
          created_at?: string
          created_by?: number | null
          default_entitlement_days?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_paid?: boolean
          name_ar?: string | null
          name_en: string
          requires_approval?: boolean
          requires_document?: boolean
          reset_basis?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          allow_half_day?: boolean
          code?: string
          created_at?: string
          created_by?: number | null
          default_entitlement_days?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_paid?: boolean
          name_ar?: string | null
          name_en?: string
          requires_approval?: boolean
          requires_document?: boolean
          reset_basis?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_types_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_medical_record_types: {
        Row: {
          code: string
          created_at: string
          created_by: number | null
          default_expiry_alert_days: number
          default_validity_months: number | null
          deleted_at: string | null
          deleted_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_confidential: boolean
          name_ar: string | null
          name_en: string
          requires_dms_document: boolean
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: number | null
          default_expiry_alert_days?: number
          default_validity_months?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_confidential?: boolean
          name_ar?: string | null
          name_en: string
          requires_dms_document?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: number | null
          default_expiry_alert_days?: number
          default_validity_months?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_confidential?: boolean
          name_ar?: string | null
          name_en?: string
          requires_dms_document?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_medical_record_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_medical_record_types_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_medical_record_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_mohre_establishments: {
        Row: {
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          emirate_id: number | null
          establishment_name: string
          establishment_number: string
          id: number
          notes: string | null
          owner_company_id: number
          status: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          emirate_id?: number | null
          establishment_name: string
          establishment_number: string
          id?: never
          notes?: string | null
          owner_company_id: number
          status?: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          emirate_id?: number | null
          establishment_name?: string
          establishment_number?: string
          id?: never
          notes?: string | null
          owner_company_id?: number
          status?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_mohre_establishments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_mohre_establishments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_mohre_establishments_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_mohre_establishments_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_mohre_establishments_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_mohre_establishments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_offers: {
        Row: {
          approval_request_id: number | null
          basic_salary: number | null
          branch_id: number | null
          candidate_id: number
          created_at: string
          created_by: number | null
          currency: string
          deleted_at: string | null
          deleted_by: number | null
          department_id: number | null
          designation_id: number | null
          employment_type_id: number | null
          gross_salary: number | null
          id: number
          notes: string | null
          offer_date: string | null
          offer_document_id: number | null
          offer_status: string
          owner_company_id: number | null
          proposed_joining_date: string | null
          requisition_id: number | null
          updated_at: string
          updated_by: number | null
          valid_until: string | null
        }
        Insert: {
          approval_request_id?: number | null
          basic_salary?: number | null
          branch_id?: number | null
          candidate_id: number
          created_at?: string
          created_by?: number | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: number | null
          department_id?: number | null
          designation_id?: number | null
          employment_type_id?: number | null
          gross_salary?: number | null
          id?: never
          notes?: string | null
          offer_date?: string | null
          offer_document_id?: number | null
          offer_status?: string
          owner_company_id?: number | null
          proposed_joining_date?: string | null
          requisition_id?: number | null
          updated_at?: string
          updated_by?: number | null
          valid_until?: string | null
        }
        Update: {
          approval_request_id?: number | null
          basic_salary?: number | null
          branch_id?: number | null
          candidate_id?: number
          created_at?: string
          created_by?: number | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: number | null
          department_id?: number | null
          designation_id?: number | null
          employment_type_id?: number | null
          gross_salary?: number | null
          id?: never
          notes?: string | null
          offer_date?: string | null
          offer_document_id?: number | null
          offer_status?: string
          owner_company_id?: number | null
          proposed_joining_date?: string | null
          requisition_id?: number | null
          updated_at?: string
          updated_by?: number | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_offers_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "employee_approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_offers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_offers_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_offers_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_offers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_offers_designation_id_fkey"
            columns: ["designation_id"]
            isOneToOne: false
            referencedRelation: "designations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_offers_employment_type_id_fkey"
            columns: ["employment_type_id"]
            isOneToOne: false
            referencedRelation: "hr_employment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_offers_offer_document_id_fkey"
            columns: ["offer_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_offers_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_offers_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_offers_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "hr_job_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_offers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_onboarding_tasks: {
        Row: {
          assigned_to: number | null
          candidate_id: number | null
          completed_at: string | null
          completed_by: number | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          dms_document_id: number | null
          due_date: string | null
          employee_id: number | null
          id: number
          notes: string | null
          related_record_id: number | null
          related_record_type: string | null
          task_category: string | null
          task_status: string
          task_title: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          assigned_to?: number | null
          candidate_id?: number | null
          completed_at?: string | null
          completed_by?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          due_date?: string | null
          employee_id?: number | null
          id?: never
          notes?: string | null
          related_record_id?: number | null
          related_record_type?: string | null
          task_category?: string | null
          task_status?: string
          task_title: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          assigned_to?: number | null
          candidate_id?: number | null
          completed_at?: string | null
          completed_by?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          dms_document_id?: number | null
          due_date?: string | null
          employee_id?: number | null
          id?: never
          notes?: string | null
          related_record_id?: number | null
          related_record_type?: string | null
          task_category?: string | null
          task_status?: string
          task_title?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_onboarding_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_onboarding_tasks_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_onboarding_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_onboarding_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_onboarding_tasks_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_onboarding_tasks_dms_document_id_fkey"
            columns: ["dms_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_onboarding_tasks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_onboarding_tasks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_payroll_groups: {
        Row: {
          code: string
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          description: string | null
          id: number
          is_active: boolean
          name_ar: string | null
          name_en: string
          pay_frequency: string
          sort_order: number
          updated_at: string
          updated_by: number | null
          wps_applicable_default: boolean
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en: string
          pay_frequency?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
          wps_applicable_default?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en?: string
          pay_frequency?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
          wps_applicable_default?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "hr_payroll_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_groups_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_payroll_groups_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_pro_process_types: {
        Row: {
          code: string
          created_at: string
          created_by: number | null
          default_due_days: number | null
          default_expiry_alert_days: number
          deleted_at: string | null
          deleted_by: number | null
          description: string | null
          id: number
          is_active: boolean
          name_ar: string | null
          name_en: string
          requires_dms_document: boolean
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: number | null
          default_due_days?: number | null
          default_expiry_alert_days?: number
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en: string
          requires_dms_document?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: number | null
          default_due_days?: number | null
          default_expiry_alert_days?: number
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en?: string
          requires_dms_document?: boolean
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_pro_process_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_pro_process_types_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_pro_process_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_readiness_rule_templates: {
        Row: {
          applies_to_category_id: number | null
          applies_to_designation_id: number | null
          applies_to_work_site_id: number | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          expiry_buffer_days: number
          id: number
          is_active: boolean
          is_critical: boolean
          readiness_dimension: string
          required_access_card_type_id: number | null
          required_document_type_id: number | null
          required_medical_record_type_id: number | null
          required_training_type_id: number | null
          requirement_type: string
          rule_code: string
          rule_name_ar: string | null
          rule_name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          applies_to_category_id?: number | null
          applies_to_designation_id?: number | null
          applies_to_work_site_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          expiry_buffer_days?: number
          id?: never
          is_active?: boolean
          is_critical?: boolean
          readiness_dimension: string
          required_access_card_type_id?: number | null
          required_document_type_id?: number | null
          required_medical_record_type_id?: number | null
          required_training_type_id?: number | null
          requirement_type: string
          rule_code: string
          rule_name_ar?: string | null
          rule_name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          applies_to_category_id?: number | null
          applies_to_designation_id?: number | null
          applies_to_work_site_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          expiry_buffer_days?: number
          id?: never
          is_active?: boolean
          is_critical?: boolean
          readiness_dimension?: string
          required_access_card_type_id?: number | null
          required_document_type_id?: number | null
          required_medical_record_type_id?: number | null
          required_training_type_id?: number | null
          requirement_type?: string
          rule_code?: string
          rule_name_ar?: string | null
          rule_name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_readiness_rule_templates_applies_to_category_id_fkey"
            columns: ["applies_to_category_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_readiness_rule_templates_applies_to_designation_id_fkey"
            columns: ["applies_to_designation_id"]
            isOneToOne: false
            referencedRelation: "designations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_readiness_rule_templates_applies_to_work_site_id_fkey"
            columns: ["applies_to_work_site_id"]
            isOneToOne: false
            referencedRelation: "work_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_readiness_rule_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_readiness_rule_templates_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_readiness_rule_templates_required_access_card_type_id_fkey"
            columns: ["required_access_card_type_id"]
            isOneToOne: false
            referencedRelation: "hr_access_card_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_readiness_rule_templates_required_document_type_id_fkey"
            columns: ["required_document_type_id"]
            isOneToOne: false
            referencedRelation: "hr_identity_document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_readiness_rule_templates_required_medical_record_type_i_fkey"
            columns: ["required_medical_record_type_id"]
            isOneToOne: false
            referencedRelation: "hr_medical_record_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_readiness_rule_templates_required_training_type_id_fkey"
            columns: ["required_training_type_id"]
            isOneToOne: false
            referencedRelation: "hr_training_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_readiness_rule_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_relationship_types: {
        Row: {
          code: string
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          description: string | null
          id: number
          is_active: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_relationship_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_relationship_types_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_relationship_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_role_requirement_matrix: {
        Row: {
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          designation_id: number | null
          employee_category_id: number | null
          id: number
          is_active: boolean
          is_required: boolean
          notes: string | null
          readiness_rule_template_id: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          designation_id?: number | null
          employee_category_id?: number | null
          id?: never
          is_active?: boolean
          is_required?: boolean
          notes?: string | null
          readiness_rule_template_id: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          designation_id?: number | null
          employee_category_id?: number | null
          id?: never
          is_active?: boolean
          is_required?: boolean
          notes?: string | null
          readiness_rule_template_id?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_role_requirement_matrix_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_role_requirement_matrix_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_role_requirement_matrix_designation_id_fkey"
            columns: ["designation_id"]
            isOneToOne: false
            referencedRelation: "designations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_role_requirement_matrix_employee_category_id_fkey"
            columns: ["employee_category_id"]
            isOneToOne: false
            referencedRelation: "hr_employee_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_role_requirement_matrix_readiness_rule_template_id_fkey"
            columns: ["readiness_rule_template_id"]
            isOneToOne: false
            referencedRelation: "hr_readiness_rule_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_role_requirement_matrix_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_salary_component_types: {
        Row: {
          code: string
          component_kind: string
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_basic: boolean
          is_taxable: boolean
          is_wps_component: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          code: string
          component_kind?: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_basic?: boolean
          is_taxable?: boolean
          is_wps_component?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          code?: string
          component_kind?: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_basic?: boolean
          is_taxable?: boolean
          is_wps_component?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_salary_component_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_salary_component_types_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_salary_component_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_site_requirement_matrix: {
        Row: {
          access_card_type_id: number | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          id: number
          is_active: boolean
          is_required: boolean
          medical_record_type_id: number | null
          notes: string | null
          readiness_rule_template_id: number | null
          training_type_id: number | null
          updated_at: string
          updated_by: number | null
          work_site_id: number | null
        }
        Insert: {
          access_card_type_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          id?: never
          is_active?: boolean
          is_required?: boolean
          medical_record_type_id?: number | null
          notes?: string | null
          readiness_rule_template_id?: number | null
          training_type_id?: number | null
          updated_at?: string
          updated_by?: number | null
          work_site_id?: number | null
        }
        Update: {
          access_card_type_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          id?: never
          is_active?: boolean
          is_required?: boolean
          medical_record_type_id?: number | null
          notes?: string | null
          readiness_rule_template_id?: number | null
          training_type_id?: number | null
          updated_at?: string
          updated_by?: number | null
          work_site_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_site_requirement_matrix_access_card_type_id_fkey"
            columns: ["access_card_type_id"]
            isOneToOne: false
            referencedRelation: "hr_access_card_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_site_requirement_matrix_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_site_requirement_matrix_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_site_requirement_matrix_medical_record_type_id_fkey"
            columns: ["medical_record_type_id"]
            isOneToOne: false
            referencedRelation: "hr_medical_record_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_site_requirement_matrix_readiness_rule_template_id_fkey"
            columns: ["readiness_rule_template_id"]
            isOneToOne: false
            referencedRelation: "hr_readiness_rule_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_site_requirement_matrix_training_type_id_fkey"
            columns: ["training_type_id"]
            isOneToOne: false
            referencedRelation: "hr_training_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_site_requirement_matrix_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_site_requirement_matrix_work_site_id_fkey"
            columns: ["work_site_id"]
            isOneToOne: false
            referencedRelation: "work_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_training_categories: {
        Row: {
          code: string
          created_at: string
          created_by: number | null
          deleted_at: string | null
          deleted_by: number | null
          description: string | null
          id: number
          is_active: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_training_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_training_categories_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_training_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_training_types: {
        Row: {
          code: string
          created_at: string
          created_by: number | null
          default_expiry_alert_days: number
          default_validity_months: number | null
          deleted_at: string | null
          deleted_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_designation_required: boolean
          is_site_required: boolean
          name_ar: string | null
          name_en: string
          requires_certificate_number: boolean
          requires_provider: boolean
          sort_order: number
          training_category_id: number | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: number | null
          default_expiry_alert_days?: number
          default_validity_months?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_designation_required?: boolean
          is_site_required?: boolean
          name_ar?: string | null
          name_en: string
          requires_certificate_number?: boolean
          requires_provider?: boolean
          sort_order?: number
          training_category_id?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: number | null
          default_expiry_alert_days?: number
          default_validity_months?: number | null
          deleted_at?: string | null
          deleted_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_designation_required?: boolean
          is_site_required?: boolean
          name_ar?: string | null
          name_en?: string
          requires_certificate_number?: boolean
          requires_provider?: boolean
          sort_order?: number
          training_category_id?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_training_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_training_types_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_training_types_training_category_id_fkey"
            columns: ["training_category_id"]
            isOneToOne: false
            referencedRelation: "hr_training_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_training_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          created_at: string | null
          error_log: Json | null
          filename: string
          id: string
          records_failed: number | null
          records_skipped: number | null
          records_success: number | null
          records_total: number | null
          status: string | null
          upload_date: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_log?: Json | null
          filename: string
          id?: string
          records_failed?: number | null
          records_skipped?: number | null
          records_success?: number | null
          records_total?: number | null
          status?: string | null
          upload_date?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_log?: Json | null
          filename?: string
          id?: string
          records_failed?: number | null
          records_skipped?: number | null
          records_success?: number | null
          records_total?: number | null
          status?: string | null
          upload_date?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      industry_sectors: {
        Row: {
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sector_code: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sector_code: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sector_code?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "industry_sectors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industry_sectors_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_methods: {
        Row: {
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          method_code: string
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          method_code: string
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          method_code?: string
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_methods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_methods_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_log: {
        Row: {
          created_at: string | null
          description: string
          downtime_hours: number | null
          id: string
          issue_date: string
          issue_type: string
          reported_by: string | null
          resolution: string | null
          resolved_date: string | null
          station_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          downtime_hours?: number | null
          id?: string
          issue_date?: string
          issue_type?: string
          reported_by?: string | null
          resolution?: string | null
          resolved_date?: string | null
          station_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          downtime_hours?: number | null
          id?: string
          issue_date?: string
          issue_type?: string
          reported_by?: string | null
          resolution?: string | null
          resolved_date?: string | null
          station_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_log_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          is_read: boolean
          metadata: Json | null
          title: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json | null
          title: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json | null
          title?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      operator_schedules: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_day_off: boolean
          notes: string | null
          operator_id: string | null
          schedule_date: string
          shift_duration: string | null
          shift_type: string | null
          station_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_day_off?: boolean
          notes?: string | null
          operator_id?: string | null
          schedule_date: string
          shift_duration?: string | null
          shift_type?: string | null
          station_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_day_off?: boolean
          notes?: string | null
          operator_id?: string | null
          schedule_date?: string
          shift_duration?: string | null
          shift_type?: string | null
          station_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operator_schedules_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operator_schedules_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      operators: {
        Row: {
          card_number: string
          created_at: string | null
          email: string | null
          id: string
          id_number: string | null
          name: string
          national_number: string | null
          notes: string | null
          phone_number: string | null
          photo_url: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          card_number: string
          created_at?: string | null
          email?: string | null
          id?: string
          id_number?: string | null
          name: string
          national_number?: string | null
          notes?: string | null
          phone_number?: string | null
          photo_url?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          card_number?: string
          created_at?: string | null
          email?: string | null
          id?: string
          id_number?: string | null
          name?: string
          national_number?: string | null
          notes?: string | null
          phone_number?: string | null
          photo_url?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      owner_companies: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          adnoc_supplier_no: string | null
          area: string | null
          area_zone_id: number | null
          chamber_membership_expiry_date: string | null
          chamber_membership_no: string | null
          city: string | null
          city_id: number | null
          company_code: string
          compliance_status: string | null
          corporate_tax_no: string | null
          corporate_tax_registered: boolean | null
          country: string | null
          country_id: number | null
          created_at: string
          created_by: number | null
          default_bank_id: number | null
          default_currency: string
          default_letter_template_id: number | null
          default_report_template_id: number | null
          default_tax_type_id: number | null
          emirate: string | null
          emirate_id: number | null
          established_date: string | null
          icv_certificate_no: string | null
          icv_expiry_date: string | null
          icv_issue_date: string | null
          icv_score: number | null
          id: number
          internal_reference_number: string | null
          legal_form: string | null
          legal_name_ar: string | null
          legal_name_en: string
          licensing_authority: string | null
          logo_url: string | null
          main_activity: string | null
          makani_number: string | null
          notes: string | null
          office_address_line_1: string | null
          office_address_line_2: string | null
          office_city_id: number | null
          office_emirate_id: number | null
          po_box: string | null
          primary_email: string | null
          primary_phone: string | null
          report_footer_text_ar: string | null
          report_footer_text_en: string | null
          report_signatory_name: string | null
          report_signatory_title_ar: string | null
          report_signatory_title_en: string | null
          report_theme_primary_color: string | null
          report_theme_secondary_color: string | null
          short_name: string | null
          signature_url: string | null
          small_logo_url: string | null
          stamp_url: string | null
          status: string
          trade_license_expiry_date: string | null
          trade_license_issue_date: string | null
          trade_license_no: string | null
          trade_name: string | null
          trn: string | null
          updated_at: string
          updated_by: number | null
          vat_registered: boolean | null
          watermark_url: string | null
          website: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          adnoc_supplier_no?: string | null
          area?: string | null
          area_zone_id?: number | null
          chamber_membership_expiry_date?: string | null
          chamber_membership_no?: string | null
          city?: string | null
          city_id?: number | null
          company_code: string
          compliance_status?: string | null
          corporate_tax_no?: string | null
          corporate_tax_registered?: boolean | null
          country?: string | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          default_bank_id?: number | null
          default_currency?: string
          default_letter_template_id?: number | null
          default_report_template_id?: number | null
          default_tax_type_id?: number | null
          emirate?: string | null
          emirate_id?: number | null
          established_date?: string | null
          icv_certificate_no?: string | null
          icv_expiry_date?: string | null
          icv_issue_date?: string | null
          icv_score?: number | null
          id?: number
          internal_reference_number?: string | null
          legal_form?: string | null
          legal_name_ar?: string | null
          legal_name_en: string
          licensing_authority?: string | null
          logo_url?: string | null
          main_activity?: string | null
          makani_number?: string | null
          notes?: string | null
          office_address_line_1?: string | null
          office_address_line_2?: string | null
          office_city_id?: number | null
          office_emirate_id?: number | null
          po_box?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          report_footer_text_ar?: string | null
          report_footer_text_en?: string | null
          report_signatory_name?: string | null
          report_signatory_title_ar?: string | null
          report_signatory_title_en?: string | null
          report_theme_primary_color?: string | null
          report_theme_secondary_color?: string | null
          short_name?: string | null
          signature_url?: string | null
          small_logo_url?: string | null
          stamp_url?: string | null
          status?: string
          trade_license_expiry_date?: string | null
          trade_license_issue_date?: string | null
          trade_license_no?: string | null
          trade_name?: string | null
          trn?: string | null
          updated_at?: string
          updated_by?: number | null
          vat_registered?: boolean | null
          watermark_url?: string | null
          website?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          adnoc_supplier_no?: string | null
          area?: string | null
          area_zone_id?: number | null
          chamber_membership_expiry_date?: string | null
          chamber_membership_no?: string | null
          city?: string | null
          city_id?: number | null
          company_code?: string
          compliance_status?: string | null
          corporate_tax_no?: string | null
          corporate_tax_registered?: boolean | null
          country?: string | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          default_bank_id?: number | null
          default_currency?: string
          default_letter_template_id?: number | null
          default_report_template_id?: number | null
          default_tax_type_id?: number | null
          emirate?: string | null
          emirate_id?: number | null
          established_date?: string | null
          icv_certificate_no?: string | null
          icv_expiry_date?: string | null
          icv_issue_date?: string | null
          icv_score?: number | null
          id?: number
          internal_reference_number?: string | null
          legal_form?: string | null
          legal_name_ar?: string | null
          legal_name_en?: string
          licensing_authority?: string | null
          logo_url?: string | null
          main_activity?: string | null
          makani_number?: string | null
          notes?: string | null
          office_address_line_1?: string | null
          office_address_line_2?: string | null
          office_city_id?: number | null
          office_emirate_id?: number | null
          po_box?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          report_footer_text_ar?: string | null
          report_footer_text_en?: string | null
          report_signatory_name?: string | null
          report_signatory_title_ar?: string | null
          report_signatory_title_en?: string | null
          report_theme_primary_color?: string | null
          report_theme_secondary_color?: string | null
          short_name?: string | null
          signature_url?: string | null
          small_logo_url?: string | null
          stamp_url?: string | null
          status?: string
          trade_license_expiry_date?: string | null
          trade_license_issue_date?: string | null
          trade_license_no?: string | null
          trade_name?: string | null
          trn?: string | null
          updated_at?: string
          updated_by?: number | null
          vat_registered?: boolean | null
          watermark_url?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_owner_companies_default_letter_template"
            columns: ["default_letter_template_id"]
            isOneToOne: false
            referencedRelation: "erp_report_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_owner_companies_default_report_template"
            columns: ["default_report_template_id"]
            isOneToOne: false
            referencedRelation: "erp_report_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_companies_area_zone_id_fkey"
            columns: ["area_zone_id"]
            isOneToOne: false
            referencedRelation: "areas_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_companies_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_companies_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_companies_default_bank_id_fkey"
            columns: ["default_bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_companies_default_tax_type_id_fkey"
            columns: ["default_tax_type_id"]
            isOneToOne: false
            referencedRelation: "tax_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_companies_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_companies_office_city_id_fkey"
            columns: ["office_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_companies_office_emirate_id_fkey"
            columns: ["office_emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_company_signatories: {
        Row: {
          company_id: number
          created_at: string
          created_by: number | null
          deleted_at: string | null
          designation: string | null
          effective_from: string | null
          effective_to: string | null
          full_name: string
          id: number
          is_active: boolean
          is_primary: boolean
          notes: string | null
          signature_scope: string | null
          updated_at: string
          updated_by: number | null
          user_id: number | null
        }
        Insert: {
          company_id: number
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          designation?: string | null
          effective_from?: string | null
          effective_to?: string | null
          full_name: string
          id?: never
          is_active?: boolean
          is_primary?: boolean
          notes?: string | null
          signature_scope?: string | null
          updated_at?: string
          updated_by?: number | null
          user_id?: number | null
        }
        Update: {
          company_id?: number
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          designation?: string | null
          effective_from?: string | null
          effective_to?: string | null
          full_name?: string
          id?: never
          is_active?: boolean
          is_primary?: boolean
          notes?: string | null
          signature_scope?: string | null
          updated_at?: string
          updated_by?: number | null
          user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_company_signatories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_company_signatories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_company_signatories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_company_signatories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_company_signatories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parties: {
        Row: {
          alternate_email: string | null
          area_zone_id: number | null
          city_id: number | null
          country_id: number
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          display_name: string
          emirate_id: number | null
          full_address_text: string | null
          google_map_url: string | null
          id: number
          is_active: boolean
          is_locked: boolean
          is_system: boolean
          latitude: number | null
          legal_name_ar: string | null
          legal_name_en: string
          longitude: number | null
          main_email: string | null
          main_mobile: string | null
          main_phone: string | null
          parent_party_id: number | null
          party_code: string
          party_nature_id: number
          party_status_id: number
          po_box: string | null
          primary_party_type_id: number | null
          remarks: string | null
          short_name: string | null
          trade_name_ar: string | null
          trade_name_en: string | null
          updated_at: string
          updated_by: number | null
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          alternate_email?: string | null
          area_zone_id?: number | null
          city_id?: number | null
          country_id: number
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          display_name: string
          emirate_id?: number | null
          full_address_text?: string | null
          google_map_url?: string | null
          id?: never
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          latitude?: number | null
          legal_name_ar?: string | null
          legal_name_en: string
          longitude?: number | null
          main_email?: string | null
          main_mobile?: string | null
          main_phone?: string | null
          parent_party_id?: number | null
          party_code: string
          party_nature_id: number
          party_status_id: number
          po_box?: string | null
          primary_party_type_id?: number | null
          remarks?: string | null
          short_name?: string | null
          trade_name_ar?: string | null
          trade_name_en?: string | null
          updated_at?: string
          updated_by?: number | null
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          alternate_email?: string | null
          area_zone_id?: number | null
          city_id?: number | null
          country_id?: number
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          display_name?: string
          emirate_id?: number | null
          full_address_text?: string | null
          google_map_url?: string | null
          id?: never
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          latitude?: number | null
          legal_name_ar?: string | null
          legal_name_en?: string
          longitude?: number | null
          main_email?: string | null
          main_mobile?: string | null
          main_phone?: string | null
          parent_party_id?: number | null
          party_code?: string
          party_nature_id?: number
          party_status_id?: number
          po_box?: string | null
          primary_party_type_id?: number | null
          remarks?: string | null
          short_name?: string | null
          trade_name_ar?: string | null
          trade_name_en?: string | null
          updated_at?: string
          updated_by?: number | null
          website?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parties_area_zone_id_fkey"
            columns: ["area_zone_id"]
            isOneToOne: false
            referencedRelation: "areas_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parties_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parties_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parties_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parties_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parties_parent_party_id_fkey"
            columns: ["parent_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parties_party_nature_id_fkey"
            columns: ["party_nature_id"]
            isOneToOne: false
            referencedRelation: "party_natures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parties_party_status_id_fkey"
            columns: ["party_status_id"]
            isOneToOne: false
            referencedRelation: "party_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parties_primary_party_type_id_fkey"
            columns: ["primary_party_type_id"]
            isOneToOne: false
            referencedRelation: "party_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parties_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_address_types: {
        Row: {
          address_type_code: string
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          address_type_code: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          address_type_code?: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_address_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_address_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_addresses: {
        Row: {
          address_code: string
          address_name: string | null
          address_type_id: number
          area_zone_id: number | null
          building: string | null
          city_id: number | null
          country_id: number
          created_at: string
          created_by: number | null
          emirate_id: number | null
          floor: string | null
          google_map_url: string | null
          id: number
          is_active: boolean
          is_billing_address: boolean
          is_primary: boolean
          is_shipping_address: boolean
          is_site_address: boolean
          landmark: string | null
          latitude: number | null
          longitude: number | null
          notes: string | null
          office_no: string | null
          party_id: number
          po_box: string | null
          street: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          address_code: string
          address_name?: string | null
          address_type_id: number
          area_zone_id?: number | null
          building?: string | null
          city_id?: number | null
          country_id: number
          created_at?: string
          created_by?: number | null
          emirate_id?: number | null
          floor?: string | null
          google_map_url?: string | null
          id?: never
          is_active?: boolean
          is_billing_address?: boolean
          is_primary?: boolean
          is_shipping_address?: boolean
          is_site_address?: boolean
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          office_no?: string | null
          party_id: number
          po_box?: string | null
          street?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          address_code?: string
          address_name?: string | null
          address_type_id?: number
          area_zone_id?: number | null
          building?: string | null
          city_id?: number | null
          country_id?: number
          created_at?: string
          created_by?: number | null
          emirate_id?: number | null
          floor?: string | null
          google_map_url?: string | null
          id?: never
          is_active?: boolean
          is_billing_address?: boolean
          is_primary?: boolean
          is_shipping_address?: boolean
          is_site_address?: boolean
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          office_no?: string | null
          party_id?: number
          po_box?: string | null
          street?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_addresses_address_type_id_fkey"
            columns: ["address_type_id"]
            isOneToOne: false
            referencedRelation: "party_address_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_addresses_area_zone_id_fkey"
            columns: ["area_zone_id"]
            isOneToOne: false
            referencedRelation: "areas_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_addresses_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_addresses_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_addresses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_addresses_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_addresses_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_addresses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_approval_statuses: {
        Row: {
          approval_status_code: string
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          approval_status_code: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          approval_status_code?: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_approval_statuses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_approval_statuses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_bank_details: {
        Row: {
          account_holder_name: string
          account_number: string | null
          bank_detail_code: string
          bank_id: number | null
          bank_name_text: string | null
          branch_name: string | null
          country_id: number | null
          created_at: string
          created_by: number | null
          currency_id: number | null
          iban: string | null
          id: number
          is_active: boolean
          is_primary: boolean
          is_verified: boolean
          party_id: number
          remarks: string | null
          swift_code: string | null
          updated_at: string
          updated_by: number | null
          verification_document_id: number | null
          verified_at: string | null
          verified_by: number | null
        }
        Insert: {
          account_holder_name: string
          account_number?: string | null
          bank_detail_code: string
          bank_id?: number | null
          bank_name_text?: string | null
          branch_name?: string | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          currency_id?: number | null
          iban?: string | null
          id?: never
          is_active?: boolean
          is_primary?: boolean
          is_verified?: boolean
          party_id: number
          remarks?: string | null
          swift_code?: string | null
          updated_at?: string
          updated_by?: number | null
          verification_document_id?: number | null
          verified_at?: string | null
          verified_by?: number | null
        }
        Update: {
          account_holder_name?: string
          account_number?: string | null
          bank_detail_code?: string
          bank_id?: number | null
          bank_name_text?: string | null
          branch_name?: string | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          currency_id?: number | null
          iban?: string | null
          id?: never
          is_active?: boolean
          is_primary?: boolean
          is_verified?: boolean
          party_id?: number
          remarks?: string | null
          swift_code?: string | null
          updated_at?: string
          updated_by?: number | null
          verification_document_id?: number | null
          verified_at?: string | null
          verified_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_bank_details_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_bank_details_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_bank_details_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_bank_details_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_bank_details_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_bank_details_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_bank_details_verification_document_id_fkey"
            columns: ["verification_document_id"]
            isOneToOne: false
            referencedRelation: "party_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_bank_details_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_blacklist_statuses: {
        Row: {
          blacklist_status_code: string
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          blacklist_status_code: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          blacklist_status_code?: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_blacklist_statuses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_blacklist_statuses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_compliance_profiles: {
        Row: {
          approved_at: string | null
          approved_by: number | null
          blacklist_reason: string | null
          blacklist_status_id: number | null
          created_at: string
          created_by: number | null
          credit_rating_id: number | null
          customer_approval_status_id: number | null
          finance_approval_status_id: number | null
          hse_approval_status_id: number | null
          id: number
          kyc_status_id: number | null
          last_review_date: string | null
          legal_approval_status_id: number | null
          next_review_date: string | null
          party_id: number
          payment_hold: boolean
          payment_hold_reason: string | null
          remarks: string | null
          risk_rating_id: number | null
          subcontractor_approval_status_id: number | null
          updated_at: string
          updated_by: number | null
          vendor_approval_status_id: number | null
          work_hold: boolean
          work_hold_reason: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: number | null
          blacklist_reason?: string | null
          blacklist_status_id?: number | null
          created_at?: string
          created_by?: number | null
          credit_rating_id?: number | null
          customer_approval_status_id?: number | null
          finance_approval_status_id?: number | null
          hse_approval_status_id?: number | null
          id?: never
          kyc_status_id?: number | null
          last_review_date?: string | null
          legal_approval_status_id?: number | null
          next_review_date?: string | null
          party_id: number
          payment_hold?: boolean
          payment_hold_reason?: string | null
          remarks?: string | null
          risk_rating_id?: number | null
          subcontractor_approval_status_id?: number | null
          updated_at?: string
          updated_by?: number | null
          vendor_approval_status_id?: number | null
          work_hold?: boolean
          work_hold_reason?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: number | null
          blacklist_reason?: string | null
          blacklist_status_id?: number | null
          created_at?: string
          created_by?: number | null
          credit_rating_id?: number | null
          customer_approval_status_id?: number | null
          finance_approval_status_id?: number | null
          hse_approval_status_id?: number | null
          id?: never
          kyc_status_id?: number | null
          last_review_date?: string | null
          legal_approval_status_id?: number | null
          next_review_date?: string | null
          party_id?: number
          payment_hold?: boolean
          payment_hold_reason?: string | null
          remarks?: string | null
          risk_rating_id?: number | null
          subcontractor_approval_status_id?: number | null
          updated_at?: string
          updated_by?: number | null
          vendor_approval_status_id?: number | null
          work_hold?: boolean
          work_hold_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "party_compliance_profiles_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_compliance_profiles_blacklist_status_id_fkey"
            columns: ["blacklist_status_id"]
            isOneToOne: false
            referencedRelation: "party_blacklist_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_compliance_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_compliance_profiles_credit_rating_id_fkey"
            columns: ["credit_rating_id"]
            isOneToOne: false
            referencedRelation: "party_credit_ratings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_compliance_profiles_customer_approval_status_id_fkey"
            columns: ["customer_approval_status_id"]
            isOneToOne: false
            referencedRelation: "party_approval_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_compliance_profiles_finance_approval_status_id_fkey"
            columns: ["finance_approval_status_id"]
            isOneToOne: false
            referencedRelation: "party_approval_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_compliance_profiles_hse_approval_status_id_fkey"
            columns: ["hse_approval_status_id"]
            isOneToOne: false
            referencedRelation: "party_approval_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_compliance_profiles_kyc_status_id_fkey"
            columns: ["kyc_status_id"]
            isOneToOne: false
            referencedRelation: "party_compliance_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_compliance_profiles_legal_approval_status_id_fkey"
            columns: ["legal_approval_status_id"]
            isOneToOne: false
            referencedRelation: "party_approval_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_compliance_profiles_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: true
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_compliance_profiles_risk_rating_id_fkey"
            columns: ["risk_rating_id"]
            isOneToOne: false
            referencedRelation: "party_risk_ratings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_compliance_profiles_subcontractor_approval_status_id_fkey"
            columns: ["subcontractor_approval_status_id"]
            isOneToOne: false
            referencedRelation: "party_approval_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_compliance_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_compliance_profiles_vendor_approval_status_id_fkey"
            columns: ["vendor_approval_status_id"]
            isOneToOne: false
            referencedRelation: "party_approval_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      party_compliance_statuses: {
        Row: {
          compliance_status_code: string
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          compliance_status_code: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          compliance_status_code?: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_compliance_statuses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_compliance_statuses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_consultant_profiles: {
        Row: {
          approved_for_design: boolean
          approved_for_supervision: boolean
          consultant_remarks: string | null
          consultant_type_id: number | null
          created_at: string
          created_by: number | null
          id: number
          party_id: number
          professional_license_required: boolean
          specialization_id: number | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          approved_for_design?: boolean
          approved_for_supervision?: boolean
          consultant_remarks?: string | null
          consultant_type_id?: number | null
          created_at?: string
          created_by?: number | null
          id?: never
          party_id: number
          professional_license_required?: boolean
          specialization_id?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          approved_for_design?: boolean
          approved_for_supervision?: boolean
          consultant_remarks?: string | null
          consultant_type_id?: number | null
          created_at?: string
          created_by?: number | null
          id?: never
          party_id?: number
          professional_license_required?: boolean
          specialization_id?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_consultant_profiles_consultant_type_id_fkey"
            columns: ["consultant_type_id"]
            isOneToOne: false
            referencedRelation: "consultant_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_consultant_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_consultant_profiles_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: true
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_consultant_profiles_specialization_id_fkey"
            columns: ["specialization_id"]
            isOneToOne: false
            referencedRelation: "consultant_specializations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_consultant_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_contact_departments: {
        Row: {
          contact_department_code: string
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          contact_department_code: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          contact_department_code?: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_contact_departments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_contact_departments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_contact_roles: {
        Row: {
          contact_role_code: string
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          contact_role_code: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          contact_role_code?: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_contact_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_contact_roles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_contacts: {
        Row: {
          contact_code: string
          contact_role_id: number | null
          created_at: string
          created_by: number | null
          department_id: number | null
          designation: string | null
          email: string | null
          full_name: string
          id: number
          is_accounts_contact: boolean
          is_active: boolean
          is_documents_contact: boolean
          is_hse_contact: boolean
          is_operations_contact: boolean
          is_primary: boolean
          is_sales_contact: boolean
          mobile: string | null
          notes: string | null
          party_id: number
          phone: string | null
          updated_at: string
          updated_by: number | null
          whatsapp: string | null
        }
        Insert: {
          contact_code: string
          contact_role_id?: number | null
          created_at?: string
          created_by?: number | null
          department_id?: number | null
          designation?: string | null
          email?: string | null
          full_name: string
          id?: never
          is_accounts_contact?: boolean
          is_active?: boolean
          is_documents_contact?: boolean
          is_hse_contact?: boolean
          is_operations_contact?: boolean
          is_primary?: boolean
          is_sales_contact?: boolean
          mobile?: string | null
          notes?: string | null
          party_id: number
          phone?: string | null
          updated_at?: string
          updated_by?: number | null
          whatsapp?: string | null
        }
        Update: {
          contact_code?: string
          contact_role_id?: number | null
          created_at?: string
          created_by?: number | null
          department_id?: number | null
          designation?: string | null
          email?: string | null
          full_name?: string
          id?: never
          is_accounts_contact?: boolean
          is_active?: boolean
          is_documents_contact?: boolean
          is_hse_contact?: boolean
          is_operations_contact?: boolean
          is_primary?: boolean
          is_sales_contact?: boolean
          mobile?: string | null
          notes?: string | null
          party_id?: number
          phone?: string | null
          updated_at?: string
          updated_by?: number | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "party_contacts_contact_role_id_fkey"
            columns: ["contact_role_id"]
            isOneToOne: false
            referencedRelation: "party_contact_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_contacts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "party_contact_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_contacts_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_contacts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_credit_ratings: {
        Row: {
          created_at: string
          created_by: number | null
          credit_rating_code: string
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          credit_rating_code: string
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          credit_rating_code?: string
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_credit_ratings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_credit_ratings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_customer_profiles: {
        Row: {
          created_at: string
          created_by: number | null
          credit_currency_id: number | null
          credit_limit: number | null
          customer_category_id: number | null
          customer_remarks: string | null
          customer_status_id: number | null
          id: number
          industry_sector_id: number | null
          party_id: number
          payment_term_id: number | null
          preferred_invoice_method_id: number | null
          requires_contract: boolean
          requires_lpo: boolean
          sales_owner_user_id: number | null
          sales_region_id: number | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          credit_currency_id?: number | null
          credit_limit?: number | null
          customer_category_id?: number | null
          customer_remarks?: string | null
          customer_status_id?: number | null
          id?: never
          industry_sector_id?: number | null
          party_id: number
          payment_term_id?: number | null
          preferred_invoice_method_id?: number | null
          requires_contract?: boolean
          requires_lpo?: boolean
          sales_owner_user_id?: number | null
          sales_region_id?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          credit_currency_id?: number | null
          credit_limit?: number | null
          customer_category_id?: number | null
          customer_remarks?: string | null
          customer_status_id?: number | null
          id?: never
          industry_sector_id?: number | null
          party_id?: number
          payment_term_id?: number | null
          preferred_invoice_method_id?: number | null
          requires_contract?: boolean
          requires_lpo?: boolean
          sales_owner_user_id?: number | null
          sales_region_id?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_customer_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_customer_profiles_credit_currency_id_fkey"
            columns: ["credit_currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_customer_profiles_customer_category_id_fkey"
            columns: ["customer_category_id"]
            isOneToOne: false
            referencedRelation: "customer_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_customer_profiles_customer_status_id_fkey"
            columns: ["customer_status_id"]
            isOneToOne: false
            referencedRelation: "customer_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_customer_profiles_industry_sector_id_fkey"
            columns: ["industry_sector_id"]
            isOneToOne: false
            referencedRelation: "industry_sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_customer_profiles_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: true
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_customer_profiles_payment_term_id_fkey"
            columns: ["payment_term_id"]
            isOneToOne: false
            referencedRelation: "payment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_customer_profiles_preferred_invoice_method_id_fkey"
            columns: ["preferred_invoice_method_id"]
            isOneToOne: false
            referencedRelation: "invoice_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_customer_profiles_sales_owner_user_id_fkey"
            columns: ["sales_owner_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_customer_profiles_sales_region_id_fkey"
            columns: ["sales_region_id"]
            isOneToOne: false
            referencedRelation: "sales_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_customer_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_document_statuses: {
        Row: {
          created_at: string
          created_by: number | null
          description: string | null
          document_status_code: string
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          document_status_code: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          document_status_code?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_document_statuses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_document_statuses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_document_types: {
        Row: {
          created_at: string
          created_by: number | null
          description: string | null
          document_type_code: string
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          document_type_code: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          document_type_code?: string
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_document_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_document_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_documents: {
        Row: {
          created_at: string
          created_by: number | null
          dms_document_id: number | null
          document_code: string
          document_number: string | null
          document_status_id: number
          document_title: string
          document_type_id: number
          expiry_date: string | null
          expiry_required: boolean
          file_mime_type: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          id: number
          issue_date: string | null
          issuing_authority_party_id: number | null
          party_id: number
          remarks: string | null
          renewal_notice_days: number | null
          updated_at: string
          updated_by: number | null
          uploaded_at: string | null
          uploaded_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          dms_document_id?: number | null
          document_code: string
          document_number?: string | null
          document_status_id: number
          document_title: string
          document_type_id: number
          expiry_date?: string | null
          expiry_required?: boolean
          file_mime_type?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: never
          issue_date?: string | null
          issuing_authority_party_id?: number | null
          party_id: number
          remarks?: string | null
          renewal_notice_days?: number | null
          updated_at?: string
          updated_by?: number | null
          uploaded_at?: string | null
          uploaded_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          dms_document_id?: number | null
          document_code?: string
          document_number?: string | null
          document_status_id?: number
          document_title?: string
          document_type_id?: number
          expiry_date?: string | null
          expiry_required?: boolean
          file_mime_type?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: never
          issue_date?: string | null
          issuing_authority_party_id?: number | null
          party_id?: number
          remarks?: string | null
          renewal_notice_days?: number | null
          updated_at?: string
          updated_by?: number | null
          uploaded_at?: string | null
          uploaded_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_documents_dms_document_id_fkey"
            columns: ["dms_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_documents_document_status_id_fkey"
            columns: ["document_status_id"]
            isOneToOne: false
            referencedRelation: "party_document_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "party_document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_documents_issuing_authority_party_id_fkey"
            columns: ["issuing_authority_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_documents_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_finance_profiles: {
        Row: {
          created_at: string
          created_by: number | null
          credit_currency_id: number | null
          credit_limit: number | null
          default_currency_id: number | null
          default_payment_method_id: number | null
          default_payment_term_id: number | null
          finance_hold: boolean
          finance_hold_at: string | null
          finance_hold_by: number | null
          finance_hold_reason: string | null
          finance_remarks: string | null
          id: number
          party_id: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          credit_currency_id?: number | null
          credit_limit?: number | null
          default_currency_id?: number | null
          default_payment_method_id?: number | null
          default_payment_term_id?: number | null
          finance_hold?: boolean
          finance_hold_at?: string | null
          finance_hold_by?: number | null
          finance_hold_reason?: string | null
          finance_remarks?: string | null
          id?: never
          party_id: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          credit_currency_id?: number | null
          credit_limit?: number | null
          default_currency_id?: number | null
          default_payment_method_id?: number | null
          default_payment_term_id?: number | null
          finance_hold?: boolean
          finance_hold_at?: string | null
          finance_hold_by?: number | null
          finance_hold_reason?: string | null
          finance_remarks?: string | null
          id?: never
          party_id?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_finance_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_finance_profiles_credit_currency_id_fkey"
            columns: ["credit_currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_finance_profiles_default_currency_id_fkey"
            columns: ["default_currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_finance_profiles_default_payment_method_id_fkey"
            columns: ["default_payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_finance_profiles_default_payment_term_id_fkey"
            columns: ["default_payment_term_id"]
            isOneToOne: false
            referencedRelation: "payment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_finance_profiles_finance_hold_by_fkey"
            columns: ["finance_hold_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_finance_profiles_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: true
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_finance_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_government_authority_profiles: {
        Row: {
          authority_type_id: number | null
          created_at: string
          created_by: number | null
          government_remarks: string | null
          id: number
          jurisdiction_country_id: number | null
          jurisdiction_emirate_id: number | null
          party_id: number
          portal_url: string | null
          portal_username_reference: string | null
          service_category_id: number | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          authority_type_id?: number | null
          created_at?: string
          created_by?: number | null
          government_remarks?: string | null
          id?: never
          jurisdiction_country_id?: number | null
          jurisdiction_emirate_id?: number | null
          party_id: number
          portal_url?: string | null
          portal_username_reference?: string | null
          service_category_id?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          authority_type_id?: number | null
          created_at?: string
          created_by?: number | null
          government_remarks?: string | null
          id?: never
          jurisdiction_country_id?: number | null
          jurisdiction_emirate_id?: number | null
          party_id?: number
          portal_url?: string | null
          portal_username_reference?: string | null
          service_category_id?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_government_authority_profile_jurisdiction_country_id_fkey"
            columns: ["jurisdiction_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_government_authority_profile_jurisdiction_emirate_id_fkey"
            columns: ["jurisdiction_emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_government_authority_profiles_authority_type_id_fkey"
            columns: ["authority_type_id"]
            isOneToOne: false
            referencedRelation: "authority_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_government_authority_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_government_authority_profiles_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: true
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_government_authority_profiles_service_category_id_fkey"
            columns: ["service_category_id"]
            isOneToOne: false
            referencedRelation: "party_service_categories_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_government_authority_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_license_statuses: {
        Row: {
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          license_status_code: string
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          license_status_code: string
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          license_status_code?: string
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_license_statuses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_license_statuses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_license_types: {
        Row: {
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          license_type_code: string
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          license_type_code: string
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          license_type_code?: string
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_license_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_license_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_licenses: {
        Row: {
          created_at: string
          created_by: number | null
          dms_license_document_id: number | null
          expiry_date: string | null
          id: number
          is_active: boolean
          is_primary: boolean
          issue_date: string | null
          issuing_authority_party_id: number | null
          issuing_country_id: number | null
          issuing_emirate_id: number | null
          license_activity_text: string | null
          license_code: string
          license_document_id: number | null
          license_name: string | null
          license_number: string
          license_status_id: number
          license_type_id: number
          party_id: number
          remarks: string | null
          renewal_notice_days: number | null
          renewal_required: boolean
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          dms_license_document_id?: number | null
          expiry_date?: string | null
          id?: never
          is_active?: boolean
          is_primary?: boolean
          issue_date?: string | null
          issuing_authority_party_id?: number | null
          issuing_country_id?: number | null
          issuing_emirate_id?: number | null
          license_activity_text?: string | null
          license_code: string
          license_document_id?: number | null
          license_name?: string | null
          license_number: string
          license_status_id: number
          license_type_id: number
          party_id: number
          remarks?: string | null
          renewal_notice_days?: number | null
          renewal_required?: boolean
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          dms_license_document_id?: number | null
          expiry_date?: string | null
          id?: never
          is_active?: boolean
          is_primary?: boolean
          issue_date?: string | null
          issuing_authority_party_id?: number | null
          issuing_country_id?: number | null
          issuing_emirate_id?: number | null
          license_activity_text?: string | null
          license_code?: string
          license_document_id?: number | null
          license_name?: string | null
          license_number?: string
          license_status_id?: number
          license_type_id?: number
          party_id?: number
          remarks?: string | null
          renewal_notice_days?: number | null
          renewal_required?: boolean
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_licenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_licenses_dms_license_document_id_fkey"
            columns: ["dms_license_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_licenses_issuing_authority_party_id_fkey"
            columns: ["issuing_authority_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_licenses_issuing_country_id_fkey"
            columns: ["issuing_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_licenses_issuing_emirate_id_fkey"
            columns: ["issuing_emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_licenses_license_document_id_fkey"
            columns: ["license_document_id"]
            isOneToOne: false
            referencedRelation: "party_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_licenses_license_status_id_fkey"
            columns: ["license_status_id"]
            isOneToOne: false
            referencedRelation: "party_license_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_licenses_license_type_id_fkey"
            columns: ["license_type_id"]
            isOneToOne: false
            referencedRelation: "party_license_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_licenses_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_licenses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_natures: {
        Row: {
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          nature_code: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          nature_code: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          nature_code?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_natures_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_natures_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_note_types: {
        Row: {
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          note_type_code: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          note_type_code: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          note_type_code?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_note_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_note_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_notes: {
        Row: {
          created_at: string
          created_by: number | null
          follow_up_date: string | null
          id: number
          is_private: boolean
          note_body: string
          note_code: string
          note_title: string | null
          note_type_id: number | null
          party_id: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          follow_up_date?: string | null
          id?: never
          is_private?: boolean
          note_body: string
          note_code: string
          note_title?: string | null
          note_type_id?: number | null
          party_id: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          follow_up_date?: string | null
          id?: never
          is_private?: boolean
          note_body?: string
          note_code?: string
          note_title?: string | null
          note_type_id?: number | null
          party_id?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_notes_note_type_id_fkey"
            columns: ["note_type_id"]
            isOneToOne: false
            referencedRelation: "party_note_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_notes_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_recruitment_agency_profiles: {
        Row: {
          agreement_expiry_date: string | null
          agreement_required: boolean
          approved_for_hiring: boolean
          created_at: string
          created_by: number | null
          id: number
          party_id: number
          recruitment_category_id: number | null
          recruitment_remarks: string | null
          service_fee_terms: string | null
          source_country_id: number | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          agreement_expiry_date?: string | null
          agreement_required?: boolean
          approved_for_hiring?: boolean
          created_at?: string
          created_by?: number | null
          id?: never
          party_id: number
          recruitment_category_id?: number | null
          recruitment_remarks?: string | null
          service_fee_terms?: string | null
          source_country_id?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          agreement_expiry_date?: string | null
          agreement_required?: boolean
          approved_for_hiring?: boolean
          created_at?: string
          created_by?: number | null
          id?: never
          party_id?: number
          recruitment_category_id?: number | null
          recruitment_remarks?: string | null
          service_fee_terms?: string | null
          source_country_id?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_recruitment_agency_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_recruitment_agency_profiles_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: true
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_recruitment_agency_profiles_recruitment_category_id_fkey"
            columns: ["recruitment_category_id"]
            isOneToOne: false
            referencedRelation: "recruitment_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_recruitment_agency_profiles_source_country_id_fkey"
            columns: ["source_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_recruitment_agency_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_relationship_types: {
        Row: {
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          relationship_code: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          relationship_code: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          relationship_code?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_relationship_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_relationship_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_relationships: {
        Row: {
          child_party_id: number
          created_at: string
          created_by: number | null
          effective_from: string | null
          effective_to: string | null
          id: number
          is_active: boolean
          parent_party_id: number
          relationship_type_id: number
          remarks: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          child_party_id: number
          created_at?: string
          created_by?: number | null
          effective_from?: string | null
          effective_to?: string | null
          id?: never
          is_active?: boolean
          parent_party_id: number
          relationship_type_id: number
          remarks?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          child_party_id?: number
          created_at?: string
          created_by?: number | null
          effective_from?: string | null
          effective_to?: string | null
          id?: never
          is_active?: boolean
          parent_party_id?: number
          relationship_type_id?: number
          remarks?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_relationships_child_party_id_fkey"
            columns: ["child_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_relationships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_relationships_parent_party_id_fkey"
            columns: ["parent_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_relationships_relationship_type_id_fkey"
            columns: ["relationship_type_id"]
            isOneToOne: false
            referencedRelation: "party_relationship_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_relationships_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_risk_ratings: {
        Row: {
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          risk_rating_code: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          risk_rating_code: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          risk_rating_code?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_risk_ratings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_risk_ratings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_service_categories_master: {
        Row: {
          category_code: string
          category_name_ar: string | null
          category_name_en: string
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          parent_category_id: number | null
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          category_code: string
          category_name_ar?: string | null
          category_name_en: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          parent_category_id?: number | null
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          category_code?: string
          category_name_ar?: string | null
          category_name_en?: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          parent_category_id?: number | null
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_service_categories_master_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_service_categories_master_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "party_service_categories_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_service_categories_master_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_service_category_assignments: {
        Row: {
          created_at: string
          created_by: number | null
          id: number
          is_active: boolean
          is_primary: boolean
          party_id: number
          remarks: string | null
          service_category_id: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          id?: never
          is_active?: boolean
          is_primary?: boolean
          party_id: number
          remarks?: string | null
          service_category_id: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          id?: never
          is_active?: boolean
          is_primary?: boolean
          party_id?: number
          remarks?: string | null
          service_category_id?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_service_category_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_service_category_assignments_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_service_category_assignments_service_category_id_fkey"
            columns: ["service_category_id"]
            isOneToOne: false
            referencedRelation: "party_service_categories_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_service_category_assignments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_statuses: {
        Row: {
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          status_code: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          status_code: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_statuses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_statuses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_subcontractor_profiles: {
        Row: {
          approved_by_hse: boolean
          approved_for_site_work: boolean
          contract_currency_id: number | null
          created_at: string
          created_by: number | null
          hse_required: boolean
          id: number
          insurance_required: boolean
          max_contract_value: number | null
          party_id: number
          prequalification_required: boolean
          subcontractor_category_id: number | null
          subcontractor_remarks: string | null
          updated_at: string
          updated_by: number | null
          work_category_id: number | null
        }
        Insert: {
          approved_by_hse?: boolean
          approved_for_site_work?: boolean
          contract_currency_id?: number | null
          created_at?: string
          created_by?: number | null
          hse_required?: boolean
          id?: never
          insurance_required?: boolean
          max_contract_value?: number | null
          party_id: number
          prequalification_required?: boolean
          subcontractor_category_id?: number | null
          subcontractor_remarks?: string | null
          updated_at?: string
          updated_by?: number | null
          work_category_id?: number | null
        }
        Update: {
          approved_by_hse?: boolean
          approved_for_site_work?: boolean
          contract_currency_id?: number | null
          created_at?: string
          created_by?: number | null
          hse_required?: boolean
          id?: never
          insurance_required?: boolean
          max_contract_value?: number | null
          party_id?: number
          prequalification_required?: boolean
          subcontractor_category_id?: number | null
          subcontractor_remarks?: string | null
          updated_at?: string
          updated_by?: number | null
          work_category_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_subcontractor_profiles_contract_currency_id_fkey"
            columns: ["contract_currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_subcontractor_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_subcontractor_profiles_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: true
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_subcontractor_profiles_subcontractor_category_id_fkey"
            columns: ["subcontractor_category_id"]
            isOneToOne: false
            referencedRelation: "subcontractor_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_subcontractor_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_subcontractor_profiles_work_category_id_fkey"
            columns: ["work_category_id"]
            isOneToOne: false
            referencedRelation: "work_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      party_tax_registrations: {
        Row: {
          certificate_document_id: number | null
          created_at: string
          created_by: number | null
          dms_certificate_document_id: number | null
          effective_from: string | null
          effective_to: string | null
          id: number
          is_active: boolean
          is_primary: boolean
          party_id: number
          remarks: string | null
          reverse_charge_applicable: boolean
          tax_country_id: number | null
          tax_registration_code: string
          tax_registration_number: string
          tax_status_id: number
          tax_type_id: number
          updated_at: string
          updated_by: number | null
          vat_exempt: boolean
        }
        Insert: {
          certificate_document_id?: number | null
          created_at?: string
          created_by?: number | null
          dms_certificate_document_id?: number | null
          effective_from?: string | null
          effective_to?: string | null
          id?: never
          is_active?: boolean
          is_primary?: boolean
          party_id: number
          remarks?: string | null
          reverse_charge_applicable?: boolean
          tax_country_id?: number | null
          tax_registration_code: string
          tax_registration_number: string
          tax_status_id: number
          tax_type_id: number
          updated_at?: string
          updated_by?: number | null
          vat_exempt?: boolean
        }
        Update: {
          certificate_document_id?: number | null
          created_at?: string
          created_by?: number | null
          dms_certificate_document_id?: number | null
          effective_from?: string | null
          effective_to?: string | null
          id?: never
          is_active?: boolean
          is_primary?: boolean
          party_id?: number
          remarks?: string | null
          reverse_charge_applicable?: boolean
          tax_country_id?: number | null
          tax_registration_code?: string
          tax_registration_number?: string
          tax_status_id?: number
          tax_type_id?: number
          updated_at?: string
          updated_by?: number | null
          vat_exempt?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "party_tax_registrations_certificate_document_id_fkey"
            columns: ["certificate_document_id"]
            isOneToOne: false
            referencedRelation: "party_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_tax_registrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_tax_registrations_dms_certificate_document_id_fkey"
            columns: ["dms_certificate_document_id"]
            isOneToOne: false
            referencedRelation: "dms_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_tax_registrations_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_tax_registrations_tax_country_id_fkey"
            columns: ["tax_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_tax_registrations_tax_status_id_fkey"
            columns: ["tax_status_id"]
            isOneToOne: false
            referencedRelation: "party_tax_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_tax_registrations_tax_type_id_fkey"
            columns: ["tax_type_id"]
            isOneToOne: false
            referencedRelation: "tax_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_tax_registrations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_tax_statuses: {
        Row: {
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          tax_status_code: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          tax_status_code: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          tax_status_code?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_tax_statuses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_tax_statuses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_type_assignments: {
        Row: {
          assigned_by: number | null
          assigned_date: string | null
          created_at: string
          created_by: number | null
          id: number
          is_active: boolean
          is_primary: boolean
          party_id: number
          party_type_id: number
          remarks: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          assigned_by?: number | null
          assigned_date?: string | null
          created_at?: string
          created_by?: number | null
          id?: never
          is_active?: boolean
          is_primary?: boolean
          party_id: number
          party_type_id: number
          remarks?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          assigned_by?: number | null
          assigned_date?: string | null
          created_at?: string
          created_by?: number | null
          id?: never
          is_active?: boolean
          is_primary?: boolean
          party_id?: number
          party_type_id?: number
          remarks?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_type_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_type_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_type_assignments_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_type_assignments_party_type_id_fkey"
            columns: ["party_type_id"]
            isOneToOne: false
            referencedRelation: "party_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_type_assignments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_types: {
        Row: {
          color_token: string | null
          created_at: string
          created_by: number | null
          description: string | null
          icon_name: string | null
          id: number
          is_active: boolean
          is_system: boolean
          sort_order: number
          type_code: string
          type_name: string
          type_name_ar: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          color_token?: string | null
          created_at?: string
          created_by?: number | null
          description?: string | null
          icon_name?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          sort_order?: number
          type_code: string
          type_name: string
          type_name_ar?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          color_token?: string | null
          created_at?: string
          created_by?: number | null
          description?: string | null
          icon_name?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          sort_order?: number
          type_code?: string
          type_name?: string
          type_name_ar?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "party_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      party_vendor_profiles: {
        Row: {
          can_create_po: boolean
          created_at: string
          created_by: number | null
          default_currency_id: number | null
          id: number
          party_id: number
          payment_term_id: number | null
          preferred_vendor: boolean
          procurement_category_id: number | null
          requires_comparison: boolean
          updated_at: string
          updated_by: number | null
          vendor_approval_status_id: number | null
          vendor_category_id: number | null
          vendor_rating_id: number | null
          vendor_remarks: string | null
        }
        Insert: {
          can_create_po?: boolean
          created_at?: string
          created_by?: number | null
          default_currency_id?: number | null
          id?: never
          party_id: number
          payment_term_id?: number | null
          preferred_vendor?: boolean
          procurement_category_id?: number | null
          requires_comparison?: boolean
          updated_at?: string
          updated_by?: number | null
          vendor_approval_status_id?: number | null
          vendor_category_id?: number | null
          vendor_rating_id?: number | null
          vendor_remarks?: string | null
        }
        Update: {
          can_create_po?: boolean
          created_at?: string
          created_by?: number | null
          default_currency_id?: number | null
          id?: never
          party_id?: number
          payment_term_id?: number | null
          preferred_vendor?: boolean
          procurement_category_id?: number | null
          requires_comparison?: boolean
          updated_at?: string
          updated_by?: number | null
          vendor_approval_status_id?: number | null
          vendor_category_id?: number | null
          vendor_rating_id?: number | null
          vendor_remarks?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "party_vendor_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_vendor_profiles_default_currency_id_fkey"
            columns: ["default_currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_vendor_profiles_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: true
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_vendor_profiles_payment_term_id_fkey"
            columns: ["payment_term_id"]
            isOneToOne: false
            referencedRelation: "payment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_vendor_profiles_procurement_category_id_fkey"
            columns: ["procurement_category_id"]
            isOneToOne: false
            referencedRelation: "procurement_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_vendor_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_vendor_profiles_vendor_approval_status_id_fkey"
            columns: ["vendor_approval_status_id"]
            isOneToOne: false
            referencedRelation: "party_approval_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_vendor_profiles_vendor_category_id_fkey"
            columns: ["vendor_category_id"]
            isOneToOne: false
            referencedRelation: "vendor_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_vendor_profiles_vendor_rating_id_fkey"
            columns: ["vendor_rating_id"]
            isOneToOne: false
            referencedRelation: "vendor_ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          method_code: string
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          method_code: string
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          method_code?: string
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_methods_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_terms: {
        Row: {
          advance_percentage: number
          calculation_notes: string | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          description_ar: string | null
          description_en: string | null
          due_days: number
          id: number
          is_active: boolean
          is_locked: boolean
          is_system: boolean
          notes: string | null
          retention_percentage: number
          sort_order: number
          term_code: string
          term_name_ar: string | null
          term_name_en: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          advance_percentage?: number
          calculation_notes?: string | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          description_ar?: string | null
          description_en?: string | null
          due_days?: number
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          notes?: string | null
          retention_percentage?: number
          sort_order?: number
          term_code: string
          term_name_ar?: string | null
          term_name_en: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          advance_percentage?: number
          calculation_notes?: string | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          description_ar?: string | null
          description_en?: string | null
          due_days?: number
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          notes?: string | null
          retention_percentage?: number
          sort_order?: number
          term_code?: string
          term_name_ar?: string | null
          term_name_en?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_terms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_terms_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_terms_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action_code: string
          created_at: string
          description: string | null
          display_name: string | null
          id: number
          is_active: boolean
          is_system_permission: boolean | null
          is_visible: boolean | null
          module_code: string
          permission_code: string
          permission_name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          action_code: string
          created_at?: string
          description?: string | null
          display_name?: string | null
          id?: number
          is_active?: boolean
          is_system_permission?: boolean | null
          is_visible?: boolean | null
          module_code: string
          permission_code: string
          permission_name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          action_code?: string
          created_at?: string
          description?: string | null
          display_name?: string | null
          id?: number
          is_active?: boolean
          is_system_permission?: boolean | null
          is_visible?: boolean | null
          module_code?: string
          permission_code?: string
          permission_name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ports: {
        Row: {
          country_id: number | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          emirate_id: number
          iata_code: string | null
          icao_code: string | null
          id: number
          is_active: boolean
          is_locked: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          port_code: string
          port_type_code: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id: number
          iata_code?: string | null
          icao_code?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          port_code: string
          port_type_code: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number
          iata_code?: string | null
          icao_code?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          port_code?: string
          port_type_code?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ports_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ports_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_categories: {
        Row: {
          category_code: string
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          category_code: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          category_code?: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profit_centers: {
        Row: {
          branch_id: number | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          description_ar: string | null
          description_en: string | null
          id: number
          is_active: boolean
          is_locked: boolean
          is_system: boolean
          notes: string | null
          owner_company_id: number | null
          parent_profit_center_id: number | null
          profit_center_code: string
          profit_center_name_ar: string | null
          profit_center_name_en: string
          profit_center_type_code: string | null
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          branch_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          description_ar?: string | null
          description_en?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          notes?: string | null
          owner_company_id?: number | null
          parent_profit_center_id?: number | null
          profit_center_code: string
          profit_center_name_ar?: string | null
          profit_center_name_en: string
          profit_center_type_code?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          branch_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          description_ar?: string | null
          description_en?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          notes?: string | null
          owner_company_id?: number | null
          parent_profit_center_id?: number | null
          profit_center_code?: string
          profit_center_name_ar?: string | null
          profit_center_name_en?: string
          profit_center_type_code?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profit_centers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_centers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_centers_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_centers_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_centers_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_centers_parent_profit_center_id_fkey"
            columns: ["parent_profit_center_id"]
            isOneToOne: false
            referencedRelation: "profit_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_centers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_periods: {
        Row: {
          created_at: string | null
          days_of_week: string[]
          demand_charge_per_kw: number | null
          end_time: string
          energy_rate_per_kwh: number
          id: string
          period_name: string
          priority: number | null
          rate_structure_id: string | null
          season: string | null
          start_time: string
        }
        Insert: {
          created_at?: string | null
          days_of_week: string[]
          demand_charge_per_kw?: number | null
          end_time: string
          energy_rate_per_kwh: number
          id?: string
          period_name: string
          priority?: number | null
          rate_structure_id?: string | null
          season?: string | null
          start_time: string
        }
        Update: {
          created_at?: string | null
          days_of_week?: string[]
          demand_charge_per_kw?: number | null
          end_time?: string
          energy_rate_per_kwh?: number
          id?: string
          period_name?: string
          priority?: number | null
          rate_structure_id?: string | null
          season?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_periods_rate_structure_id_fkey"
            columns: ["rate_structure_id"]
            isOneToOne: false
            referencedRelation: "rate_structures"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_structures: {
        Row: {
          created_at: string | null
          description: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean | null
          name: string
          station_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          station_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          station_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rate_structures_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_agencies: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          agency_category_code: string | null
          agency_code: string
          agency_name_ar: string | null
          agency_name_en: string
          agency_type_code: string
          area_zone_id: number | null
          cicpa_registration_number: string | null
          city_id: number | null
          countries_served: string[] | null
          country_id: number | null
          created_at: string
          created_by: number | null
          currency_id: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          emirate_id: number | null
          icv_certificate_number: string | null
          icv_certification_body: string | null
          icv_company_type: string | null
          icv_document_path: string | null
          icv_expiry_date: string | null
          icv_financial_year_end_date: string | null
          icv_issue_date: string | null
          icv_score_percentage: number | null
          icv_status_code: string | null
          icv_version: string | null
          id: number
          is_active: boolean
          is_locked: boolean
          is_system: boolean
          license_expiry_date: string | null
          license_number: string | null
          notes: string | null
          payment_term_id: number | null
          po_box: string | null
          primary_email: string | null
          primary_mobile: string | null
          primary_phone: string | null
          sort_order: number
          status_code: string
          tax_type_id: number | null
          updated_at: string
          updated_by: number | null
          website_url: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          agency_category_code?: string | null
          agency_code: string
          agency_name_ar?: string | null
          agency_name_en: string
          agency_type_code: string
          area_zone_id?: number | null
          cicpa_registration_number?: string | null
          city_id?: number | null
          countries_served?: string[] | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          currency_id?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number | null
          icv_certificate_number?: string | null
          icv_certification_body?: string | null
          icv_company_type?: string | null
          icv_document_path?: string | null
          icv_expiry_date?: string | null
          icv_financial_year_end_date?: string | null
          icv_issue_date?: string | null
          icv_score_percentage?: number | null
          icv_status_code?: string | null
          icv_version?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          license_expiry_date?: string | null
          license_number?: string | null
          notes?: string | null
          payment_term_id?: number | null
          po_box?: string | null
          primary_email?: string | null
          primary_mobile?: string | null
          primary_phone?: string | null
          sort_order?: number
          status_code?: string
          tax_type_id?: number | null
          updated_at?: string
          updated_by?: number | null
          website_url?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          agency_category_code?: string | null
          agency_code?: string
          agency_name_ar?: string | null
          agency_name_en?: string
          agency_type_code?: string
          area_zone_id?: number | null
          cicpa_registration_number?: string | null
          city_id?: number | null
          countries_served?: string[] | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          currency_id?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number | null
          icv_certificate_number?: string | null
          icv_certification_body?: string | null
          icv_company_type?: string | null
          icv_document_path?: string | null
          icv_expiry_date?: string | null
          icv_financial_year_end_date?: string | null
          icv_issue_date?: string | null
          icv_score_percentage?: number | null
          icv_status_code?: string | null
          icv_version?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          license_expiry_date?: string | null
          license_number?: string | null
          notes?: string | null
          payment_term_id?: number | null
          po_box?: string | null
          primary_email?: string | null
          primary_mobile?: string | null
          primary_phone?: string | null
          sort_order?: number
          status_code?: string
          tax_type_id?: number | null
          updated_at?: string
          updated_by?: number | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_agencies_area_zone_id_fkey"
            columns: ["area_zone_id"]
            isOneToOne: false
            referencedRelation: "areas_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agencies_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agencies_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agencies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agencies_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agencies_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agencies_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agencies_payment_term_id_fkey"
            columns: ["payment_term_id"]
            isOneToOne: false
            referencedRelation: "payment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agencies_tax_type_id_fkey"
            columns: ["tax_type_id"]
            isOneToOne: false
            referencedRelation: "tax_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agencies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_agency_addresses: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          address_type_code: string | null
          area_zone_id: number | null
          building_name: string | null
          city_id: number | null
          country_id: number | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          emirate_id: number | null
          id: number
          is_active: boolean
          is_billing_address: boolean
          is_locked: boolean
          is_primary: boolean
          is_shipping_address: boolean
          is_system: boolean
          latitude: number | null
          longitude: number | null
          makani_number: string | null
          notes: string | null
          po_box: string | null
          recruitment_agency_id: number
          sort_order: number
          status_code: string
          street_name: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          address_type_code?: string | null
          area_zone_id?: number | null
          building_name?: string | null
          city_id?: number | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number | null
          id?: number
          is_active?: boolean
          is_billing_address?: boolean
          is_locked?: boolean
          is_primary?: boolean
          is_shipping_address?: boolean
          is_system?: boolean
          latitude?: number | null
          longitude?: number | null
          makani_number?: string | null
          notes?: string | null
          po_box?: string | null
          recruitment_agency_id: number
          sort_order?: number
          status_code?: string
          street_name?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          address_type_code?: string | null
          area_zone_id?: number | null
          building_name?: string | null
          city_id?: number | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number | null
          id?: number
          is_active?: boolean
          is_billing_address?: boolean
          is_locked?: boolean
          is_primary?: boolean
          is_shipping_address?: boolean
          is_system?: boolean
          latitude?: number | null
          longitude?: number | null
          makani_number?: string | null
          notes?: string | null
          po_box?: string | null
          recruitment_agency_id?: number
          sort_order?: number
          status_code?: string
          street_name?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_agency_addresses_area_zone_id_fkey"
            columns: ["area_zone_id"]
            isOneToOne: false
            referencedRelation: "areas_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agency_addresses_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agency_addresses_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agency_addresses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agency_addresses_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agency_addresses_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agency_addresses_recruitment_agency_id_fkey"
            columns: ["recruitment_agency_id"]
            isOneToOne: false
            referencedRelation: "recruitment_agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agency_addresses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_agency_bank_details: {
        Row: {
          account_name: string
          account_number: string
          bank_account_type_code: string | null
          bank_id: number | null
          created_at: string
          created_by: number | null
          currency_id: number | null
          iban: string | null
          id: number
          is_active: boolean
          is_primary: boolean
          notes: string | null
          recruitment_agency_id: number
          swift_code: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          account_name: string
          account_number: string
          bank_account_type_code?: string | null
          bank_id?: number | null
          created_at?: string
          created_by?: number | null
          currency_id?: number | null
          iban?: string | null
          id?: number
          is_active?: boolean
          is_primary?: boolean
          notes?: string | null
          recruitment_agency_id: number
          swift_code?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_account_type_code?: string | null
          bank_id?: number | null
          created_at?: string
          created_by?: number | null
          currency_id?: number | null
          iban?: string | null
          id?: number
          is_active?: boolean
          is_primary?: boolean
          notes?: string | null
          recruitment_agency_id?: number
          swift_code?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_agency_bank_details_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agency_bank_details_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agency_bank_details_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agency_bank_details_recruitment_agency_id_fkey"
            columns: ["recruitment_agency_id"]
            isOneToOne: false
            referencedRelation: "recruitment_agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agency_bank_details_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_agency_contacts: {
        Row: {
          contact_code: string
          contact_name_ar: string | null
          contact_name_en: string
          contact_type_code: string | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          department: string | null
          designation: string | null
          email: string | null
          id: number
          is_active: boolean
          is_authorized_signatory: boolean
          is_decision_maker: boolean
          is_finance_contact: boolean
          is_locked: boolean
          is_operations_contact: boolean
          is_primary: boolean
          is_system: boolean
          mobile: string | null
          notes: string | null
          phone: string | null
          preferred_communication_code: string | null
          recruitment_agency_id: number
          sort_order: number
          status_code: string
          updated_at: string
          updated_by: number | null
          whatsapp: string | null
        }
        Insert: {
          contact_code: string
          contact_name_ar?: string | null
          contact_name_en: string
          contact_type_code?: string | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: number
          is_active?: boolean
          is_authorized_signatory?: boolean
          is_decision_maker?: boolean
          is_finance_contact?: boolean
          is_locked?: boolean
          is_operations_contact?: boolean
          is_primary?: boolean
          is_system?: boolean
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          preferred_communication_code?: string | null
          recruitment_agency_id: number
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
          whatsapp?: string | null
        }
        Update: {
          contact_code?: string
          contact_name_ar?: string | null
          contact_name_en?: string
          contact_type_code?: string | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: number
          is_active?: boolean
          is_authorized_signatory?: boolean
          is_decision_maker?: boolean
          is_finance_contact?: boolean
          is_locked?: boolean
          is_operations_contact?: boolean
          is_primary?: boolean
          is_system?: boolean
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          preferred_communication_code?: string | null
          recruitment_agency_id?: number
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_agency_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agency_contacts_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agency_contacts_recruitment_agency_id_fkey"
            columns: ["recruitment_agency_id"]
            isOneToOne: false
            referencedRelation: "recruitment_agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agency_contacts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_agency_documents: {
        Row: {
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          document_name: string
          document_number: string | null
          document_type_code: string | null
          expiry_date: string | null
          expiry_reminder_days: number | null
          file_path: string | null
          has_expiry: boolean
          id: number
          is_active: boolean
          is_locked: boolean
          is_required: boolean
          is_system: boolean
          is_verified: boolean
          issue_date: string | null
          notes: string | null
          recruitment_agency_id: number
          sort_order: number
          status_code: string
          updated_at: string
          updated_by: number | null
          verified_at: string | null
          verified_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          document_name: string
          document_number?: string | null
          document_type_code?: string | null
          expiry_date?: string | null
          expiry_reminder_days?: number | null
          file_path?: string | null
          has_expiry?: boolean
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_required?: boolean
          is_system?: boolean
          is_verified?: boolean
          issue_date?: string | null
          notes?: string | null
          recruitment_agency_id: number
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
          verified_at?: string | null
          verified_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          document_name?: string
          document_number?: string | null
          document_type_code?: string | null
          expiry_date?: string | null
          expiry_reminder_days?: number | null
          file_path?: string | null
          has_expiry?: boolean
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_required?: boolean
          is_system?: boolean
          is_verified?: boolean
          issue_date?: string | null
          notes?: string | null
          recruitment_agency_id?: number
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
          verified_at?: string | null
          verified_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_agency_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agency_documents_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agency_documents_recruitment_agency_id_fkey"
            columns: ["recruitment_agency_id"]
            isOneToOne: false
            referencedRelation: "recruitment_agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agency_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_agency_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_categories: {
        Row: {
          category_code: string
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          category_code: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          category_code?: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: number
          permission_id: number
          role_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          permission_id: number
          role_id: number
        }
        Update: {
          created_at?: string
          id?: number
          permission_id?: number
          role_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          display_name: string | null
          id: number
          is_active: boolean
          is_assignable: boolean | null
          is_system_role: boolean
          notes: string | null
          role_category: string | null
          role_code: string
          role_level: string | null
          role_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name?: string | null
          id?: number
          is_active?: boolean
          is_assignable?: boolean | null
          is_system_role?: boolean
          notes?: string | null
          role_category?: string | null
          role_code: string
          role_level?: string | null
          role_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string | null
          id?: number
          is_active?: boolean
          is_assignable?: boolean | null
          is_system_role?: boolean
          notes?: string | null
          role_category?: string | null
          role_code?: string
          role_level?: string | null
          role_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales_regions: {
        Row: {
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          region_code: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          region_code: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          region_code?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_regions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_regions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          bank_deposit_date: string | null
          bank_deposit_reference: string | null
          bank_deposit_slip: string | null
          created_at: string | null
          end_time: string
          handover_status: string | null
          id: string
          import_batch_id: string | null
          notes: string | null
          operator_id: string | null
          shift_date: string
          shift_duration: string
          shift_type: string
          start_time: string
          station_id: string | null
          total_amount_jod: number | null
          total_kwh: number | null
          updated_at: string | null
        }
        Insert: {
          bank_deposit_date?: string | null
          bank_deposit_reference?: string | null
          bank_deposit_slip?: string | null
          created_at?: string | null
          end_time: string
          handover_status?: string | null
          id?: string
          import_batch_id?: string | null
          notes?: string | null
          operator_id?: string | null
          shift_date: string
          shift_duration: string
          shift_type: string
          start_time: string
          station_id?: string | null
          total_amount_jod?: number | null
          total_kwh?: number | null
          updated_at?: string | null
        }
        Update: {
          bank_deposit_date?: string | null
          bank_deposit_reference?: string | null
          bank_deposit_slip?: string | null
          created_at?: string | null
          end_time?: string
          handover_status?: string | null
          id?: string
          import_batch_id?: string | null
          notes?: string | null
          operator_id?: string | null
          shift_date?: string
          shift_duration?: string
          shift_type?: string
          start_time?: string
          station_id?: string | null
          total_amount_jod?: number | null
          total_kwh?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          address: string | null
          capacity_kw: number | null
          created_at: string | null
          id: string
          installation_date: string | null
          location: string | null
          name: string
          notes: string | null
          station_code: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          capacity_kw?: number | null
          created_at?: string | null
          id?: string
          installation_date?: string | null
          location?: string | null
          name: string
          notes?: string | null
          station_code?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          capacity_kw?: number | null
          created_at?: string | null
          id?: string
          installation_date?: string | null
          location?: string | null
          name?: string
          notes?: string | null
          station_code?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      subcontractor_addresses: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          address_type_code: string | null
          area_zone_id: number | null
          building_name: string | null
          city_id: number | null
          country_id: number | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          emirate_id: number | null
          id: number
          is_active: boolean
          is_billing_address: boolean
          is_locked: boolean
          is_primary: boolean
          is_shipping_address: boolean
          is_system: boolean
          latitude: number | null
          longitude: number | null
          makani_number: string | null
          notes: string | null
          po_box: string | null
          sort_order: number
          status_code: string
          street_name: string | null
          subcontractor_id: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          address_type_code?: string | null
          area_zone_id?: number | null
          building_name?: string | null
          city_id?: number | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number | null
          id?: number
          is_active?: boolean
          is_billing_address?: boolean
          is_locked?: boolean
          is_primary?: boolean
          is_shipping_address?: boolean
          is_system?: boolean
          latitude?: number | null
          longitude?: number | null
          makani_number?: string | null
          notes?: string | null
          po_box?: string | null
          sort_order?: number
          status_code?: string
          street_name?: string | null
          subcontractor_id: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          address_type_code?: string | null
          area_zone_id?: number | null
          building_name?: string | null
          city_id?: number | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number | null
          id?: number
          is_active?: boolean
          is_billing_address?: boolean
          is_locked?: boolean
          is_primary?: boolean
          is_shipping_address?: boolean
          is_system?: boolean
          latitude?: number | null
          longitude?: number | null
          makani_number?: string | null
          notes?: string | null
          po_box?: string | null
          sort_order?: number
          status_code?: string
          street_name?: string | null
          subcontractor_id?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subcontractor_addresses_area_zone_id_fkey"
            columns: ["area_zone_id"]
            isOneToOne: false
            referencedRelation: "areas_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_addresses_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_addresses_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_addresses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_addresses_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_addresses_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_addresses_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_addresses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontractor_bank_details: {
        Row: {
          account_name: string
          account_number: string
          bank_account_type_code: string | null
          bank_id: number | null
          created_at: string
          created_by: number | null
          currency_id: number | null
          iban: string | null
          id: number
          is_active: boolean
          is_primary: boolean
          notes: string | null
          subcontractor_id: number
          swift_code: string | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          account_name: string
          account_number: string
          bank_account_type_code?: string | null
          bank_id?: number | null
          created_at?: string
          created_by?: number | null
          currency_id?: number | null
          iban?: string | null
          id?: number
          is_active?: boolean
          is_primary?: boolean
          notes?: string | null
          subcontractor_id: number
          swift_code?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_account_type_code?: string | null
          bank_id?: number | null
          created_at?: string
          created_by?: number | null
          currency_id?: number | null
          iban?: string | null
          id?: number
          is_active?: boolean
          is_primary?: boolean
          notes?: string | null
          subcontractor_id?: number
          swift_code?: string | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subcontractor_bank_details_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_bank_details_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_bank_details_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_bank_details_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_bank_details_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontractor_categories: {
        Row: {
          category_code: string
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          category_code: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          category_code?: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subcontractor_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontractor_contacts: {
        Row: {
          contact_code: string
          contact_name_ar: string | null
          contact_name_en: string
          contact_type_code: string | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          department: string | null
          designation: string | null
          email: string | null
          id: number
          is_active: boolean
          is_authorized_signatory: boolean
          is_decision_maker: boolean
          is_finance_contact: boolean
          is_locked: boolean
          is_operations_contact: boolean
          is_primary: boolean
          is_system: boolean
          mobile: string | null
          notes: string | null
          phone: string | null
          preferred_communication_code: string | null
          sort_order: number
          status_code: string
          subcontractor_id: number
          updated_at: string
          updated_by: number | null
          whatsapp: string | null
        }
        Insert: {
          contact_code: string
          contact_name_ar?: string | null
          contact_name_en: string
          contact_type_code?: string | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: number
          is_active?: boolean
          is_authorized_signatory?: boolean
          is_decision_maker?: boolean
          is_finance_contact?: boolean
          is_locked?: boolean
          is_operations_contact?: boolean
          is_primary?: boolean
          is_system?: boolean
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          preferred_communication_code?: string | null
          sort_order?: number
          status_code?: string
          subcontractor_id: number
          updated_at?: string
          updated_by?: number | null
          whatsapp?: string | null
        }
        Update: {
          contact_code?: string
          contact_name_ar?: string | null
          contact_name_en?: string
          contact_type_code?: string | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: number
          is_active?: boolean
          is_authorized_signatory?: boolean
          is_decision_maker?: boolean
          is_finance_contact?: boolean
          is_locked?: boolean
          is_operations_contact?: boolean
          is_primary?: boolean
          is_system?: boolean
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          preferred_communication_code?: string | null
          sort_order?: number
          status_code?: string
          subcontractor_id?: number
          updated_at?: string
          updated_by?: number | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subcontractor_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_contacts_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_contacts_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_contacts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontractor_documents: {
        Row: {
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          document_name: string
          document_number: string | null
          document_type_code: string | null
          expiry_date: string | null
          expiry_reminder_days: number | null
          file_path: string | null
          has_expiry: boolean
          id: number
          is_active: boolean
          is_locked: boolean
          is_required: boolean
          is_system: boolean
          is_verified: boolean
          issue_date: string | null
          notes: string | null
          sort_order: number
          status_code: string
          subcontractor_id: number
          updated_at: string
          updated_by: number | null
          verified_at: string | null
          verified_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          document_name: string
          document_number?: string | null
          document_type_code?: string | null
          expiry_date?: string | null
          expiry_reminder_days?: number | null
          file_path?: string | null
          has_expiry?: boolean
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_required?: boolean
          is_system?: boolean
          is_verified?: boolean
          issue_date?: string | null
          notes?: string | null
          sort_order?: number
          status_code?: string
          subcontractor_id: number
          updated_at?: string
          updated_by?: number | null
          verified_at?: string | null
          verified_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          document_name?: string
          document_number?: string | null
          document_type_code?: string | null
          expiry_date?: string | null
          expiry_reminder_days?: number | null
          file_path?: string | null
          has_expiry?: boolean
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_required?: boolean
          is_system?: boolean
          is_verified?: boolean
          issue_date?: string | null
          notes?: string | null
          sort_order?: number
          status_code?: string
          subcontractor_id?: number
          updated_at?: string
          updated_by?: number | null
          verified_at?: string | null
          verified_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subcontractor_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_documents_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_documents_subcontractor_id_fkey"
            columns: ["subcontractor_id"]
            isOneToOne: false
            referencedRelation: "subcontractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractor_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subcontractors: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          area_zone_id: number | null
          cicpa_registration_number: string | null
          city_id: number | null
          country_id: number | null
          created_at: string
          created_by: number | null
          currency_id: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          emirate_id: number | null
          equipment_supply_allowed: boolean
          hse_prequalification_status_code: string | null
          icv_certificate_number: string | null
          icv_certification_body: string | null
          icv_company_type: string | null
          icv_document_path: string | null
          icv_expiry_date: string | null
          icv_financial_year_end_date: string | null
          icv_issue_date: string | null
          icv_score_percentage: number | null
          icv_status_code: string | null
          icv_version: string | null
          id: number
          is_active: boolean
          is_locked: boolean
          is_system: boolean
          license_expiry_date: string | null
          makani_number: string | null
          notes: string | null
          payment_term_id: number | null
          po_box: string | null
          primary_email: string | null
          primary_mobile: string | null
          primary_phone: string | null
          sort_order: number
          status_code: string
          subcontractor_category_code: string | null
          subcontractor_code: string
          subcontractor_name_ar: string | null
          subcontractor_name_en: string
          subcontractor_type_code: string
          tax_type_id: number | null
          trade_license_number: string | null
          trn: string | null
          updated_at: string
          updated_by: number | null
          website_url: string | null
          worker_supply_allowed: boolean
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          area_zone_id?: number | null
          cicpa_registration_number?: string | null
          city_id?: number | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          currency_id?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number | null
          equipment_supply_allowed?: boolean
          hse_prequalification_status_code?: string | null
          icv_certificate_number?: string | null
          icv_certification_body?: string | null
          icv_company_type?: string | null
          icv_document_path?: string | null
          icv_expiry_date?: string | null
          icv_financial_year_end_date?: string | null
          icv_issue_date?: string | null
          icv_score_percentage?: number | null
          icv_status_code?: string | null
          icv_version?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          license_expiry_date?: string | null
          makani_number?: string | null
          notes?: string | null
          payment_term_id?: number | null
          po_box?: string | null
          primary_email?: string | null
          primary_mobile?: string | null
          primary_phone?: string | null
          sort_order?: number
          status_code?: string
          subcontractor_category_code?: string | null
          subcontractor_code: string
          subcontractor_name_ar?: string | null
          subcontractor_name_en: string
          subcontractor_type_code: string
          tax_type_id?: number | null
          trade_license_number?: string | null
          trn?: string | null
          updated_at?: string
          updated_by?: number | null
          website_url?: string | null
          worker_supply_allowed?: boolean
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          area_zone_id?: number | null
          cicpa_registration_number?: string | null
          city_id?: number | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          currency_id?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number | null
          equipment_supply_allowed?: boolean
          hse_prequalification_status_code?: string | null
          icv_certificate_number?: string | null
          icv_certification_body?: string | null
          icv_company_type?: string | null
          icv_document_path?: string | null
          icv_expiry_date?: string | null
          icv_financial_year_end_date?: string | null
          icv_issue_date?: string | null
          icv_score_percentage?: number | null
          icv_status_code?: string | null
          icv_version?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          license_expiry_date?: string | null
          makani_number?: string | null
          notes?: string | null
          payment_term_id?: number | null
          po_box?: string | null
          primary_email?: string | null
          primary_mobile?: string | null
          primary_phone?: string | null
          sort_order?: number
          status_code?: string
          subcontractor_category_code?: string | null
          subcontractor_code?: string
          subcontractor_name_ar?: string | null
          subcontractor_name_en?: string
          subcontractor_type_code?: string
          tax_type_id?: number | null
          trade_license_number?: string | null
          trn?: string | null
          updated_at?: string
          updated_by?: number | null
          website_url?: string | null
          worker_supply_allowed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "subcontractors_area_zone_id_fkey"
            columns: ["area_zone_id"]
            isOneToOne: false
            referencedRelation: "areas_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractors_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractors_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractors_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractors_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractors_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractors_payment_term_id_fkey"
            columns: ["payment_term_id"]
            isOneToOne: false
            referencedRelation: "payment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractors_tax_type_id_fkey"
            columns: ["tax_type_id"]
            isOneToOne: false
            referencedRelation: "tax_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subcontractors_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          category: string
          id: string
          key: string
          updated_at: string | null
          updated_by: string | null
          value: string
        }
        Insert: {
          category: string
          id?: string
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string
        }
        Update: {
          category?: string
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      tax_configurations: {
        Row: {
          applies_to: string | null
          created_at: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          is_active: boolean | null
          station_id: string | null
          tax_name: string
          tax_rate: number
        }
        Insert: {
          applies_to?: string | null
          created_at?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          station_id?: string | null
          tax_name: string
          tax_rate: number
        }
        Update: {
          applies_to?: string | null
          created_at?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          station_id?: string | null
          tax_name?: string
          tax_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_configurations_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_types: {
        Row: {
          applies_to_purchases: boolean
          applies_to_sales: boolean
          applies_to_scrap: boolean
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          description_ar: string | null
          description_en: string | null
          effective_from: string
          effective_to: string | null
          id: number
          is_active: boolean
          is_locked: boolean
          is_reverse_charge: boolean
          is_system: boolean
          is_vat: boolean
          notes: string | null
          sort_order: number
          tax_code: string
          tax_name_ar: string | null
          tax_name_en: string
          tax_rate: number
          tax_treatment_code: string
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          applies_to_purchases?: boolean
          applies_to_sales?: boolean
          applies_to_scrap?: boolean
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          description_ar?: string | null
          description_en?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_reverse_charge?: boolean
          is_system?: boolean
          is_vat?: boolean
          notes?: string | null
          sort_order?: number
          tax_code: string
          tax_name_ar?: string | null
          tax_name_en: string
          tax_rate?: number
          tax_treatment_code: string
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          applies_to_purchases?: boolean
          applies_to_sales?: boolean
          applies_to_scrap?: boolean
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          description_ar?: string | null
          description_en?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_reverse_charge?: boolean
          is_system?: boolean
          is_vat?: boolean
          notes?: string | null
          sort_order?: number
          tax_code?: string
          tax_name_ar?: string | null
          tax_name_en?: string
          tax_rate?: number
          tax_treatment_code?: string
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_types_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      units_of_measure: {
        Row: {
          allow_fraction: boolean
          conversion_factor_to_base: number
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          decimal_places: number
          description_ar: string | null
          description_en: string | null
          id: number
          is_active: boolean
          is_base_unit: boolean
          is_locked: boolean
          is_system: boolean
          notes: string | null
          sort_order: number
          symbol: string | null
          unit_code: string
          unit_name_ar: string | null
          unit_name_en: string
          uom_category_id: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          allow_fraction?: boolean
          conversion_factor_to_base?: number
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          decimal_places?: number
          description_ar?: string | null
          description_en?: string | null
          id?: number
          is_active?: boolean
          is_base_unit?: boolean
          is_locked?: boolean
          is_system?: boolean
          notes?: string | null
          sort_order?: number
          symbol?: string | null
          unit_code: string
          unit_name_ar?: string | null
          unit_name_en: string
          uom_category_id: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          allow_fraction?: boolean
          conversion_factor_to_base?: number
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          decimal_places?: number
          description_ar?: string | null
          description_en?: string | null
          id?: number
          is_active?: boolean
          is_base_unit?: boolean
          is_locked?: boolean
          is_system?: boolean
          notes?: string | null
          sort_order?: number
          symbol?: string | null
          unit_code?: string
          unit_name_ar?: string | null
          unit_name_en?: string
          uom_category_id?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "units_of_measure_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_of_measure_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_of_measure_uom_category_id_fkey"
            columns: ["uom_category_id"]
            isOneToOne: false
            referencedRelation: "uom_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_of_measure_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      uom_categories: {
        Row: {
          category_code: string
          category_name_ar: string | null
          category_name_en: string
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          description_ar: string | null
          description_en: string | null
          id: number
          is_active: boolean
          is_locked: boolean
          is_system: boolean
          notes: string | null
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          category_code: string
          category_name_ar?: string | null
          category_name_en: string
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          description_ar?: string | null
          description_en?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          notes?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          category_code?: string
          category_name_ar?: string | null
          category_name_en?: string
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          description_ar?: string | null
          description_en?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          notes?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "uom_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uom_categories_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uom_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      uom_conversions: {
        Row: {
          conversion_factor: number
          conversion_formula_code: string | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          from_uom_id: number
          id: number
          is_active: boolean
          is_bidirectional: boolean
          is_locked: boolean
          is_system: boolean
          notes: string | null
          sort_order: number
          to_uom_id: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          conversion_factor: number
          conversion_formula_code?: string | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          from_uom_id: number
          id?: number
          is_active?: boolean
          is_bidirectional?: boolean
          is_locked?: boolean
          is_system?: boolean
          notes?: string | null
          sort_order?: number
          to_uom_id: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          conversion_factor?: number
          conversion_formula_code?: string | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          from_uom_id?: number
          id?: number
          is_active?: boolean
          is_bidirectional?: boolean
          is_locked?: boolean
          is_system?: boolean
          notes?: string | null
          sort_order?: number
          to_uom_id?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "uom_conversions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uom_conversions_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uom_conversions_from_uom_id_fkey"
            columns: ["from_uom_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uom_conversions_to_uom_id_fkey"
            columns: ["to_uom_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uom_conversions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          auth_user_id: string
          avatar_url: string | null
          branch_id: number | null
          created_at: string
          department: string | null
          display_name: string | null
          email_confirmed_by_admin_at: string | null
          email_confirmed_by_admin_id: number | null
          employee_reference: string | null
          full_name: string | null
          id: number
          job_title: string | null
          last_admin_updated_at: string | null
          last_password_security_action: string | null
          last_password_security_action_at: string | null
          last_password_security_action_by: number | null
          manager_user_profile_id: number | null
          must_change_password: boolean
          must_change_password_reason: string | null
          notes: string | null
          owner_company_id: number | null
          password_changed_at: string | null
          password_reset_sent_at: string | null
          password_set_by_admin_at: string | null
          phone: string | null
          preferred_language: string | null
          status: string
          timezone: string | null
          updated_at: string
          user_code: string | null
        }
        Insert: {
          auth_user_id: string
          avatar_url?: string | null
          branch_id?: number | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          email_confirmed_by_admin_at?: string | null
          email_confirmed_by_admin_id?: number | null
          employee_reference?: string | null
          full_name?: string | null
          id?: number
          job_title?: string | null
          last_admin_updated_at?: string | null
          last_password_security_action?: string | null
          last_password_security_action_at?: string | null
          last_password_security_action_by?: number | null
          manager_user_profile_id?: number | null
          must_change_password?: boolean
          must_change_password_reason?: string | null
          notes?: string | null
          owner_company_id?: number | null
          password_changed_at?: string | null
          password_reset_sent_at?: string | null
          password_set_by_admin_at?: string | null
          phone?: string | null
          preferred_language?: string | null
          status?: string
          timezone?: string | null
          updated_at?: string
          user_code?: string | null
        }
        Update: {
          auth_user_id?: string
          avatar_url?: string | null
          branch_id?: number | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          email_confirmed_by_admin_at?: string | null
          email_confirmed_by_admin_id?: number | null
          employee_reference?: string | null
          full_name?: string | null
          id?: number
          job_title?: string | null
          last_admin_updated_at?: string | null
          last_password_security_action?: string | null
          last_password_security_action_at?: string | null
          last_password_security_action_by?: number | null
          manager_user_profile_id?: number | null
          must_change_password?: boolean
          must_change_password_reason?: string | null
          notes?: string | null
          owner_company_id?: number | null
          password_changed_at?: string | null
          password_reset_sent_at?: string | null
          password_set_by_admin_at?: string | null
          phone?: string | null
          preferred_language?: string | null
          status?: string
          timezone?: string | null
          updated_at?: string
          user_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_email_confirmed_by_admin_id_fkey"
            columns: ["email_confirmed_by_admin_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_last_password_security_action_by_fkey"
            columns: ["last_password_security_action_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_manager_user_profile_id_fkey"
            columns: ["manager_user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          assigned_at: string
          assigned_by: number | null
          branch_id: number | null
          id: number
          is_active: boolean
          owner_company_id: number | null
          role_id: number
          user_profile_id: number
        }
        Insert: {
          assigned_at?: string
          assigned_by?: number | null
          branch_id?: number | null
          id?: number
          is_active?: boolean
          owner_company_id?: number | null
          role_id: number
          user_profile_id: number
        }
        Update: {
          assigned_at?: string
          assigned_by?: number | null
          branch_id?: number | null
          id?: number
          is_active?: boolean
          owner_company_id?: number | null
          role_id?: number
          user_profile_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_addresses: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          address_type_code: string | null
          area_zone_id: number | null
          building_name: string | null
          city_id: number | null
          country_id: number | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          emirate_id: number | null
          id: number
          is_active: boolean
          is_billing_address: boolean
          is_locked: boolean
          is_primary: boolean
          is_shipping_address: boolean
          is_system: boolean
          latitude: number | null
          longitude: number | null
          makani_number: string | null
          notes: string | null
          po_box: string | null
          sort_order: number
          status_code: string
          street_name: string | null
          updated_at: string
          updated_by: number | null
          vendor_id: number
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          address_type_code?: string | null
          area_zone_id?: number | null
          building_name?: string | null
          city_id?: number | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number | null
          id?: number
          is_active?: boolean
          is_billing_address?: boolean
          is_locked?: boolean
          is_primary?: boolean
          is_shipping_address?: boolean
          is_system?: boolean
          latitude?: number | null
          longitude?: number | null
          makani_number?: string | null
          notes?: string | null
          po_box?: string | null
          sort_order?: number
          status_code?: string
          street_name?: string | null
          updated_at?: string
          updated_by?: number | null
          vendor_id: number
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          address_type_code?: string | null
          area_zone_id?: number | null
          building_name?: string | null
          city_id?: number | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          emirate_id?: number | null
          id?: number
          is_active?: boolean
          is_billing_address?: boolean
          is_locked?: boolean
          is_primary?: boolean
          is_shipping_address?: boolean
          is_system?: boolean
          latitude?: number | null
          longitude?: number | null
          makani_number?: string | null
          notes?: string | null
          po_box?: string | null
          sort_order?: number
          status_code?: string
          street_name?: string | null
          updated_at?: string
          updated_by?: number | null
          vendor_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendor_addresses_area_zone_id_fkey"
            columns: ["area_zone_id"]
            isOneToOne: false
            referencedRelation: "areas_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_addresses_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_addresses_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_addresses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_addresses_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_addresses_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_addresses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_addresses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_bank_details: {
        Row: {
          account_name: string
          account_number: string
          bank_account_type_code: string | null
          bank_id: number | null
          created_at: string
          created_by: number | null
          currency_id: number | null
          iban: string | null
          id: number
          is_active: boolean
          is_primary: boolean
          notes: string | null
          swift_code: string | null
          updated_at: string
          updated_by: number | null
          vendor_id: number
        }
        Insert: {
          account_name: string
          account_number: string
          bank_account_type_code?: string | null
          bank_id?: number | null
          created_at?: string
          created_by?: number | null
          currency_id?: number | null
          iban?: string | null
          id?: number
          is_active?: boolean
          is_primary?: boolean
          notes?: string | null
          swift_code?: string | null
          updated_at?: string
          updated_by?: number | null
          vendor_id: number
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_account_type_code?: string | null
          bank_id?: number | null
          created_at?: string
          created_by?: number | null
          currency_id?: number | null
          iban?: string | null
          id?: number
          is_active?: boolean
          is_primary?: boolean
          notes?: string | null
          swift_code?: string | null
          updated_at?: string
          updated_by?: number | null
          vendor_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendor_bank_details_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bank_details_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bank_details_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bank_details_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bank_details_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_categories: {
        Row: {
          category_code: string
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          category_code: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          category_code?: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_contacts: {
        Row: {
          contact_code: string
          contact_name_ar: string | null
          contact_name_en: string
          contact_type_code: string | null
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          department: string | null
          designation: string | null
          email: string | null
          id: number
          is_active: boolean
          is_authorized_signatory: boolean
          is_decision_maker: boolean
          is_finance_contact: boolean
          is_locked: boolean
          is_operations_contact: boolean
          is_primary: boolean
          is_system: boolean
          mobile: string | null
          notes: string | null
          phone: string | null
          preferred_communication_code: string | null
          sort_order: number
          status_code: string
          updated_at: string
          updated_by: number | null
          vendor_id: number
          whatsapp: string | null
        }
        Insert: {
          contact_code: string
          contact_name_ar?: string | null
          contact_name_en: string
          contact_type_code?: string | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: number
          is_active?: boolean
          is_authorized_signatory?: boolean
          is_decision_maker?: boolean
          is_finance_contact?: boolean
          is_locked?: boolean
          is_operations_contact?: boolean
          is_primary?: boolean
          is_system?: boolean
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          preferred_communication_code?: string | null
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
          vendor_id: number
          whatsapp?: string | null
        }
        Update: {
          contact_code?: string
          contact_name_ar?: string | null
          contact_name_en?: string
          contact_type_code?: string | null
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: number
          is_active?: boolean
          is_authorized_signatory?: boolean
          is_decision_maker?: boolean
          is_finance_contact?: boolean
          is_locked?: boolean
          is_operations_contact?: boolean
          is_primary?: boolean
          is_system?: boolean
          mobile?: string | null
          notes?: string | null
          phone?: string | null
          preferred_communication_code?: string | null
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
          vendor_id?: number
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_contacts_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_contacts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_contacts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_documents: {
        Row: {
          created_at: string
          created_by: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          document_name: string
          document_number: string | null
          document_type_code: string | null
          expiry_date: string | null
          expiry_reminder_days: number | null
          file_path: string | null
          has_expiry: boolean
          id: number
          is_active: boolean
          is_locked: boolean
          is_required: boolean
          is_system: boolean
          is_verified: boolean
          issue_date: string | null
          notes: string | null
          sort_order: number
          status_code: string
          updated_at: string
          updated_by: number | null
          vendor_id: number
          verified_at: string | null
          verified_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          document_name: string
          document_number?: string | null
          document_type_code?: string | null
          expiry_date?: string | null
          expiry_reminder_days?: number | null
          file_path?: string | null
          has_expiry?: boolean
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_required?: boolean
          is_system?: boolean
          is_verified?: boolean
          issue_date?: string | null
          notes?: string | null
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
          vendor_id: number
          verified_at?: string | null
          verified_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          document_name?: string
          document_number?: string | null
          document_type_code?: string | null
          expiry_date?: string | null
          expiry_reminder_days?: number | null
          file_path?: string | null
          has_expiry?: boolean
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_required?: boolean
          is_system?: boolean
          is_verified?: boolean
          issue_date?: string | null
          notes?: string | null
          sort_order?: number
          status_code?: string
          updated_at?: string
          updated_by?: number | null
          vendor_id?: number
          verified_at?: string | null
          verified_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_documents_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_documents_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_ratings: {
        Row: {
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          rating_code: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          rating_code: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          rating_code?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_ratings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_ratings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          area_zone_id: number | null
          cicpa_registration_number: string | null
          city_id: number | null
          country_id: number | null
          created_at: string
          created_by: number | null
          currency_id: number | null
          deactivated_at: string | null
          deactivated_by: number | null
          deactivation_reason: string | null
          default_bank_id: number | null
          emirate_id: number | null
          icv_certificate_number: string | null
          icv_certification_body: string | null
          icv_company_type: string | null
          icv_document_path: string | null
          icv_expiry_date: string | null
          icv_financial_year_end_date: string | null
          icv_issue_date: string | null
          icv_score_percentage: number | null
          icv_status_code: string | null
          icv_version: string | null
          id: number
          is_active: boolean
          is_locked: boolean
          is_system: boolean
          license_expiry_date: string | null
          makani_number: string | null
          notes: string | null
          payment_term_id: number | null
          po_box: string | null
          primary_email: string | null
          primary_mobile: string | null
          primary_phone: string | null
          sort_order: number
          status_code: string
          supplier_category_code: string | null
          tax_type_id: number | null
          trade_license_number: string | null
          trn: string | null
          updated_at: string
          updated_by: number | null
          vendor_category_code: string | null
          vendor_code: string
          vendor_name_ar: string | null
          vendor_name_en: string
          vendor_type_code: string
          website_url: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          area_zone_id?: number | null
          cicpa_registration_number?: string | null
          city_id?: number | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          currency_id?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          default_bank_id?: number | null
          emirate_id?: number | null
          icv_certificate_number?: string | null
          icv_certification_body?: string | null
          icv_company_type?: string | null
          icv_document_path?: string | null
          icv_expiry_date?: string | null
          icv_financial_year_end_date?: string | null
          icv_issue_date?: string | null
          icv_score_percentage?: number | null
          icv_status_code?: string | null
          icv_version?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          license_expiry_date?: string | null
          makani_number?: string | null
          notes?: string | null
          payment_term_id?: number | null
          po_box?: string | null
          primary_email?: string | null
          primary_mobile?: string | null
          primary_phone?: string | null
          sort_order?: number
          status_code?: string
          supplier_category_code?: string | null
          tax_type_id?: number | null
          trade_license_number?: string | null
          trn?: string | null
          updated_at?: string
          updated_by?: number | null
          vendor_category_code?: string | null
          vendor_code: string
          vendor_name_ar?: string | null
          vendor_name_en: string
          vendor_type_code: string
          website_url?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          area_zone_id?: number | null
          cicpa_registration_number?: string | null
          city_id?: number | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          currency_id?: number | null
          deactivated_at?: string | null
          deactivated_by?: number | null
          deactivation_reason?: string | null
          default_bank_id?: number | null
          emirate_id?: number | null
          icv_certificate_number?: string | null
          icv_certification_body?: string | null
          icv_company_type?: string | null
          icv_document_path?: string | null
          icv_expiry_date?: string | null
          icv_financial_year_end_date?: string | null
          icv_issue_date?: string | null
          icv_score_percentage?: number | null
          icv_status_code?: string | null
          icv_version?: string | null
          id?: number
          is_active?: boolean
          is_locked?: boolean
          is_system?: boolean
          license_expiry_date?: string | null
          makani_number?: string | null
          notes?: string | null
          payment_term_id?: number | null
          po_box?: string | null
          primary_email?: string | null
          primary_mobile?: string | null
          primary_phone?: string | null
          sort_order?: number
          status_code?: string
          supplier_category_code?: string | null
          tax_type_id?: number | null
          trade_license_number?: string | null
          trn?: string | null
          updated_at?: string
          updated_by?: number | null
          vendor_category_code?: string | null
          vendor_code?: string
          vendor_name_ar?: string | null
          vendor_name_en?: string
          vendor_type_code?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_area_zone_id_fkey"
            columns: ["area_zone_id"]
            isOneToOne: false
            referencedRelation: "areas_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_default_bank_id_fkey"
            columns: ["default_bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_payment_term_id_fkey"
            columns: ["payment_term_id"]
            isOneToOne: false
            referencedRelation: "payment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_tax_type_id_fkey"
            columns: ["tax_type_id"]
            isOneToOne: false
            referencedRelation: "tax_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_calendars: {
        Row: {
          calendar_code: string
          calendar_name: string
          calendar_type: string
          created_at: string
          created_by: number | null
          deleted_at: string | null
          effective_from: string | null
          effective_to: string | null
          has_ramadan_timing: boolean
          has_summer_timing: boolean
          id: number
          is_active: boolean
          notes: string | null
          owner_company_id: number | null
          updated_at: string
          updated_by: number | null
          weekend_days: string[]
          working_days: string[]
        }
        Insert: {
          calendar_code: string
          calendar_name: string
          calendar_type?: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          effective_from?: string | null
          effective_to?: string | null
          has_ramadan_timing?: boolean
          has_summer_timing?: boolean
          id?: never
          is_active?: boolean
          notes?: string | null
          owner_company_id?: number | null
          updated_at?: string
          updated_by?: number | null
          weekend_days?: string[]
          working_days?: string[]
        }
        Update: {
          calendar_code?: string
          calendar_name?: string
          calendar_type?: string
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          effective_from?: string | null
          effective_to?: string | null
          has_ramadan_timing?: boolean
          has_summer_timing?: boolean
          id?: never
          is_active?: boolean
          notes?: string | null
          owner_company_id?: number | null
          updated_at?: string
          updated_by?: number | null
          weekend_days?: string[]
          working_days?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "work_calendars_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_calendars_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_calendars_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_calendars_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_categories: {
        Row: {
          category_code: string
          created_at: string
          created_by: number | null
          description: string | null
          id: number
          is_active: boolean
          is_system: boolean
          name_ar: string | null
          name_en: string
          sort_order: number
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          category_code: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          category_code?: string
          created_at?: string
          created_by?: number | null
          description?: string | null
          id?: never
          is_active?: boolean
          is_system?: boolean
          name_ar?: string | null
          name_en?: string
          sort_order?: number
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "work_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_shifts: {
        Row: {
          break_end_time: string | null
          break_start_time: string | null
          calendar_id: number
          created_at: string
          created_by: number | null
          deleted_at: string | null
          id: number
          is_active: boolean
          is_overnight: boolean
          ramadan_end_time: string | null
          ramadan_start_time: string | null
          shift_code: string
          shift_end_time: string
          shift_name: string
          shift_start_time: string
          summer_end_time: string | null
          summer_start_time: string | null
          total_hours: number | null
          updated_at: string
          updated_by: number | null
        }
        Insert: {
          break_end_time?: string | null
          break_start_time?: string | null
          calendar_id: number
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          id?: never
          is_active?: boolean
          is_overnight?: boolean
          ramadan_end_time?: string | null
          ramadan_start_time?: string | null
          shift_code: string
          shift_end_time: string
          shift_name: string
          shift_start_time: string
          summer_end_time?: string | null
          summer_start_time?: string | null
          total_hours?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Update: {
          break_end_time?: string | null
          break_start_time?: string | null
          calendar_id?: number
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          id?: never
          is_active?: boolean
          is_overnight?: boolean
          ramadan_end_time?: string | null
          ramadan_start_time?: string | null
          shift_code?: string
          shift_end_time?: string
          shift_name?: string
          shift_start_time?: string
          summer_end_time?: string | null
          summer_start_time?: string | null
          total_hours?: number | null
          updated_at?: string
          updated_by?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "work_shifts_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "work_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_shifts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_shifts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_sites: {
        Row: {
          access_notes: string | null
          address_line_1: string | null
          address_line_2: string | null
          adnoc_required: boolean
          area_zone_id: number | null
          branch_id: number | null
          cicpa_required: boolean
          city_id: number | null
          closing_date: string | null
          country_id: number | null
          created_at: string
          created_by: number | null
          deleted_at: string | null
          description: string | null
          emirate_id: number | null
          id: number
          is_restricted_area: boolean
          latitude: number | null
          longitude: number | null
          makani_number: string | null
          opening_date: string | null
          owner_company_id: number
          party_id: number | null
          po_box: string | null
          site_code: string
          site_contact_email: string | null
          site_contact_name: string | null
          site_contact_phone: string | null
          site_name: string
          site_type: string
          status: string
          updated_at: string
          updated_by: number | null
          work_calendar_id: number | null
        }
        Insert: {
          access_notes?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          adnoc_required?: boolean
          area_zone_id?: number | null
          branch_id?: number | null
          cicpa_required?: boolean
          city_id?: number | null
          closing_date?: string | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          description?: string | null
          emirate_id?: number | null
          id?: never
          is_restricted_area?: boolean
          latitude?: number | null
          longitude?: number | null
          makani_number?: string | null
          opening_date?: string | null
          owner_company_id: number
          party_id?: number | null
          po_box?: string | null
          site_code: string
          site_contact_email?: string | null
          site_contact_name?: string | null
          site_contact_phone?: string | null
          site_name: string
          site_type: string
          status?: string
          updated_at?: string
          updated_by?: number | null
          work_calendar_id?: number | null
        }
        Update: {
          access_notes?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          adnoc_required?: boolean
          area_zone_id?: number | null
          branch_id?: number | null
          cicpa_required?: boolean
          city_id?: number | null
          closing_date?: string | null
          country_id?: number | null
          created_at?: string
          created_by?: number | null
          deleted_at?: string | null
          description?: string | null
          emirate_id?: number | null
          id?: never
          is_restricted_area?: boolean
          latitude?: number | null
          longitude?: number | null
          makani_number?: string | null
          opening_date?: string | null
          owner_company_id?: number
          party_id?: number | null
          po_box?: string | null
          site_code?: string
          site_contact_email?: string | null
          site_contact_name?: string | null
          site_contact_phone?: string | null
          site_name?: string
          site_type?: string
          status?: string
          updated_at?: string
          updated_by?: number | null
          work_calendar_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "work_sites_area_zone_id_fkey"
            columns: ["area_zone_id"]
            isOneToOne: false
            referencedRelation: "areas_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sites_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sites_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sites_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sites_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sites_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "owner_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sites_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "v_owner_companies_geography_migration_unmatched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sites_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sites_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sites_work_calendar_id_fkey"
            columns: ["work_calendar_id"]
            isOneToOne: false
            referencedRelation: "work_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_owner_companies_geography_migration_unmatched: {
        Row: {
          area_zone_id: number | null
          city_id: number | null
          company_code: string | null
          country_id: number | null
          created_at: string | null
          emirate_id: number | null
          id: number | null
          legacy_area_text: string | null
          legacy_city_text: string | null
          legacy_country_text: string | null
          legacy_emirate_text: string | null
          legal_name_ar: string | null
          legal_name_en: string | null
          status: string | null
          unmatched_area: boolean | null
          unmatched_city: boolean | null
          unmatched_country: boolean | null
          unmatched_emirate: boolean | null
          updated_at: string | null
        }
        Insert: {
          area_zone_id?: number | null
          city_id?: number | null
          company_code?: string | null
          country_id?: number | null
          created_at?: string | null
          emirate_id?: number | null
          id?: number | null
          legacy_area_text?: string | null
          legacy_city_text?: string | null
          legacy_country_text?: string | null
          legacy_emirate_text?: string | null
          legal_name_ar?: string | null
          legal_name_en?: string | null
          status?: string | null
          unmatched_area?: never
          unmatched_city?: never
          unmatched_country?: never
          unmatched_emirate?: never
          updated_at?: string | null
        }
        Update: {
          area_zone_id?: number | null
          city_id?: number | null
          company_code?: string | null
          country_id?: number | null
          created_at?: string | null
          emirate_id?: number | null
          id?: number | null
          legacy_area_text?: string | null
          legacy_city_text?: string | null
          legacy_country_text?: string | null
          legacy_emirate_text?: string | null
          legal_name_ar?: string | null
          legal_name_en?: string | null
          status?: string | null
          unmatched_area?: never
          unmatched_city?: never
          unmatched_country?: never
          unmatched_emirate?: never
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_companies_area_zone_id_fkey"
            columns: ["area_zone_id"]
            isOneToOne: false
            referencedRelation: "areas_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_companies_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_companies_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_companies_emirate_id_fkey"
            columns: ["emirate_id"]
            isOneToOne: false
            referencedRelation: "emirates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      approve_dms_ai_intake: {
        Args: { p_payload: Json }
        Returns: {
          out_document_id: number
          out_document_no: string
          out_status: string
        }[]
      }
      claim_dms_ai_jobs: {
        Args: { p_limit?: number; p_worker_id: string }
        Returns: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          created_by: number | null
          failed_at: string | null
          id: number
          idempotency_key: string | null
          job_status: string
          job_type: string
          last_error_code: string | null
          last_error_message: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload_json: Json
          priority: number
          related_ai_result_id: number | null
          related_approve_run_id: number | null
          related_document_id: number | null
          related_upload_session_id: number | null
          run_after: string
          safe_error_json: Json | null
          started_at: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "dms_ai_job_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_dms_ai_job: { Args: { p_job_id: number }; Returns: undefined }
      current_user_branch_id: { Args: never; Returns: number }
      current_user_can_manage_ai_entity: {
        Args: { p_entity_id: number; p_entity_type: string }
        Returns: boolean
      }
      current_user_can_manage_employee: {
        Args: { p_employee_id: number }
        Returns: boolean
      }
      current_user_can_manage_employee_hr_actions: {
        Args: { p_employee_id: number }
        Returns: boolean
      }
      current_user_can_manage_employee_medical: {
        Args: { p_employee_id: number }
        Returns: boolean
      }
      current_user_can_manage_employee_operations: {
        Args: { p_employee_id: number }
        Returns: boolean
      }
      current_user_can_manage_employee_payroll: {
        Args: { p_employee_id: number }
        Returns: boolean
      }
      current_user_can_manage_hr_recruitment: { Args: never; Returns: boolean }
      current_user_can_manage_hr_settings: { Args: never; Returns: boolean }
      current_user_can_manage_user_role_assignment: {
        Args: {
          target_branch_id: number
          target_owner_company_id: number
          target_role_id: number
          target_user_profile_id: number
        }
        Returns: boolean
      }
      current_user_can_view_ai_entity: {
        Args: { p_entity_id: number; p_entity_type: string }
        Returns: boolean
      }
      current_user_can_view_employee: {
        Args: { p_employee_id: number }
        Returns: boolean
      }
      current_user_can_view_employee_hr_actions: {
        Args: { p_employee_id: number }
        Returns: boolean
      }
      current_user_can_view_employee_medical: {
        Args: { p_employee_id: number }
        Returns: boolean
      }
      current_user_can_view_employee_operations: {
        Args: { p_employee_id: number }
        Returns: boolean
      }
      current_user_can_view_employee_payroll: {
        Args: { p_employee_id: number }
        Returns: boolean
      }
      current_user_can_view_hr_recruitment: { Args: never; Returns: boolean }
      current_user_can_view_hr_settings: { Args: never; Returns: boolean }
      current_user_has_permission: {
        Args: { permission_code: string }
        Returns: boolean
      }
      current_user_has_permission_any_scope: {
        Args: { permission_code: string }
        Returns: boolean
      }
      current_user_has_permission_globally: {
        Args: { permission_code: string }
        Returns: boolean
      }
      current_user_has_permission_in_branch: {
        Args: { permission_code: string; target_branch_id: number }
        Returns: boolean
      }
      current_user_has_permission_in_company: {
        Args: { permission_code: string; target_owner_company_id: number }
        Returns: boolean
      }
      current_user_has_role: { Args: { role_code: string }; Returns: boolean }
      current_user_has_role_in_branch: {
        Args: { role_code: string; target_branch_id: number }
        Returns: boolean
      }
      current_user_has_role_in_company: {
        Args: { role_code: string; target_owner_company_id: number }
        Returns: boolean
      }
      current_user_is_global_admin: { Args: never; Returns: boolean }
      current_user_owner_company_id: { Args: never; Returns: number }
      current_user_profile_id: { Args: never; Returns: number }
      detect_possible_party_duplicates: {
        Args: {
          p_exclude_party_id?: number
          p_iban?: string
          p_legal_name_en?: string
          p_license_number?: string
          p_main_email?: string
          p_main_mobile?: string
          p_main_phone?: string
          p_trade_name_en?: string
          p_trn?: string
          p_website?: string
        }
        Returns: {
          display_name: string
          match_score: number
          match_type: string
          party_code: string
          party_id: number
        }[]
      }
      erp_vault_create_secret: {
        Args: { p_description?: string; p_name: string; p_secret: string }
        Returns: string
      }
      erp_vault_get_secret: { Args: { p_id: string }; Returns: string }
      erp_vault_update_secret: {
        Args: { p_id: string; p_secret: string }
        Returns: undefined
      }
      fail_dms_ai_job: {
        Args: {
          p_error_code: string
          p_error_message: string
          p_job_id: number
          p_retry?: boolean
        }
        Returns: undefined
      }
      generate_next_reference_number: {
        Args: {
          p_document_type_code?: string
          p_generated_by?: number
          p_generation_reason?: string
          p_rule_code?: string
          p_target_record_id?: number
          p_target_table_name?: string
        }
        Returns: {
          generated_reference_number: string
          generated_sequence_number: number
          generation_status: string
          numbering_rule_id: number
          sequence_state_id: number
        }[]
      }
      get_public_verification_by_token: {
        Args: { p_token: string }
        Returns: Json
      }
      preview_next_reference_number: {
        Args: {
          p_document_type_code?: string
          p_next_sequence_number?: number
          p_rule_code?: string
        }
        Returns: {
          document_prefix: string
          format_template: string
          preview_reference_number: string
          rule_id: number
          sequence_number: number
        }[]
      }
      purge_dms_document: {
        Args: { p_id: number }
        Returns: {
          out_files_found: number
          out_storage_files: Json
        }[]
      }
      recover_stale_dms_ai_jobs: {
        Args: { p_stale_after_minutes?: number }
        Returns: number
      }
      reserve_dms_document_id: { Args: never; Returns: number }
      search_dms_document_chunks_by_embedding: {
        Args: {
          p_document_type_id?: number
          p_is_admin?: boolean
          p_match_count?: number
          p_match_threshold?: number
          p_query_embedding: string
        }
        Returns: {
          chunk_id: number
          chunk_index: number
          confidentiality_level: string
          document_id: number
          document_no: string
          similarity: number
          snippet: string
          title: string
        }[]
      }
      search_dms_documents_by_embedding: {
        Args: {
          p_exclude_document_id?: number
          p_is_admin?: boolean
          p_match_count?: number
          p_match_threshold?: number
          p_query_embedding: string
        }
        Returns: {
          ai_risk_level: string
          ai_summary: string
          completeness_score: number
          confidentiality_level: string
          document_id: number
          document_no: string
          expiry_date: string
          similarity: number
          title: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      update_my_profile: {
        Args: {
          p_avatar_url?: string
          p_display_name?: string
          p_phone?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
