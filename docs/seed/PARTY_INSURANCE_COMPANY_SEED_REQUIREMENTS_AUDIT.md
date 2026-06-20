# Party Insurance Company Seed Requirements Audit

## 1. Executive Summary

Based on a thorough review of the database schema migrations, row-level security (RLS) policies, duplicate checking functions, numbering engine configurations, and frontend workspace components, the ERP Party Master system is:

**READY FOR DATA PROMPT**

The database and application architectures are fully capable of supporting UAE insurance companies as a distinct party classification (`party_types` lookup code: `INSURANCE_COMPANY`, ID: `54`). The multi-select classification model allows these entities to be mapped as insurance companies alongside other roles (such as vendor or customer) without schema changes.

Key findings show:
- **Clean Slate**: There are currently zero records containing names matching insurance/broker keywords or assigned to the `INSURANCE_COMPANY` classification.
- **Unified Numbering**: The unified numbering rule `MASTER_PARTY` is enforced with the format `PTY-{SEQ6}`. Category-specific prefixes (like `INS-`) are not natively supported without database rule overrides, so the default `PTY-` prefix must be utilized.
- **Classification Gaps**: There is no dedicated profile table for insurance companies (unlike customers or vendors), and there are no schema fields to distinguish policy issuers from brokers or to store insurance-specific product details. These must be stored in generic fields or lookup assignments.

---

## 2. Files and Database Objects Reviewed

The following files and database objects were inspected during this audit:

### Database Migrations (DDL, Rules, Seeds)
- [20260604180757_erp_base_002f2_global_numbering_engine.sql](file:///c:/dev/agt-erp/supabase/migrations/20260604180757_erp_base_002f2_global_numbering_engine.sql): Defines the global numbering engine schema and generator functions.
- [20260614060000_erp_base_002f5a1_party_master_tables.sql](file:///c:/dev/agt-erp/supabase/migrations/20260614060000_erp_base_002f5a1_party_master_tables.sql): Defines core `parties`, child tables (licenses, tax, addresses, contacts, bank details), and profiles.
- [20260614060001_erp_base_002f5a1_party_master_rls_policies.sql](file:///c:/dev/agt-erp/supabase/migrations/20260614060001_erp_base_002f5a1_party_master_rls_policies.sql): Defines Row Level Security (RLS) policies.
- [20260614060002_erp_base_002f5a1_party_master_seeds_perms_func.sql](file:///c:/dev/agt-erp/supabase/migrations/20260614060002_erp_base_002f5a1_party_master_seeds_perms_func.sql): Defines seed data, numbering rules, RBAC permissions, and the duplicate detection function.
- [20260614215551_erp_dms_6_party_documents_migration.sql](file:///c:/dev/agt-erp/supabase/migrations/20260614215551_erp_dms_6_party_documents_migration.sql) & [20260615030000_erp_dms_owning_fields_party_id.sql](file:///c:/dev/agt-erp/supabase/migrations/20260615030000_erp_dms_owning_fields_party_id.sql): Define DMS integration mappings.

### Frontend Components & Types
- [party-workspace-form.tsx](file:///c:/dev/agt-erp/src/features/master-data/parties/party-workspace-form.tsx): Main multi-section edit/view drawer workspace.
- [party-types-tab.tsx](file:///c:/dev/agt-erp/src/features/master-data/parties/party-types-tab.tsx): Handles classification checkboxes.
- [party-licenses-tab.tsx](file:///c:/dev/agt-erp/src/features/master-data/parties/party-licenses-tab.tsx): Legal licenses sub-form.
- [party-tax-finance-tab.tsx](file:///c:/dev/agt-erp/src/features/master-data/parties/party-tax-finance-tab.tsx): Tax registration and finance profile form.
- [party-contacts-tab.tsx](file:///c:/dev/agt-erp/src/features/master-data/parties/party-contacts-tab.tsx): Child contacts list.
- [party-addresses-tab.tsx](file:///c:/dev/agt-erp/src/features/master-data/parties/party-addresses-tab.tsx): Child addresses list.
- [party-bank-details-tab.tsx](file:///c:/dev/agt-erp/src/features/master-data/parties/party-bank-details-tab.tsx): Access-controlled bank accounts list.
- [party-dms-documents-tab.tsx](file:///c:/dev/agt-erp/src/features/master-data/parties/party-dms-documents-tab.tsx): DMS document integration.
- [party-schemas.ts](file:///c:/dev/agt-erp/src/features/master-data/parties/party-schemas.ts): Zod schema validations.
- [party-types.ts](file:///c:/dev/agt-erp/src/features/master-data/parties/party-types.ts): TypeScript type interfaces.

### Server Actions
- [parties.ts](file:///c:/dev/agt-erp/src/server/actions/master-data/parties.ts): Core database fetch, creation, update, and duplicate checker actions.

---

## 3. Party Master Database Structure

The following tables define the relational database structure for a single party:

| Table | Purpose | Key Columns | Required Columns | Unique Constraints | Foreign Keys | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`parties`** | Core party entity | `id` (BIGINT PK) | `party_code`, `display_name`, `legal_name_en`, `party_nature_id`, `country_id`, `party_status_id`, `is_active` | `party_code` | `party_nature_id`, `primary_party_type_id`, `parent_party_id`, `country_id`, `emirate_id`, `city_id` | Contains primary contacts, address coordinates, Po Box, and statuses. |
| **`party_type_assignments`** | Many-to-many lookup assignments | `id` (BIGINT PK) | `party_id`, `party_type_id`, `is_primary`, `is_active` | `(party_id, party_type_id)` | `party_id`, `party_type_id` | Assigns types like `INSURANCE_COMPANY` or `VENDOR` to a party. |
| **`party_licenses`** | Trade and regulatory licenses | `id` (BIGINT PK) | `license_code`, `party_id`, `license_type_id`, `license_number`, `license_status_id`, `is_primary` | `license_code` | `party_id`, `license_type_id`, `license_status_id`, `issuing_authority_party_id` | Captures issue/expiry date, activities, and DMS document. |
| **`party_tax_registrations`** | Tax and VAT registrations | `id` (BIGINT PK) | `tax_registration_code`, `party_id`, `tax_type_id`, `tax_registration_number`, `tax_status_id` | `tax_registration_code`, `(party_id, tax_type_id, tax_registration_number)` | `party_id`, `tax_type_id`, `tax_status_id`, `tax_country_id` | Captures TRN and certificate links. |
| **`party_finance_profiles`** | Financial parameters (1:1) | `id` (BIGINT PK) | `party_id`, `finance_hold` | `party_id` | `party_id`, `default_currency_id`, `default_payment_term_id`, `default_payment_method_id` | Stores credit limit and hold status. |
| **`party_contacts`** | Associated personnel | `id` (BIGINT PK) | `contact_code`, `party_id`, `full_name`, `is_primary` | `contact_code` | `party_id`, `department_id`, `contact_role_id` | Multiple contacts allowed; can flag role flags (Accounts, HSE, etc.). |
| **`party_addresses`** | Multi-address locations | `id` (BIGINT PK) | `address_code`, `party_id`, `address_type_id`, `country_id` | `address_code` | `party_id`, `address_type_id`, `country_id`, `emirate_id`, `city_id` | Distinguishes Registered, Head Office, Billing, Shipping, etc. |
| **`party_bank_details`** | Verified bank accounts | `id` (BIGINT PK) | `bank_detail_code`, `party_id`, `account_holder_name` | `bank_detail_code` | `party_id`, `bank_id`, `currency_id`, `country_id` | Encrypted/protected; checks duplicate IBANs. |
| **`party_compliance_profiles`** | AML/KYC review holds (1:1) | `id` (BIGINT PK) | `party_id`, `payment_hold`, `work_hold` | `party_id` | `party_id`, `kyc_status_id`, `risk_rating_id`, `credit_rating_id` | Compliance and approval settings. |
| **`dms_documents`** | Central document repository | `id` (BIGINT PK) | `document_no`, `title`, `status` | `document_no` | `document_type_id`, `party_id` | Unified file metadata repository. |

---

## 4. Party Numbering and Code Rules

- **Enforced Numbering Rule**: The unified party code is governed by the rule code `MASTER_PARTY` in `global_numbering_rules`.
- **Reference Number Format**: The generated sequence follows the format `PTY-{SEQ6}` (e.g. `PTY-000001`), utilizing a 6-digit sequence padded with `'0'` starting from 1. 
- **Manual Override Compatibility**: The `MASTER_PARTY` rule has `allow_manual_override = false` in the database seed, and the `createParty` server action programmatically generates the code from this rule. Therefore:
  > [!WARNING]
  > Custom prefixes like `INS-` are **not compatible** with the current system. Recommending or generating custom `INS-` codes will cause database constraint exceptions or trigger failures since manual override is disabled. All seeded parties must receive a sequence generated under the standard `PTY-` prefix.

---

## 5. Party Screen Routes and Components

The UI screens for Party Master are structured as Next.js app routes, integrating the core `PartyWorkspaceForm`:

| Area | Route | File Path | Purpose | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Party Add** | `/admin/master-data/parties/record/new` | [page.tsx](file:///c:/dev/agt-erp/src/app/%28protected%29/admin/master-data/parties/record/new/page.tsx) | Renders the creation form | Defaults fields to empty or preselects slugs. |
| **Party Edit/View** | `/admin/master-data/parties/record/[id]` | [page.tsx](file:///c:/dev/agt-erp/src/app/%28protected%29/admin/master-data/parties/record/%5Bid%5D/page.tsx) | Edit form or read-only view | downgrades to `view` mode if edit permission is missing. |
| **Filter Lists** | `/admin/master-data/parties/[typeSlug]` | [page.tsx](file:///c:/dev/agt-erp/src/app/%28protected%29/admin/master-data/parties/%5BtypeSlug%5D/page.tsx) | Displays subset by classification | Example: `/admin/master-data/parties/insurance_company`. |

---

## 6. Party Form Tabs and Fields

The workspace layout is partitioned into several sections:

### Tab: Basic Information
Renders in [party-workspace-form.tsx](file:///c:/dev/agt-erp/src/features/master-data/parties/party-workspace-form.tsx#L465-L654).

| Field Label | Database Field | Required | Data Type | Validation Rule | Lookup Source | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Party Code** | `party_code` | Yes (System) | TEXT | Generated | `MASTER_PARTY` rule | Disabled in UI. |
| **Display Name** | `display_name` | Yes | TEXT | `min(1)` | None | Friendly UI label. |
| **Legal Name (English)** | `legal_name_en` | Yes | TEXT | `min(1)` | None | Main official legal name. |
| **Legal Name (Arabic)** | `legal_name_ar` | No | TEXT | None | None | Renders right-to-left. |
| **Trade Name (English)** | `trade_name_en` | No | TEXT | None | None | Commercial trading name. |
| **Trade Name (Arabic)** | `trade_name_ar` | No | TEXT | None | None | Renders right-to-left. |
| **Short Name** | `short_name` | No | TEXT | None | None | Abbreviated name. |
| **Party Nature** | `party_nature_id` | Yes | BIGINT | Positive Int | `party_natures` | LLC, PLC, Branch, etc. |
| **Parent Party** | `parent_party_id` | No | BIGINT | Exclude self | `parties` | Establishes parent hierarchy. |
| **Main Phone** | `main_phone` | No | TEXT | None | None | Primary office contact. |
| **Main Mobile** | `main_mobile` | No | TEXT | None | None | Primary mobile number. |
| **WhatsApp** | `whatsapp` | No | TEXT | None | None | Messaging number. |
| **Main Email** | `main_email` | No | TEXT | Zod email | None | Validates email syntax. |
| **Alternate Email** | `alternate_email` | No | TEXT | Zod email | None | Validates email syntax. |
| **Website** | `website` | No | TEXT | Zod url | None | Validates URL structure. |
| **Country** | `country_id` | Yes | BIGINT | Positive Int | `countries` | Primary country reference. |
| **Emirate** | `emirate_id` | No | BIGINT | Positive Int | `emirates` | Filtered by Country. |
| **City** | `city_id` | No | BIGINT | Positive Int | `cities` | Filtered by Emirate. |
| **Area / Zone** | `area_zone_id` | No | BIGINT | Positive Int | `areas_zones` | Filtered by City. |
| **PO Box** | `po_box` | No | TEXT | None | None | Postal box number. |
| **Full Address** | `full_address_text` | No | TEXT | None | None | Text address field. |
| **Google Maps URL** | `google_map_url` | No | TEXT | None | None | Location link. |
| **Latitude** | `latitude` | No | NUMERIC | `-90` to `90` | None | Geolocation coordinate. |
| **Longitude** | `longitude` | No | NUMERIC | `-180` to `180` | None | Geolocation coordinate. |
| **Party Status** | `party_status_id` | Yes | BIGINT | Positive Int | `party_statuses` | Active, Inactive, Draft, etc. |
| **Active** | `is_active` | Yes | BOOLEAN | None | None | Switch; defaults to true. |
| **Remarks** | `remarks` | No | TEXT | None | None | Generic notes. |

### Tab: Party Types
Renders in [party-types-tab.tsx](file:///c:/dev/agt-erp/src/features/master-data/parties/party-types-tab.tsx).

| Field Label | Database Field | Required | Data Type | Validation Rule | Lookup Source | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Assigned Types** | `party_type_id` | Yes | BIGINT[] | Multi-select | `party_types` | E.g. Check `Insurance Company`. |
| **Primary Type** | `is_primary` | Yes | BOOLEAN | Exactly one | `party_types` | Sets `primary_party_type_id` on party. |

### Tab: Legal & Licenses
Renders in [party-licenses-tab.tsx](file:///c:/dev/agt-erp/src/features/master-data/parties/party-licenses-tab.tsx).

| Field Label | Database Field | Required | Data Type | Validation Rule | Lookup Source | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **License Type** | `license_type_id` | Yes | BIGINT | Positive Int | `party_license_types` | E.g. Commercial, Professional. |
| **License Number** | `license_number` | Yes | TEXT | `min(1)` | None | License number string. |
| **License Name** | `license_name` | No | TEXT | None | None | Official registered name on license. |
| **Issuing Authority** | `issuing_authority_party_id` | No | BIGINT | Positive Int | `parties` (filtered) | Filtered to authority types. |
| **Issuing Country** | `issuing_country_id` | No | BIGINT | Positive Int | `countries` | Originating nation. |
| **Issuing Emirate** | `issuing_emirate_id` | No | BIGINT | Positive Int | `emirates` | Emirate of license issuance. |
| **Issue Date** | `issue_date` | No | DATE | None | None | Date of license issue. |
| **Expiry Date** | `expiry_date` | No | DATE | None | None | Date of license expiry. |
| **Status** | `license_status_id` | Yes | BIGINT | Positive Int | `party_license_statuses` | Active, Expired, Suspended. |
| **Primary** | `is_primary` | Yes | BOOLEAN | None | None | Flag for primary trade license. |
| **Active** | `is_active` | Yes | BOOLEAN | None | None | General status flag. |
| **Activity Text** | `license_activity_text` | No | TEXT | None | None | Listed commercial activities. |
| **DMS Document** | `dms_license_document_id` | No | BIGINT | Positive Int | `dms_documents` | Linked file reference. |

### Tab: Tax & Finance
Renders in [party-tax-finance-tab.tsx](file:///c:/dev/agt-erp/src/features/master-data/parties/party-tax-finance-tab.tsx).

| Field Label | Database Field | Required | Data Type | Validation Rule | Lookup Source | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Tax Type** | `tax_type_id` | Yes | BIGINT | Positive Int | `tax_types` | E.g. VAT. |
| **Registration Number** | `tax_registration_number` | Yes | TEXT | `min(1)` | None | TRN (15 digits in UAE). |
| **Tax Status** | `tax_status_id` | Yes | BIGINT | Positive Int | `party_tax_statuses` | Registered, Exempt, etc. |
| **Effective From** | `effective_from` | No | DATE | None | None | Start date. |
| **Effective To** | `effective_to` | No | DATE | None | None | End date. |
| **Reverse Charge** | `reverse_charge_applicable` | Yes | BOOLEAN | None | None | Flag for RCM transactions. |
| **VAT Exempt** | `vat_exempt` | Yes | BOOLEAN | None | None | Exemption flag. |
| **Primary** | `is_primary` | Yes | BOOLEAN | None | None | Flag for primary tax profile. |
| **DMS Certificate** | `dms_certificate_document_id` | No | BIGINT | Positive Int | `dms_documents` | Certificate file link. |
| **Default Currency** | `default_currency_id` | No | BIGINT | Positive Int | `currencies` | Finance profile setting. |
| **Default Payment Term** | `default_payment_term_id` | No | BIGINT | Positive Int | `payment_terms` | Finance profile setting. |
| **Default Payment Method** | `default_payment_method_id` | No | BIGINT | Positive Int | `payment_methods` | Finance profile setting. |
| **Credit Limit** | `credit_limit` | No | NUMERIC | Non-negative | None | Allowed outstanding limit. |
| **Credit Currency** | `credit_currency_id` | No | BIGINT | Positive Int | `currencies` | Credit threshold currency. |
| **Finance Hold** | `finance_hold` | Yes | BOOLEAN | None | None | Lock transactions flag. |
| **Finance Hold Reason** | `finance_hold_reason` | No | TEXT | Required if hold | None | Reason details. |

### Tab: Contacts
Renders in [party-contacts-tab.tsx](file:///c:/dev/agt-erp/src/features/master-data/parties/party-contacts-tab.tsx).

| Field Label | Database Field | Required | Data Type | Validation Rule | Lookup Source | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Full Name** | `full_name` | Yes | TEXT | `min(1)` | None | Contact name. |
| **Designation** | `designation` | No | TEXT | None | None | E.g. Claims Officer, Account Manager. |
| **Department** | `department_id` | No | BIGINT | Positive Int | `party_contact_departments`| E.g. Claims, Finance. |
| **Contact Role** | `contact_role_id` | No | BIGINT | Positive Int | `party_contact_roles` | E.g. Primary, Accounts. |
| **Email** | `email` | No | TEXT | Zod email | None | Validates format. |
| **Phone** | `phone` | No | TEXT | None | None | Office number. |
| **Mobile** | `mobile` | No | TEXT | None | None | Personal/work mobile. |
| **WhatsApp** | `whatsapp` | No | TEXT | None | None | Messaging number. |
| **Primary** | `is_primary` | Yes | BOOLEAN | None | None | Main contact person. |
| **Accounts Contact** | `is_accounts_contact` | Yes | BOOLEAN | None | None | Receives financial communications. |
| **Sales Contact** | `is_sales_contact` | Yes | BOOLEAN | None | None | Receives sales queries. |
| **Operations Contact** | `is_operations_contact` | Yes | BOOLEAN | None | None | Receives operational requests. |
| **HSE Contact** | `is_hse_contact` | Yes | BOOLEAN | None | None | Receives HSE requests. |
| **Documents Contact** | `is_documents_contact` | Yes | BOOLEAN | None | None | Receives document/invoicing renewals. |

### Tab: Addresses
Renders in [party-addresses-tab.tsx](file:///c:/dev/agt-erp/src/features/master-data/parties/party-addresses-tab.tsx).

| Field Label | Database Field | Required | Data Type | Validation Rule | Lookup Source | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Address Type** | `address_type_id` | Yes | BIGINT | Positive Int | `party_address_types` | Head Office, Branch, etc. |
| **Address Name** | `address_name` | No | TEXT | None | None | E.g. "Dubai Branch Office". |
| **Country** | `country_id` | Yes | BIGINT | Positive Int | `countries` | E.g. UAE. |
| **Emirate** | `emirate_id` | No | BIGINT | Positive Int | `emirates` | E.g. Dubai, Abu Dhabi. |
| **City** | `city_id` | No | BIGINT | Positive Int | `cities` | Specific city reference. |
| **Area / Zone** | `area_zone_id` | No | BIGINT | Positive Int | `areas_zones` | District zone reference. |
| **Street** | `street` | No | TEXT | None | None | Street text. |
| **Building** | `building` | No | TEXT | None | None | Building name/number. |
| **Floor** | `floor` | No | TEXT | None | None | Floor number. |
| **Office No** | `office_no` | No | TEXT | None | None | Office number. |
| **PO Box** | `po_box` | No | TEXT | None | None | Postal code. |
| **Landmark** | `landmark` | No | TEXT | None | None | Near-by landmark. |
| **Google Maps URL** | `google_map_url` | No | TEXT | None | None | Map link. |
| **Primary** | `is_primary` | Yes | BOOLEAN | None | None | Sets primary flag. |
| **Billing Address** | `is_billing_address` | Yes | BOOLEAN | None | None | Target for invoicing. |
| **Shipping Address** | `is_shipping_address` | Yes | BOOLEAN | None | None | Target for deliveries. |
| **Site Address** | `is_site_address` | Yes | BOOLEAN | None | None | Operational site location. |

### Tab: Bank Details
Renders in [party-bank-details-tab.tsx](file:///c:/dev/agt-erp/src/features/master-data/parties/party-bank-details-tab.tsx).

| Field Label | Database Field | Required | Data Type | Validation Rule | Lookup Source | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Bank** | `bank_id` | No | BIGINT | Positive Int | `banks` | Select from Finance Banks. |
| **Bank Name (Manual)** | `bank_name_text` | No | TEXT | None | None | Used if not listed in banks lookup. |
| **Account Holder** | `account_holder_name` | Yes | TEXT | `min(1)` | None | Account holder name. |
| **Account Number** | `account_number` | No | TEXT | None | None | Basic account number. |
| **IBAN** | `iban` | No | TEXT | Duplicate Warning | None | Validates duplicate IBAN records. |
| **SWIFT Code** | `swift_code` | No | TEXT | None | None | SWIFT code. |
| **Branch Name** | `branch_name` | No | TEXT | None | None | Bank branch name. |
| **Currency** | `currency_id` | No | BIGINT | Positive Int | `currencies` | Bank account currency. |
| **Country** | `country_id` | No | BIGINT | Positive Int | `countries` | Bank origin country. |
| **Primary** | `is_primary` | Yes | BOOLEAN | None | None | Flag for primary account. |
| **Active** | `is_active` | Yes | BOOLEAN | None | None | Switch; defaults to true. |
| **Remarks** | `remarks` | No | TEXT | None | None | Bank account remarks. |

### Tab: Documents (DMS Integration)
Renders in [party-dms-documents-tab.tsx](file:///c:/dev/agt-erp/src/features/master-data/parties/party-dms-documents-tab.tsx).

| Field Label | Database Field | Required | Data Type | Validation Rule | Lookup Source | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Title** | `title` | Yes | TEXT | `min(1)` | None | Document title. |
| **Description** | `description` | No | TEXT | None | None | Description text. |
| **Document Type** | `document_type_id` | Yes | BIGINT | Positive Int | `dms_document_types` | Document type dropdown. |
| **Issue Date** | `issue_date` | No | DATE | None | None | Document issue date. |
| **Expiry Date** | `expiry_date` | No | DATE | None | None | Document expiry date. |
| **Confidentiality** | `confidentiality_level` | Yes | TEXT | None | None | Defaults to `'internal'`. |

---

## 7. Party Classification Model

Seeding UAE insurance companies must align with the **Multi-Select Party Classification Model**:
- **Party Type**: Insurance companies must be classified in the database under `party_types` with `type_code = 'INSURANCE_COMPANY'` (ID: `54`).
- **Mapping mechanism**: This classification is stored in `party_type_assignments`. An insert is required mapping `party_id` to `party_type_id = 54`.
- **Primary Classification**: The column `primary_party_type_id` in the `parties` table must also reference `54` if the insurance company is primarily mapped as such.
- **Multi-Role compatibility**: The system supports assigning multiple active classifications (e.g. `VENDOR` and `INSURANCE_COMPANY`) to the same party simultaneously.

---

## 8. Insurance Company Field Readiness

The table below assesses the compatibility of insurance seed fields against the database:

| Required Insurance Seed Field | Existing ERP Field | Existing Table/Column | Ready | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Legal Company Name** | Legal Name (English) | `parties.legal_name_en` | **Yes** | Required. |
| **Trade Name** | Trade Name (English) | `parties.trade_name_en` | **Yes** | Optional. |
| **Party Code** | Party Code | `parties.party_code` | **Yes** | System generated via `PTY-{SEQ6}`. |
| **Issuer vs Broker** | None | None | **No** | **GAP**: No field exists in the DB or UI to denote if the insurance company is a policy issuer or broker. Must be flagged as `UNKNOWN` or omitted from seed parameters. |
| **Insurance Product Types** | None | None | **No** | **GAP**: No product type fields (e.g. Motor, Medical) exist in the DB. Can only be cataloged using generic notes (`party_notes`) or service category mappings (`party_service_category_assignments`). |
| **Emirate** | Emirate / Region | `parties.emirate_id` | **Yes** | Lookup from `emirates` (Abu Dhabi: 1, Dubai: 2, Sharjah: 3). |
| **Address** | Full Address | `parties.full_address_text` | **Yes** | Or via child table `party_addresses`. |
| **Phone** | Main Phone | `parties.main_phone` | **Yes** | Optional. |
| **Email** | Main Email | `parties.main_email` | **Yes** | Optional. |
| **Website** | Website | `parties.website` | **Yes** | Optional. |
| **TRN** | Registration Number | `party_tax_registrations.tax_registration_number` | **Yes** | Stored in the child table. |
| **Trade License Number** | License Number | `party_licenses.license_number` | **Yes** | Stored in the child table. |
| **Regulator Reference** | None | None | **No** | **GAP**: No licensing regulator reference field exists in the DB. |
| **Status** | Party Status | `parties.party_status_id` | **Yes** | Set to `ACTIVE` (ID: 14). |
| **Notes / Remarks** | Remarks | `parties.remarks` | **Yes** | Optional. |
| **Contact Person** | Full Name | `party_contacts.full_name` | **Yes** | Stored in child table `party_contacts`. |

---

## 9. Company / Organization Ownership Rules

- **Global Scope**: The `parties` table is **global** across the ERP and has no `owner_company_id` or `organization_id` column.
- **Sharing**: Since the tables are global, ALGT and ALS share the same insurer records automatically.
- **Seeding Ownership**: Seed records will be created globally. Audit columns (`created_by`, `updated_by`) should reference a system administrator user profile ID or be set to `NULL` (since they are nullable foreign keys referencing `user_profiles(id)`).

---

## 10. RLS and Permission Compatibility

- **RLS Policies**: All party-related tables have Row-Level Security (RLS) policies enabled.
- **Policies on `parties`**:
  - `parties_select_policy` allows select for users with `master_data.parties.view` or `system_admin`.
  - `parties_insert_policy` allows insert for users with `master_data.parties.create` or `system_admin`.
  - `parties_update_policy` allows edit for users with `master_data.parties.edit` or `system_admin`.
- **Bypassing RLS for Seeding**:
  - Seeding must bypass RLS. This requires executing the seeding scripts using a **Supabase migration script** (which executes as a superuser), the **Supabase Dashboard Console**, or via the **Service Role API Key** which bypasses RLS policies.
  - Doing this bypasses frontend permission checks and RLS restrictions.

---

## 11. Audit Logging Compatibility

- **Audit Mechanism**: The Next.js server actions log audit history by calling `logAudit` which inserts rows into the `audit_logs` table.
- **Seeding Auditing**: 
  - Seeds executed directly via database SQL migration scripts do not trigger Next.js server actions, so no `audit_logs` entries will be generated automatically.
  - If database audit compliance requires audit entries, the SQL seed migration must explicitly insert corresponding audit rows into the `audit_logs` table (referencing `entity_name = 'parties'`).
  - Otherwise, database audit fields on the row level (`created_by`, `created_at`, `updated_by`, `updated_at`) should be populated with system defaults (`created_by = NULL` and `created_at = now()`).

---

## 12. Existing Insurance/Broker Related Records

A query of the active database was performed to locate any records matching insurance or broker keywords:

- **Type Assignments**: 0 records found for `party_type_id = 54` (`INSURANCE_COMPANY`).
- **Keyword Search**: 0 records containing "insurance", "insur", "broker", "assurance", or "takaful" found in `parties.display_name` or `parties.legal_name_en`.
- **Duplicate Risk**: There is no risk of name collisions with pre-existing insurance records. However, standard duplicate checks on TRN or trade licenses must be performed before seeding to prevent clashes with existing customer or vendor records.

---

## 13. Lookup Values Needed

The following database lookups are already seeded and can be directly referenced in the future seed data:

| Lookup Area | Existing Values Found | Missing Values | Recommendation |
| :--- | :--- | :--- | :--- |
| **Party Type** | `INSURANCE_COMPANY` (ID: `54`), `VENDOR` (ID: `14`), `CUSTOMER` (ID: `13`) | None | Assign primary type ID `54` to all seeded records. |
| **Party Nature** | `LLC` (ID: `25`), `PLC` (ID: `26`), `INDIVIDUAL` (ID: `27`), `SOLE_PROPRIETORSHIP` (ID: `28`) | None | Map to correct nature ID based on company name (usually LLC: `25` or PLC: `26`). |
| **Party Status** | `ACTIVE` (ID: `14`), `DRAFT` (ID: `13`), `INACTIVE` (ID: `15`) | None | Map to `ACTIVE` (ID: `14`). |
| **Country** | `AE` (ID: `1`) | None | Set to `1`. |
| **Emirate** | `AUH` (ID: `1`), `DXB` (ID: `2`), `SHJ` (ID: `3`) | None | Map to the correct emirate of license issuance. |
| **Address Type** | `HEAD_OFFICE` (ID: `18`), `REGISTERED` (ID: `17`) | None | Map child addresses to `HEAD_OFFICE` (ID: `18`). |
| **Contact Role** | `PRIMARY_CONTACT` (ID: `19`), `ACCOUNTS` (ID: `20`) | None | Map child contacts to `PRIMARY_CONTACT` (ID: `19`). |
| **License Type** | `COMMERCIAL` (ID: `1`), `PROFESSIONAL` (ID: `2`) | None | Map child licenses to `COMMERCIAL` (ID: `1`). |
| **License Status** | `ACTIVE` (ID: `13`) | None | Map to `ACTIVE` (ID: `13`). |
| **Tax Status** | `REGISTERED` (ID: `11`) | None | Map to `REGISTERED` (ID: `11`). |
| **Insurance Product**| None | E.g. `MOTOR_TPI`, `MEDICAL`, `CARGO` | **GAP**: No product classifications exist. Product details must be stored in the generic `parties.remarks` or handled in a later phase. |

---

## 14. Gaps and Risks

| Gap/Risk | Evidence/File/Table | Impact | Recommendation |
| :--- | :--- | :--- | :--- |
| **Broker vs Issuer Flag** | No column in `parties` or `party_type_assignments` | The system cannot filter out brokers or agents from policy issuers programmatically. | **Human Decision Needed**: Must exclude brokers manually during the compilation of the seed list. |
| **Insurance Product Categories** | No fields or lookup tables for insurance types | Cannot store whether an insurer provides motor, medical, or cargo insurance. | Store these details in the generic `remarks` field, or configure custom service category lookups. |
| **Regulator Reference** | No column for Central Bank/Health Authority license numbers | Cannot record regulatory licenses for compliance audits. | Store the regulatory reference as a separate row in the `party_licenses` table under type `OTHER`. |
| **Numbering Sequence Clash** | `parties` table has unique constraint on `party_code` | Seeding with hardcoded codes might conflict with the global counter. | **Avoid hardcoded codes**: Do not hardcode party codes in the SQL seed. Allow the database to call `generate_next_reference_number('MASTER_PARTY')` during insertion to obtain the next sequential code. |

---

## 15. Recommended Data Template for ChatGPT

ChatGPT should use the following CSV/JSON structure when preparing the UAE insurance company seed list. These fields map directly to existing database columns:

```json
[
  {
    "display_name": "Friendly Name (e.g. Abu Dhabi National Insurance Company)",
    "legal_name_en": "Official Registered Name (English) (e.g. Abu Dhabi National Insurance Company PJSC)",
    "party_nature_id": 26, 
    "primary_party_type_id": 54,
    "country_id": 1,
    "emirate_id": 1,
    "city_name": "Dubai or Abu Dhabi (optional)",
    "main_phone": "Main Office Phone (optional)",
    "main_email": "Official Contact Email (optional)",
    "website": "Corporate URL (optional)",
    "po_box": "PO Box number (optional)",
    "full_address_text": "Head office address details (optional)",
    "party_status_id": 14,
    "remarks": "Insurance Products Offered: Motor, Medical, Property, etc. (Store product details here)",
    "trade_license_number": "Main DED Trade License Number (optional)",
    "trn": "Federal Tax Registration Number (optional)",
    "contact_name": "Main claims or account manager name (optional)",
    "contact_email": "Main contact email (optional)"
  }
]
```

---

## 16. Final Recommendation

**READY FOR DATA PROMPT**

ChatGPT should proceed to the next phase by presenting a seed list of UAE insurance companies that are **actual policy issuers** (not brokers) matching the template format.

### Next Steps for ChatGPT:
1. Generate the JSON/CSV seed data for UAE policy issuers (e.g., ADNIC, Oman Insurance/Sukoon, Al Ain Ahlia, Emirates Insurance, etc.).
2. The seed data must only target **active policy issuers** in UAE.
3. Once the data is generated, draft an SQL insertion script that:
   - Inserts into `parties` utilizing the `generate_next_reference_number` function to generate valid `party_code` values (or calls the default database sequence).
   - Inserts a corresponding row into `party_type_assignments` mapping the new parties to type ID `54` (`INSURANCE_COMPANY`).
   - Inserts child rows into `party_licenses`, `party_tax_registrations`, and `party_contacts` where data is provided.
