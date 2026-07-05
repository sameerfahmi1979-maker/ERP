# Report Designer — UX Improvement Plan (Corrected)
## Pre-Implementation Planning Document

**Prepared:** 2026-07-04  
**Correction ref:** `ChatGPT/CURSOR_PROMPT_REPORT_DESIGNER_UX_PLAN_CORRECTION_TIPTAP_DYNAMIC_MODULE_FIELD_BROWSER.md`  
**Supersedes:** Earlier draft (ChatGPT/REPORT_DESIGNER_UX_IMPROVEMENT_PLAN.md — discarded, not persisted)  
**Status:** DRAFT — Awaiting Sameer/Dina review and approval before any implementation  
**Next action:** Sameer reviews, confirms open questions, approves phase order

---

## Changes from Previous Draft

| Item | Previous Draft | Corrected Direction |
|---|---|---|
| Multi-column layout | Footer only | Header, Body, and Footer — all three zones |
| TipTap rich text | Deferred to DESIGNER.12 | **Required in UX.1** |
| Dynamic module field browser | Deferred to future series | **Required in UX.2** |
| Sensitive fields (salary, IBAN, etc.) | Permanently blocked | Restricted by default — may be unlocked via permission + template type + governance + audit |
| Raw HTML / CSS / JS | Blocked | **Remains blocked regardless of user level** |

---

## Phase Roadmap

```
REPORT DESIGNER UX.1 — TipTap Rich Text + Multi-Column Layout Foundation
REPORT DESIGNER UX.2 — Dynamic Expandable Module Field Registry and Field Picker
REPORT DESIGNER UX.3 — Restricted / Sensitive Field Governance and Official Output Controls
```

These phases **must not be merged** into one implementation unless Sameer/Dina explicitly accept the risk.

---

## REPORT DESIGNER UX.1 — TipTap Rich Text + Multi-Column Layout Foundation

### Objective

Replace the plain string `content` prop in `BodyTextSectionBlock` with a safe TipTap-powered rich text editor that:
- Supports per-block font size, bold, italic, underline, alignment, and safe color
- Stores content as structured ProseMirror JSON (never raw HTML)
- Preserves `{{binding.path}}` token insertion from the allowlist
- Adds controlled multi-column layout capability for Header, Body, and Footer zones

---

### Scope 1-A: TipTap Safe Rich Text Editor

#### Architecture

| Layer | Approach |
|---|---|
| Storage format | ProseMirror JSON (`{type: "doc", content: [...]}`) — never raw HTML |
| Paste handling | Strip all unsafe nodes on paste; sanitize to allowed node set |
| HTML rendering | Controlled server-side renderer reads JSON, emits safe HTML using a strict node/mark allowlist |
| Security validation | `visual-template-security-review.ts` must validate ProseMirror JSON structure |

#### Allowed Node/Mark Types (v1)

**Nodes:**
- `doc` — document root
- `paragraph` — standard paragraph
- `hardBreak` — `<br>`
- `bulletList` + `listItem` — unordered list
- `orderedList` + `listItem` — ordered list
- `text` — text leaf

**Marks (per-character formatting):**
- `bold`
- `italic`
- `underline`
- `textStyle` — for font size and color (validated values only)

**TipTap extensions to ENABLE:**
- `StarterKit` (subset — see blocked list)
- `Underline`
- `TextStyle`
- `Color` (safe hex only)
- `FontSize` (custom extension — capped range 8–36px)
- `TextAlign`

**TipTap extensions to DISABLE / BLOCK:**
- `HardBreak` (from StarterKit — replace with custom restricted version)
- `HTML` raw HTML node
- `Link` (deferred to UX.2 or later — needs safe URL validation)
- `Image` (blocked — images come only from branding profile blocks)
- `CodeBlock`, `Code`
- `Blockquote`
- `HorizontalRule` (use DividerBlock instead)
- `Strike` (not needed in formal documents)

#### What is NEVER Allowed

```
Raw HTML nodes or marks
Style attributes from user text input
Script, iframe, object, embed, applet
External tracking images
Arbitrary JavaScript
Unsafe URLs (javascript:, data:, file:)
```

