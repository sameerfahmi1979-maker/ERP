# ERP BASE 002F.5A — Party Master UI/UX and Field Map v2

**Document type:** UI/UX specification (planning only)  
**Phase:** ERP BASE 002F.5A  
**Version:** v2 — complete 13 tabs, every field, all conditional rules, empty/loading/error states  
**Status:** DRAFT FOR REVIEW  
**Standards applied:** ERPDrawerForm, ERPFormFooter, RequiredLabel, useFormDirty, ERPCombobox, ERPDataTable, LookupSelect  
**Supersedes:** `ERP_BASE_002F_5A_PARTY_MASTER_UI_UX_AND_FIELD_MAP.md` (v1)

---

## 1. Sidebar Structure

```text
Administration
└── Master Data
    ├── (existing: Geography, Finance Basics, UOM, Lookups)
    ├── Customers          ← LEGACY — keep during 5A.1–5A.4, retire at 5A.5
    └── Party Master       ← NEW GROUP (added in 5A.3)
        ├── All Parties
        ├── ─── (separator — filtered views)
        ├── Customers
        ├── Vendors
        ├── Subcontractors
        ├── Consultants
        ├── Recruitment Agencies
        ├── Government Authorities
        ├── Banks
        ├── Insurance Companies
        ├── License Issuers
        ├── ─── (separator — admin tables)
        ├── Party Types
        ├── Party Service Categories
        └── Party Relationship Types
```

**Implementation file:** `src/components/layout/app-sidebar.tsx`  
**Phase:** Add Party Master group in 5A.3. Keep legacy `Customers` item until 5A.5.

---

## 2. Route Map

| Route | Component | partyTypeFilter |
|---|---|---|
| `/admin/master-data/parties` | `parties/page.tsx` | none |
| `.../parties/customers` | same (reused) | `"CUSTOMER"` |
| `.../parties/vendors` | same | `"VENDOR"` |
| `.../parties/subcontractors` | same | `"SUBCONTRACTOR"` |
| `.../parties/consultants` | same | `"CONSULTANT"` |
| `.../parties/recruitment-agencies` | same | `"RECRUITMENT_AGENCY"` |
| `.../parties/government-authorities` | same | `"GOVERNMENT_AUTHORITY"` |
| `.../parties/banks` | same | `"BANK"` |
| `.../parties/insurance-companies` | same | `"INSURANCE_COMPANY"` |
| `.../parties/license-issuers` | same | `["LICENSE_ISSUER","GOVERNMENT_AUTHORITY","FREE_ZONE_AUTHORITY"]` |
| `.../parties/types` | `party-types/page.tsx` | CRUD on `party_types` |
| `.../parties/service-categories` | `party-service-categories/page.tsx` | Tree CRUD |
| `.../parties/relationship-types` | `party-relationship-types/page.tsx` | CRUD |

**All filtered views** share one `PartiesTable` component. The `partyTypeFilter` prop is passed from the server page to the table.

---

## 3. List Page — `PartiesTable`

### 3.1 All Parties — full enterprise columns

| # | Column label | Data source | Sort | Export |
|---|---|---|---|---|
| 1 | Party Code | `parties.party_code` | ✓ | ✓ |
| 2 | Display Name | `parties.display_name` | ✓ | ✓ |
| 3 | Legal Name EN | `parties.legal_name_en` | ✓ | ✓ |
| 4 | Legal Name AR | `parties.legal_name_ar` | | ✓ |
| 5 | Trade Name EN | `parties.trade_name_en` | | ✓ |
| 6 | Trade Name AR | `parties.trade_name_ar` | | ✓ |
| 7 | Party Types | joined badges from `party_type_assignments` | | ✓ |
| 8 | Primary Type | `party_types.type_name` via `primary_party_type_id` | ✓ | ✓ |
| 9 | Status | `party_statuses.status_name_en` | ✓ | ✓ |
| 10 | Country | `countries.country_name_en` | ✓ | ✓ |
| 11 | Emirate | `emirates.emirate_name_en` | | ✓ |
| 12 | City | `cities.city_name_en` | | ✓ |
| 13 | Main Phone | `parties.main_phone` | | ✓ |
| 14 | Main Email | `parties.main_email` | | ✓ |
| 15 | TRN | primary `party_tax_registrations.tax_registration_number` | | ✓ |
| 16 | Primary License No. | primary `party_licenses.license_number` | | ✓ |
| 17 | License Expiry | primary `party_licenses.expiry_date` | ✓ | ✓ |
| 18 | Compliance Status | `party_compliance_profiles.kyc_status_id` name | ✓ | ✓ |
| 19 | Risk Rating | `party_risk_ratings.rating_name_en` | ✓ | ✓ |
| 20 | Blacklist Status | `party_blacklist_statuses.status_name_en` | ✓ | ✓ |
| 21 | Created At | `parties.created_at` | ✓ | ✓ |
| 22 | Updated At | `parties.updated_at` | ✓ | ✓ |
| 23 | Actions | dropdown menu | | ✗ |

