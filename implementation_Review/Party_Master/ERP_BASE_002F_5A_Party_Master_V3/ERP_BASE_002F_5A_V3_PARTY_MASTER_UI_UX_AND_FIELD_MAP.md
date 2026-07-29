# ERP BASE 002F.5A V3 — Party Master UI/UX and Field Map

**REVIEW ONLY — DO NOT IMPLEMENT**  
**Phase:** ERP BASE 002F.5A V3  
**Generated:** 2026-06-13

---

## 1. Global UI Standards

All Party Master UI must follow the current ALGT ERP global standards:

| Component | Usage |
|---|---|
| `ERPDrawerForm` | All add/edit/view drawers |
| `ERPDrawerSection` | Named sections within drawer |
| `ERPFormFooter` | Footer with Cancel / Save / Save & Close |
| `RequiredLabel` | All required fields |
| `ERPCombobox` | All dropdowns sourced from DB tables |
| `LookupSelect` | Global lookup values |
| `PartySelect` | Selecting parties (see §7) |
| `useFormDirty` | Dirty state detection |
| `UnsavedChangesDialog` | On close with unsaved changes |
| TanStack Query | All data fetching, caching, invalidation |
| TanStack Table | List tables |

**Drawer footer:**  
- Add/Edit mode: `Cancel` | `Save` | `Save & Close`  
- View mode: `Close`

**Safe Close behavior:**  
- Dirty Add/Edit + outside click / Esc / X / Cancel → Show `UnsavedChangesDialog`  
- View mode → direct close, no dialog

**Child tab locking:**  
All child tabs (Contacts, Addresses, Bank Details, Services, Compliance, Documents, Relationships, Notes, Audit) are **locked until party is saved and `effectivePartyId` exists**.

---

## 2. Sidebar (Planned — implementation in phase 5A.3)

```
Administration
└── Master Data
    ├── Customers                     ← legacy, keep until 5A.5 retirement
    └── Party Master
        ├── All Parties
        ├── Customers
        ├── Vendors
        ├── Subcontractors
        ├── Consultants
        ├── Recruitment Agencies
        ├── Government Authorities
        ├── Banks
        ├── Insurance Companies
        ├── License Issuers
        ├── ── (admin section)
        ├── Party Types
        ├── Party Service Categories
        └── Party Relationship Types
```

---

## 3. Routes

| Route | Component | Type |
|---|---|---|
| `/admin/master-data/parties` | `PartiesPage` | All Parties list |
| `/admin/master-data/parties/customers` | `PartiesPage(typeCode="CUSTOMER")` | Filtered |
| `/admin/master-data/parties/vendors` | `PartiesPage(typeCode="VENDOR")` | Filtered |
| `/admin/master-data/parties/subcontractors` | `PartiesPage(typeCode="SUBCONTRACTOR")` | Filtered |
| `/admin/master-data/parties/consultants` | `PartiesPage(typeCode="CONSULTANT")` | Filtered |
| `/admin/master-data/parties/recruitment-agencies` | `PartiesPage(typeCode="RECRUITMENT_AGENCY")` | Filtered |
| `/admin/master-data/parties/government-authorities` | `PartiesPage(typeCode="GOVERNMENT_AUTHORITY")` | Filtered |
| `/admin/master-data/parties/banks` | `PartiesPage(typeCode="BANK")` | Filtered |
| `/admin/master-data/parties/insurance-companies` | `PartiesPage(typeCode="INSURANCE_COMPANY")` | Filtered |
| `/admin/master-data/parties/license-issuers` | `PartiesPage(typeCode="LICENSE_ISSUER")` | Filtered |
| `/admin/master-data/parties/types` | `PartyTypesAdminPage` | CRUD |
| `/admin/master-data/parties/service-categories` | `ServiceCategoriesAdminPage` | CRUD |
| `/admin/master-data/parties/relationship-types` | `RelationshipTypesAdminPage` | CRUD |

All filtered views reuse `PartiesTable` component — no duplicated code.

---

## 4. PartiesTable — List Page

### 4.1 All Parties columns (full view)

