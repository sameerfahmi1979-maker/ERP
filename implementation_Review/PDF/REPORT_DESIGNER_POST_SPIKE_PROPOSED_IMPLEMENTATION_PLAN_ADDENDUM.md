# REPORT DESIGNER — Post-Spike Proposed Implementation Plan Addendum

**Status:** PROPOSAL ONLY — no implementation authorized by REPORT.DESIGNER.VALIDATION.SPIKE.1.
**Requires:** Sameer's approval of the five decisions in the Architecture Decision Report §7.
**Basis:** `REPORT_DESIGNER_VALIDATION_SPIKE_1_ARCHITECTURE_DECISION_REPORT.md` (evidence-backed hybrid).

---

## Guiding constraints (unchanged)

The ERP Global Output Framework backend is **preserved as-is**: Executive Ledger renderer, Gotenberg,
output registry, branding, numbering, QR verification, protected stamp/signature assets, private
storage, hashing, issuance history, permissions/RLS, reissue/supersession, email/print/download
controls, retries, reconciliation and monitoring. All phases below sit **on top of** that backend.

## Proposed phase sequence

### Phase RD.P0 — Puck decommission-prep and label hygiene (small, low-risk)

- Export the 2 real Puck layouts (template ids 14, 15 — identical md5 `3fff1cf122a76e81dc858a3b4f0d6d10`) to a governed archive file, with checksums recorded (already captured read-only in the spike).
- Relabel `visual_editor_engine='puck'` rows whose layouts are empty `{}` (ids 1–3, 5–13, 19–21) to the correct engine value once the target engine is approved — **labels only; never nulling or deleting layout JSON**.
- Map the one archived + one draft "To Whom It May Concern" design into a Studio/EL equivalent before any Puck code removal is even scheduled.
- Exit gate: zero published templates carrying a `puck` label; original JSON preserved with checksums.

### Phase RD.P1 — Template Studio enhancement wave 1 (Mode 1 authoring)

Scope (from spike + prior audit defect list):
1. A4-styled preview frame in the editor (visual page metaphor without fake pagination promises).
2. RTL/direction support: direction-aware paragraph attributes preserved through the sanitizer → EL renderer (fixes the `dir` stripping proven in the spike).
3. Bidi isolation for LTR runs inside RTL sentences in the EL text pipeline (spike finding D3b).
4. Placeholder blocks: header/footer/QR/signatory/stamp visual placeholders in the editor mapped to protected server-side injection.
5. Searchable field picker over the 57-field registry with grouping and sensitivity badges.
6. Server-preview parity button: render the actual Gotenberg PDF preview (existing pipeline) inside the Studio.
- Exit gate: the 16-task admin UX script from the audit passes without developer assistance for the two pilot letters.

### Phase RD.P2 — Carbone/DOCX pilot "Mode 1-W" (ONLY if approved)

1. Admin authors 2 real letters (1 EN, 1 bilingual) in Word with `{d.x}` markers, no developer editing the file.
2. Server: template bytes stored as governed template versions (hash, draft→review→publish); carbone@3.x injection; Gotenberg LibreOffice conversion; existing issuance pipeline.
3. Gates: macro/`.docm` rejection + zip-bomb limits; unresolved-`{d.` post-render scan; per-template LibreOffice fidelity approval; brand fonts installed in the Gotenberg image; one template per company (no dynamic images in community edition).
- Exit gate: pilot letters issued end-to-end in staging with Arabic fidelity sign-off; go/no-go for wider rollout.

### Phase RD.P3 — Mode 2 code-first analytical reports hardening

- Registry-driven report definitions (EL table sections) for the existing 19 class-E outputs; fixture-based visual regression (PDF hash + page-count assertions like the spike scripts).
- No visual designer for this mode — explicit product decision recorded.

### Phase RD.P4 — Mode 3 fixed-layout assets

- CR80/badge/label templates as code-first EL `@page` documents (spike-proven), parameterized by the branding context; the spike's D7 QR/name overlap fixed via layout review checklist.
- pdfme remains shelved; revisit only for English-only assets with a fresh spike if demand appears.

### Explicitly NOT planned

- TipTap Pages purchase (revisit via 30-day trial only if RD.P1 fails its exit gate).
- pdfme designer integration.
- Any change to numbering, QR, storage, hashing, permissions or issuance flows.

## Rollback strategy

Each phase is independently reversible: RD.P0 is label-only with archived originals; RD.P1 is
additive UI; RD.P2 is a parallel authoring path that can be disabled by feature permission without
touching Modes 1–3; RD.P3/P4 replace nothing that exists today.

## Success metrics

- Admin self-service rate for new letters (target: pilot letters authored with 0 developer edits).
- Preview/PDF parity complaints (target: 0 — structural parity retained via single renderer).
- Arabic output defects reported post-rollout (target: 0 critical).
- Time-to-new-template (measure before/after RD.P1/P2).
