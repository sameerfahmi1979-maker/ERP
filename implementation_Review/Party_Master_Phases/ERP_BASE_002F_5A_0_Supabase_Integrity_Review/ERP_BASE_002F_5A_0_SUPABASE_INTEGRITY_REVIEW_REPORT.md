# ERP BASE 002F.5A.0 — Supabase Integrity Review Report

**REVIEW ONLY — DO NOT IMPLEMENT**  
**Generated:** 2026-06-13  
**Phase:** ERP BASE 002F.5A.0 — Pre-Implementation Integrity Check  
**Reviewed by:** Cursor Agent (Sonnet 4.6)  
**MCP Tool:** `user-supabase` (`execute_sql`)

---

## OVERALL RESULT

```
╔══════════════════════════════════════════════════════╗
║  PASS WITH FIXES                                     ║
║                                                      ║
║  V3 had 2 critical SQL issues and 4 design issues.   ║
║  All have been fixed in the SUPABASE_VERIFIED files. ║
║  Corrected review-only files are generated and       ║
║  ready for 5A.1 implementation prompt.               ║
╚══════════════════════════════════════════════════════╝
```

---

## 1. Supabase Project Confirmation

| Check | Result |
|---|---|
| Expected URL | `https://mmiefuieduzdiiwnqpie.supabase.co` |
| Actual URL (MCP) | `https://mmiefuieduzdiiwnqpie.supabase.co` |
| Tool used | `user-supabase` MCP |
| Project identity | ALGT ERP / Alliance Gulf ERP |
| **Status** | ✅ CONFIRMED — Correct project |

---

## 2. Live Schema Summary

| Metric | Value |
|---|---|
| Total public tables | 56 |
| Tables with RLS enabled | All key tables confirmed |
| Helper functions | 23 public functions |
| Roles in live DB | 17 |
| Permissions in live DB | 30+ |

---

## 3. Existing Table Verification

| Category | Result |
|---|---|
| Required FK target tables (countries, emirates, cities, areas_zones, currencies, payment_terms, tax_types, banks, user_profiles) | ✅ ALL EXIST with BIGINT id PKs |
| RBAC tables (roles, permissions, role_permissions) | ✅ ALL EXIST |
| Audit (audit_logs) | ✅ EXISTS |
| Numbering (global_numbering_rules) | ✅ EXISTS |
| Legacy party tables (customers, vendors, etc.) | ✅ ALL EXIST, all EMPTY (0 rows) |

---

## 4. Helper Function Verification

| Function | Exists | Used in V3 | Notes |
|---|---|---|---|
| `current_user_has_permission(text)` | ✅ | ✅ (all RLS policies) | Exact signature match |
| `current_user_has_role(text)` | ✅ | ✅ (all RLS policies) | Exact signature match |
| `current_user_profile_id()` | ✅ | ❌ (not used) | Used in VERIFIED fix for `party_notes` RLS |
| `generate_next_reference_number(...)` | ✅ | Referenced in plan | Available for use in server actions |
| `logAudit(...)` | ❌ | ❌ | Does not exist — plan updated to use direct INSERT |

---

## 5. RBAC Verification

### 5.1 Roles

| Role | In Live DB | In V3 SQL | Status |
|---|---|---|---|
| `system_admin` | ✅ | ✅ | ✅ OK |
| `group_admin` | ✅ | ✅ | ✅ OK |
| `company_admin` | ✅ | ✅ | ✅ OK |
| `branch_admin` | ✅ | ✅ | ✅ OK |
| `finance_manager` | ✅ | ✅ | ✅ OK |
| `procurement_manager` | ✅ | ✅ | ✅ OK |
| `hr_manager` | ✅ | ✅ | ✅ OK |
| `hse_manager` | ✅ | ✅ | ✅ OK |
| `viewer` | ❌ | ✅ (used) | 🔴 **FIXED** → `read_only_user` |
| `sales_manager` | ❌ | ✅ (commented) | ⚠️ Keep commented until role created |
| `read_only_user` | ✅ | ❌ | Now correctly mapped in VERIFIED SQL |

### 5.2 Permissions table structure

| Column | Required | In V3 INSERT | Status |
|---|---|---|---|
| `permission_code` | NOT NULL | ✅ | OK |
| `permission_name` | NOT NULL | ✅ | OK |
| `module_code` | NOT NULL | ✅ | OK |
| `action_code` | NOT NULL | ❌ MISSING | 🔴 **FIXED** in VERIFIED SQL |
| `description` | NULLABLE | ✅ | OK |
| `is_active` | NOT NULL | ✅ | OK |