#### `{{binding.path}}` Token Handling

Tokens are preserved as a custom TipTap Node type: `bindingToken`.

```
Type: "bindingToken"
Attrs: { path: string } — must be an allowlisted path from ERP_BINDING_REGISTRY
Rendering: renders as inline chip in editor UI; renders as {{path}} placeholder for server substitution
Validation: security review rejects any bindingToken where path is not in ERP_BINDING_REGISTRY
Insertion: via Field Picker (UX.2) or manually typed — if typed, validated on save
```

#### Font Size and Color Safety

- **Font size:** integer only, range 8–36px. Stored as a validated integer prop on `textStyle`.
- **Color:** hex string only. Pattern: `^#[0-9a-fA-F]{6}$`. No `rgb()`, `hsl()`, `expression()`, or named colors from user input.

#### Effect on Existing `BodyTextSectionBlock`

| Property | Current | After UX.1 |
|---|---|---|
| `content` | `string` with `{{binding}}` tokens | `ProseMirrorDoc` JSON (new field: `richContent`) |
| `title` | `string` | unchanged |
| `language` | `"en" \| "ar" \| "bilingual"` | unchanged |
| Backward compat | — | `content` (plain string) still accepted; migrated to richContent at save |

---

### Scope 1-B: Multi-Column Layout — All Three Zones

#### Problem

All blocks currently stack vertically. No way to place two blocks side-by-side in the same zone.

#### Safest v1 Approach: Controlled Column Strip Block (Fixed Slots)

**Recommendation: Use a `ColumnStripBlock` with fixed named slots, not arbitrary nested Puck blocks.**

Reasons:
1. Nested Puck layout zones add significant complexity to the layout JSON schema
2. Fixed slot design keeps the security surface small
3. Fixed slot design maps cleanly to `ExecutiveLedgerColumnSection` without dynamic nesting
4. All block rendering still goes through the controlled EL renderer

#### `ColumnStripBlock` Design

A `ColumnStripBlock` is a container block with 2 or 3 fixed child slots. Each slot holds exactly one block of a permitted type.

```
ColumnStripBlock:
  layout: "2-col" | "3-col" | "left-wide" | "right-wide" | "equal"
  slots:
    left:  one permitted child block (see allowed list below)
    center: one permitted child block (3-col only)
    right: one permitted child block
```

**Child slot allowed block types (v1):**

| Block type | Allowed in column slot? |
|---|---|
| `HeadingBlock` | ✅ |
| `BodyTextSectionBlock` | ✅ |
| `KeyValueSectionBlock` | ✅ |
| `CompanyLogoBlock` | ✅ |
| `SignatoryBlock` | ✅ |
| `StampBlock` | ✅ |
| `VerificationQrBlock` | ✅ |
| `BrandingHeaderBlock` | ❌ — full-width only |
| `ReportTableBlock` | ❌ — full-width only (too wide for column slot) |
| `ColumnStripBlock` | ❌ — no nesting |

**Column layouts and intended usage:**

| Layout token | Width split | Typical use |
|---|---|---|
| `equal` | 50 / 50 | Two equal columns |
| `left-wide` | 70 / 30 | Text left, logo/QR right |
| `right-wide` | 30 / 70 | Logo left, text right |
| `2-col` | 50 / 50 | Alias for `equal` |
| `3-col` | 33 / 34 / 33 | Footer strip: Sig / Stamp / QR |

**Design examples enabled:**

Header zone:
```
[ Company Logo (left-wide left slot) ] [ Doc Ref / Date (left-wide right slot) ]
```

Body zone:
```
[ Employee KV Section (equal left slot) ] [ Document KV Section (equal right slot) ]
```

Footer zone (3-col):
```
[ Signatory (left slot) ] [ Stamp (center slot) ] [ QR Code (right slot) ]
```

#### Executive Ledger Extension Required

A new `ExecutiveLedgerColumnSection` type will be added to `src/lib/executive-ledger/types.ts`:

