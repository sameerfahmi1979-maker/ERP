# PROMPT_ERP_BASE_002F_3A_GLOBAL_MASTER_DATA_ARCHITECTURE_AND_INVENTORY_PLAN

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, master data governance consultant, UAE business compliance analyst, and SaaS product designer.

## Phase

ERP BASE 002F.3A — Global Master Data Architecture, Inventory, Brainstorming, and Implementation Planning

## Prompt Purpose

This prompt is for detailed planning only.

Do not implement code.
Do not create migration files.
Do not modify database schema.
Do not create UI screens.
Do not change existing files.

Your task is to deeply analyze the existing ERP source code, database foundation, UI components, roles/permissions model, RLS policies, existing master data, hardcoded dropdowns, and planned ERP modules, then produce a complete, detailed, professional, implementable master data plan.

The output must be a detailed markdown planning report that can later be used to implement the full master data foundation smoothly, correctly, and without duplicate or conflicting tables.

---

## Critical Project Context

This ERP is being built as a deep, enterprise-grade ERP system for ALGT / Alliance group operations in the UAE.

The ERP is currently still in the BASE 002 foundation stage.

Do not jump to HR, Fleet, Workshop, Procurement, Inventory, Finance, CRM, HSE, DMS, Project Management, or business modules until the foundation master data architecture is clear and approved.

The system is expected to cover modules similar to:

- Organization / Owner Companies
- Branches
- Users / Roles / Permissions
- App Settings
- Letterheads
- Global Numbering
- Global Master Data
- Global Lookup / Dropdown Engine
- HR
- Fleet Management
- Transport Operations
- Heavy Equipment Rental
- Workshop / Maintenance
- Spare Parts / Inventory
- Procurement
- Purchase Orders
- Vendors
- Customers
- CRM
- Finance readiness
- Document Management
- Project Management
- Task Management
- HSE / QHSE
- Waste Management
- Scrap / Surplus Trading
- Demolition operations
- Compliance and expiry management
- Notifications
- Audit logs
- Reports and dashboards
- Print/PDF/Excel/CSV export
- Send by email engine

---

## Current Foundation Already Implemented or Partially Implemented

Inspect these foundation areas before planning:

1. Owner companies / organizations.
2. Branches.
3. Users.
4. Roles.
5. Permissions.
6. Role assignment.
7. Supabase/PostgreSQL RLS.
8. Audit logs.
9. Global drawer form pattern.
10. Global enterprise data table pattern.
11. Global export actions.
12. App layout and protected admin routes.
13. Global numbering engine, ERP BASE 002F.2.
14. Simple document numbering format:
   - EMP-0001
   - PO-0001
   - INV-0001
   - JO-0001
   - GRN-0001
15. Organization/company and branch code fields.
16. Possible internal reference numbers for owner companies and branches.
17. App settings / letterheads may be partially implemented.
18. Email/export may be partially implemented.
19. Microsoft Graph live testing is deferred and must not block this planning.

---

## Important Numbering Rule for Future Modules

Any future module that requires autonumbering must use the existing ERP BASE 002F.2 Global Numbering System.

Do not create separate numbering logic in future modules.

When the plan includes future document types, it must propose adding them to the global numbering engine.

Normal document reference numbers must remain simple by default, for example:

- EMP-0001
- PO-0001
- INV-0001
- JO-0001
- GRN-0001
- MR-0001
- PR-0001
- RFQ-0001
- QUO-0001
- SO-0001
- DN-0001
- PAY-0001
- ASSET-0001
- VEH-0001
- EQP-0001
- WO-0001
- INC-0001
- NCR-0001
- AUD-0001
- TASK-0001

Do not include company, branch, city, location, year, month, or day in normal document numbers unless the user explicitly requests otherwise later.

Organization/company and branch master records are exceptions because they have business codes such as:

- Company codes: ALGT, ALS, PGI, AET
- Branch codes: AUH, DXB, SHJ, ICAD, MUSSAFAH

These must be treated as master data codes and may also have optional internal references.

---