### 5.3 Permission naming pattern

Existing permissions use pattern: `<module>.<sub>.<action>` (e.g., `master_data.party_master.view`).  
New V3 permissions follow: `master_data.parties.<action>` — consistent pattern. ✅  
Existing `master_data.party_master.*` permissions remain (backward compat during coexistence).

---

## 6. Numbering Engine Verification

| Item | Status |
|---|---|
| `global_numbering_rules` table exists | ✅ |
| All V3 INSERT column names match live table | ✅ ALL MATCH |
| Extra live columns have defaults | ✅ Safe — no INSERT failure |
| 8 required numbering rules will be new | ✅ None pre-exist |
| `generate_next_reference_number()` function | ✅ EXISTS — use in server actions |

---

## 7. Audit System Verification

Live `audit_logs` columns: `id, actor_user_profile_id, owner_company_id, branch_id, module_code, entity_name, entity_id, entity_reference, action, old_values, new_values, ip_address, user_agent, created_at`.

| V3 Plan Reference | Actual Column | Fixed |
|---|---|---|
| "user" | `actor_user_profile_id` + `user_profiles.full_name` join | ✅ FIXED in UI/UX |
| "table" | `entity_name` | ✅ FIXED in UI/UX |
| "record_id" | `entity_id` | ✅ FIXED in UI/UX |
| "remarks" | — (does not exist) | ✅ REMOVED from UI/UX |
| `logAudit()` function | Direct INSERT INTO audit_logs | ✅ UPDATED in Tech Plan |

---

## 8. Geography & Finance FK Target Verification

All V3 FK targets confirmed valid:

| FK Target | PK Column | Type | Status |
|---|---|---|---|
| `countries(id)` | id | BIGINT | ✅ |
| `emirates(id)` | id | BIGINT | ✅ |
| `cities(id)` | id | BIGINT | ✅ |
| `areas_zones(id)` | id | BIGINT | ✅ |
| `currencies(id)` | id | BIGINT | ✅ |
| `payment_terms(id)` | id | BIGINT | ✅ |
| `tax_types(id)` | id | BIGINT | ✅ |
| `banks(id)` | id | BIGINT | ✅ |
| `user_profiles(id)` | id | BIGINT | ✅ |

---

## 9. Customer Table Dependency Check

| Item | Status |
|---|---|
| `customers` row count | 0 — test data only |
| `customer_contacts` row count | 0 |
| `customer_addresses` row count | 0 |
| `customer_bank_details` row count | 0 |
| `customer_documents` row count | 0 |
| Any FK from other modules → `customers` | None found |
| Retirement risk | LOW — safe to retire in Phase 5A.5 after approval |

**Conclusion:** Legacy customer module retirement in Phase 5A.5 carries no data migration risk. No real data to preserve.

---

## 10. Party Table Name Conflict Check

**Result: ZERO CONFLICTS** ✅

All 53 planned Party Master table names are new. None of the following already exist: `parties`, `party_types`, `party_type_assignments`, `party_natures`, `party_statuses`, `party_contacts`, `party_addresses`, `party_bank_details`, `party_documents`, `party_notes`, `party_compliance_profiles`, `party_licenses`, `party_tax_registrations`, `party_finance_profiles`, `payment_methods`, `customer_categories`, `customer_statuses`, `vendor_categories`, `vendor_ratings`, and all other V3 table names.

---

## 11. V3 SQL Integrity Review

| Check | Result |
|---|---|
| SQL has REVIEW ONLY warning header | ✅ |
| No DROP customer table statements | ✅ |
| No source code assumptions | ✅ |
| All 53 CREATE TABLE statements have valid FK targets | ✅ (all FKs verified) |
| FK creation order correct (lookup → core → child → profiles) | ✅ |
| Circular FK handled (licenses ↔ documents) | ✅ Deferred FK note present |
| RLS ENABLE on every new table (53 total) | ✅ |
| Explicit SELECT/INSERT/UPDATE/DELETE for every table | ✅ |
| Policy helper functions exist | ✅ `current_user_has_permission`, `current_user_has_role` |
| Permission INSERT `action_code` column | ❌ MISSING → ✅ FIXED in VERIFIED SQL |
| `viewer` role code | ❌ WRONG → ✅ FIXED to `read_only_user` |
| Numbering rule INSERT columns match live table | ✅ ALL MATCH |
| Seed INSERT columns match planned table structures | ✅ |
| Partial unique indexes use valid PostgreSQL syntax | ✅ |
| `pg_trgm` usage is commented out / optional | ✅ |
| Duplicate detection function references valid columns | ✅ |
| Rollback section is review-only | ✅ |

