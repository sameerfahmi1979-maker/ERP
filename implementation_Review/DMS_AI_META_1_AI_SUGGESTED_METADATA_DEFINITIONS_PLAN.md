# DMS AI META.1 — AI-Suggested Metadata Definitions Plan
## 1. Executive Summary

Phase DMS AI META.1 adds an AI-assisted workflow to the DMS Admin Metadata Definitions screen. Authorized admins can click a button to generate AI-suggested metadata field definitions for any document type. Suggestions are presented in a review dialog where the admin can edit, deselect, or accept individual fields before any data is saved. The existing `createDmsMetadataDefinition` server action is used for each accepted field. No auto-save. No DB migration. No RLS change.

## 2. Planning Scope and Non-Implementation Rule

This is a PLANNING-ONLY document. No source code is modified. No migrations are created. No RLS is changed. No AI provider is called. No permissions are added. This plan is to be reviewed by Sameer and uploaded to ChatGPT before any implementation begins.

## 3. Current System Findings

### Document Types and Definition Coverage (Live DB)
- 12 document types have at least 1 metadata definition (max: 15 for VISA)
- 30+ document types have ZERO definitions, including:
  ADNOC_ATA, ADNOC_GATE_PASS, AOA, BANK_GUARANTEE, BANK_LETTER, BANK_STATEMENT_AR,
  BIRTH_CERTIFICATE, CALIBRATION_CERTIFICATE, CHAMBER_OF_COMMERCE, CICPA_PASS,
  COMMERCIAL_REGISTER_AR, COMPANY_PROFILE_AR, CONTRACT, CV, DELIVERY_NOTE,
  EJARI_CONTRACT, EMPLOYEE_PHOTO, EQUIPMENT_REGISTRATION, and many more.
- Total: 114 definitions across the 12 typed document types.

### Document Types with Well-Defined Fields (Reference Candidates for Few-Shot)
| Type Code | Name | Definition Count |
|---|---|---|
| VISA | Visa | 15 |
| DRIVING_LICENSE | Driving License | 12 |
| LABOR_CARD_AR | Labor Card / Work Permit Card | 12 |
| LABOUR_CARD | Labour Card | 12 |
| MEDICAL_INSURANCE | Medical Insurance | 10 |
| PROJECT_CONTRACT | Project Contract | 10 |
| PASSPORT_COPY | Passport Copy | 8 |
| EMIRATES_ID | Emirates ID | 6 |

Best few-shot candidates: EMIRATES_ID (6 concise fields) and PASSPORT_COPY (8 fields). These are clean, well-understood document types with clear real-world fields.

### Schema: dms_metadata_definitions
Verified AI-ready columns:
- `ai_field_hint` (VARCHAR 500) — instruction for AI extraction
- `ai_possible_labels_en` (JSONB string array) — label variants AI may encounter
- `ai_keywords` (JSONB string array) — positive keywords to aid extraction
- `ai_negative_keywords` (JSONB string array) — negative keywords
- `ai_expected_format` (VARCHAR 200) — e.g. "DD/MM/YYYY"
- `ai_example_values` (JSONB string array) — sample values
- `is_ai_extractable` (BOOLEAN) — flag for AI extraction

No schema changes are needed. The table already handles all fields the AI will suggest.

### ALLOWED_FIELD_TYPES (from dms-constants.ts)
The full allowed set is (19 types):
text, textarea, number, date, datetime, boolean, select, multi_select, party_ref,
employee_ref, vehicle_ref, equipment_ref, project_ref, currency, country_ref,
region_ref, city_ref, area_ref, json

AI suggestions will be limited to the safe subset: text, date, number, boolean, currency
(select/multi_select are excluded from AI suggestions because they require options_json).

### Permission Code: dms.documents.manage_types — VERIFIED
Queried live DB. The permission `dms.documents.manage_types` EXISTS and is active.
It is used by `createDmsMetadataDefinition`, `updateDmsMetadataDefinition`,
`getDmsMetadataDefinition`, `reorderDmsMetadataDefinitions`, and the `canManage()`
check in `dms-metadata-definitions-table.tsx`.
This is the correct and verified permission for DMS metadata definition management.

### canManage() Logic (from dms-metadata-definitions-table.tsx)
```
dms.documents.manage_types OR dms.admin OR system_admin role OR group_admin role
```
The server action must mirror this same check.

## 4. Existing Files, Actions, Schema, and AI Infrastructure Reviewed

### Files Verified
| File | Purpose |
|---|---|
| `src/features/dms/admin/dms-metadata-definitions-table.tsx` | Host component; toolbar with "Add Field" button; uses ERPChildDialogForm |
| `src/features/dms/admin/dms-constants.ts` | ALLOWED_FIELD_TYPES (19 types), ALLOWED_ENTITY_TYPES |
| `src/features/dms/admin/dms-metadata-definition-form-body.tsx` | Reusable form body for add/edit (NOT to be reused in AI dialog) |
| `src/server/actions/dms/metadata-definitions.ts` | createDmsMetadataDefinition, updateDmsMetadataDefinition, etc. |
| `src/lib/dms/metadata/metadata-definition-shared.ts` | DmsMetadataDefinitionBase type, mapMetadataDefinitionRow, DMS_METADATA_DEFINITION_SELECT |
| `src/app/(protected)/admin/dms/metadata-definitions/page.tsx` | Page; auth gate: dms.documents.view OR dms.admin |
| `src/lib/dms/ai/factory.ts` | getDmsAiProvider() — returns best available provider (never throws) |
| `src/lib/dms/ai/openai-dms-adapter.ts` | callStructuredCompletion(systemPrompt, userPrompt, opts) |
| `src/lib/ai/common/provider-bridge.ts` | callCommonAiStructuredCompletion() — wrapper over getDmsAiProvider |
| `src/lib/ai/providers/factory.ts` | getAiProvider(configCode) — ERP Settings.1 factory |
| `src/lib/ai/providers/types.ts` | AiProviderInterface, AiProviderConfig, AiOperationType |

### The Correct AI Call Pattern
The provider bridge at `src/lib/ai/common/provider-bridge.ts` is the correct entry point.
It calls `getDmsAiProvider()` from `src/lib/dms/ai/factory.ts` which:
1. Tries config codes: DEFAULT_DMS_CLASSIFIER, DEFAULT_DMS_EXTRACTOR, DEFAULT_CHAT
2. Returns a configured provider or a NoopDmsAiProvider (never throws)
3. `provider.isConfigured()` returns false for NoopDmsAiProvider