| # | Column | Source | Sortable | Exportable |
|---|---|---|---|---|
| 1 | Party Code | `parties.party_code` | ✅ | ✅ |
| 2 | Display Name | `parties.display_name` | ✅ | ✅ |
| 3 | Legal Name EN | `parties.legal_name_en` | ✅ | ✅ |
| 4 | Legal Name AR | `parties.legal_name_ar` | | ✅ |
| 5 | Trade Name EN | `parties.trade_name_en` | ✅ | ✅ |
| 6 | Trade Name AR | `parties.trade_name_ar` | | ✅ |
| 7 | Party Types | `party_type_assignments` (joined) | | ✅ |
| 8 | Primary Type | `party_types.type_name` via `primary_party_type_id` | ✅ | ✅ |
| 9 | Status | `party_statuses.name_en` via `party_status_id` | ✅ | ✅ |
| 10 | Country | `countries.name` via `country_id` | ✅ | ✅ |
| 11 | Emirate | `emirates.name` via `emirate_id` | ✅ | ✅ |
| 12 | City | `cities.name` via `city_id` | | ✅ |
| 13 | Main Phone | `parties.main_phone` | | ✅ |
| 14 | Main Email | `parties.main_email` | | ✅ |
| 15 | TRN | `party_tax_registrations.tax_registration_number` (primary) | | ✅ |
| 16 | Primary License No. | `party_licenses.license_number` (primary) | | ✅ |
| 17 | License Expiry | `party_licenses.expiry_date` (primary) | ✅ | ✅ |
| 18 | Compliance Status | `party_compliance_statuses.name_en` via KYC | | ✅ |
| 19 | Risk Rating | `party_risk_ratings.name_en` | | ✅ |
| 20 | Blacklist Status | `party_blacklist_statuses.name_en` | | ✅ |
| 21 | Created At | `parties.created_at` | ✅ | ✅ |
| 22 | Updated At | `parties.updated_at` | ✅ | ✅ |
| 23 | Actions | Row actions menu | | |

### 4.2 Filtered-view simplified columns

| # | Column | Source |
|---|---|---|
| 1 | Party Code | `parties.party_code` |
| 2 | Display Name | `parties.display_name` |
| 3 | Party Types | `party_type_assignments` (joined) |
| 4 | Status | `party_statuses.name_en` |
| 5 | Main Phone | `parties.main_phone` |
| 6 | Main Email | `parties.main_email` |
| 7 | Updated At | `parties.updated_at` |
| 8 | Actions | Row actions |

### 4.3 Table features

- Global search (display_name, legal_name_en, party_code, main_email)
- Column visibility toggle
- Column resizing
- Column preferences persistence
- Export to CSV / Excel (exportable columns only)
- Row selection for bulk actions
- Pagination (configurable page size)
- Sort by any sortable column

### 4.4 Row actions

| Action | Permission Required |
|---|---|
| View | `parties.view` |
| Edit | `parties.edit` |
| Deactivate / Reactivate | `parties.deactivate` |
| Lock / Unlock | `parties.lock` |
| Delete | `parties.delete` |

### 4.5 Bulk actions

| Action | Permission |
|---|---|
| Deactivate selected | `parties.deactivate` |
| Export selected | `parties.export` |

### 4.6 Filters

| Filter | Source |
|---|---|
| Party Type (multi) | `party_types` |
| Status | `party_statuses` |
| Country | `countries` |
| Emirate | `emirates` |
| City | `cities` |
| Risk Rating | `party_risk_ratings` |
| Blacklist Status | `party_blacklist_statuses` |
| Compliance Status | `party_compliance_statuses` |
| Is Active | Boolean toggle |
| License Expiry range | Date range picker |
| Created At range | Date range picker |

---

## 5. PartyFormDrawer

### 5.1 Structure

- Opens as right-side drawer (full height or configurable width)
- 3 modes: `add`, `edit`, `view`
- Header: Party Code (auto) + Display Name + mode badge
- 13 tabs (child tabs locked until party saved)
- `ERPFormFooter` at bottom

### 5.2 Tab summary

| # | Tab | Tables | Lock |
|---|---|---|---|
| 1 | Basic Information | `parties` | Unlocked |
| 2 | Party Types | `party_type_assignments`, `party_types` | Unlocked |
| 3 | Legal & Licenses | `party_licenses`, `party_license_types`, `party_license_statuses` | After save |
| 4 | Tax & Finance | `party_tax_registrations`, `party_finance_profiles` | After save |
| 5 | Contacts | `party_contacts` | After save |
| 6 | Addresses | `party_addresses` | After save |
| 7 | Bank Details | `party_bank_details` | After save + permission |
| 8 | Services / Categories | `party_service_category_assignments` | After save |
| 9 | Compliance & Approval | `party_compliance_profiles` | After save + permission |
| 10 | Documents | `party_documents` | After save |
| 11 | Relationships | `party_relationships` | After save |
| 12 | Notes & Activity | `party_notes` | After save |
| 13 | Audit | `audit_logs` | After save + `view_audit` |

