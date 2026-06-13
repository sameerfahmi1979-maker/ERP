# ALGT ERP — Source of Truth

**Document:** `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`  
**Last updated:** 2026-06-12 (initial creation — Phase 002F.3E.4 handoff)  
**Maintainer:** Update after **every** completed ERP phase  
**Last closed gate:** ERP BASE 002F.3E.4 — Current Modules Global QA Gate (**PASS WITH NOTES**)

> **This file is the single merged source of truth for Cursor.** It supersedes stale rows in older trackers when they conflict with live source code or latest closure reports.

---

## 6.1 Project Identity

| Field | Value |
|---|---|
| **Project name** | ALGT ERP (Alliance Gulf Transport ERP) |
| **Package name** | `erp-foundation` v0.1.0 |
| **Company** | Alliance Gulf — UAE transport/logistics, scrap, waste, demolition, workshop operations |
| **Purpose** | Enterprise ERP foundation: admin, RBAC, master data, party master, numbering, lookups, global form runtime |
| **Repository** | `c:\dev\agt-erp` |
| **GitHub** | `https://github.com/sameerfahmi1979-maker/ERP` |
| **Live Supabase** | `https://mmiefuieduzdiiwnqpie.supabase.co` |
| **Correct MCP/tool** | **`user-supabase`** |
| **Wrong MCP/tool** | **`plugin-supabase-supabase`** → `https://owcfljxxfznifftoezpf.supabase.co` (unrelated weighing/industrial project) |
| **Public tables (live)** | 56 tables, all RLS enabled (verified 2026-06-12) |
| **Protected routes** | 29 `page.tsx` under `src/app/(protected)/` |

---

## 6.2 Global Non-Negotiable Rules

1. **BIGINT primary keys only** — no UUID unless explicitly approved for a phase.
2. **No hardcoded dropdowns** — use `LookupSelect`, `ERPCombobox`, or cached TanStack hooks + master data.
3. **Global numbering** for human-readable references via `generateNextReference()` — codes read-only in UI.
4. **No source-only closure** for runtime behavior (Safe Close, dirty tracking, prefetch, performance) — verify in browser when possible; otherwise **PASS WITH NOTES**.
5. **No database schema changes** unless the phase prompt explicitly approves migrations.
6. **No new modules** outside the approved phase scope.
7. **Every phase** must produce an implementation/closure report in `implementation_Review/`.
8. **Every future phase** must update **this file** at completion.
9. **Server mutations:** `getAuthContext()` + `hasPermission()` + Zod + `logAudit()` + `revalidatePath()`.
10. **RLS enabled** on all ERP tables — never disable.
11. **FormData safety:** do not lazy-unmount parent form fields used by full-payload `new FormData(form)` saves.
12. **Customer module** is the copy template for all party-master modules — do not reinvent patterns.
13. **Do not claim DB-READY or PLANNED modules as implemented** in reports or UI.

---

## 6.3 Implemented Technology Stack

From `package.json` (source-verified):

| Layer | Version |
|---|---|
| Next.js | 16.2.6 (App Router) |
| React | 19.2.4 |
| TypeScript | 5 |
| Tailwind CSS | 4 |
| Supabase JS / SSR | 2.106.2 / 0.10.3 |
| TanStack Query | 5.101.0 |
| TanStack Table | 8.21.3 |
| Zod | 4.4.3 |
| React Hook Form | 7.76.1 |
| shadcn/ui + Lucide | current |
| Sonner, date-fns, jsPDF, xlsx | current |

**Route protection:** `src/middleware.ts` → `src/lib/supabase/middleware.ts`  
**Deprecation note:** Next.js warns `middleware` → `proxy` migration pending.

---

## 6.4 Current Implemented Modules

**Module status:** LIVE = working route; CLOSED = LIVE + QA closure (Customer only).