The function signature to call:
```typescript
callCommonAiStructuredCompletion(systemPrompt: string, userPrompt: string, opts?: { maxTokens?: number; temperature?: number })
// Returns: CommonAiCallOutcome = { success: true, rawJson: string, model, tokens... } | { success: false, error, isProviderNotConfigured }
```

This is the ONLY correct call pattern. No direct OpenAI SDK imports. No direct fetch calls.

## 5. User Flow

```
Admin navigates to: Administration ? DMS Admin ? Metadata Definitions

Admin filters by document type (or views all).

For document types visible in the toolbar, admin clicks one of:
  - "Suggest Fields with AI"    (if the filtered type has 0 definitions)
  - "Suggest Additional Fields" (if the filtered type has 1+ definitions)
  - Both buttons are only shown when filterTypeId is set to a specific type (not "all")
  - When "all" is selected in the type filter, button is hidden (ambiguous target)

On click:
  - Button enters loading state: spinner + "Analyzing..."
  - Server action suggestMetadataDefinitions(documentTypeId) is called

Server action runs (server-side only):
  1. Auth check
  2. Fetch document type info
  3. Fetch existing definitions for this type
  4. Fetch few-shot reference examples (EMIRATES_ID, PASSPORT_COPY)
  5. Build AI prompt
  6. Call AI via callCommonAiStructuredCompletion()
  7. Parse and validate JSON response (Zod)
  8. Normalize field_codes
  9. Remove duplicates and reserved field codes
  10. Assign sort_order continuation
  11. Log audit: DMS_AI_METADATA_SUGGESTION_GENERATED
  12. Return suggestions (nothing saved)

Review dialog opens showing the suggested fields.

Admin reviews each row:
  - Checkbox: include/exclude
  - Field Code: read-only (normalized, shown as monospace)
  - Field Label: inline editable (Input)
  - Field Type: inline dropdown (text, date, number, boolean, currency)
  - Required: inline toggle (Switch)
  - AI Extractable: inline toggle (Switch)
  - AI Hint: shown as muted text, optionally expandable per row
  - Reasoning: shown as muted text below the label (NOT saved)
  - Error: if creation later fails, row shows error text

Footer:
  Left: "X of Y fields selected"
  Right: [Cancel] [Accept & Create Selected (X)]

On "Accept & Create Selected":
  - Calls createDmsMetadataDefinition for each selected field
  - Results tracked per-row
  - Success: row gets green check
  - Failure: row stays with red error message
  - Dialog closes ONLY when all selected rows succeed (or admin manually cancels)

Toast on success: "12 fields created for Driving License"
Toast on partial: "8 fields created, 2 failed — see dialog for details"
```

## 6. Permission and Access Control Plan

### Permission Code: dms.documents.manage_types (VERIFIED in DB)
This is the correct real permission. It exists, is active, and is used by all existing
metadata definition management server actions.

### Server Action Guard (suggestMetadataDefinitions)
```typescript
const ctx = await getAuthContext();
const canManage =
  hasPermission(ctx, "dms.documents.manage_types") ||
  hasPermission(ctx, "dms.admin") ||
  ctx.roleCodes?.includes("system_admin") ||
  ctx.roleCodes?.includes("group_admin");
if (!canManage) return { success: false, error: "Permission denied" };
```
This mirrors the existing canManage() check in the UI component exactly.

### UI Button Visibility
The "Suggest Fields with AI" button is only rendered when `canManage(authContext)` is true
(same check used for the "Add Field" button). This is already evaluated at component render.

### AI Provider Unavailable
If the AI provider is not configured, the button is rendered as DISABLED (not hidden)
with a tooltip: "AI provider not configured. Contact administrator."
The `isConfigured` check is surfaced to the client via a new server action:
`checkDmsAiProviderAvailable(): Promise<{ available: boolean; providerName?: string }>`
This action can be called once on page mount and cached.

### No New Permission Needed
The existing `dms.documents.manage_types` covers the AI suggestion workflow.
Creating a new permission for AI suggestions is deferred to a future approved phase.

## 7. Server Action Plan

### New File: src/server/actions/dms/ai-metadata-suggestions.ts

```typescript
"use server";

// Exports:
export type AiSuggestedField = {
  field_code: string;
  field_label_en: string;
  field_type: "text" | "date" | "number" | "boolean" | "currency";
  is_required: boolean;
  is_ai_extractable: boolean;
  ai_field_hint: string;
  ai_example_values: string[];
  sort_order: number;
  reasoning: string; // display-only, not saved
};

export type SuggestMetadataDefinitionsResult =
  | { success: true; suggestions: AiSuggestedField[]; documentTypeName: string; existingCount: number; model: string | null }
  | { success: false; error: string; isProviderNotConfigured?: boolean };

export async function suggestMetadataDefinitions(
  documentTypeId: number
): Promise<SuggestMetadataDefinitionsResult>

export type AiProviderAvailableResult = {
  available: boolean;
  providerName?: string;
};

export async function checkDmsAiProviderAvailable(): Promise<AiProviderAvailableResult>
```

### suggestMetadataDefinitions — Step-by-Step

Step 1: Auth check
  getAuthContext() ? canManage check (same as existing) ? return error if denied

Step 2: Validate input
  documentTypeId must be a positive integer

Step 3: Fetch document type
  Query dms_document_types: id, type_code, name_en, description
  Error if not found

Step 4: Fetch existing definitions for this document type
  Query dms_metadata_definitions WHERE document_type_id = ? AND deleted_at IS NULL
  Select: field_code, field_label_en, sort_order
  Used for: duplicate prevention + sort_order continuation

Step 5: Fetch few-shot reference examples
  Query: SELECT type_code, field_code, field_label_en, field_type, is_required, is_ai_extractable, ai_field_hint
  FROM dms_metadata_definitions
  JOIN dms_document_types ON ...
  WHERE type_code IN ('EMIRATES_ID', 'PASSPORT_COPY')
  AND deleted_at IS NULL AND is_active = true
  ORDER BY sort_order
  Limit to top 8 per type for prompt brevity

Step 6: Build AI prompt (see Section 8)