## Main Objective

Create a detailed, enterprise-level master data architecture and inventory plan that answers:

1. What master data already exists?
2. What master data is missing?
3. What master data is duplicated or hardcoded?
4. Which tables are needed?
5. Which tables should be global shared master data?
6. Which tables should be module-specific master data?
7. Which items should be handled by a generic lookup/dropdown engine?
8. Which items need dedicated tables because they require many fields, relations, documents, expiry, attachments, or governance?
9. Which master data requires approval workflow?
10. Which master data requires audit log?
11. Which master data requires RLS?
12. Which master data requires role-based permissions?
13. Which master data needs import/export?
14. Which master data should appear in app settings?
15. Which master data should integrate with global numbering?
16. Which master data should integrate with DMS/attachments?
17. Which master data should integrate with notifications and expiry reminders?
18. Which master data is required before HR?
19. Which master data is required before Fleet?
20. Which master data is required before Workshop?
21. Which master data is required before Procurement and Inventory?
22. Which master data is required before HSE/QHSE?
23. Which master data is required before CRM and Sales?
24. What is the safest implementation sequence?

---

## Planning Philosophy

Use brainstorming. Think broadly and deeply.

Do not limit the plan to what is already built. Create a master data foundation that can support a serious ERP system, not a small CRUD app.

However, avoid unnecessary complexity and avoid implementing everything in one phase.

The plan must be practical, phased, and suitable for implementation in the existing Next.js + Supabase application.

The plan must avoid duplicate tables and duplicated dropdown logic.

The plan must create a clean governance model.

The plan must clearly separate:

1. Global lookup/dropdown values.
2. Core shared master data.
3. Organization/branch/company master data.
4. Contact/person master data.
5. HR master data.
6. Fleet/equipment master data.
7. Workshop/maintenance master data.
8. Inventory/procurement master data.
9. Finance/commercial master data.
10. HSE/QHSE master data.
11. DMS/document master data.
12. Project/task master data.
13. Waste/scrap/demolition operation master data.
14. System/admin master data.

---

## Source Code Inspection Requirements

Before writing the report, inspect the actual source code and database files.

Search and inspect:

### Database / Supabase

- Supabase migrations.
- Existing tables.
- Existing constraints.
- Existing indexes.
- Existing RLS policies.
- Existing seed data.
- Existing functions/RPC.
- Existing audit logs.
- Existing numbering rules.
- Existing permissions.
- Existing organization and branch tables.
- Existing user/role tables.

### Frontend / Next.js

- Admin routes.
- Settings routes.
- Organization screens.
- Branch screens.
- User/role/permission screens.
- Existing master data screens if any.
- Existing dropdown components.
- Existing hardcoded arrays.
- Existing select options.
- Existing constants.
- Existing form schemas.
- Existing Zod validation.
- Existing table components.
- Existing drawer form components.
- Existing export components.

### Server Actions / Services

- Server action patterns.
- Supabase client patterns.
- Permission checks.
- Audit logging patterns.
- Error handling patterns.
- Validation patterns.
- Numbering service usage.
- Existing CRUD service structure.

### UI/UX Foundation

- Drawer form design.
- Table design.
- Filters/search.
- Column visibility.
- Export buttons.
- Print/PDF.
- Settings layout.
- Sidebar/menu placement.
- Form section navigation.

---

## Hardcoded Dropdown / Constants Audit

Search the code for hardcoded dropdown values and constants such as:

- status arrays
- emirate arrays
- country arrays
- currency arrays
- role type arrays
- branch type arrays
- company type arrays
- legal forms
- document categories
- attachment types
- address types
- phone types
- email types
- gender
- marital status
- nationality
- visa status
- employee status
- employment type
- contract type
- leave type
- salary component type
- vehicle type
- equipment type
- asset category
- fuel type
- maintenance type
- job order status
- priority
- incident type
- risk level
- approval status
- payment terms
- tax types
- unit of measure
- item category
- warehouse type
- vendor category
- customer category
- project status
- task status
- waste type
- scrap material type
- demolition method