```typescript
interface ExecutiveLedgerColumnSection {
  type: "column";
  layout: "equal" | "left-wide" | "right-wide" | "2-col" | "3-col";
  slots: {
    left?: ExecutiveLedgerSection;
    center?: ExecutiveLedgerSection;
    right?: ExecutiveLedgerSection;
  };
}
```

The HTML renderer adds a corresponding `renderColumnSection()` function that outputs a CSS Grid/Flex row — no raw CSS from user props.

---

### Scope 1-C: Security Review and Governance Integration

- `layout-schema.ts` — add `ColumnStripBlockSchema` and `BodyTextSectionRichSchema`
- `visual-template-security-review.ts` — validate ProseMirror JSON nodes/marks; validate slot blocks recursively; reject unsupported node/mark types
- `layout-to-executive-ledger.ts` — map `ColumnStripBlock` to `ExecutiveLedgerColumnSection`; map rich text JSON to `ExecutiveLedgerBodySection`
- `html-renderer.ts` — render `ExecutiveLedgerColumnSection`; render rich text JSON as safe HTML using the node/mark allowlist

---

### Deliverables

- [ ] TipTap architecture design + extension list finalized
- [ ] Rich text ProseMirror JSON schema defined
- [ ] `bindingToken` custom node defined
- [ ] `ColumnStripBlock` type + Zod schema
- [ ] `ExecutiveLedgerColumnSection` type + renderer
- [ ] Security review extension for rich text and column blocks
- [ ] Updated `BodyTextSectionBlock` type (richContent vs. content migration)
- [ ] UAT checklist

---

## REPORT DESIGNER UX.2 — Dynamic Expandable Module Field Registry and Field Picker

### Objective

Replace the static `ERP_BINDING_REGISTRY` with a structured **Report Field Registry** that:
- Is grouped by ERP module and entity
- Is expandable as new modules are implemented
- Drives the Field Picker UI (click-to-insert, no manual typing)
- Supports restricted/sensitive fields with visibility rules

---

### Scope 2-A: Report Field Registry Architecture

#### Registry Model

Each field entry in the registry contains:

```typescript
interface ReportFieldRegistryEntry {
  // Identity
  module_code: string;            // e.g. "HR", "COMPANY", "DOCUMENT", "DMS"
  module_label: string;           // e.g. "Human Resources"
  entity_code: string;            // e.g. "EMPLOYEE", "COMPANY", "DOCUMENT"
  entity_label: string;           // e.g. "Employee"

  // Field identity
  field_path: string;             // e.g. "employee.full_name_en"
  field_label: string;            // e.g. "Employee Full Name (English)"
  data_type: "string" | "date" | "number" | "url";

  // Governance
  sensitivity_level: "public" | "internal" | "restricted" | "confidential";
  required_permission?: string;   // e.g. "reports.sensitive_fields.use"
  allowed_template_types?: string[];  // e.g. ["salary_certificate"]
  allowed_output_modes?: ("preview" | "official" | "test")[];

  // Resolution
  resolver_key: string;           // Key for the server-side resolver — not SQL
  sample_value: string;           // e.g. "Ahmed Al Mansoori"

  // Registry control
  is_active: boolean;
  is_planned: boolean;            // Show as coming soon / disabled in UI
  sort_order: number;
}
```

#### Key Design Decisions

1. **Not automatic DB column scanning.** No field is auto-exposed because it exists in the database. Every field must be explicitly registered.
2. **TypeScript-backed first.** The registry lives as TypeScript constants, not a database table. This keeps it auditable via code review and avoids admin misconfiguration.
3. **DB-backed as future option.** If admin-configurable fields are needed later (e.g., custom fields), a DB-backed extension can be added without changing the TypeScript foundation.
4. **Resolver keys, not SQL.** Each field's resolver is identified by a string key that maps to a server-side resolver function. The UI cannot inject SQL or arbitrary queries.

#### Sensitivity Levels

