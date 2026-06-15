# ERP BASE 002F.5A.0 — Live Supabase Schema Findings

**Generated:** 2026-06-13  
**Project:** `https://mmiefuieduzdiiwnqpie.supabase.co`  
**Tool:** `user-supabase` MCP (`execute_sql`)  
**Phase:** ERP BASE 002F.5A.0 — Integrity Review Only

---

## 1. Project URL Verification

| Item | Value | Status |
|---|---|---|
| Expected URL | `https://mmiefuieduzdiiwnqpie.supabase.co` | ✅ CONFIRMED |
| Tool used | `user-supabase` MCP | ✅ Correct project |

---

## 2. Existing Tables (required by V3 FK targets)

| Table | Exists | Has Data | Notes |
|---|---|---|---|
| `user_profiles` | ✅ | Yes | Has `auth_user_id UUID NOT NULL` |
| `roles` | ✅ | Yes | See §4 for role list |
| `permissions` | ✅ | Yes | Has `action_code TEXT NOT NULL` — **critical** |
| `role_permissions` | ✅ | Yes | `id, role_id, permission_id, created_at` |
| `audit_logs` | ✅ | Yes | See §6 for column names |
| `global_numbering_rules` | ✅ | Yes | All V3 columns present, extra columns exist |
| `global_lookup_categories` | ✅ | Yes | |
| `global_lookup_values` | ✅ | Yes | |
| `countries` | ✅ | Yes | `id BIGINT PK` |
| `emirates` | ✅ | Yes | `id BIGINT PK` |
| `cities` | ✅ | Yes | `id BIGINT PK` |
| `areas_zones` | ✅ | Yes | `id BIGINT PK` |
| `currencies` | ✅ | Yes | `id BIGINT PK` |
| `payment_terms` | ✅ | Yes | `id BIGINT PK` |
| `tax_types` | ✅ | Yes | `id BIGINT PK` |
| `banks` | ✅ | Yes | `id BIGINT PK` |
| `customers` | ✅ | Empty | 0 rows — test data only |
| `customer_contacts` | ✅ | Empty | 0 rows |
| `customer_addresses` | ✅ | Empty | 0 rows |
| `customer_bank_details` | ✅ | Empty | 0 rows |
| `customer_documents` | ✅ | Empty | 0 rows |
| `vendors` | ✅ | Empty | 0 rows |
| `subcontractors` | ✅ | Empty | 0 rows |
| `consultants` | ✅ | Empty | 0 rows |
| `government_authorities` | ✅ | Empty | 0 rows |
| `recruitment_agencies` | ✅ | Empty | 0 rows |

**Additional live tables (not referenced in V3 plan):**  
`branches`, `cost_centers`, `owner_companies`, `ports`, `profit_centers`, `units_of_measure`, `uom_categories`, `uom_conversions`, `user_roles`, `global_numbering_generated_references`, `global_numbering_sequence_states`, plus full `vendor_*`, `subcontractor_*`, `consultant_*`, `government_authority_*`, `recruitment_agency_*` child tables.

---

## 3. Helper Functions

| Function | Signature | Exists | V3 Usage | Status |
|---|---|---|---|---|
| `current_user_has_permission` | `(permission_code text) → boolean` | ✅ | Yes, in all RLS policies | ✅ MATCH |
| `current_user_has_role` | `(role_code text) → boolean` | ✅ | Yes, in all RLS policies | ✅ MATCH |
| `current_user_profile_id` | `() → bigint` | ✅ | Not used in V3 | ⚠️ Should use in `party_notes` RLS |
| `generate_next_reference_number` | `(p_rule_code, p_document_type_code, p_target_table_name, p_target_record_id, p_generation_reason, p_generated_by) → TABLE` | ✅ | Referenced in plan (not in SQL) | ✅ |
| `logAudit(...)` | N/A | ❌ DOES NOT EXIST | Referenced in tech plan | ⚠️ Use direct INSERT INTO audit_logs |
| `current_user_has_permission_any_scope` | `(text) → boolean` | ✅ | Not used | Available |
| `current_user_is_global_admin` | `() → boolean` | ✅ | Not used | Available |

