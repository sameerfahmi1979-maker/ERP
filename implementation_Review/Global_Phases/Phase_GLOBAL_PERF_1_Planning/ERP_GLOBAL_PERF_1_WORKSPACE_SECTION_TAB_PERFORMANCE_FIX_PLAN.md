# ERP GLOBAL PERF.1 — Workspace Section Tab Performance Fix Plan

**Document type:** Planning document (review only — no implementation in this phase)  
**Phase code:** ERP GLOBAL PERF.1  
**Status:** PLAN ONLY — awaiting Sameer review and explicit approval before coding  
**Date:** 2026-06-20  
**Author:** Cursor Agent (investigation + planning)  
**Related investigation:** In-conversation tab slowness analysis (Edit Employee → Documents example)

---

## 1. Executive summary

Users report that **section tabs inside workspace record forms** (for example: Edit Employee → Documents, Compliance, Time) feel **slow** and appear to **keep re-rendering** when clicked. The same behaviour is reported **across many modules**, not only HR.

Investigation shows this is **primarily an application architecture issue**, not a Supabase plan limit:

- Large record forms mount **all section panels at once** instead of lazy-loading them when first opened.
- That triggers a **burst of 50+ parallel TanStack Query / server-action calls** on a single record open (Employee is the worst example).
- The Documents tab has an additional **N+1 database pattern** (one query per linked file count).
- Section switches cause **full parent form re-renders** and a **fade-in animation** on every activation, which feels like repeated loading.

**Party Master already solves the main pattern correctly** using `lazyMount` on `ERPRecordSectionPanel`. HR Employee and most other multi-tab workspace forms do **not**.

This plan proposes a **phased, system-wide performance fix** starting with **Employee Master** as the pilot (highest pain), then rolling the same standard to Candidate, Organization, Branch, and other multi-section workspace forms.

**Supabase plan upgrade is not recommended as the first fix.** Upgrade only if database metrics remain saturated after these app changes.

---

## 2. Problem statement (what users experience)

### 2.1 Reported symptoms

| Symptom | Example |
|---------|---------|
| Tab click feels slow | Edit Employee → click **Documents** — delay before content feels ready |
| UI “keeps rendering” | Switching between Compliance / Time / Documents — flicker or fade each time |
| Slowness is everywhere | Same feel on other large record screens, not only HR |
| Worse on first open | Opening a record for the first time in a session feels heaviest |

### 2.2 What users expect

- Opening a record should feel **fast on the default section** (usually Overview or Profile).
- Other sections should load **when first visited**, not all at once in the background.
- Clicking an already-visited section should feel **instant** (within cache window), without visible flicker.
- Documents list should load in **one or two server round-trips**, not scale badly with document count.

---

## 3. Investigation summary (evidence)

### 3.1 Architecture: section panels mount everything immediately

`ERPRecordSectionPanel` supports lazy mounting via `lazyMount={true}`:

- When `lazyMount` is **false** (default): all sections mount on first record render.
- When `lazyMount` is **true**: a section mounts only after the user first activates it, then stays mounted (keepMounted pattern).

**Employee workspace** (`src/features/hr/employees/employee-workspace-form.tsx`) defines **11 sections** and uses **`lazyMount` on none of them**:

| Section ID | Component | Lazy today? |
|------------|-----------|-------------|
| overview | EmployeeOverviewTab | No |
| profile | EmployeeProfileTab | No |
| compliance | EmployeeComplianceTab | No |
| time | EmployeeTimeTab | No |
| payroll | EmployeePayrollTab | No |
| operations | EmployeeOperationsTab | No |
| hr-actions | EmployeeHrActionsTab | No |
| documents | DmsEntityDocumentsTab | No |
| letters | HrLetterGenerator | No |
| ai-review | HrAiReviewTab | No |
| audit | Placeholder / future | No |

**Party Master reference** (`src/features/master-data/parties/party-workspace-form.tsx`) uses `lazyMount` on licenses, tax, contacts, addresses, bank, documents, services, notes, audit, compliance, ai_review — **correct pattern**.

**HR module:** zero files under `src/features/hr` use `lazyMount` today.

