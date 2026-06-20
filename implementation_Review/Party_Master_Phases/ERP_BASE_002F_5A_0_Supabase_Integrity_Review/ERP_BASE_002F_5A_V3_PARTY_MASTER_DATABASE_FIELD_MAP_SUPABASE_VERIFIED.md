# ERP BASE 002F.5A V3 — Party Master Database Field Map

**REVIEW ONLY — DO NOT IMPLEMENT**  
**Phase:** ERP BASE 002F.5A V3  
**Generated:** 2026-06-13  
**Total new tables:** 53

---

## Legend

| Symbol | Meaning |
|---|---|
| PK | Primary key |
| FK | Foreign key |
| NN | NOT NULL |
| UQ | Unique |
| DEF | DEFAULT |
| IDX | Index |

All primary keys: `BIGINT GENERATED ALWAYS AS IDENTITY`. All timestamps: `TIMESTAMPTZ`. All `created_by` / `updated_by`: `BIGINT` (FK → `user_profiles.id`, nullable for system).

---

## A. CORE TABLES

### A1. `party_types`

| Column | Type | NN | Default | Notes |
|---|---|---|---|---|
| id | BIGINT | ✅ | identity PK | |
| type_code | TEXT | ✅ | | UQ, UPPERCASE |
| type_name | TEXT | ✅ | | |
| type_name_ar | TEXT | | | |
| description | TEXT | | | |
| icon_name | TEXT | | | Lucide icon name |
| color_token | TEXT | | | Tailwind/design token |
| is_system | BOOLEAN | ✅ | false | System types: no delete |
| is_active | BOOLEAN | ✅ | true | |
| sort_order | INTEGER | ✅ | 0 | |
| created_at | TIMESTAMPTZ | ✅ | now() | |
| created_by | BIGINT | | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() | |
| updated_by | BIGINT | | | FK → user_profiles |

**Constraints:** `type_code` uppercase enforced via CHECK or trigger.  
**Indexes:** `type_code`, `is_active`, `sort_order`.  
**RLS:** SELECT = `auth.uid() IS NOT NULL`. INSERT/UPDATE = `manage_types OR system_admin`. DELETE = `system_admin AND is_system = false`.

---

### A2. `parties`

| Column | Type | NN | Default | Notes |
|---|---|---|---|---|
| id | BIGINT | ✅ | identity PK | |
| party_code | TEXT | ✅ | | UQ, from global_numbering_rules MASTER_PARTY |
| display_name | TEXT | ✅ | | |
| legal_name_en | TEXT | ✅ | | |
| legal_name_ar | TEXT | | | |
| trade_name_en | TEXT | | | |
| trade_name_ar | TEXT | | | |
| short_name | TEXT | | | |
| party_nature_id | BIGINT | ✅ | | FK → party_natures |
| primary_party_type_id | BIGINT | | | FK → party_types |
| parent_party_id | BIGINT | | | FK → parties(id) self-ref |
| main_phone | TEXT | | | |
| main_mobile | TEXT | | | |
| whatsapp | TEXT | | | |
| main_email | TEXT | | | CHECK valid email format |
| alternate_email | TEXT | | | CHECK valid email format |
| website | TEXT | | | |
| country_id | BIGINT | ✅ | | FK → countries |
| emirate_id | BIGINT | | | FK → emirates |
| city_id | BIGINT | | | FK → cities |
| area_zone_id | BIGINT | | | FK → areas_zones |
| po_box | TEXT | | | |
| full_address_text | TEXT | | | |
| google_map_url | TEXT | | | |
| latitude | NUMERIC(10,8) | | | |
| longitude | NUMERIC(11,8) | | | |
| party_status_id | BIGINT | ✅ | | FK → party_statuses |
| is_active | BOOLEAN | ✅ | true | |
| is_locked | BOOLEAN | ✅ | false | |
| is_system | BOOLEAN | ✅ | false | |
| remarks | TEXT | | | |
| deactivated_at | TIMESTAMPTZ | | | |
| deactivated_by | BIGINT | | | FK → user_profiles |
| deactivation_reason | TEXT | | | |
| created_at | TIMESTAMPTZ | ✅ | now() | |
| created_by | BIGINT | | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() | |
| updated_by | BIGINT | | | FK → user_profiles |

**Constraints:**  
- `party_code` UNIQUE  
- `display_name` NOT NULL  
- `legal_name_en` NOT NULL  
- `main_email` CHECK (`main_email ~* '^[^@]+@[^@]+\.[^@]+$'`) when not null  
- `alternate_email` same format check  
- `latitude` BETWEEN -90 AND 90  
- `longitude` BETWEEN -180 AND 180  
- `parent_party_id != id` (no self-parent)  

**Indexes:**  
- `party_code` (UNIQUE)  
- `display_name` (BTREE)  
- `legal_name_en` (BTREE)  
- `trade_name_en` (BTREE, partial WHERE NOT NULL)  
- `main_email` (BTREE, partial WHERE NOT NULL)  
- `country_id`  
- `emirate_id`  
- `city_id`  
- `party_status_id`  
- `primary_party_type_id`  
- `is_active`  
- `created_at`  
- `updated_at`  
- GIN trigram on `lower(legal_name_en)` (requires `pg_trgm` — see §Notes)  
- GIN trigram on `lower(trade_name_en)` (requires `pg_trgm` — partial WHERE NOT NULL)  