The report must list where hardcoded dropdowns exist and whether they should be moved to lookup engine or dedicated master tables.

---

# Required Planning Report Structure

Create the following sections in the report.

## 1. Executive Summary

Summarize:

- Current ERP foundation status.
- Why master data is the correct next stage.
- Current master data gaps.
- Recommended implementation sequence.
- Major decisions needed from the user, if any.

## 2. Existing System Inventory

Create a table listing all inspected existing foundation items.

Columns:

- Area
- Existing files/tables/components found
- Status: complete / partial / missing / unclear
- Notes
- Risk if left incomplete

Include at least:

- Owner companies
- Branches
- Users
- Roles
- Permissions
- Audit logs
- Numbering engine
- Drawer forms
- Data tables
- Export engine
- App settings
- Letterheads
- DMS/attachments if any
- Existing master data screens
- Existing lookup/dropdown logic

## 3. Master Data Classification Framework

Define how master data should be classified.

Categories:

1. Global lookup values.
2. Core shared master data.
3. Company/branch master data.
4. People/contact master data.
5. HR master data.
6. Fleet/equipment master data.
7. Workshop master data.
8. Inventory/procurement master data.
9. Finance/commercial master data.
10. CRM/customer/vendor master data.
11. HSE/QHSE master data.
12. DMS/document master data.
13. Project/task master data.
14. Waste/scrap/demolition master data.
15. System/admin configuration master data.

For each category, explain:

- Purpose.
- Example records.
- Whether it should be generic lookup or dedicated table.
- Whether it needs attachments.
- Whether it needs expiry dates.
- Whether it needs approval workflow.
- Whether it needs audit.
- Whether it needs RLS.
- Whether it needs import/export.
- Whether it needs active/inactive status.

## 4. Generic Lookup / Dropdown Engine Plan

Plan a reusable lookup engine.

Proposed tables may include:

1. `global_lookup_categories`
2. `global_lookup_values`
3. `global_lookup_value_translations`
4. `global_lookup_dependencies`
5. `global_lookup_usage_map`
6. `global_lookup_import_batches` if needed later

For each proposed table, define:

- Purpose.
- Required fields.
- Primary key type.
- Unique constraints.
- Parent/child relationships.
- Sort order.
- Active/inactive handling.
- Effective dates.
- Global vs module-specific values.
- Company-specific override support if needed.
- Branch-specific override support if needed.
- Translation/localization support.
- Audit fields.
- RLS strategy.
- Permissions.
- Example data.

Required capabilities:

- Create lookup category.
- Create lookup values.
- Add child lookup values.
- Reorder values.
- Activate/deactivate values.
- Mark system values as locked.
- Prevent deletion if used.
- Allow module-specific filters.
- Allow dropdown component to load by category code.
- Support English and Arabic labels if possible.
- Support color/icon/badge metadata where useful.
- Support default value.
- Support import/export.

Explain which dropdowns should move to this engine.

## 5. Core Shared Master Data Plan

Plan core shared master data needed across all modules.

Include at minimum:

### Geography / Location

- Countries
- Emirates
- Cities
- Areas / zones
- Ports
- Industrial areas
- Site locations
- GPS coordinate formats
- Address types

### Currency / Finance Basics

- Currencies
- Exchange rate source placeholder
- Payment terms
- Tax types
- VAT / TRN readiness
- Bank master
- Bank account types
- Cost centers
- Profit centers
- Chart-of-account readiness placeholder

### Units and Measurement

- Units of measure
- UOM categories
- UOM conversions
- Length units
- Weight units
- Volume units
- Area units
- Fuel units
- Time units
- Count units
- UAE-specific measurement defaults:
  - diesel in gallons where applicable
  - distance/length in meters/centimeters where applicable
  - weight in kg/ton where applicable

### Status and Workflow Basics

- Generic record statuses
- Approval statuses
- Priority levels
- Severity levels
- Risk levels
- Workflow action types
- Cancellation reasons
- Rejection reasons
- Hold reasons
- Close reasons

### Communication / Contact