### 3.2 Filtered view simplified columns (recommended default for type-specific routes)

| Column | |
|---|---|
| Party Code | |
| Display Name (+ Arabic subtitle if exists) | |
| Party Types | badges |
| Updated At | |
| Actions | |

*Column visibility toggle allows user to show/hide full column set.*

### 3.3 Table features

| Feature | Config |
|---|---|
| Component | `ERPDataTable<Party>` |
| `tableId` | `"parties_table"` (or `"parties_customers_table"` etc. per filtered view) |
| Sorting | All sortable columns |
| Column resizing | enabled |
| Column visibility | enabled |
| Row selection | enabled |
| Persistent preferences | enabled (TanStack prefsave) |
| Global search | party_code, display_name, legal_name_en, trade_name_en, main_email |
| Page size | 25 default |
| Export | ERPExportMenu (selected rows > filtered > all) |
| Toolbar slot | "Add Party" button if `parties.create` |

### 3.4 Filters (phase 5A.3)

| Filter | Control | Source |
|---|---|---|
| Party Type | ERPCombobox (multi) | `party_types` |
| Party Status | ERPCombobox | `party_statuses` |
| Country | ERPCombobox | `countries` |
| Emirate | ERPCombobox (cascaded) | `emirates` |
| City | ERPCombobox (cascaded) | `cities` |
| Compliance Status | ERPCombobox | `party_compliance_statuses` |
| Risk Rating | ERPCombobox | `party_risk_ratings` |
| Blacklist Status | ERPCombobox | `party_blacklist_statuses` |
| License Expiry Range | Date range picker | `party_licenses.expiry_date` |
| Created Date Range | Date range picker | `parties.created_at` |
| Active / Inactive | Toggle switch | `parties.is_active` |

### 3.5 Row actions menu

| Action | Permission required | Condition |
|---|---|---|
| View | `parties.view` | Always |
| Edit | `parties.edit` | Not locked |
| Deactivate / Reactivate | `parties.deactivate` | Toggle `is_active` |
| Lock / Unlock | `system_admin` | |
| Delete | `parties.delete` + confirm dialog | Not system |
| Export row | `parties.export` | |

### 3.6 Bulk actions (planned, 5A.4+)

Export selected, Print selected, Deactivate selected, Assign type to selected, Remove type from selected, Mark under review.

### 3.7 Empty states

| State | Display |
|---|---|
| No parties exist | "No parties yet. Click Add Party to get started." |
| No parties match filter | "No parties match the current filters. Try adjusting your search." |
| No permission | "You don't have permission to view parties." |

### 3.8 Loading state

Skeleton rows (5) with pulsing animation. Table header shows normally during load.

---

## 4. Party Drawer — `PartyFormDrawer`

### 4.1 Shell & behavior

| Property | Value |
|---|---|
| Component | `ERPDrawerForm` |
| Width | 80% desktop |
| Modes | `add` \| `edit` \| `view` |
| Footer Add/Edit | Cancel \| Save \| Save & Close |
| Footer View | Close only |
| Safe Close trigger | Dirty add/edit + outside click / Esc / X / Cancel |
| Safe Close dialog | `UnsavedChangesDialog` |
| View mode | All inputs `disabled` or `readOnly`; no footer save buttons |
| Combobox dirty | ERPCombobox changes call `markDirty()` |

### 4.2 `effectivePartyId` pattern

After Add → Save: `effectivePartyId = createdPartyId ?? party?.id`

This is the same pattern as `effectiveCustomerId` in the Customer module. Child tabs (5+) show "Save the party first to manage [contacts/addresses/…]" when `effectivePartyId` is null.

### 4.3 Tab order + lazy loading

| # | Tab label | Mount strategy | Contains parent save data? |
|---|---|---|---|
| 1 | Basic Information | **Always mounted** | Yes — parties columns |
| 2 | Party Types | **Always mounted** | Yes — type assignments |
| 3 | Legal & Licenses | **Always mounted** | No — child table; parent save calls separate action |
| 4 | Tax & Finance | **Always mounted** | No — child table + 1:1 profile |
| 5 | Contacts | `lazyMount` — load on open | No |
| 6 | Addresses | `lazyMount` | No |
| 7 | Bank Details | `lazyMount` + permission gate | No |
| 8 | Services / Categories | `lazyMount` | No |
| 9 | Compliance & Approval | `lazyMount` | No |
| 10 | Documents | `lazyMount` | No — placeholder |
| 11 | Relationships | `lazyMount` | No |
| 12 | Notes & Activity | `lazyMount` | No |
| 13 | Audit | `lazyMount` | No — read-only |