Step 7: Call AI
  const outcome = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, { maxTokens: 2000, temperature: 0 })
  If !outcome.success ? return { success: false, error: outcome.error, isProviderNotConfigured: outcome.isProviderNotConfigured }

Step 8: Parse JSON
  JSON.parse(outcome.rawJson) — wrapped in try/catch
  If parse fails ? return { success: false, error: "AI returned an invalid response. Please try again." }

Step 9: Zod validate (see Section 9)

Step 10: Normalize field_codes (see Section 10)

Step 11: Remove duplicates (see Section 11)

Step 12: Assign sort_order (see Section 12)

Step 13: Log audit
  logAudit({
    module_code: "DMS",
    entity_name: "dms_metadata_definitions",
    entity_id: documentTypeId,
    entity_reference: documentType.type_code,
    action: "DMS_AI_METADATA_SUGGESTION_GENERATED",
    new_values: {
      document_type_id: documentTypeId,
      suggestions_returned: validatedSuggestions.length,
      model: outcome.model,
      existing_definitions: existingFields.length,
    },
    // NOTE: never include prompt text, AI response text, or field values in audit
  })

Step 14: Return
  { success: true, suggestions: validatedSuggestions, documentTypeName: docType.name_en, existingCount: existingFields.length, model: outcome.model }

### checkDmsAiProviderAvailable
  Call getDmsAiProvider() — check provider.isConfigured()
  Return { available: boolean, providerName: provider.providerName if available }
  Does NOT require auth — it is a configuration check only (no sensitive data returned)

## 8. AI Prompt Design

### System Prompt
```
You are a document management metadata expert for an enterprise ERP system.
Your task is to suggest structured metadata fields for a document type.
Metadata fields describe the key data points that can be tracked, searched, 
and extracted from this type of document.

Rules:
- Return ONLY a valid JSON array. No explanation text before or after.
- Each field must match the exact structure provided.
- Suggest 6 to 15 fields per document type.
- Use only these field_type values: text, date, number, boolean, currency
- field_code must be snake_case, lowercase, only letters/numbers/underscores
- Focus on fields that are visible on the physical or digital document
- Do NOT suggest internal system fields

Do not suggest any of these reserved field codes:
id, created_at, updated_at, created_by, updated_by, deleted_at, status,
file_path, storage_path, tenant_id, owner_company_id, branch_id, document_type_id,
category_id, metadata_json, extracted_text, ai_result, document_no, document_id
```

### User Prompt (dynamic, built from fetched data)
```
Suggest metadata fields for this document type.

Document Type: {name_en}
Code: {type_code}
{if description}: Description: {description}

{if existing_fields.length > 0}:
This document type already has these fields. Do NOT suggest them:
{existing_field_codes joined by comma}

Reference examples from well-defined document types:

EMIRATES_ID (Emirates ID Card):
{top 6 EMIRATES_ID fields as: field_code | field_label_en | field_type | required | ai_extractable}

PASSPORT_COPY (Passport Copy):
{top 6 PASSPORT_COPY fields as: field_code | field_label_en | field_type | required | ai_extractable}

Focus on:
1. Identifiers and reference numbers (passport_number, license_no, trade_license_number)
2. Issue and expiry dates (issue_date, expiry_date, valid_from, valid_to)
3. Issuing authorities and parties (issued_by, holder_name, company_name)
4. Financial amounts if this is a financial document (amount, currency_code, total_value)
5. Status and classification fields visible on the document (status, grade, category)

Return ONLY a JSON array with this exact structure:
[
  {
    "field_code": "passport_number",
    "field_label_en": "Passport Number",
    "field_type": "text",
    "is_required": true,
    "is_ai_extractable": true,
    "ai_field_hint": "Extract the passport number from the MRZ line or main data page",
    "ai_example_values": ["A12345678", "P9876543"],
    "sort_order": 0,
    "reasoning": "Primary identifier for all passports"
  }
]
```

### AI Call Parameters
- maxTokens: 2000 (sufficient for 15 fields with full detail)
- temperature: 0 (deterministic output for structured JSON)
- Timeout: uses STRUCTURED_TIMEOUT_MS = 30,000ms (existing in OpenAiDmsAdapter)

## 9. Structured JSON Output and Validation Plan

### AI Output Zod Schema

```typescript
const AI_ALLOWED_FIELD_TYPES = ["text", "date", "number", "boolean", "currency"] as const;

const aiSuggestedFieldSchema = z.object({
  field_code: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, "field_code must be snake_case"),
  field_label_en: z.string().min(1).max(255),
  field_type: z.enum(AI_ALLOWED_FIELD_TYPES),
  is_required: z.boolean(),
  is_ai_extractable: z.boolean(),
  ai_field_hint: z.string().max(500).default(""),
  ai_example_values: z.array(z.string().max(200)).max(10).default([]),
  sort_order: z.number().int().min(0).default(0),
  reasoning: z.string().max(500).default(""),
});

const aiSuggestionResponseSchema = z.array(aiSuggestedFieldSchema).max(30);
```

### Validation Strategy
1. Parse raw JSON string from AI: `JSON.parse(rawJson)` in try/catch
2. Run `aiSuggestionResponseSchema.safeParse(parsed)`
3. If parse fails entirely ? return error to client
4. If array is valid but some items fail item-level validation:
   - Filter out invalid items silently
   - Log count of dropped items in audit
   - Return only valid items (minimum 0)
5. If valid array has 0 items after filtering ? return success with empty array,
   client shows "AI could not generate suggestions for this document type"

### After Zod Validation: field_code Normalization
(See Section 10)

### Post-Validation Type Note
The `field_type` values returned by AI ("text", "date", "number", "boolean", "currency")
are a strict subset of ALLOWED_FIELD_TYPES (19 types). They are safe to pass directly to
createDmsMetadataDefinition since that action validates against the full ALLOWED_FIELD_TYPES.

## 10. Field Code Normalization and Reserved Field Protection

### Normalization Function
```typescript
function normalizeFieldCode(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, "_")       // spaces ? underscore
    .replace(/-/g, "_")         // hyphens ? underscore
    .replace(/[^a-z0-9_]/g, "") // remove all non-alphanumeric/underscore
    .replace(/__+/g, "_")       // collapse multiple underscores
    .replace(/^_+|_+$/g, "")    // trim leading/trailing underscores
    .slice(0, 100);             // enforce max length
}
```

