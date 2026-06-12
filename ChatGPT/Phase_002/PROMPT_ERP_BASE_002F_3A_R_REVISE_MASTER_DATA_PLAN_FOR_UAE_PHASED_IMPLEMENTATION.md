# PROMPT_ERP_BASE_002F_3A_R_REVISE_MASTER_DATA_PLAN_FOR_UAE_PHASED_IMPLEMENTATION

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, UAE business compliance analyst, master data governance consultant, and SaaS product designer.

## Phase

ERP BASE 002F.3A-R — Revised Master Data Architecture Plan Modification

## Purpose

Revise and improve the existing master data planning report:

`ERP_BASE_002F_3A_GLOBAL_MASTER_DATA_ARCHITECTURE_AND_INVENTORY_PLAN.md`

This is a planning/report modification prompt only.

Do not implement code.

Do not create migrations.

Do not modify database schema.

Do not create UI screens.

Do not start Phase 002F.3B.

Your task is to review the existing 002F.3A plan and produce a revised, more accurate, more practical, and more implementation-ready master data plan based on Sameer’s latest decisions.

## Important User Decisions to Apply

Sameer confirmed the following:

1. Accounting module will NOT be implemented now.
2. Only Finance Basics should be included now, enough to support operations, CRM, procurement, invoicing readiness, and commercial data.
3. HSE will be a basic module, not a full advanced QHSE enterprise suite at this stage.
4. CRM will be implemented and must be included in master data planning.
5. Master data menu must use a proper professional hierarchical sidebar/menu structure.
6. Master data implementation must be phased to avoid implementation problems.
7. Master data must be reviewed and aligned with UAE-style business requirements.
8. Master data must be fully integrated with the existing roles and permissions module.
9. Every master data menu/page must have permissions planned and mapped.
10. RLS policies must be planned for every master data table/page.
11. Future modules requiring autonumbering must use the existing ERP BASE 002F.2 Global Numbering System.
12. Normal document numbers must remain simple:
    - EMP-0001
    - PO-0001
    - INV-0001
    - JO-0001
    - GRN-0001
13. Do not introduce company/branch/year/month/day into normal document reference numbers unless explicitly requested later.
14. Organization/company and branch records may have business codes and internal references:
    - Company codes: ALGT, ALS, PGI, AET
    - Branch codes: AUH, DXB, SHJ, ICAD, MUSSAFAH
    - Internal references: ORG-0001, BR-0001 if implemented/needed

## Existing Report Issue to Correct

The existing report/status indicates that Sections 1–11 are complete, while Sections 12–28 are only generalized implementation guidance.

This is not enough for final approval.

You must revise the plan so it becomes a complete, coherent, approved planning document with all sections properly addressed, especially:

- Finance / Commercial Readiness
- CRM / Customer / Vendor / Business Partner Master Data
- Basic HSE Master Data
- DMS / Attachment / Document Master Data
- Project / Task / Workflow Master Data
- Waste / Scrap / Demolition Master Data
- System / Admin / SaaS Master Data
- Roles / Permissions / RLS Integration
- UI/UX Sidebar Menu Structure
- Data Governance
- Implementation Phasing
- Master Data Inventory Matrix
- Hardcoded Dropdown Migration Matrix
- Database Design Recommendations
- Testing Strategy
- Risks and Decisions

Do not leave sections 12–28 as “follow same pattern” or generic notes.

## Source Files to Review

Before revising the plan, inspect:

1. `ERP_BASE_002F_3A_GLOBAL_MASTER_DATA_ARCHITECTURE_AND_INVENTORY_PLAN.md`
2. `REPORT_STATUS.md`
3. Existing Supabase migrations.
4. Existing permissions/roles migration and seed data.
5. Existing admin sidebar/menu files.
6. Existing owner companies and branches pages/forms.
7. Existing numbering engine files.
8. Existing RLS policies.
9. Existing hardcoded dropdowns/constants in the source.
10. Existing global drawer and table components.

## Required Output File

Create a revised markdown report file named:

`ERP_BASE_002F_3A_R_REVISED_MASTER_DATA_ARCHITECTURE_AND_MENU_PLAN.md`

This output must be a complete revised plan, not a small addendum.

It must be ready for Sameer review and decision before implementation.

## Required Main Changes

### 1. Remove Full Accounting Module From Current Scope

The revised plan must clearly say:

- Full accounting module is not included now.
- No chart of accounts implementation now.
- No general ledger now.
- No journal entries now.
- No trial balance now.
- No balance sheet / P&L module now.
- No full accounting workflow now.

