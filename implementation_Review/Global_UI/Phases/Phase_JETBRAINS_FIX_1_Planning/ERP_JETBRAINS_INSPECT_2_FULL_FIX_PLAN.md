# ERP JETBRAINS FIX.1 — Coding-Only Inspection Fix Plan (`inspect_2`)

**Document type:** Planning document  
**Phase code:** ERP JETBRAINS FIX.1  
**Status:** PLAN — **coding-only scope approved by Sameer**; awaiting go-ahead to implement Steps 1+  
**Date:** 2026-06-20 (updated 2026-06-20 — coding-only scope)  
**Source reports:** `jetbrains/inspect_2/` (44 XML files) + cross-reference `jetbrains/Inspect_1/`  
**Prior analysis:** `implementation_Review/CODE_AUDIT_JETBRAINS_VALIDATION_AND_INDEPENDENT_ANALYSIS.md`  
**Validation method:** XML parse + line-by-line spot checks in `src/` and `package.json`

---

## 1. Executive summary

JetBrains inspected the full workspace and reported **27,702 findings** in `inspect_2`. **~83% (~23,000) is spelling, grammar, and markdown formatting** — explicitly **out of scope** for this phase.

**Approved scope (Sameer):** **Coding only.** Fix production code quality, security, and reliability in `src/` + `package.json`. **Do not** run a spelling/grammar cleanup sprint. **Do not** edit planning docs to satisfy SpellChecking or Grazie.

**In scope (~300–600 coding findings in `src/` after IDE scope is set):**

- Dependency CVE (`xlsx` dead package)
- Unvoided `invalidateQueries` / floating promises
- ESLint violations (`no-unused-vars`, `no-explicit-any`, hooks)
- Dead imports and unused locals
- HR server-action duplication (maintainability)
- Optional: unused exports, deprecations, minor style

**Out of scope permanently for FIX.1:**

- SpellCheckingInspection (8,291) — includes false “typos” on `Supabase`, `MOHRE`, `IBAN`, etc.
- GrazieInspection / GrazieStyle (grammar/style in comments and docs)
- All Markdown* inspections (table formatting, broken links in planning docs)
- Annotator noise on documentation

**Recommended approach:** **8 coding steps** (Step 0 = configure IDE, not edit docs). Minimum viable: **Steps 0–3** (~4–6 days). Steps 4–8 optional maintainability polish.

---

## 2. Scope policy — coding only (approved)

### 2.1 What we will NOT do

| Activity | Required? | Reason |
|----------|-----------|--------|
| Fix 8,000+ spell-check “typos” | **No** | Zero production benefit; flags `Supabase`, UAE terms, tech jargon |
| Fix Grazie grammar in comments/docs | **No** | Not code defects |
| Fix markdown tables in `implementation_Review/` | **No** | Planning docs only |
| Change Arabic / bilingual field labels for spell-check | **No** | `name_ar`, MOHRE, Makani, ADNOC, CICPA are valid ERP vocabulary |
| “Clean” noise by editing thousands of files | **No** | Waste of time |

### 2.2 What we WILL do for “noise”

**Exclude, not clean.** Step 0 configures JetBrains to **disable or scope out** spell/grammar/markdown inspections and limit the profile to `src/**` + `package.json`. That drops the report from ~27k to ~**300–600** coding items — **without changing a single doc file**.

### 2.3 Arabic & UAE terms (clarification)

Spell-check flagged terms like `Mohre`, `iban`, `makani`, `adnoc`, `cicpa` in `src/` — these are **Romanized UAE/business terms**, not bugs. Actual Arabic script in the codebase is minimal in spell-check output. **No action required** unless you optionally add a JetBrains custom dictionary for editor comfort (not a project deliverable).

---

## 3. Numbers at a glance

### 3.1 Raw inspection totals (`inspect_2`) — historical full scan