**RLS:** See SQL file — `parties_select_policy`, `parties_insert_policy`, `parties_update_policy`, `parties_delete_policy`.

---

### A3. `party_type_assignments`

| Column | Type | NN | Default | Notes |
|---|---|---|---|---|
| id | BIGINT | ✅ | identity PK | |
| party_id | BIGINT | ✅ | | FK → parties |
| party_type_id | BIGINT | ✅ | | FK → party_types |
| is_primary | BOOLEAN | ✅ | false | |
| is_active | BOOLEAN | ✅ | true | |
| assigned_date | DATE | | | |
| assigned_by | BIGINT | | | FK → user_profiles |
| remarks | TEXT | | | |
| created_at | TIMESTAMPTZ | ✅ | now() | |
| created_by | BIGINT | | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() | |
| updated_by | BIGINT | | | FK → user_profiles |

**Partial unique indexes:**  
- `(party_id) WHERE is_primary = true AND is_active = true` — one primary type per party  
- `(party_id, party_type_id) WHERE is_active = true` — no duplicate active type  

---

## B. PARTY-SPECIFIC LOOKUP MASTERS (17 tables)

All use standard structure: `id (PK BIGINT identity)`, `code (TEXT NN UQ)`, `name_en (TEXT NN)`, `name_ar (TEXT)`, `description (TEXT)`, `is_system (BOOLEAN)`, `is_active (BOOLEAN DEFAULT true)`, `sort_order (INTEGER DEFAULT 0)`, `created_at`, `created_by`, `updated_at`, `updated_by`.

### B1. `party_natures`

Seed values:

| code | name_en | is_system |
|---|---|---|
| LLC | Limited Liability Company | true |
| PLC | Public Listed Company | true |
| INDIVIDUAL | Individual / Sole Person | true |
| SOLE_PROPRIETORSHIP | Sole Proprietorship | true |
| PARTNERSHIP | Partnership | true |
| GOVERNMENT | Government Entity | true |
| FREE_ZONE_ENTITY | Free Zone Entity | true |
| BRANCH | Branch Office | true |
| REPRESENTATIVE_OFFICE | Representative Office | true |
| JOINT_VENTURE | Joint Venture | true |
| TRUST | Trust | true |
| OTHER | Other | false |

---

### B2. `party_statuses`

| code | name_en |
|---|---|
| DRAFT | Draft |
| ACTIVE | Active |
| INACTIVE | Inactive |
| SUSPENDED | Suspended |
| BLACKLISTED | Blacklisted |
| ARCHIVED | Archived |

---

### B3. `party_license_types`

| code | name_en |
|---|---|
| COMMERCIAL | Commercial License |
| PROFESSIONAL | Professional License |
| INDUSTRIAL | Industrial License |
| TOURISM | Tourism License |
| EDUCATIONAL | Educational License |
| HEALTHCARE | Healthcare License |
| TRANSPORT | Transport License |
| CONTRACTING | Contracting License |
| MANPOWER | Manpower Recruitment License |
| FREE_ZONE | Free Zone License |
| IMPORT_EXPORT | Import / Export License |
| OTHER | Other |

---

### B4. `party_license_statuses`

| code | name_en |
|---|---|
| ACTIVE | Active |
| EXPIRED | Expired |
| SUSPENDED | Suspended |
| CANCELLED | Cancelled |
| PENDING_RENEWAL | Pending Renewal |
| UNDER_REVIEW | Under Review |

---

### B5. `party_tax_statuses`

| code | name_en |
|---|---|
| REGISTERED | Registered |
| PENDING | Pending Registration |
| EXEMPTED | Exempted |
| DEREGISTERED | De-registered |
| NOT_APPLICABLE | Not Applicable |

---

### B6. `party_contact_roles`

| code | name_en |
|---|---|
| PRIMARY_CONTACT | Primary Contact |
| ACCOUNTS | Accounts Contact |
| SALES | Sales Contact |
| OPERATIONS | Operations Contact |
| HSE | HSE Contact |
| DOCUMENTS | Documents Contact |
| TECHNICAL | Technical Contact |
| MANAGEMENT | Management |
| OTHER | Other |

---

### B7. `party_contact_departments`

| code | name_en |
|---|---|
| FINANCE | Finance |
| ACCOUNTS | Accounts |
| SALES | Sales |
| OPERATIONS | Operations |
| HR | Human Resources |
| HSE | HSE |
| LEGAL | Legal |
| IT | Information Technology |
| MANAGEMENT | Management |
| PROCUREMENT | Procurement |
| PROJECTS | Projects |
| OTHER | Other |

---

### B8. `party_address_types`

| code | name_en |
|---|---|
| REGISTERED | Registered Address |
| HEAD_OFFICE | Head Office |
| BRANCH | Branch Office |
| BILLING | Billing Address |
| SHIPPING | Shipping Address |
| WAREHOUSE | Warehouse |
| SITE | Site Address |
| OTHER | Other |

---

### B9. `party_document_types`

| code | name_en |
|---|---|
| TRADE_LICENSE | Trade License |
| MOA | Memorandum of Association |
| AOA | Articles of Association |
| TRN_CERTIFICATE | TRN Certificate |
| VAT_CERTIFICATE | VAT Certificate |
| INSURANCE_CERTIFICATE | Insurance Certificate |
| BANK_GUARANTEE | Bank Guarantee |
| POWER_OF_ATTORNEY | Power of Attorney |
| PASSPORT_COPY | Passport Copy |
| EMIRATES_ID | Emirates ID |
| ISO_CERTIFICATE | ISO Certificate |
| PREQUALIFICATION | Prequalification Document |
| CONTRACT | Contract |
| OTHER | Other |