Only keep Finance Basics needed by operations and future integration:

- Currencies
- Exchange rate source placeholder
- Payment terms
- Payment methods
- Tax types
- VAT categories
- Reverse Charge Mechanism / RCM readiness for scrap
- Bank master
- Bank account types
- Cost centers
- Profit centers
- Commercial terms
- Advance payment types
- Retention types
- Invoice/payment readiness only as master data
- Finance integration placeholders only

The report must clearly call this section:

`Finance Basics / Commercial Readiness Master Data — No Accounting Module Now`

### 2. Simplify HSE to Basic HSE Module

The revised plan must clearly say:

HSE will be implemented as a basic operational HSE module at this stage, not a full advanced QHSE enterprise suite.

Keep practical HSE master data:

- Incident types
- Near miss types
- Injury types
- Basic environmental incident types
- Severity levels
- Likelihood levels
- Risk levels
- Basic risk matrix
- PPE types
- Permit types
- PTW statuses
- Inspection types
- Audit types
- NCR types
- CAPA categories
- Root cause categories
- Corrective action statuses
- Training certificate types
- HSE certificate types
- Emergency drill types
- First aid categories
- Basic waste/environment categories if required

Move advanced HSE/QHSE items to later phases:

- Full ESG
- Full environmental monitoring
- Full contractor HSE scoring
- Full competency matrix automation
- Full advanced risk analytics
- Full regulatory reporting automation

The report must clearly call this section:

`Basic HSE Master Data — Current Scope`

### 3. Include CRM as Planned Module

CRM must be included and treated as an important planned module.

The revised plan must include CRM master data such as:

- Customer categories
- Customer types
- Lead sources
- Lead statuses
- Opportunity stages
- Opportunity loss reasons
- Sales regions
- Account managers
- Client types
- Industry sectors
- Tender types
- Proposal types
- Workgroup classifications
- Supplier/client qualification statuses
- Contact roles
- Communication types
- Follow-up types
- Meeting types
- Activity types
- Campaign types if needed later
- Customer document types
- CRM numbering needs:
  - LEAD-0001 or LD-0001
  - OPP-0001
  - QUO-0001
  - PROP-0001 if needed

CRM must be included in sidebar and phased implementation planning.

### 4. Create Final Hierarchical Sidebar/Menu Structure

The revised plan must include a professional hierarchical sidebar/menu structure.

Do not create a flat list of 100+ master data items in the sidebar.

Use this structure as the baseline, and refine if needed based on existing app route conventions:

```text
Administration
├── Dashboard
├── Users & Access
│   ├── Users
│   ├── Roles
│   ├── Permissions
│   └── Audit Logs
├── System Settings
│   ├── App Settings
│   ├── Letterheads
│   ├── Print Templates
│   ├── Email Templates
│   ├── Notification Templates
│   └── Numbering Rules
└── Master Data
    ├── Master Data Dashboard
    ├── Global Lookups
    │   ├── Lookup Categories
    │   ├── Lookup Values
    │   └── Locked System Values
    ├── Organization Setup
    │   ├── Owner Companies
    │   ├── Branches
    │   ├── Company Addresses
    │   ├── Branch Addresses
    │   ├── Company Documents
    │   └── Branch Documents
    ├── Geography & Locations
    │   ├── Countries
    │   ├── Emirates
    │   ├── Cities
    │   ├── Areas / Zones
    │   ├── Ports
    │   └── Sites / Work Locations
    ├── Finance Basics
    │   ├── Currencies
    │   ├── Payment Terms
    │   ├── Payment Methods
    │   ├── Tax Types
    │   ├── Banks
    │   ├── Bank Account Types
    │   ├── Cost Centers
    │   └── Profit Centers
    ├── Units & Measurements
    │   ├── UOM Categories
    │   ├── Units of Measure
    │   └── UOM Conversions
    ├── People & Contacts
    │   ├── Persons
    │   ├── Contact Types
    │   ├── Contact Roles
    │   ├── Authorized Signatories
    │   └── Relationship Types
    ├── CRM Master Data
    │   ├── Customer Categories
    │   ├── Customer Types
    │   ├── Lead Sources
    │   ├── Lead Statuses
    │   ├── Opportunity Stages
    │   ├── Client Types
    │   ├── Industry Sectors
    │   ├── Tender Types
    │   ├── Proposal Types
    │   ├── Sales Regions
    │   └── CRM Activity Types
    ├── HR Master Data
    │   ├── Departments
    │   ├── Sections / Teams
    │   ├── Designations
    │   ├── Grades
    │   ├── Employment Types
    │   ├── Contract Types
    │   ├── Leave Types
    │   ├── Visa Types
    │   ├── Work Permit Types
    │   ├── Insurance Categories
    │   ├── Driving License Categories
    │   ├── CICPA / Security Pass Types
    │   ├── Training Certificate Types
    │   └── Employee Document Types
    ├── Fleet & Equipment Master Data
    │   ├── Asset Categories
    │   ├── Vehicle Types
    │   ├── Equipment Types
    │   ├── Trailer Types
    │   ├── Attachment Types
    │   ├── Makers
    │   ├── Models
    │   ├── Fuel Types
    │   ├── Meter Types
    │   ├── Registration Types
    │   ├── Insurance Types
    │   ├── GPS Providers
    │   ├── Trip Types
    │   ├── Load Types
    │   ├── Utilization Statuses
    │   ├── Breakdown Reasons
    │   ├── Fuel Stations
    │   └── Fuel Card Providers
    ├── Workshop Master Data
    │   ├── Workshop Locations
    │   ├── Service Bays
    │   ├── Maintenance Types
    │   ├── PM Templates
    │   ├── Job Order Types
    │   ├── Failure Categories
    │   ├── Fault Codes
    │   ├── Repair Categories
    │   ├── Labor Skill Categories
    │   └── Inspection Checklists
    ├── Inventory Master Data
    │   ├── Item Categories
    │   ├── Item Groups
    │   ├── Item Types
    │   ├── Spare Part Categories
    │   ├── Stock Types
    │   ├── Warehouses
    │   ├── Warehouse Zones
    │   ├── Bin Locations
    │   ├── Item Brands
    │   └── Item Manufacturers
    ├── Procurement Master Data
    │   ├── Vendor Categories
    │   ├── Supplier Types
    │   ├── Purchase Request Types
    │   ├── Purchase Order Types
    │   ├── RFQ Types
    │   ├── Delivery Terms
    │   ├── Incoterms
    │   ├── Approval Thresholds
    │   ├── Receiving Statuses
    │   └── Return Reasons
    ├── Basic HSE Master Data
    │   ├── Incident Types
    │   ├── Injury Types
    │   ├── Near Miss Types
    │   ├── Risk Levels
    │   ├── Risk Matrix
    │   ├── PPE Types
    │   ├── PTW Types
    │   ├── Inspection Types
    │   ├── NCR Types
    │   ├── CAPA Categories
    │   ├── Root Cause Categories
    │   └── Emergency Drill Types
    ├── DMS / Documents Master Data
    │   ├── Document Categories
    │   ├── Document Types
    │   ├── File Classifications
    │   ├── Confidentiality Levels
    │   ├── Document Statuses
    │   ├── Version Statuses
    │   ├── Retention Periods
    │   ├── Expiry Reminder Rules
    │   └── Applicable Entity Types
    ├── Project & Task Master Data
    │   ├── Project Types
    │   ├── Project Statuses
    │   ├── Task Types
    │   ├── Task Statuses
    │   ├── Milestone Types
    │   ├── Workflow Types
    │   ├── Workflow Step Types
    │   └── SLA Categories
    └── Scrap / Waste / Demolition Master Data
        ├── Scrap Material Categories
        ├── Metal Types
        ├── Scrap Grades
        ├── Material Conditions
        ├── Collection Methods
        ├── Loading Methods
        ├── Weighbridge Types
        ├── Buyer Categories
        ├── Pricing Basis
        ├── VAT / RCM Treatment Types
        ├── Waste Categories
        ├── Hazardous Waste Types
        ├── Disposal Methods
        ├── EAD License Categories
        ├── Manifest Types
        ├── Demolition Work Types
        ├── Demolition Methods
        ├── Isolation Types
        └── Recyclable Material Categories
```

The revised report must include a decision table showing which menu items are:

- Visible immediately
- Hidden until module phase
- Managed inside Global Lookups only
- Dedicated table screens
- Future phase only

### 5. Phased Implementation Strategy

The revised plan must explicitly phase master data to avoid implementation problems.

Use this revised sequence:

#### 002F.3B — Global Lookup / Dropdown Engine

Purpose:

- lookup categories
- lookup values
- locked system values
- parent/child lookups
- active/inactive values
- reusable LookupSelect component
- admin UI
- permissions
- RLS
- audit

#### 002F.3C — Core UAE Shared Master Data

Purpose:

- countries
- emirates
- cities
- areas/zones
- currencies
- payment terms
- tax types
- units of measure
- UOM conversions
- status/priority/approval lookups
- UAE defaults

#### 002F.3D — Organization / Branch Completion