| Module | Route | UI | DB | Main feature path | Server actions | Status | Notes |
|---|---|---|---|---|---|---|---|
| Dashboard | `/dashboard` | LIVE | — | `src/app/(protected)/dashboard/page.tsx` | — | OK | Demo KPI + 8 fake module cards |
| Users | `/admin/users` | LIVE | ✅ | `src/features/users/` | `server/actions/users.ts` | OK | `users.manage` |
| Roles | `/admin/roles` | LIVE | ✅ | `src/features/roles/` | `server/actions/roles.ts` | OK | |
| Permissions | `/admin/permissions` | LIVE | ✅ | `src/features/permissions/` | `server/actions/permissions.ts` | OK | |
| Organizations | `/admin/organizations` | LIVE | ✅ | `src/features/organizations/` | `server/actions/organizations.ts` | OK | Prefetch wired; legacy text sync |
| Branches | `/admin/branches` | LIVE | ✅ | `src/features/branches/` | `server/actions/branches.ts` | OK | Prefetch wired; geography → text fields |
| Numbering Rules | `/admin/settings/numbering` | LIVE | ✅ | `src/features/numbering/` | `server/actions/numbering.ts` | OK | |
| Master Data hub | `/admin/master-data` | LIVE | ✅ | `src/app/(protected)/admin/master-data/page.tsx` | lookups stats | OK | |
| Lookup Categories | `.../lookups/categories` | LIVE | ✅ | `src/features/master-data/lookups/` | `server/actions/master-data/lookups.ts` | OK | |
| Lookup Values | `.../lookups/values` | LIVE | ✅ | same | same | OK | |
| Locked System Values | `.../lookups/system` | LIVE | ✅ | same | same | OK | |
| Countries | `.../geography/countries` | LIVE | ✅ | `src/features/master-data/geography/` | `geography/actions.ts` | OK | |
| Emirates/Regions | `.../geography/emirates` | LIVE | ✅ | same | same | OK | |
| Cities | `.../geography/cities` | LIVE | ✅ | same | same | OK | Cascading comboboxes |
| Areas/Zones | `.../geography/areas` | LIVE | ✅ | same | same | OK | |
| Ports | `.../geography/ports` | LIVE | ✅ | same | same | OK | |
| Currencies | `.../finance-basics/currencies` | LIVE | ✅ | `src/features/master-data/finance-basics/` | `finance-basics/actions.ts` | OK | |
| Payment Terms | `.../payment-terms` | LIVE | ✅ | same | same | OK | |
| Tax Types | `.../tax-types` | LIVE | ✅ | same | same | OK | |
| Banks | `.../banks` | LIVE | ✅ | same | same | OK | |
| Cost Centers | `.../cost-centers` | LIVE | ✅ | same | same | OK | |
| Profit Centers | `.../profit-centers` | LIVE | ✅ | same | same | OK | |
| UOM Categories | `.../uom/categories` | LIVE | ✅ | `src/features/master-data/uom/` | `uom/actions.ts` | OK | |
| UOM Units | `.../uom/units` | LIVE | ✅ | same | same | OK | |
| UOM Conversions | `.../uom/conversions` | LIVE | ✅ | same | same | OK | |
| **Customers** | `.../customers` | **CLOSED** | ✅ | `src/features/master-data/customers/` | `customers.ts` + 3 child files | **Reference** | See §6.10 |
| Customer Contacts | (drawer child) | CLOSED | ✅ | `customer-contacts-section.tsx` | `customer-contacts.ts` | OK | TanStack Query |
| Customer Addresses | (drawer child) | CLOSED | ✅ | `customer-addresses-section.tsx` | `customer-addresses.ts` | OK | |
| Customer Bank Details | (drawer child) | CLOSED | ✅ | `customer-bank-details-section.tsx` | `customer-bank-details.ts` | OK | |
| Customer Documents | (drawer tab) | PLACEHOLDER | ✅ | `customer-form-drawer.tsx` | — | Placeholder | DMS tab text only |
| Audit Logs | `/admin/audit` | LIVE | ✅ | `src/features/audit/` | `queries/audit.ts` | OK | |
| Profile | `/profile` | LIVE | ✅ | `src/features/profile/` | profile actions | OK | Self-service |
| Settings | `/settings` | LIVE | — | `src/app/(protected)/settings/` | — | OK | Self-service |

**Permissions summary:** `master_data.party_master.view/manage`, `master_data.geography.*`, `master_data.finance_basics.*`, `master_data.uom.*`, `master_data.lookups.*`, `organizations.*`, `branches.*`, `users.manage`, `roles.*`, `numbering.rules.*`, `dashboard.view`.