---

### B10. `party_document_statuses`

| code | name_en |
|---|---|
| PENDING_UPLOAD | Pending Upload |
| UPLOADED | Uploaded |
| UNDER_REVIEW | Under Review |
| APPROVED | Approved |
| REJECTED | Rejected |
| EXPIRED | Expired |

---

### B11. `party_compliance_statuses`

| code | name_en |
|---|---|
| NOT_REVIEWED | Not Reviewed |
| IN_PROGRESS | In Progress |
| APPROVED | Approved |
| REJECTED | Rejected |
| SUSPENDED | Suspended |
| EXPIRED | Expired |

---

### B12. `party_approval_statuses`

| code | name_en |
|---|---|
| PENDING | Pending |
| APPROVED | Approved |
| CONDITIONALLY_APPROVED | Conditionally Approved |
| REJECTED | Rejected |
| SUSPENDED | Suspended |
| EXPIRED | Expired |

---

### B13. `party_blacklist_statuses`

| code | name_en |
|---|---|
| NOT_BLACKLISTED | Not Blacklisted |
| UNDER_INVESTIGATION | Under Investigation |
| BLACKLISTED | Blacklisted |
| REMOVED | Removed from Blacklist |

---

### B14. `party_risk_ratings`

| code | name_en |
|---|---|
| LOW | Low Risk |
| MEDIUM | Medium Risk |
| HIGH | High Risk |
| VERY_HIGH | Very High Risk |
| CRITICAL | Critical Risk |

---

### B15. `party_credit_ratings`

| code | name_en |
|---|---|
| EXCELLENT | Excellent (AAA) |
| GOOD | Good (AA) |
| SATISFACTORY | Satisfactory (A) |
| ADEQUATE | Adequate (BBB) |
| MARGINAL | Marginal (BB) |
| POOR | Poor (B) |
| DEFAULT | Default |
| NOT_RATED | Not Rated |

---

### B16. `party_note_types`

| code | name_en |
|---|---|
| GENERAL | General Note |
| FOLLOW_UP | Follow-up |
| COMPLAINT | Complaint |
| ESCALATION | Escalation |
| FINANCIAL_NOTE | Financial Note |
| COMPLIANCE_NOTE | Compliance Note |
| LEGAL_NOTE | Legal Note |
| INTERNAL | Internal Note |

---

### B17. `payment_methods`

| code | name_en |
|---|---|
| BANK_TRANSFER | Bank Transfer |
| CHEQUE | Cheque |
| CASH | Cash |
| CREDIT_CARD | Credit Card |
| DIRECT_DEBIT | Direct Debit |
| PDC | Post-Dated Cheque |
| LC | Letter of Credit |
| BG | Bank Guarantee |
| NETTING | Inter-company Netting |
| OTHER | Other |

---

## C. ROLE-PROFILE LOOKUP MASTERS (14 tables)

Same standard structure as section B unless extra columns listed.

### C1. `customer_categories`
Seed: `CORPORATE`, `SME`, `INDIVIDUAL`, `GOVERNMENT`, `NON_PROFIT`, `OTHER`

### C2. `customer_statuses`
Seed: `PROSPECT`, `ACTIVE`, `DORMANT`, `BLOCKED`, `CLOSED`

### C3. `invoice_methods`
Seed: `EMAIL`, `PORTAL`, `PRINTED_COPY`, `EDI`, `FAX`, `COURIER`, `HAND_DELIVERY`

### C4. `vendor_categories`
Seed: `MATERIALS_SUPPLIER`, `SERVICE_PROVIDER`, `EQUIPMENT_SUPPLIER`, `FUEL_SUPPLIER`, `IT_SUPPLIER`, `TRANSPORT_SUPPLIER`, `FOOD_SUPPLIER`, `MANPOWER_AGENCY`, `OTHER`

### C5. `vendor_ratings`
Seed: `PREFERRED`, `APPROVED`, `CONDITIONAL`, `PROBATIONARY`, `BLACKLISTED`

### C6. `procurement_categories`
Seed: `CIVIL_WORKS`, `MECHANICAL`, `ELECTRICAL`, `IT_SERVICES`, `PROFESSIONAL_SERVICES`, `TRANSPORT`, `FUEL_LUBRICANTS`, `SPARE_PARTS`, `SAFETY_EQUIPMENT`, `FOOD_CATERING`, `CLEANING_SERVICES`, `OTHER`

### C7. `subcontractor_categories`
Seed: `CIVIL_SUBCONTRACTOR`, `MECHANICAL_SUBCONTRACTOR`, `ELECTRICAL_SUBCONTRACTOR`, `HVAC`, `PLUMBING`, `PAINTING`, `CLEANING`, `DEMOLITION`, `SCAFFOLDING`, `OTHER`

### C8. `work_categories`
Seed: `BUILDING_WORKS`, `INFRASTRUCTURE`, `FIT_OUT`, `MAINTENANCE`, `SPECIALIST_WORKS`, `OTHER`

