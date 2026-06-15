# ERP Global Workspace Unsaved Form Draft Standard

**Document:** `ERP_GLOBAL_WORKSPACE_UNSAVED_FORM_DRAFT_STANDARD.md`  
**Phase:** ERP GLOBAL UI.4E.2  
**Status:** ACTIVE  
**Date:** June 2026

---

## Purpose

Workspace record forms open as full-page workspace tabs. Switching workspace tabs triggers `router.push()` via the Next.js App Router, which unmounts the current page component. When the user returns to the tab, the form remounts fresh, causing all unsaved typed values to be lost.

This standard defines how unsaved form field values are preserved in an **in-memory draft store** so that users can freely switch between workspace tabs without losing their work.

---

## Scope

All `ERPRecordWorkspaceForm` implementations across the ALGT ERP project:
- Party Master, Customer, Finance Basics, UOM, Geography, Lookups, Admin (Users, Orgs, Branches, Roles, Numbering)

---

## In-Memory Only Rule

**Unsaved form field values MUST be stored in memory only.**

- Do NOT write to `localStorage`
- Do NOT write to `sessionStorage`
- Do NOT write to any server or database
- The draft is a React `useRef<Map>` owned by `WorkspaceDraftProvider`

This ensures:
1. No PII or sensitive data persisted to disk
2. No cross-session contamination
3. Draft is naturally cleared on browser close/refresh

---

## Sensitive Field Denylist

The following field names are NEVER stored in the draft, even in memory:

```
password, temporary_password, confirm_password, current_password, new_password,
token, access_token, refresh_token, api_key, secret, client_secret,
otp, pin,
file, attachment, attachments, document_file,
bank_account_number, account_number, iban,
emirates_id, passport_number
```

**Rules:**
- Match is case-insensitive
- Also denied if field name CONTAINS a sensitive substring (`password`, `token`, `secret`, `api_key`, `iban`)
- File and Blob values are always excluded at the FormData capture layer
- Only primitive string values are stored

**Special note:** `temporary_password` in `user-workspace-form.tsx` MUST NEVER be stored.

---

## Draft Key Strategy

Format: `draft:tab:{activeTabId}:{formId}`

Examples:
```
draft:tab:abc123:party-workspace-form
draft:tab:def456:bank-workspace-form
draft:tab:ghi789:customer-workspace-form
```

- The `activeTabId` comes from the workspace context (unique per open tab)
- The `formId` is the `FORM_ID` constant defined at the top of each form
- Both are required — if no active tab ID is available, draft is not stored

---

## How to Integrate a New Form

### 1. Import the hook

```tsx
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
```

### 2. Call the hook (after useFormDirty, before controlled state)

```tsx
const { getDraftDefault, getDraftBoolean, syncDraft, writeDraftField, clearDraft } =
  useWorkspaceFormDraft({
    formId: FORM_ID,         // must match the form element's id
    enabled: !isViewing,     // disable in view mode
  });
```

### 3. Wrap all defaultValue props

**Before:**
```tsx
<Input name="display_name" defaultValue={record?.display_name ?? ""} />
<Input name="sort_order" defaultValue={record?.sort_order ?? 0} />
```

**After:**
```tsx
<Input name="display_name" defaultValue={getDraftDefault("display_name", record?.display_name ?? "")} />
<Input name="sort_order" defaultValue={getDraftDefault("sort_order", record?.sort_order ?? 0)} />
```

> `getDraftDefault(fieldName, fallback)` returns: draft value if exists → fallback as string → `""`

### 4. Add form-level sync

```tsx
<form id={FORM_ID} onInput={syncDraft} onChange={syncDraft} onSubmit={...}>
```

This captures text, textarea, date, number, and native select changes automatically via debounced FormData snapshot.

### 5. Handle controlled comboboxes

```tsx
// State initialization — use lazy initializer
const [countryId, setCountryId] = useState<number | null>(() => {
  const d = getDraftDefault("country_id", "");
  return d ? Number(d) : record?.country_id ?? null;
});

// onChange — update state AND write draft
<CountrySelect
  value={countryId}
  onValueChange={(v) => {
    setCountryId(v);
    writeDraftField("country_id", v ?? "");
  }}
/>
```

### 6. Clear draft on save success

```tsx
if (result.success) {
  clearDraft();   // ← clear draft first
  resetDirty();
  toast.success("Saved");
  return true;
}
// Do NOT clear draft on failure
```

### 7. Clear draft on save-and-close

The `clearDraft()` call in the save success path handles this automatically before `closeTab()` is called.

---

## How to Handle Controlled Comboboxes

For any controlled component not captured by FormData (custom select, combobox, ERPCombobox, LookupSelect, etc.):

1. Initialize state from `getDraftDefault`:
   - Numbers: `const d = getDraftDefault("field"); return d ? Number(d) : serverValue;`
   - Strings: `getDraftDefault("field", serverValue) || null`
   - Booleans: `getDraftBoolean("field", serverDefault)`

2. Call `writeDraftField` in every `onValueChange` handler

3. For cascades (country → emirate → city):
   - When parent changes, clear child draft fields: `writeDraftField("emirate_id", ""); writeDraftField("city_id", "");`

---

## How to Clear Drafts

| Trigger | Mechanism |
|---------|-----------|
| Save success | `clearDraft()` in form's handleSave success path |
| Save & Close | `clearDraft()` in form's handleSave success path (before closeTab) |
| Discard (tab close) | `clearDraftsForTab(tabId)` in workspace provider `doCloseTab` |
| Close all tabs | `clearDraftsForTab(tabId)` for each closable tab |
| Browser refresh | Automatic — in-memory draft is lost |

---

## Security Notes

1. **No disk writes** — drafts never leave the browser's JavaScript heap
2. **Denylist enforced** — sensitive fields are checked at `writeField` and at `snapshotFormData` time
3. **File exclusion** — `FormData` entries of type `File` or `Blob` are silently skipped
4. **Session scoped** — drafts are cleared when the browser tab/window closes
5. **User-scoped** — since the store is in `useRef` on a provider mounted per page load, there's no cross-user risk
6. **Rotate auth tokens** — password and token fields must never appear in draft store; enforced by denylist and by not calling `getDraftDefault` for those fields in `user-workspace-form.tsx`

---

## Architecture

```
WorkspaceDraftProvider (useRef<Map>)
  └── WorkspaceProvider
       └── ERPRecordWorkspaceForm
            └── form#my-form
                 └── useWorkspaceFormDraft
                      ├── getDraftDefault(field, fallback)
                      ├── syncDraft()          ← onInput/onChange
                      ├── writeDraftField()    ← controlled components
                      └── clearDraft()         ← save success
```

---

## Browser Refresh Behavior

On browser refresh, the in-memory draft is lost. This is acceptable because:
- ERP GLOBAL UI.4B already shows a `beforeunload` browser warning when the form is dirty
- The user is explicitly warned before navigating away
- Session storage restoration is deferred to a future phase

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/lib/workspace/workspace-draft-types.ts` | TypeScript types + denylist constants + key builder |
| `src/lib/workspace/workspace-draft-store.ts` | Store factory + `snapshotFormData` utility |
| `src/components/workspace/workspace-draft-provider.tsx` | React context provider |
| `src/hooks/use-workspace-form-draft.ts` | Component hook for forms |
| `.cursor/rules/erp-workspace-unsaved-form-draft-standard.mdc` | Cursor agent rule |
| `docs/standards/ERP_GLOBAL_WORKSPACE_UNSAVED_FORM_DRAFT_STANDARD.md` | This document |