Purpose:

- owner companies
- branches
- company addresses
- branch addresses
- legal identifiers
- trade license / TRN / tax / ICV
- logos/stamps/letterheads
- document and expiry readiness

#### 002F.3E — People / Contacts / CRM Foundation

Purpose:

- persons
- contact roles
- customer categories
- vendor categories
- customer types
- vendor types
- CRM lead sources
- CRM lead statuses
- opportunity stages
- client types
- industry sectors
- tender/proposal types
- business contact roles

#### 002F.3F — HR Master Data

Purpose:

- departments
- designations
- grades
- employee types
- contract types
- leave types
- visa types
- Emirates ID statuses
- work permit types
- medical insurance categories
- driving license categories
- employee document types

#### 002F.3G — Fleet / Equipment Master Data

Purpose:

- asset categories
- vehicle types
- equipment types
- trailer types
- attachment types
- makers
- models
- fuel types
- registration types
- insurance types
- GPS providers
- trip/load/utilization statuses

#### 002F.3H — Workshop / Inventory / Procurement Master Data

Purpose:

- item categories
- warehouses
- stock types
- spare part categories
- maintenance types
- job order types
- failure categories
- vendor categories
- purchase request types
- RFQ/PO/GRN document types

#### 002F.3I — Basic HSE / DMS / Compliance Master Data

Purpose:

- incident types
- inspection types
- PPE types
- permit types
- risk levels
- NCR/CAPA categories
- training certificate types
- document categories
- document types
- expiry reminder rules

#### 002F.3J — Scrap / Waste / Demolition Master Data

Purpose:

- scrap material categories
- metal types
- scrap grades
- loading methods
- collection methods
- weighbridge ticket types
- buyer categories
- VAT/RCM treatment types
- waste categories
- hazardous waste types
- EAD license categories
- demolition method categories

#### 002F.3K — Master Data QA / Permissions / Readiness Gate

Purpose:

- confirm no hardcoded dropdowns remain
- confirm all menu permissions exist
- confirm RLS is working
- confirm role access is tested
- confirm lookup dropdowns work
- confirm export works
- confirm audit works
- confirm numbering integration is ready
- confirm sidebar hierarchy is clean

### 6. UAE-Style Master Data Requirements Review

The revised plan must include a dedicated section:

`UAE Business Requirements Compatibility Review`

This section must verify that the master data supports UAE business needs, including:

#### Company / Legal

- Trade license
- License authority
- License issue date
- License expiry date
- TRN
- Corporate tax number
- Chamber of Commerce certificate
- Establishment card
- Immigration file number
- ICV certificate
- Signatory information
- Company stamp
- Letterhead
- Emirates/city/area
- PO box

#### HR / Employee

- Emirates ID
- Passport
- Visa
- Labour card / work permit
- Medical insurance
- Medical fitness
- Driving license categories
- CICPA / security passes
- LOA
- HSE certificates
- Training certificates
- Dependent document types

#### Operations

- Emirates and industrial areas
- Ports
- Sites / work locations
- Fleet permits
- Registration types
- Insurance types
- Fuel units
- Diesel in gallons readiness
- Weight in kg/tons
- Length in meters/centimeters

#### Scrap / Waste / Demolition

- Scrap material types
- Metal grades
- Stainless steel 304/316
- Carbon steel
- Aluminium
- Copper
- Brass
- Cables
- Coiled tubing
- Hazardous/non-hazardous waste
- EAD license categories
- Disposal methods
- Manifest types
- RCM/VAT treatment
- Weighbridge ticket types
- Demolition method categories

#### CRM / Commercial

- Client types:
  - ADNOC
  - TAQA
  - EPC contractor
  - construction company
  - fabrication company
  - government
  - private
- Tender/proposal types
- Workgroup classifications
- Supplier qualification statuses
- Payment terms
- Advance payment
- Retention
- VAT/RCM readiness

### 7. Permissions and Roles Integration

The revised report must include a complete permission mapping section.

For every master data sidebar group, define:

- view permission
- manage permission
- create permission if needed
- update permission if needed
- deactivate permission if needed
- import permission if needed
- export permission if needed
- audit view permission if needed

Use a clean permission structure, such as:

