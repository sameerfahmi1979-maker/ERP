# ERP BASE 002F.5A — Party Master UI/UX and Field Map

**Document type:** UI specification (planning only)  
**Phase:** ERP BASE 002F.5A  
**Standards:** ERPDrawerForm, ERPFormFooter, RequiredLabel, useFormDirty, ERPCombobox, ERPDataTable

---

## 1. Sidebar Structure

```text
Administration
└── Master Data
    ├── … (existing geography, finance, UOM, lookups)
    ├── Customers                    ← LEGACY until 5A.5 (keep during build)
    └── Party Master                 ← NEW group
        ├── All Parties
        ├── Customers                ← filtered view
        ├── Vendors
        ├── Subcontractors
        ├── Consultants
        ├── Recruitment Agencies
        ├── Government Authorities
        ├── Banks
        ├── Insurance Companies
        ├── License Issuers
        ├── ─── (separator)
        ├── Party Types
        ├── Party Service Categories
        └── Party Relationship Types
```

**File:** `src/components/layout/app-sidebar.tsx` — add `Party Master` group in phase 5A.3.

---

## 2. Route Map

| Route | Page component | Props / behavior |
|---|---|---|
| `/admin/master-data/parties` | `parties/page.tsx` | `partyTypeFilter={undefined}` |
| `/admin/master-data/parties/customers` | reuse | `partyTypeFilter="CUSTOMER"` |
| `/admin/master-data/parties/vendors` | reuse | `"VENDOR"` |
| `/admin/master-data/parties/subcontractors` | reuse | `"SUBCONTRACTOR"` |
| `/admin/master-data/parties/consultants` | reuse | `"CONSULTANT"` |
| `/admin/master-data/parties/recruitment-agencies` | reuse | `"RECRUITMENT_AGENCY"` |
| `/admin/master-data/parties/government-authorities` | reuse | `"GOVERNMENT_AUTHORITY"` |
| `/admin/master-data/parties/banks` | reuse | `"BANK"` |
| `/admin/master-data/parties/insurance-companies` | reuse | `"INSURANCE_COMPANY"` |
| `/admin/master-data/parties/license-issuers` | reuse | `["LICENSE_ISSUER","GOVERNMENT_AUTHORITY","FREE_ZONE_AUTHORITY"]` |
| `/admin/master-data/parties/types` | CRUD table | `party_types` admin |
| `/admin/master-data/parties/service-categories` | tree/table CRUD | hierarchical |
| `/admin/master-data/parties/relationship-types` | CRUD table | `party_relationship_types` |

**Layout:** Standard protected layout + page header with breadcrumb `Master Data > Party Master > {view}`.

---

## 3. List Page — `PartiesTable`

### 3.1 Default columns (All Parties — full enterprise view)

| Column | Source | Sort | Export |
|---|---|---|---|
| Party Code | `party_code` | ✓ | ✓ |
| Display Name | `display_name` | ✓ | ✓ |
| Legal Name EN | `legal_name_en` | ✓ | ✓ |
| Legal Name AR | `legal_name_ar` | | ✓ |
| Trade Name EN | `trade_name_en` | | ✓ |
| Trade Name AR | `trade_name_ar` | | ✓ |
| Party Types | join badges | | ✓ |
| Primary Type | `primary_party_type_id` → name | ✓ | ✓ |
| Status | `party_status_id` | ✓ | ✓ |
| Country | `country_id` | ✓ | ✓ |
| Emirate | `emirate_id` | | ✓ |
| City | `city_id` | | ✓ |
| Main Phone | `main_phone` | | ✓ |
| Main Email | `main_email` | | ✓ |
| TRN | primary tax reg join | | ✓ |
| Primary License No. | primary license join | | ✓ |
| Primary License Expiry | primary license join | ✓ | ✓ |
| Compliance Status | compliance profile KYC | ✓ | ✓ |
| Risk Rating | compliance profile | ✓ | ✓ |
| Blacklist Status | compliance profile | ✓ | ✓ |
| Created At | `created_at` | ✓ | ✓ |
| Updated At | `updated_at` | ✓ | ✓ |
| Actions | dropdown | | ✗ |

### 3.2 Filtered view simplified columns (recommended — match Customer list pattern)

| Column | Notes |
|---|---|
| Party Code | |
| Display Name (+ AR subtitle) | |
| Primary Type or Party Types | Single type views show type badge in header instead |
| Updated | `updated_at` |
| Actions | |

*Sameer to confirm full vs simplified per view in review.*