---

## 6. Tab Field Specifications

### 6.1 Tab 1 — Basic Information

**Section A: Identity**

| Field | DB Column | Control | Source | Required | Notes |
|---|---|---|---|---|---|
| Party Code | `party_code` | Read-only input | Auto from MASTER_PARTY | Auto | Never editable |
| Display Name | `display_name` | TextInput | — | ✅ | Shown in all dropdowns |
| Legal Name EN | `legal_name_en` | TextInput | — | ✅ | |
| Legal Name AR | `legal_name_ar` | TextInput | — | | RTL input |
| Trade Name EN | `trade_name_en` | TextInput | — | | |
| Trade Name AR | `trade_name_ar` | TextInput | — | | RTL input |
| Short Name | `short_name` | TextInput | — | | |
| Party Nature | `party_nature_id` | ERPCombobox | `party_natures` | ✅ | |
| Primary Party Type | `primary_party_type_id` | ERPCombobox | Assigned types (Tab 2) | | Set after types assigned |
| Parent Party | `parent_party_id` | PartySelect | All parties (exclude self) | | For branches/subsidiaries |

**Section B: Primary Communication**

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| Main Phone | `main_phone` | TextInput | — | |
| Main Mobile | `main_mobile` | TextInput | — | |
| WhatsApp | `whatsapp` | TextInput | — | |
| Main Email | `main_email` | EmailInput | — | |
| Alternate Email | `alternate_email` | EmailInput | — | |
| Website | `website` | UrlInput | — | |

**Section C: Primary Location**

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| Country | `country_id` | ERPCombobox | `countries` | ✅ |
| Emirate | `emirate_id` | ERPCombobox | `emirates` filtered by `country_id` | |
| City | `city_id` | ERPCombobox | `cities` filtered by `emirate_id` | |
| Area / Zone | `area_zone_id` | ERPCombobox | `areas_zones` filtered by `city_id` | |
| PO Box | `po_box` | TextInput | — | |
| Full Address Text | `full_address_text` | Textarea | — | |
| Google Map URL | `google_map_url` | UrlInput | — | |
| Latitude | `latitude` | NumericInput (10,8) | — | |
| Longitude | `longitude` | NumericInput (11,8) | — | |

**Section D: Status & Remarks**

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| Party Status | `party_status_id` | ERPCombobox | `party_statuses` | ✅ |
| Is Active | `is_active` | Toggle | — | |
| Remarks | `remarks` | Textarea | — | |

---

### 6.2 Tab 2 — Party Types

**Dynamic Checkbox Grid**

- Loads all active types from `party_types`
- Each type renders as a checkbox with `type_name`, `icon_name`, and `color_token`
- No hardcoded type checkboxes in React
- Multiple selections allowed
- One type can be set as "Primary"

**Fields:**

| Field | Control | Notes |
|---|---|---|
| Party Types (multi) | `PartyTypeCheckboxGrid` (dynamic from `party_types`) | At least one required before party can be Active |
| Primary Type | Radio selector within checked types | Must be one of the checked types |
| Assignment Remarks | Textarea | Per-assignment remarks stored in `party_type_assignments.remarks` |

**Conditional profile panels (appear below types grid when type selected):**

| Type | Profile Panel |
|---|---|
| CUSTOMER | Customer Profile (§8.1) |
| VENDOR | Vendor Profile (§8.2) |
| SUBCONTRACTOR | Subcontractor Profile (§8.3) |
| CONSULTANT | Consultant Profile (§8.4) |
| RECRUITMENT_AGENCY | Recruitment Agency Profile (§8.5) |
| GOVERNMENT_AUTHORITY | Government Authority Profile (§8.6) |
| LICENSE_ISSUER | Government Authority Profile (§8.6) |
| FREE_ZONE_AUTHORITY | Government Authority Profile (§8.6) |

---

### 6.3 Tab 3 — Legal & Licenses

Child table grid for `party_licenses`.

**Column headers:** License Code | Type | License No. | Name | Issuing Authority | Country | Emirate | Issue Date | Expiry | Status | Primary | Active | Actions