Examples:
- "License No" ? "license_no"
- "LicenseNumber" ? "licensenumber" ? needs camelCase splitting
- "license-number" ? "license_number"
- "  expiry  date  " ? "expiry_date"

### CamelCase Splitting (for LicenseNumber ? license_number)
Before normalization, apply a camelCase splitter:
```typescript
function splitCamelCase(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2");
}
// LicenseNumber ? License_Number ? then normalize ? license_number
```

### Reserved Field Code List
After normalization, reject any field_code that matches this list:
```
id, created_at, updated_at, created_by, updated_by, deleted_at,
status, file_path, storage_path, tenant_id, owner_company_id,
branch_id, document_type_id, category_id, metadata_json, extracted_text,
ai_result, document_no, document_id, sort_order, is_active, is_required,
is_ai_extractable, metadata_version
```
Fields matching this list are silently dropped from the suggestion set.

### Empty Code After Normalization
If normalization produces an empty string, the field is silently dropped.

## 11. Duplicate Prevention Plan

Three layers of deduplication, applied in order after normalization:

### Layer 1: Remove duplicates against existing DB definitions
```typescript
const existingCodes = new Set(existingFields.map(f => f.field_code));
const filtered = suggestions.filter(s => !existingCodes.has(s.field_code));
```
If AI suggests "expiry_date" and the type already has "expiry_date" in the DB,
the suggestion is silently removed.

### Layer 2: Remove intra-response duplicates
AI may suggest the same field_code twice (especially after normalization collapses
"Expiry Date" and "expiry_date" to the same code).
```typescript
const seenCodes = new Set<string>();
const deduplicated = filtered.filter(s => {
  if (seenCodes.has(s.field_code)) return false;
  seenCodes.add(s.field_code);
  return true;
});
```

### Layer 3: Remove reserved codes
```typescript
const RESERVED_CODES = new Set([...RESERVED_FIELD_CODES]);
const safe = deduplicated.filter(s => !RESERVED_CODES.has(s.field_code));
```

### Final Result
`safe` is the validated, deduplicated, normalized list returned to the client.
Empty result is valid — client shows "No new fields to suggest."

## 12. Sort Order Strategy

### Existing Max Sort Order
After fetching existing definitions, compute:
```typescript
const maxExistingOrder = existingFields.length > 0
  ? Math.max(...existingFields.map(f => f.sort_order))
  : -1;
```

### New Base
New suggestions start at `maxExistingOrder + 10` rounded up to nearest 10.
```typescript
const base = Math.ceil((maxExistingOrder + 10) / 10) * 10;
// Example: maxExistingOrder = 80 ? base = 90
// Example: maxExistingOrder = -1 (no existing) ? base = 0
```

### Per-Suggestion Assignment
```typescript
suggestions.forEach((s, idx) => {
  s.sort_order = base + (idx * 10);
});
// Results: 90, 100, 110, 120, ...
```

### Why Increment by 10
Leaves room for manual reordering between AI-suggested fields later.

### Important: sort_order in AI Response is Ignored
The AI's sort_order values are discarded after deduplication.
The server always recalculates sort_order from the base formula.
This prevents gaps, conflicts, and unexpected ordering from AI hallucinations.

## 13. Review Dialog UX Plan

### New File: src/features/dms/admin/dms-ai-metadata-suggestions-dialog.tsx

### Component Signature
```typescript
type DmsAiMetadataSuggestionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suggestions: AiSuggestedField[];
  documentTypeId: number;
  documentTypeName: string;
  existingCount: number;
  model: string | null;
  onCreated: () => void; // called when any fields are successfully created ? triggers router.refresh()
};
```

### Dialog Structure: ERPChildDialogForm
- Uses `ERPChildDialogForm` per ERP child dialog standards
- size="xl" (1120px) — needed for the suggestion table
- mode="add"
- title: `AI-Suggested Fields for ${documentTypeName}`
- subtitle: "Review and accept fields. Suggestions are not saved until you click Accept."
- icon: `<Sparkles className="h-5 w-5 text-purple-500" />`
- submitLabel: `Accept & Create Selected (${selectedCount})`
- Submit disabled when selectedCount === 0 or isSaving

### Header Badge
Below the subtitle, one line:
`AI model: ${model ?? "Unknown"} · ${suggestions.length} suggestions generated`
Styled as muted text with a purple Brain icon.

### Suggestion Table
Table rendered inside the dialog body (scrollable).

Columns:
| # | Column | Width | Editable | Notes |
|---|---|---|---|---|
| 1 | Checkbox | 32px | yes (select/deselect) | |
| 2 | Field Code | 140px | NO (read-only) | Monospace font |
| 3 | Field Label | auto | YES — Input | Required |
| 4 | Type | 120px | YES — native select | AI subset only |
| 5 | Req. | 56px | YES — Switch | |
| 6 | AI | 56px | YES — Switch | AI extractable |
| 7 | AI Hint | 200px | read-only muted text | |
| 8 | Status | 80px | NO | pending/saved/failed |

Reasoning row: rendered as a muted `<p>` directly below the main row (full-width colspan).
Only shown if reasoning is non-empty. Collapsed by default on mobile; always visible on desktop.

### State Variables
```typescript
const [selected, setSelected] = useState<Set<string>>(() => new Set(suggestions.map(s => s.field_code)));
const [edits, setEdits] = useState<Map<string, Partial<AiSuggestedField>>>(() => new Map());
const [rowStatus, setRowStatus] = useState<Map<string, "pending" | "saving" | "saved" | "failed" | "error_message">>(() => new Map());
const [rowErrors, setRowErrors] = useState<Map<string, string>>(() => new Map());
const [isSaving, setIsSaving] = useState(false);
const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
```

### Helper: getMergedRow(suggestion)
```typescript
function getMergedRow(s: AiSuggestedField): AiSuggestedField {
  const override = edits.get(s.field_code);
  return override ? { ...s, ...override } : s;
}
```

### Select All / Deselect All
Header row checkbox: indeterminate state when partially selected.
Click: toggles all rows.

### Footer Counter
`${selectedCount} of ${suggestions.length} fields selected`
Color: green when selectedCount > 0, muted when 0.

