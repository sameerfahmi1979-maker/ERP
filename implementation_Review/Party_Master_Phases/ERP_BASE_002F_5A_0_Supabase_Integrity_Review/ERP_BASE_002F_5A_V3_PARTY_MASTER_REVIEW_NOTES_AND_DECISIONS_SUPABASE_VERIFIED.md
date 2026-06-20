# ERP BASE 002F.5A V3 — Party Master Review Notes and Decisions (SUPABASE VERIFIED)

**REVIEW ONLY — FOR SAMEER REVIEW**  
**Phase:** ERP BASE 002F.5A V3 — Supabase Integrity Verified  
**Generated:** 2026-06-13  
**Supabase Verified:** 2026-06-13 via `user-supabase` MCP — `https://mmiefuieduzdiiwnqpie.supabase.co`  
**Status:** PASS WITH FIXES — Awaiting Sameer approval before any implementation

---

## 1. V2 Issues Fixed in V3

| # | Issue | V3 Fix |
|---|---|---|
| 1 | RLS placeholder "apply similarly" language | Every table has 4 explicit named DROP/CREATE POLICY blocks in SQL |
| 2 | `party_finance_profiles` missing `payment_hold_by` and `payment_hold_at` | Added — shows who put on hold and when |
| 3 | `party_notes` missing `note_code` and `follow_up_date` | Added; `is_important` removed (not required by V3 spec) |
| 4 | Profile tables used unnamed `remarks` | Each profile has typed name: `customer_remarks`, `vendor_remarks`, `subcontractor_remarks`, `consultant_remarks`, `recruitment_remarks`, `government_remarks` |
| 5 | V2 had permission `manage_service_categories` | Renamed to `manage_services` per V3 prompt §17 |
| 6 | V2 missing `view_bank_details`, `lock`, `view_audit`, `print` permissions | All 4 added; total now 24 permissions |
| 7 | V2 bank details RLS SELECT only allowed `manage_bank_details` | Fixed: SELECT now allows `view_bank_details OR manage_bank_details OR system_admin` |
| 8 | V2 Government Authority Profile only showed for 2 types | Fixed: Shows for GOVERNMENT_AUTHORITY, LICENSE_ISSUER, **and FREE_ZONE_AUTHORITY** |
| 9 | V2 duplicate function named `find_possible_duplicate_parties` | Renamed to `detect_possible_party_duplicates` per V3 §19 |
| 10 | V2 `PartySelect` missing `cityId` and `excludePartyId` props | Both added in V3 UI/UX spec §7 |
| 11 | V2 filtered view simplified columns missing Status, Main Phone, Main Email | Added per V3 §12.3 |
| 12 | V2 customer profile had `customer_type_code` text field | Removed; all FK-based per V3 §9 dynamic data rule |
| 13 | V2 had only 4 output files | V3 produces 5 files (new: Review Notes file) |
| 14 | V2 `sales_manager` role missing from permission mapping | Added (with note: verify role exists before insert) |
| 15 | V2 `payment_methods` table not explicitly shown as new table | Explicitly created in V3 as a proper lookup master |

---

## 2. Open Decisions for Sameer

### 2.1 `pg_trgm` Extension

**Decision needed:** Should ALGT ERP enable the `pg_trgm` PostgreSQL extension for fuzzy duplicate detection (similar names)?

- Without `pg_trgm`: Duplicate detection falls back to exact name matches only (TRN, license, IBAN, email, mobile, exact legal name, exact trade name).
- With `pg_trgm`: Similar name detection (e.g., "Alliance Group" vs "Alliance Grp") using similarity > 0.45 threshold. Better UX for data quality.

**Options:**
- A. Enable `pg_trgm` (recommended for duplicate detection quality).
- B. Skip for now; add in Phase 5A.4.

---

### 2.2 `payment_hold` Duplication

**Observation:** `payment_hold` appears in **both** `party_finance_profiles` and `party_compliance_profiles`.

- `party_finance_profiles.payment_hold` was added per the prompt §10.4 for finance-level holds.
- `party_compliance_profiles.payment_hold` was also specified in prompt §10.8 for compliance-level holds.

**Decision needed:**  
- A. Keep both (different business contexts: finance hold vs compliance hold). This is the current V3 design.
- B. Remove from `party_finance_profiles` and use only `party_compliance_profiles` as the single hold source.
- C. Rename to differentiate: `finance_hold` on finance profile, `compliance_payment_hold` on compliance profile.

---

### 2.3 `sales_manager` Role

**Observation:** V3 prompt §17 specifies `sales_manager` as a role to map. This role does not appear to exist in the current ERP `roles` table.

