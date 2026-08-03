# HR.DOCLINK.1 — Automatic Employee & Dependent Document Linking — Plan

**Date:** 2026-08-03
**Status:** PLAN APPROVED — decisions D1–D3 resolved by Sameer (2026-08-03). Implementation in progress.
**Requested by:** Sameer
**Related:** HR.14A wizard, HR.14B doc-to-record wizard, DMS AI Intake, HR.DOC_BROWSER.1

---

## 1. The Request (in Sameer's words)

1. "When I create employee from documents, the documents should create automatic link
   with the employee so I don't need to go to each document and link it."
2. "The same for the dependent — add to the add/edit dependent form document linking
   where it can be **multiple files linking at the same time** — I am not supposed to
   select one file and then add another."
3. "Once I save, the document will be linked to the employee or dependent, and inside
   the document edit, Links will show me the link."

---

## 2. Deep Investigation — What Works Today vs. What's Broken

### 2.1 Live database evidence (2026-08-03)

```
dms_document_links (active rows):
  link_role='hr14a_source', entity_type='employee'           → 9 rows  (wizard DOES auto-link)
  link_role=NULL,           entity_type='employee'           → 5 rows  (manually linked one-by-one)
  link_role=NULL,           entity_type='employee_dependent' → 4 rows  (manually linked TODAY,
                                                                        11:03–11:43, docs 93/91/88/81
                                                                        → dependent #1 Irina, one at a time)
```

The 4 dependent links created today, each ~5–35 minutes apart, are exactly the
pain being reported: one document at a time via each document's Links section.

### 2.2 Flow-by-flow audit

| Flow | Links created? | Detail |
|---|---|---|
| **HR.14A** Create Employee from Documents wizard | ✅ YES | `createEmployeeFromDmsDocuments` Step 5 links every selected doc (`hr14a_source`, idempotent, + document event). Confirmed in DB (employees 2, 3, 4). |
| **HR.14B** Create Dependent from Document wizard | 🐛 **BUG** | `createDependentFromDms` links docs to `entity_type='employee'` — **NOT to the new dependent**. Dependent docs never appear under the dependent (Doc Browser Column 2 empty, Links show employee). `src/server/actions/hr/document-to-record.ts` line ~726. |
| **DMS AI Intake approve** (single + batch finalize) | ❌ **NO LINKS — MAIN GAP** | `approveAiIntakeAndCreateDocument` and the saga **fully support a `links[]` input already**, but the review screen (`dms-ai-intake-page-client.tsx`) never sends it. The AI's "Matched Parties" card is display-only. No employee matching is surfaced at all. Every intake-approved document is born orphaned. |
| **Dependent Add/Edit dialog** (compliance tab) | ❌ NOTHING | Only a hidden legacy single `dms_document_id` field. No document linking UI at all. |
| **Compliance add-from-DMS dialogs** | ✅ YES | `compliance.ts` calls `ensureDmsDocumentLinkedToEntity` (identity docs etc.). |

### 2.3 Infrastructure that already exists (heavy reuse — low risk)

| Piece | Where | Reuse for |
|---|---|---|
| `links[]` input on intake approve + saga | `ai-intake.ts` (`ApproveIntakeSchema.links`) | 1A — server side is DONE |
| Multi-select document picker (checkbox rows, search) | `dms-attach-document-picker.tsx` | 1B dependent dialog |
| `getAvailableDmsDocumentsForLink(entityType, id, search)` | `entity-documents.ts` | 1B (already generic — works for `employee_dependent`) |
| `linkDmsDocumentToEntity` / `ensureDmsDocumentLinkedToEntity` / `unlinkDmsDocumentFromEntity` | `entity-documents.ts` | 1B, 1C |
| Entity search combobox (`DmsLinkEntitySelect`) incl. dependent search | `search-link-entity-options.ts` | 1A manual add row |
| Link display-name resolver (handles `employee_dependent` → "Name · Spouse of X") | `resolve-link-entity-display-name.ts` | Requirement 3 — **already satisfied** once links exist |
| Phase 13 entity matcher (employee/party/company candidates, scored) | `lib/dms/entity-matching/` | 1A suggestions |
| `DmsEntityDocumentsTab` with multi-select "Link Existing" | employee form Documents section | already live for employees |

**Requirement 3 needs no code**: the document record's Links section already lists and
resolves employee and dependent links — it just has nothing to show because the
upstream flows never create the links.

---

## 3. Solution Design

### 1A — AI Intake Approve: "Link to ERP Records" panel (the automatic-link gap)

New card on the AI Intake Review screen (single-file AND batch-draft finalize —
both share this screen and the same `sharedPayload`):

```
┌─ Link to ERP Records ─────────────────────────────────────────────┐
│ Suggested (auto-detected):                                        │
│  ☑ Employee — Sameer Fahmi Abu Elayyan (EMP-000001)   96% match   │
│  ☐ Party — Alliance Gulf Transport LLC                 60% match  │
│                                                                   │
│ + Add link manually:  [Entity Type ▾] [Search entity…      ] [+]  │
│ Selected: [Employee — Sameer ×] [Dependent — Irina (Spouse) ×]    │
└───────────────────────────────────────────────────────────────────┘
```