**Tabs 3–4 note:** Although always mounted, their child table data loads on first open via `usePartyLicensesQuery(effectivePartyId)` etc.

### 4.4 Prefetch

`PARTY_FORM_PREFETCH` declaration calls on page mount + before drawer open:

- Geography: countries, emirates (all), cities (all), areas_zones
- Finance: currencies, payment_terms, tax_types, banks, payment_methods
- Party masters: party_natures, party_statuses, party_types, party_license_types, party_license_statuses, party_tax_statuses, party_contact_roles, party_contact_departments, party_address_types, party_document_types, party_document_statuses, party_approval_statuses, party_blacklist_statuses, party_risk_ratings, party_credit_ratings, party_note_types, party_compliance_statuses
- Service master: party_service_categories_master
- Role profile lookups: customer_categories, customer_statuses, invoice_methods, vendor_categories, vendor_ratings, procurement_categories, subcontractor_categories, work_categories, consultant_types, consultant_specializations, recruitment_categories, authority_types, industry_sectors, sales_regions

---

## 5. Tab 1 — Basic Information

### Section A — Identity

| Label | DB column | Control | Source | Req | Validation |
|---|---|---|---|---|---|
| Party Code | party_code | Read-only Input | Numbering | Auto | — |
| Display Name | display_name | Input | — | **Yes** | min 2 chars |
| Legal Name (English) | legal_name_en | Input | — | **Yes** | min 2 chars |
| Legal Name (Arabic) | legal_name_ar | Input | — | No | |
| Trade Name (English) | trade_name_en | Input | — | No | |
| Trade Name (Arabic) | trade_name_ar | Input | — | No | |
| Short Name | short_name | Input | — | No | max 50 |
| Party Nature | party_nature_id | ERPCombobox | `party_natures` | **Yes** | |
| Primary Party Type | primary_party_type_id | ERPCombobox | `party_types` (assigned only in edit) | No | Must ∈ active assignments |
| Parent Party | parent_party_id | PartySelect | `parties` | No | Exclude self; no circular |

**Add mode:** party_code = "(auto-generated)". Party Nature defaults blank. Country defaults to UAE.

### Section B — Primary Communication

| Label | DB column | Control | Req | Validation |
|---|---|---|---|---|
| Main Phone | main_phone | Input | No | |
| Main Mobile | main_mobile | Input | No | |
| WhatsApp | whatsapp | Input | No | |
| Main Email | main_email | Email Input | No | Email regex; duplicate warning on save |
| Alternate Email | alternate_email | Email Input | No | Email regex |
| Website | website | URL Input | No | URL format |

### Section C — Primary Location

| Label | DB column | Control | Source | Cascading |
|---|---|---|---|---|
| Country | country_id | ERPCombobox | `countries` | — default UAE |
| Emirate / Region | emirate_id | ERPCombobox | `emirates` | filtered by country_id |
| City | city_id | ERPCombobox | `cities` | filtered by emirate_id |
| Area / Zone | area_zone_id | ERPCombobox | `areas_zones` | filtered by city_id |
| PO Box | po_box | Input | — | |
| Full Address | full_address_text | Textarea | — | |
| Google Map URL | google_map_url | URL Input | — | |
| Latitude | latitude | Number Input | — | decimal |
| Longitude | longitude | Number Input | — | decimal |

### Section D — Status and Remarks

| Label | DB column | Control | Source | Req |
|---|---|---|---|---|
| Party Status | party_status_id | ERPCombobox | `party_statuses` | **Yes** |
| Active | is_active | Switch | — | Yes (default: true) |
| Remarks | remarks | Textarea | — | No |
| Created At | created_at | Read-only | — | View/Edit |
| Created By | created_by | Read-only user name | `user_profiles` | View/Edit |
| Updated At | updated_at | Read-only | — | View/Edit |
| Updated By | updated_by | Read-only user name | `user_profiles` | View/Edit |

**Empty state (Add):** All read-only audit fields hidden.  
**Skeleton (loading):** Input placeholders animate.

---

## 6. Tab 2 — Party Types

### Section A — Assigned Party Types

- **Control:** `PartyTypeCheckboxGrid`
- Loads `party_types WHERE is_active ORDER BY sort_order ASC`
- Each row: checkbox + type icon + type name + `is_system` badge
- Checking/unchecking calls `markDirty()`
- **Validation on save:** ≥1 active type required