### 3.3 Table features

- ERPDataTable: sorting, resizing, column visibility, preferences, pagination (25 default)
- Global search: code, display name, legal name, trade name, email, TRN, license number
- Row selection + export/print (existing ERP export menu)
- Toolbar: **Add Party** (if `parties.create`)
- Prefetch: `usePartyFormPrefetch()` on mount + before drawer open

### 3.4 Filters (filter bar — phase 5A.3)

| Filter | Control | Source |
|---|---|---|
| Party Type | ERPCombobox multi | `party_types` |
| Party Status | ERPCombobox | `party_statuses` |
| Country | ERPCombobox | `countries` |
| Emirate | ERPCombobox cascaded | `emirates` |
| City | ERPCombobox cascaded | `cities` |
| Compliance Status | ERPCombobox | `party_compliance_statuses` |
| Risk Rating | ERPCombobox | `party_risk_ratings` |
| Blacklist Status | ERPCombobox | `party_blacklist_statuses` |
| License Expiry Range | Date range | primary license |
| Created Date Range | Date range | `created_at` |
| Active / Inactive | Toggle | `is_active` |

### 3.5 Actions menu

| Action | Permission | Notes |
|---|---|---|
| View | view | Opens drawer view mode |
| Edit | edit | Blocked if `is_locked` |
| Deactivate / Reactivate | deactivate | Toggle `is_active` |
| Lock / Unlock | system_admin | |
| Delete | delete / system_admin | Confirm dialog |
| Export row | export | |

**Bulk actions (planned, not phase 1):** export selected, print, deactivate, assign/remove type, mark under review.

---

## 4. Party Drawer — `PartyFormDrawer`

### 4.1 Shell

| Property | Value |
|---|---|
| Component | `ERPDrawerForm` |
| Width | 80% desktop |
| Modes | add \| edit \| view |
| Footer Add/Edit | Cancel \| Save \| Save & Close |
| Footer View | Close |
| Safe Close | UnsavedChangesDialog on dirty |
| Dirty tracking | useFormDirty + combobox markDirty |

### 4.2 Tab order and lazy loading

| # | Tab | Lazy mount | Save in FormData parent |
|---|---|---|---|
| 1 | Basic Information | No | Yes — all fields mounted |
| 2 | Party Types | No | Yes |
| 3 | Legal & Licenses | No | Yes (summary fields); child table separate actions |
| 4 | Tax & Finance | No | Yes |
| 5 | Contacts | Yes | Child CRUD via server actions |
| 6 | Addresses | Yes | Child CRUD |
| 7 | Bank Details | Yes | Child CRUD; permission gate |
| 8 | Services / Categories | Yes | Assignments CRUD |
| 9 | Compliance & Approval | Yes | 1:1 profile form |
| 10 | Documents | Yes | Placeholder + metadata CRUD |
| 11 | Relationships | Yes | Child CRUD |
| 12 | Notes & Activity | Yes | Notes CRUD + audit timeline read |
| 13 | Audit | Yes | Read-only audit_logs |

**Add flow:** After first Save, set `effectivePartyId = party.id ?? createdPartyId` to unlock child tabs (Customer pattern).

---

## 5. Tab 1 — Basic Information

### Section A — Identity (`ERPDrawerSection`)

| Label | Field | Control | Source | Required | Validation |
|---|---|---|---|---|---|
| Party Code | party_code | Read-only Input | Numbering | Yes (auto) | — |
| Display Name | display_name | Input | — | Yes | min 2 chars |
| Legal Name (English) | legal_name_en | Input | — | Yes | min 2 |
| Legal Name (Arabic) | legal_name_ar | Input | — | No | |
| Trade Name (English) | trade_name_en | Input | — | No | |
| Trade Name (Arabic) | trade_name_ar | Input | — | No | |
| Short Name | short_name | Input | — | No | max 50 |
| Party Nature | party_nature_id | ERPCombobox | party_natures | Yes | |
| Primary Party Type | primary_party_type_id | ERPCombobox | party_types (assigned only in edit) | No | Must ∈ assignments |
| Parent Party | parent_party_id | PartySelect | parties | No | No circular ref |

### Section B — Primary Communication

| Label | Field | Control | Required | Validation |
|---|---|---|---|---|
| Main Phone | main_phone | Input | No | |
| Main Mobile | main_mobile | Input | No | |
| WhatsApp | whatsapp | Input | No | |
| Main Email | main_email | Email Input | No | email format; duplicate warn |
| Alternate Email | alternate_email | Email Input | No | email format |
| Website | website | URL Input | No | url format |