| Bucket | Count | % of total | FIX.1 action |
|--------|------:|----------:|--------------|
| **Total findings (full repo scan)** | 27,702 | 100% | Ignore bulk |
| **Spelling / grammar / markdown** | ~23,000 | ~83% | **Exclude from scope — do not fix** |
| **Coding categories (all paths)** | ~4,600 | ~17% | Filter to `src/` only |
| **Coding findings in `src/`** | ~1,588 | ~6% | ~300–600 after false-positive filter |
| **Production-critical (P0–P1)** | ~15–30 | <0.1% | **Fix first (Steps 1–3)** |

### 3.2 Coding-only target (after Step 0 scope)

| Inspection (in scope) | ~`src/` count | Step |
|-----------------------|-------------:|------|
| Eslint | 346 | 3 |
| ES6MissingAwait | 102 | 2 |
| JSIgnoredPromiseFromCall | 60 | 2 |
| ES6UnusedImports | 139 | 4 |
| JSUnusedLocalSymbols | 79 | 4 |
| DuplicatedCode (HR actions only) | ~50 real | 5 |
| JSUnusedGlobalSymbols | 396 | 6 (review) |
| VulnerableLibrariesLocal | 1 (package.json) | 1 |
| **Estimated total to address** | **~300–600** | Steps 1–8 |

### 3.3 What “actionable” means in this plan

| Label | Meaning |
|-------|---------|
| **P0 — Critical** | Security, CVE, or data-integrity risk |
| **P1 — High** | Reliability / stale UI / real lint errors in production paths |
| **P2 — Medium** | Maintainability, duplication, dead exports |
| **P3 — Low** | Style, false positives, optional cleanup |
| **Skip** | Not production; **exclude from JetBrains profile — never fix in FIX.1** |
| **Out of scope** | SpellChecking, Grazie*, Markdown* — **no cleanup task** |

---

## 4. Where the reports live

```
jetbrains/
├── Inspect_1/          ← First JetBrains run (baseline)
└── inspect_2/          ← Second run (this plan’s primary source)
    ├── .descriptions.xml
    ├── ES6MissingAwait.xml
    ├── Eslint.xml
    ├── DuplicatedCode.xml
    ├── VulnerableLibrariesLocal.xml
    └── … (44 files total)
```

Each XML file contains `<problem>` entries with:

- `<file>` — path in the repo  
- `<line>` — line number at scan time  
- `<description>` — human-readable issue  
- `<problem_class id="…">` — inspection type  

**Note:** Line numbers may drift after code changes. Always grep the pattern in source, not only the XML line.

---

## 5. Complete finding inventory (all `inspect_2` categories)

Every inspection type is listed below. Rows marked **Out of scope** are **excluded from FIX.1** — configure JetBrains to ignore them; **do not create fix tasks or edit files for them.**