**Decision needed:**
- A. Create `sales_manager` role as part of Phase 5A.1 DB Foundation.
- B. Skip `sales_manager` mapping until a People / RBAC phase explicitly creates it.
- C. Map `sales_manager` permissions to `branch_admin` as a temporary equivalent.

Current V3 SQL has the `sales_manager` insert commented out as a safety measure.

---

### 2.4 `party_bank_details.bank_id` vs `bank_name_text`

**Observation:** Bank details support both `bank_id` (FK to existing `banks` table) and `bank_name_text` (free text for unlisted banks).

**Decision needed:**
- A. Keep both (current design: flexible for banks not in master).
- B. Force all banks to be in the `banks` master before use — remove `bank_name_text`.

---

### 2.5 `party_compliance_profiles` Auto-Creation

**Decision needed:** Should a `party_compliance_profiles` record be auto-created (with default values) when a new party is saved?

- A. Auto-create with all statuses set to default (e.g., `kyc_status = NOT_REVIEWED`, `blacklist_status = NOT_BLACKLISTED`). Cleaner — party always has a compliance record.
- B. Create on demand (only when user opens compliance tab). More lightweight but requires null-handling in all compliance queries.

---

### 2.6 `party_finance_profiles` Auto-Creation

Same question as 2.5 — should a `party_finance_profiles` row be auto-created on party save?

- A. Auto-create with nulls (recommended for simpler queries).
- B. Create on demand.

---

### 2.7 Duplicate Detection Threshold

**Decision needed:** The V3 function currently includes exact-match fallbacks only (no pg_trgm), plus an exact legal name comparison. If pg_trgm is approved:
- Default similarity threshold: **0.45** (catches minor typos and abbreviations).
- Is 0.45 too aggressive (too many false positives) or appropriate?

Sameer to review and confirm after seeing sample data.

---

### 2.8 Government Portal Username Reference

The `party_government_authority_profiles.portal_username_reference` column stores only a **reference label** (e.g., "Check IT Shared Drive") — no actual username or password.

**Confirmation needed:** Is this sufficient for Phase 5A, or is a separate secure vault required earlier?

- V3 explicitly prohibits password storage here.
- If credentials are needed, they require a separate phase with encrypted vault design.

---

### 2.9 DMS Integration for Documents

The `party_documents` table has nullable `file_path`, `file_name`, `file_mime_type`, `file_size` columns.

**Decision needed:** Is Phase 5A.2 (Core UI) allowed to implement basic file upload (to Supabase Storage), or is document upload deferred to a DMS integration phase?

- A. Basic Supabase Storage upload in 5A.2 — simple file path stored in `file_path`.
- B. DMS integration only — Phase 5A.2 creates document metadata records without file uploads.

---

## 3. Table Count Summary

| Category | Count |
|---|---|
| Core (parties, party_types, party_type_assignments) | 3 |
| Party-specific lookup masters | 17 |
| Role-profile lookup masters | 14 |
| Service + relationship masters | 2 |
| Child / transactional | 11 |
| Role profiles | 6 |
| **Total new tables** | **53** |

No existing tables are modified. No legacy tables are dropped.

---

## 4. Performance Concerns

### 4.1 JOINs for party type filtering

Every filtered view query (e.g., Customers, Vendors) requires a JOIN through `party_type_assignments` to filter by type. With a large `parties` table, this needs:
- Index on `party_type_assignments(party_type_id)` — ✅ included
- Index on `party_type_assignments(party_id)` — ✅ included
- Optional: Materialized view for common filtered list queries (deferrable to Phase 5A.4 if needed)

### 4.2 Compliance and license JOINs on list page

The All Parties list fetches: primary TRN, primary license number, license expiry, KYC status, risk rating, blacklist status. These are all JOINs to child tables. Recommendation: Use a Supabase view or `SELECT ... LATERAL` for the list query to avoid N+1.

### 4.3 Trigram index size

GIN trigram indexes on `legal_name_en` and `trade_name_en` will be larger than B-tree indexes. Only relevant if pg_trgm is approved. Monitor index size post-migration.

### 4.4 party_notes private filter

The private note RLS policy uses a subquery: `(SELECT id FROM user_profiles WHERE auth_user_id = auth.uid())`. Ensure `user_profiles.auth_user_id` is indexed (verify in live DB).

---

## 5. RLS Concerns

### 5.1 Helper function dependency

All RLS policies depend on `current_user_has_permission(text)` and `current_user_has_role(text)`. **These must be verified to exist in the live database before applying the migration.** Their signatures and behavior must be confirmed.

