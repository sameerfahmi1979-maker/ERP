# ERP Report Designer — Field Registry Standard

**Phase**: REPORT DESIGNER UX.2 — Dynamic Expandable Module Field Registry  
**Date**: 2026-07-04  
**Status**: ACTIVE

---

## Overview

The Report Designer Field Registry is the single source of truth for all data fields that can appear in visual report templates. It replaces the legacy flat `ERP_BINDING_REGISTRY` with a structured, module-grouped, governance-aware registry that supports current ERP fields and future modules safely.

---

## Registry Architecture

### File Locations

```
src/lib/report-designer/field-registry/
  types.ts              — TypeScript interfaces and enums
  registry.ts           — Canonical field definitions (EDIT THIS to add fields)
  registry-utils.ts     — Grouping, search, and helper functions
  legacy-binding-adapter.ts — Auto-generates ERP_BINDING_REGISTRY for backward compat
  index.ts              — Public exports
```

The legacy `src/lib/report-designer/binding-registry.ts` now auto-generates `ERP_BINDING_REGISTRY` from the field registry. All existing imports remain unchanged.

---

## Field Entry Structure

```typescript
interface ReportFieldRegistryEntry {
  moduleCode: string;          // e.g. "HR", "COMPANY", "FLEET"
  moduleLabel: string;         // e.g. "HR / Human Resources"
  entityCode: string;          // e.g. "employee", "company"
  entityLabel: string;         // e.g. "Employee"
  fieldPath: string;           // e.g. "employee.full_name_en" — used in {{...}} tokens
  fieldLabel: string;          // Human-readable label for the picker
  dataType: ReportFieldDataType;   // "string" | "date" | "number" | "money" | "boolean" | "url"
  sensitivityLevel: ReportFieldSensitivityLevel;
  requiredPermission?: string; // RBAC permission key (UX.3+)
  allowedTemplateTypes?: string[]; // Restrict to certain template types (UX.3+)
  allowedOutputModes?: Array<"preview" | "test" | "official">;
  resolverKey: string;         // Server-side resolver function key
  sampleValue: string;         // Sample value for "sample" test mode
  isActive: boolean;           // Whether the field can be inserted
  isPlanned: boolean;          // Whether this is a future placeholder
  sortOrder: number;           // UI ordering within entity group
  description?: string;        // Tooltip description
}
```

---

## Sensitivity Levels

| Level | Description | Insertable in UX.2 | Picker Display |
|---|---|---|---|
| `public` | Safe for any document — name, code, title | ✅ | Normal |
| `internal` | HR/company internal — dept, joining date, status | ✅ | Internal badge |
| `restricted` | Requires UX.3 governance unlock | ❌ | Locked with tooltip |
| `confidential` | Salary, IBAN, passport, EID, medical | ❌ | Locked with tooltip |

---

## Active vs Planned Fields

- **`isActive: true, isPlanned: false`** — Field is available, insertable (subject to sensitivityLevel)
- **`isActive: false, isPlanned: true`** — Future module placeholder, shown as "Coming Soon"
- **`isActive: false, isPlanned: false`** — Retired/disabled field, shown locked

---

## Resolver-Key Rule

**Every active field must map to a server-side resolver function.**

- Resolver keys correspond to existing safe query functions in `test-data-resolver.ts`
- Resolver keys are NOT raw column names — they must go through the resolver layer
- Sensitive fields (salary, IBAN, etc.) must never have resolver implementations in UX.2

---

## No Automatic DB Scanning

**Fields are never exposed automatically from the database.**

Every field must be:
1. Explicitly listed in `registry.ts` with all required properties
2. Backed by a server-side resolver in `test-data-resolver.ts`
3. Covered by the security review in `visual-template-security-review.ts`

---

## Future Module Onboarding Rule

Whenever a new ERP module is implemented, the phase MUST review Report Designer support.

### Required steps if the module has reportable entities:

1. Add `ReportFieldRegistryEntry` entries in `registry.ts`
2. Implement resolver functions in `test-data-resolver.ts`
3. Add sample values in `live-test-schema.ts`
4. Verify security review covers new field paths
5. Update `ALGT_ERP_SOURCE_OF_TRUTH.md`