---

## 6.5 On-Screen Placeholder Modules

**Visible but NOT built.** Do not treat as implemented.

| Module | Where shown | Route (non-functional) | Notes |
|---|---|---|---|
| Fleet Management | Sidebar "Soon" + Dashboard card | `/modules/fleet` | `comingSoon: true` in sidebar |
| HR & Payroll | Sidebar + Dashboard | `/modules/hr` | Roadmap 004 |
| Workshop | Sidebar + Dashboard | `/modules/workshop` | Roadmap 006 |
| HSE | Sidebar + Dashboard | `/modules/hse` | Roadmap 011 |
| Finance | Sidebar + Dashboard | `/modules/finance` | Operational finance |
| Inventory | Sidebar + Dashboard | `/modules/inventory` | Roadmap 007 |
| Procurement | Sidebar + Dashboard | `/modules/procurement` | Roadmap 008 |
| Documents / DMS | Sidebar + Dashboard + Customer tab | `/modules/documents` | Roadmap 009 |

- Sidebar: disabled, **"Soon"** badge, not clickable (`src/components/layout/app-sidebar.tsx`).
- Dashboard: fake KPI data, cards not linked (`src/app/(protected)/dashboard/page.tsx`).

---

## 6.6 DB-Ready But Not UI-Built Modules

**Supabase tables + RLS exist. Zero routes, server actions, or sidebar links.**

| Entity | Parent table | Child tables | Bank details | Notes |
|---|---|---|---|---|
| **Vendors** | `vendors` | contacts, addresses, documents | ✅ `vendor_bank_details` | **Build next** |
| **Subcontractors** | `subcontractors` | contacts, addresses, documents | ✅ | After Vendors |
| **Consultants** | `consultants` | contacts, addresses, documents | ✅ | |
| **Government Authorities** | `government_authorities` | contacts, addresses, documents | ❌ **none by design** | REV1 plan |
| **Recruitment Agencies** | `recruitment_agencies` | contacts, addresses, documents | ✅ | Vendor-like for payments |

Templates ready: `src/lib/standards/party-master-prefetch-templates.ts` (not wired).

---

## 6.7 Planned Operational & Platform Modules

From `implementation_Review/ERP_FULL_IMPLEMENTATION_ROADMAP_PHASE_TRACKER.md`:

**Operational (003–018):** CRM, HR/Payroll, Fleet/Equipment, Workshop, Inventory, Procurement, DMS, Task Management, HSE, Scrap Trading, Waste Management, Demolition, Transport/Trips, Rental/Utilization, Fuel/Diesel, Weighbridge.

**Platform (019–025 + UX):** Reporting/KPI/BI, Notifications, Approvals, Global Print/PDF/Email, External Integrations, Global Search/Command Palette (002F.3E.3C), AI Center, Security/Pen Test, Final QA/UAT/Deployment.

**Master-data foundation (before ops):** 002F.3D Settings, 002F.3F HR MD, 002F.3G Fleet MD, 002F.3H Workshop/Inventory/Procurement MD, 002F.3I HSE/DMS MD, 002F.3J Scrap/Waste/Demolition MD, 002F.3K MD QA gate.

**Also planned (no page yet):** Work Sites (Geography), Payment Methods & Bank Account Types (lookup-only).

---

## 6.8 Phase Status Tracker