### 5.2 `party_notes` private filter subquery

The private note SELECT policy uses a correlated subquery per row to resolve `created_by`. This could be a performance concern at high note volumes. Alternative: Store `auth_user_id` directly on `party_notes.created_by_auth_id` column (deferrable optimization).

### 5.3 RLS on lookup masters

Current V3 plan: All lookup master SELECT policies allow `auth.uid() IS NOT NULL` (any authenticated user). If stricter access control is needed for sensitive lookups (e.g., blacklist statuses), these can be tightened during Phase 5A.1.

### 5.4 Bank details: elevated SELECT policy

Only users with `view_bank_details OR manage_bank_details OR system_admin` can SELECT from `party_bank_details`. This means:
- List pages for parties should **not** try to show bank details inline unless the user has the permission.
- The `PartySelect` component must **not** return bank details.
- Implement tab-level permission check in the UI (Tab 7 — Bank Details).

---

## 6. Seed Lists Requiring Business Review

| Table | Review Points |
|---|---|
| `party_types` | 23 types seeded. Sameer to confirm whether all 23 are needed at launch or if some (e.g., SCRAP_BUYER, OWNER_LANDLORD) should start inactive. |
| `party_service_categories_master` | 42 categories. Confirm all are relevant to ALGT ERP current operations. |
| `party_natures` | 12 natures. Confirm TRUST and JOINT_VENTURE are needed. |
| `vendor_ratings` | BLACKLISTED as a vendor rating may conflict with `party_blacklist_statuses`. Sameer to confirm if this is vendor-specific blacklist or redundant. |
| `payment_methods` | NETTING (inter-company) — confirm if ALGT has inter-company transactions at this stage. |
| `customer_statuses` | BLOCKED — confirm if this is distinct from `party_statuses.BLACKLISTED` or `party_blacklist_statuses.BLACKLISTED`. |

---

## 7. Fields Recommended for Deferral to Later Phases

These fields are in the V3 schema but may be deferred from initial UI implementation:

| Field | Table | Deferral Suggestion |
|---|---|---|
| `google_map_url`, `latitude`, `longitude` | `parties`, `party_addresses` | Phase 5A.3 (maps integration) |
| `verified_by`, `verified_at`, `verification_document_id` | `party_bank_details` | Phase 5A.4 (compliance QA) |
| `follow_up_date` | `party_notes` | Phase 5A.4 (activity/reminders feature) |
| `portal_url`, `portal_username_reference` | `party_government_authority_profiles` | Phase 5A.3 |
| `agreement_expiry_date`, `service_fee_terms` | `party_recruitment_agency_profiles` | Phase 5A.3 |
| Audit Tab (Tab 13) | UI | Phase 5A.4 |
| `next_review_date` reminder | `party_compliance_profiles` | Phase 5A.4 (notifications feature) |

---

## 8. Implementation Phase Split

After Sameer approval of V3, recommended split:

### Phase 5A.1 — Party Master Database Foundation
**Scope:** Apply V3 SQL migration. All 53 tables, indexes, RLS, seeds, numbering rules, permissions.  
**Duration estimate:** 1 day (migration) + 1 day (testing in staging)  
**Deliverable:** DB-READY status in SOT

### Phase 5A.2 — Core UI and Drawer
**Scope:**  
- All Parties list page (`/admin/master-data/parties`)  
- `PartyFormDrawer` — Tabs 1–7 (Basic, Types, Legal, Tax, Finance, Contacts, Addresses) + Bank Details (with permission gate)  
- Server actions: `createParty`, `updateParty`, `getParties`, `getParty`  
- Prefetch lookups via TanStack Query  
- Role profile panels in Tab 2  
**Duration estimate:** 5–7 days  
**Deliverable:** All Parties page + main drawer functional

### Phase 5A.3 — Filtered Views, Admin Masters, PartySelect
**Scope:**  
- 9 filtered routes (Customers, Vendors, Subcontractors, Consultants, etc.)  
- Party Types / Service Categories / Relationship Types admin CRUD pages  
- `PartySelect` component with all filter props  
- `PartyTypeCheckboxGrid` component  
- Sidebar Party Master group  
**Duration estimate:** 3–4 days  
**Deliverable:** All filtered views live + PartySelect reusable

### Phase 5A.4 — Compliance, Documents, Relationships, Notes, Audit
**Scope:**  
- Tabs 8–13 in drawer (Services, Compliance, Documents, Relationships, Notes, Audit)  
- Duplicate detection UI (warning/block dialogs + override flow)  
- Audit log tab  
- `party_compliance_profiles` compliance tab  
- `party_notes` private flag + follow_up  
**Duration estimate:** 4–5 days  
**Deliverable:** Full drawer + compliance QA + duplicate protection