| # | Inspection file | Total | In `src/` | Verdict | Step |
|---|-----------------|------:|----------:|---------|------|
| 1 | SpellCheckingInspection | 8,291 | 1,242 | **Out of scope** — disable inspection | — |
| 2 | MarkdownIncorrectTableFormatting | 5,869 | 0 | **Out of scope** | — |
| 3 | Annotator | 4,709 | 0 | **Out of scope** (doc noise) | — |
| 4 | GrazieInspection | 2,151 | 307 | **Out of scope** — disable inspection | — |
| 5 | MarkdownIncorrectlyNumberedListItem | 1,231 | 0 | **Out of scope** | — |
| 6 | JSUnusedGlobalSymbols | 943 | 396 | P2 Valid (review before delete) | Step 6 |
| 7 | Eslint | 907 | 346 | P1 Valid | Step 3 |
| 8 | GrazieStyle | 731 | 14 | **Out of scope** | — |
| 9 | DuplicatedCode | 655 | 282 | P2 Valid (HR server actions) | Step 5 |
| 10 | JSAnnotator | 413 | 0 | Skip / overlaps ESLint | — |
| 11 | ES6UnusedImports | 283 | 139 | P2 Valid | Step 4 |
| 12 | JSDeprecatedSymbols | 259 | 24 | P3 Valid (React 19 types) | Step 7 |
| 13 | ES6MissingAwait | 205 | 102 | P1 Valid | Step 2 |
| 14 | JSUnusedLocalSymbols | 163 | 79 | P2 Valid | Step 4 |
| 15 | TypeScriptUMDGlobal | 143 | 55 | Skip (mostly false +) | — |
| 16 | PackageJsonMismatchedDependency | 125 | 0 | Skip (UIUX archive) | — |
| 17 | JSIgnoredPromiseFromCall | 125 | 60 | P1 Mixed | Step 2 |
| 18 | HttpUrlsUsage | 97 | 3 | P3 Partial | Step 7 |
| 19 | MarkdownUnresolvedHeaderReference | 81 | 0 | **Out of scope** | — |
| 20 | PointlessBooleanExpressionJS | 79 | 39 | Skip (false + on `!!value`) | — |
| 21 | TypeScriptRedundantGenericType | 31 | 15 | P3 Style | Step 8 |
| 22 | ES6PreferShortImport | 27 | 13 | P3 Preference | Step 8 |
| 23 | MarkdownUnresolvedFileReference | 21 | 0 | **Out of scope** | — |
| 24 | JSCommentMatchesSignature | 19 | 9 | P3 Info | Step 8 |
| 25 | JSUnresolvedReference | 17 | 0 | Skip (bootstrap `.mjs` false +) | — |
| 26 | TrivialIfJS | 13 | 6 | P3 Style | Step 8 |
| 27 | UnnecessaryLocalVariableJS | 13 | 6 | P3 Style | Step 8 |
| 28 | JSUnusedAssignment | 13 | 4 | P3 Valid | Step 4 |
| 29 | ExceptionCaughtLocallyJS | 13 | 6 | P3 Style | Step 8 |
| 30 | HtmlUnknownAttribute | 11 | 0 | Skip | — |
| 31 | NpmUsedModulesInstalled | 11 | 0 | Skip (archive/scripts) | — |
| 32 | CssUnusedSymbol | 9 | 0 | Skip (Tailwind dynamic) | — |
| 33 | CssUnresolvedCustomProperty | 7 | 2 | P3 Manual review | Step 8 |
| 34 | CheckEmptyScriptTag | 7 | 0 | Skip | — |
| 35 | MarkdownUnresolvedLinkLabel | 7 | 0 | **Out of scope** | — |
| 36 | JSFileReferences | 5 | 0 | Skip | — |
| 37 | HtmlUnknownTarget | 5 | 0 | Skip | — |
| 38 | ES6RedundantAwait | 3 | 1 | P3 Style | Step 8 |
| 39 | VulnerableLibrariesLocal | 3 | 0 | P0 Valid (package.json) | Step 1 |
| 40 | MaliciousLibrariesLocal | 3 | 0 | Skip (UIUX archive) | Step 0 |
| 41 | PointlessArithmeticExpressionJS | 3 | 1 | P3 Trivial | Step 8 |
| 42 | CheckTagEmptyBody | 1 | 0 | Skip | — |

---

## 6. Already fixed or stale (do not re-fix blindly)

These were reported in `inspect_2` or the prior audit but are **already addressed** in current `main` (commit `6e43ebe` area):

| Finding | Was reported as | Current state |
|---------|-----------------|---------------|
| `getEmployeeCtx` duplicated 5× | DuplicatedCode / audit A1 | ✅ Fixed — `src/server/actions/hr/_shared/employee-context.ts` |
| Excel CVE active in runtime | VulnerableLibrariesLocal | ⚠️ Runtime uses `exceljs`; **`xlsx` still in package.json** — Step 1 |
| Audit log missing IP / user-agent | Not in JetBrains | ✅ Fixed — `extractIpAddress()` / `extractUserAgent()` in `audit.ts` |
| DMS upload bypassing Supabase client | TypeScriptUMDGlobal / audit A5 | ✅ Fixed — uses `@/lib/supabase/client` |
| `void invalidateQueries` in shared helpers | ES6MissingAwait | ✅ Fixed in `src/lib/query/invalidation.ts` |
| `UIUX_Design/` malicious axios | MaliciousLibrariesLocal | ✅ Mitigated — folder in `.gitignore` |