### C9. `consultant_types`
Seed: `ENGINEERING_CONSULTANT`, `MANAGEMENT_CONSULTANT`, `LEGAL_CONSULTANT`, `FINANCIAL_CONSULTANT`, `IT_CONSULTANT`, `HSE_CONSULTANT`, `MEDICAL_CONSULTANT`, `OTHER`

### C10. `consultant_specializations`
Seed: `STRUCTURAL`, `CIVIL`, `MEP`, `ARCHITECTURE`, `COST_ESTIMATING`, `PROJECT_MANAGEMENT`, `ERP_IT`, `LEGAL_CORPORATE`, `LEGAL_EMPLOYMENT`, `ENVIRONMENTAL`, `OTHER`

### C11. `recruitment_categories`
Seed: `SKILLED_LABOR`, `UNSKILLED_LABOR`, `PROFESSIONAL`, `TECHNICAL`, `MANAGEMENT`, `DOMESTIC_WORKER`, `OTHER`

### C12. `authority_types`
Seed: `MUNICIPALITY`, `FREE_ZONE_AUTHORITY`, `FEDERAL_MINISTRY`, `REGULATORY_BODY`, `CHAMBER_OF_COMMERCE`, `LICENSE_DEPARTMENT`, `COURT_AUTHORITY`, `CUSTOMS`, `IMMIGRATION`, `OTHER`

### C13. `industry_sectors`
Seed: `CONSTRUCTION`, `OIL_GAS`, `MANUFACTURING`, `RETAIL`, `LOGISTICS`, `HEALTHCARE`, `EDUCATION`, `REAL_ESTATE`, `IT_TECHNOLOGY`, `FINANCIAL_SERVICES`, `HOSPITALITY`, `MEDIA`, `AUTOMOTIVE`, `AGRICULTURE`, `OTHER`

### C14. `sales_regions`
Seed: `ABU_DHABI`, `DUBAI`, `SHARJAH`, `AJMAN`, `UMM_AL_QUWAIN`, `RAS_AL_KHAIMAH`, `FUJAIRAH`, `NORTHERN_EMIRATES`, `ALL_UAE`, `GCC`, `INTERNATIONAL`

---

## D. SERVICE AND RELATIONSHIP MASTERS

### D1. `party_service_categories_master`

Standard structure + extra columns:

| Column | Type | NN | Notes |
|---|---|---|---|
| id | BIGINT | ✅ | PK identity |
| category_code | TEXT | ✅ | UQ |
| category_name_en | TEXT | ✅ | |
| category_name_ar | TEXT | | |
| parent_category_id | BIGINT | | Self-ref for hierarchy |
| description | TEXT | | |
| is_system | BOOLEAN | ✅ | default false |
| is_active | BOOLEAN | ✅ | default true |
| sort_order | INTEGER | ✅ | default 0 |
| created_at | TIMESTAMPTZ | ✅ | |
| created_by | BIGINT | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | |
| updated_by | BIGINT | | |

**Seed (42 categories — complete list):**

`CIVIL_CONSTRUCTION`, `MECHANICAL_WORKS`, `ELECTRICAL_WORKS`, `HVAC_WORKS`, `PLUMBING_WORKS`, `PAINTING_WORKS`, `FLOORING_WORKS`, `JOINERY_WORKS`, `GLAZING_WORKS`, `SCAFFOLDING`, `DEMOLITION`, `ROAD_INFRASTRUCTURE`, `WATERPROOFING`, `INSULATION_WORKS`, `LANDSCAPING`, `SWIMMING_POOL`, `DIESEL_SUPPLY`, `PETROL_SUPPLY`, `LUBRICANTS_SUPPLY`, `FUEL_LOGISTICS`, `SPARE_PARTS_SUPPLY`, `EQUIPMENT_RENTAL`, `VEHICLE_RENTAL`, `WORKSHOP_REPAIR`, `TRANSPORT_LOGISTICS`, `WASTE_DISPOSAL`, `SCRAP_BUYING`, `SCRAP_SELLING`, `MANPOWER_SUPPLY`, `CLEANING_SERVICES`, `SECURITY_SERVICES`, `CATERING_SERVICES`, `COURIER_SERVICES`, `IT_HARDWARE`, `IT_SOFTWARE`, `IT_SERVICES`, `LAB_TESTING`, `SAFETY_EQUIPMENT`, `PROTECTIVE_CLOTHING`, `MEDICAL_SUPPLIES`, `TRAINING_SERVICES`, `OTHER_SERVICES`

---

### D2. `party_relationship_types`

Standard structure.

**Seed (13 types — complete):**

| code | name_en |
|---|---|
| SUBSIDIARY | Subsidiary |
| PARENT_COMPANY | Parent Company |
| SISTER_COMPANY | Sister Company |
| BRANCH_OF | Branch of |
| JOINT_VENTURE_PARTNER | Joint Venture Partner |
| AGENT | Agent |
| DISTRIBUTOR | Distributor |
| ASSOCIATED_COMPANY | Associated Company |
| SOLE_DISTRIBUTOR | Sole Distributor |
| FRANCHISE | Franchise |
| STRATEGIC_PARTNER | Strategic Partner |
| CLIENT_OF | Client of |
| SUPPLIER_OF | Supplier of |

---

## E. CHILD / TRANSACTIONAL TABLES (11 tables)

### E1. `party_licenses`

