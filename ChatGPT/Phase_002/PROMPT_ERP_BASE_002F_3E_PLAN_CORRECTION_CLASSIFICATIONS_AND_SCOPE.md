# PROMPT_ERP_BASE_002F_3E_PLAN_CORRECTION_CLASSIFICATIONS_AND_SCOPE

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Next.js runtime tester, SaaS security tester, master-data governance reviewer, UAE business compliance analyst, CRM/customer-vendor master-data architect, procurement master-data governance consultant, and senior ERP implementation planner.

## Phase

ERP BASE 002F.3E — People / Contacts / CRM Foundation Plan Correction

## Prompt Purpose

This is a TECHNICAL PLAN CORRECTION prompt.

Do not implement code.

Do not create migrations.

Do not modify database schema.

Do not modify application source files.

Do not create UI screens.

Your task is to correct and revise the existing 002F.3E technical implementation plan based on Sameer/Dina review comments.

## Existing Plan To Correct

Review and correct this plan:

```text
ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN.md
```

## Required Output File

Create only this corrected plan file:

```text
ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV1.md
```

Do not create any other file.

---

# 1. Context

The existing 002F.3E plan is structurally strong, but it requires corrections before implementation approval.

The main structure remains approved:

```text
No generic persons table.
No employee tables in 002F.3E.
Employees will be handled later in 002F.3F — HR Master Data.
Use separate main tables:
- customers
- vendors
- subcontractors
- consultants
- government_authorities
- recruitment_agencies
```

The no-hardcoded-dropdown rule remains mandatory:

```text
No dropdown menu may be hardcoded.
All dropdown values must come from editable master data tables or global lookup categories/values.
```

The plan must still reuse:

```text
Geography
Finance Basics
UOM
Global Lookup Engine
Organizations / Branches
Existing select components
RLS / permissions / audit patterns
BIGINT PK/FK standard
user_profiles audit pattern
```

---

# 2. Required Corrections

## 2.1 Customer Type Corrections

The current plan’s `CUSTOMER_TYPES` is incomplete.

It must include additional customer types relevant to ALGT/UAE business.

Update `CUSTOMER_TYPES` to include at least:

```text
NORMAL_CUSTOMER
MAIN_CONTRACTOR
EPC_CONTRACTOR
GOVERNMENT_CUSTOMER
SEMI_GOVERNMENT_CUSTOMER
UTILITY_COMPANY
WATER_POWER_PLANT
INDUSTRIAL_CUSTOMER
COMMERCIAL_CUSTOMER
SCRAP_BUYER
SCRAP_SUPPLIER
PARTNER_CUSTOMER
```

Important:

```text
Government customer, semi-government customer, utility company, and water & power plant must be customer types, not only customer segments.
```

Examples:

```text
TAQA / EWEC / water & power plants may be customer/project owner.
Government/semi-government entities may be customers.
```

If `CUSTOMER_SEGMENTS` also includes government/enterprise/etc., that is acceptable, but it does not replace the need for these values in `CUSTOMER_TYPES`.

## 2.2 Vendor Type Corrections

The current plan’s `VENDOR_TYPES` must be expanded.

Add at least:

```text
TRANSPORTER
TRANSPORT_SERVICE_PROVIDER
LOGISTICS_SERVICE_PROVIDER
PRIVATE_WASTE_DISPOSAL_FACILITY
WASTE_DISPOSAL_SERVICE_PROVIDER
```

Keep existing vendor types:

```text
SUPPLIER
MATERIAL_SUPPLIER
EQUIPMENT_SUPPLIER
SERVICE_PROVIDER
INSURANCE_COMPANY
PROPERTY_LESSOR
VEHICLE_LESSOR
EQUIPMENT_LESSOR
CAMP_ACCOMMODATION_LESSOR
UTILITY_PROVIDER
```

Important business rule:

```text
Transporter can be vendor or subcontractor depending on business case.
```

Use this classification rule:

```text
If transporter provides general transport service / supplier service → vendors.
If transporter is hired as project execution/subcontracted scope → subcontractors.
```

## 2.3 Waste Disposal Facility Classification Correction

The current plan classifies:

```text
waste_disposal_facilities → government_authorities
```

This is too strict.

Correct rule:

```text
Waste disposal facility can be government_authorities OR vendors.
```

Detailed rule:

```text
Government-owned / regulatory / municipality-controlled disposal facility → government_authorities.
Private disposal service company / private treatment facility / private disposal service provider → vendors.
```