### Section B — Primary Type

- **Control:** Radio group — only checked types shown
- One primary required when ≥1 type is assigned
- **Validation:** primary must ∈ active checked types

### Section C — Type-Specific Status Summary (View/Edit only)

- Read-only badges showing approval status per assigned type from `party_compliance_profiles`
- Example: "Customer — Approved ✓", "Vendor — Pending ⏳"
- Hidden on Add (no compliance profile yet)

### Conditional profile sections (below Section C)

Appear dynamically when relevant type is checked:

| Type checked | Profile section shown |
|---|---|
| CUSTOMER | Customer Profile sub-section (§17.1) |
| VENDOR | Vendor Profile sub-section (§17.2) |
| SUBCONTRACTOR | Subcontractor Profile sub-section (§17.3) |
| CONSULTANT | Consultant Profile sub-section (§17.4) |
| RECRUITMENT_AGENCY | Recruitment Agency Profile sub-section (§17.5) |
| GOVERNMENT_AUTHORITY or LICENSE_ISSUER | Government Authority Profile sub-section (§17.6) |

Each profile sub-section is a collapsible `ERPDrawerSection` below the type checkboxes.

---

## 7. Tab 3 — Legal & Licenses

### Section A — Primary License Summary (read-only card)

Shown when at least one active primary license exists:

- License Number, License Type, Issuing Authority, Issue Date, Expiry Date
- Status badge (color-coded: green = active, red = expired, yellow = under renewal)
- Warning banner if expiry within `renewal_notice_days`

### Section B — License Records (child table)

**Columns:** License Code | License Type | License Number | Issuing Authority | Expiry | Status | Primary | Active | Actions

**Loading:** Skeleton rows when `effectivePartyId` exists and query is fetching.  
**Empty:** "No licenses added yet. Click Add License to start." + Add button.  
**Add/Edit sub-form fields:**

| Label | Control | Source | Req |
|---|---|---|---|
| License Code | Read-only | Numbering | Auto |
| License Type | ERPCombobox | `party_license_types` | **Yes** |
| License Number | Input | — | **Yes** |
| License Name | Input | — | No |
| Issuing Authority | PartySelect `typeCodes=["GOVERNMENT_AUTHORITY","LICENSE_ISSUER","FREE_ZONE_AUTHORITY"]` | `parties` | **Yes** |
| Issuing Country | ERPCombobox | `countries` | No |
| Issuing Emirate | ERPCombobox cascaded | `emirates` | No |
| Issue Date | DatePicker | — | No |
| Expiry Date | DatePicker | — | Required if `renewal_required` |
| Renewal Required | Switch | — | Yes |
| Renewal Notice Days | Number Input | — | No (default: 60) |
| License Status | ERPCombobox | `party_license_statuses` | **Yes** |
| License Activities | Textarea | — | No |
| Link to Document | ERPCombobox | `party_documents` | No |
| Is Primary | Switch | — | Yes |
| Is Active | Switch | — | Yes |
| Remarks | Textarea | — | No |

**Issuer field rule:** Must be `PartySelect` — not a free-text field.

### Section C — License Expiry Alerts (computed)

Shows color-coded list of licenses expiring within 90 days. Computed client-side from loaded licenses data.

---

## 8. Tab 4 — Tax & Finance

### Section A — Tax Registrations (child table)

**Columns:** Tax Code | Tax Type | TRN | Country | Status | Primary | Active | Actions

**Add/Edit sub-form fields:**

| Label | Control | Source | Req |
|---|---|---|---|
| Tax Reg. Code | Read-only | Numbering | Auto |
| Tax Type | ERPCombobox | `tax_types` (existing) | **Yes** |
| Tax Registration Number (TRN) | Input | — | No; 15 chars if UAE |
| Tax Country | ERPCombobox | `countries` | **Yes** |
| Tax Status | ERPCombobox | `party_tax_statuses` | **Yes** |
| Effective From | DatePicker | — | No |
| Effective To | DatePicker | — | No |
| Certificate Document | ERPCombobox | `party_documents` | No |
| Reverse Charge Applicable | Switch | — | No (important for scrap) |
| VAT Exempt | Switch | — | No |
| Is Primary | Switch | — | Yes |
| Remarks | Textarea | — | No |

**Validation:** TRN = exactly 15 characters if provided (UAE format).

### Section B — Default Commercial Terms (`party_finance_profiles` 1:1)

