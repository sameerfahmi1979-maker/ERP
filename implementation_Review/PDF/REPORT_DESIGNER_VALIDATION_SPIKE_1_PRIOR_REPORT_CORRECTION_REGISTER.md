# REPORT.DESIGNER.VALIDATION.SPIKE.1 — Prior-Report Correction Register

**Date:** 2026-07-26
Purpose: record every claim from prior spike reports that the completion phase corrects, with evidence and decision impact. History is not silently rewritten — prior files remain; this register governs interpretation.

Prior files in scope:
- `REPORT_DESIGNER_VALIDATION_SPIKE_1_EXECUTION_AND_EVIDENCE_REPORT.md`
- `REPORT_DESIGNER_VALIDATION_SPIKE_1_ARCHITECTURE_DECISION_REPORT.md`
- `REPORT_DESIGNER_VALIDATION_SPIKE_1_RESEARCH_LICENSING_AND_MAINTENANCE_REPORT.md`
- `REPORT_DESIGNER_POST_SPIKE_PROPOSED_IMPLEMENTATION_PLAN_ADDENDUM.md`
- `report_designer_test_manifest.json`, `report_designer_evidence_index.md`

---

## COR-01 — "Template Studio strips `dir=rtl` / RTL is broken"
- **Previous claim:** Candidate A findings implied the ERP's TipTap designer renders Arabic LTR (RTL defect), citing the pagination prototype.
- **Evidence:** Live test of the production Studio — RTL mode preview emits `<html dir="rtl">` (`live-erp/live-05-*.png`; CDP srcdoc inspection).
- **Corrected claim:** The **production Template Studio RTL works**. The RTL defect was in the **isolated `tiptap-extension-pagination` v2 community prototype**, not the shipped v3 Studio.
- **Impact:** Elevates Template Studio from "defective RTL / rejected" to "viable for Arabic flowing letters (pending bilingual UAT)." Drives the hybrid recommendation.
- **Superseded:** Yes, for the production Studio. The community-prototype observation remains valid *for that prototype only*.

## COR-02 — Decision matrix omitted the live Template Studio as a scored candidate
- **Previous claim:** Prior matrix scored A/B/C/D; the actual admin designer (Enhanced Template Studio) was not a first-class scored candidate.
- **Evidence:** Corrected matrix `report_designer_validation_matrix.json` scores **TS** explicitly (overall 4.05, top of the table).
- **Corrected claim:** TS and D tie at the top; the winner is a **hybrid**, not a single engine.
- **Impact:** Central to the decision. **Superseded:** Yes — use the v-completion matrix.

## COR-03 — Prior weights differed from the mandated 100% scheme
- **Previous claim:** Prior overall matrix used an ad-hoc weight set.
- **Evidence:** Rebuilt with the mandated weights (18/15/12/10/15/8/7/6/5/4), verified to sum to 1.000 in `build-completion-matrix.mts`.
- **Corrected claim:** All matrices now use the mandated weights + per-mode + 5 sensitivity scenarios.
- **Impact:** Decision mathematics now reproducible & compliant. **Superseded:** Yes.

## COR-04 — pdfme visual Designer "not tested" (generator only)
- **Previous claim:** Manifest recorded pdfme generator tested but the visual Designer UI **not** tested.
- **Evidence:** `pdfme-designer/**` — hands-on Designer (drag/drop, export/reopen, branding switch, 88 ms generate) + executed Arabic knockout.
- **Corrected claim:** pdfme Designer UI is **proven** for English fixed layouts and **knocked out** for Arabic.
- **Impact:** Enables an evidence-based (optional, flagged) pdfme card mode. **Superseded:** the "not tested" status.

## COR-05 — Carbone "9/9 PROVEN" implied admin usability
- **Previous claim:** README framed Carbone as broadly proven.
- **Evidence:** Prior proof was **programmatic** DOCX; completion phase adds an **intake security battery (8/8)** but **no** human GUI/SUS.
- **Corrected claim:** Carbone injection + rendering + intake safety are proven; **admin authoring usability is BLOCKED/unproven**.
- **Impact:** Carbone stays an optional later pilot, off the critical path. **Superseded:** the implied usability.

## COR-06 — Official TipTap Pages status precision
- **Previous claim:** "Blocked by paid registry/subscription."
- **Evidence:** `npm view … --registry https://registry.tiptap.dev` → **HTTP 403 invalid credentials**; npmjs → 404; no token in `~/.npmrc`.
- **Corrected claim:** Same conclusion, now with an executed probe. Marked **BLOCKED** (not failed, not proven), and judged **unnecessary** (Gotenberg owns pagination).
- **Impact:** None to recommendation; removes ambiguity. **Superseded:** partial (adds evidence).

## COR-07 — Multi-company / RLS "isolation" framing
- **Previous claim:** Isolation discussed at adapter/fixture level.
- **Evidence:** Server actions gated by `hasPermission(reports.manage)`, preview omits branding/protected assets, but a **DB-level cross-company RLS test is BLOCKED** (single tenant, production no-write). Studio uses `createAdminClient()` server-side (auth boundary = permission guard, not RLS).
- **Corrected claim:** Multi-company **not** proven at the DB/RLS level; adapter-level fixtures are not RLS proof.
- **Impact:** Keeps "multi-company proven" out of the final language; adds a future RLS UAT gate. **Superseded:** any implied RLS proof.

## COR-08 — Baseline evidence integrity now cryptographically verified
- **Previous claim:** Index/manifest asserted 28 PDFs existed.
- **Evidence:** `baseline-verification/*` — all 28 open, 129 files SHA-256'd, page counts match (0 mismatches).
- **Corrected claim:** Prior renderer evidence is **VERIFIED — REUSE** (not merely indexed).
- **Impact:** Allowed non-regeneration of B/C/D benchmarks. **Superseded:** no (confirms).

---

### Net effect on the decision
Corrections **strengthen** the case for a governed hybrid centred on the **existing** Template Studio + Executive Ledger/Gotenberg, and remove the earlier implication that a replacement or paid editor was needed. No correction weakens the preservation of the accepted backend.