| Phase | Title | Status | Latest report / evidence |
|---|---|---|---|
| 001 | ERP Base Foundation | **CLOSED** | Migrations + 001 reports |
| 002D | Admin Master Data Hardening | **CLOSED** | Orgs, Branches, Users |
| 002E | Global UI/UX Foundation | **CLOSED** | ERPDrawerForm, tables, export |
| 002F.2 | Global Numbering Engine | **CLOSED** | `numbering.ts` |
| 002F.3B | Global Lookup Engine | **CLOSED** | Lookups module |
| 002F.3C.1 | Geography & Locations | **CLOSED** | 5 geography pages |
| 002F.3C.2 | Finance Basics | **CLOSED** | 6 finance pages |
| 002F.3C.3 | Units & Measurements | **CLOSED** | 3 UOM pages |
| 002F.3C.4A/B | Sidebar + Selects QA | **CLOSED** | Sameer QA passed |
| 002F.3C.4C | Master Data Gate | **PLANNED** | Not executed |
| 002F.3E.2 | Party master DB + seeds | **CLOSED** | 56 tables live |
| 002F.3E.3 | Customers initial | **CLOSED** | Customer module |
| 002F.3E.3B.2–3B.4 | Combobox, Footer, Safe Close | **CLOSED** | Standards enforced |
| 002F.3E.3B.5 | Global form runtime QA | **CLOSED WITH NOTES** | |
| 002F.3E.3B.6A–6G | Performance / prefetch standard | **CLOSED WITH NOTES** | Parent form runtime |
| 002F.3E.3B.6G.3B | Contacts loading fix | **CLOSED** | staleTime 5 min |
| 002F.3E.3B.7 | Customer final QA | **CLOSED WITH NOTES** | `effectiveCustomerId` fix |
| 002F.3E.4 | Global QA gate | **PASS WITH NOTES** | Browser QA pending |

**Stale documents (do not trust over this file + source):**
- `implementation_Review/ERP_BASE_FULL_PHASE_STATUS_TRACKER.md` (2026-06-07)
- `implementation_Review/ERP_FULL_IMPLEMENTATION_ROADMAP_PHASE_TRACKER.md` (phase rows for 3E.3–3E.4 marked PLANNED but actually CLOSED)

---

## 6.9 Global Standards Implemented

| Standard | Location | Rule |
|---|---|---|
| ERPDrawerForm / ERPDrawerSection | `src/components/erp/erp-drawer-form.tsx` | Drawer shell; `lazyMount` for safe tabs |
| ERPFormFooter | `src/components/erp/erp-form-footer.tsx` | Cancel / Save / Save & Close / Close |
| RequiredLabel | `src/components/erp/required-label.tsx` | Required field asterisk |
| ERPCombobox | `src/components/erp/combobox/erp-combobox.tsx` | Debounced search; `markDirty()` |
| LookupSelect | `src/components/erp/lookup-select.tsx` | Cached lookup categories |
| useFormDirty | `src/hooks/use-form-dirty.ts` | Safe Close + combobox dirty |
| UnsavedChangesDialog | `src/components/erp/unsaved-changes-dialog.tsx` | Dirty intercept |
| TanStack Query | `src/lib/query/query-client.ts` | Global provider |
| queryKeys | `src/lib/query/query-keys.ts` | incl. `queryKeys.child.*` |
| invalidation | `src/lib/query/invalidation.ts` | `createChildInvalidator` |
| prefetch | `src/lib/query/prefetch-lookups.ts` | Batch lookup + master prefetch |
| child tables | `src/hooks/child-tables/use-child-table-query.ts` | staleTime 5 min |
| Parent form runtime | `docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md` | FormPrefetchDeclaration required |
| Cursor dev guide | `docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md` | Workflow + RLS |
| UI/UX guide | `docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md` | Forms + tables |

**Source audit (2026-06-12):** ERPDrawerForm ~27 files, ERPFormFooter ~25, useFormDirty ~25, comingSoon ~11 refs in sidebar.

---

## 6.10 Customer Reference Implementation

**Copy this pattern for Vendors and all party-master modules.**

| Area | Path / detail |
|---|---|
| Prefetch declaration | `src/features/master-data/customers/customer-prefetch.ts` → `CUSTOMER_FORM_PREFETCH` |
| Prefetch hook | `hooks/use-customer-form-prefetch.ts` — page mount + click |
| List | `components/customers-table.tsx` |
| Drawer | `components/customer-form-drawer.tsx` — tabs, Safe Close, FormData safety |
| Child hooks | `hooks/use-customer-child-queries.ts` → `useChildTableQuery` |
| Child sections | contacts, addresses, bank-details sections + skeleton loaders |
| Server actions | `server/actions/master-data/customers.ts` + 3 child action files |
| Numbering | `CUSTOMER`, `CUSTOMER_CONTACT` via `generateNextReference` |
| Permissions | `master_data.party_master.view` / `.manage` |
| **3B.7 fix** | `effectiveCustomerId = currentCustomer?.id ?? createdCustomerId` — unlock child sections after Add→Save |
| **3B.6G.3B fix** | Child staleTime 5 min; section-level lookup prefetch |
| Documents tab | Static DMS placeholder — not implemented |
| Sales owner | `sales_owner_user_profile_id` in schema — **no UI picker** |