| Label | DB column | Control | Source | Req |
|---|---|---|---|---|
| Default Currency | default_currency_id | ERPCombobox | `currencies` | No |
| Default Payment Term | default_payment_term_id | ERPCombobox | `payment_terms` | No |
| Preferred Payment Method | preferred_payment_method_id | ERPCombobox | `payment_methods` | No |
| Credit Limit | credit_limit | Number Input | — | No |
| Credit Currency | credit_currency_id | ERPCombobox | `currencies` | No |

### Section C — Finance Control

| Label | DB column | Control | Validation |
|---|---|---|---|
| Payment Hold | payment_hold | Switch | |
| Payment Hold Reason | payment_hold_reason | Textarea | Required if payment_hold = true |
| Credit Hold | credit_hold | Switch | |
| Credit Hold Reason | credit_hold_reason | Textarea | Required if credit_hold = true |
| Finance Remarks | finance_remarks | Textarea | No |

---

## 9. Tab 5 — Contacts

**Gated by:** `effectivePartyId` must exist.  
**Empty state:** "No contacts yet." + Add Contact button.  
**Loading:** `usePartyContactsQuery(partyId)` — skeleton 3 rows.

**Table columns:** Contact Code | Full Name | Role | Department | Email | Mobile | Primary | Active | Actions

**Add/Edit sub-form fields (per prompt §14):**

| Label | Control | Source | Req |
|---|---|---|---|
| Contact Code | Read-only | Numbering | Auto |
| Full Name | Input | — | **Yes** |
| Designation | Input | — | No |
| Department | ERPCombobox | `party_contact_departments` | No |
| Contact Role | ERPCombobox | `party_contact_roles` | No |
| Email | Email Input | — | No; dup. warn within party |
| Phone | Input | — | No |
| Mobile | Input | — | No |
| WhatsApp | Input | — | No |
| Is Primary | Switch | — | PUQ: one per party |
| Is Accounts Contact | Switch | — | No |
| Is Sales Contact | Switch | — | No |
| Is Operations Contact | Switch | — | No |
| Is HSE Contact | Switch | — | No |
| Is Documents Contact | Switch | — | No |
| Is Active | Switch | — | Yes |
| Notes | Textarea | — | No |

---

## 10. Tab 6 — Addresses

**Gated by:** `effectivePartyId`.

**Table columns:** Address Code | Type | Country | Emirate | City | Primary | Billing | Shipping | Site | Active | Actions

**Add/Edit sub-form fields (per prompt §15):**

| Label | Control | Source | Req |
|---|---|---|---|
| Address Code | Read-only | Numbering | Auto |
| Address Type | ERPCombobox | `party_address_types` | **Yes** |
| Address Name | Input | — | No |
| Country | ERPCombobox | `countries` | **Yes** |
| Emirate / Region | ERPCombobox cascaded | `emirates` | No |
| City | ERPCombobox cascaded | `cities` | No |
| Area / Zone | ERPCombobox cascaded | `areas_zones` | No |
| Street | Input | — | No |
| Building | Input | — | No |
| Floor | Input | — | No |
| Office No | Input | — | No |
| PO Box | Input | — | No |
| Landmark | Input | — | No |
| Google Map URL | URL Input | — | No |
| Latitude | Number | — | No |
| Longitude | Number | — | No |
| Is Primary | Switch | — | PUQ |
| Is Billing | Switch | — | No |
| Is Shipping | Switch | — | No |
| Is Site | Switch | — | No |
| Is Active | Switch | — | Yes |
| Notes | Textarea | — | No |

---

## 11. Tab 7 — Bank Details

**Permission gate:** If user lacks `manage_bank_details`, show: "You don't have permission to view bank details."

**Visibility defaults:**

| Scenario | Tab state |
|---|---|
| VENDOR, SUBCONTRACTOR, CONSULTANT, RECRUITMENT_AGENCY, SCRAP_SELLER, TRANSPORT_SUPPLIER, EQUIPMENT_SUPPLIER, FUEL_SUPPLIER, WORKSHOP_SUPPLIER, SPARE_PARTS_SUPPLIER, LAB_TESTING_COMPANY, TRAINING_PROVIDER, MANPOWER_SUPPLIER | Expanded (open on first open) |
| CUSTOMER | Expanded optional |
| GOVERNMENT_AUTHORITY only | Collapsed by default |

**Table columns (masked in list):** Bank Detail Code | Bank | Account Holder | IBAN (masked: `AE•••••••••1234`) | Currency | Primary | Verified | Active | Actions

**Add/Edit sub-form fields (per prompt §16):**