| Level | Description | Default visibility in picker |
|---|---|---|
| `public` | Safe for all document types and outputs | Always visible |
| `internal` | Safe for internal HR documents | Visible to users with reports permission |
| `restricted` | Requires explicit template type allowlist | Visible but locked badge shown |
| `confidential` | Highest restriction — salary, medical, IBAN | Visible with lock badge; requires UX.3 governance gates |

#### Module Grouping

Field picker UI groups fields by module:

```
HR — Employee
  employee.full_name_en         Employee Full Name (English)       [public]
  employee.joining_date         Date of Joining                    [public]
  employee.last_working_date    Last Working Date                  [internal]
  employee.last_salary          Last Salary                        [confidential 🔒]
  ...

HR — Employment
  ...

Company
  company.legal_name_en         Company Legal Name (English)       [public]
  ...

Document
  document.ref                  Document Reference Number          [public]
  ...

Report
  report.title                  Report Title                       [public]
  ...
```

---

### Scope 2-B: Field Picker UI

**Location:** Embedded in Puck property panel for:
- `BodyTextSectionBlock` — click-to-insert into TipTap editor as a `bindingToken`
- `KeyValueSectionBlock` — replaces flat dropdown with grouped searchable picker
- `ReportTableBlock` — column key suggestion (not binding — uses report row keys)

**UI design:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Insert Field                                                   │
│  🔍 Search fields...                                            │
│                                                                 │
│  ▾ HR — Employee                                               │
│    Employee Full Name (English)  employee.full_name_en  ↗ Insert│
│    Date of Joining               employee.joining_date  ↗ Insert│
│    Last Salary                   🔒 Requires permission         │
│                                                                 │
│  ▾ Company                                                      │
│    Company Legal Name (English)  company.legal_name_en  ↗ Insert│
│  ...                                                            │
└─────────────────────────────────────────────────────────────────┘
```

**Behavior rules:**
- `public` + `internal` fields: always clickable
- `restricted` fields: clickable only if user has `required_permission`; locked icon + tooltip if not
- `confidential` fields: locked always in the picker until UX.3 governance gates are implemented
- `is_planned` fields: grayed out with "(Coming soon)" label
- Click → calls TipTap's `insertContent` with a `bindingToken` node (or appends `{{path}}` in legacy text fields)

---

### Scope 2-C: Binding Registry Expansion — New Safe Fields

These fields are proposed for addition in UX.2 (pending DB column confirmation):

| Field path | Label | Sensitivity | Notes |
|---|---|---|---|
| `employee.probation_end_date` | Probation End Date | internal | Date field |
| `employee.contract_start_date` | Contract Start Date | internal | Date field |
| `employee.mobile_number` | Employee Mobile Number | internal | Only for formal letters |
| `employee.known_name` | Known / Display Name | public | Safe |
| `employee.gender` | Gender | internal | Standard HR data |
| `employee.marital_status` | Marital Status | internal | Standard HR data |
| `employee.grade` | Grade / Level | internal | If column exists in DB |
| `employee.end_of_service_date` | End of Service Date | restricted | Needs EOS table confirmation |

**Salary and financial data:** Deferred to UX.3 (restricted governance gates required first).

---

### Scope 2-D: Future Module Onboarding Rule

**This is a standing rule for all future ERP module implementations.**

> **FUTURE MODULE RULE:**  
> Whenever a new ERP module is implemented or significantly enhanced, the implementation phase MUST review whether the module needs Report Designer field registry support. If yes, the module's implementation phase must include: allowlisted field definitions, resolver key mappings, sample values, sensitivity classification, security review coverage, and Source of Truth update.
>
> No field may be exposed to the Report Designer just because it exists in the database. Every field must be explicitly allowlisted by a developer, reviewed, and registered.

**Examples by future module:**

```
When Fleet module is implemented:
  Add to registry:
    fleet.vehicle_code            Vehicle Code             [public]
    fleet.plate_number            Plate Number             [public]
    fleet.registration_expiry     Registration Expiry      [internal]
    fleet.assigned_driver         Assigned Driver          [internal]
  Classify any insurance/value data as restricted