---

## 6.11 Party Master Rules (REV1 Plan)

From `ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV1.md`.

### Classification types (lookup categories — verified in live DB)

**Customer types:** NORMAL_CUSTOMER, GOVERNMENT_CUSTOMER, SEMI_GOVERNMENT_CUSTOMER, UTILITY_COMPANY, WATER_POWER_PLANT, INDUSTRIAL_CUSTOMER, COMMERCIAL_CUSTOMER, MAIN_CONTRACTOR, EPC_CONTRACTOR, SCRAP_BUYER, SCRAP_SUPPLIER, PARTNER_CUSTOMER.

**Vendor types:** SUPPLIER, MATERIAL_SUPPLIER, EQUIPMENT_SUPPLIER, SERVICE_PROVIDER, TRANSPORTER, TRANSPORT_SERVICE_PROVIDER, LOGISTICS_SERVICE_PROVIDER, PRIVATE_WASTE_DISPOSAL_FACILITY, WASTE_DISPOSAL_SERVICE_PROVIDER, INSURANCE_COMPANY, PROPERTY_LESSOR, VEHICLE_LESSOR, EQUIPMENT_LESSOR, CAMP_ACCOMMODATION_LESSOR, UTILITY_PROVIDER.

**Subcontractor types:** TRANSPORTER, TRANSPORT_SUBCONTRACTOR, CIVIL_SUBCONTRACTOR, MANPOWER_SUBCONTRACTOR, DEMOLITION_SUBCONTRACTOR, EQUIPMENT_SUBCONTRACTOR, SPECIALIZED_SUBCONTRACTOR, PARTNER_SUBCONTRACTOR.

**Government authority types:** LICENSE_ISSUER, PERMIT_ISSUER, UTILITY_AUTHORITY, TRANSPORT_AUTHORITY, PORT_AUTHORITY, CUSTOMS_AUTHORITY, GOVERNMENT_WASTE_DISPOSAL_AUTHORITY, MUNICIPALITY, POLICE, CIVIL_DEFENSE, ENVIRONMENTAL_AUTHORITY, FREE_ZONE_AUTHORITY, REGULATOR, MINISTRY.

### Dual-classification rules

| Scenario | Classification |
|---|---|
| Transporter as ongoing service provider | **Vendor** |
| Transporter hired for project execution | **Subcontractor** |
| Private waste disposal facility | **Vendor** |
| Government/municipality waste disposal | **Government Authority** |
| Recruitment agencies | Separate table; vendor-like for **payments** |
| Government authorities bank details | **No bank_details table by design** |

---

## 6.12 Important File List

### Standards
```
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
```

### Global components & layout
```
src/components/erp/erp-drawer-form.tsx
src/components/erp/erp-form-footer.tsx
src/components/erp/combobox/erp-combobox.tsx
src/components/erp/lookup-select.tsx
src/components/layout/app-sidebar.tsx
src/components/layout/app-providers.tsx
```

### Query / cache
```
src/lib/query/query-keys.ts
src/lib/query/prefetch-lookups.ts
src/lib/query/invalidation.ts
src/hooks/child-tables/use-child-table-query.ts
src/lib/lookups/master-data-fetchers.ts
```

### Customer (reference)
```
src/features/master-data/customers/customer-prefetch.ts
src/features/master-data/customers/hooks/use-customer-form-prefetch.ts
src/features/master-data/customers/hooks/use-customer-child-queries.ts
src/features/master-data/customers/components/customer-form-drawer.tsx
src/server/actions/master-data/customers.ts (+ child action files)
```

### Org / Branch prefetch
```
src/features/organizations/organization-prefetch.ts
src/features/branches/branch-prefetch.ts
```

### Future party templates
```
src/lib/standards/party-master-prefetch-templates.ts
```

### Auth / RBAC
```
src/lib/rbac/check.ts
src/lib/supabase/server.ts
src/middleware.ts
```