- **Suggestions**: extracted person name / Emirates ID / passport number from the
  AI result matched against `employees` (+ `employee_dependents`); AI's existing
  party matches (`suggested_links_json`) listed too. Strong matches (exact ID-number
  match, or name score ≥ 0.85) come **pre-ticked** — approval links them with zero
  extra clicks. Weaker matches are listed unticked.
- **Manual add row**: entity type combobox + existing `DmsLinkEntitySelect`
  (already searches employees, dependents, parties, companies…) → chips with ×.
- On approve: the chips array is passed as `links[]` in the existing payload field.
  **No server/schema change** — link creation already happens inside the approve saga.
- New helper `suggestIntakeEntityLinks(uploadSessionId)` (server): builds the
  suggestion list from AI result + identity-number lookups. Read-only, admin client,
  no auto-writes (Phase 13 "human-review-only" rule respected — the human is the
  Approve click).

### 1B — Dependent Add/Edit dialog: multi-document linking section

Inside the existing Add Dependent / Edit Dependent `ERPChildDialogForm`
(compliance tab), a new **Linked Documents** section under Document Details:

```
── LINKED DOCUMENTS ────────────────────────────────────────────
  📄 Passport — Irina Caraulan        [Passport] [Valid]   (×)
  📄 Emirates ID — Irina Caraulan     [EID]      [Valid]   (×)
  [+ Link Documents]                       2 linked
```

- **[+ Link Documents]** opens a nested picker dialog (reuses
  `DmsAttachDocumentPicker` — checkbox multi-select with search) fed by
  `getAvailableDmsDocumentsForLink("employee_dependent", id)`. Tick 5 docs,
  press Add — all staged at once. **No one-at-a-time.**
- **Edit mode**: current links load from `getDmsDocumentsByEntity("employee_dependent", id)`;
  additions/removals are staged and applied **on Save** (per request: "once I save,
  the document will be linked").
- **Add mode**: staged doc IDs are linked right after the dependent row is created
  (we need its new id first).
- New server action `applyEmployeeDependentDocumentLinks(dependentId, { addDocumentIds, removeDocumentIds })`
  in `compliance.ts` — loops `ensureDmsDocumentLinkedToEntity` / `unlinkDmsDocumentFromEntity`,
  permission `hr.employees.update` + `dms.documents.edit` (or dms.admin), audit-logged.
- Legacy single `dms_document_id` stays untouched (backward compat; already merged
  as a fallback source by Doc Browser).
- Result is immediately visible in: dependent dialog, HR Document Browser
  (dependent node), and each document's Links section.

### 1C — Bug fix: HR.14B wizard links to the wrong entity

`createDependentFromDms` — after inserting the dependent, link the selected docs to
`entity_type='employee_dependent'`, `entity_id=<new dependent id>` (upsert, idempotent).
See D1 below for whether the employee link is kept as well.

### 1D — Verification only (no code)

Document record → Links section already shows employee and dependent links with
resolved names. UAT will confirm end-to-end after 1A–1C.

---

## 4. Files

### New
| File | Purpose |
|---|---|
| `src/features/dms/intake/dms-intake-link-panel.tsx` | 1A "Link to ERP Records" card (suggestions + manual add + chips) |
| `src/features/hr/employees/compliance/dependent-document-links-section.tsx` | 1B linked-docs list + picker dialog for the dependent form |

### Modified
| File | Change |
|---|---|
| `src/server/actions/dms/ai-intake.ts` | Add `suggestIntakeEntityLinks` read-only helper (employee/dependent/party suggestions) |
| `src/features/dms/intake/dms-ai-intake-page-client.tsx` | Mount link panel; include chips in `sharedPayload.links` (covers single + batch finalize) |
| `src/server/actions/hr/compliance.ts` | Add `applyEmployeeDependentDocumentLinks`; wire into dependent create/update flows |
| `src/features/hr/employees/tabs/employee-compliance-tab.tsx` | Dependent Add/Edit dialogs gain Linked Documents section (staged, applied on Save) |
| `src/server/actions/hr/document-to-record.ts` | 1C fix: link docs to the new dependent |

No DB migrations. No new tables. No schema changes.

---

## 5. Decisions — RESOLVED by Sameer (2026-08-03)

| # | Question | Decision |
|---|---|---|
| **D1** | Link dependent documents to dependent only, or both dependent + employee? | **Dependent only** ✅ |
| **D2** | Intake suggestions: pre-tick threshold? | **Only exact identity-number matches pre-ticked** ✅ — name matches are listed but unticked |
| **D3** | Add the link panel to the DMS Review Queue path in this phase? | **Include now** ✅ |

---

## 6. Execution Order & Effort

| Step | What | Effort |
|---|---|---|
| 1 | 1C bug fix (wrong entity link) | 0.5 h |
| 2 | 1B dependent dialog multi-link (action + section + wiring) | 4 h |
| 3 | 1A intake link panel (suggest helper + panel + payload) | 5 h |
| 4 | Lint + tsc + tests + browser UAT (upload→approve→auto-link; dependent multi-link; Links section; Doc Browser) | 2 h |
| | **Total** | **~11.5 h** |

Risk: LOW — server-side link plumbing already exists and is battle-tested
(employee Documents tab, HR.14A); this phase is mostly UI wiring plus one bug fix.