Therefore:

### In `GOVERNMENT_AUTHORITY_TYPES`, keep/add:

```text
WASTE_DISPOSAL_FACILITY
GOVERNMENT_WASTE_DISPOSAL_AUTHORITY
```

### In `VENDOR_TYPES`, add:

```text
PRIVATE_WASTE_DISPOSAL_FACILITY
WASTE_DISPOSAL_SERVICE_PROVIDER
```

The revised plan must clearly document this flexibility.

## 2.4 Government Authority Type Corrections

The current `GOVERNMENT_AUTHORITY_TYPES` must include license/permit issuers and utility/transport authorities.

Add at least:

```text
LICENSE_ISSUER
PERMIT_ISSUER
REGULATOR
MUNICIPALITY
POLICE
CIVIL_DEFENSE
ENVIRONMENTAL_AUTHORITY
FREE_ZONE_AUTHORITY
PORT_AUTHORITY
CUSTOMS_AUTHORITY
PORT_CUSTOMS_AUTHORITY
UTILITY_AUTHORITY
TRANSPORT_AUTHORITY
WASTE_DISPOSAL_FACILITY
GOVERNMENT_WASTE_DISPOSAL_AUTHORITY
MINISTRY
```

Important use cases:

```text
trade license issuer
environmental permit issuer
transport permit issuer
waste permit issuer
CICPA/security permit authority
municipality permits
civil defense approvals
utility authority approvals
port/customs approvals
```

## 2.5 Recruitment Agency Vendor-Like Note

The plan creates a separate `recruitment_agencies` table. This remains approved.

However, it must clearly document:

```text
Recruitment agencies remain separate for HR/recruitment control.
They are vendor-like for payment and bank-detail purposes.
They should have bank details and commercial terms similar to vendors.
They are not merged into vendors in this phase.
```

Do not move recruitment agencies into `vendors`.

Do not remove the recruitment agency table.

## 2.6 Subcontractor Transporter Rule

Keep transporters in subcontractors as well.

Add or keep:

```text
TRANSPORTER
TRANSPORT_SUBCONTRACTOR
```

in `SUBCONTRACTOR_TYPES`.

Classification rule:

```text
Transport service vendor → vendors.
Transport subcontracted project execution party → subcontractors.
```

## 2.7 Partner Classification Clarification

The plan should keep the existing idea:

```text
Partners are not separate tables.
Partners are classified as customers or subcontractors depending on business case.
```

Use:

```text
PARTNER_CUSTOMER
PARTNER_SUBCONTRACTOR
```

No `partners` table in 002F.3E.

## 2.8 30-Table Scope Confirmation

The current plan proposes 30 tables. This is large but acceptable only if implemented in sub-phases.

The correction plan must clearly state:

```text
Do not implement all 30 tables in one implementation prompt.
```

Required phased implementation:

```text
002F.3E.1 — Technical Plan / REV1 Plan
002F.3E.2 — Database + Lookup Categories + Seed Values only
002F.3E.3 — Customers + Customer Contacts/Addresses/Documents/Bank Details
002F.3E.4 — Vendors + Vendor Contacts/Addresses/Documents/Bank Details
002F.3E.5 — Subcontractors + Consultants + Government Authorities + Recruitment Agencies
002F.3E.6 — Select Components + Sidebar + QA Readiness
```

Cursor may refine sub-phase titles, but must preserve this controlled split.

## 2.9 Permissions Scope Review

The current plan proposes very granular permissions, around 48 permissions.

Review whether this is too heavy.

The revised plan must recommend one of these:

### Option A — Granular permissions

```text
master_data.customers.view/manage/export/audit_view
master_data.vendors.view/manage/export/audit_view
master_data.subcontractors.view/manage/export/audit_view
...
```

### Option B — Grouped party permissions

```text
master_data.party_master.view
master_data.party_master.manage
master_data.party_master.export
master_data.party_master.audit_view
```

### Recommended approach

Recommend the best approach after inspecting existing project patterns.

Sameer prefers manageable implementation and avoiding unnecessary complexity. If granular permissions create too much complexity, recommend grouped permissions for phase 002F.3E, with optional granular enhancement later.

The revised plan must clearly explain the recommendation.

## 2.10 Child Table Scope Review

The current plan proposes separate child tables for contacts, addresses, documents, and bank details for every entity.

That direction is acceptable because Sameer prefers separate structures.

But the revised plan must clearly say:

```text
Child tables should follow consistent patterns.
No generic contacts/persons table.
No employees in this phase.
```

Also review whether government_authority_bank_details should remain excluded.

Current direction:

```text
No government_authority_bank_details table.
```

This remains acceptable unless Cursor finds a strong reason.

---

# 3. Sections That Must Be Updated in REV1

Update all affected sections of the plan, including:

```text
Executive Summary
Scope and Non-Scope
Final Entity Category Decision
Dedicated Table Decision Matrix
Lookup Category Plan
Database Schema Plan
Contact / Address / Document Strategy
Bank Details Strategy
CRM Foundation Strategy
Master Data Reuse and Dropdown Mapping Matrix
RLS / Permission / Role Assignment Plan
Seed Data Plan
Risk Analysis
Acceptance Criteria
Future Integration Notes
Implementation Phasing Recommendation
Final Recommendation
```

Do not only add a short appendix. The corrected values must be integrated into the full plan.

---

# 4. Required REV1 Output Structure

The corrected file must keep the same general structure as the original plan:

```text
1. Executive Summary
2. Scope and Non-Scope Confirmation
3. Source Inspection Summary
4. Final Entity Category Decision
5. Dedicated Table Decision Matrix
6. Lookup Category Plan
7. Database Schema Plan
8. Contact / Address / Document Strategy
9. Bank Details Strategy
10. CRM Foundation Strategy
11. Master Data Reuse and Dropdown Mapping Matrix
12. RLS / Permission / Role Assignment Plan
13. Audit Logging Plan
14. Server Actions Plan
15. Validation Plan
16. UI / Screen Plan
17. Reusable Select Component Plan
18. Sidebar / Menu Plan
19. Seed Data Plan
20. Data Migration / Legacy Strategy
21. Testing Plan
22. Risk Analysis and Mitigation
23. Acceptance Criteria
24. Future Integration Notes
25. Implementation Phasing Recommendation
26. Final Recommendation
```

The plan must clearly indicate it is REV1 corrected version.

---

# 5. Business Classification Rules To Include

Add this exact logic clearly in the revised plan.

## Customers

Use for:

```text
normal customer
government customer
semi-government customer
utility company
water & power plant
main contractor
EPC contractor
scrap buyer
scrap supplier
industrial customer
commercial customer
partner customer
```

## Vendors

Use for:

```text
supplier
material supplier
equipment supplier
service provider
insurance company
lessor
property/yard lessor
vehicle lessor
equipment lessor
camp/accommodation lessor
transporter as service provider
logistics service provider
private waste disposal facility
private waste disposal service provider
utility provider
```

## Subcontractors

Use for:

```text
civil subcontractor
manpower subcontractor
transport subcontractor
transporter when subcontracted for project execution
demolition subcontractor
equipment subcontractor
specialized subcontractor
partner subcontractor
```

## Consultants

Use for:

```text
engineering consultant
HSE consultant
legal consultant
technical consultant
environmental consultant
audit consultant
```

## Government Authorities

Use for:

```text
license issuer
permit issuer
regulator
municipality
civil defense
police
environmental authority
free zone authority
port authority
customs authority
port/customs authority
utility authority
transport authority
government waste disposal authority
government disposal facility
ministry
```

## Recruitment Agencies

Use for:

```text
local recruitment agency
overseas recruitment agency
manpower supply agency
executive search agency
```

Important:

```text
Recruitment agencies are separate but vendor-like for payments.
```

---

# 6. No-Hardcoded-Dropdown Rule Reminder

The corrected plan must continue to enforce:

```text
No hardcoded dropdowns.
No hardcoded arrays.
No duplicate lookup tables.
All dropdown values must come from global_lookup_categories/global_lookup_values or existing editable master data tables.
```

All new classifications above must be seeded into `global_lookup_values`, not hardcoded in React forms.

---

# 7. Final Status Requirement

At the end of the corrected plan, write one of:

```text
READY FOR SAMEER REVIEW — 002F.3E REV1 corrected technical plan complete.
NEEDS USER DECISION — Specific decisions required before implementation.
BLOCKED — Could not produce safe corrected plan.
```

If ready, recommend next prompt:

```text
PROMPT_ERP_BASE_002F_3E_2_IMPLEMENT_DATABASE_LOOKUPS_SEEDS.md
```

## Final Instruction

Create only:

```text
ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV1.md
```

Do not implement.
Do not create migrations.
Do not modify app files.
