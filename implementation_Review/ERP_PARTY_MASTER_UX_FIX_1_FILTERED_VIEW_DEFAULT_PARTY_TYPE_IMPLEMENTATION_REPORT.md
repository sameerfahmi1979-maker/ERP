# ERP PARTY MASTER UX FIX.1 — Filtered View Default Party Type

**Phase:** ERP PARTY MASTER UX FIX.1  
**Status:** CLOSED / PASS ✅  
**Date:** 2026-06-14  
**Executed by:** Cursor (AI Lead Engineer)

---

## Summary

When a user clicks **Add Party** from any filtered Party view (e.g. `/admin/master-data/parties/customers`), the New Party workspace form now opens with the matching Party Type pre-selected. The fix uses a `?defaultType=TYPE_CODE` query parameter, which is validated, propagated, and rendered entirely without any DB schema changes.

---

## Files Modified

| File | Change |
|---|---|
| `src/features/master-data/parties/parties-table.tsx` | Destructured `defaultTypeCode` and `pageTitle` props (were in type but unused). Added `PARTY_TYPE_CODE_LABELS` map and `ALLOWED_DEFAULT_TYPE_CODES` set. Updated `openAdd()` to append `?defaultType={code}` and set title to `"New Customer"` / `"New Vendor"` etc. |
| `src/app/(protected)/admin/master-data/parties/record/new/page.tsx` | Added `searchParams` param. Reads `defaultType`, validates against `ALLOWED_DEFAULT_TYPE_CODES`, passes as `defaultTypeCode` to `PartyWorkspaceForm`. |

### Pre-existing wiring (no changes needed)

| File | Pre-existing status |
|---|---|
| `src/app/(protected)/admin/master-data/parties/[typeSlug]/page.tsx` | Already passed `defaultTypeCode={mapping.typeCode}` to `PartiesTable` |
| `src/features/master-data/parties/party-workspace-form.tsx` | Already accepted `defaultTypeCode?: string \| null` prop and passed to `PartyTypesTab` |
| `src/features/master-data/parties/party-types-tab.tsx` | Already had `useEffect` logic to preselect type when `!partyId && defaultTypeCode && allTypes` |

---

## Filtered Route → defaultType Mapping

| Filtered Route | defaultType passed | Tab title |
|---|---|---|
| `/admin/master-data/parties/customers` | `CUSTOMER` | New Customer |
| `/admin/master-data/parties/vendors` | `VENDOR` | New Vendor |
| `/admin/master-data/parties/subcontractors` | `SUBCONTRACTOR` | New Subcontractor |
| `/admin/master-data/parties/consultants` | `CONSULTANT` | New Consultant |
| `/admin/master-data/parties/recruitment-agencies` | `RECRUITMENT_AGENCY` | New Recruitment Agency |
| `/admin/master-data/parties/government-authorities` | `GOVERNMENT_AUTHORITY` | New Government Authority |
| `/admin/master-data/parties/insurance-companies` | `INSURANCE_COMPANY` | New Insurance Company |
| `/admin/master-data/parties/license-issuers` | `LICENSE_ISSUER` | New License Issuer |
| `/admin/master-data/parties` (All Parties) | _(none)_ | New Party |
| `/admin/master-data/parties/banks` | _(excluded per spec)_ | New Party |

---

## Add Button Behavior

**`PartiesTable.openAdd()` logic:**

```ts
const validCode = defaultTypeCode && ALLOWED_DEFAULT_TYPE_CODES.has(defaultTypeCode)
  ? defaultTypeCode
  : null;
const friendlyLabel = validCode ? PARTY_TYPE_CODE_LABELS[validCode] : null;
openTab({
  route: validCode
    ? `/admin/master-data/parties/record/new?defaultType=${validCode}`
    : "/admin/master-data/parties/record/new",
  title: friendlyLabel ? `New ${friendlyLabel}` : "New Party",
  tabKind: "record",
  entityType: "party",
  formMode: "add",
  closable: true,
});
```

- No hardcoded IDs.
- Invalid/unknown codes fall through to `null` safely — generic "New Party" tab opens.
- `BANK` is excluded from `ALLOWED_DEFAULT_TYPE_CODES` per spec.

---

## `record/new` Route Behavior

`src/app/(protected)/admin/master-data/parties/record/new/page.tsx` now reads:

```ts
const { defaultType } = await searchParams;
const defaultTypeCode =
  defaultType && ALLOWED_DEFAULT_TYPE_CODES.has(defaultType) ? defaultType : undefined;
```