| Column | Type | NN | Notes |
|---|---|---|---|
| id | BIGINT | ✅ | PK identity |
| license_code | TEXT | ✅ | UQ, from MASTER_PARTY_LICENSE |
| party_id | BIGINT | ✅ | FK → parties ON DELETE RESTRICT |
| license_type_id | BIGINT | ✅ | FK → party_license_types |
| license_number | TEXT | ✅ | |
| license_name | TEXT | | |
| issuing_authority_party_id | BIGINT | | FK → parties |
| issuing_country_id | BIGINT | | FK → countries |
| issuing_emirate_id | BIGINT | | FK → emirates |
| issue_date | DATE | | |
| expiry_date | DATE | | |
| renewal_required | BOOLEAN | ✅ | default false |
| renewal_notice_days | INTEGER | | default 30 |
| license_status_id | BIGINT | ✅ | FK → party_license_statuses |
| license_activity_text | TEXT | | |
| license_document_id | BIGINT | | FK → party_documents |
| is_primary | BOOLEAN | ✅ | default false |
| is_active | BOOLEAN | ✅ | default true |
| remarks | TEXT | | |
| created_at | TIMESTAMPTZ | ✅ | now() |
| created_by | BIGINT | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() |
| updated_by | BIGINT | | FK → user_profiles |

**Partial unique index:** `(party_id) WHERE is_primary = true AND is_active = true`  
**Indexes:** `party_id`, `license_type_id`, `license_number`, `expiry_date`, `license_status_id`, `issuing_authority_party_id`

---

### E2. `party_tax_registrations`

| Column | Type | NN | Notes |
|---|---|---|---|
| id | BIGINT | ✅ | PK |
| tax_registration_code | TEXT | ✅ | UQ, from MASTER_PARTY_TAX |
| party_id | BIGINT | ✅ | FK → parties |
| tax_type_id | BIGINT | ✅ | FK → tax_types (existing) |
| tax_registration_number | TEXT | ✅ | |
| tax_country_id | BIGINT | | FK → countries |
| tax_status_id | BIGINT | ✅ | FK → party_tax_statuses |
| effective_from | DATE | | |
| effective_to | DATE | | |
| certificate_document_id | BIGINT | | FK → party_documents |
| reverse_charge_applicable | BOOLEAN | ✅ | default false |
| vat_exempt | BOOLEAN | ✅ | default false |
| is_primary | BOOLEAN | ✅ | default false |
| is_active | BOOLEAN | ✅ | default true |
| remarks | TEXT | | |
| created_at | TIMESTAMPTZ | ✅ | now() |
| created_by | BIGINT | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() |
| updated_by | BIGINT | | FK → user_profiles |

**Partial unique index:** `(party_id) WHERE is_primary = true AND is_active = true`  
**Partial unique index:** `(party_id, tax_type_id, tax_registration_number) WHERE is_active = true`  
**Indexes:** `party_id`, `tax_registration_number`, `tax_type_id`, `tax_status_id`

---

### E3. `party_finance_profiles`

> **SUPABASE_VERIFIED:** `payment_hold*` fields renamed to `finance_hold*` to avoid confusion with `party_compliance_profiles.payment_hold` (per prompt §5.1).

| Column | Type | NN | Notes |
|---|---|---|---|
| id | BIGINT | ✅ | PK |
| party_id | BIGINT | ✅ | FK → parties, UQ (1:1) |
| default_currency_id | BIGINT | | FK → currencies |
| default_payment_term_id | BIGINT | | FK → payment_terms |
| default_payment_method_id | BIGINT | | FK → payment_methods |
| credit_limit | NUMERIC(18,4) | | |
| credit_currency_id | BIGINT | | FK → currencies |
| finance_hold | BOOLEAN | ✅ | default false — finance dept hold only |
| finance_hold_reason | TEXT | | required when finance_hold = true |
| finance_hold_by | BIGINT | | FK → user_profiles |
| finance_hold_at | TIMESTAMPTZ | | |
| finance_remarks | TEXT | | |
| created_at | TIMESTAMPTZ | ✅ | now() |
| created_by | BIGINT | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() |
| updated_by | BIGINT | | FK → user_profiles |

**Unique:** `party_id`  
**Indexes:** `party_id`, `finance_hold`

---

### E4. `party_contacts`

| Column | Type | NN | Notes |
|---|---|---|---|
| id | BIGINT | ✅ | PK |
| contact_code | TEXT | ✅ | UQ, from MASTER_PARTY_CONTACT |
| party_id | BIGINT | ✅ | FK → parties |
| full_name | TEXT | ✅ | |
| designation | TEXT | | |
| department_id | BIGINT | | FK → party_contact_departments |
| contact_role_id | BIGINT | | FK → party_contact_roles |
| email | TEXT | | CHECK format |
| phone | TEXT | | |
| mobile | TEXT | | |
| whatsapp | TEXT | | |
| is_primary | BOOLEAN | ✅ | default false |
| is_accounts_contact | BOOLEAN | ✅ | default false |
| is_sales_contact | BOOLEAN | ✅ | default false |
| is_operations_contact | BOOLEAN | ✅ | default false |
| is_hse_contact | BOOLEAN | ✅ | default false |
| is_documents_contact | BOOLEAN | ✅ | default false |
| is_active | BOOLEAN | ✅ | default true |
| notes | TEXT | | |
| created_at | TIMESTAMPTZ | ✅ | now() |
| created_by | BIGINT | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() |
| updated_by | BIGINT | | FK → user_profiles |