- Contact types
- Phone types
- Email types
- Address types
- Relationship types
- Notification channels

For each item, specify generic lookup or dedicated table, required fields, dependencies, use cases, and future modules using it.

## 6. Organization / Company / Branch Master Data Completion Plan

Review and plan:

### Owner Companies / Organizations

Fields to inspect and recommend:

- internal_reference_number
- company_code
- legal_name_en
- legal_name_ar
- short_name
- display_name
- legal_form
- country
- emirate
- city
- area
- address
- PO box
- TRN
- corporate tax number
- trade license number
- license issue date
- license expiry date
- chamber certificate
- establishment card
- immigration file number
- default currency
- default language
- primary email
- primary phone
- website
- logo
- stamp
- signature image if required
- letterhead
- active/inactive/suspended
- document attachments
- expiry reminders

### Branches

Fields to inspect and recommend:

- internal_reference_number
- branch_code
- owner_company_id
- branch_name_en
- branch_name_ar
- branch type
- emirate
- city
- area
- address
- PO box
- phone
- email
- manager/person link
- default warehouse
- default cost center
- GPS coordinates
- operating status
- attachments
- expiry/reminder fields if branch license exists

### Company/Branch Code Strategy

Explain:

- Company code should support manual meaningful code such as ALGT, ALS, PGI.
- Branch code should support manual meaningful code such as AUH, DXB, SHJ.
- Internal reference numbers may use global numbering such as ORG-0001 and BR-0001 if already implemented.
- Normal document numbering must not automatically include company/branch code.

## 7. People / Parties / Contacts Master Data Plan

Plan centralized people/contact foundation.

Analyze and propose:

### Persons

- person_id
- full_name_en
- full_name_ar
- first_name
- middle_name
- last_name
- preferred_name
- nationality
- gender if needed
- date of birth if needed
- mobile
- email
- Emirates ID if employee-specific
- passport if employee-specific
- status
- notes

### Role-Specific Extensions

Avoid one huge overloaded persons table if role-specific data becomes too complex.

Plan separate role tables where appropriate:

- employees
- customer_contacts
- vendor_contacts
- subcontractor_contacts
- driver profiles
- operator profiles
- HSE responsible persons
- authorized signatories
- bank contact persons

### Party / Business Partner Foundation

Plan whether to use:

- customers
- vendors
- subcontractors
- consultants
- government authorities
- clients
- suppliers
- waste disposal facilities
- scrap buyers
- transport subcontractors

Define whether there should be a shared `business_partners` table or separate customer/vendor tables.

Explain recommended approach for this ERP.

## 8. HR Master Data Plan

Plan HR master data required before HR module implementation.

Include at minimum:

### Organizational HR

- Departments
- Sections
- Teams
- Designations / job titles
- Grades
- Employment categories
- Employee types
- Work locations
- Reporting structure types
- Cost center linkage
- Branch linkage

### UAE Employee Compliance

- Visa types
- Visa statuses
- Emirates ID statuses
- Work permit types
- Labour card types
- Insurance categories
- Medical fitness statuses
- CICPA / security pass types
- LOA types
- Driving license categories
- HSE certificate types
- Training certificate types

### Employment Terms

- Contract types
- Work schedules
- Shift types
- Leave types
- Leave entitlement rules placeholder
- Payroll component types placeholder
- Allowance types
- Deduction types
- Benefit types
- End-of-service categories placeholder

### HR Documents

- Employee document types
- Dependent document types
- Document expiry categories
- Reminder intervals
- Required document matrix by employee type

For each item, classify lookup or dedicated table, fields required, dependencies, future HR module usage, and expiry/notification requirements.

## 9. Fleet / Equipment / Transport Master Data Plan

Plan master data required before fleet module.

Include:

### Asset Classification

- Asset categories
- Vehicle types
- Equipment types
- Trailer types
- Tanker types
- Crane types
- Excavator classes
- Wheel loader classes
- Dozer classes
- Bus types
- Pickup/4x4 types
- Compactor types
- Grader types
- Skid steer types
- Backhoe loader types
- Specialized demolition equipment types
- Attachments/tools:
  - steel shear
  - concrete shear
  - pulverizer
  - hammer
  - grappler
  - magnet
  - cold cutter
  - crusher