### Regenerate Suggestions (Optional — plan only, defer to implementation decision)
"Regenerate" button (outline, left side of footer alongside counter).
Clicking shows a small confirm: "This will replace current suggestions and edits. Continue?"
On confirm: calls suggestMetadataDefinitions again (passed as prop or parent callback).
Deferred to be decided by Sameer at implementation time.

### Accept & Create Selected Flow
```
isSaving = true
For each selected field_code in order:
  merged = getMergedRow(suggestion)
  setRowStatus(code, "saving")
  result = await createDmsMetadataDefinition(payload)
  if result.success:
    setRowStatus(code, "saved")
  else:
    setRowStatus(code, "failed")
    setRowErrors(code, result.error)

isSaving = false

if all selected saved:
  show success toast: "X fields created for [Type]"
  onCreated() ? router.refresh() in parent
  onOpenChange(false)
else:
  show partial toast: "X created, Y failed — review errors in dialog"
  dialog stays OPEN
  failed rows highlighted in red with error text
  Admin can fix errors (edit label, change type) or deselect and retry
```

### Key UX Rules
- Deselected rows never have createDmsMetadataDefinition called
- Already-saved rows are not re-saved if admin clicks Accept again
- Dialog does not auto-close if any failure exists
- Cancel button always works (no confirmation needed; nothing has been saved)

## 14. Metadata Definitions Toolbar/Button Plan

### Location in Existing Code
File: `src/features/dms/admin/dms-metadata-definitions-table.tsx`
Current toolbar: inside `toolbarFilters` JSX, rendered via `toolbarSlot={toolbarFilters}` on ERPDataTable.

### Changes Required to dms-metadata-definitions-table.tsx

#### New State
```typescript
const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
const [aiDialogOpen, setAiDialogOpen] = useState(false);
const [aiSuggestions, setAiSuggestions] = useState<AiSuggestedField[]>([]);
const [aiDocumentTypeName, setAiDocumentTypeName] = useState("");
const [aiExistingCount, setAiExistingCount] = useState(0);
const [aiModel, setAiModel] = useState<string | null>(null);
const [aiProviderAvailable, setAiProviderAvailable] = useState<boolean | null>(null);
```

#### On Mount: Check AI Provider
```typescript
useEffect(() => {
  checkDmsAiProviderAvailable().then(r => setAiProviderAvailable(r.available));
}, []);
```

#### Button Logic
Show AI suggest button ONLY when:
1. `manage` is true (user has permission)
2. `filterTypeId !== "all"` (a specific document type is selected)

Button label:
```typescript
const existingForType = rows.filter(r => String(r.document_type_id) === filterTypeId);
const buttonLabel = existingForType.length === 0 ? "Suggest Fields with AI" : "Suggest Additional Fields";
```

Button rendering:
```tsx
{manage && filterTypeId !== "all" && (
  <Button
    onClick={handleAiSuggest}
    size="sm"
    variant="outline"
    disabled={aiSuggestLoading || aiProviderAvailable === false}
    title={aiProviderAvailable === false ? "AI provider not configured. Contact administrator." : undefined}
    className="gap-2"
  >
    {aiSuggestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-purple-500" />}
    {aiSuggestLoading ? "Analyzing..." : buttonLabel}
  </Button>
)}
```

#### handleAiSuggest
```typescript
const handleAiSuggest = async () => {
  if (!filterTypeId || filterTypeId === "all") return;
  setAiSuggestLoading(true);
  try {
    const result = await suggestMetadataDefinitions(parseInt(filterTypeId));
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    if (result.suggestions.length === 0) {
      toast.info("AI could not generate suggestions for this document type. Try again or add fields manually.");
      return;
    }
    setAiSuggestions(result.suggestions);
    setAiDocumentTypeName(result.documentTypeName);
    setAiExistingCount(result.existingCount);
    setAiModel(result.model);
    setAiDialogOpen(true);
  } finally {
    setAiSuggestLoading(false);
  }
};
```

#### Dialog Rendering
```tsx
<DmsAiMetadataSuggestionsDialog
  open={aiDialogOpen}
  onOpenChange={setAiDialogOpen}
  suggestions={aiSuggestions}
  documentTypeId={parseInt(filterTypeId)}
  documentTypeName={aiDocumentTypeName}
  existingCount={aiExistingCount}
  model={aiModel}
  onCreated={() => router.refresh()}
/>
```

### Button Placement
In the toolbar, the AI suggest button appears AFTER the existing "Add Field" button.
Both buttons are at the end of the toolbar filter row.

## 15. Accept & Create Selected Plan

### Payload Mapping per Selected Suggestion
For each selected suggestion (with edits applied via getMergedRow):
```typescript
const payload: CreateDmsMetadataDefinitionInput = {
  document_type_id: documentTypeId,
  field_code: merged.field_code,          // already normalized, read-only in dialog
  field_label_en: merged.field_label_en,  // may have been edited inline
  field_label_ar: null,                   // not set by AI; admin adds later if needed
  field_type: merged.field_type,          // editable in dialog (AI subset)
  is_required: merged.is_required,        // editable in dialog
  is_ai_extractable: merged.is_ai_extractable, // editable in dialog
  ai_field_hint: merged.ai_field_hint || null, // from AI, optional edit
  ai_example_values: merged.ai_example_values?.length > 0 ? merged.ai_example_values : null,
  sort_order: merged.sort_order,          // server-assigned, not editable in dialog
  is_active: true,
  show_in_review: true,
  show_in_detail: true,
  show_in_list: false,
  show_in_upload_review: true,
  // All remaining optional fields: null/default
  options_json: null,
  validation_json: null,
  field_group: null,
  field_section: null,
  is_searchable: false,
  is_filterable: false,
  is_unique: false,
  placeholder_en: null,
  placeholder_ar: null,
  help_text_en: null,
  help_text_ar: null,
  ai_possible_labels_en: null,
  ai_possible_labels_ar: null,
  ai_keywords: null,
  ai_negative_keywords: null,
  ai_expected_format: null,
  ai_confidence_threshold: null,
  normalization_rule: null,
  review_required_if_missing: false,
  review_required_if_low_confidence: false,
  metadata_version: 1,
  ai_rules_json: null,
  field_label_ar: null,
};
```

Note: `reasoning` from AiSuggestedField is NEVER included in the payload. It is display-only.

### Sequential vs Parallel Creation
Fields are created sequentially (one at a time), not in parallel.
Reason: If parallel creation fails halfway, state tracking becomes complex.
Sequential allows per-row status updates in the UI as each field is created.

