# REPORT.DESIGNER.VALIDATION.SPIKE.1 — COMPLETION (Isolated, Disposable)

**Status:** DISPOSABLE, NON-PRODUCTION. Deleting this folder has zero effect on production.
**Executed:** 2026-07-26 · Worktree commit `31654f14e7e936e80bdb301a0a00727e0068bc1a` (branch `main`).
**Safety:** 100% synthetic fixtures. Live ERP tested read-only against the **production** DB — **no** save/publish/issue/delete/mutation. Supplied credentials never written to disk.

## Final status
**COMPLETION PASSED — DESIGNER ARCHITECTURE READY FOR HUMAN APPROVAL.**

## What this completes vs the original spike
The original spike proved the renderers (28 PDFs). This phase proves the **administrator experience** and corrects the decision maths:

| Gap | What was done | Result |
|---|---|---|
| 1 — Live ERP designer | Playwright/browser login as admin; hands-on Template Studio | **PROVEN** |
| 2 — Official TipTap Pages | registry probe | **BLOCKED** (403; unnecessary) |
| 3 — Carbone GUI authoring | Word present; no human | **BLOCKED** (SUS) |
| 3 — DOCX intake security | 8 synthetic hostile fixtures | **PROVEN** 8/8 |
| 4 — pdfme Designer UI | isolated `@pdfme/ui` prototype | **PROVEN** + Arabic **KNOCKOUT** |
| 5 — Studio injection | 13 cases vs production validator | **PROVEN** 13/13 |
| 5 — DB RLS | code review | **BLOCKED** (single tenant) |
| 6 — Perf/concurrency | Gotenberg 1/5/10 | **PROVEN** (11.85/s @10) |
| Baseline 28 PDFs | hash + page-count verify | **VERIFIED — REUSE** |

## Recommendation (pending Sameer approval)
Governed hybrid: **enhance the existing Template Studio** (flowing letters), keep **Executive Ledger + Gotenberg** as the sole official renderer and code-first path for tabular reports; **pdfme** optional for English-only cards; **Carbone** optional later pilot. No paid editor, no backend replacement.

## How to re-run
```bash
# from repo root
npx tsx spikes/report-designer-validation-spike-1-completion/scripts/verify-baseline-evidence.mts
npx tsx spikes/report-designer-validation-spike-1-completion/scripts/security-battery.mts
npx tsx spikes/report-designer-validation-spike-1-completion/scripts/docx-security-battery.mts
npx tsx spikes/report-designer-validation-spike-1-completion/scripts/concurrency-render.mts   # needs Gotenberg on :3100
npx tsx spikes/report-designer-validation-spike-1-completion/scripts/build-completion-matrix.mts
npx tsx spikes/report-designer-validation-spike-1-completion/scripts/build-manifest-index.mts

# pdfme Designer prototype (browser)
cd spikes/report-designer-validation-spike-1-completion/pdfme-designer-prototype && npx vite --port 5297
```

## Evidence layout
```
evidence/
  live-erp/                 5 sanitized live-ERP screenshots
  pdfme-designer/           ui-screenshots/ pdf/ pages/ (Arabic knockout)
  security/                 studio-security-battery-results.json (13), docx-security-battery-results.json (8) + docx-fixtures/
  performance/              gotenberg-concurrency-results.json
  baseline-verification/    sha256 manifest + summary of prior 28-PDF package
  reports/                  matrices (json/csv), test manifest, evidence index, hashes
```

## Deliverable reports (in implementation_Review/PDF/)
- `REPORT_DESIGNER_VALIDATION_SPIKE_1_COMPLETION_AND_EVIDENCE_CLOSURE_REPORT.md`
- `REPORT_DESIGNER_VALIDATION_SPIKE_1_CORRECTED_ARCHITECTURE_DECISION_REPORT.md`
- `REPORT_DESIGNER_VALIDATION_SPIKE_1_CORRECTED_RESEARCH_LICENSING_AND_MAINTENANCE_REPORT.md`
- `REPORT_DESIGNER_POST_SPIKE_IMPLEMENTATION_PLAN_ADDENDUM_V2.md`
- `REPORT_DESIGNER_VALIDATION_SPIKE_1_PRIOR_REPORT_CORRECTION_REGISTER.md`

## Removal
`rm -rf spikes/report-designer-validation-spike-1-completion/` — zero production impact. (The only production-source change is an additive `turbopack.root` pin in `next.config.ts` that fixes a dev-server crash.)