### Maker / Model

The user previously requested maker/model master data with country of origin.

Plan:

- makers
- models
- model variants
- country of origin
- year range
- asset category compatibility

### Technical Specs

- fuel types
- transmission types
- axle configurations
- capacity units
- equipment capacity types
- meter types:
  - odometer
  - hour meter
  - trip meter
- registration types
- plate categories
- insurance types
- GPS provider types
- permit/pass types
- CICPA pass categories

### Operations

- trip types
- job types
- transport service types
- load types
- route types
- site access types
- work shift types
- night shift flags
- standby reasons
- breakdown reasons
- accident/incident categories
- utilization statuses

### Fuel

- fuel stations
- fuel card providers
- diesel unit defaults
- gallon/liter conversion readiness
- fuel transaction types

For each item, classify lookup vs dedicated table.

## 10. Workshop / Maintenance Master Data Plan

Plan:

- Workshop locations
- Maintenance types
- Preventive maintenance templates
- PM intervals
- Service task categories
- Job order types
- Job order statuses
- Failure categories
- Fault codes
- Repair categories
- Labor skill categories
- Mechanic roles
- Service bays
- Tool categories
- Warranty types
- Inspection checklist templates
- Maintenance priority
- Breakdown categories
- Spare part issue types
- External workshop/vendor service categories

Define which should be lookup and which dedicated.

## 11. Inventory / Spare Parts / Procurement Master Data Plan

Plan:

### Inventory

- Item categories
- Item groups
- Item types
- Spare part categories
- Consumable categories
- Material categories
- Stock types
- Valuation methods
- Storage conditions
- Bin locations
- Warehouses
- Warehouse zones
- Unit conversions
- Item brands
- Item manufacturers
- Alternative item relationships
- Serial/batch tracking flags
- Minimum/maximum stock rules placeholder

### Procurement

- Vendor categories
- Supplier types
- Purchase request types
- Purchase order types
- RFQ types
- Quotation comparison criteria
- Delivery terms
- Incoterms if needed
- Payment terms
- Approval thresholds
- Procurement statuses
- Receiving statuses
- Return reasons

### Documents

- MR numbering
- PR numbering
- RFQ numbering
- PO numbering
- GRN numbering
- Purchase invoice numbering if needed

Emphasize integration with Global Numbering Engine.

## 12. Finance / Commercial Readiness Master Data Plan

Plan finance/commercial foundational master data without building full accounting yet.

Include:

- Currencies
- Exchange rates placeholder
- Tax types
- VAT categories
- Payment terms
- Payment methods
- Bank accounts
- Cost centers
- Profit centers
- Revenue categories
- Expense categories
- Customer groups
- Price lists
- Discount types
- Invoice types
- Credit note types
- Debit note types
- Payment receipt types
- Billing cycle types
- Retention types
- Advance payment types
- VAT reverse charge readiness for scrap if applicable
- RCM flag readiness
- Tender/proposal commercial terms

## 13. CRM / Customer / Vendor / Business Partner Master Data Plan

Plan:

- Customer categories
- Vendor categories
- Lead sources
- Opportunity stages
- Industry sectors
- Client types:
  - ADNOC
  - TAQA
  - EPC contractor
  - construction company
  - fabrication company
  - government
  - private
- Contact roles
- Sales regions
- Account managers
- Terms and conditions templates
- Proposal types
- Tender types
- Workgroup classifications
- Supplier qualification statuses
- ICV categories if needed

## 14. HSE / QHSE / Compliance Master Data Plan

Plan master data required for HSE operational modules.

Include:

### HSE Core

- Incident types
- Injury types
- Near miss types
- Environmental incident types
- Severity levels
- Likelihood levels
- Risk matrix
- Risk categories
- Control hierarchy
- JSA activity types
- PTW types
- Permit statuses
- SIMOPS categories
- LOTO types
- Confined space categories
- Hot work categories
- Lifting operation categories
- PPE types
- Emergency drill types
- First aid categories