### Dev harnesses (DELETE before production)
```
src/app/dev/performance-qa/
src/app/dev/customer-prefetch-qa/
src/app/dev/customer-child-qa/
```

### Latest closure reports
```
implementation_Review/Phase_002F_3E_4_Closure/ERP_BASE_002F_3E_4_CURRENT_MODULES_GLOBAL_QA_GATE_REPORT.md
implementation_Review/Phase_002F_3E_3B7_Closure/ERP_BASE_002F_3E_3B_7_CUSTOMER_MODULE_FINAL_QA_AND_CLOSURE_REPORT.md
```

### Planning / roadmap (reference — may be stale)
```
implementation_Review/ERP_FULL_IMPLEMENTATION_ROADMAP_PHASE_TRACKER.md
Phase_002F_3A_Master_Data_Inventory/ERP_BASE_002F_3A_R_REVISED_MASTER_DATA_ARCHITECTURE_AND_MENU_PLAN.md
ERP_FULL_IMPLEMENTATION_GUIDE_FOR_NEXT_CHAT.md
```

---

## 6.13 Known Technical Debt

| Item | Severity | Action |
|---|---|---|
| Dev harnesses `/dev/*` | Pre-deploy | Delete before production |
| Lint debt (~60 errors, `lookups.ts`) | Non-blocking | Cleanup phase |
| middleware → proxy deprecation | Non-blocking | Next.js 16 migration |
| Numbering page empty shell for unauthorized | Minor | UX improvement |
| Organization/Branch legacy text-column sync | Design debt | FK migration deferred for Branch |
| Customer Documents tab | Expected | Await 002F.4 DMS readiness |
| Customer sales owner picker | Future | Column exists, no UI |
| Browser-authenticated QA | Pending | Sameer/Dina manual pass |
| Stale phase trackers | Documentation | Trust this file + closure reports |
| Dashboard demo KPIs | Placeholder | Replace when real modules exist |

---

## 6.14 Next Recommended Phases

| Order | Phase | Notes |
|---|---|---|
| 1 | **002F.4 — Attachment / Documents Placeholder Readiness** | DMS pattern before more party masters |
| 2 | **002F.5 — Party-Master Module Preparation** | Vendor plan from Customer template |
| 3 | **Vendors** | First UI party-master module |
| 4 | Subcontractors | Same pattern |
| 5 | Consultants | Same pattern |
| 6 | Government Authorities | No bank details child |
| 7 | Recruitment Agencies | Same pattern |
| 8 | Production cleanup | Delete dev harnesses, lint, middleware, manual QA |

> If Sameer skips DMS readiness, Vendors can start using Customer as reference — **less recommended** because every party-master has documents.

---

## 6.15 Update Protocol

### At phase START
1. Read **this file** (`.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`)
2. Read `.cursor/rules/algt-erp-source-of-truth.mdc`
3. Read the **phase prompt** (`ChatGPT/...`)
4. Read **latest relevant reports** in `implementation_Review/`
5. Connect **`user-supabase`** if DB work involved — confirm `mmiefuieduzdiiwnqpie`
6. Confirm module status (LIVE / PLANNED / DB-READY) before coding

### At phase END
1. Create phase report in `implementation_Review/Phase_XXX/`
2. **Update this file:** phase row, files changed, bugs fixed/deferred, next phase
3. Optionally sync `ERP_FULL_IMPLEMENTATION_GUIDE_FOR_NEXT_CHAT.md` if handoff-relevant
4. Run `npm run typecheck` (and `npm run build` for implementation phases)
5. **Stop** — do not start next phase without approval

### Phase completion log (append new rows here)

| Date | Phase | Status | Report file | Updated by |
|---|---|---|---|---|
| 2026-06-12 | 002F.3E.4 | PASS WITH NOTES | `Phase_002F_3E_4_Closure/ERP_BASE_002F_3E_4_CURRENT_MODULES_GLOBAL_QA_GATE_REPORT.md` | Initial source-of-truth creation |
| 2026-06-12 | Cursor SOT setup | CREATED | `Phase_002F_3E_4_Handoff/ERP_CURSOR_SOURCE_OF_TRUTH_GUIDE_CREATION_REPORT.md` | Initial |

---

*End of ALGT ERP Source of Truth. Update after every phase.*