---

## 4. RBAC — Live Roles

| Role Code | Exists in Live DB | In V3 Plan | Status |
|---|---|---|---|
| `system_admin` | ✅ | ✅ | ✅ OK |
| `group_admin` | ✅ | ✅ | ✅ OK |
| `company_admin` | ✅ | ✅ | ✅ OK |
| `branch_admin` | ✅ | ✅ | ✅ OK |
| `finance_manager` | ✅ | ✅ | ✅ OK |
| `procurement_manager` | ✅ | ✅ | ✅ OK |
| `hr_manager` | ✅ | ✅ | ✅ OK |
| `hse_manager` | ✅ | ✅ | ✅ OK |
| `viewer` | ❌ MISSING | ✅ (used in V3 SQL) | 🔴 CRITICAL: V3 SQL uses `viewer` but live has `read_only_user` |
| `sales_manager` | ❌ MISSING | ✅ (planned/commented) | ⚠️ Not in live DB — keep commented in SQL |
| `read_only_user` | ✅ | ❌ Not referenced | Fix: replace `viewer` with `read_only_user` |
| `dms_manager` | ✅ | ❌ | Extra live role |
| `employee_self_service` | ✅ | ❌ | Extra live role |
| `fleet_manager` | ✅ | ❌ | Extra live role |
| `inventory_manager` | ✅ | ❌ | Extra live role |
| `operations_manager` | ✅ | ❌ | Extra live role |
| `rental_manager` | ✅ | ❌ | Extra live role |
| `workshop_manager` | ✅ | ❌ | Extra live role |
| `test_role` | ✅ | ❌ | Test role |

---

## 5. Permissions Table — Structure

Live `permissions` table columns:

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT | NO | PK |
| `permission_code` | TEXT | NO | UQ (used in V3 INSERT ON CONFLICT) |
| `permission_name` | TEXT | NO | |
| `module_code` | TEXT | NO | |
| **`action_code`** | **TEXT** | **NO** | **V3 INSERT MISSING THIS — 🔴 CRITICAL** |
| `description` | TEXT | YES | |
| `is_active` | BOOLEAN | NO | |
| `created_at` | TIMESTAMPTZ | NO | |
| `updated_at` | TIMESTAMPTZ | NO | |
| `display_name` | TEXT | YES | |
| `is_system_permission` | BOOLEAN | YES | |
| `is_visible` | BOOLEAN | YES | |
| `sort_order` | INTEGER | YES | |

**Issue:** V3 SQL INSERT does not include `action_code` which is `NOT NULL`. The INSERT will fail.  
**Fix:** Extract `action_code` from the last segment of `permission_code` (e.g., `master_data.parties.view` → `'view'`).

Existing `master_data.party_master.*` permissions use `module_code = 'PARTIES'` (uppercase). New `master_data.parties.*` permissions should use `module_code = 'MASTER_DATA'` to be consistent with other modules.

---

## 6. Audit Logs — Actual Columns

Live `audit_logs` table columns (used in V3 Tab 13 UI):

| Live Column | V3 Plan Referenced As | Match |
|---|---|---|
| `id` | `id` | ✅ |
| `actor_user_profile_id` | `user` | ⚠️ Use `actor_user_profile_id → user_profiles.full_name` |
| `module_code` | `table` | ⚠️ V3 says "table" — actual is `entity_name` |
| `entity_name` | `table` | ✅ Use `entity_name` |
| `entity_id` | `record_id` | ⚠️ Use `entity_id` |
| `entity_reference` | — | Not in V3 UI spec (shows human-readable ref) |
| `action` | `action` | ✅ |
| `old_values` (jsonb) | `before/after summary` | ✅ |
| `new_values` (jsonb) | `before/after summary` | ✅ |
| `created_at` | `date/time` | ✅ |

No `remarks` column in live `audit_logs`. V3 UI spec lists `remarks` — this should be removed.

---

## 7. `global_numbering_rules` — Column Comparison

All V3 SQL INSERT columns match live table: ✅