```text
master_data.dashboard.view

master_data.lookups.view
master_data.lookups.manage
master_data.lookups.import
master_data.lookups.export
master_data.lookups.audit_view

master_data.organization.view
master_data.organization.manage
master_data.organization.documents.manage
master_data.organization.export

master_data.geography.view
master_data.geography.manage

master_data.finance_basics.view
master_data.finance_basics.manage

master_data.uom.view
master_data.uom.manage

master_data.people_contacts.view
master_data.people_contacts.manage

master_data.crm.view
master_data.crm.manage

master_data.hr.view
master_data.hr.manage

master_data.fleet.view
master_data.fleet.manage

master_data.workshop.view
master_data.workshop.manage

master_data.inventory.view
master_data.inventory.manage

master_data.procurement.view
master_data.procurement.manage

master_data.hse_basic.view
master_data.hse_basic.manage

master_data.dms.view
master_data.dms.manage

master_data.project_task.view
master_data.project_task.manage

master_data.scrap_waste_demolition.view
master_data.scrap_waste_demolition.manage

master_data.system_config.view
master_data.system_config.manage
```

The report must explain:

1. How these permissions are added to the existing permissions module.
2. Which roles receive which permissions by default.
3. How system_admin, group_admin, company_admin, branch_admin, and normal users differ.
4. How the sidebar should hide/show menus based on permissions.
5. How server actions enforce permissions.
6. How RLS policies support permissions.
7. How import/export permissions are controlled.
8. How audit visibility is controlled.

### 8. RLS Planning Requirements

The revised plan must include RLS strategy for:

- global lookup tables
- dedicated master tables
- company-scoped master data
- branch-scoped master data
- shared global system data
- locked system values
- user-defined values
- audit logs
- import batches
- document attachment metadata

The ERP may use anon/custom authentication patterns, so the plan must specifically mention compatibility with the existing authentication/RLS pattern and not assume only standard authenticated policies if the project differs.

### 9. Master Data Type Decision Matrix

For every menu item, classify it as one of:

- Generic Lookup
- Dedicated Table
- Existing Table Enhancement
- Future Phase
- System Configuration
- Document/DMS Related
- Numbering Rule Related

The revised report must include a table with:

- Menu Group
- Menu Item
- Recommended Type
- Proposed Table / Lookup Category
- Priority
- Implementation Phase
- Permission Group
- UAE Requirement Yes/No
- Notes

### 10. Implementation Guardrails

The revised plan must instruct future implementation prompts to follow these rules:

1. Do not implement all master data at once.
2. Every phase must produce:
   - migration file
   - UI implementation
   - permissions update
   - RLS policies
   - seed data where needed
   - test checklist
   - implementation report
3. Every phase must use the existing drawer form and data table components.
4. Every phase must integrate with audit logs.
5. Every phase must integrate with export.
6. Every master data screen must support active/inactive instead of hard delete.
7. Locked system values must not be editable by normal users.
8. Future module document numbering must use the global numbering engine.
9. Do not create duplicate dropdown systems.
10. Do not hardcode dropdown values in future modules.
11. Do not bypass permissions or RLS.
12. Do not create unreviewed broad scope changes.

### 11. Revised Final Approval Status

The revised report must end with one of:

- READY FOR SAMEER REVIEW — Revised plan complete and ready for approval.
- NEEDS USER DECISION — Specific business decisions required before implementation.
- BLOCKED — Cannot proceed because source/report inspection failed.

## Required Final Report Structure

The revised report must include at minimum:

1. Executive Summary
2. Latest User Decisions Applied
3. Existing Plan Review Findings
4. Scope Changes From Original Plan
5. Final Hierarchical Sidebar/Menu Structure
6. Master Data Menu Decision Matrix
7. UAE Business Requirements Compatibility Review
8. No Accounting Module Now — Finance Basics Only
9. Basic HSE Scope
10. CRM Master Data Scope
11. Global Lookup Engine Revised Plan
12. Core UAE Shared Master Data Revised Plan
13. Organization/Branch Completion Revised Plan
14. People/Contacts/CRM Foundation Revised Plan
15. HR Master Data Revised Plan
16. Fleet/Equipment Master Data Revised Plan
17. Workshop/Inventory/Procurement Revised Plan
18. Basic HSE/DMS/Compliance Revised Plan
19. Scrap/Waste/Demolition Revised Plan
20. System Configuration Revised Plan
21. Roles/Permissions Mapping
22. RLS Strategy
23. Numbering Integration Rules
24. Implementation Phasing Plan
25. Implementation Guardrails
26. Testing and Acceptance Strategy
27. Risks and Decisions
28. Final Approval Status

## Final Instruction

Create the revised report only.

Do not implement.

Do not start 002F.3B.

Do not generate migrations.

Do not modify app code.

The output file must be:

`ERP_BASE_002F_3A_R_REVISED_MASTER_DATA_ARCHITECTURE_AND_MENU_PLAN.md`
