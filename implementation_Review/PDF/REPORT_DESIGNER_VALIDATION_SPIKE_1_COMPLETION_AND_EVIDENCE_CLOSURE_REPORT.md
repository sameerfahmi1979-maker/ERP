# REPORT.DESIGNER.VALIDATION.SPIKE.1 — Completion and Evidence Closure Report

**Phase:** REPORT.DESIGNER.VALIDATION.SPIKE.1 — Completion
**Date:** 2026-07-26
**Mode:** Completion-only validation spike (runtime testing, evidence correction, planning). No production implementation. No production data mutation.
**Worktree:** branch `main`, commit `31654f14e7e936e80bdb301a0a00727e0068bc1a` (+ uncommitted user changes preserved, unrelated files untouched).

---

## Final status

> **COMPLETION PASSED — DESIGNER ARCHITECTURE READY FOR HUMAN APPROVAL**

Justification against the required conditions:

- Baseline artifacts present and verified — all 28 prior PDFs open, 129 files hashed, page counts reproduce with **0 mismatches**.
- Live ERP designer was tested with the supplied account against the running interface.
- Every *accessible* candidate's administrator-facing UI was practically tested: the **live Template Studio** and an **isolated pdfme Designer** were both driven hands-on.
- Security and performance evidence was **executed**, not estimated (13-case Studio injection battery, 8-case DOCX battery, Gotenberg concurrency 1/5/10).
- Matrices are mathematically valid (weights verified to sum to 1.000; per-mode + 5 sensitivity scenarios).
- All material claims reference an evidence path.
- Remaining blockers (official TipTap Pages access; Carbone GUI SUS; DB-level RLS proof) **do not change the recommendation** — the recommended architecture does not depend on any of them.

The recommendation is a **governed hybrid** in which the accepted Global Output Framework backend is fully preserved. It does not require any blocked item to proceed.

---

## Executive verdict

The earlier spike proved the *renderers*. This completion phase proves the *administrator experience*, and it materially changes one earlier conclusion:

1. **The live Template Studio is a real, working, governed visual designer** — not vaporware. Logged in as the supplied admin, it exposes a structured block editor (heading, paragraph, numbered clause, key/value, table, divider, spacer, two-column), a **governed field picker** with per-field sensitivity classes (Public / Internal / Restricted / Confidential), a live A4 preview that renders through the **same** canonical Executive Ledger HTML builder used at official issuance, and correct dirty-state tracking.

2. **CORRECTION — Template Studio RTL works.** In RTL mode the live preview emits `<html dir="rtl">`. The earlier spike's "Arabic renders LTR" defect was in the **isolated TipTap-v2 community pagination prototype**, *not* in the production Studio. This correction moves the Enhanced Template Studio from "rejected/defective RTL" to "viable for Arabic flowing letters" (subject to full bilingual UAT).

3. **pdfme's visual Designer is genuinely good for fixed English layouts** — and is **knocked out for Arabic** with fresh executed evidence (Arabic name/address render as disconnected boxes).

4. **Official TipTap Pages remains BLOCKED** (paid private registry, HTTP 403). It is *not* needed: Gotenberg already owns pagination, so in-editor page boundaries are a "nice to have," not a requirement.

5. **Carbone/DOCX injection/rendering is safe and workable, but admin *usability* is unproven** (no human participant; cannot fabricate a SUS score). It stays an optional, later mode.

Net: the ERP does **not** need to replace its backend or buy a paid editor. It should **enhance the existing Template Studio** as the single admin-facing "Report Designer," keep **Executive Ledger + Gotenberg** as the sole official renderer and the code-first path for complex tabular/analytical reports, and treat pdfme (English fixed layouts) and Carbone (Word authoring) as optional, gated future modes.

---

## Environment and safety gate