| V3 INSERT Column | Live Column | Match |
|---|---|---|
| `rule_code` | `rule_code` | ✅ |
| `rule_name` | `rule_name` | ✅ |
| `description` | `description` | ✅ |
| `module_code` | `module_code` | ✅ |
| `module_name` | `module_name` | ✅ |
| `document_type_code` | `document_type_code` | ✅ |
| `document_type_name` | `document_type_name` | ✅ |
| `document_prefix` | `document_prefix` | ✅ |
| `separator` | `separator` | ✅ |
| `format_template` | `format_template` | ✅ |
| `sequence_length` | `sequence_length` | ✅ |
| `padding_character` | `padding_character` | ✅ |
| `starting_sequence_number` | `starting_sequence_number` | ✅ |
| `current_sequence_number` | `current_sequence_number` | ✅ |
| `next_sequence_number` | `next_sequence_number` | ✅ |
| `reset_policy` | `reset_policy` | ✅ |
| `reserve_on_draft` | `reserve_on_draft` | ✅ |
| `reserve_on_submit` | `reserve_on_submit` | ✅ |
| `allow_manual_override` | `allow_manual_override` | ✅ |
| `allow_gaps` | `allow_gaps` | ✅ |
| `is_active` | `is_active` | ✅ |
| `is_locked` | `is_locked` | ✅ |
| `notes` | `notes` | ✅ |

Live has extra columns with defaults: `manual_override_requires_permission (DEFAULT true)`, `cancelled_number_policy (DEFAULT 'never_reuse')`, `duplicate_prevention_scope (DEFAULT 'document_type')`, `effective_from (NULL)`, `effective_to (NULL)`. V3 INSERT does not provide these — they will use defaults. ✅ Safe.

---

## 8. Geography & Finance FK Targets

| Table | PK Column | PK Type | V3 FK References | Status |
|---|---|---|---|---|
| `countries` | `id` | BIGINT | `country_id → countries(id)` | ✅ |
| `emirates` | `id` | BIGINT | `emirate_id → emirates(id)` | ✅ |
| `cities` | `id` | BIGINT | `city_id → cities(id)` | ✅ |
| `areas_zones` | `id` | BIGINT | `area_zone_id → areas_zones(id)` | ✅ |
| `currencies` | `id` | BIGINT | `currency_id → currencies(id)` | ✅ |
| `payment_terms` | `id` | BIGINT | `payment_term_id → payment_terms(id)` | ✅ |
| `tax_types` | `id` | BIGINT | `tax_type_id → tax_types(id)` | ✅ |
| `banks` | `id` | BIGINT | `bank_id → banks(id)` | ✅ |
| `user_profiles` | `id` | BIGINT | `*_by → user_profiles(id)` | ✅ |

---

## 9. Party Table Name Conflict Check

**All 53 new party master table names are CLEAN — no conflicts with existing tables.** ✅

Checked: `parties`, `party_types`, `party_type_assignments`, `party_natures`, `party_statuses`, `party_contacts`, `party_addresses`, `party_bank_details`, `party_documents`, `party_notes`, `party_compliance_profiles`, `party_licenses`, `party_tax_registrations`, `party_finance_profiles`, `payment_methods`, `customer_categories`, `customer_statuses`, `vendor_categories`, `vendor_ratings`, `industry_sectors`, `sales_regions` — none exist in current schema.

---

## 10. RLS Status of Existing Tables

All relevant existing tables have RLS enabled: ✅  
`banks`, `countries`, `currencies`, `customers`, `global_numbering_rules`, `payment_terms`, `permissions`, `role_permissions`, `roles`, `tax_types`, `user_profiles`.

---

## 11. Customer Data Risk Assessment

| Table | Row Count | FK Dependencies | Retirement Risk |
|---|---|---|---|
| `customers` | 0 | None found | LOW |
| `customer_contacts` | 0 | FK → customers | LOW |
| `customer_addresses` | 0 | FK → customers | LOW |
| `customer_bank_details` | 0 | FK → customers | LOW |
| `customer_documents` | 0 | FK → customers | LOW |

Customer tables contain only test data (0 rows). Safe to retire in Phase 5A.5 after explicit approval. No FKs from other modules point to `customers`.

---

*End of Schema Findings — REVIEW ONLY*