**Partial unique index:** `(party_id) WHERE is_primary = true AND is_active = true`  
**Indexes:** `party_id`, `email` (partial WHERE NOT NULL), `mobile` (partial WHERE NOT NULL), `contact_role_id`, `is_active`

---

### E5. `party_addresses`

| Column | Type | NN | Notes |
|---|---|---|---|
| id | BIGINT | ✅ | PK |
| address_code | TEXT | ✅ | UQ, from MASTER_PARTY_ADDRESS |
| party_id | BIGINT | ✅ | FK → parties |
| address_type_id | BIGINT | ✅ | FK → party_address_types |
| address_name | TEXT | | |
| country_id | BIGINT | ✅ | FK → countries |
| emirate_id | BIGINT | | FK → emirates |
| city_id | BIGINT | | FK → cities |
| area_zone_id | BIGINT | | FK → areas_zones |
| street | TEXT | | |
| building | TEXT | | |
| floor | TEXT | | |
| office_no | TEXT | | |
| po_box | TEXT | | |
| landmark | TEXT | | |
| google_map_url | TEXT | | |
| latitude | NUMERIC(10,8) | | |
| longitude | NUMERIC(11,8) | | |
| is_primary | BOOLEAN | ✅ | default false |
| is_billing_address | BOOLEAN | ✅ | default false |
| is_shipping_address | BOOLEAN | ✅ | default false |
| is_site_address | BOOLEAN | ✅ | default false |
| is_active | BOOLEAN | ✅ | default true |
| notes | TEXT | | |
| created_at | TIMESTAMPTZ | ✅ | now() |
| created_by | BIGINT | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() |
| updated_by | BIGINT | | FK → user_profiles |

**Partial unique index:** `(party_id) WHERE is_primary = true AND is_active = true`  
**Indexes:** `party_id`, `(country_id, emirate_id, city_id)` composite, `address_type_id`, `is_active`

---

### E6. `party_bank_details`

| Column | Type | NN | Notes |
|---|---|---|---|
| id | BIGINT | ✅ | PK |
| bank_detail_code | TEXT | ✅ | UQ, from MASTER_PARTY_BANK |
| party_id | BIGINT | ✅ | FK → parties |
| bank_id | BIGINT | | FK → banks (existing) |
| bank_name_text | TEXT | | Free text when bank not in master |
| account_holder_name | TEXT | ✅ | |
| account_number | TEXT | | |
| iban | TEXT | | Duplicate check |
| swift_code | TEXT | | |
| currency_id | BIGINT | | FK → currencies |
| branch_name | TEXT | | |
| country_id | BIGINT | | FK → countries |
| is_primary | BOOLEAN | ✅ | default false |
| is_verified | BOOLEAN | ✅ | default false |
| verified_by | BIGINT | | FK → user_profiles |
| verified_at | TIMESTAMPTZ | | |
| verification_document_id | BIGINT | | FK → party_documents |
| is_active | BOOLEAN | ✅ | default true |
| remarks | TEXT | | |
| created_at | TIMESTAMPTZ | ✅ | now() |
| created_by | BIGINT | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() |
| updated_by | BIGINT | | FK → user_profiles |

**Partial unique index:** `(party_id) WHERE is_primary = true AND is_active = true`  
**Indexes:** `party_id`, `iban` (partial WHERE NOT NULL), `is_active`  
**RLS:** ELEVATED — SELECT requires `view_bank_details OR manage_bank_details OR system_admin`. See SQL.

---

### E7. `party_documents`

| Column | Type | NN | Notes |
|---|---|---|---|
| id | BIGINT | ✅ | PK |
| document_code | TEXT | ✅ | UQ, from MASTER_PARTY_DOCUMENT |
| party_id | BIGINT | ✅ | FK → parties |
| document_type_id | BIGINT | ✅ | FK → party_document_types |
| document_title | TEXT | ✅ | |
| document_number | TEXT | | |
| issue_date | DATE | | |
| expiry_date | DATE | | |
| issuing_authority_party_id | BIGINT | | FK → parties (PartySelect filtered) |
| file_path | TEXT | | Nullable for DMS placeholder stage |
| file_name | TEXT | | |
| file_mime_type | TEXT | | |
| file_size | BIGINT | | bytes |
| expiry_required | BOOLEAN | ✅ | default false |
| renewal_notice_days | INTEGER | | default 30 |
| document_status_id | BIGINT | ✅ | FK → party_document_statuses |
| uploaded_by | BIGINT | | FK → user_profiles |
| uploaded_at | TIMESTAMPTZ | | |
| remarks | TEXT | | |
| created_at | TIMESTAMPTZ | ✅ | now() |
| created_by | BIGINT | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() |
| updated_by | BIGINT | | FK → user_profiles |

**Indexes:** `party_id`, `document_type_id`, `expiry_date` (partial WHERE NOT NULL), `document_status_id`, `issuing_authority_party_id` (partial WHERE NOT NULL)

---

### E8. `party_compliance_profiles`

