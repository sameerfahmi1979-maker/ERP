# REPORT DESIGNER UX.3 — Restricted/Sensitive Field Governance & Official Output Controls
## Implementation Report

**Phase:** REPORT DESIGNER UX.3  
**Date:** 2026-07-04  
**Status:** IMPLEMENTED ✅  
**Build:** `tsc --noEmit` → clean (0 errors)

---

## Summary

UX.3 implements the governance layer that safely unlocks restricted and confidential report fields (salary, IBAN, passport, EID, visa) for **official output only**, under strict RBAC, template-type, and output-mode gates. No sensitive values are exposed in preview, test, or public QR verification contexts.

---

## Scopes Completed

### Scope A — Permission Migration
**File:** `supabase/migrations/20260704030000_report_designer_ux3_sensitive_field_permissions.sql`

Added two new permissions and seeded role assignments:

| Permission Code | Description | Roles |
|---|---|---|
| `reports.sensitive_fields.use` | Insert restricted/confidential fields into templates | system_admin, group_admin, hr_manager, finance_manager |
| `reports.sensitive_fields.approve` | Approve/publish templates containing sensitive fields | system_admin, group_admin |

---

### Scope B — Registry Governance Extensions

**`src/lib/report-designer/field-registry/types.ts`**
- Extended `ReportFieldRegistryEntry` with `maskingStrategy` (`hidden | stars | label`) and `fieldGroup` (`salary | banking | identity | visa | medical | general`)
- Added `FieldPickerContext` interface (`userPermissions`, `templateType`, `governanceStatus`)

**`src/lib/report-designer/field-registry/governance.ts`** (NEW)
- `ReportOutputMode` — `preview | test | official`
- `ReportRenderContext` — `outputMode`, `userPermissions`, `templateType`, `governanceStatus`
- `isRestrictedOrConfidentialField(path)` — sensitivity check by field path
- `isRegisteredSensitiveField(path)` — exact registry lookup
- `canFieldBeInsertedForTemplate(entry, ctx)` — gate for field picker insertability
- `getFieldInsertBlockReason(entry, ctx)` — human-readable block reason for UX
- `canFieldResolveInOutputMode(entry, ctx)` — gate for server-side resolver
- `getRestrictedFieldMask(entry, outputMode)` — masked placeholder string
- `getRestrictedFieldsFromPaths(paths)` — filter to restricted/confidential entries
- `buildSensitiveFieldAuditMetadata(opts)` — safe audit metadata builder

**`src/lib/report-designer/field-registry/registry-utils.ts`**
- Added `getRestrictedFieldEntries()` — list all restricted/confidential active entries
- Added `isRegisteredRestrictedField(path)` — lightweight boolean check
- Updated `isReportFieldPathAllowed(path)` — explicitly returns false for restricted/confidential fields

**`src/lib/report-designer/field-registry/index.ts`**
- Exports all new governance types and functions

---

### Scope C — Sensitive Field Registry Entries

**`src/lib/report-designer/field-registry/registry.ts`**

Added the following entries under the HR module:

| Field Path | Sensitivity | Allowed Template Types | Masking |
|---|---|---|---|
| `employee.basic_salary` | restricted | salary_certificate, offer_letter, termination_letter | label |
| `employee.total_salary` | restricted | salary_certificate, offer_letter, termination_letter | label |
| `employee.net_salary` | restricted | salary_certificate | label |
| `employee.last_salary` | restricted | salary_certificate, termination_letter | label |
| `employee.iban` | confidential | bank_confirmation_letter, salary_certificate | hidden |
| `employee.bank_account_number` | confidential | bank_confirmation_letter | hidden |
| `employee.passport_number` | restricted | government_forms, visa_letter, experience_letter | label |
| `employee.emirates_id_number` | restricted | government_forms, visa_letter | label |
| `employee.residence_visa_number` | restricted | government_forms, visa_letter | label |
| `employee.visa_expiry_date` | restricted | government_forms, visa_letter | label |
| `employee.medical_insurance_number` | confidential | isPlanned: true | hidden |

All restricted/confidential entries require `reports.sensitive_fields.use` permission and `official` output mode.

---

### Scope D — Field Picker Restricted Unlock Behavior

**`src/features/report-designer/field-picker/field-picker-context.tsx`** (NEW)
- `FieldPickerContextProvider` — React context provider wrapping the editor
- `useFieldPickerContext()` — hook to read `userPermissions` and `templateType`

**`src/features/report-designer/field-picker/report-field-picker.tsx`** (REWRITTEN)
- `FieldRow` now calls `canFieldBeInsertedForTemplate(entry, { userPermissions, templateType })`
- Restricted fields that **pass** the governance gate render with an amber `ShieldAlert` icon and an inline note: *"Restricted — requires approval to publish"*
- Restricted fields that **fail** the gate render as locked/disabled with `getFieldInsertBlockReason` as tooltip
- Planned fields remain locked with "Coming soon" tooltip

