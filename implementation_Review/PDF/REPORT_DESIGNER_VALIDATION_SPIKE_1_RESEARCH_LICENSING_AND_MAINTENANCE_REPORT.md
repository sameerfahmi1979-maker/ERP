# REPORT.DESIGNER.VALIDATION.SPIKE.1 — Research, Licensing and Maintenance Report

**Date of research:** 2026-07-26 (all URLs accessed this date)
**Labeling:** every claim is tagged `VERIFIED FACT` (spike-tested), `PROJECT DOCS` (vendor documentation), `MAINTAINER STATEMENT`, `USER REPORT`, or `INFERENCE`.

---

## 1. TipTap / TipTap Pages

| Item | Finding | Label |
|---|---|---|
| Core editor license | MIT, free (`@tiptap/*` public packages; ERP uses v3.27.1) | PROJECT DOCS + VERIFIED (installed) |
| Pages availability | Pro package on private registry `registry.tiptap.dev`; requires active Tiptap subscription; `npm install @tiptap-pro/extension-pages` returned **404** without token in this spike | VERIFIED FACT |
| Pricing | Start $59/mo ($49 annual), Team $179/$149, Business $1,199/$999, Enterprise custom; free plan removed June 2025 (30-day trial remains); extra dev licenses $49/dev/mo | PROJECT DOCS (tiptap.dev/pricing) |
| Pages runtime | "Pages on its own makes no network calls and needs no credentials"; DOCX/PDF conversion add-ons require signed cloud tokens | PROJECT DOCS |
| Sources | https://tiptap.dev/pricing · https://tiptap.dev/docs/pages/getting-started/overview · https://tiptap.dev/docs/pages/getting-started/install · https://tiptap.dev/docs/guides/pro-extensions | accessed 2026-07-26 |

## 2. Community pagination — `tiptap-extension-pagination`

| Item | Finding | Label |
|---|---|---|
| Version / license | 2.1.4 / ISC · repo github.com/hugs7/tiptap-extension-pagination | VERIFIED FACT (npm view) |
| Peer deps | `@tiptap/core ^2.11.5`, `@tiptap/pm ^2.11.5` — **incompatible with ERP TipTap 3.27.1** | VERIFIED FACT |
| Behaviour | A4 page nodes 794×1123 px + margins/header/footer render; initial load NOT paginated until first edit; no intra-paragraph splitting; `dir=rtl` stripped by StarterKit | VERIFIED FACT (spike prototype, 4 screenshots) |

## 3. Carbone

| Item | Finding | Label |
|---|---|---|
| Version tested | carbone 3.8.2 (npm, community) | VERIFIED FACT |
| License | **Carbone Community License (CCL)** — free use/modification as a backend component of "Value Added Products or Services"; prohibited: offering document-generator-as-a-service. The ALGT ERP is a value-added internal product → community use permitted | PROJECT DOCS (github.com/carboneio/carbone LICENSE.md) + INFERENCE (qualification) |
| Version policy | Community is one major version behind Enterprise (v3 vs v4) | PROJECT DOCS |
| Feature boundary | **Dynamic images** (e.g. per-company logo injection) = Enterprise/v4; community markers `{d.x}`, loops `{d.rows[i]}`, conditions, formatters = free | PROJECT DOCS + VERIFIED FACT (loops/markers proven in spike) |
| On-prem docker | `carbone/carbone-ee` image runs community features free without license key | PROJECT DOCS (hub.docker.com/r/carbone/carbone-ee) |
| PDF conversion | Requires LibreOffice; this spike used the existing **Gotenberg LibreOffice module** — Arabic shaped correctly, repeating table headers honored | VERIFIED FACT |
| Sources | https://github.com/carboneio/carbone · LICENSE.md · https://hub.docker.com/r/carbone/carbone-ee | accessed 2026-07-26 |

## 4. pdfme

| Item | Finding | Label |
|---|---|---|
| Version / license | @pdfme/* 6.1.12 / MIT | VERIFIED FACT |
| Maintenance | Active (frequent releases, responsive maintainer hand-dot; rich-text/page-break work in PR #1300, line-breaking improvements #686/#1115/#1116) | PROJECT DOCS / MAINTAINER STATEMENT |
| RTL/Arabic | **"RTL text support is not needed at this time, as the existing UI doesn't support RTL either"** — maintainer, PR #1300 (Jan 2026); issue #398 documents historical Arabic line-break bugs; pdf-lib performs no complex shaping | MAINTAINER STATEMENT + USER REPORT |
| Spike confirmation | Standalone Arabic broken/faint; card bidi punctuation mirrored; table cells partially acceptable; no text reflow; table auto-pagination WITHOUT repeating headers; 34–270 ms generation | VERIFIED FACT |
| Sources | https://github.com/pdfme/pdfme/pull/1300 · /pull/686 · /issues/1115 · /issues/398 | accessed 2026-07-26 |

## 5. Gotenberg (existing)

| Item | Finding | Label |
|---|---|---|
| License / version | MIT · Gotenberg 8, health shows **chromium: up, libreoffice: up** | VERIFIED FACT |
| Role | Already the ERP's official HTML→PDF renderer; this spike additionally proved its **LibreOffice module** converts Carbone DOCX output with correct Arabic | VERIFIED FACT |

## 6. Evidence-rendering utilities (spike-only, not production candidates)

`docx@9.7.1` (MIT), `pdf-to-img` (MIT), `@napi-rs/canvas` (MIT), `pdfjs-dist` (Apache-2.0, already a repo dep), `vite@6` (MIT), `http-server` (MIT).

## 7. Licensing Gate Summary

| Candidate | Production-eligible under intended license? | Unresolved legal questions |
|---|---|---|
| A official Pages | **No, without subscription** ($49+/mo, private registry, per-dev licensing) | Whether Pages tier covers all needed features (Enterprise lists "Page-based layouts") — vendor confirmation needed before any purchase |
| A community pagination | Yes (ISC) but **technically incompatible** (TipTap v2-only) | none |
| B Carbone community | **Yes** — CCL permits embedded use in a value-added product; not a doc-gen-as-a-service | Confirm comfort with CCL §2.2 wording; EE quote only if dynamic images become mandatory |
| C pdfme | Yes (MIT) | none |
| D Executive Ledger + Gotenberg | Yes (in-house + MIT) | none |

No private pricing was invented; all pricing cited is public vendor pricing as of 2026-07-26.
