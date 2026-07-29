# Template Studio Re-Authoring Specification
## "To Whom It May Concern" (Templates 14/15) → Structured Template Studio

**Source:** `template_15_body_layout.json` (byte-identical to template 14)
**Target:** Structured Template Studio (TipTap-based, OUTPUT.3A/3B), document class **A/B (official certificate)**

## Document Identity

| Property | Value |
|---|---|
| Business identity | Salary / Employment Certificate ("To Whom It May Concern") |
| Suggested output code | `HR_SALARY_CERTIFICATE` (contains salary amounts → class A sensitive) |
| Language | English (LTR); Arabic variant to be authored separately |
| Approval policy | Required (salary amounts present) per v6.1 |
| QR validity policy | ~90 days default (salary-with-amount class) per v6.1 |

## Structure Mapping (Puck blocks → Studio blocks)

| # | Puck source | Studio block | Content |
|---|---|---|---|
| 1 | Heading block | `heading` level 1, centered, underlined | "TO WHOM IT MAY CONCERN" |
| 2 | Rich paragraph | `paragraph` | "This is to certify that {{employee.full_name_en}}, holding Employee Code {{employee.employee_code}}, is currently employed with {{company.legal_name_en}} as {{employee.designation}} in the {{employee.department}} Department." |
| 3 | Paragraph | `paragraph` | "The employee's details as per the company records are as follows:" |
| 4 | Sub-heading | `heading` level 2, bold underlined | "Employee Information" |
| 5 | Bulleted list (12 items) | `key_value_section` (preferred over raw list) | Name, Employee Code/ID, Designation/Position, Department, Company/Employer, Branch/Work Location, Date of Joining, Employment Type, Employment Status, Nationality, Passport Number, Emirates ID Number — each label bold + `{{binding}}` value |
| 6 | Sub-heading | `heading` level 2, bold underlined | "Salary Information" |
| 7 | Three lines | `key_value_section` | Basic Salary: AED {{employee.basic_salary}}; Total/Gross Salary: AED {{employee.total_salary}}; Net Salary: AED {{employee.net_salary}} |
| 8 | Paragraph | `paragraph` | Issuance statement referencing {{document.issue_date}} |
| 9 | Paragraph | `paragraph` | No-financial-guarantee disclaimer referencing {{company.legal_name_en}} |
| 10 | Closing block | `signature_block` (governed) | "For and on behalf of" + {{company.legal_name_en}} + protected stamp/signature placeholders |

## Variable Allowlist Required

```
employee.full_name_en, employee.employee_code, employee.designation,
employee.department, employee.owner_company, employee.branch,
employee.joining_date, employee.employment_type, employee.employment_status,
employee.nationality, employee.passport_number, employee.emirates_id_number,
employee.basic_salary*, employee.total_salary*, employee.net_salary*,
company.legal_name_en, document.issue_date
```

`*` = salary-sensitive: requires `hr.payroll.view` at generation time and must be
redacted from preview for users without that permission.

## Framing (outside body editing, governed by template settings)

- Company letterhead header (branding auto-resolved by `owner_company_id`)
- Footer with TRN/license/contact from branding profile
- QR verification block (inactive-token placeholder during authoring)
- Protected stamp/signature placeholders (server-side injection at issuance only)

## Fidelity Reference

Compare re-authored output against `template_15_reference_render.html` /
`template_15_reference_render_screenshot.png`. Wording must match
`template_15_wording_extraction.txt` exactly (fragments 01–55).