**Inline row form fields:**

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| License Code | `license_code` | Read-only | Auto MASTER_PARTY_LICENSE | Auto |
| License Type | `license_type_id` | ERPCombobox | `party_license_types` | ✅ |
| License Number | `license_number` | TextInput | — | ✅ |
| License Name | `license_name` | TextInput | — | |
| Issuing Authority | `issuing_authority_party_id` | PartySelect | Types: GOVERNMENT_AUTHORITY, LICENSE_ISSUER, FREE_ZONE_AUTHORITY | |
| Issuing Country | `issuing_country_id` | ERPCombobox | `countries` | |
| Issuing Emirate | `issuing_emirate_id` | ERPCombobox | `emirates` | |
| Issue Date | `issue_date` | DatePicker | — | |
| Expiry Date | `expiry_date` | DatePicker | — | |
| Renewal Required | `renewal_required` | Toggle | — | |
| Renewal Notice Days | `renewal_notice_days` | NumericInput | — | |
| License Status | `license_status_id` | ERPCombobox | `party_license_statuses` | ✅ |
| License Activity | `license_activity_text` | Textarea | — | |
| License Document | `license_document_id` | ERPCombobox | `party_documents` (same party) | |
| Is Primary | `is_primary` | Toggle | — | |
| Is Active | `is_active` | Toggle | — | |
| Remarks | `remarks` | Textarea | — | |

**Rules:**  
- One primary active license per party (enforced by partial unique index + UI validation)  
- License expiry badge shows warning ≤ 30 days, danger if expired

---

### 6.4 Tab 4 — Tax & Finance

**Section A: Tax Registrations** (child table)

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| Tax Registration Code | `tax_registration_code` | Read-only | Auto MASTER_PARTY_TAX | Auto |
| Tax Type | `tax_type_id` | ERPCombobox | `tax_types` (existing) | ✅ |
| Tax Registration No. | `tax_registration_number` | TextInput | — | ✅ |
| Tax Country | `tax_country_id` | ERPCombobox | `countries` | |
| Tax Status | `tax_status_id` | ERPCombobox | `party_tax_statuses` | ✅ |
| Effective From | `effective_from` | DatePicker | — | |
| Effective To | `effective_to` | DatePicker | — | |
| Certificate Document | `certificate_document_id` | ERPCombobox | `party_documents` (same party) | |
| Reverse Charge | `reverse_charge_applicable` | Toggle | — | |
| VAT Exempt | `vat_exempt` | Toggle | — | |
| Is Primary | `is_primary` | Toggle | — | |
| Is Active | `is_active` | Toggle | — | |
| Remarks | `remarks` | Textarea | — | |

**Section B: Finance Profile** (1:1, form section)

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| Default Currency | `default_currency_id` | ERPCombobox | `currencies` | |
| Default Payment Term | `default_payment_term_id` | ERPCombobox | `payment_terms` | |
| Default Payment Method | `default_payment_method_id` | ERPCombobox | `payment_methods` | |
| Credit Limit | `credit_limit` | NumericInput | — | |
| Credit Currency | `credit_currency_id` | ERPCombobox | `currencies` | |
| Payment Hold | `payment_hold` | Toggle | — | Permission-gated |
| Payment Hold Reason | `payment_hold_reason` | Textarea | — | Required if hold enabled |
| Finance Remarks | `finance_remarks` | Textarea | — | |

---

### 6.5 Tab 5 — Contacts

Child table grid for `party_contacts`.

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| Contact Code | `contact_code` | Read-only | Auto MASTER_PARTY_CONTACT | Auto |
| Full Name | `full_name` | TextInput | — | ✅ |
| Designation | `designation` | TextInput | — | |
| Department | `department_id` | ERPCombobox | `party_contact_departments` | |
| Contact Role | `contact_role_id` | ERPCombobox | `party_contact_roles` | |
| Email | `email` | EmailInput | — | |
| Phone | `phone` | TextInput | — | |
| Mobile | `mobile` | TextInput | — | |
| WhatsApp | `whatsapp` | TextInput | — | |
| Is Primary | `is_primary` | Toggle | — | |
| Is Accounts | `is_accounts_contact` | Checkbox | — | |
| Is Sales | `is_sales_contact` | Checkbox | — | |
| Is Operations | `is_operations_contact` | Checkbox | — | |
| Is HSE | `is_hse_contact` | Checkbox | — | |
| Is Documents | `is_documents_contact` | Checkbox | — | |
| Is Active | `is_active` | Toggle | — | |
| Notes | `notes` | Textarea | — | |