### Section C — Primary Location

| Label | Field | Control | Source | Cascading |
|---|---|---|---|---|
| Country | country_id | ERPCombobox | countries | — |
| Emirate / Region | emirate_id | ERPCombobox | emirates | country_id |
| City | city_id | ERPCombobox | cities | emirate_id |
| Area / Zone | area_zone_id | ERPCombobox | areas_zones | city_id |
| PO Box | po_box | Input | — | |
| Full Address | full_address_text | Textarea | — | |
| Google Map URL | google_map_url | URL Input | — | |
| Latitude | latitude | Input number | — | |
| Longitude | longitude | Input number | — | |

**Default:** country = UAE on Add.

### Section D — Status and Remarks

| Label | Field | Control | Source | Required |
|---|---|---|---|---|
| Party Status | party_status_id | ERPCombobox | party_statuses | Yes |
| Active | is_active | Switch | — | Yes (default true) |
| Remarks | remarks | Textarea | — | No |
| Created At | created_at | Read-only | — | View/Edit |
| Created By | created_by | Read-only | user_profiles | View/Edit |
| Updated At | updated_at | Read-only | — | View/Edit |
| Updated By | updated_by | Read-only | user_profiles | View/Edit |

---

## 6. Tab 2 — Party Types

### Section A — Assigned Party Types

- **Control:** `PartyTypeCheckboxGrid` — loads `party_types WHERE is_active ORDER BY sort_order`
- Each row: checkbox + type name + system badge
- Changing checkbox → markDirty()

### Section B — Primary Type

- **Control:** Radio group among checked types only
- One primary required when ≥1 type assigned

### Section C — Type-Specific Status Summary (read-only badges)

- Shows approval status per type from `party_compliance_profiles` (when exists)

**Validation:** ≥1 active assignment; exactly one primary; no duplicate assignments.

---

## 7. Tab 3 — Legal & Licenses

### Section A — Primary License Summary (read-only cards)

- Primary license number, type, issuer name, expiry, status badge
- Warning badge if expiry within `renewal_notice_days`

### Section B — License Records (child table)

| Column | Notes |
|---|---|
| License Code | |
| License Type | |
| License Number | |
| Issuing Authority | Party name |
| Expiry Date | Red if past |
| Status | Badge |
| Primary | Badge |
| Actions | View/Edit/Delete |

**Add/Edit license sub-drawer:**

| Field | Control | Source | Required |
|---|---|---|---|
| License Code | Read-only | numbering | auto |
| License Type | ERPCombobox | party_license_types | Yes |
| License Number | Input | — | Yes |
| License Name | Input | — | No |
| Issuing Authority | PartySelect | typeCodes=[GOVERNMENT_AUTHORITY, LICENSE_ISSUER, FREE_ZONE_AUTHORITY] | Yes |
| Issuing Country | ERPCombobox | countries | No |
| Issuing Emirate | ERPCombobox | emirates | cascaded |
| Issue Date | DatePicker | — | No |
| Expiry Date | DatePicker | — | If renewal_required |
| Renewal Required | Switch | — | Yes |
| Renewal Notice Days | Number | — | No |
| License Status | ERPCombobox | party_license_statuses | Yes |
| License Activities | Textarea | — | No |
| License Document | Link/Combobox | party_documents | No |
| Is Primary | Switch | — | Yes |
| Is Active | Switch | — | Yes |
| Remarks | Textarea | — | No |

### Section C — License Expiry Alerts

- List licenses expiring in 30/60/90 days (computed client-side)

---

## 8. Tab 4 — Tax & Finance

### Section A — Tax Registration (child table + form)

Same fields as DB map §3.2. TRN validation: 15 chars UAE.

### Section B — Default Commercial Terms (`party_finance_profiles`)

| Field | Control | Source |
|---|---|---|
| Default Currency | ERPCombobox | currencies |
| Default Payment Term | ERPCombobox | payment_terms |
| Preferred Payment Method | ERPCombobox | payment_methods |
| Credit Limit | Decimal input | — |
| Credit Currency | ERPCombobox | currencies |

### Section C — Finance Control

| Field | Control | Notes |
|---|---|---|
| Payment Hold | Switch | Requires reason if true |
| Payment Hold Reason | Textarea | Required if hold |
| Credit Hold | Switch | |
| Credit Hold Reason | Textarea | |
| Finance Remarks | Textarea | |