**When implementing:** Re-verify each XML line against live code before editing.

---

## 7. Gaps JetBrains did not report (add to plan manually)

These are **not** in `inspect_2` but were found independently and should be included in the same cleanup program:

| ID | Issue | Severity | Step |
|----|-------|----------|------|
| G1 | ~223 `console.*` calls remain in `src/` (concentrated in geography/finance actions) | Medium | Step 3 |
| G2 | ~41 `eslint-disable` suppressions (9× `exhaustive-deps` in workspace hooks) | Medium | Step 3 |
| G3 | Workspace section performance (no `lazyMount` on Employee) | Medium | Separate PERF.1 plan |
| G4 | DMS entity-documents N+1 (partially improved in latest push) | Medium | Verify in Step 2 QA |

---

## 8. Fix plan — 8 coding steps (recommended order)

Each step is designed to be **one reviewable unit** (one PR or one commit batch). Complete verification before moving to the next step.

---

### Step 0 — JetBrains coding-only profile (configuration only — no file edits)

**Goal:** Restrict inspections to **code quality in `src/`** — not spelling, grammar, or markdown.  
**Effort:** 30 minutes  
**Risk:** None  
**Important:** This step **excludes** noise. It does **not** mean editing 23,000 doc/comment “issues.”

**Disable or uncheck these inspections in the IDE profile:**

- SpellCheckingInspection  
- GrazieInspection  
- GrazieStyle  
- MarkdownIncorrectTableFormatting  
- MarkdownIncorrectlyNumberedListItem  
- MarkdownUnresolvedHeaderReference  
- MarkdownUnresolvedFileReference  
- MarkdownUnresolvedLinkLabel  

**Exclude these paths from scope:**

- `UIUX_Design/`
- `implementation_Review/`
- `ChatGPT/`
- `.agents/`
- `jetbrains/` (optional — keep for report archive in git)

**Include in scope (coding only):**

- `src/**`
- `package.json`
- `package-lock.json` (read-only verify)
- `supabase/migrations/**` (optional — SQL only, no spell-check)

**Optional (editor comfort only, not a FIX.1 task):** Add custom dictionary entries: `Supabase`, `MOHRE`, `IBAN`, `Makani`, `ADNOC`, `CICPA`, `combobox`, etc.

**Verification:** Re-run inspection on coding profile; expect **~300–600** findings in `src/` (down from 27,702 full scan).

**Gate:** Sameer confirms IDE profile saved as e.g. `ALGT ERP — Coding Only`.

---

### Step 1 — Critical security & dependencies (P0)

**Goal:** Remove known CVE and dead vulnerable packages from the dependency tree.  
**Effort:** 1–2 hours  
**Risk:** Low (xlsx unused in code)  

**Findings addressed:**

| Inspection | Issue |
|--------------|-------|
| VulnerableLibrariesLocal | `xlsx@0.18.5` — CVE-2023-30533, CVE-2024-22363 |
| G1 (partial) | Confirm no other vulnerable packages via `npm audit` |

**Tasks:**

1. Remove `"xlsx": "^0.18.5"` from `package.json` (export already on `exceljs` in `src/lib/export/excel.ts`).
2. Run `npm install` and confirm lockfile removes `xlsx`.
3. Run `npm audit` — document any remaining HIGH/CRITICAL items.
4. Smoke-test Excel export from Report Center / export menu.

**Files:**

- `package.json`
- `package-lock.json`
- `src/lib/export/excel.ts` (verify only)

**Verification:**

```bash
npx tsc --noEmit
npm run build
# Manual: trigger one Excel export in UI
grep -r "from ['\"]xlsx" src/   # expect zero matches
```

