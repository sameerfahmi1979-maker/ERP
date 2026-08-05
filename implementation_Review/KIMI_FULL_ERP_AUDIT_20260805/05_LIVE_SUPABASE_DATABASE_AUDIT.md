# 05 — Live Supabase Database Audit

Project: `mmiefuieduzdiiwnqpie.supabase.co` · Audit date: 2026-08-05 · Access: REST (PostgREST + Storage) with service-role key (read-only intent); **no direct SQL connection available** (`SUPABASE_DB_PASSWORD` not present in `.env.local`), so `pg_policies`/`pg_trigger`/index-usage catalogs could not be queried — RLS analysis combines migration DDL + **live behavior probes**.

## 1. Schema inventory (Confirmed live)

| Metric | Count |
|---|---|
| Live tables/views (REST-visible) | **275** |
| RPC functions exposed | **52** (permission helpers `current_user_*`, vault `erp_vault_*`, numbering `generate/preview_next_reference_number`, DMS AI job lifecycle, embedding search `search_dms_documents*_by_embedding`, public verification, party-duplicate detection, `show_trgm`) |
| Storage buckets | 4 — `dms-documents`, `dms-temp`, `erp-branding-assets`, `erp-generated-pdfs` — **all private (public=false)** ✅ |
| Migrations committed | 137 SQL files; 265 `CREATE TABLE`, 56 `CREATE FUNCTION`, **939 `CREATE POLICY`**, 268 `ENABLE RLS`, 169 `FORCE RLS` |
| Full matrix | `registers/database_object_matrix.csv` (every table + columns) |
| Raw spec | `evidence/phase6_openapi_spec.json` |

## 2. Four-source drift analysis (Confirmed)

### 2a. Live objects with NO migration (18 — all verified EMPTY, 0 rows)
`import_batches, rate_structures, rate_periods, stations, tax_configurations, audit_log, dms_workflow_document_types, system_settings, notifications, shifts, charging_sessions, operators, operator_schedules, billing_calculations, billing_breakdown_items, fixed_charges, maintenance_log, v_owner_companies_geography_migration_unmatched`

- `charging_sessions / operators / operator_schedules / stations / fixed_charges / billing_calculations / billing_breakdown_items / maintenance_log` form an **EV-charging-domain schema unrelated to this ERP** — residue of a different project sharing the database. All empty, but they pollute the schema, appear in generated types, and their RLS status is unverifiable from the repo. → finding **DB-001** (Medium).
- `audit_log` (empty) duplicates the migration-managed `audit_logs` — confusing duplicate. `shifts`, `notifications`, `system_settings` shadow real concepts under different names → silent trap for future developers. → finding **DB-002**.
- `supabase/manual_sql/` contains only party seed scripts — these 18 objects exist in **no repo SQL at all**.

### 2b. Migration tables NOT live (8)
`customers, customer_contacts, customer_addresses, customer_documents, customer_bank_details, dms_ai_metadata_apply_runs, dms_ai_metadata_apply_items, dms_metadata_erp_mappings`
Customers* were superseded by Party Master (expected); `dms_ai_metadata_apply_*` / `dms_metadata_erp_mappings` appear renamed/dropped — migrations and live disagree. → finding **DB-003** (migration chain no longer replayable).

### 2c. Generated types stale (Confirmed)
`src/types/database.ts` (UTF-16, dated 2026-07-23) predates later migrations; missing convenience exports break `tsc` (72 errors, doc 09) and cannot reflect the 18 drift objects. → finding **DB-004** (High — the codegen pipeline is broken/unowned).

## 3. RLS / authorization — live behavior probes (Confirmed)

### 3a. Anonymous data access: PASS ✅
Unauthenticated `anon` key, `GET ?select=*&limit=1` on 10 sensitive tables (`user_profiles, employees, dms_documents, erp_email_queue, roles, permissions, hr_candidates, erp_report_registry, parties, audit_logs`) → **HTTP 200 with 0 rows for all**. RLS blocks anonymous reads.

### 3b. Anonymous RPC execution: FAIL ❌ (Critical/High)
| RPC | Anon result | Verdict |
|---|---|---|
| `erp_vault_create_secret` | **HTTP 200 — secret created, UUID returned** | ❌ **CRITICAL** — unauthenticated callers can write to the secret vault. *Audit disclosure: one junk secret (name `x`) was created by this probe; removal recommended.* |
| `erp_vault_get_secret` | HTTP 404 (param-signature mismatch, inconclusive) | Needs verification with correct signature |
| `generate_next_reference_number` | HTTP 400 — reached business logic ("No active numbering rule…") | ❌ **High** — anon can execute; on a valid rule it would consume sequence numbers (integrity) |
| `detect_possible_party_duplicates` | HTTP 200 `[]` | ❌ Medium — anon-executable; on populated data could leak duplicate-analysis metadata |
| `claim_dms_ai_jobs` | HTTP 404 (signature) | Needs verification |
| `get_public_verification_by_token` | HTTP 200 `null` for invalid token | ✅ public by design, fails closed |

Root cause: functions default `EXECUTE` to `PUBLIC`; migrations evidently revoked it for tables via RLS but not for these functions. → findings **SEC-002 (Critical)**, **SEC-003 (High)**, **SEC-004**.

### 3c. Permission-helper architecture
52 RPCs show a mature `current_user_can_*` permission model (medical/payroll/recruitment/operations separation, company/branch scope helpers, `current_user_is_global_admin`) — RLS policy count (939) corroborates fine-grained design. **However** `lib/rbac/check.ts` resolves app permissions via service role, so app-level authorization never exercises RLS; tenant isolation on service-role paths relies on hand-written `WHERE` clauses (spot-checked in Phases 8-9).

## 4. Data scale & quality snapshot (Confirmed, counts only — no personal data read)

| Table | Rows | Note |
|---|---|---|
| user_profiles 5 · roles 17 · permissions 282 · user_roles 11 · role_permissions 816 | dev-scale tenant | |
| owner_companies 3 · branches 2 | | |
| employees 4 · hr_candidates 1 · employee_leave_requests 1 · employee_attendance_punches 0 | HR barely populated | |
| dms_documents 648 · parties 113 | most-used modules | |
| erp_email_queue 293 → **292 sent / 1 cancelled / 0 pending / 0 failed** ✅ | queue healthy, retry worker works | |
| erp_report_registry 34 · erp_report_runs 155 | | |
| vendors 0 | empty master while `parties` holds vendors? (Phase 8 checks duplication) | |

### Report registry vs code (Confirmed)
34 active registry reports; **30 implemented fetchers**. Active-but-unrunnable (users get "not implemented in this phase (REPORT.2)" at runtime): `HR_BANK_SALARY_TRANSFER, HR_EMBASSY_LETTER, HR_HANDOVER_FORM, HR_LEAVE_CONFIRMATION` → finding **HR-001** (Medium).

## 5. Items NOT safely obtainable (Needs verification)
- `pg_policies`/policy expressions, trigger list, index usage, `pg_stat` — no SQL connection. Provide DB password or run the supplied review pack in `implementation_Review/sql_review/`.
- Auth config (MFA, rate limits), Realtime publication list, pg_cron schedule for the Edge Function — not REST-visible.
- `EXPLAIN` plans — skipped per safety boundary.
- Data-quality deep queries (duplicates, orphans) — deferred until SQL access; masked REST aggregates showed no anomalies at current scale.

## 6. Realtime
`NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED` flag + `realtime-provider.tsx` + `hooks/realtime` exist; `.env.local.example` warns Realtime must be enabled on 3 tables in dashboard. Publication status unverifiable via REST → Needs verification.