| Label | Control | Source | Req |
|---|---|---|---|
| Bank Detail Code | Read-only | Numbering | Auto |
| Bank | ERPCombobox | `banks` (existing) | No |
| Bank Name (text fallback) | Input | — | No |
| Account Holder Name | Input | — | **Yes** |
| Account Number | Input (sensitive) | — | No |
| IBAN | Input | — | No; dup. warn |
| SWIFT Code | Input | — | No |
| Currency | ERPCombobox | `currencies` | No |
| Branch Name | Input | — | No |
| Country | ERPCombobox | `countries` | No |
| Is Primary | Switch | — | PUQ |
| Is Verified | Switch | — | Req. `verify_bank_details` permission |
| Verified By | Read-only | `user_profiles` | System |
| Verified At | Read-only datetime | — | System |
| Verification Document | ERPCombobox | `party_documents` | No |
| Is Active | Switch | — | Yes |
| Remarks | Textarea | — | No |

---

## 12. Tab 8 — Services / Categories

**Loading:** `usePartyServiceCategoriesQuery(partyId)` when opened.  
**Empty:** "No service categories assigned."

### Section A — Service Category Assignment

- **Control:** `PartyServiceCategorySelector` — hierarchical tree checkboxes from `party_service_categories_master`
- Supports parent/child category hierarchy
- Multi-select; one primary designation
- Changes mark dirty

### Section B — Assignments Table

| Column | |
|---|---|
| Category Name | |
| Parent Category | |
| Primary | badge |
| Active | |
| Actions | View/Remove |

---

## 13. Tab 9 — Compliance & Approval

**Loading:** `usePartyComplianceQuery(partyId)` — 1:1 row auto-created on party save.

### Section A — Approval Status

Fields shown conditionally by assigned type:

| Label | Shown when | Source |
|---|---|---|
| KYC Status | Always | `party_compliance_statuses` |
| Customer Approval | CUSTOMER assigned | `party_approval_statuses` |
| Vendor Approval | VENDOR assigned | `party_approval_statuses` |
| Subcontractor Approval | SUBCONTRACTOR assigned | `party_approval_statuses` |
| HSE Approval | SUBCONTRACTOR or VENDOR | `party_approval_statuses` |
| Finance Approval | Always | `party_approval_statuses` |
| Legal Approval | Always | `party_approval_statuses` |

### Section B — Risk and Blacklist

| Label | Control | Source | Permission |
|---|---|---|---|
| Blacklist Status | ERPCombobox | `party_blacklist_statuses` | `parties.blacklist` |
| Blacklist Reason | Textarea | — | Required if blacklisted |
| Risk Rating | ERPCombobox | `party_risk_ratings` | `parties.manage_compliance` |
| Credit Rating | ERPCombobox | `party_credit_ratings` | `parties.manage_compliance` |

### Section C — Holds

| Label | Control | Validation |
|---|---|---|
| Payment Hold | Switch | |
| Payment Hold Reason | Textarea | Required if hold |
| Work Hold | Switch | |
| Work Hold Reason | Textarea | Required if hold |

### Section D — Review Dates

| Label | Control |
|---|---|
| Approved By | ERPCombobox → `user_profiles` |
| Approved At | DateTimePicker |
| Last Review Date | DatePicker |
| Next Review Date | DatePicker |
| Remarks | Textarea |

**Operational selectors rule:** Parties where `party_status ≠ ACTIVE` excluded from operational `PartySelect` by default. Parties where `blacklist_status = BLACKLISTED` excluded unless `includeBlacklisted + parties.blacklist` permission.

---

## 14. Tab 10 — Documents

**Phase 5A.2:** Show placeholder banner:

> "Full document management requires Phase 002F.4 DMS. Metadata records can be added below. File upload will be enabled after DMS integration."

**Metadata table columns:** Doc Code | Type | Title | Doc Number | Expiry | Status | Actions

**Add/Edit sub-form (per prompt §19):**

| Label | Control | Source | Req |
|---|---|---|---|
| Document Code | Read-only | Numbering | Auto |
| Document Type | ERPCombobox | `party_document_types` | **Yes** |
| Document Title | Input | — | **Yes** |
| Document Number | Input | — | No |
| Issue Date | DatePicker | — | No |
| Expiry Date | DatePicker | — | No |
| Issuing Authority | PartySelect `typeCodes=["GOVERNMENT_AUTHORITY","LICENSE_ISSUER"]` | `parties` | No |
| File Path / Upload | Disabled placeholder | DMS later | No |
| File Name | Read-only | — | System |
| File Mime Type | Read-only | — | System |
| File Size | Read-only | — | System |
| Expiry Required | Switch | — | Yes |
| Renewal Notice Days | Number | — | No |
| Document Status | ERPCombobox | `party_document_statuses` | **Yes** |
| Uploaded By | Read-only | `user_profiles` | System |
| Uploaded At | Read-only | — | System |
| Remarks | Textarea | — | No |

---

## 15. Tab 11 — Relationships