**`src/features/report-designer/report-designer-editor-client.tsx`**
- Added `userPermissions?: string[]` prop
- Wraps both Puck shell and test panel in `<FieldPickerContextProvider>` with `templateType` and `governanceStatus`

**`src/app/(protected)/admin/reports/editor/[templateId]/page.tsx`**
- Passes `userPermissions={ctx.permissionCodes}` from server to the client component

---

### Scope E — Security Review Enforcement

**`src/lib/report-designer/visual-template-security-review.ts`**
- Added `template_type?: string | null` to `VisualTemplateSecurityReviewInput`
- Split `SENSITIVE_BINDING_FRAGMENTS` into:
  - `ALWAYS_BLOCK_BINDING_FRAGMENTS` — credentials, service_role, api_key (always blocked)
  - `GOVERNANCE_SENSITIVE_BINDING_FRAGMENTS` — salary, iban, passport, eid, visa, insurance
- `validateBindingsInText` and `validateBindingsInRichContent` now perform governance-aware checks:
  - If registered sensitive field + allowed template type → `warning (restricted_field_elevated_approval_required)`
  - If registered sensitive field + not allowed template type → `blocking (restricted_field_template_type_not_allowed)`
  - If registered sensitive field + no template type → `warning (restricted_field_template_type_unknown)`
  - If unknown sensitive fragment → `blocking (sensitive_binding_path)`
- `reviewVisualLayoutZone`, `scanBlockBindings`, `reviewVisualTemplateLayoutSecurity` — all pass `templateType` through
- Final summary governance warning added: `sensitive_fields_require_elevated_approval`

**`src/lib/template-governance/security-review.ts`**
- Extended `TemplateContentFields` interface with `template_type?: string | null`
- Updated `require()` cast to include `template_type` in visual review input type
- Passes `fields.template_type` to `reviewVisualTemplateLayoutSecurity`

**`src/server/actions/reports/template-governance.ts`**
- Both `submitTemplateForReview` and `runTemplateSecurityReviewAction` now SELECT `template_type` and pass it to the review
- `approveTemplate` enforces `reports.sensitive_fields.approve` permission when `security_review_notes` contains sensitive warnings
- `publishTemplate` enforces `reports.sensitive_fields.approve` permission at publish time too
- Imports `getRestrictedFieldsFromPaths` from field-registry

---

### Scope F — Preview/Test Masking

**`src/lib/report-designer/sensitive-field-masking.ts`** (NEW)
- `maskSensitiveBindingValues(values, context)` — masks all restricted/confidential fields unless official gates pass
- `applyDefensiveRestrictedMasking(values, outputMode)` — defensively masks ALL registered restricted paths in non-official output

**`src/lib/report-designer/test-data-resolver.ts`**
- Added `emirates_id` and `residence_visa` to `SENSITIVE_KEY_FRAGMENTS`
- `redactDesignerTestBindingValues` now calls `applyDefensiveRestrictedMasking` after keyword-based redaction for complete coverage

---

### Scope G — Official Output Unlock Flow

**`src/lib/report-designer/sensitive-field-masking.ts`**
- `resolveEmployeeIdentityDocuments(employeeId, supabase)` — fetches passport, EID, visa from `employee_identity_documents JOIN hr_identity_document_types`
- `resolveEmployeeWpsProfile(employeeId, supabase)` — fetches IBAN and account number from `employee_wps_profiles`
- `resolveEmployeeSalaryFields(employeeId, supabase)` — stub resolver (payroll calculation requires future phase)
- `resolveOfficialSensitiveFields(opts)` — orchestrates all resolvers, gates on `outputMode === "official"`, returns only requested paths

**`src/lib/report-designer/field-registry/governance.ts`**
- `canFieldResolveInOutputMode(field, context)` — validates outputMode, userPermissions, templateType, and governanceStatus gates

---

### Scope H — Audit Logging

**`src/lib/report-designer/sensitive-field-masking.ts`**
- `resolveOfficialSensitiveFields` now accepts optional `auditMeta` (`templateId`, `templateCode`, `issuedByProfileId`)
- After successful resolution, calls `writeSensitiveFieldAuditLog` which inserts into `audit_logs`:
  - `action: "official_sensitive_field_resolution"`
  - `new_values`: `{ resolved_field_count, resolved_field_paths, employee_id, output_mode, template_type, permissions_active, issued_at }`
  - **NO sensitive values are ever logged**
- Audit failure is caught silently — never blocks document generation

---

### Scope I — QR Verification Protection

