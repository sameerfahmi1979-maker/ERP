# REPORT.DESIGNER.VALIDATION.SPIKE.1 — Corrected Architecture Decision Report

**Date:** 2026-07-26 · **Status input:** COMPLETION PASSED · **Decision owner:** Sameer
**Reproducible data:** `spikes/report-designer-validation-spike-1-completion/evidence/reports/report_designer_validation_matrix.{json,csv}`
**Builder:** `spikes/report-designer-validation-spike-1-completion/scripts/build-completion-matrix.mts` (weights verified to sum to 1.000)

Scale 0–5. Knockout gates applied **separately** from weighted totals. Blocked/not-tested/documentation-only items cannot receive a "proven-capability" score.

Candidates: **D** = Executive Ledger + Gotenberg (code-first renderer); **TS** = Enhanced TipTap v3 Template Studio (the live admin designer); **B** = Carbone/DOCX; **C** = pdfme visual Designer; **A** = official TipTap Pages (**BLOCKED**, unscorable).

---

## 1. Corrected overall matrix (weights total 100%)

| Criterion | Weight | D | TS | B | C |
|---|--:|--:|--:|--:|--:|
| Administrator authoring usability | 18% | 0 | 3 | 2 | 4 |
| Editor/preview/final-PDF fidelity | 15% | 5 | 5 | 3 | 4 |
| Arabic/RTL & bilingual quality | 12% | 5 | 4 | 3 | 0 |
| Pagination, tables & family fit | 10% | 5 | 3 | 4 | 2 |
| Security, governance & multi-company | 15% | 5 | 5 | 3 | 3 |
| Integration with accepted backend | 8% | 5 | 5 | 3 | 2 |
| Performance & reliability | 7% | 5 | 4 | 4 | 4 |
| Maintainability & upgrade risk | 6% | 4 | 3 | 3 | 3 |
| Licensing & total cost | 5% | 5 | 5 | 4 | 5 |
| Accessibility & responsive UX | 4% | 3 | 3 | 3 | 3 |
| **Weighted total** | **100%** | **3.96** | **4.05** | **3.04** | **2.96** |

A (TipTap Pages) = **BLOCKED** (0/unscorable).

Reading: **TS and D are effectively tied at the top** (4.05 vs 3.96) and dominate B/C. They win for *different* reasons — TS because it is the only proven **visual admin authoring** path, D because it is the flawless **renderer** with zero authoring UI. This near-tie is the quantitative basis for a **hybrid**, not a single winner.

---

## 2. Per-mode matrices (each totals 100%)

Winners (full tables in the JSON/CSV):

| Document family | 1st | 2nd | 3rd | 4th |
|---|---|---|---|---|
| **Flowing letters & certificates** | **TS 4.01** | D 3.79 | B 2.95 | C 2.81 |
| **Tabular / analytical reports** | **D 4.41** | TS 4.04 | B 3.25 | C 2.85 |
| **Fixed forms, cards & labels** | **TS 4.02** | D 3.66 | C 3.26 | B 2.96 |
| **Framework integration (overall)** | **D 4.28** | TS 4.24 | B 3.07 | C 2.82 |

Notes:
- Flowing letters → **Template Studio** (visual authoring + correct RTL + canonical fidelity).
- Tabular reports → **code-first Executive Ledger** (repeating headers over 10 landscape pages already proven; no admin benefit from a visual editor here).
- Fixed cards → Template Studio leads on paper, but for **English-only** fixed layouts **pdfme (C 3.26)** is a credible specialist; C is **knocked out** the moment Arabic is required.

---

## 3. Knockout results

| Candidate | Family | Gate failed | Verdict |
|---|---|---|---|
| C (pdfme) | any Arabic-bearing | Unacceptable Arabic/RTL (executed tofu evidence) | **KO** — English fixed layouts only |
| A (TipTap Pages) | all | No reproducible evidence (registry 403) | **KO/BLOCKED** — unscorable |
| D (Exec Ledger) | flowing letters, fixed cards | No visual admin authoring path (score 0) | **KO for visual authoring** — remains official renderer |
| B (Carbone) | all (for now) | No admin authoring/SUS evidence | **Deferred** — injection safe, usability unproven |

Code-first rendering (D) may remain the official runtime while scoring 0 for visual authoring — the two are kept separate, as required.

---

## 4. Sensitivity analysis