---

### 6.6 Tab 6 — Addresses

Child table grid for `party_addresses`.

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| Address Code | `address_code` | Read-only | Auto MASTER_PARTY_ADDRESS | Auto |
| Address Type | `address_type_id` | ERPCombobox | `party_address_types` | ✅ |
| Address Name | `address_name` | TextInput | — | |
| Country | `country_id` | ERPCombobox | `countries` | ✅ |
| Emirate | `emirate_id` | ERPCombobox | `emirates` (filtered by country) | |
| City | `city_id` | ERPCombobox | `cities` (filtered by emirate) | |
| Area / Zone | `area_zone_id` | ERPCombobox | `areas_zones` (filtered by city) | |
| Street | `street` | TextInput | — | |
| Building | `building` | TextInput | — | |
| Floor | `floor` | TextInput | — | |
| Office No. | `office_no` | TextInput | — | |
| PO Box | `po_box` | TextInput | — | |
| Landmark | `landmark` | TextInput | — | |
| Google Map URL | `google_map_url` | UrlInput | — | |
| Latitude | `latitude` | NumericInput | — | |
| Longitude | `longitude` | NumericInput | — | |
| Is Primary | `is_primary` | Toggle | — | |
| Is Billing | `is_billing_address` | Checkbox | — | |
| Is Shipping | `is_shipping_address` | Checkbox | — | |
| Is Site | `is_site_address` | Checkbox | — | |
| Is Active | `is_active` | Toggle | — | |
| Notes | `notes` | Textarea | — | |

---

### 6.7 Tab 7 — Bank Details

**Permission gate:** Tab is hidden (or shows locked state) when user lacks `view_bank_details AND manage_bank_details`.

Child table grid for `party_bank_details`.

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| Bank Detail Code | `bank_detail_code` | Read-only | Auto MASTER_PARTY_BANK | Auto |
| Bank | `bank_id` | ERPCombobox | `banks` (existing) | |
| Bank Name (text) | `bank_name_text` | TextInput | — | When bank not in master |
| Account Holder Name | `account_holder_name` | TextInput | — | ✅ |
| Account Number | `account_number` | TextInput | — | |
| IBAN | `iban` | TextInput | — | Duplicate warning |
| SWIFT Code | `swift_code` | TextInput | — | |
| Currency | `currency_id` | ERPCombobox | `currencies` | |
| Branch Name | `branch_name` | TextInput | — | |
| Country | `country_id` | ERPCombobox | `countries` | |
| Is Primary | `is_primary` | Toggle | — | |
| Is Verified | `is_verified` | Toggle | — | Requires `verify_bank_details` |
| Verified By | `verified_by` | UserSelect | `user_profiles` | Auto on verification |
| Verified At | `verified_at` | DateTimePicker | — | Auto on verification |
| Verification Document | `verification_document_id` | ERPCombobox | `party_documents` | |
| Is Active | `is_active` | Toggle | — | |
| Remarks | `remarks` | Textarea | — | |

---

### 6.8 Tab 8 — Services / Categories

Child table grid for `party_service_category_assignments`.

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| Service Category | `service_category_id` | TreeSelect / ERPCombobox | `party_service_categories_master` | ✅ |
| Is Primary | `is_primary` | Toggle | — | |
| Is Active | `is_active` | Toggle | — | |
| Remarks | `remarks` | Textarea | — | |

**Tree display:** Hierarchical via `parent_category_id`.

---

### 6.9 Tab 9 — Compliance & Approval

**Permission gate:** Blacklist, holds require `manage_compliance OR blacklist` permission.