**Gate:** `npm audit` shows no CRITICAL on production dependencies; export works.

---

### Step 2 — Promise & cache reliability (P1)

**Goal:** Eliminate floating promises on TanStack Query invalidation and risky fire-and-forget async in effects.  
**Effort:** 1–2 days  
**Risk:** Low — pattern is additive (`void` prefix)  

**Findings addressed:**

| Inspection | Count in `src/` |
|--------------|----------------:|
| ES6MissingAwait | 102 |
| JSIgnoredPromiseFromCall | 60 (subset — real issues only) |

**Policy (standard going forward):**

```typescript
// After mutation — document fire-and-forget intent:
void qc.invalidateQueries({ queryKey: [...] });

// When UI must wait for fresh data:
await qc.invalidateQueries({ queryKey: [...] });

// In useEffect for async work:
void loadData();
// or
loadData().catch(handleError);
```

**Priority files (highest unvoided invalidation count):**

| File | ~Unvoided calls | Priority |
|------|----------------:|----------|
| `src/features/hr/employees/tabs/employee-time-tab.tsx` | 25 | P1 |
| `src/features/hr/employees/tabs/employee-compliance-tab.tsx` | 24 | P1 |
| `src/features/dms/documents/sections/dms-document-links-section.tsx` | 3 | P1 |
| `src/features/dms/documents/sections/dms-document-tags-section.tsx` | 2 | P1 |
| `src/features/dms/documents/sections/dms-document-comments-section.tsx` | 2 | P1 |
| `src/features/hr/time/leave/hr-leave-page-client.tsx` | 2 | P1 |
| AI client pages (`refetch()` without void) | ~15 | P2 |

**Real JSIgnoredPromiseFromCall fixes (not false positives):**

| File | Issue | Fix |
|------|-------|-----|
| `erp-send-email-dialog.tsx:173` | `generateAttachment()` in useEffect | `void generateAttachment()` |
| `dms-admin-file-storage-panel.tsx` | `loadFiles()` in useEffect | `void loadFiles()` |
| `assistant-page-client.tsx` | `loadSession()` | `void loadSession()` |

**Do NOT “fix” (false positives):**

- `onSubmit={() => handleSaveAndClose()}` on workspace forms — standard React event pattern.
- `refetch()` after user action where stale UI is acceptable — add `void` for lint only.

**Verification:**

```bash
# After fix: no bare invalidateQueries without void/await in feature tabs
rg "qc\.invalidateQueries|queryClient\.invalidateQueries" src/features --glob "*.tsx"
npx tsc --noEmit
npm run lint
```

**Gate:** ESLint `@typescript-eslint/no-floating-promises` clean on touched files; HR Employee tabs invalidate correctly after save.

---

### Step 3 — ESLint production debt (P1)

**Goal:** Clear real ESLint violations in `src/` only — **not** spell-check or markdown.  
**Effort:** 2–3 days  
**Risk:** Medium — touch many files; test affected UI  

**Findings addressed:**

| Inspection | `src/` count |
|--------------|-------------:|
| Eslint | 346 |
| G1 console.* | ~223 |
| G2 eslint-disable review | ~41 |

**Top ESLint rules in `src/` (from `inspect_2/Eslint.xml`):**

| Rule | ~Count | Action |
|------|-------:|--------|
| `@typescript-eslint/no-unused-vars` | 243 | Remove dead imports/vars |
| `@typescript-eslint/no-explicit-any` | 31 | Replace with proper types |
| `react-hooks/set-state-in-effect` | 26 | Review each — may need refactor |
| `react/no-unescaped-entities` | 22 | Escape `'` `"` in JSX text |
| `react-hooks/exhaustive-deps` | 12 | Review suppressions — especially workspace hooks |

**High-risk manual review (workspace hooks):**