### 3.2 Query storm on Employee record open

Because all sections mount immediately, all their `useQuery` hooks subscribe at once. Approximate counts from source review:

| Section | Approx. `useQuery` hooks |
|---------|--------------------------|
| Overview | 6 |
| Profile | 7 |
| Compliance | 12 |
| Time | 10 |
| Payroll | 10 |
| Operations | 7 |
| HR Actions | 8 |
| Documents (+ compliance cards) | 2 |
| **Total (HR employee tabs)** | **~62** |

Global TanStack Query defaults are reasonable (`staleTime: 5 min`, `refetchOnWindowFocus: false` in `src/lib/query/query-client.ts`), but they **do not prevent the first-load burst**.

Some HR tabs override with `refetchOnMount: "always"` (e.g. leave lists in Time tab), causing refetch even when cache exists.

### 3.3 Documents tab: server-side N+1

`getDmsDocumentsByEntity` (`src/server/actions/dms/entity-documents.ts`) loops linked documents and runs a **separate count query** on `dms_document_files` for **each document**. With 20 linked documents, that is **1 main query + 20 count queries** per Documents load.

Additionally, `DmsEntityDocumentsTab` renders `DmsEntityDocumentComplianceCards`, which calls `getDmsEntityDocumentComplianceSummary` — a second heavy server action (rules, linked docs, optional AI findings).

Both mount when the Employee form opens, even if the user never clicks Documents.

### 3.4 Re-render and UX on section switch

When user clicks a section tab:

1. `setActiveSection` in `EmployeeWorkspaceForm` re-renders the **entire form tree**.
2. Active panel uses `animate-in fade-in duration-200` every time (`erp-record-workspace-form.tsx`).
3. Inactive panels use CSS `hidden` — they stay in DOM with all hooks active.
4. `profileTabProps` object is recreated every parent render → Profile tab always receives new props reference.
5. A single `<form id="employee-workspace-form">` wraps **all sections** with `onInput={syncDraft}` / `onChange={syncDraft}`.

### 3.5 Record page server fetch

Employee record page uses `force-dynamic` and `revalidate = 0` (`src/app/(protected)/admin/hr/employees/record/[id]/page.tsx`). Every workspace navigation to that route triggers a full server fetch. This is **separate from in-form section tabs** but contributes to “everything feels slow” when switching workspace tabs.

### 3.6 Supabase plan relevance

Parallel server actions can stress connection pool on smaller compute tiers, but investigation did **not** identify Supabase as the primary root cause. **Fix application patterns first**; monitor Supabase CPU/connections after.

---

## 4. Root cause ranking

| Priority | Root cause | Impact | Fix category |
|----------|------------|--------|--------------|
| P0 | All sections mount at once (no `lazyMount`) | Critical | Architecture |
| P0 | ~62 parallel queries on Employee open | Critical | Architecture + data fetching |
| P0 | Documents N+1 file count loop | High | Server action |
| P1 | Compliance cards load when Documents hidden | High | Conditional render |
| P1 | Full-tree re-render on section change | Medium | React optimization |
| P1 | Fade-in animation on every section switch | Medium | UX |
| P2 | `refetchOnMount: "always"` in some HR tabs | Medium | Query policy |
| P2 | Shared form wrapper + draft sync on all sections | Low–Medium | Form scope |
| P2 | `force-dynamic` on all record pages | Low–Medium | Next.js caching |
| P3 | No list virtualization for large document lists | Low | UI (only if many docs) |

---

## 5. Design principles for the fix

1. **Follow existing ERP standard** — `ERPRecordSectionPanel` + `lazyMount` is already documented and used by Party Master. Extend, do not reinvent.

2. **Pilot on Employee, then roll out** — Employee is the heaviest form; success there validates the pattern for Candidate and others.

3. **Do not break save / dirty / draft behaviour** — Workspace rules (UI.4B, UI.4E.2) must remain intact:
   - Dirty dot on workspace tab bar
   - Unsaved changes dialog on close
   - Draft preservation on workspace tab switch
   - `forceCloseActiveTab` after save (not `handleRequestClose`)