Form section for `party_compliance_profiles` (1:1).

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| KYC Status | `kyc_status_id` | ERPCombobox | `party_compliance_statuses` | |
| Vendor Approval | `vendor_approval_status_id` | ERPCombobox | `party_approval_statuses` | |
| Customer Approval | `customer_approval_status_id` | ERPCombobox | `party_approval_statuses` | |
| Subcontractor Approval | `subcontractor_approval_status_id` | ERPCombobox | `party_approval_statuses` | |
| HSE Approval | `hse_approval_status_id` | ERPCombobox | `party_approval_statuses` | |
| Finance Approval | `finance_approval_status_id` | ERPCombobox | `party_approval_statuses` | |
| Legal Approval | `legal_approval_status_id` | ERPCombobox | `party_approval_statuses` | |
| Blacklist Status | `blacklist_status_id` | ERPCombobox | `party_blacklist_statuses` | `blacklist` permission |
| Blacklist Reason | `blacklist_reason` | Textarea | — | Required if blacklisted |
| Risk Rating | `risk_rating_id` | ERPCombobox | `party_risk_ratings` | |
| Credit Rating | `credit_rating_id` | ERPCombobox | `party_credit_ratings` | |
| Payment Hold | `payment_hold` | Toggle | — | `manage_compliance` |
| Payment Hold Reason | `payment_hold_reason` | Textarea | — | Required if hold |
| Work Hold | `work_hold` | Toggle | — | `manage_compliance` |
| Work Hold Reason | `work_hold_reason` | Textarea | — | Required if hold |
| Approved By | `approved_by` | UserSelect | `user_profiles` | |
| Approved At | `approved_at` | DateTimePicker | — | |
| Last Review Date | `last_review_date` | DatePicker | — | |
| Next Review Date | `next_review_date` | DatePicker | — | |
| Remarks | `remarks` | Textarea | — | |

---

### 6.10 Tab 10 — Documents

Child table grid for `party_documents`.

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| Document Code | `document_code` | Read-only | Auto MASTER_PARTY_DOCUMENT | Auto |
| Document Type | `document_type_id` | ERPCombobox | `party_document_types` | ✅ |
| Document Title | `document_title` | TextInput | — | ✅ |
| Document Number | `document_number` | TextInput | — | |
| Issue Date | `issue_date` | DatePicker | — | |
| Expiry Date | `expiry_date` | DatePicker | — | |
| Issuing Authority | `issuing_authority_party_id` | PartySelect | Types: GOVERNMENT_AUTHORITY, LICENSE_ISSUER, FREE_ZONE_AUTHORITY | |
| File Path | `file_path` | FilePicker / DMS | — | Nullable (DMS phase) |
| File Name | `file_name` | Read-only | Auto from upload | |
| MIME Type | `file_mime_type` | Read-only | Auto | |
| File Size | `file_size` | Read-only (KB/MB format) | Auto | |
| Expiry Required | `expiry_required` | Toggle | — | |
| Renewal Notice Days | `renewal_notice_days` | NumericInput | — | |
| Document Status | `document_status_id` | ERPCombobox | `party_document_statuses` | ✅ |
| Uploaded By | `uploaded_by` | UserSelect | `user_profiles` | |
| Uploaded At | `uploaded_at` | DateTimePicker | — | Auto on upload |
| Remarks | `remarks` | Textarea | — | |

---

### 6.11 Tab 11 — Relationships

Child table grid for `party_relationships`.

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| Parent Party | `parent_party_id` | PartySelect | All parties | ✅ |
| Child Party | `child_party_id` | PartySelect | All parties (exclude self) | ✅ |
| Relationship Type | `relationship_type_id` | ERPCombobox | `party_relationship_types` | ✅ |
| Effective From | `effective_from` | DatePicker | — | |
| Effective To | `effective_to` | DatePicker | — | |
| Is Active | `is_active` | Toggle | — | |
| Remarks | `remarks` | Textarea | — | |

---

### 6.12 Tab 12 — Notes & Activity

Child table grid for `party_notes`.

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| Note Code | `note_code` | Read-only | Auto MASTER_PARTY_NOTE | Auto |
| Note Type | `note_type_id` | ERPCombobox | `party_note_types` | |
| Note Title | `note_title` | TextInput | — | |
| Note Body | `note_body` | Textarea | — | ✅ |
| Is Private | `is_private` | Toggle | — | Private = only creator + privileged see it |
| Follow-up Date | `follow_up_date` | DatePicker | — | |

**Activity section** (read-only below notes):  
Shows recent `audit_logs` entries filtered by `party_id`. Summary view only (date, user, action). No edit controls.

---

### 6.13 Tab 13 — Audit

Read-only audit timeline. Requires `view_audit` permission.

| Column | Source |
|---|---|
| Date / Time | `audit_logs.created_at` |
| User | `user_profiles.full_name` |
| Action | `audit_logs.action` |
| Table | `audit_logs.table_name` |
| Record | `audit_logs.record_id` |
| Before / After summary | `audit_logs.old_values` / `new_values` |
| Remarks | `audit_logs.remarks` |

Filter: All `audit_logs` entries where `entity_type = 'PARTY'` and `entity_id = party_id`, plus child table entries where available.

---

## 7. PartySelect Component Specification