| File | Suppressions | Why it matters |
|------|--------------|----------------|
| `src/hooks/use-workspace-form-draft.ts` | 3 | Tab draft preservation |
| `src/components/workspace/workspace-provider.tsx` | 2 | Tab open/close/dirty |
| `src/hooks/use-workspace-tab-dirty.ts` | 1 | Dirty dot on tab bar |

**Console → logger migration (G1):**

Priority files by volume:

- `src/features/master-data/finance-basics/actions.ts` (~90)
- `src/features/master-data/geography/actions.ts` (~65)
- `src/features/master-data/uom/actions.ts` (~46)

Use existing `src/lib/logger.ts` pattern from prior audit fix.

**Suggested batch order:**

1. Batch A: `no-unused-vars` only (safest, auto-fixable in IDE)
2. Batch B: `no-unescaped-entities` (mechanical)
3. Batch C: `no-explicit-any` in server actions and forms
4. Batch D: console → logger in master-data actions
5. Batch E: `exhaustive-deps` — one hook file at a time with QA

**Verification:**

```bash
npm run lint
npx tsc --noEmit
npm run build
```

**Gate:** `npm run lint` exits 0 on `src/`; workspace tab dirty/draft QA passed manually.

---

### Step 4 — Dead code & import cleanup (P2)

**Goal:** Remove unused imports, locals, and assignments without breaking public APIs.  
**Effort:** 1–2 days  
**Risk:** Low  

**Findings addressed:**

| Inspection | `src/` count |
|--------------|-------------:|
| ES6UnusedImports | 139 |
| JSUnusedLocalSymbols | 79 |
| JSUnusedAssignment | 4 |

**Tasks:**

1. Run IDE “Optimize imports” on `src/features/hr/` first (largest recent churn).
2. Remove unused locals flagged in XML — prefer IDE inspection over blind delete.
3. Do **not** remove variables prefixed with `_` if intentionally unused.

**Verification:** `tsc` + `lint` + spot-check HR Employee and DMS document screens.

---

### Step 5 — Duplicated code reduction (P2)

**Goal:** Reduce copy-paste in server actions — especially HR compliance/payroll CRUD boilerplate.  
**Effort:** 2–4 days  
**Risk:** Medium — server actions affect permissions and audit  

**Findings addressed:**

| Inspection | `src/` count |
|--------------|-------------:|
| DuplicatedCode | 282 |

**Ignore (noise duplicates):**

- `src/components/ui/*` vs `UIUX_Design/*` mirrors
- shadcn component pairs (alert-dialog, select, sidebar)
- Geography `*-select.tsx` combobox wrappers (similar by design)

**Fix (real duplication):**

| Area | Pattern | Proposed extraction |
|------|---------|---------------------|
| `src/server/actions/hr/compliance.ts` | Repeated `getAuthContext()` + permission check + audit log per function | `withHrComplianceAuth()` helper or shared `assertHrComplianceManager()` |
| `src/server/actions/hr/payroll.ts` | Same auth/audit blocks | Shared HR action wrapper |
| `src/server/actions/hr/time.ts` | Overlapping validation | Extend `_shared/employee-context.ts` patterns |

**Already done:** `getEmployeeCtx` consolidation — do not duplicate this work.

**Verification:**

- Unit/manual test: create/update/archive one identity document, leave request, payroll profile.
- Audit log entries still written with IP/user-agent.
- Permission denied paths still return `{ success: false }`.

**Gate:** JetBrains DuplicatedCode count drops for HR server files; no permission regressions.

---

### Step 6 — Unused exports audit (P2)

**Goal:** Trim dead public API surface in `src/`.  
**Effort:** 1–2 days  
**Risk:** Medium — exports may be used dynamically  

**Findings addressed:**

| Inspection | `src/` count |
|--------------|-------------:|
| JSUnusedGlobalSymbols | 396 |

**Process (do not bulk delete):**