Confirmed existing `src/lib/public-verification/sanitizer.ts` blocks all sensitive keys via:
- `BLOCKED_KEY_PATTERNS` covering: salary, wage, payroll, iban, bank_account, account_number, swift, passport, eid, national_id, medical, health, insurance, plus credentials and internal paths
- `sanitizePublicPayload` + `buildVerificationSummary` enforce strict allowlist on all public verification data
- **No new code required for UX.3**

---

### Scope J — UX Messages and Warnings

**`src/features/report-center/template-governance-actions.tsx`**
- `handleRunSecurityReview` now reads `findings` to detect UX.3-specific rules:
  - `restricted_field_elevated_approval_required` / `sensitive_fields_require_elevated_approval` → `toast.warning` with actionable message: *"Template requires reports.sensitive_fields.approve to publish"*
  - `restricted_field_template_type_not_allowed` → `toast.error` with specific message about template type
- Error messages clearly explain what permission is needed and what action to take

---

## Security Architecture Summary

```
FIELD PICKER                    SECURITY REVIEW               OFFICIAL RESOLVER
─────────────                   ───────────────               ─────────────────
FieldPickerContext               template_type aware           resolveOfficialSensitiveFields
  userPermissions  ──────────► canFieldBeInsertedForTemplate  ├── requireOfficialMode gate
  templateType     ──────────► governance-aware warn/block    ├── canFieldResolveInOutputMode
                                                              ├── resolveEmployeeIdentityDocs
                                                              ├── resolveEmployeeWpsProfile
MASKING (preview/test)          APPROVAL GATES                ├── resolveEmployeeSalaryFields (stub)
─────────────────               ──────────────                └── writeSensitiveFieldAuditLog
applyDefensiveRestrictedMasking approveTemplate:
maskSensitiveBindingValues        check sensitive_review_notes
redactDesignerTestBindingValues   enforce reports.sensitive_fields.approve
                                publishTemplate:
                                  same enforcement
```

---

## Non-Negotiable Rules Verified

| Rule | Status |
|---|---|
| No DB migration unless absolutely required | ✅ Only permission rows added (no schema changes) |
| No automatic DB column scanning | ✅ All fields are explicit allowlist entries |
| No arbitrary SQL | ✅ All queries use Supabase client with specific column lists |
| No sensitive field unlocks in preview/test | ✅ `applyDefensiveRestrictedMasking` + `maskSensitiveBindingValues` ensure masking |
| QR public verification never exposes sensitive values | ✅ `sanitizer.ts` BLOCKED_KEY_PATTERNS confirmed |
| Audit never logs sensitive values | ✅ Only metadata logged (paths, counts, output_mode, permissions) |
| Official output requires all 3 gates | ✅ outputMode === "official" + permission check + template type check in `canFieldResolveInOutputMode` |

---

## Files Changed

### New Files
- `src/lib/report-designer/field-registry/governance.ts`
- `src/lib/report-designer/sensitive-field-masking.ts`
- `src/features/report-designer/field-picker/field-picker-context.tsx`
- `supabase/migrations/20260704030000_report_designer_ux3_sensitive_field_permissions.sql`

### Modified Files
- `src/lib/report-designer/field-registry/types.ts`
- `src/lib/report-designer/field-registry/registry.ts`
- `src/lib/report-designer/field-registry/registry-utils.ts`
- `src/lib/report-designer/field-registry/index.ts`
- `src/lib/report-designer/visual-template-security-review.ts`
- `src/lib/report-designer/test-data-resolver.ts`
- `src/lib/template-governance/security-review.ts`
- `src/server/actions/reports/template-governance.ts`
- `src/features/report-designer/field-picker/report-field-picker.tsx`
- `src/features/report-designer/field-picker/index.ts`
- `src/features/report-designer/report-designer-editor-client.tsx`
- `src/app/(protected)/admin/reports/editor/[templateId]/page.tsx`
- `src/features/report-center/template-governance-actions.tsx`

---

## Known Limitations / Future Work

1. **Salary resolver is a stub** — `resolveEmployeeSalaryFields` returns placeholder text. Full salary calculation (join `employee_salary_components + hr_salary_component_types`, sum by type) requires a dedicated payroll resolver phase.
2. **`employee.medical_insurance_number`** — marked `isPlanned: true`. No resolver implemented yet.
3. **`reports.sensitive_fields.use` not yet checked in server action for template save** — field picker blocks insertion client-side, but the save action does not validate the list of fields against user permissions. This is intentional (security review catches it at submit/approve time).
4. **Official output integration** — `resolveOfficialSensitiveFields` is fully implemented but must be wired into the actual letter/report generation server action (e.g., `hr-letter-generator`) in a future phase when official output is triggered.