4. **Profile section special case** — Employee save uses `FormData` from `#employee-workspace-form` plus controlled `comboboxForm` state. Any section in that form may affect save if fields are inside the same `<form>`. Plan must respect which sections participate in save.

5. **Child dialogs stay blocking** — Compliance, Documents attach dialog, etc. must continue using `ERPChildDialogForm` and `onChildOpen` → `isChildDialogOpen` on parent.

6. **Minimal scope per phase** — Each phase should be independently testable and revertible.

7. **Measure before and after** — Network tab request count and subjective tab switch speed on same employee record.

---

## 6. Recommended fix strategy (phased)

### Phase A — Quick wins (Employee pilot)

**Goal:** Opening Edit Employee triggers **≤5 network requests** until user leaves Overview/Profile. Documents tab loads in **≤2 server actions** without N+1.

| # | Task | Detail |
|---|------|--------|
| A1 | Add `lazyMount` to Employee sections | All sections except Profile (see §7.1 for Profile decision) |
| A2 | Fix N+1 in `getDmsDocumentsByEntity` | Single aggregated file count query |
| A3 | Defer compliance cards | Render `DmsEntityDocumentComplianceCards` only when Documents section active or lazy-mounted |
| A4 | Smoke test Employee | Manual QA checklist §10 |

**Estimated effort:** 1–2 days  
**Risk:** Low–medium (lazyMount + save form interaction)

---

### Phase B — Employee polish + HR rollout

**Goal:** Tab switches feel instant; Compliance no longer fires 12 queries on unrelated section visits.

| # | Task | Detail |
|---|------|--------|
| B1 | Memoize heavy tab components | `React.memo` on Compliance, Time, Payroll, Documents tabs |
| B2 | Stabilize `profileTabProps` | `useMemo` in `employee-workspace-form.tsx` |
| B3 | Section fade-in policy | First visit only, or remove for section switches |
| B4 | Compliance fetch strategy | Option: lazy sub-sections OR bundled server action (see §8) |
| B5 | Audit `refetchOnMount: "always"` | Time/leave and global HR lists — align with 5 min staleTime + mutation invalidation |
| B6 | Candidate workspace `lazyMount` | Same pattern as Employee |
| B7 | HR QA pass | All HR record forms |

**Estimated effort:** 2–3 days  
**Risk:** Medium (Compliance bundle is larger change)

---

### Phase C — System-wide standard + optional tuning

**Goal:** No multi-tab workspace form ships without lazy section policy. Record navigation tuned where safe.

| # | Task | Detail |
|---|------|--------|
| C1 | Organization / Branch workspace `lazyMount` | Audit section count and queries |
| C2 | Cursor rule or standard doc update | “Multi-section workspace forms MUST use lazyMount except save-critical sections” |
| C3 | Record page revalidate review | Evaluate `revalidate` for record shell vs mutation freshness |
| C4 | Documents list pagination | Only if employees commonly have 50+ linked docs |
| C5 | ERP GLOBAL UI.4F-style performance gate | Re-run perf checklist after PERF.1 |

**Estimated effort:** 2–4 days (spread across modules)  
**Risk:** Low per module if Phase A/B pattern is copied

---

## 7. Detailed design — Phase A

### 7.1 Employee `lazyMount` section map

**File:** `src/features/hr/employees/employee-workspace-form.tsx`

| Section | Recommended `lazyMount` | Notes |
|---------|-------------------------|-------|
| overview | **Yes** | Read-only summaries; many `useQuery` calls — must not run until opened |
| profile | **No** (initially) | Save reads `FormData` from shared form; Profile fields must exist in DOM for save OR save must be refactored |
| compliance | **Yes** | 12 queries; heaviest secondary tab |
| time | **Yes** | 10 queries |
| payroll | **Yes** | 10 queries; sensitive — still lazy OK (loads on visit) |
| operations | **Yes** | 7 queries |
| hr-actions | **Yes** | 8 queries |
| documents | **Yes** | DMS + compliance cards |
| letters | **Yes** | Report generator |
| ai-review | **Yes** | AI panels |
| audit | **Yes** | When implemented |