### The existing createDmsMetadataDefinition action
- Handles auth check internally (dms.documents.manage_types)
- Handles Zod validation internally
- Handles audit logging internally (DMS_METADATA_FIELD_CREATED)
- Returns { success: boolean; data?: { id: number }; error?: string }
No changes needed to this existing action.

## 16. Partial Failure Handling

### Scenario
Admin selects 12 fields. 10 create successfully. 2 fail (e.g. duplicate field_code already exists in DB from a race condition, or validation error).

### Behavior
- The 10 successful rows get a green check icon (status: "saved")
- The 2 failed rows get a red error icon + error text displayed in the row (status: "failed")
- Dialog stays OPEN
- Partial toast shown: "10 fields created, 2 failed — review errors below"
- The Accept button changes to "Retry Failed (2)" after partial completion
- Admin can:
  a) Edit the failed row's label or type and retry (the 10 saved rows are skipped on retry)
  b) Deselect the failed rows and click "Accept" to finalize
  c) Cancel (the 10 already-saved fields remain in the DB — no rollback)

### No Rollback
There is no rollback for already-created fields. This is intentional:
The admin asked for those fields, they were created correctly, there is no reason to undo them.

### Re-Entry Protection
On retry, rows with status="saved" are always skipped:
```typescript
const toCreate = selectedFields.filter(s => rowStatus.get(s.field_code) !== "saved");
```

### Dialog Close Logic
```typescript
const canClose = !isSaving;  // always closeable (no dirty guard needed — AI suggestions are not persisted)
const allDone = [...selected].every(code => rowStatus.get(code) === "saved");
if (allDone) {
  // Auto-close and refresh
  onCreated();
  onOpenChange(false);
}
```

## 17. Audit Logging Plan

### Event: DMS_AI_METADATA_SUGGESTION_GENERATED
Logged by suggestMetadataDefinitions after the AI call succeeds.
Safe payload (no prompt text, no AI response text, no document content):
- module_code: "DMS"
- entity_name: "dms_metadata_definitions"
- entity_id: documentTypeId
- entity_reference: documentType.type_code
- new_values:
  - document_type_id
  - suggestions_returned: number
  - model: string or null
  - existing_definitions: number
  - ai_suggestions_dropped: number (count of items filtered out during validation)

### Event: DMS_METADATA_FIELD_CREATED (EXISTING — unchanged)
Logged by createDmsMetadataDefinition once per accepted field.
Already implemented. No changes needed.

### What Must NOT Be Logged
- System prompt text
- User prompt text  
- Raw AI response JSON
- Field label text
- AI hints or example values
- Any document content

## 18. AI Provider Availability UX

### checkDmsAiProviderAvailable()
Called once on component mount. Caches result in component state.
Returns: { available: boolean; providerName?: string }

Implementation: calls getDmsAiProvider() (already safe — never throws), 
returns provider.isConfigured() result and provider.providerName.

### When Available (available: true)
Button: enabled, shows Sparkles icon + correct label

### When Not Available (available: false)
Button: disabled
Tooltip: "AI provider not configured. Contact administrator."
Icon: Sparkles with opacity-50 styling

### When Checking (available: null)
Button: disabled with Loader2 spinner
Label: "Checking AI..." (very brief; typically < 500ms)

### Admin Action
If AI not available, admin navigates to:
Administration > Settings > AI Settings
to configure DEFAULT_DMS_CLASSIFIER, DEFAULT_DMS_EXTRACTOR, or DEFAULT_CHAT.

## 19. Error Handling and Empty States

### Server Action Errors

| Error | Cause | Message to Client |
|---|---|---|
| Auth denied | No manage permission | "Permission denied" |
| Document type not found | Invalid ID | "Document type not found" |
| Provider not configured | No AI config in DB | "AI provider not configured..." |
| AI call failed | Network, timeout, API error | "AI provider call failed: [safe truncated message]" |
| JSON parse failed | AI returned non-JSON | "AI returned an invalid response. Please try again." |
| 0 suggestions after filtering | All suggestions were duplicates | Success with empty array |

### Client-Side Empty States

| State | What Admin Sees |
|---|---|
| 0 suggestions returned | Toast: "AI could not generate suggestions for this document type." Dialog does not open. |
| Dialog open, all rows deselected | Accept button disabled; footer: "0 of X fields selected" |
| All fields already exist | Server returns 0 suggestions with note; toast: "All suggested fields already exist for this type." |

### Dialog Row Error States

| Row Status | Visual |
|---|---|
| pending | Default row styling |
| saving | Row dimmed; Loader2 spinner in status cell |
| saved | Green check badge: "Saved" |
| failed | Red background on row; error text below row |

### Loading State Duration
AI call typically takes 3-8 seconds. Button shows "Analyzing..." with spinner during this time.
No timeout from the client side — the server action uses STRUCTURED_TIMEOUT_MS = 30,000ms
from OpenAiDmsAdapter which handles the timeout natively.

## 20. Security and Safety Rules

| Rule | Enforcement |
|---|---|
| No auto-save | createDmsMetadataDefinition only called after admin clicks Accept |
| Server-side AI call only | suggestMetadataDefinitions is a Next.js Server Action; AI prompt built and sent on server |
| API key never reaches client | getDmsAiProvider uses process.env[secretRef]; secretRef is resolved server-side only |
| Permission check before generation | canManage check at top of suggestMetadataDefinitions |
| createDmsMetadataDefinition validates each field | Existing Zod schema re-validates every accepted field at create time |
| Zod validates AI JSON output | aiSuggestionResponseSchema filters all invalid/malformed suggestions |
| Invalid suggestions removed | Bad field_codes, reserved codes, duplicates silently dropped |
| Audit logs contain no sensitive content | Only counts, model name, and document type ID are logged |
| No DB migration | Uses existing dms_metadata_definitions table only |
| No RLS change | Inherits existing RLS on dms_metadata_definitions |
| reasoning field never saved | It is client-only display data; not included in createDmsMetadataDefinition payload |
| select/multi_select excluded | AI not allowed to suggest field types requiring options_json |

## 21. Database / RLS / Migration Plan

### Database: NO CHANGES
No new tables. No column additions. No schema changes.
Uses only: dms_metadata_definitions (existing), dms_document_types (existing, read-only)

