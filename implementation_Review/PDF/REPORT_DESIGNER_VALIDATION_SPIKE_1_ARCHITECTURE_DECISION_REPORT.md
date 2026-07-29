# REPORT.DESIGNER.VALIDATION.SPIKE.1 — Architecture Decision Report

**Date:** 2026-07-26 · **Status:** `SPIKE PASSED — ARCHITECTURE RECOMMENDATION READY FOR HUMAN REVIEW`
**Verdict type:** **HYBRID (governed split)** — one official renderer, mode-specific authoring layers
**Confidence:** HIGH for renderer and Mode 2/3 decisions; MEDIUM for the Mode 1 admin-authoring choice (one pilot decision pending)
**Reproducible data:** `spikes/report-designer-validation-spike-1/evidence/reports/report_designer_validation_matrix.{csv,json}`

---

## 1. Weighted Decision Matrix — Overall (weights total exactly 100%)

Scale 0–5; scores backed only by spike evidence (documentation-only capability capped and flagged).
Formula: `weightedTotal = Σ(weight% × score) / 100`, max 5.0.

| Criterion | Wt | A TipTap Pages | B Carbone/DOCX | C pdfme | D Exec Ledger |
|---|---:|---:|---:|---:|---:|
| Administrator authoring usability | 14 | 3 | 4* | 3* | 1 |
| Preview-to-final-PDF fidelity | 14 | 1 | 3 | 3 | 5 |
| Document-family capability coverage | 12 | 2 | 4 | 2 | 5 |
| Pagination and table quality | 10 | 2 | 4 | 2 | 5 |
| Arabic/RTL and embedded fonts | 10 | 2 | 4 | 1 | 5 |
| Security and multi-company isolation | 10 | 4 | 3 | 4 | 5 |
| Integration with existing framework | 8 | 4 | 3 | 3 | 5 |
| Maintainability and ecosystem health | 6 | 3 | 4 | 4 | 4 |
| Licensing and total cost | 5 | 2 | 4 | 5 | 5 |
| Performance and operational complexity | 5 | 4 | 4 | 5 | 4 |
| Accessibility and governance UX | 3 | 3 | 3 | 3 | 4 |
| Migration effort and preservation risk | 3 | 3 | 3 | 4 | 5 |
| **Weighted total** | **100** | **2.58** | **3.62** | **2.97** | **4.30** |

\* Heuristic/flagged: B's Word authoring was simulated programmatically; C's Designer UI was not run.

### Knockout gates triggered

- **C pdfme:** unusable Arabic/RTL (maintainer-confirmed out of scope + spike-proven broken output) → **cannot be recommended for any Arabic-bearing family**; no text reflow → **cannot serve flowing letters**.
- **A TipTap Pages:** official package license-blocked (unvalidatable); community fallback incompatible with the ERP's TipTap v3 → **cannot be recommended as-is**.
- B and D triggered no knockouts.

## 2. Per-Mode Matrices (each weight set totals 100%)

| Mode (weights emphasized) | A | B | C | D | Winner |
|---|---:|---:|---:|---:|---|
| Mode 1 — Flowing letters/certificates (usability 16, fidelity 16, Arabic 14, pagination 12) | 2.53 | 3.60 | 2.86 | **4.25** | D (B best admin-authoring path) |
| Mode 2 — Tabular/analytical reports (pagination 22, fidelity 12, integration 10) | 2.58 | 3.64 | 2.88 | **4.54** | D decisively |
| Mode 3 — Fixed-layout forms/cards/labels (fidelity 16, usability 14, Arabic 14) | 2.64 | 3.56 | 3.06 | **4.28** | D (C only if English-only) |

The overall winner **did** win every mode — but the Mode 1 usability gap (D scores 1) is real and is
addressed in the recommendation below, not hidden inside the total.

## 3. Sensitivity Analysis (all scenarios total 100%)

| Scenario | A | B | C | D | Decision changes? |
|---|---:|---:|---:|---:|---|
| Usability-first (usability 26) | 2.64 | 3.68 | 3.03 | **3.82** | No — D still first; B closes to 0.14 |
| Fidelity/print-first (fidelity 24, pagination 16) | 2.32 | 3.56 | 2.84 | **4.58** | No |
| Arabic/security-first (Arabic 22, security 20) | 2.70 | 3.58 | 2.82 | **4.58** | No |
| Cost/maintenance-first (maint. 14, licensing 14) | 2.64 | 3.68 | 3.34 | **4.38** | No |