| Column | Type | NN | Notes |
|---|---|---|---|
| id | BIGINT | ✅ | PK |
| party_id | BIGINT | ✅ | UQ (1:1) FK → parties |
| kyc_status_id | BIGINT | | FK → party_compliance_statuses |
| vendor_approval_status_id | BIGINT | | FK → party_approval_statuses |
| customer_approval_status_id | BIGINT | | FK → party_approval_statuses |
| subcontractor_approval_status_id | BIGINT | | FK → party_approval_statuses |
| hse_approval_status_id | BIGINT | | FK → party_approval_statuses |
| finance_approval_status_id | BIGINT | | FK → party_approval_statuses |
| legal_approval_status_id | BIGINT | | FK → party_approval_statuses |
| blacklist_status_id | BIGINT | | FK → party_blacklist_statuses |
| blacklist_reason | TEXT | | Required when blacklisted |
| risk_rating_id | BIGINT | | FK → party_risk_ratings |
| credit_rating_id | BIGINT | | FK → party_credit_ratings |
| payment_hold | BOOLEAN | ✅ | default false |
| payment_hold_reason | TEXT | | |
| work_hold | BOOLEAN | ✅ | default false |
| work_hold_reason | TEXT | | |
| approved_by | BIGINT | | FK → user_profiles |
| approved_at | TIMESTAMPTZ | | |
| last_review_date | DATE | | |
| next_review_date | DATE | | |
| remarks | TEXT | | |
| created_at | TIMESTAMPTZ | ✅ | now() |
| created_by | BIGINT | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() |
| updated_by | BIGINT | | FK → user_profiles |

**Unique:** `party_id`

---

### E9. `party_service_category_assignments`

| Column | Type | NN | Notes |
|---|---|---|---|
| id | BIGINT | ✅ | PK |
| party_id | BIGINT | ✅ | FK → parties |
| service_category_id | BIGINT | ✅ | FK → party_service_categories_master |
| is_primary | BOOLEAN | ✅ | default false |
| is_active | BOOLEAN | ✅ | default true |
| remarks | TEXT | | |
| created_at | TIMESTAMPTZ | ✅ | now() |
| created_by | BIGINT | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() |
| updated_by | BIGINT | | FK → user_profiles |

**Partial unique indexes:**  
- `(party_id) WHERE is_primary = true AND is_active = true`  
- `(party_id, service_category_id) WHERE is_active = true`  
**Indexes:** `party_id`, `service_category_id`

---

### E10. `party_relationships`

| Column | Type | NN | Notes |
|---|---|---|---|
| id | BIGINT | ✅ | PK |
| parent_party_id | BIGINT | ✅ | FK → parties |
| child_party_id | BIGINT | ✅ | FK → parties |
| relationship_type_id | BIGINT | ✅ | FK → party_relationship_types |
| effective_from | DATE | | |
| effective_to | DATE | | |
| is_active | BOOLEAN | ✅ | default true |
| remarks | TEXT | | |
| created_at | TIMESTAMPTZ | ✅ | now() |
| created_by | BIGINT | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() |
| updated_by | BIGINT | | FK → user_profiles |

**Constraints:** `parent_party_id != child_party_id`  
**Partial unique index:** `(parent_party_id, child_party_id, relationship_type_id) WHERE is_active = true`  
**Indexes:** `parent_party_id`, `child_party_id`, `relationship_type_id`

---

### E11. `party_notes`

| Column | Type | NN | Notes |
|---|---|---|---|
| id | BIGINT | ✅ | PK |
| note_code | TEXT | ✅ | UQ, from MASTER_PARTY_NOTE |
| party_id | BIGINT | ✅ | FK → parties |
| note_type_id | BIGINT | | FK → party_note_types |
| note_title | TEXT | | |
| note_body | TEXT | ✅ | |
| is_private | BOOLEAN | ✅ | default false |
| follow_up_date | DATE | | |
| created_at | TIMESTAMPTZ | ✅ | now() |
| created_by | BIGINT | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() |
| updated_by | BIGINT | | FK → user_profiles |

**Indexes:** `party_id`, `note_type_id`, `follow_up_date` (partial WHERE NOT NULL), `is_private`  
**RLS:** Private notes visible only to creator OR `manage_compliance OR system_admin`.

---

## F. ROLE PROFILE TABLES (6 tables)

### F1. `party_customer_profiles`

| Column | Type | NN | Notes |
|---|---|---|---|
| id | BIGINT | ✅ | PK |
| party_id | BIGINT | ✅ | UQ (1:1) FK → parties |
| customer_category_id | BIGINT | | FK → customer_categories |
| customer_status_id | BIGINT | | FK → customer_statuses |
| industry_sector_id | BIGINT | | FK → industry_sectors |
| sales_region_id | BIGINT | | FK → sales_regions |
| payment_term_id | BIGINT | | FK → payment_terms |
| credit_limit | NUMERIC(18,4) | | |
| credit_currency_id | BIGINT | | FK → currencies |
| sales_owner_user_id | BIGINT | | FK → user_profiles |
| requires_lpo | BOOLEAN | ✅ | default false |
| requires_contract | BOOLEAN | ✅ | default false |
| preferred_invoice_method_id | BIGINT | | FK → invoice_methods |
| customer_remarks | TEXT | | |
| created_at | TIMESTAMPTZ | ✅ | now() |
| created_by | BIGINT | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() |
| updated_by | BIGINT | | FK → user_profiles |

---

### F2. `party_vendor_profiles`