When Workshop module is implemented:
  Add to registry:
    workshop.job_card_no          Job Card Number          [public]
    workshop.vehicle              Vehicle                  [public]
    workshop.complaint            Customer Complaint       [internal]
    workshop.work_status          Work Status              [public]
    workshop.completion_date      Completion Date          [public]

When Procurement module is implemented:
  Add to registry:
    procurement.po_number         Purchase Order No.       [public]
    procurement.supplier_name     Supplier Name            [public]
    procurement.delivery_date     Expected Delivery Date   [public]
    procurement.status            PO Status                [public]

When Finance module is implemented:
  Add to registry:
    finance.invoice_no            Invoice Number           [public]
    finance.due_date              Payment Due Date         [public]
  Any IBAN/bank account data → confidential, requires UX.3 gates
```

---

### Deliverables

- [ ] `ReportFieldRegistryEntry` type defined
- [ ] Registry refactored/extended from `ERP_BINDING_REGISTRY` to new grouped structure
- [ ] Field Picker UI component (reusable across blocks)
- [ ] TipTap `insertContent` integration with `bindingToken` node
- [ ] `KeyValueSectionBlock` picker updated to grouped picker
- [ ] New safe fields added and resolver-mapped
- [ ] `visual-template-security-review.ts` updated to use new registry
- [ ] Future module onboarding rule codified in Cursor rule file

---

## REPORT DESIGNER UX.3 — Restricted/Sensitive Field Governance and Official Output Controls

### Objective

Add the governance gates required to allow restricted/confidential fields (salary, IBAN, medical, passport/EID data) to appear in official document outputs when authorized.

---

### The Rule (Corrected from Previous Draft)

**Previous (wrong):** Sensitive fields are permanently blocked.

**Corrected:**

> Sensitive fields are **blocked by default**. They may appear in official printed outputs only when ALL of the following gates pass:
> 1. User has the required permission (e.g. `reports.sensitive_fields.use`)
> 2. Template type explicitly allows the field (e.g. `salary_certificate` allows salary)
> 3. Template is approved/published through governance workflow
> 4. Security review passes
> 5. Output mode is `official` — not preview/test
> 6. Preview/test mode shows masked placeholder (`***`) or "Restricted field — not shown in preview"
> 7. Usage is recorded in audit log

**Raw HTML, raw CSS, and JavaScript remain blocked even for authorized users.**

---

### Sensitive Field Classification and Template Allowlist (Proposed)

| Field group | Fields | Proposed template types that may allow |
|---|---|---|
| Salary/compensation | `employee.last_salary`, `employee.basic_salary`, `employee.total_salary`, `employee.net_salary` | `salary_certificate`, `offer_letter` |
| Banking/IBAN | `employee.iban`, `employee.bank_account_number` | `salary_certificate`, `bank_confirmation_letter` |
| Passport/EID | `employee.passport_number`, `employee.eid_number` | `government_forms`, `visa_letter` |
| Visa details | `employee.visa_number`, `employee.visa_expiry` | `government_forms`, `visa_letter` |
| Medical/health | Any medical/insurance/health data | `medical_fitness_letter` (restricted HR outputs only) |

---

### Permission Model

| Permission code | Who receives it | Purpose |
|---|---|---|
| `reports.sensitive_fields.use` | Template designer + HR manager | Allows placing restricted fields in templates |
| `hr.payroll.view` | Payroll users | Gate for salary fields specifically |
| `hr.medical.view` | HR medical roles | Gate for medical/health fields |
| `reports.sensitive_fields.approve` | `system_admin` + `group_admin` | Required to publish a template that uses restricted fields |

---

### Preview / Test Masking Rule

| Mode | Restricted field behavior |
|---|---|
| Preview (design time) | Show `[Restricted — not shown in preview]` |
| Test with real employee | Show `***` masked placeholder |
| Official output | Show real value (only if all gates pass) |
| QR verification page | Never show sensitive data — show document reference only |

---

### Audit Logging

Every official output that resolves a restricted/confidential field must write an audit log row:

```
table: audit_logs (existing)
action: "report.sensitive_field_resolved"
resource_type: "erp_report_templates"
resource_id: {template_id}
metadata: { field_paths: string[], employee_id: bigint, output_mode: "official", template_type: string }
```

---

### Deliverables

- [ ] Sensitive field permission model (new permissions seeded)
- [ ] `allowed_template_types` enforcement in production renderer
- [ ] Preview masking for restricted fields
- [ ] Test mode masking for restricted fields
- [ ] Official output unlock flow
- [ ] Audit log extension for sensitive field resolution
- [ ] Security review updated to validate template type vs. field restrictions
- [ ] UAT checklist

---

## What Remains Permanently Blocked (Not Governance-Unlockable)

These will **never** be allowed regardless of permission or governance level:

| Item | Reason |
|---|---|
| Raw HTML in template props | XSS injection risk |
| Raw CSS strings from user input | CSS injection / style exfiltration |
| JavaScript in templates | Remote code execution |
| Iframe/embed/object | Phishing/content injection |
| Arbitrary URLs (data:, javascript:) | XSS / content injection |
| External tracking images | Privacy violation |
| QR links from preview/test paths | Governance integrity — real QR only from official issuance |
| `ocr_text`, `embedding`, `vector` DB columns | Model internals — not user-facing data |
| `created_by`, `updated_by`, internal FK IDs | Internal system columns |
| API keys, service_role, secret tokens | Critical security |

---

## Phase Sequencing and Dependencies

```
UX.1 (TipTap + Multi-column)
  ├── Prerequisite: None — builds on DESIGNER.1-9 foundation
  ├── Blocks: UX.2 field picker TipTap integration requires UX.1 to be live
  └── Output: Rich text editor, column layout, schema version bump