The renderer decision is **robust under all reasonable weightings**. Only an extreme usability-only
weighting would put Carbone within touching distance — which is exactly why Carbone is retained as
the admin-authoring pilot rather than discarded.

## 4. Recommended Architecture (proposal — requires Sameer's approval)

**One governed backend, one official renderer, three authoring modes:**

1. **Official renderer (all families):** Executive Ledger canonical HTML → **Gotenberg/Chromium** — unchanged. Every official output continues through the existing registry, numbering, QR, protected assets, private storage, hashing, issuance history, permissions/RLS.
2. **Mode 1 — Flowing letters & certificates:** **Enhanced Template Studio** (existing TipTap v3 structured blocks → `schema-to-el` → EL). Priority enhancements: A4-styled preview frame, RTL/direction support in the editor, header/footer/QR/signatory/stamp placeholder blocks, searchable 57-field picker. *No TipTap Pages purchase is required for this.*
3. **Mode 2 — Tabular/analytical reports:** **code-first Executive Ledger** definitions registered in the output registry (developer-controlled; proven 10-page quality). No visual designer.
4. **Mode 3 — Fixed forms/cards/labels:** **code-first EL HTML/CSS `@page`** (CR80 proven). pdfme MAY be revisited later strictly for English-only assets — currently not needed.
5. **Optional Pilot (Sameer decision):** **Carbone/DOCX + Gotenberg LibreOffice** as "Mode 1-W": admins author DOCX templates in Word with `{d.x}` markers; server injects registry data and converts via the existing Gotenberg container. Gate: real-admin pilot on 2 letters + LibreOffice fidelity check + macro/zip validation + one-template-per-company branding rule (dynamic images are Carbone EE-only).

### Rejected alternatives and reasons

| Alternative | Reason for rejection |
|---|---|
| One universal WYSIWYG designer for all families | No candidate survived all knockouts; forcing one editor reproduces the original failure |
| TipTap Pages (official) purchase now | Unvalidatable before purchase; $49+/mo + private registry; community evidence shows paginated editing still would not close the preview/PDF parity gap (pagination is editor-view-only) |
| Community `tiptap-extension-pagination` | TipTap v2-only (ERP is v3); no initial-load pagination; no intra-paragraph splitting; abandoning it avoids a fork burden |
| pdfme as the fixed-layout designer | Arabic knockout (maintainer-confirmed out of scope), no repeating table headers, hairline-text defect as configured |
| Replacing Gotenberg with pdf-lib or LibreOffice as the official renderer | Chromium path is the only one with proven preview/PDF parity + full Arabic + repeating headers |

## 5. Backend Adapters Required (recommendation only — NOT implemented)

- **Unresolved-token scan** generalized to Carbone outputs (post-render `{d.` literal detection) if the pilot proceeds.
- **DOCX template storage** as governed template versions (bytes + hash in private storage; same draft→review→publish workflow) if the pilot proceeds.
- **Per-company template binding** for Carbone Mode 1-W (community edition cannot swap logo images dynamically).
- No schema changes needed for the primary recommendation (Modes 1–3 use existing tables).

## 6. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Studio enhancements under-deliver admin self-service | Time-boxed enhancement phase with the 16-task UX acceptance script re-run as UAT gate |
| LibreOffice font substitution shifts brand layout (pilot) | Install brand fonts in the Gotenberg image; per-template fidelity gate before publish |
| Carbone community stays one major version behind EE | Acceptable for marker injection; re-evaluate EE only if dynamic images/advanced features become mandatory |
| Bidi edge cases (LTR runs inside RTL sentences) | Add bidi-isolation wrapping in the EL renderer text pipeline; include in Arabic UAT checklist |
| Hidden usability debt in code-first Mode 2 | Registry-driven report definitions + fixture previews so developers iterate quickly |

## 7. Decisions Required from Sameer

1. **Approve the hybrid architecture** (Section 4) as the post-spike direction.
2. **Approve or decline the Carbone/DOCX pilot** (Mode 1-W) — including the CCL licensing posture (free community use inside the ERP qualifies as value-added embedding; no counsel red flags found, but confirm comfort).
3. Confirm **no TipTap Pages purchase** (can be revisited with a 30-day trial later if Studio enhancements disappoint).
4. Confirm pdfme is **shelved** (revisit only for English-only fixed assets).
5. Approve the **Puck engine-label cleanup** approach in the plan addendum (labels only; the 2 real Puck JSON layouts are preserved and checksummed — never nulled or overwritten).