**Profile long-term option (Phase B):** Split Profile into its own form boundary or gather Profile via controlled state only (already partially true for combobox fields). Then Profile can lazy-mount too. **Not required for Phase A.**

**Implementation pattern (copy from Party Master):**

```tsx
<ERPRecordSectionPanel id="documents" activeId={activeSection} lazyMount>
  <DmsEntityDocumentsTab ... />
</ERPRecordSectionPanel>
```

### 7.2 Fix N+1 in `getDmsDocumentsByEntity`

**File:** `src/server/actions/dms/entity-documents.ts`

**Current (problem):**

```
FOR each document_link:
  SELECT count(*) FROM dms_document_files WHERE document_id = ?
```

**Recommended approach:**

1. Fetch all links + document fields in **one query** (unchanged main select).
2. Collect all `document_id` values from result.
3. Run **one** query:

   ```sql
   SELECT document_id, COUNT(*) AS files_count
   FROM dms_document_files
   WHERE document_id IN (...)
     AND deleted_at IS NULL
   GROUP BY document_id
   ```

4. Map counts into row builder in memory.

**Edge cases:**

- Empty link list → return early, no second query.
- Confidential document redaction logic → unchanged.
- Party and Employee both use this action — fix benefits **all entity document tabs**.

**Testing:**

- Employee with 0, 1, 10, 50 linked documents — verify counts match UI.
- Party Documents tab regression.

### 7.3 Defer `DmsEntityDocumentComplianceCards`

**Options (pick one in implementation):**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A (preferred)** | Rely on `lazyMount` on Documents section only | Zero API change | Cards still load every Documents visit |
| **B** | Pass `enabled={isSectionActive}` from parent | Cards skip fetch until Documents visible | Requires prop drilling or context |
| **C** | Move cards behind collapsible “Compliance summary” | Less visual noise | Extra click |

**Recommendation:** Option **A** for Phase A (lazyMount alone removes cards from initial Employee open). Option **B** if cards should not block Documents list paint.

### 7.4 Files touched in Phase A (expected)

| File | Change type |
|------|-------------|
| `src/features/hr/employees/employee-workspace-form.tsx` | Add `lazyMount` to section panels |
| `src/server/actions/dms/entity-documents.ts` | Remove N+1; aggregate file counts |
| (Optional) `src/features/dms/entity-documents/dms-entity-documents-tab.tsx` | Conditional compliance cards |

**No database migration required for Phase A.**

---

## 8. Detailed design — Phase B

### 8.1 Compliance tab query reduction

**File:** `src/features/hr/employees/tabs/employee-compliance-tab.tsx`

Today: six sub-sections each mount list + lookup queries immediately:

- Identity documents (+ types)
- Medical insurance
- Dependents (+ relationship types)
- Access cards (+ types)
- Training (+ categories + types)
- Medical records (+ types)

**Option 1 — Lazy sub-sections (lower risk):**

- Wrap each sub-section in local “first expanded” or accordion lazy mount.
- Only Identity Documents loads when Compliance section first opens; others load when scrolled into view or expanded.

**Option 2 — Bundled server action (higher payoff, more work):**

- New action: `getEmployeeComplianceBundle(employeeId)` returning summaries + lookup option lists in one round-trip.
- Client uses single `useQuery` for Compliance tab.
- Requires careful permission checks (medical records restricted).

**Recommendation:** Option 1 for Phase B unless Sameer prefers bundle for long-term API cleanliness.

### 8.2 React render optimization

**File:** `src/features/hr/employees/employee-workspace-form.tsx`

```tsx
const profileTabProps = useMemo(() => ({
  employee: employee ?? null,
  mode,
  formId: FORM_ID,
  getDraftDefault,
  syncDraft,
  writeDraftField,
  form: comboboxForm,
  setForm: setComboboxForm,
}), [employee, mode, getDraftDefault, syncDraft, writeDraftField, comboboxForm]);
```

Wrap exports:

- `EmployeeComplianceTab`
- `EmployeeTimeTab`
- `EmployeePayrollTab`
- `DmsEntityDocumentsTab` (if props stable)