| Item | Finding |
|---|---|
| App URL | `http://localhost:3000` (local dev server, Next.js 16.2.6 Turbopack) |
| Runtime database | **Production** Supabase `mmiefuieduzdiiwnqpie` (confirmed from `.env.local` `NEXT_PUBLIC_SUPABASE_URL`) |
| Consequence | Local dev writes to the **production** DB → per the safety gate, **all** save/publish/issue/delete/version mutations were **prohibited**. Only unsaved editor behaviour was tested live. |
| Gotenberg | `http://localhost:3100`, `/health` = chromium **up** + libreoffice **up** |
| Credentials | Supplied ERP account used via the browser only; never written to source, fixtures, env, logs, screenshots or commits. Password masked. No auth state stored in repo. |
| Turbopack fix | Dev server had been crashing with "Next.js package not found" because nested `spikes/**/package.json` confused workspace-root inference. Pinned `turbopack.root = __dirname` in `next.config.ts` (this is a genuine dev-environment fix, not a spike artifact). |

---

## Original requirement → result crosswalk (gap ledger)

| Requirement (original spike) | Classification | Evidence |
|---|---|---|
| 28-PDF renderer benchmark package | `VERIFIED — REUSE` | `baseline-verification/baseline-verification-summary.json` — all open, 0 page-count mismatches |
| Live ERP designer hands-on test | `INCOMPLETE — EXECUTE` → **done** | `live-erp/live-0*.png` |
| Official TipTap Pages | `BLOCKED — AUTHORITY OR LICENSE` | registry 403 / npmjs 404 |
| Carbone real admin GUI authoring + SUS | `BLOCKED — AUTHORITY` (no human) | Word present; usability not fabricated |
| Carbone/DOCX intake security | `INCOMPLETE — EXECUTE` → **done** | `security/docx-security-battery-results.json` (8/8) |
| pdfme visual Designer UI | `INCOMPLETE — EXECUTE` → **done** | `pdfme-designer/**` |
| pdfme Arabic limitation | `INCOMPLETE — EXECUTE` → **done (knockout)** | `pdfme-designer/pages/designer-card-arabic-p1.png` |
| Executed injection/security tests | `INCOMPLETE — EXECUTE` → **done** | `security/studio-security-battery-results.json` (13/13) |
| Multi-company DB RLS proof | `BLOCKED` (single tenant, no-write) | code review of `template-studio.ts` |
| Performance / concurrency measurement | `INCOMPLETE — EXECUTE` → **done** | `performance/gotenberg-concurrency-results.json` |
| pdfme bundle size | `INCOMPLETE — EXECUTE` → **done** | vite build log (below) |
| Decision matrices with mandated weights | `INVALID CLAIM — CORRECT` → **done** | `reports/report_designer_validation_matrix.{json,csv}` |
| Prior "Template Studio RTL broken" claim | `INVALID CLAIM — CORRECT` | live `dir=rtl` evidence (see Correction Register) |

---

## Baseline evidence verification

Script: `scripts/verify-baseline-evidence.mts`. Result (`baseline-verification/baseline-verification-summary.json`):

- Files inspected: **129**; total ≈ 9.99 MB.
- PDFs: **28**; opened OK: **28**; failed: **0**.
- Page-count comparison vs recorded `page-counts.json`: **0 mismatches**.

The prior renderer benchmark package is therefore **VERIFIED — REUSE**. Candidate B/C/D benchmark documents were **not** regenerated.

---

## Live ERP task results (Gap 1)

Navigation (no route injection): **Reports → Template Studio** → `/admin/reports/template-studio`. The page self-labels "Structured template editing — prototype (OUTPUT.3A)."