1. Export flagged by JetBrains → `rg "SymbolName" src/` full repo search.
2. If zero imports and not a Next.js route handler → remove or make non-exported.
3. If used only in same file → remove `export` keyword.
4. Keep exports intentionally public for future phases if documented in SOURCE_OF_TRUTH.

**Verification:** `tsc` + `build` after each batch of ~20 symbols.

---

### Step 7 — Deprecations & HTTP config (P3)

**Goal:** Prepare for React 19 / Next 16 long-term; tighten AI local provider defaults.  
**Effort:** 1 day  
**Risk:** Low  

**Findings addressed:**

| Inspection | `src/` count |
|--------------|-------------:|
| JSDeprecatedSymbols | 24 |
| HttpUrlsUsage | 3 |

**Tasks:**

1. Replace `React.ElementRef` → `React.ComponentRef` in shadcn/ui components when upgrading component typings.
2. Confirm `local-provider.ts` production HTTP warning is sufficient (already warns on non-localhost HTTP).
3. Review `party-registry.ts` HTTP strings — likely documentation examples only.

**Verification:** `tsc` clean; AI settings test connection still works for Ollama localhost.

---

### Step 8 — Style & optional polish (P3)

**Goal:** Clear remaining low-impact items if time permits.  
**Effort:** Ongoing / optional  
**Risk:** None  

**Findings addressed:**

| Inspection | Notes |
|--------------|-------|
| TypeScriptRedundantGenericType | 15 — simplify generics |
| ES6PreferShortImport | 13 — use `@/` alias |
| TrivialIfJS | 6 |
| UnnecessaryLocalVariableJS | 6 |
| ExceptionCaughtLocallyJS | 6 — throw/catch style |
| JSCommentMatchesSignature | 9 — stale JSDoc |
| ES6RedundantAwait | 1 |
| PointlessArithmeticExpressionJS | 1 |
| CssUnresolvedCustomProperty | 2 — manual |

**Explicitly skip (false positives):**

- PointlessBooleanExpressionJS on `!!value` for Checkbox `onCheckedChange`
- TypeScriptUMDGlobal on implicit `React` JSX transform

---

## 9. Step timeline (suggested)

| Step | Name | Effort | Depends on |
|------|------|--------|------------|
| 0 | JetBrains coding-only profile | 0.5 day | — |
| 1 | Dependencies / CVE | 0.5 day | Step 0 |
| 2 | Promises / invalidateQueries | 1–2 days | Step 1 |
| 3 | ESLint + console → logger | 2–3 days | Step 2 |
| 4 | Unused imports/locals | 1–2 days | Step 3 |
| 5 | Duplicated server actions | 2–4 days | Step 3 |
| 6 | Unused exports | 1–2 days | Step 4 |
| 7 | Deprecations / HTTP | 1 day | Any |
| 8 | Style polish | Optional | Any |

**Total estimated effort:** ~10–15 working days if all steps done thoroughly.  
**Minimum viable cleanup (Steps 0–3 only):** ~4–6 days — clears all **P0–P1 coding** items.  
**Not in estimate:** spelling, grammar, or markdown work (zero days — permanently excluded).

---

## 10. Verification checklist (every step)

Run after **each** step before merge:

| Check | Command / action |
|-------|------------------|
| TypeScript | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| Production build | `npm run build` |
| HR smoke test | Edit Employee → Compliance → save identity doc |
| DMS smoke test | Open document record → links/tags/comments |
| Workspace smoke test | Dirty tab → close → unsaved dialog → Save & Close |
| Excel export | One export from report or table |
| Audit log | One mutation → verify row in audit_logs with IP |

---

## 11. Success criteria (definition of done)

**JETBRAINS FIX.1 is complete when (coding only):**