UX.2 (Field Registry + Picker)
  ├── Prerequisite: UX.1 must be in production
  ├── Blocks: UX.3 requires registry with sensitivity_level support
  └── Output: Grouped field picker, expandable registry, future module rule

UX.3 (Sensitive Field Governance)
  ├── Prerequisite: UX.2 registry with sensitivity_level + required_permission
  ├── DB migration required: new permissions
  └── Output: Salary/IBAN/medical fields unlockable in authorized official outputs
```

---

## Open Questions for Sameer/Dina to Confirm

1. **Column layout nesting:** Should `ColumnStripBlock` slots allow any permitted block, or only a curated subset (e.g. KV Section, Logo, Signatory, Stamp, QR)?
2. **TipTap link support in v1:** Should hyperlinks be allowed in rich text body sections? (Proposed: deferred — no links in v1 formal documents)
3. **Global sensitive field permission:** Is `reports.sensitive_fields.use` the correct permission code, or should it be more granular (one per field group)?
4. **Salary template types:** Proposed allowlist: `salary_certificate`, `offer_letter`. Are there other template types that should allow salary fields?
5. **Passport/EID template types:** Proposed: `government_forms`, `visa_letter`. Confirm acceptable template types.
6. **Medical data template types:** Proposed: `medical_fitness_letter`. Confirm.
7. **Registry storage:** TypeScript-backed first (code review controlled) is the recommendation. Confirm, or request DB-backed admin configuration.
8. **End of service date source column:** Which table and column is the authoritative source for an employee's EOS date? (Needed before adding `employee.end_of_service_date` to registry)
9. **Mobile number policy:** Is `employee.mobile_number` acceptable in formal letters, or should it be classified as `restricted`?
10. **Phase approval:** Can UX.1, UX.2, UX.3 be approved as a sequence, or must each be individually reviewed before the next is started?

---

## Implementation Order

```
1. Sameer/Dina reviews this document → marks corrections or approvals
2. Open questions confirmed (above)
3. Sameer provides UX.1 implementation prompt
4. UX.1 implemented → tested → closed
5. Sameer provides UX.2 implementation prompt
6. UX.2 implemented → tested → closed
7. Sameer provides UX.3 implementation prompt (can be deferred if not urgent)
8. UX.3 implemented → tested → closed
```

---

*Review this document. Mark any corrections, additions, or removals in the open questions section. Approval of this document is required before any implementation begins.*