### Phase 5A.5 — Legacy Customer Retirement (explicit approval only)
**Scope (only after explicit written approval):**  
- Hide `/admin/master-data/customers` route  
- Remove Customer from sidebar  
- Archive `src/features/master-data/customers/` source  
- Migrate test customer data to `parties` (if requested)  
- Drop legacy tables: `customers`, `customer_contacts`, `customer_addresses`, `customer_bank_details`, `customer_documents`  
- Remove legacy permissions and numbering rules  
- Update SOT  
**Note:** Do NOT include this in Phase 5A.1–5A.4 approval. Requires separate approval.

---

## 9. Approval Checklist

Sameer to review and mark each item:

| # | Item | Status |
|---|---|---|
| 1 | All 53 tables listed and reviewed | ⬜ |
| 2 | Every table has every field confirmed | ⬜ |
| 3 | All FK relationships confirmed | ⬜ |
| 4 | All 24 permission codes confirmed | ⬜ |
| 5 | Role mapping confirmed for all 10 roles | ⬜ |
| 6 | `sales_manager` role decision made (§2.3) | ⬜ |
| 7 | `payment_hold` duplication decision made (§2.2) | ⬜ |
| 8 | `pg_trgm` extension decision made (§2.1) | ⬜ |
| 9 | DMS integration approach confirmed (§2.9) | ⬜ |
| 10 | All 23 party type seeds confirmed | ⬜ |
| 11 | All 42 service category seeds confirmed | ⬜ |
| 12 | Seed list concerns from §6 reviewed | ⬜ |
| 13 | Confirmed legacy Customer module is untouched | ⬜ |
| 14 | Confirmed no implementation will start until approval | ⬜ |
| 15 | Phase 5A.1 DB Foundation approved to proceed | ⬜ |
| 16 | Phase 5A.2 Core UI approved to proceed | ⬜ |
| 17 | Phase 5A.5 retirement explicitly NOT approved at this stage | ✅ |

---

## 10. Confirmation: No Implementation Performed

This V3 planning package is review-only.

The following were NOT done:
- No SQL was applied to `mmiefuieduzdiiwnqpie.supabase.co`.
- No source code was created or modified.
- No Supabase schema was changed.
- No migrations were placed in active migration folders.
- No Customer module files were modified, hidden, or archived.
- No new routes were added to the Next.js app.
- No party types, permissions, or numbering rules were created in the live database.

All five files in this folder are purely review artifacts.

---

---

## 11. Supabase Integrity Review — Fixes Applied (Phase 002F.5A.0)

Performed 2026-06-13. Live project confirmed: `https://mmiefuieduzdiiwnqpie.supabase.co`

| # | Severity | Finding | Fix Applied |
|---|---|---|---|
| 1 | 🔴 CRITICAL | `permissions` INSERT missing `action_code NOT NULL` column | Added `action_code` = last segment of permission_code for all 24 rows |
| 2 | 🔴 CRITICAL | V3 SQL uses role code `viewer` — live has `read_only_user` | Changed to `read_only_user` |
| 3 | 🟡 IMPORTANT | `party_finance_profiles.payment_hold*` — renamed per prompt §5.1 | `payment_hold` → `finance_hold` (4 fields) |
| 4 | 🟡 IMPORTANT | `party_notes` RLS subquery — `current_user_profile_id()` exists in live DB | Changed RLS to use `current_user_profile_id()` |
| 5 | 🟡 IMPORTANT | `audit_logs` column names in UI/UX Tab 13 were wrong | `entity_name`, `entity_id`, `actor_user_profile_id` |
| 6 | 🟢 INFO | `logAudit()` function doesn't exist | Tech plan updated to use direct INSERT into audit_logs |

**Open Decision 2.2 (`payment_hold` naming):** RESOLVED — renamed to `finance_hold` per Supabase integrity review §5.1.

**Open Decision for sales_manager:** Still not in live DB. Keep commented in SQL.

---

## 12. Confirmed: No Implementation Performed During Integrity Review

During ERP BASE 002F.5A.0 Integrity Review:
- No SQL was applied to `mmiefuieduzdiiwnqpie.supabase.co`.
- No Party Master tables were created.
- No seed data was inserted.
- No source code was changed.
- No migrations were placed in active migration folders.
- No Customer module was modified.
- Only read queries (`execute_sql` SELECT) were run against the live database.

---

*End of V3 Review Notes SUPABASE_VERIFIED — REVIEW ONLY — FOR SAMEER APPROVAL*