1. ✅ JetBrains **coding-only** profile in use; spell/grammar/markdown inspections **disabled**  
2. ✅ `xlsx` removed from dependency tree; `npm audit` has no CRITICAL on prod deps  
3. ✅ All `invalidateQueries` in `src/features/**` use `void` or `await` consistently  
4. ✅ `npm run lint` passes on full `src/` without new suppressions  
5. ✅ Console calls in master-data actions migrated to `logger`  
6. ✅ HR compliance server-action duplication reduced (shared auth helper) — if Step 5 approved  
7. ✅ Fresh **coding-only** JetBrains scan on `src/` + `package.json` shows **< 300** remaining actionable coding findings  
8. ✅ Implementation report written and SOURCE_OF_TRUTH updated  

**Explicitly NOT required for done:**

- ❌ Zero SpellChecking findings  
- ❌ Zero Grazie / markdown findings  
- ❌ Editing Arabic labels or UAE terms for spell-check  
- ❌ Fixing planning docs in `implementation_Review/`

---

## 12. Deliverables when implementation starts

| Deliverable | Path |
|-------------|------|
| Implementation prompt | `ChatGPT/ERP_JETBRAINS_FIX_1_IMPLEMENTATION_PROMPT.md` |
| Step reports | `implementation_Review/Global_Phases/Phase_JETBRAINS_FIX_1_Implementation/` |
| Closure report | `ERP_JETBRAINS_FIX_1_INSPECT_2_CLEANUP_IMPLEMENTATION_REPORT.md` |
| Cursor rule (optional) | `.cursor/rules/erp-query-invalidation-standard.mdc` |

---

## 13. Open questions for Sameer

1. ~~**Spelling / grammar cleanup?**~~ **Resolved — coding only; exclude from profile, do not fix.**  
2. **Scope:** Full 8-step program, or **Steps 0–3 only** (critical + ESLint) first?  
3. **JetBrains reports in git:** Keep `jetbrains/inspect_2/` in repo (~large XML), or gitignore and store reports externally?  
4. **Duplication refactor:** Extract shared HR auth wrapper in Step 5, or defer until HR module stabilizes?  
5. **Unused exports:** Aggressive removal (Step 6) or conservative (remove `export` only when 100% sure)?  
6. **PERF.1 relationship:** Run workspace lazy-mount (PERF.1 Phase A) before or after JETBRAINS FIX.1 Step 3?

---

## 14. Quick reference — coding-only map

```
IN SCOPE (fix in code):
  Step 0  →  JetBrains profile: src/ + package.json only; disable spell/grammar/markdown
  Step 1  →  VulnerableLibrariesLocal, npm audit
  Step 2  →  ES6MissingAwait, JSIgnoredPromiseFromCall
  Step 3  →  Eslint, console.*, eslint-disable review
  Step 4  →  ES6UnusedImports, JSUnusedLocalSymbols, JSUnusedAssignment
  Step 5  →  DuplicatedCode (HR server actions only)
  Step 6  →  JSUnusedGlobalSymbols
  Step 7  →  JSDeprecatedSymbols, HttpUrlsUsage
  Step 8  →  TypeScriptRedundantGenericType, ES6PreferShortImport, TrivialIfJS, etc.

OUT OF SCOPE (never fix in FIX.1 — disable in profile):
  SpellCheckingInspection, GrazieInspection, GrazieStyle
  MarkdownIncorrectTableFormatting, MarkdownIncorrectlyNumberedListItem
  MarkdownUnresolvedHeaderReference, MarkdownUnresolvedFileReference, MarkdownUnresolvedLinkLabel
  Annotator (doc noise)

SKIP (coding false positives / archive):
  TypeScriptUMDGlobal, PointlessBooleanExpressionJS, JSUnresolvedReference
  MaliciousLibrariesLocal (UIUX archive), PackageJsonMismatchedDependency (archive)
```

---

## 15. Next action

**Coding-only scope approved.** When ready to implement:

1. Step 0 — save JetBrains **coding-only** profile (disable spell/grammar/markdown)  
2. Step 1 — remove dead `xlsx` from `package.json`  
3. Step 2 — `void invalidateQueries` on HR Employee tabs  

Say which steps to implement and whether to do them in one branch or step-per-PR.

---

*End of planning document.*