**Table columns:** Parent Party | Child Party | Relationship Type | Effective From | Effective To | Active | Actions

**Add form:**

| Label | Control | Source | Req |
|---|---|---|---|
| Related Party | PartySelect | `parties` — exclude self | **Yes** |
| Relationship Type | ERPCombobox | `party_relationship_types` | **Yes** |
| Direction | Radio: "This party is the parent / child" | — | **Yes** |
| Effective From | DatePicker | — | No |
| Effective To | DatePicker | — | No |
| Is Active | Switch | — | Yes |
| Remarks | Textarea | — | No |

**Constraint:** `parent_party_id ≠ child_party_id`. Show client-side error if same party selected.  
**Duplicate rule:** Block duplicate active relationship of same type between same two parties.  
**Inverse display:** Show inverse label hint: "From [Party] perspective, they are the {inverse_type} of this party."

---

## 16. Tab 12 — Notes & Activity

### Section A — Internal Notes

**Table columns:** Note Type | Title | Important | Private | Created By | Created At | Actions

**Add/Edit form:**

| Label | Control | Source | Req |
|---|---|---|---|
| Note Type | ERPCombobox | `party_note_types` | No |
| Note Title | Input | — | No |
| Note Body | Textarea | — | **Yes** |
| Is Important | Switch | — | No |
| Is Private | Switch | — | No (visible only to creator, admin, manage_compliance) |

### Section B — Activity Timeline

Read from `audit_logs WHERE entity_type LIKE 'party%' AND entity_id = effectivePartyId`.

Display: Date/time | User | Action | Entity | Summary. Oldest to newest.  
**Phase 5A.4.** Do not build custom activity engine unless approved.

---

## 17. Tab 13 — Audit

Read-only table from `audit_logs`.

| Column | Source |
|---|---|
| Date/Time | `audit_logs.created_at` |
| User | `user_profiles.full_name` |
| Action | `audit_logs.action` |
| Entity | `audit_logs.entity_type` |
| Before | JSON diff collapse/expand |
| After | JSON diff collapse/expand |
| IP/Session | `audit_logs.ip_address` if available |

**Filter:** `entity_type IN (party, party_type_assignment, party_license, party_tax_registration, party_contact, party_address, party_bank_detail, party_document, party_compliance_profile, party_service_category_assignment, party_relationship, party_note)`

---

## 18. Conditional Profile Sub-Sections (inside Tab 2 — Party Types)

Each appears as a collapsible `ERPDrawerSection` when the corresponding type is checked.

### 18.1 Customer Profile (when CUSTOMER checked)

| Label | Control | Source | Req |
|---|---|---|---|
| Customer Category | ERPCombobox | `customer_categories` | No |
| Customer Type | LookupSelect | CUSTOMER_TYPES (global lookup) | No |
| Industry Sector | ERPCombobox | `industry_sectors` | No |
| Sales Region | ERPCombobox | `sales_regions` | No |
| Payment Term | ERPCombobox | `payment_terms` | No |
| Credit Limit | Number Input | — | No |
| Credit Currency | ERPCombobox | `currencies` | No |
| Sales Owner | ERPCombobox | `user_profiles` | No |
| Requires LPO | Switch | — | No |
| Requires Contract | Switch | — | No |
| Preferred Invoice Method | ERPCombobox | `invoice_methods` | No |
| Customer Status | ERPCombobox | `customer_statuses` | No |
| Remarks | Textarea | — | No |

### 18.2 Vendor Profile (when VENDOR checked)

| Label | Control | Source |
|---|---|---|
| Vendor Category | ERPCombobox | `vendor_categories` |
| Vendor Type | LookupSelect | VENDOR_TYPES (global lookup) |
| Procurement Category | ERPCombobox | `procurement_categories` |
| Payment Term | ERPCombobox | `payment_terms` |
| Default Currency | ERPCombobox | `currencies` |
| Preferred Vendor | Switch | — |
| Vendor Rating | ERPCombobox | `vendor_ratings` |
| Vendor Approval Status | ERPCombobox | `party_approval_statuses` |
| Can Create PO | Switch (default true) | — |
| Requires Comparison | Switch | — |
| Remarks | Textarea | — |

### 18.3 Subcontractor Profile (when SUBCONTRACTOR checked)

Subcontractor Category (`subcontractor_categories`), Subcontractor Type (LookupSelect SUBCONTRACTOR_TYPES), Work Category (`work_categories`), HSE Required switch, Insurance Required switch, Prequalification Required switch, Max Contract Value, Contract Currency (`currencies`), Approved For Site Work switch, Approved By HSE switch, Remarks.

### 18.4 Consultant Profile (when CONSULTANT checked)