---

## 12. Design Corrections Applied

### Fix 1 (Prompt §5.1 requirement)
`party_finance_profiles` payment hold fields renamed to avoid confusion:
- `payment_hold` → `finance_hold`
- `payment_hold_reason` → `finance_hold_reason`
- `payment_hold_by` → `finance_hold_by`
- `payment_hold_at` → `finance_hold_at`

`party_compliance_profiles` fields (`payment_hold`, `work_hold`) remain unchanged.

### Fix 2
`permissions` INSERT now correctly includes `action_code` for all 24 new permissions.

### Fix 3
`role_permissions` viewer section now uses `read_only_user`.

### Fix 4
`party_notes` RLS uses `current_user_profile_id()` (live function).

### Fix 5
UI/UX Tab 13 audit column references updated to match live `audit_logs` schema.

### Fix 6
Tech plan updated: `logAudit()` → direct `INSERT INTO audit_logs` with correct columns.

---

## 13. Remaining Open Decisions for Sameer

These were documented in V3 Review Notes and are unchanged:

| # | Decision | Status |
|---|---|---|
| 2.1 | `pg_trgm` extension approval | Open |
| 2.3 | `sales_manager` role creation | Open — keep commented |
| 2.4 | `bank_name_text` or force FK | Open |
| 2.5 | Auto-create `party_compliance_profiles` on save | Open |
| 2.6 | Auto-create `party_finance_profiles` on save | Open |
| 2.7 | Duplicate detection threshold | Open |
| 2.8 | Government portal username reference sufficiency | Open |
| 2.9 | DMS integration vs basic Supabase Storage | Open |
| 2.2 | `payment_hold` naming | **RESOLVED** — renamed to `finance_hold` |

---

## 14. Files Generated by This Review

| File | Location |
|---|---|
| `ERP_BASE_002F_5A_0_SUPABASE_INTEGRITY_REVIEW_REPORT.md` | `ERP_BASE_002F_5A_0_Supabase_Integrity_Review/` |
| `ERP_BASE_002F_5A_0_SUPABASE_SCHEMA_FINDINGS.md` | `ERP_BASE_002F_5A_0_Supabase_Integrity_Review/` |
| `ERP_BASE_002F_5A_0_V3_FIXES_APPLIED.md` | `ERP_BASE_002F_5A_0_Supabase_Integrity_Review/` |
| `ERP_BASE_002F_5A_V3_PARTY_MASTER_DRAFT_MIGRATION_REVIEW_ONLY_SUPABASE_VERIFIED.sql` | `ERP_BASE_002F_5A_0_Supabase_Integrity_Review/` |
| `ERP_BASE_002F_5A_V3_FINAL_REVIEW_ONLY_PARTY_MASTER_TECHNICAL_PLAN_SUPABASE_VERIFIED.md` | `ERP_BASE_002F_5A_0_Supabase_Integrity_Review/` |
| `ERP_BASE_002F_5A_V3_PARTY_MASTER_DATABASE_FIELD_MAP_SUPABASE_VERIFIED.md` | `ERP_BASE_002F_5A_0_Supabase_Integrity_Review/` |
| `ERP_BASE_002F_5A_V3_PARTY_MASTER_UI_UX_AND_FIELD_MAP_SUPABASE_VERIFIED.md` | `ERP_BASE_002F_5A_0_Supabase_Integrity_Review/` |
| `ERP_BASE_002F_5A_V3_PARTY_MASTER_REVIEW_NOTES_AND_DECISIONS_SUPABASE_VERIFIED.md` | `ERP_BASE_002F_5A_0_Supabase_Integrity_Review/` |

---

## 15. Recommendation for Next Step

**Status: PASS WITH FIXES**

The V3 Party Master plan is Supabase-compatible after the corrections documented above.

When Sameer approves the SUPABASE_VERIFIED files:

**Proceed to Phase 5A.1 — Party Master Database Foundation:**
- Apply `ERP_BASE_002F_5A_V3_PARTY_MASTER_DRAFT_MIGRATION_REVIEW_ONLY_SUPABASE_VERIFIED.sql` to the live Supabase project via `apply_migration` (after staging test).
- Resolve the 6 open decisions in Review Notes before or during 5A.1.
- Confirm `sales_manager` role creation.
- Do not begin 5A.2 (UI) until 5A.1 database is stable.

**Do not:**
- Apply the original (non-VERIFIED) SQL.
- Begin any source code changes.
- Retire the Customer module.

---

*End of Integrity Review Report — REVIEW ONLY — FOR SAMEER APPROVAL*