**File:** `src/components/workspace/erp-record-workspace-form.tsx`

- Change fade-in: only when `!hasBeenActiveBefore` per section, or remove `animate-in` for section switches.

### 8.3 `refetchOnMount: "always"` audit

**Known location:** `src/features/hr/employees/tabs/employee-time-tab.tsx` (leave section).

**Policy after fix:**

- Default: inherit global `staleTime: 5 min`.
- After create/update/delete: `invalidateQueries` on relevant keys (already standard elsewhere).
- `refetchOnMount: "always"` only where real-time freshness is a **documented business requirement**.

### 8.4 Candidate workspace

**File:** `src/features/hr/recruitment/candidate-workspace-form.tsx`

Sections: overview, profile, documents, interviews, offers, onboarding, conversion — **none use lazyMount today**.

Apply same map as Employee after Employee Phase A is verified.

---

## 9. Detailed design — Phase C

### 9.1 Modules to audit for lazyMount

| Module | Form file | Priority |
|--------|-----------|----------|
| Party Master | `party-workspace-form.tsx` | Done ✓ |
| Employee | `employee-workspace-form.tsx` | Phase A |
| Candidate | `candidate-workspace-form.tsx` | Phase B |
| Organization | `organization-workspace-form.tsx` | Phase C |
| Branch | `branch-workspace-form.tsx` | Phase C |
| User | `user-workspace-form.tsx` | Phase C (audit only) |
| Role | `role-workspace-form.tsx` | Low (few sections) |
| Geography / Finance basics | Various | Audit only — many already lazy-mount Audit tab only |

### 9.2 Standard rule (proposed for `docs/standards/` or `.cursor/rules/`)

**ERP Workspace Section Performance Standard (draft):**

1. Any `ERPRecordWorkspaceForm` with **more than 3 sections** MUST use `lazyMount` on all sections that are not required for the primary save handler.
2. Any section with **more than 2 `useQuery` hooks** MUST be lazy-mounted unless justified in PR.
3. Server actions MUST NOT loop per-row queries when a single grouped query suffices (N+1 ban for list loaders).
4. Reference implementation: Party Master + Employee (post PERF.1).

### 9.3 Record page caching (optional)

**Current:** `force-dynamic` + `revalidate = 0` on employee record pages.

**Consideration:** Cache static shell data (employee header, code, name) with short revalidation (e.g. 60s) while TanStack Query handles tab data freshness.

**Caution:** Must not serve stale permission-sensitive data. Requires security review before change.

**Recommendation:** Defer to Phase C; not blocking tab switch UX if Phase A/B complete.

---

## 10. QA and success criteria

### 10.1 Manual test script (Employee pilot)

**Setup:** Dev server, one employee with ≥5 linked DMS documents, Chrome DevTools Network filtered to `fetch` / server actions.

| Step | Before (expected today) | After Phase A (target) |
|------|-------------------------|-------------------------|
| Open Edit Employee (Overview default) | 40–60+ requests | ≤8 requests |
| Wait 5s, click Documents | May still load / skeleton | ≤2 requests if first visit; 0 if cached |
| Click Compliance (first time) | Already loaded in background | Fresh burst only now (~12 max) |
| Click Documents again | Fade + possible refetch | No skeleton; instant if within staleTime |
| Click Profile, edit name, Save | Works | Must still work |
| Dirty dot + close dialog | Works | Must still work |
| Child dialog from Compliance | Blocks workspace | Must still work |

### 10.2 Automated checks

| Check | Command / method |
|-------|------------------|
| TypeScript | `npx tsc --noEmit` |
| Production build | `npm run build` |
| Lint (touched files) | ESLint on changed paths |

### 10.3 Supabase monitoring (after deploy)

Watch for 1 week in Supabase Dashboard:

- CPU average / peaks during single-user Employee open
- Database connections / pool usage
- Slow queries on `dms_document_files` and `dms_document_links`

**Upgrade plan only if** metrics remain high **after** PERF.1 Phase A+B in production-like usage.

---

## 11. Risks, constraints, and mitigations