---

## 9. Tab 5 — Contacts

Child table pattern — copy `customer-contacts-section.tsx`.

| Column | |
|---|---|
| Contact Code | |
| Full Name | |
| Role | |
| Email | |
| Mobile | |
| Primary | badge |
| Active | badge |
| Actions | |

**Sub-drawer fields:** per DB map §3.4. Role flags: accounts, sales, operations, HSE, documents.

**Loading:** Skeleton on first open; TanStack Query `usePartyContacts(partyId)`.

---

## 10. Tab 6 — Addresses

Child table with type badges (Primary, Billing, Shipping, Site).

**Sub-drawer fields:** per DB map §3.5. Cascading geography comboboxes.

---

## 11. Tab 7 — Bank Details

**Permission gate:** hide section if not `manage_bank_details`; show masked message in view mode.

| Column | Sensitive |
|---|---|
| Bank Detail Code | |
| Bank | |
| Account Holder | |
| IBAN | mask middle digits in list |
| Currency | |
| Primary | |
| Verified | |
| Actions | |

**Visibility defaults:**

| Party types | Default tab state |
|---|---|
| VENDOR, SUBCONTRACTOR, CONSULTANT, RECRUITMENT_AGENCY, scrap/transport/equipment/fuel/workshop/spare suppliers | Expanded |
| CUSTOMER | Expanded optional |
| GOVERNMENT_AUTHORITY | Collapsed / hidden until user expands |

---

## 12. Tab 8 — Services / Categories

- **Master admin** at separate route; tab uses assignments only.
- **Control:** `PartyServiceCategorySelector` — tree checkboxes from `party_service_categories_master`
- Child table: category name, primary flag, active, remarks, actions

---

## 13. Tab 9 — Compliance & Approval

Single form bound to `party_compliance_profiles` (1:1).

### Section A — Approval Status

| Field | Shown when |
|---|---|
| KYC Status | Always |
| Customer Approval | Has CUSTOMER type |
| Vendor Approval | Has VENDOR type |
| Subcontractor Approval | Has SUBCONTRACTOR type |
| HSE Approval | Has SUBCONTRACTOR or VENDOR |
| Finance Approval | Always |
| Legal Approval | Always |

### Section B — Risk and Blacklist

| Field | Control | Source |
|---|---|---|
| Blacklist Status | ERPCombobox | party_blacklist_statuses |
| Blacklist Reason | Textarea | required if blacklisted |
| Risk Rating | ERPCombobox | party_risk_ratings |
| Credit Rating | ERPCombobox | party_credit_ratings |

### Section C — Holds

| Field | Notes |
|---|---|
| Payment Hold + Reason | Blocks payment use |
| Work Hold + Reason | Blocks site/subcontract use |

### Section D — Review Dates

| Field | Control |
|---|---|
| Approved By | Read-only / user combobox |
| Approved At | DateTime |
| Last Review Date | DatePicker |
| Next Review Date | DatePicker |
| Remarks | Textarea |

**Operational rule (PartySelect):** exclude parties where status ≠ Active, blacklisted, or holds active — unless override props/permission.

---

## 14. Tab 10 — Documents

**Phase 5A.2:** Placeholder banner — "Full DMS integration pending Phase 002F.4."

Metadata child table still planned:

| Column | |
|---|---|
| Document Code | |
| Document Type | |
| Title | |
| Document Number | |
| Expiry Date | |
| Status | |
| Actions | |

Upload control disabled until DMS; `file_path` nullable.

---

## 15. Tab 11 — Relationships

| Column | |
|---|---|
| Parent Party | |
| Child Party | |
| Relationship Type | |
| Effective From / To | |
| Active | |
| Actions | |

**Add form:** Parent PartySelect, Child PartySelect (exclude self), Relationship Type combobox.

Show inverse hint: "Child sees Parent as {inverse type}" (UI-only label lookup later).

---

## 16. Tab 12 — Notes & Activity

### Internal Notes (child table)

| Field | Control | Source |
|---|---|---|
| Note Type | ERPCombobox | party_note_types |
| Note Title | Input | |
| Note Body | Textarea | Required |
| Important | Switch | |
| Private | Switch | Hidden from others |

### Activity Timeline

- Read `audit_logs` WHERE entity_type LIKE 'party%' AND entity_id = party.id
- Phase 5A.4 — no custom activity engine

---

## 17. Tab 13 — Audit

Read-only table:

| Column | |
|---|---|
| Date/Time | |
| User | |
| Action | |
| Entity | |
| Before / After | JSON diff collapsed |
| IP | if available |

---

## 18. Conditional Role Profile Sections

Embed as **sub-sections inside Tab 2 (Party Types)** or **separate collapsible sections at bottom of Basic tab** — **recommendation:** dedicated collapsible sections after Party Types tab content, visible based on assignments:

### 18.1 Customer Profile (CUSTOMER)

| Field | Control | Source |
|---|---|---|
| Customer Category | LookupSelect | CUSTOMER_SEGMENTS |
| Customer Type | LookupSelect | CUSTOMER_TYPES |
| Industry Sector | LookupSelect | INDUSTRY_TYPES |
| Sales Region | LookupSelect | CRM_SALES_REGIONS (future) |
| Payment Term | ERPCombobox | payment_terms |
| Credit Limit / Currency | Input + combobox | currencies |
| Sales Owner | ERPCombobox | user_profiles |
| Requires LPO | Switch | |
| Requires Contract | Switch | |
| Preferred Invoice Method | LookupSelect | INVOICE_METHODS |
| Customer Status | LookupSelect | CUSTOMER_STATUS |

### 18.2 Vendor Profile (VENDOR)

Vendor Category, Vendor Type, Procurement Category, Payment Term, Currency, Preferred Vendor, Vendor Rating, Approval Status, Can Create PO, Requires Comparison — all dynamic lookups + switches.

### 18.3 Subcontractor Profile (SUBCONTRACTOR)

Category, Work Category, HSE/Insurance/PQ switches, Max Contract Value, Currency, Site/HSE approval switches.

### 18.4 Consultant Profile (CONSULTANT)

Consultant Type, Specialization, license/design/supervision switches.

### 18.5 Recruitment Agency Profile (RECRUITMENT_AGENCY)

Source Country, Recruitment Category, Agreement fields, Approved for Hiring.

### 18.6 Government Authority Profile (GOVERNMENT_AUTHORITY | LICENSE_ISSUER)

Authority Type, Jurisdiction Country/Emirate, Service Category, Portal URL, Username reference (no password).

---

## 19. PartySelect Component Spec

**Path:** `src/components/erp/party-select/party-select.tsx`

| Prop | Type | Description |
|---|---|---|
| typeCode | string? | Single type filter |
| typeCodes | string[]? | Multi type filter |
| serviceCategoryCode | string? | Service filter |
| serviceCategoryCodes | string[]? | Multi service |
| statusCode | string? | Party status filter |
| approvalStatusCode | string? | Approval filter |
| countryId | number? | Geography |
| emirateId | number? | Geography |
| includeInactive | boolean | Default false |
| includeBlacklisted | boolean | Default false; needs permission |
| value | number? | party.id |
| onChange | fn | |
| disabled | boolean | |
| placeholder | string | |

**Display format:** `{party_code} — {display_name}` + type badges.

**Query key:** `queryKeys.parties.select({ filters })`.

---

## 20. Save & Error Behavior

| Scenario | Behavior |
|---|---|
| Add Save | Creates party + type assignments + empty compliance/finance rows; returns id; stay open |
| Add Save & Close | Same + close drawer + refresh list |
| Edit Save | Updates parent fields; revalidate |
| Child CRUD | Immediate server action; invalidate child query |
| Duplicate detected | Modal with candidates; block or override with permission |
| Validation error | Inline field errors + toast |
| Permission denied | Toast + disabled controls |
| View mode | All inputs read-only; no footer save buttons |
| Loading | Drawer skeleton for basic tab; child tab skeletons |
| Empty child | "No contacts yet" + Add button |

---

## 21. Admin CRUD Pages (Party Types, Service Categories, Relationship Types)

Standard master-data table + drawer:

- ERPDataTable + ERPDrawerForm
- Permissions: `manage_types`, `manage_service_categories`
- System rows (`is_system=true`) — edit limited fields; no delete
- Service categories: parent selector (self-ref tree)

---

## 22. Prefetch Declaration

```typescript
// party-prefetch.ts — draft
export const PARTY_FORM_PREFETCH = {
  lookups: [ /* party_natures, party_statuses, … */ ],
  masters: ['countries', 'emirates', 'cities', 'areas_zones', 'currencies', 'payment_terms', 'tax_types', 'banks'],
  partyMasters: ['party_types', 'party_service_categories_master'],
  // Child tab lookups prefetched on section mount
};
```

---

*End of UI/UX Field Map — PLANNING ONLY*