Consultant Type (`consultant_types`), Specialization (`consultant_specializations`), Professional License Required switch, Approved For Design switch, Approved For Supervision switch, Remarks.

### 18.5 Recruitment Agency Profile (when RECRUITMENT_AGENCY checked)

Source Country (`countries`), Recruitment Category (`recruitment_categories`), Agreement Required switch, Agreement Expiry Date, Service Fee Terms textarea, Approved For Hiring switch, Remarks.

### 18.6 Government Authority Profile (when GOVERNMENT_AUTHORITY or LICENSE_ISSUER checked)

Authority Type (`authority_types`), Jurisdiction Country (`countries`), Jurisdiction Emirate (`emirates`), Service Category (`party_service_categories_master`), Portal URL (URL input), Portal Username Reference (text — **no password field**), Remarks.

---

## 19. `PartySelect` Component Specification

**Path:** `src/components/erp/party-select/party-select.tsx`  
**Base:** `ERPCombobox` + `usePartySelectQuery(filters)` TanStack Query hook

**Display format in dropdown:** `{party_code} — {display_name}` + type badge(s) + status badge

**Search fields:** `party_code`, `display_name`, `legal_name_en`, `trade_name_en`, TRN (join `party_tax_registrations`), primary license number (join `party_licenses`)

**Default behavior:**
- Excludes `is_active = false` unless `includeInactive = true`
- Excludes blacklisted parties unless `includeBlacklisted = true` AND user has `parties.blacklist` permission

**Complete Props:**

| Prop | Type | Default |
|---|---|---|
| typeCode | string? | — |
| typeCodes | string[]? | — |
| serviceCategoryCode | string? | — |
| serviceCategoryCodes | string[]? | — |
| statusCode | string? | — |
| approvalStatusCode | string? | — |
| countryId | number? | — |
| emirateId | number? | — |
| includeInactive | boolean | false |
| includeBlacklisted | boolean | false |
| value | number? | — |
| onChange | (id: number \| null) => void | — |
| disabled | boolean | false |
| placeholder | string | "Select party…" |

**Usage examples:**

```tsx
<PartySelect typeCode="CUSTOMER" />
<PartySelect typeCode="VENDOR" />
<PartySelect typeCode="GOVERNMENT_AUTHORITY" />
<PartySelect typeCodes={["GOVERNMENT_AUTHORITY","LICENSE_ISSUER","FREE_ZONE_AUTHORITY"]} />
<PartySelect typeCode="VENDOR" serviceCategoryCode="DIESEL_SUPPLY" />
<PartySelect typeCodes={["VENDOR","SUBCONTRACTOR"]} approvalStatusCode="APPROVED" />
```

---

## 20. Admin CRUD Pages (Party Types, Service Categories, Relationship Types)

### 20.1 Party Types (`/admin/master-data/parties/types`)

- `ERPDataTable` + `ERPDrawerForm`
- Columns: Type Code | Type Name | Icon | Color Token | System | Active | Sort | Actions
- System rows (`is_system = true`): edit limited fields only; delete blocked
- Permission: `parties.manage_types`

### 20.2 Service Categories (`/admin/master-data/parties/service-categories`)

- Hierarchical table showing parent→child
- `parent_category_id` self-ref ERPCombobox in form
- System rows protected
- Permission: `parties.manage_service_categories`

### 20.3 Relationship Types (`/admin/master-data/parties/relationship-types`)

- Standard CRUD table
- System rows protected
- Permission: `parties.manage_relationships`

---

## 21. Save, Error, and State Behavior Summary

| Scenario | Behavior |
|---|---|
| Add → Save | Create `parties` row + type assignments + empty `party_finance_profiles` + empty `party_compliance_profiles`; set `effectivePartyId`; stay open; unlock child tabs |
| Add → Save & Close | Same + close drawer + refresh list |
| Edit → Save | Update changed fields; revalidate cache |
| Child table CRUD | Immediate server action; invalidate child query; no drawer close |
| Duplicate detected | Show modal with candidate list; block (TRN/License/IBAN) or warn (name/email); require override permission for blocks |
| Zod validation error | Toast + inline field error per field |
| Server action error | Toast error message |
| Unauthorized | Toast "Permission denied" + disable affected controls |
| View mode | All inputs `disabled`; no Save buttons; Close only |
| Loading (initial) | Skeleton inputs in tab 1; skeleton rows in child tabs |
| Empty child tables | "No [contacts] added yet." + Add button |
| Tab opened before party saved (Add) | "Save the party first to manage [contacts/addresses/…]" placeholder |

---

*End of UI/UX Field Map v2 — PLANNING ONLY*