| Scenario | 1st | 2nd | Recommendation stable? |
|---|---|---|---|
| Admin-usability-first | **TS 3.81** | C 3.14 | Yes — TS for authoring |
| Arabic/security-first | **D 4.42** | TS 4.20 | Yes — D renderer + TS authoring |
| Fidelity/print-first | **D 4.35** | TS 4.24 | Yes |
| Cost/maintenance-first | **D 4.06** | TS 4.00 | Yes |
| Fixed-layout-first | **TS 4.02** | D 3.60 (C 3.32) | Yes |

Across **every** scenario the top two are **TS and D**; B and C never lead (C only nears the top under fixed-layout-first, and is still Arabic-knocked-out). The hybrid recommendation is **robust to reweighting**.

---

## 5. Selected architecture — Governed Hybrid (repair + preserve, no replace)

**One admin-facing "Report Designer" workspace, multiple engines behind it:**

1. **Flowing letters & certificates → Enhanced Template Studio** (TipTap v3, **no** paid Pages).
   - Repair, don't replace. It already works: block palette, governed field picker, canonical preview, correct RTL.
   - Enhancements: reconcile field-token governance drift (SEC-13), finish bilingual UAT, keyboard/zoom accessibility pass, header/footer + QR/stamp/signature *placeholder* controls in-canvas.
2. **Tabular / analytical reports → code-first Executive Ledger** (registry-driven).
   - No visual editor. Admins configure via report definitions; developers own layout. Best fidelity + pagination, lowest risk.
3. **Fixed forms / cards / labels → code-first Executive Ledger by default**; **optional** pdfme visual designer for **English-only** cards behind a feature flag, only if a business need appears. Never for Arabic.
4. **Optional Word-authoring (Carbone/DOCX) → later pilot only**, gated behind the full 8-guard intake battery and a real business-user SUS. Not on the critical path.
5. **Official renderer stays Executive Ledger + Gotenberg for ALL families.** Every engine emits into the same canonical document model → same issuance, numbering, QR, stamp/signature, storage, hashing, RLS.

**The user sees one workspace**: pick document family → pick template → edit (blocks or fixed elements) → insert governed fields → preview with fixtures → compare editor/preview/PDF → draft/version/publish. The engine is an implementation detail.

---

## 6. Rejected alternatives (with evidence)

| Rejected | Why | Evidence |
|---|---|---|
| **Replace Studio with pdfme for everything** | Arabic knockout; flowing text needs reflow pdfme lacks; 18 MB bundle | `pdfme-designer/pages/designer-card-arabic-p1.png`; vite build log |
| **Buy TipTap Pages** | Inaccessible (403); unnecessary — Gotenberg owns pagination | registry probe |
| **Make Carbone the primary designer** | Admin usability unproven; raw token typing; DOCX attack surface | `docx-security-battery-results.json`; SUS blocked |
| **Single universal engine for all families** | Sensitivity shows no single engine wins all modes | matrix per-mode + sensitivity |
| **Keep Puck as the visual editor** | Reconciliation: all 4 published "puck" templates carry EMPTY `{}` layouts; only ids 14/15 hold real Puck JSON | prior spike `fixtures/reconciliation-db-counts.json` |

---

## 7. Backend-preservation map (unchanged, protected)

Executive Ledger canonical HTML · Gotenberg/Chromium rendering · output registry & data providers · `owner_company_id` branding · governed template versions · serial numbering · QR issuance/verification · protected stamp/signature injection · private PDF storage · stored-byte hashing · issuance/reissue history · permissions & RLS · retries/reconciliation/monitoring · email/print/download controls. **None** of these is reopened. Adapters required: a thin "authoring-engine → canonical document model" adapter per engine (Studio adapter already exists as `schema-to-el`).

---

## 8. Open decisions requiring Sameer's approval

1. **Approve the governed-hybrid direction** (enhance Template Studio; keep code-first reports; pdfme/Carbone optional & gated).
2. **Template Studio go-live scope** — approve enhancement + bilingual/business-user UAT as the acceptance gate (it is still officially "prototype/rejected" until UAT passes).
3. **pdfme** — approve as an **optional English-only fixed-card** designer behind a flag, or drop it entirely.
4. **Carbone/DOCX** — approve a later, gated Word-authoring pilot, or shelve.
5. **Governance-drift fix** — approve reconciling `OUTPUT_VARIABLE_ALLOWLISTS` token names with the binding registry (small, safe).

No implementation will start until these are approved.