### RLS: NO CHANGES
The existing RLS on dms_metadata_definitions applies to all inserts made by
createDmsMetadataDefinition. No new policies needed.

### Migrations: NONE
This feature adds no DB migration files.

### Existing Table Capacity Check
dms_metadata_definitions has 40+ columns. The AI will only populate a subset:
field_code, field_label_en, field_type, is_required, is_ai_extractable,
ai_field_hint, ai_example_values, sort_order.
All other columns use defaults or null. No capacity issues.

## 22. Testing Plan

### Unit / Integration Tests (recommended)

| Test | What to Verify |
|---|---|
| normalizeFieldCode() | All normalization cases: spaces, camelCase, hyphens, trailing underscores, max length |
| splitCamelCase() | LicenseNumber, MyFieldName, HTMLCode |
| Reserved code filter | id, created_at, document_id, etc. are all removed |
| Duplicate removal (DB) | existing_field_codes are excluded from result |
| Duplicate removal (intra-AI) | Same code appears twice in AI response ? first kept, second dropped |
| Sort order continuation | maxExistingOrder=80 ? new fields start at 90, 100, 110 |
| Sort order when empty | maxExistingOrder=-1 ? new fields start at 0, 10, 20 |
| Zod schema | Valid full item passes; bad field_type rejected; missing required field rejected |
| Empty AI response | Array [] returned ? server returns success with empty suggestions array |
| Non-JSON AI response | JSON.parse throws ? server returns error |

### Behavior Tests (manual or integration)

| Test | Expected |
|---|---|
| No AI provider configured | Button disabled with tooltip |
| Specific type selected | Button appears; label matches 0 or 1+ existing count |
| "All" selected in type filter | Button hidden |
| Type has 0 definitions | Label: "Suggest Fields with AI" |
| Type has 3 definitions | Label: "Suggest Additional Fields" |
| AI returns 12 suggestions | Dialog opens with 12 rows, all selected by default |
| Admin deselects 3 rows | Footer shows "9 of 12 fields selected" |
| Admin edits a label | getMergedRow returns edited label in payload |
| Admin accepts 9 | createDmsMetadataDefinition called 9 times |
| 9/9 success | Toast "9 fields created", dialog closes, table refreshes |
| 7/9 success, 2 fail | Toast partial, dialog stays open, 2 rows show error |
| Admin retries failures | Only the 2 failed rows are retried (saved rows skipped) |
| Auth denied | Button hidden (canManage = false) |

## 23. Browser UAT Plan

### Pre-Conditions
- Logged in as system_admin or user with dms.documents.manage_types permission
- AI provider configured in Administration > Settings > AI Settings
- Navigate to: Administration > DMS Admin > Metadata Definitions

### UAT-01: Button Visibility
1. Leave "All document types" in the type filter
2. Verify: AI button is NOT visible
3. Select "CV" from the type filter
4. Verify: Button "Suggest Fields with AI" appears (CV has 0 definitions)
5. Select "VISA" from the type filter  
6. Verify: Button "Suggest Additional Fields" appears (VISA has 15 definitions)

### UAT-02: Loading State
1. Select "Bank Guarantee" (0 definitions)
2. Click "Suggest Fields with AI"
3. Verify: Button shows spinner and "Analyzing..." text
4. Verify: Button is disabled during loading

### UAT-03: Review Dialog Opens
1. After loading completes
2. Verify: Dialog opens with title "AI-Suggested Fields for Bank Guarantee"
3. Verify: AI model badge is shown
4. Verify: All suggested rows are checked by default
5. Verify: Footer shows "X of X fields selected"

### UAT-04: Editing in Dialog
1. Click on a field label cell ? edit the text
2. Verify: Label updates inline
3. Change a field type dropdown
4. Toggle a Required switch
5. Toggle an AI Extractable switch
6. Verify: All edits reflected in the row immediately

### UAT-05: Deselecting Rows
1. Uncheck 3 rows
2. Verify: Footer counter decrements to "Y of X fields selected"
3. Click "Accept & Create Selected (Y)"
4. Verify: Only Y fields are saved (not the 3 deselected ones)

### UAT-06: Successful Creation
1. Accept all suggestions for "CV" document type
2. Verify: Each row briefly shows "Saving..." then "Saved" check
3. Verify: Success toast appears
4. Verify: Dialog closes
5. Verify: Table now shows the new fields for CV
6. Verify: Filter type still shows "CV" after refresh

### UAT-07: Partial Failure
1. Add a field manually to a document type with code "test_field"
2. Generate AI suggestions for that type
3. If AI returns "test_field" (unlikely but possible), it should NOT appear (duplicate removed by server)
4. Alternatively: to simulate failure, use a type that already has a field and manually force a conflict
5. Verify: Failed rows show red error text; dialog stays open

### UAT-08: AI Provider Not Configured
1. As system_admin, disable all AI providers in Settings > AI Settings
2. Navigate to Metadata Definitions > select a type
3. Verify: Button shows disabled state with tooltip

### UAT-09: User Without Permission
1. Log in as a DMS user without dms.documents.manage_types or dms.admin
2. Navigate to Metadata Definitions
3. Verify: Neither "Add Field" nor "Suggest Fields with AI" button is visible

## 24. Acceptance Criteria

| ID | Criterion | Status |
|---|---|---|
| AC-01 | Current files/actions/schema verified before recommending changes | VERIFIED |
| AC-02 | Real permission code verified: dms.documents.manage_types confirmed in live DB | VERIFIED |
| AC-03 | suggestMetadataDefinitions server action fully planned with all 14 steps | PLANNED |
| AC-04 | AI review dialog planned with ERPChildDialogForm, inline editing, row status | PLANNED |
| AC-05 | Toolbar button planned with label logic, disabled state, AI provider tooltip | PLANNED |
| AC-06 | Zod schema for AI JSON output planned with enum constraint on field_type | PLANNED |
| AC-07 | field_code normalization and reserved field protection fully specified | PLANNED |
| AC-08 | Duplicate prevention: DB layer, intra-AI layer, reserved code layer | PLANNED |
| AC-09 | Sort order continuation from maxExistingOrder + 10 (base rounded to 10) | PLANNED |
| AC-10 | Human review enforced: no auto-save; Accept button required | CONFIRMED |
| AC-11 | Partial save failure: dialog stays open, failed rows shown with errors, retry planned | PLANNED |
| AC-12 | Audit logging: DMS_AI_METADATA_SUGGESTION_GENERATED with safe payload | PLANNED |
| AC-13 | No DB migration, no RLS change confirmed | CONFIRMED |
| AC-14 | Testing plan (unit + manual) and browser UAT plan (9 scenarios) provided | PLANNED |
| AC-15 | No implementation: plan document only, no source files modified | CONFIRMED |