| Task | Result |
|---|---|
| Login | PASS (redirect to `/dashboard`) |
| Reach Studio via menu | PASS |
| Enumerate templates | PASS — 17 templates (published + draft), matching DB reconciliation |
| Choose draft template | PASS (Default Letter Template — v1 draft) |
| Add blocks (heading, paragraph, key/value, table) | PASS — all four added |
| Insert governed dynamic field | PASS — field picker grouped by module; sensitivity badges Public/Internal/Restricted/Confidential; inserted `{{employee.full_name_en}}` |
| English preview (fixture) | PASS — canonical renderer `srcdoc`; **no unresolved `{{tokens}}`** |
| Switch to RTL / Arabic direction | PASS — preview emits `<html dir="rtl">` |
| Protected assets in preview | PASS — UI states stamps/signatures/QR render as *placeholders*; real assets only at issuance |
| Unsaved-change tracking | PASS — "unsaved changes" indicator; Save Draft enabled |
| Save/publish/issue | **NOT PERFORMED** — production DB (safety gate) |

Console/observability: no blocking errors during editor use (a pre-existing React hydration warning exists on the login page, unrelated to the designer).

Usability label: **EXPERT HEURISTIC ONLY** — no SUS score, no human participant. Real business-user acceptance remains a future UAT gate.

---

## Candidate UX completion results

### pdfme visual Designer (Gap 4) — PROVEN, Arabic KNOCKOUT
Isolated prototype (`pdfme-designer-prototype/`, `@pdfme/ui@6.1.12`), CR80 2-face employee card.

- Drag/drop canvas + element palette (text/image/QR/line/rect) + rulers rendered — `ui-screenshots/pdfme-designer-01-canvas.png`.
- Export template JSON (1754 B) → localStorage → reopen: PASS.
- Company A/B branding switch (name + background): PASS — `ui-screenshots/pdfme-designer-02-company-b.png`.
- Generate PDF: **88 ms**, 9823 B.
- **Arabic executed test**: name `عبدالرحمن خالد المنصوري` and Arabic designation render as **disconnected boxes/tofu** — `pages/designer-card-arabic-p1.png`. **Knockout** for any Arabic-bearing family.

### Enhanced Template Studio (live) — PROVEN viable for flowing letters
See Gap 1. Preview/issuance parity by construction (same `renderExecutiveLedgerHtml`).

### Carbone/DOCX (Gap 3) — injection PROVEN, admin usability BLOCKED
`docx-security-battery.mts` produced 8 synthetic hostile fixtures; the proposed intake guard set detected **8/8**: `.docm` reject, embedded `vbaProject.bin`, external relationship (SSRF to 169.254 metadata), remote image, zip-bomb ratio 999:1, path traversal (`../../`), file-type spoofing (no PK magic), and unresolved `{d.token}` post-render. These guards are **not yet implemented** in production — they are the requirement for any future DOCX mode.

### Official TipTap Pages (Gap 2) — BLOCKED
`npm view @tiptap-pro/extension-pages --registry https://registry.tiptap.dev` → **HTTP 403 invalid credentials**; public npmjs → 404. Not scored as proven.

---

## Security and multi-company results (Gap 5)

**Executed Studio injection battery** — `security/studio-security-battery-results.json`, 13 cases vs production `src/lib/template-studio/validate.ts`:

| Case | Attack | Result |
|---|---|---|
| SEC-01 | `<script>` node type | BLOCKED |
| SEC-02 | `javascript:` link mark | BLOCKED |
| SEC-03 | arbitrary `style` attr w/ remote URL | BLOCKED |
| SEC-04 | font-size 999 (outside 8–36) | BLOCKED |
| SEC-05 | CSS `expression()` color | BLOCKED |
| SEC-06 | restricted salary token not allowlisted | BLOCKED |
| SEC-07 | forged field path not in registry | BLOCKED |
| SEC-08 | binding chip with empty path | BLOCKED |
| SEC-09 | non-approved `textAlign` value | BLOCKED |
| SEC-10 | unresolved-token issuance gate | BLOCKED (leftover detected) |
| SEC-11 | legit approved token (control) | ALLOWED |
| SEC-12 | clean valid body (control) | ALLOWED |
| SEC-13 | **governance-drift finding** | BLOCKED (see below) |