### Audit / Inspection

- Audit types
- Inspection types
- Finding categories
- NCR types
- CAPA categories
- Root cause categories
- Corrective action statuses
- Observation categories

### Training / Competency

- Training categories
- Certificate types
- Competency levels
- Required training matrix by role/equipment/site

### Environmental

- Waste categories
- Hazardous waste types
- Disposal methods
- Spill categories
- Chemical categories
- SDS document types
- Emission source categories

### Compliance / Expiry

- Certificate types
- License types
- Permit types
- Reminder rules
- Escalation levels
- Responsible roles

## 15. DMS / Attachment / Document Master Data Plan

Plan centralized document management master data.

Include:

- Document categories
- Document types
- File classifications
- Confidentiality levels
- Expiry required yes/no
- Default reminder days
- Applicable entity types:
  - company
  - branch
  - employee
  - vehicle
  - equipment
  - vendor
  - customer
  - project
  - contract
  - permit
  - HSE record
- Document status
- Version control statuses
- Approval status
- Archive status
- Retention periods
- Document owner role
- Document access level

This must integrate with the requirement that all future tables support document attachments with metadata:

- document name
- expiry status yes/no
- expiry date if applicable
- follow-up reminders

## 16. Project / Task / Workflow Master Data Plan

Plan:

- Project types
- Project statuses
- Task types
- Task statuses
- Priority levels
- Milestones
- Work breakdown structure levels
- Approval workflow types
- Workflow step types
- Notification templates
- Escalation rules
- SLA categories
- Calendar/event types

## 17. Waste / Scrap / Demolition Operations Master Data Plan

Because the business includes demolition, waste management, scrap trading, transport, and asset disposal, plan master data for:

### Scrap / Surplus

- Scrap material categories
- Metal types:
  - carbon steel
  - stainless steel 304
  - stainless steel 316
  - aluminium
  - copper
  - brass
  - cables
  - mixed metal
  - non-metal
- Scrap grade
- Material condition
- Source site types
- Collection method
- Loading method
- Weighbridge types
- Weight ticket types
- Buyer categories
- Pricing basis
- LME-linked material categories
- RCM applicability flag
- VAT treatment types

### Waste

- Waste categories
- Hazardous/non-hazardous classification
- EAD license categories
- Disposal facility types
- Manifest types
- Container types
- Collection frequencies
- Treatment methods

### Demolition

- Demolition work types
- Method categories:
  - mechanical demolition
  - manual dismantling
  - hot cutting
  - cold cutting
  - underwater demolition
  - high-risk industrial demolition
- Equipment method compatibility
- Permit types
- Isolation types
- Utility disconnection types
- Hazardous material categories
- Recyclable material categories
- Concrete crushing/recycling categories

## 18. System / Admin / SaaS Master Data Plan

Plan system-level administration master data/configuration:

- Tenant/company settings
- App settings
- Letterhead templates
- Print templates
- Email templates
- Notification templates
- Numbering document types
- Menu/module registry
- Feature flags
- Role templates
- Permission groups
- Dashboard widget types
- Report categories
- Export template types
- Time zone settings
- Language settings
- Theme settings
- Currency defaults
- Measurement defaults

## 19. Roles, Permissions, and RLS Integration Plan

This section is critical.

For every master data category, define how it should integrate with the role system.

Plan permission naming conventions such as:

- master_data.lookup_categories.view
- master_data.lookup_categories.create
- master_data.lookup_categories.update
- master_data.lookup_categories.deactivate
- master_data.lookup_values.view
- master_data.lookup_values.create
- master_data.lookup_values.update
- master_data.lookup_values.deactivate
- master_data.core.view
- master_data.core.manage
- master_data.hr.view
- master_data.hr.manage
- master_data.fleet.view
- master_data.fleet.manage
- master_data.inventory.view
- master_data.inventory.manage
- master_data.hse.view
- master_data.hse.manage
- master_data.dms.view
- master_data.dms.manage
- master_data.system.view
- master_data.system.manage