| Column | Type | NN | Notes |
|---|---|---|---|
| id | BIGINT | ✅ | PK |
| party_id | BIGINT | ✅ | UQ (1:1) FK → parties |
| vendor_category_id | BIGINT | | FK → vendor_categories |
| vendor_rating_id | BIGINT | | FK → vendor_ratings |
| procurement_category_id | BIGINT | | FK → procurement_categories |
| payment_term_id | BIGINT | | FK → payment_terms |
| default_currency_id | BIGINT | | FK → currencies |
| preferred_vendor | BOOLEAN | ✅ | default false |
| vendor_approval_status_id | BIGINT | | FK → party_approval_statuses |
| can_create_po | BOOLEAN | ✅ | default false |
| requires_comparison | BOOLEAN | ✅ | default true |
| vendor_remarks | TEXT | | |
| created_at | TIMESTAMPTZ | ✅ | now() |
| created_by | BIGINT | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() |
| updated_by | BIGINT | | FK → user_profiles |

---

### F3. `party_subcontractor_profiles`

| Column | Type | NN | Notes |
|---|---|---|---|
| id | BIGINT | ✅ | PK |
| party_id | BIGINT | ✅ | UQ (1:1) FK → parties |
| subcontractor_category_id | BIGINT | | FK → subcontractor_categories |
| work_category_id | BIGINT | | FK → work_categories |
| hse_required | BOOLEAN | ✅ | default false |
| insurance_required | BOOLEAN | ✅ | default false |
| prequalification_required | BOOLEAN | ✅ | default false |
| max_contract_value | NUMERIC(18,4) | | |
| contract_currency_id | BIGINT | | FK → currencies |
| approved_for_site_work | BOOLEAN | ✅ | default false |
| approved_by_hse | BOOLEAN | ✅ | default false |
| subcontractor_remarks | TEXT | | |
| created_at | TIMESTAMPTZ | ✅ | now() |
| created_by | BIGINT | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() |
| updated_by | BIGINT | | FK → user_profiles |

---

### F4. `party_consultant_profiles`

| Column | Type | NN | Notes |
|---|---|---|---|
| id | BIGINT | ✅ | PK |
| party_id | BIGINT | ✅ | UQ (1:1) FK → parties |
| consultant_type_id | BIGINT | | FK → consultant_types |
| specialization_id | BIGINT | | FK → consultant_specializations |
| professional_license_required | BOOLEAN | ✅ | default false |
| approved_for_design | BOOLEAN | ✅ | default false |
| approved_for_supervision | BOOLEAN | ✅ | default false |
| consultant_remarks | TEXT | | |
| created_at | TIMESTAMPTZ | ✅ | now() |
| created_by | BIGINT | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() |
| updated_by | BIGINT | | FK → user_profiles |

---

### F5. `party_recruitment_agency_profiles`

| Column | Type | NN | Notes |
|---|---|---|---|
| id | BIGINT | ✅ | PK |
| party_id | BIGINT | ✅ | UQ (1:1) FK → parties |
| source_country_id | BIGINT | | FK → countries |
| recruitment_category_id | BIGINT | | FK → recruitment_categories |
| agreement_required | BOOLEAN | ✅ | default false |
| agreement_expiry_date | DATE | | |
| service_fee_terms | TEXT | | |
| approved_for_hiring | BOOLEAN | ✅ | default false |
| recruitment_remarks | TEXT | | |
| created_at | TIMESTAMPTZ | ✅ | now() |
| created_by | BIGINT | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() |
| updated_by | BIGINT | | FK → user_profiles |

---

### F6. `party_government_authority_profiles`

| Column | Type | NN | Notes |
|---|---|---|---|
| id | BIGINT | ✅ | PK |
| party_id | BIGINT | ✅ | UQ (1:1) FK → parties |
| authority_type_id | BIGINT | | FK → authority_types |
| jurisdiction_country_id | BIGINT | | FK → countries |
| jurisdiction_emirate_id | BIGINT | | FK → emirates |
| service_category_id | BIGINT | | FK → party_service_categories_master |
| portal_url | TEXT | | |
| portal_username_reference | TEXT | | Reference label only — NO passwords stored |
| government_remarks | TEXT | | |
| created_at | TIMESTAMPTZ | ✅ | now() |
| created_by | BIGINT | | FK → user_profiles |
| updated_at | TIMESTAMPTZ | ✅ | now() |
| updated_by | BIGINT | | FK → user_profiles |

> **Security note:** Passwords are never stored here. If portal credentials are needed in future, design a separate encrypted vault.

---

## G. Extension Requirement

```
-- REVIEW ONLY: requires pg_trgm for fuzzy duplicate detection
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Verify with Supabase support before applying.
```

---

## H. Numbering Rules Summary

| Rule Code | Entity | Prefix | Seq Length |
|---|---|---|---|
| MASTER_PARTY | parties | PTY | 6 |
| MASTER_PARTY_CONTACT | party_contacts | PTY-CON | 6 |
| MASTER_PARTY_ADDRESS | party_addresses | PTY-ADDR | 6 |
| MASTER_PARTY_BANK | party_bank_details | PTY-BANK | 6 |
| MASTER_PARTY_LICENSE | party_licenses | PTY-LIC | 6 |
| MASTER_PARTY_TAX | party_tax_registrations | PTY-TAX | 6 |
| MASTER_PARTY_DOCUMENT | party_documents | PTY-DOC | 6 |
| MASTER_PARTY_NOTE | party_notes | PTY-NOTE | 6 |

---

*End of V3 Database Field Map — REVIEW ONLY — DO NOT IMPLEMENT*