### Modules with planned registry support:

| Module | Planned Fields | Status |
|---|---|---|
| Fleet | vehicle_number, plate, chassis | Planned |
| Procurement | po_number, vendor, amount | Planned |
| Finance | invoice_number, total, vat | Planned |
| Inventory | item_code, description, quantity | Planned |
| Transport | trip_number, origin, destination | Planned |
| HSE | incident_number, type, severity | Planned |
| Workshop | work_order_number, vehicle, technician | Planned |
| Weighbridge | ticket_number, net_weight | Planned |

---

## Current Active Fields (UX.2)

### HR / Employee

| Field Path | Label | Sensitivity |
|---|---|---|
| `employee.full_name_en` | Full Name (English) | Public |
| `employee.full_name_ar` | Full Name (Arabic) | Public |
| `employee.employee_code` | Employee Code / ID | Public |
| `employee.designation` | Designation / Job Title | Public |
| `employee.department` | Department | Public |
| `employee.known_name` | Known / Preferred Name | Public |
| `employee.branch` | Branch / Work Location | Internal |
| `employee.owner_company` | Company (Employer) | Internal |
| `employee.joining_date` | Date of Joining | Internal |
| `employee.nationality` | Nationality | Internal |
| `employee.employment_type` | Employment Type | Internal |
| `employee.contract_end_date` | Contract End Date | Internal |
| `employee.contract_start_date` | Contract Start Date | Internal |
| `employee.employment_status` | Employment Status | Internal |
| `employee.work_site` | Primary Work Site | Internal |
| `employee.gender` | Gender | Internal |
| `employee.marital_status` | Marital Status | Internal |
| `employee.probation_end_date` | Probation End Date | Internal |
| `employee.mobile_number` | Mobile Number | Internal |
| `employee.last_working_date` | Last Working Date | Internal |
| `employee.end_of_service_date` | End of Service Date | Restricted (Planned) |

### Company

| Field Path | Label | Sensitivity |
|---|---|---|
| `company.legal_name_en` | Legal Name (English) | Public |
| `company.legal_name_ar` | Legal Name (Arabic) | Public |
| `company.address_block_en` | Address (English) | Public |
| `company.phone` | Phone | Public |
| `company.email` | Email | Public |
| `company.website` | Website | Public |
| `company.trn` | Tax Registration Number | Internal |
| `company.trade_license_no` | Trade License Number | Internal |

### Document

| Field Path | Label | Sensitivity |
|---|---|---|
| `document.title` | Document Title | Public |
| `document.ref` | Document Reference Number | Public |
| `document.generated_at` | Document Generated Date | Public |
| `document.issue_date` | Document Issue Date | Public |
| `document.qr_verification_url` | QR Verification URL | Internal |

### Report

| Field Path | Label | Sensitivity |
|---|---|---|
| `report.title` | Report Title | Public |
| `report.code` | Report Code | Public |
| `report.total_rows` | Report Total Rows | Public |
| `report.generated_at` | Report Generated At | Public |

---

## Blocked Fields (UX.2 and permanently)

These must NEVER appear as `isActive: true` in UX.2:

- `salary`, `basic_salary`, `total_salary`, `net_salary`, `allowance`, `deduction`
- `iban`, `account_number`, `bank_account`
- `passport` (raw number), `eid_number` (raw number), `visa_number` (raw details)
- `medical`, `diagnosis`, `prescription`, `health`, `insurance`
- `ocr_text`, `extracted_text`, `embedding`, `vector`
- `api_key`, `secret`, `token`, `service_role`

---

## UX.3 Dependency

Restricted and confidential fields require **REPORT DESIGNER UX.3** which will add:

- Template type restrictions enforced at the field level
- RBAC permission check before allowing field insertion
- Output mode restrictions (restricted fields: official output only)
- Audit logging for sensitive field access
- Management approval flow for publishing templates with restricted fields
- Secure PDF watermarking for confidential output