- Only codes in the known-safe set are forwarded to the form.
- Unknown/malicious codes are ignored — form opens as generic "New Party".
- No crash on bad input.

---

## `PartyWorkspaceForm` Prop Changes

No changes needed — `defaultTypeCode?: string | null` prop was already defined and wired to `PartyTypesTab`:

```tsx
<PartyTypesTab
  partyId={effectivePartyId}
  disabled={mode === "view"}
  authContext={authContext}
  defaultTypeCode={mode === "add" ? defaultTypeCode : undefined}
/>
```

---

## `PartyTypesTab` Behavior

No changes needed — preselect logic was already implemented:

```ts
useEffect(() => {
  if (assignments && assignments.length > 0) {
    // existing: sync from loaded assignments
    setSelectedIds(new Set(assignments.map((a) => a.party_type_id)));
    const primary = assignments.find((a) => a.is_primary);
    setPrimaryId(primary?.party_type_id ?? null);
  } else if (!partyId && defaultTypeCode && allTypes) {
    // add mode: preselect matching type code
    const matchingType = allTypes.find((t) => t.type_code === defaultTypeCode);
    if (matchingType) {
      setSelectedIds(new Set([matchingType.id]));
      setPrimaryId(matchingType.id);
    }
  }
}, [assignments, partyId, defaultTypeCode, allTypes]);
```

- Resolves type by **code**, not ID.
- Gracefully ignores unknown codes (`matchingType` will be undefined).
- Sets matched type as both selected and primary.

---

## Save Behavior

1. User opens Customers filtered view → clicks Add Party → "New Customer" tab opens.
2. Party Types tab shows `CUSTOMER` pre-selected and marked as primary.
3. User fills in details and saves.
4. `createParty()` saves the party record.
5. After save, the tab title updates to `Party — {display_name}` and route updates to `/record/{id}?mode=edit`.
6. User can then go to Party Types tab and click **Save Types** to persist the preselected CUSTOMER assignment.

**Note:** The party type preselection is UI state only until the user explicitly saves via the Party Types tab. This matches the existing save flow for party type assignments — they are saved separately via `savePartyTypeAssignments`. This is the correct architectural pattern (no schema change needed).

---

## QA Scenarios

| Scenario | Expected | Code-verified |
|---|---|---|
| A — Add from Customers | Route: `…/record/new?defaultType=CUSTOMER`, tab: "New Customer", CUSTOMER preselected | ✅ |
| B — Add from Vendors | Route: `…/record/new?defaultType=VENDOR`, tab: "New Vendor", VENDOR preselected | ✅ |
| C — Add from All Parties | Route: `…/record/new`, tab: "New Party", no preselection | ✅ |
| D — Invalid query `?defaultType=BAD_CODE` | Allowed set check fails, `defaultTypeCode=undefined`, no crash, generic form | ✅ |
| E — Draft preservation | `defaultTypeCode` flows from route → page → form → types-tab; draft store uses `frozenDefaultsRef` — type selection stable on tab switch | ✅ |
| E2 — Banks filtered view | `BANK` not in `ALLOWED_DEFAULT_TYPE_CODES` → generic "New Party" tab | ✅ |

---

## TypeScript / Build Results

```
npx tsc --noEmit   → Exit code 0 (PASS — 0 errors)
npx next build     → Exit code 0 (PASS — compiled in 8.4s)
```

---

## Known Limitations

1. **Party type save is a separate action.** After creating the party, the user must click "Save Types" on the Party Types tab to persist the pre-selected assignment. The preselection is UI-state only until that click. This is the existing design for party type assignments and is intentional — the party must exist (have an ID) before assignments can be saved.
2. **No visual header badge for the pre-selected type before save.** The Party Types tab shows the selection highlighted, but the form header title does not show a type badge until the party is saved. Per the prompt spec, this is acceptable: _"If header badge is hard to show before save, not required."_

---

## Next Recommended Phase

The manual browser QA from **ERP GLOBAL UI.4F** (gate decision `PASS WITH NOTES`) is still pending. Sameer should complete the checklist in `implementation_Review/ERP_GLOBAL_UI_4F_RUNTIME_QA_AND_PERFORMANCE_GATE_REPORT.md` at the next opportunity.

---

*Report generated by Cursor — ERP PARTY MASTER UX FIX.1 — 2026-06-14*