Also plan:

- admin-only locked/system values
- editable user-defined values
- view-only values
- module-level permissions
- company/branch filtering where needed
- RLS for anon/custom-auth project pattern
- RLS policies for lookup tables
- RLS policies for dedicated master tables
- audit logging requirements
- protection from direct frontend tampering
- soft delete vs deactivate strategy

The report must explain exactly how master data should be secured.

## 20. UI/UX Plan for Master Data Management

Plan the UI.

### Main Master Data Center

Possible route:

`/admin/settings/master-data`

or follow existing project route convention.

The Master Data Center should include:

- Dashboard cards by category.
- Search across master data.
- Category tree/list.
- Quick access to global lookups.
- Core master data tabs.
- Module-specific master data sections.
- Active/inactive filters.
- Locked/system value indicators.
- Import/export buttons.
- Audit view.
- Usage count.
- Warning before deactivation if value is used.

### Lookup Category Page

Required features:

- List categories.
- Add/edit/view category.
- Category code.
- Category name.
- Module scope.
- System locked.
- Active/inactive.
- Sort order.
- Description.
- Usage count.

### Lookup Values Page

Required features:

- Values table.
- Parent/child values.
- English/Arabic labels.
- Code.
- Color/badge.
- Icon.
- Sort order.
- Default flag.
- Active/inactive.
- Effective dates.
- Usage count.
- Locked/system flag.
- Import/export.
- Deactivate instead of delete.

### Dedicated Master Data Screens

For high-value master tables:

- Countries/emirates/cities
- Units of measure
- Cost centers
- Departments
- Designations
- Asset categories
- Equipment types
- Maker/model
- Warehouses
- Document types

Use global drawer forms and global data table.

## 21. Integration With Other Foundation Engines

Explain how master data integrates with:

1. Global Numbering Engine.
2. Global Drawer Form.
3. Global Data Table.
4. Global Export Engine.
5. Print/PDF templates.
6. Send by Email.
7. Audit Log.
8. Notification Engine.
9. DMS/Attachment metadata.
10. App Settings.
11. Role/Permission Engine.
12. Workflow Engine later.
13. Dashboard/KPI Engine later.
14. Import/export engine later.
15. Multi-company/branch filtering.

## 22. Data Governance Plan

Plan governance rules.

Include:

- Naming conventions.
- Code conventions.
- Required fields.
- Soft delete/deactivate policy.
- Locked system records.
- Duplicate prevention.
- Audit trail.
- Maker/checker approval if needed.
- Change impact warning.
- Usage count before deactivation.
- Bulk import approval.
- Data quality dashboard.
- Ownership of master data categories.
- Validation rules.
- Translation rules.
- Default values.
- Backward compatibility.
- Migration strategy from hardcoded values.

## 23. Implementation Phasing Plan

Create a detailed phased plan after 002F.3A.

Suggested phases:

### 002F.3B — Global Lookup / Dropdown Engine Database and Admin UI

- Create lookup category/value tables.
- Create lookup admin pages.
- Create reusable lookup dropdown component.
- Add permissions/RLS/audit.

### 002F.3C — Core Shared Master Data

- Countries/emirates/cities/areas.
- Currencies.
- Units of measure.
- Payment terms.
- Tax types.
- Status/priority/severity lists.
- Contact/address types.

### 002F.3D — Organization / Branch / Company Master Data Completion

- Complete owner companies.
- Complete branches.
- Addresses.
- License/tax/legal fields.
- Logos/stamps/letterheads.
- Attachments/expiry.

### 002F.3E — People / Contacts / Business Partner Foundation

- Persons.
- Business partners.
- Customer/vendor/subcontractor categories.
- Contact roles.

### 002F.3F — HR Master Data Foundation

- Departments.
- Designations.
- Grades.
- Employment types.
- Visa/pass/license/training document types.

### 002F.3G — Fleet / Equipment Master Data Foundation