| Risk | Mitigation |
|------|------------|
| Save fails if Profile fields not in DOM | Keep Profile eager in Phase A; document in QA |
| User expects Overview data on open without click | Overview is default `activeSection` — lazyMount still mounts Overview on first paint because it is active |
| Draft sync misses lazy section fields | Draft is Profile-focused today; lazy sections use separate queries — verify no regression |
| Medical permission boundaries in Compliance bundle | If bundling, enforce same RLS/permission checks as individual actions |
| Party/Documents regression from N+1 fix | Test Party Documents tab in QA |
| `animate-in` removal affects polish | First-visit-only animation preserves intent |

---

## 12. What NOT to do

| Do not | Why |
|--------|-----|
| Upgrade Supabase as first action | Does not fix mount-all or re-render patterns |
| Add global loading overlays | Masks root cause |
| Disable React Query globally | Breaks cache benefits |
| Convert all server actions to client Supabase | Violates ERP server action pattern |
| Remove workspace draft or dirty guards | Breaks UI.4B / UI.4E.2 standards |
| Lazy-mount Profile before save refactor | Risk breaking FormData save |

---

## 13. Rollout and approval gates

### Gate 0 — Planning (this document)

- [ ] Sameer reviews this plan
- [ ] Sameer approves phase scope (A only vs A+B vs full)
- [ ] Sameer confirms Employee as pilot

### Gate 1 — After Phase A

- [ ] QA script §10.1 passed on Employee
- [ ] tsc + build pass
- [ ] Implementation report written: `ERP_GLOBAL_PERF_1A_WORKSPACE_LAZY_MOUNT_AND_DMS_N1_FIX_IMPLEMENTATION_REPORT.md`
- [ ] `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` updated

### Gate 2 — After Phase B

- [ ] Candidate + Compliance strategy verified
- [ ] Implementation report for Phase B

### Gate 3 — After Phase C

- [ ] Standard rule published
- [ ] UI.4F-style perf gate re-run

---

## 14. Open questions for Sameer (before implementation)

1. **Profile lazy-mount:** Keep Profile always mounted in Phase A, or invest in save refactor so Profile can lazy-mount too?

2. **Compliance strategy:** Prefer lazy sub-sections (Option 1) or bundled API (Option 2)?

3. **Section animation:** Remove fade entirely, or first-visit-only?

4. **Phase scope:** Approve Phase A only first, or A+B in one sprint?

5. **Other pilot:** Is Employee the right pilot, or is Party/Documents traffic higher in daily use?

---

## 15. Appendix — key file reference

| Purpose | Path |
|---------|------|
| Section panel + lazyMount | `src/components/workspace/erp-record-workspace-form.tsx` |
| Employee workspace form | `src/features/hr/employees/employee-workspace-form.tsx` |
| Party reference (lazyMount) | `src/features/master-data/parties/party-workspace-form.tsx` |
| DMS entity documents tab | `src/features/dms/entity-documents/dms-entity-documents-tab.tsx` |
| DMS N+1 server action | `src/server/actions/dms/entity-documents.ts` |
| Compliance tab (query storm) | `src/features/hr/employees/tabs/employee-compliance-tab.tsx` |
| TanStack Query defaults | `src/lib/query/query-client.ts` |
| Workspace draft hook | `src/hooks/use-workspace-form-draft.ts` |
| Employee record page (dynamic) | `src/app/(protected)/admin/hr/employees/record/[id]/page.tsx` |
| Prior perf gate | `implementation_Review/Global_Phases/Phase_GLOBAL_UI_4F_Implementation/ERP_GLOBAL_UI_4F_RUNTIME_QA_AND_PERFORMANCE_GATE_REPORT.md` |

---

## 16. Next step

**Wait for Sameer review and explicit instruction to implement.**

When approved, implementation should start with **Phase A** only unless this document is amended to include Phase B in scope.

Suggested implementation prompt filename (when ready):

`ChatGPT/ERP_GLOBAL_PERF_1_WORKSPACE_SECTION_TAB_PERFORMANCE_FIX_IMPLEMENTATION_PROMPT.md`

---

*End of planning document.*