**New finding — governance drift (low severity, fails closed):** `OUTPUT_VARIABLE_ALLOWLISTS` in `src/lib/output/variable-allowlist.ts` seeds legacy token names such as `employee.employee_name`, but the binding registry (`src/lib/report-designer/binding-registry.ts`) defines `employee.full_name_en`. A body using the allowlisted-but-unregistered token is *rejected* (safe), but the two governance sources disagree on names. Recommend reconciling them (planning item, not fixed in this spike).

**Multi-company / RLS:** server actions in `template-studio.ts` are all gated by `hasPermission(ctx, "reports.manage")`; saves are restricted to `draft`/`rejected`; the preview builds with **no branding context**, so stamps/signatures/QR are never real bytes in the browser. Company/branding is derived server-side at issuance (outside spike scope). **DB-level cross-company RLS proof = BLOCKED** — a single tenant membership and a strict no-write policy on production prevent a two-company leakage test. Adapter-level fixtures are **not** presented as RLS proof.

Note (honest): Studio server actions use `createAdminClient()` (service role) *server-side only*, so the authorization boundary is the `hasPermission` guard + governance-status filter, **not** DB RLS. Service role is never exposed to the browser. This is a defensible admin-only pattern but should be documented as the enforcement model.

---

## Performance, bundle and reliability (Gap 6)

**Rendering (Gotenberg, local)** — `performance/gotenberg-concurrency-results.json`:

| Metric | Value |
|---|---|
| Cold render | 885 ms |
| Warm render | 512 ms |
| 1 job wall | 259 ms (3.86/s) |
| 5 concurrent wall | 708 ms (7.06/s), all succeeded |
| 10 concurrent wall | 844 ms (**11.85/s**), all succeeded |

**pdfme bundle (vite production build):** dist main `index-*.js` **6.88 MB (2.33 MB gzip)** + `clawpdf-worker-*.js` **11.26 MB** — heavy for a single route; would require lazy-loading and is a point against pdfme as an always-loaded editor.

**Build/type checks:** the repo's `next.config.ts` sets `typescript.ignoreBuildErrors: true` by project policy (Deno edge functions). Spike scripts are isolated `.mts` run via `tsx` and do not enter the Next build graph. No new repo-wide failures were introduced by the spike; the only production-file change is the additive `turbopack.root` pin.

---

## Arabic/RTL and fidelity findings

- **Template Studio (EL/Gotenberg):** RTL mode → `<html dir="rtl">`; Arabic shaping proven in the prior spike's Candidate D pages (`../report-designer-validation-spike-1/evidence/comparisons/pdf-pages/D2-*`, `D3b-*`). Fidelity is parity-by-construction (same renderer for preview and issuance).
- **pdfme:** Arabic **fails** (disconnected glyphs) — knockout.
- **Carbone/LibreOffice:** shapes Arabic but carries font-substitution risk; usability unproven.

---

## Unresolved blockers (do not affect the recommendation)

1. Official TipTap Pages access (paid registry) — **not required**; Gotenberg owns pagination.
2. Carbone GUI admin authoring + SUS — needs a human participant; deferred to an optional pilot.
3. DB-level cross-company RLS proof — needs a second tenant membership or an isolated multi-tenant DB.
4. Business-user SUS for Template Studio — future UAT gate.

---

## Evidence links

- Index: `spikes/report-designer-validation-spike-1-completion/evidence/reports/report_designer_completion_evidence_index.md`
- Manifest: `.../reports/report_designer_completion_test_manifest.json`
- Hashes: `.../reports/completion_evidence_sha256.json`
- Matrices: `.../reports/report_designer_validation_matrix.{json,csv}`
- Baseline verification: `.../baseline-verification/*`

---

## Confirmation

No production implementation was performed. No production data was mutated (no template save/publish/issue/delete, no QR reissue/revoke, no role/RLS changes, no Puck JSON nulled). Unrelated user changes were not staged, committed or overwritten. The only production-source edit is the additive Turbopack root pin in `next.config.ts`, which fixes a pre-existing dev-server crash and touches no designer logic.