- Asset categories.
- Vehicle/equipment types.
- Maker/model.
- Fuel, meter, permit, registration basics.

### 002F.3H — Workshop / Inventory / Procurement Master Data Foundation

- Maintenance types.
- Item categories.
- Warehouses.
- Vendor categories.
- Procurement statuses.

### 002F.3I — HSE / DMS / Compliance Master Data Foundation

- HSE risk/incident/PTW/CAPA/audit/training/waste/document types.

### 002F.3J — Master Data QA, Security, and Readiness Gate

- Full review before business modules.

For each phase, include objective, tables to create/modify, UI screens, permissions, RLS, audit, tests, report file required, and acceptance criteria.

## 24. Required Master Data Inventory Matrix

Create a large matrix table with columns:

- Master Data Item
- Category
- Global Lookup or Dedicated Table
- Proposed Table Name
- Key Fields
- Used By Modules
- Requires Code
- Requires Name EN/AR
- Requires Active Status
- Requires Sort Order
- Requires Parent/Child
- Requires Attachment
- Requires Expiry
- Requires Numbering
- Requires Approval
- Requires Audit
- RLS Scope
- Permission Group
- Implementation Phase
- Priority: Critical / High / Medium / Later
- Notes

This matrix should include as many items as needed to make the ERP complete.

Do not keep the matrix shallow.

## 25. Required Hardcoded Dropdown Migration Matrix

Create a matrix for hardcoded dropdowns found in source code.

Columns:

- File
- Hardcoded Values Found
- Current Usage
- Recommended Destination
- Lookup Category Code / Table
- Migration Priority
- Risk
- Notes

## 26. Required Database Design Recommendations

For each proposed table, provide:

- Table name.
- Purpose.
- Primary key.
- Important fields.
- Unique constraints.
- Foreign keys.
- Indexes.
- RLS policy concept.
- Permissions needed.
- Audit strategy.
- Seed data needed.
- Whether it should include:
  - is_active
  - is_system
  - is_locked
  - sort_order
  - effective_from
  - effective_to
  - created_at
  - created_by
  - updated_at
  - updated_by
  - deleted_at or deactivated_at

Do not generate SQL yet, but make the database plan implementation-ready.

## 27. Required Testing Strategy

Plan tests for future implementation.

Include:

- Migration tests.
- RLS tests.
- Permission tests.
- UI tests.
- Lookup dropdown tests.
- Hardcoded dropdown replacement tests.
- Import/export tests.
- Audit logging tests.
- Deactivation/use-count tests.
- Multi-company/branch tests.
- Performance tests.
- Build tests.
- Playwright test plan if available.

## 28. Required Risks and Decisions

List:

- Risks if master data is implemented without planning.
- Risks of overusing generic lookup table.
- Risks of creating too many dedicated tables.
- Risks of hardcoded dropdowns.
- Risks of missing RLS.
- Risks of allowing deletion of used master data.
- Risks of not having audit.
- Risks of not supporting Arabic labels.
- Risks of not supporting company/branch filtering.
- Risks of not integrating numbering.
- Risks of duplicate master data.

List decisions required from the user, if any.

If no decision is required, say so clearly.

---

## Required Output File

Create only this markdown report file:

`ERP_BASE_002F_3A_GLOBAL_MASTER_DATA_ARCHITECTURE_AND_INVENTORY_PLAN.md`

The report must be detailed, structured, and implementation-ready.

Do not create implementation files.

Do not create migrations.

Do not modify existing code.

Do not proceed to 002F.3B.

## Required Final Status

At the end of the report, write one of:

- READY FOR SAMEER REVIEW — Planning is complete and ready for review.
- NEEDS USER DECISION — Planning found decisions that must be answered first.
- BLOCKED — Source access or critical inspection failed.

## Recommended Next Step After Approval

After Sameer approves this planning report, the next phase should be:

ERP BASE 002F.3B — Global Lookup / Dropdown Engine Database and Admin UI

Do not implement 002F.3B until Sameer approves the 002F.3A plan.