**Component:** `PartySelect`  
**Wrapper:** `ERPCombobox` with server-side filtered search  
**Query:** Server-side search against `parties` joined with `party_type_assignments`

### Props

| Prop | Type | Description |
|---|---|---|
| `typeCode` | `string` | Filter by single party type code |
| `typeCodes` | `string[]` | Filter by multiple type codes |
| `serviceCategoryCode` | `string` | Filter by primary service category |
| `serviceCategoryCodes` | `string[]` | Filter by multiple service categories |
| `statusCode` | `string` | Filter by `party_statuses.code` |
| `approvalStatusCode` | `string` | Filter by compliance approval status |
| `countryId` | `bigint` | Filter by country |
| `emirateId` | `bigint` | Filter by emirate |
| `cityId` | `bigint` | Filter by city |
| `includeInactive` | `boolean` | Default false: only active parties |
| `includeBlocked` | `boolean` | Default false: requires permission |
| `excludePartyId` | `bigint` | Exclude a specific party (e.g., self) |
| `placeholder` | `string` | Placeholder text |
| `disabled` | `boolean` | Disabled state |
| `onChange` | `(id: bigint, party: Party) => void` | Selection callback |

### Display format in dropdown

`[Party Code] — Display Name (Type1, Type2)`

### Usage examples

| Usage | Props |
|---|---|
| License issuer | `typeCodes=["GOVERNMENT_AUTHORITY","LICENSE_ISSUER","FREE_ZONE_AUTHORITY"]` |
| Purchase Order supplier | `typeCode="VENDOR"` |
| RFQ vendor for diesel | `typeCode="VENDOR" serviceCategoryCode="DIESEL_SUPPLY"` |
| Customer for quotation | `typeCode="CUSTOMER"` |
| Subcontractor for project | `typeCode="SUBCONTRACTOR" approvalStatusCode="APPROVED"` |
| Recruitment agency | `typeCode="RECRUITMENT_AGENCY"` |
| Bank party | `typeCode="BANK"` |
| Insurance | `typeCode="INSURANCE_COMPANY"` |
| Waste disposal | `typeCode="WASTE_DISPOSAL_FACILITY"` |
| Parent party selector | `excludePartyId={currentPartyId}` |

---

## 8. Role-Specific Profile Panels

These panels appear within **Tab 2 — Party Types** or optionally as a sub-panel on demand. Each profile panel is conditionally rendered based on the party's assigned types.

### 8.1 Customer Profile Panel

Visible when CUSTOMER type is assigned.

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| Customer Category | `customer_category_id` | ERPCombobox | `customer_categories` | |
| Customer Status | `customer_status_id` | ERPCombobox | `customer_statuses` | |
| Industry Sector | `industry_sector_id` | ERPCombobox | `industry_sectors` | |
| Sales Region | `sales_region_id` | ERPCombobox | `sales_regions` | |
| Payment Term | `payment_term_id` | ERPCombobox | `payment_terms` | |
| Credit Limit | `credit_limit` | NumericInput | — | |
| Credit Currency | `credit_currency_id` | ERPCombobox | `currencies` | |
| Sales Owner | `sales_owner_user_id` | UserSelect | `user_profiles` | |
| Requires LPO | `requires_lpo` | Toggle | — | |
| Requires Contract | `requires_contract` | Toggle | — | |
| Invoice Method | `preferred_invoice_method_id` | ERPCombobox | `invoice_methods` | |
| Remarks | `customer_remarks` | Textarea | — | |

---

### 8.2 Vendor Profile Panel

Visible when VENDOR type is assigned.

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| Vendor Category | `vendor_category_id` | ERPCombobox | `vendor_categories` | |
| Vendor Rating | `vendor_rating_id` | ERPCombobox | `vendor_ratings` | |
| Procurement Category | `procurement_category_id` | ERPCombobox | `procurement_categories` | |
| Payment Term | `payment_term_id` | ERPCombobox | `payment_terms` | |
| Default Currency | `default_currency_id` | ERPCombobox | `currencies` | |
| Preferred Vendor | `preferred_vendor` | Toggle | — | |
| Vendor Approval | `vendor_approval_status_id` | ERPCombobox | `party_approval_statuses` | |
| Can Create PO | `can_create_po` | Toggle | — | |
| Requires Comparison | `requires_comparison` | Toggle | — | |
| Remarks | `vendor_remarks` | Textarea | — | |

---

### 8.3 Subcontractor Profile Panel

