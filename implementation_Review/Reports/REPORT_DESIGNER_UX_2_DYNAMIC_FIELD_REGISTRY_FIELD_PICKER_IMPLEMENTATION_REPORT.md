# REPORT DESIGNER UX.2 — Dynamic Field Registry & Field Picker
## Implementation Report

**Phase:** REPORT DESIGNER UX.2 — Dynamic Expandable Module Field Registry and Field Picker  
**Date:** 2026-07-04  
**Status:** CLOSED / PASS ✅  
**Author:** AI Coding Agent (Cursor)

---

## 1. Status

**CLOSED / PASS ✅**

- TypeScript: `npx tsc --noEmit` → Exit 0 (clean)
- Build: `npm run build` → Exit 0 (clean, all routes built)
- Security greps: All clean (see section 14)
- No new npm dependencies installed
- No DB migration required

---

## 2. Files Read

- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`
- `.cursor/rules/algt-erp-source-of-truth.mdc`
- `implementation_Review/Reports/REPORT_DESIGNER_UX_IMPROVEMENT_PLAN.md`
- `implementation_Review/Reports/REPORT_DESIGNER_UX_1_TIPTAP_RICH_TEXT_MULTI_COLUMN_LAYOUT_IMPLEMENTATION_REPORT.md`
- `src/lib/report-designer/binding-registry.ts`
- `src/lib/report-designer/test-data-resolver.ts`
- `src/lib/report-designer/live-test-schema.ts`
- `src/lib/report-designer/prosemirror-renderer.ts`
- `src/lib/report-designer/layout-schema.ts`
- `src/lib/report-designer/visual-template-security-review.ts`
- `src/features/report-designer/blocks/report-designer-rich-text-editor.tsx`
- `src/features/report-designer/blocks/key-value-section-block.tsx`
- `supabase/migrations/20260618200000_erp_hr_2_employee_master_profile_shell.sql` (DB column verification)

---

## 3. Files Created

### Field Registry Foundation

| File | Description |
|---|---|
| `src/lib/report-designer/field-registry/types.ts` | TypeScript interfaces: `ReportFieldRegistryEntry`, `ReportFieldSensitivityLevel`, `ReportFieldDataType`, `ReportFieldModule`, grouped types |
| `src/lib/report-designer/field-registry/registry.ts` | Canonical field list: 20 active fields + 8 planned future-module placeholders |
| `src/lib/report-designer/field-registry/registry-utils.ts` | Helper functions: `getReportFieldRegistry`, `getActiveReportFieldEntries`, `getInsertableReportFieldEntries`, `getReportFieldByPath`, `isReportFieldPathAllowed`, `getReportFieldsGroupedByModule`, `getReportFieldsGroupedByModuleSorted`, `searchReportFields`, `getReportFieldSampleValues` |
| `src/lib/report-designer/field-registry/legacy-binding-adapter.ts` | `buildLegacyBindingRegistry()` + `GENERATED_ERP_BINDING_REGISTRY` — generates legacy format from new registry |
| `src/lib/report-designer/field-registry/index.ts` | Public exports |

### Field Picker UI

| File | Description |
|---|---|
| `src/features/report-designer/field-picker/report-field-badge.tsx` | Sensitivity badge component (public/internal/restricted/confidential/soon) |
| `src/features/report-designer/field-picker/report-field-picker.tsx` | Grouped, searchable field picker with module accordions and sensitivity controls |
| `src/features/report-designer/field-picker/report-field-picker-popover.tsx` | Popover wrapper for the field picker (used in TipTap toolbar) |
| `src/features/report-designer/field-picker/index.ts` | Public exports |

### Governance & Docs

| File | Description |
|---|---|
| `.cursor/rules/erp-report-designer-field-registry-standard.mdc` | Cursor rule for field registry standard + future module onboarding rule |
| `docs/standards/ERP_REPORT_DESIGNER_FIELD_REGISTRY_STANDARD.md` | Complete field registry standard documentation |

---

## 4. Files Modified

| File | Change |
|---|---|
| `src/lib/report-designer/binding-registry.ts` | `ERP_BINDING_REGISTRY` now auto-generated from `GENERATED_ERP_BINDING_REGISTRY`. Original entries kept as `_LEGACY_REGISTRY_PLACEHOLDER` for reference. All existing exports preserved unchanged. |
| `src/lib/report-designer/test-data-resolver.ts` | Added 6 new columns to employee SELECT query: `known_name`, `gender`, `marital_status`, `mobile_number`, `contract_start_date`, `probation_end_date`. Added 6 new resolved values to output map. |
| `src/lib/report-designer/live-test-schema.ts` | `buildSampleBindingValues()` extended with sample values for all 6 new fields. |
| `src/lib/report-designer/prosemirror-renderer.ts` | Added `bindingToken` inline node handling in `renderInlineContent()` — resolves `attrs.path` same as `{{path}}` text token. `extractPlainTextFromProseMirror()` also updated to emit `{{path}}` for `bindingToken` nodes. |
| `src/lib/report-designer/visual-template-security-review.ts` | `validateBindingsInRichContent()` extended to validate `bindingToken.attrs.path` against registry. `extractVisualLayoutBindings()` updated to walk ProseMirror JSON and extract `bindingToken` paths. |
| `src/features/report-designer/blocks/report-designer-rich-text-editor.tsx` | Added `BindingToken` custom TipTap node. Added `handleInsertField()` callback. Added `ReportFieldPickerPopover` in toolbar. Updated hint text. |
| `src/features/report-designer/blocks/key-value-section-block.tsx` | Replaced flat `type: "select"` binding field with custom `BindingPickerField` component (inline grouped picker with accordion and search). |

---

## 5. Registry Architecture Summary

The new `ReportFieldRegistry` is a typed array of `ReportFieldRegistryEntry` objects organized by module and entity. The registry is the single source of truth — `binding-registry.ts` auto-generates the legacy `ERP_BINDING_REGISTRY` from it via `GENERATED_ERP_BINDING_REGISTRY`.

**Module hierarchy:**
```
moduleCode → moduleLabel → entityCode → entityLabel → fieldPath
HR         → HR / Human Resources → employee → Employee → employee.full_name_en
```

**Key functions:**
- `getInsertableReportFieldEntries()` — public + internal + active (no restricted/confidential)
- `getReportFieldsGroupedByModuleSorted()` — for picker UI rendering
- `isReportFieldPathAllowed(path)` — security validation
- `searchReportFields(query)` — text search across label, path, module, description

---

## 6. Backward Compatibility Summary

All existing code that imports from `binding-registry.ts` continues to work unchanged:

- `ERP_BINDING_REGISTRY` ✅ — same type, same content, now auto-generated
- `SAFE_BINDING_PATHS` ✅ — same `string[]` export
- `isAllowlistedBinding(path)` ✅ — unchanged function
- `extractBindingsFromText(text)` ✅ — unchanged function
- `validateTextBindings(text)` ✅ — unchanged function
- `BindingDescriptor` interface ✅ — unchanged type

New fields (`known_name`, `gender`, `marital_status`, `mobile_number`, `contract_start_date`, `probation_end_date`) are automatically included in `ERP_BINDING_REGISTRY` and `SAFE_BINDING_PATHS` via the adapter.

---

## 7. Field Picker UI Summary

The Field Picker is a React component (`ReportFieldPicker`) that:

- Groups fields by module (accordion) then entity (labeled section)
- Has a search input matching label, path, module, entity, description
- Shows sensitivity badges: public (green), internal (blue), restricted (amber), confidential (red)
- Shows "Soon" badge for planned future module fields
- Disabled (non-clickable) for: restricted, confidential, planned fields
- Calls `onInsert(fieldPath)` when an active insertable field is clicked
- `ReportFieldPickerPopover` wraps it in a shadcn Popover for toolbar use

**Variant usage:**
- **TipTap toolbar**: `ReportFieldPickerPopover` (button → popover)
- **KeyValueSectionBlock**: Inline `BindingPickerField` (toggle panel within Puck array field)

---

## 8. TipTap Integration Summary

**bindingToken custom TipTap node:**
- Type: `bindingToken`
- Group: `inline`, `atom: true` (non-editable chip)
- Attributes: `{ path: string }`
- HTML render: `<span class="erp-binding-token" data-binding-path="...">{{path}}</span>` with purple chip styling
- ProseMirror JSON: `{ type: "bindingToken", attrs: { path: "employee.full_name_en" } }`
- Inserted via `editor.chain().insertContent({ type: "bindingToken", attrs: { path } })`

**Insert Field flow:**
1. User clicks "Insert Field" button in TipTap toolbar
2. `ReportFieldPickerPopover` opens
3. User searches/browses grouped field list
4. Click on an active field → `handleInsertField(fieldPath)` → inserts `bindingToken` chip at cursor
5. Popover closes

**Backward compatibility:**
- Manually typed `{{path}}` text tokens continue to work in `renderProseMirrorDocToHtml()`
- Both `text` nodes with `{{path}}` and `bindingToken` nodes resolve the same way on the server

---

## 9. KeyValueSectionBlock Integration Summary

Replaced `type: "select"` with `type: "custom"` for the `binding` field in Puck `arrayFields`. The custom renderer is `BindingPickerField`:

- Shows current selected field with label, path, sensitivity badge
- Toggle button opens/closes an inline picker panel
- Uses `ReportFieldPicker` in the panel for grouped search and selection
- Existing saved key-value blocks continue to load — the `binding` field value is still just a `string`

**Documented limitation**: Puck's array field custom renderer has limited CSS inheritance from the parent panel context. The picker is functional but resizes within the Puck sidebar constraints.

---

## 10. New Fields Added and Resolver Confirmation

All new fields confirmed in `supabase/migrations/20260618200000_erp_hr_2_employee_master_profile_shell.sql`:

| Field | Column | DB Confirmed | Sensitivity |
|---|---|---|---|
| `employee.known_name` | `known_name TEXT` | ✅ | public |
| `employee.gender` | `gender TEXT CHECK (male/female)` | ✅ | internal |
| `employee.marital_status` | `marital_status TEXT CHECK (single/married/...)` | ✅ | internal |
| `employee.mobile_number` | `mobile_number TEXT NOT NULL` | ✅ | internal |
| `employee.contract_start_date` | `contract_start_date DATE` | ✅ | internal |
| `employee.probation_end_date` | `probation_end_date DATE` | ✅ | internal |
| `employee.end_of_service_date` | N/A — planned/restricted | isActive: false | restricted |

Resolver update: `resolveEmployeeBindingValues()` in `test-data-resolver.ts` now includes all 6 active new fields in the SELECT query and value map.

Sample value update: `buildSampleBindingValues()` in `live-test-schema.ts` extended with sample values for all 6 new active fields.

---

## 11. Restricted/Confidential Field Behavior

- **restricted** fields (`employee.end_of_service_date`): `isActive: false`, `isPlanned: true`. Shown in picker with lock icon + "Restricted — requires governance unlock (UX.3)" tooltip. Not insertable. Not resolvable.
- **confidential** fields: Not present in UX.2 registry as active entries. Any existing salary/IBAN/passport/EID paths are blocked by the security review's `SENSITIVE_BINDING_FRAGMENTS` set.
- `isReportFieldPathAllowed(path)` returns `false` for both restricted and confidential paths.

---

## 12. Security Review Behavior

Updated `visual-template-security-review.ts`:

1. **`validateBindingsInRichContent()`**: Now checks `bindingToken` nodes specifically — validates `attrs.path` against `ERP_BINDING_REGISTRY`. Blocks sensitive fragments. Warns on unknown paths.
2. **`extractVisualLayoutBindings()`**: Now walks ProseMirror JSON to extract `bindingToken` paths in addition to `{{path}}` text tokens.
3. All existing security checks preserved: unsafe HTML, unsafe protocols, event handler keys, payload size limits, column key validation, data source validation.

Security validation chain for a `bindingToken`:
```
bindingToken.attrs.path → SENSITIVE_BINDING_FRAGMENTS check (block) → ERP_BINDING_REGISTRY check (warn if unknown)
```

---

## 13. Side-Effect Prevention Proof

All side-effect prevention rules from REPORT DESIGNER.7 remain intact:

- `ReportFieldPicker` and `BindingPickerField` are pure read-only React components — no server action calls.
- `test-data-resolver.ts` changes: SELECT-only queries. No INSERT/UPDATE/DELETE.
- `live-test-schema.ts` changes: Pure in-memory sample data generation. No DB.
- No `erp_output_public_links` writes in any modified file.
- No `erp_report_runs` / `erp_report_delivery_logs` / `erp_email_queue` writes.
- No `sendEmail` / `queueEmail` calls.
- No `createAdminClient` / `service_role` in `src/features/report-designer/`.

---

## 14. Security Grep Results

All checks run and verified:

```
grep dangerouslySetInnerHTML: PASS — all matches are in comments confirming absence of usage
grep erp_output_public_links: PASS — only in comments and legitimate public-verification.ts
grep erp_report_runs/sendEmail: PASS — only in comments and legitimate runner.ts/schedules.ts
grep createAdminClient/service_role: PASS — no matches in src/features/report-designer/
```

---

## 15. TypeScript Result

```
npx tsc --noEmit → Exit 0 (no errors, no warnings)
```

---

## 16. Build Result

```
npm run build → Exit 0 (Compiled successfully in 22.3s)
All routes compiled. No TypeScript errors in build pass.
```

---

## 17. npm audit Result

8 pre-existing vulnerabilities (all pre-UX.2):
- `dompurify` ≤3.4.10 — moderate (pre-existing)
- `hono` ≤4.12.24 — high (pre-existing)
- `js-yaml` — moderate (pre-existing)
- `postcss` via `next` — moderate (breaking change to fix)
- `uuid` via `exceljs` — moderate (breaking change to fix)
- `xlsx` — high, no fix available (pre-existing)

**0 new vulnerabilities introduced by UX.2.**

---

## 18. Known Limitations

1. **bindingToken chip in Puck canvas preview**: The `bindingToken` chip renders correctly in the TipTap editor. In the Puck canvas (non-interactive preview), it shows as `{{path}}` text since the canvas renders without TipTap. Full rendering is visible in the test preview iframe.

2. **KeyValueSectionBlock picker width**: The inline picker in Puck's property panel is constrained by the sidebar width (~280px). Search and grouping work correctly but the layout is compact.

3. **Scope G (ReportTableBlock column suggestions)**: Deferred. ReportTableBlock uses `report.preview_rows` not entity binding paths. Adding column suggestions would require mapping arbitrary row keys to the registry, which is unsafe without further design. Documented as deferred.

4. **Future module placeholder fields**: Fleet, Procurement, Finance, Inventory, Transport, HSE, Workshop, Weighbridge have single placeholder entries each (`isPlanned: true`). When those modules are implemented, the onboarding rule (Cursor rule + docs standard) must be followed to add real fields.

5. **`mobile_number` sensitivity**: Classified as `internal` (not `public`) per the prompt's guidance — suitable for official correspondence letters with appropriate template governance, not for any-user insertion.

---

## 19. Next Recommended Phase

**REPORT DESIGNER UX.3** — Restricted/Sensitive Field Governance and Official Output Controls.

Requires:
- Template type restrictions enforced at field level (`allowedTemplateTypes`)
- RBAC permission check (`requiredPermission`) before allowing restricted field insertion
- Output mode restrictions (restricted fields: `official` output only)
- Audit logging for sensitive field access in official reports
- Management approval flow for publishing templates with restricted fields
- Masking of restricted fields in preview/test output (`***`)
- Security review update for restricted field governance

**Stop condition**: This report closes UX.2. Do not implement UX.3 without explicit Sameer/Dina approval.