## 25. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| AI returns bad JSON | Medium | Low | Zod catches it; returns error to client |
| AI suggests reserved field codes | Medium | Low | Reserved code filter removes them silently |
| AI suggests duplicate codes | High | Low | Duplicate filter removes them; server normalizes first |
| AI suggests select/multi_select types | Medium | Low | Zod enum rejects them; item dropped |
| AI suggests > 15 fields | Medium | None | Array max(30) in Zod catches extreme cases; admin deselects unwanted |
| AI timeout (> 30s) | Low | Low | STRUCTURED_TIMEOUT_MS=30,000ms triggers; error returned to client |
| Race condition: same code created by two admins simultaneously | Very Low | Low | Unique constraint in DB prevents duplicate insert; second fails gracefully |
| Admin creates 0 fields (all deselected) | Expected | None | Valid use case; no error |
| AI provider disabled mid-use | Very Low | Low | checkDmsAiProviderAvailable refreshed on next mount; button re-disables |
| Large number of document types (30+) with 0 definitions | Expected | Positive | Feature designed specifically for this case |

## 26. Items Explicitly Deferred

The following are out of scope for DMS AI META.1 and must not be implemented:

| Item | Reason |
|---|---|
| Auto-accepting AI suggestions (no human review) | Safety rule — human review is non-negotiable |
| Suggesting actual document data values from uploaded files | Different feature (metadata extraction, already exists in batch intake) |
| AI editing or deleting existing definitions | Out of scope; potentially destructive |
| Arabic (field_label_ar) suggestions | Not in AI output schema; add manually after creation |
| select / multi_select field types in AI suggestions | Requires options_json which AI cannot reliably generate |
| New DB tables | No DB changes in this phase |
| DB migrations | No DB changes in this phase |
| RLS changes | No RLS changes in this phase |
| New permission code (e.g. dms.ai.suggest_definitions) | Existing dms.documents.manage_types is sufficient; new permission deferred |
| Regenerate Suggestions button implementation | Plan mentions it but defers decision to Sameer at implementation time |
| Bulk AI suggestion for all document types at once | Future phase |
| AI suggestion quality feedback / thumbs up-down | Future phase |
| Confidence scores per suggestion | Not applicable for schema generation (vs extraction) |

## 27. Source-of-Truth Update Plan

After implementation is complete and UAT passes:

1. Update .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md:
   - Add phase entry: DMS AI META.1 — AI-Suggested Metadata Definitions
   - Status: IMPLEMENTED
   - Files changed:
     - src/server/actions/dms/ai-metadata-suggestions.ts (NEW)
     - src/features/dms/admin/dms-ai-metadata-suggestions-dialog.tsx (NEW)
     - src/features/dms/admin/dms-metadata-definitions-table.tsx (MODIFIED)
   - Audit event added: DMS_AI_METADATA_SUGGESTION_GENERATED
   - No DB migrations, no RLS changes

2. Create implementation report:
   implementation_Review/DMS_AI_META_1_AI_SUGGESTED_METADATA_DEFINITIONS_IMPLEMENTATION_REPORT.md

3. Do NOT update this plan file after implementation — it remains the planning artifact.

## 28. Recommended Implementation Prompt Summary

When Sameer approves this plan, the implementation prompt should instruct Cursor to:

1. Read this plan file in full before writing any code
2. Read: src/features/dms/admin/dms-metadata-definitions-table.tsx
3. Read: src/server/actions/dms/metadata-definitions.ts
4. Read: src/lib/ai/common/provider-bridge.ts
5. Read: src/lib/dms/ai/factory.ts
6. Read: src/features/dms/admin/dms-constants.ts
7. Create: src/server/actions/dms/ai-metadata-suggestions.ts (new file)
8. Create: src/features/dms/admin/dms-ai-metadata-suggestions-dialog.tsx (new file)
9. Modify: src/features/dms/admin/dms-metadata-definitions-table.tsx (add button + dialog state)
10. Run TypeScript check after implementation
11. Create implementation report
12. Update SOT

Key constraints to repeat in the implementation prompt:
- Use callCommonAiStructuredCompletion from provider-bridge.ts — NEVER import OpenAI directly
- reasoning field must NEVER be passed to createDmsMetadataDefinition
- sort_order must be recalculated server-side, not trusted from AI
- Dialog must use ERPChildDialogForm (size="xl")
- Button must only appear when filterTypeId is a specific type (not "all")
- Permission: dms.documents.manage_types (verified)

### Decision to Confirm with Sameer Before Implementation
1. Include Regenerate Suggestions button? (adds complexity to dialog state)
2. AI suggest button in toolbar only (current plan) or also on the document type detail page?

## 29. Final Recommendation

DMS AI META.1 is well-scoped, low-risk, and directly addresses the 30+ document types with zero metadata definitions in the live system.

**Implementation confidence: HIGH**

Reasons:
- No DB migration or RLS change needed
- Existing AI provider infrastructure (factory, adapter, provider-bridge) is well-built and ready
- Existing createDmsMetadataDefinition action handles all validation and audit logging
- The permission code (dms.documents.manage_types) is verified and correct
- The existing ERPChildDialogForm and ERPDataTable patterns are well-established
- The ALLOWED_FIELD_TYPES constraint naturally limits AI output to safe, compatible types
- Human review is non-negotiable and fully enforced by the plan design

**Estimated scope:**
- 1 new server action file (~150 lines)
- 1 new dialog component (~280 lines)
- ~50 lines added to dms-metadata-definitions-table.tsx

**Recommended first test target:** BANK_GUARANTEE or CV — simple financial/HR document types
with no existing definitions and obvious expected fields (holder_name, issue_date, expiry_date,
amount, guarantor_bank, beneficiary_name).

---

*Plan created: 2026-06-30*
*Author: Cursor AI Agent (DMS AI META.1 planning run)*
*Status: AWAITING SAMEER REVIEW*