Visible when SUBCONTRACTOR type is assigned.

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| Subcontractor Category | `subcontractor_category_id` | ERPCombobox | `subcontractor_categories` | |
| Work Category | `work_category_id` | ERPCombobox | `work_categories` | |
| HSE Required | `hse_required` | Toggle | — | |
| Insurance Required | `insurance_required` | Toggle | — | |
| Prequalification Required | `prequalification_required` | Toggle | — | |
| Max Contract Value | `max_contract_value` | NumericInput | — | |
| Contract Currency | `contract_currency_id` | ERPCombobox | `currencies` | |
| Approved for Site Work | `approved_for_site_work` | Toggle | — | |
| Approved by HSE | `approved_by_hse` | Toggle | — | |
| Remarks | `subcontractor_remarks` | Textarea | — | |

---

### 8.4 Consultant Profile Panel

Visible when CONSULTANT type is assigned.

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| Consultant Type | `consultant_type_id` | ERPCombobox | `consultant_types` | |
| Specialization | `specialization_id` | ERPCombobox | `consultant_specializations` | |
| Professional License Required | `professional_license_required` | Toggle | — | |
| Approved for Design | `approved_for_design` | Toggle | — | |
| Approved for Supervision | `approved_for_supervision` | Toggle | — | |
| Remarks | `consultant_remarks` | Textarea | — | |

---

### 8.5 Recruitment Agency Profile Panel

Visible when RECRUITMENT_AGENCY type is assigned.

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| Source Country | `source_country_id` | ERPCombobox | `countries` | |
| Recruitment Category | `recruitment_category_id` | ERPCombobox | `recruitment_categories` | |
| Agreement Required | `agreement_required` | Toggle | — | |
| Agreement Expiry | `agreement_expiry_date` | DatePicker | — | |
| Service Fee Terms | `service_fee_terms` | Textarea | — | |
| Approved for Hiring | `approved_for_hiring` | Toggle | — | |
| Remarks | `recruitment_remarks` | Textarea | — | |

---

### 8.6 Government Authority Profile Panel

Visible when GOVERNMENT_AUTHORITY, LICENSE_ISSUER, or FREE_ZONE_AUTHORITY type is assigned.

| Field | DB Column | Control | Source | Required |
|---|---|---|---|---|
| Authority Type | `authority_type_id` | ERPCombobox | `authority_types` | |
| Jurisdiction Country | `jurisdiction_country_id` | ERPCombobox | `countries` | |
| Jurisdiction Emirate | `jurisdiction_emirate_id` | ERPCombobox | `emirates` | |
| Service Category | `service_category_id` | ERPCombobox | `party_service_categories_master` | |
| Portal URL | `portal_url` | UrlInput | — | |
| Portal Username Reference | `portal_username_reference` | TextInput | — | Reference label only |
| Remarks | `government_remarks` | Textarea | — | |

> **Security:** No password fields. Display note: "Portal credentials must be managed in a separate secure vault."

---

## 9. Duplicate Detection UI

**Trigger:** On blur / on save of: `legal_name_en`, `trade_name_en`, `main_email`, `main_mobile`, `main_phone`, `tax_registration_number` (TRN), `license_number`, `iban`.

**Display:**  
- Warning badge inline below the field  
- Toast notification for block-level matches  
- Duplicate panel in drawer: table showing matched parties with link to view each

**Block conditions:**  
- Exact active TRN match → save blocked  
- Exact active license number → save blocked  

**Override:**  
- Requires `override_duplicate` permission  
- Confirmation dialog: reason required  
- Logged to `audit_logs` with `action = DUPLICATE_OVERRIDE`

---

## 10. Admin CRUD Pages (phase 5A.3)

### 10.1 Party Types Admin (`/admin/master-data/parties/types`)

Table columns: Code | Name EN | Name AR | Icon | Color | System | Active | Sort | Actions  
Actions: Edit name/icon/color/sort, activate/deactivate, delete (non-system only)

### 10.2 Service Categories Admin (`/admin/master-data/parties/service-categories`)

Tree table with parent/child hierarchy.  
Columns: Code | Name EN | Name AR | Parent | System | Active | Sort | Actions

### 10.3 Relationship Types Admin (`/admin/master-data/parties/relationship-types`)

Table: Code | Name EN | Name AR | System | Active | Sort | Actions

---

*End of V3 UI/UX Field Map — REVIEW ONLY — DO NOT IMPLEMENT*
