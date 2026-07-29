# REPORT.DESIGNER.VALIDATION.SPIKE.1 — Corrected Research, Licensing and Maintenance Report

**Date:** 2026-07-26
**Evidence-tier legend:** `[FACT]` verified from a primary source or executed test · `[SPIKE]` executed in this spike · `[VENDOR]` vendor claim (documentation/marketing) · `[INFER]` reasoned inference · `[OPEN]` unresolved legal/licensing question.

This report corrects licensing/version statements from the prior spike where completion-phase evidence contradicts them.

---

## 1. TipTap (core + official Pages)

- `[FACT]` `@tiptap/*` core/extensions are **MIT**. The ERP already runs TipTap **v3** (production Template Studio uses it).
- `[SPIKE]` **Official `@tiptap-pro/extension-pages` is inaccessible without a paid plan.** `npm view @tiptap-pro/extension-pages --registry https://registry.tiptap.dev` → **HTTP 403 "Invalid credentials"**; public npmjs → **404**. No authorized token is configured in this environment (`~/.npmrc` contains only `strict-ssl=false`).
- `[VENDOR]` TipTap markets "Pages" (formerly "Pagination") as part of paid Start/Team/Business tiers via a private registry with a per-seat/subscription model. Exact current pricing is **`[OPEN]`** — do not quote a figure without a live check at purchase time.
- `[INFER]` Pages is **not required** for this ERP: pagination is owned by Gotenberg/Chromium at render time. In-editor page boundaries are a UX nicety, not a functional gap.
- **Maintenance/upgrade risk:** LOW for TipTap core (widely used, active, MIT). Adopting Pro would add a paid dependency + private-registry CI secret → MEDIUM operational risk. **Recommendation: do not adopt Pro.**
- **Correction:** the prior spike tested a **community** extension `tiptap-extension-pagination` (ISC, v2-only) and reported RTL/pagination defects. Those defects belong to that isolated prototype, **not** to the production v3 Template Studio (which emits correct `dir=rtl`). See the Correction Register.

---

## 2. Carbone (DOCX template engine)

- `[FACT]` Carbone Community Edition is distributed under the **Carbone Community License (CCL)** — a source-available license, not OSI-approved; free tier permits self-hosted rendering. The vendor also sells Carbone Studio/Cloud and an enterprise edition.
- `[OPEN]` CCL redistribution/commercial-scale terms should be legally reviewed before shipping Carbone as a first-class ERP feature (especially any resale/multi-tenant angle).
- `[SPIKE]` Prior spike proved injection + LibreOffice→PDF rendering (`carbone@3.8.2`, 9/9 docs). This completion phase proved the **intake security guard set** (8/8, `docx-security-battery-results.json`) but **did not** prove **admin GUI authoring usability** (no human participant).
- `[FACT]` Microsoft Word is installed on the host (`Office16 WINWORD.EXE`); LibreOffice is available via the Gotenberg container (libreoffice module up).
- **Maintenance risk:** MEDIUM–HIGH. Word/LibreOffice fidelity drift, font substitution for Arabic, template-governance complexity, and CCL terms all add cost. Keep Carbone as an **optional later pilot**, not the core designer.

---

## 3. pdfme (fixed-layout designer + generator)

- `[FACT]` `@pdfme/*` (`common`, `schemas`, `generator`, `ui`) are **MIT**; underlying `pdf-lib` is MIT. Actively maintained.
- `[SPIKE]` Version `6.1.12` used. Visual **Designer UI proven** hands-on (drag/drop, export/reopen, branding switch, 88 ms generate). **Arabic fails** (disconnected glyphs) — `pages/designer-card-arabic-p1.png`.
- `[SPIKE]` **Bundle is heavy:** production build ≈ **6.88 MB** main (2.33 MB gzip) + a **11.26 MB** `clawpdf` worker. Must be lazy-loaded; unacceptable as an always-on editor chunk.
- **Maintenance risk:** MEDIUM (extra engine + fonts + bundle discipline). Viable only for **English-only** fixed cards/labels behind a flag.

---

## 4. Gotenberg (HTML/DOCX → PDF)

- `[FACT]` Gotenberg is **MIT**, self-hostable (Docker). Running locally with **both** Chromium and LibreOffice modules up (`/health`).
- `[SPIKE]` Concurrency proven: warm 512 ms; 10 concurrent = **11.85 PDF/s**, all succeeded.
- **Maintenance risk:** LOW. Already the accepted official renderer; no change recommended.

---

## 5. Supporting spike tooling (not production)

| Package | License | Use |
|---|---|---|
| `docx` 9.x | MIT | programmatic DOCX fixtures |
| `pdf-to-img`, `pdfjs-dist` | Apache-2.0 / MIT | rasterize PDFs for visual QA |
| `@napi-rs/canvas` | MIT | canvas backend |
| `jszip` | MIT/GPL dual | synthetic DOCX security fixtures |
| `vite` | MIT | isolated prototype dev servers |

All confined to `spikes/**`; none imported by production routes.

---

## 6. Licensing gate summary

| Engine | License | FOSS? | Paid dependency? | Commercial suitability |
|---|---|---|---|---|
| Executive Ledger + Gotenberg | MIT / in-house | Yes | No | **Best** — keep as official renderer |
| TipTap core (Template Studio) | MIT | Yes | No | **Recommended** for flowing-letter authoring |
| TipTap Pages | Proprietary | No | **Yes** (blocked) | Avoid — unnecessary |
| pdfme | MIT | Yes | No | Optional — English fixed layouts only |
| Carbone CE | CCL (source-available) | Partial | Enterprise upsell | Optional pilot — legal review `[OPEN]` |

**No paid license is required to deliver the recommended architecture.**
