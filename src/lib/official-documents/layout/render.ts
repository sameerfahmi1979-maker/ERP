/**
 * OFFICIAL DOCS.1 — Shared official-document layout renderer.
 *
 * Renders an OfficialDocumentDefinition + render context into one complete,
 * self-contained, print-ready A4 HTML string for Gotenberg/Chromium.
 *
 * Governed page zones (Section 9.5 of the program):
 *   letterhead/header → document metadata/title → body → signature/stamp →
 *   QR verification → footer.
 *
 * Layout modes:
 *   - `en`        — one full-width English body, LTR.
 *   - `ar`        — one full-width Arabic body, true RTL, embedded Arabic font.
 *   - `bilingual` — shared header/title/signature/QR/footer with either
 *       synchronized two-column narrative rows (EN left LTR / AR right RTL,
 *       aligned per semantic row, `break-inside: avoid` per row) or a single
 *       full-width form table with bilingual labels.
 *
 * Security contract (same as the Executive Ledger renderer):
 *   - All dynamic text escaped via elEscapeHtml.
 *   - Image sources restricted to https:// URLs or base64 image data URIs
 *     (escapeImageSrc); QR data URLs validated via isValidQrDataUrl.
 *   - The renderer never queries the database or resolves branding assets —
 *     branding arrives pre-gated (stamp/signature only when the caller holds
 *     reports.sign and approval passed).
 */

import { elEscapeHtml } from "@/lib/executive-ledger/formatters";
import { isValidQrDataUrl } from "@/lib/public-verification/qr";
import type {
  OfficialBodyBlock,
  OfficialDocumentDefinition,
  OfficialDocumentModel,
  OfficialDocumentRenderContext,
  OfficialFormRow,
  OfficialMetaRow,
} from "../types";
import { ARABIC_FONT_STACK, LATIN_FONT_STACK, buildArabicFontFaceCss } from "./fonts";

/**
 * Canonical A4 print margins for official documents. MUST be passed to the
 * PDF engine (Gotenberg/Chromium print margins) by every caller — the HTML
 * itself is margin-free so continuation pages get identical white margins.
 */
export const OFFICIAL_DOCUMENT_PAGE_MARGINS_MM = {
  top: 14,
  bottom: 12,
  left: 18,
  right: 18,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escape an image src for safe embedding. Unlike elEscapeAttr (https-only),
 * official documents also accept base64 image data URIs so protected
 * stamp/signature bytes can be embedded server-side without leaving a
 * fetchable URL in the HTML. Anything else renders as empty (image omitted).
 */
function escapeImageSrc(url: string | null | undefined): string {
  if (!url) return "";
  const isHttps = url.startsWith("https://");
  const isImageDataUri = /^data:image\/(png|jpe?g|svg\+xml|webp);base64,[A-Za-z0-9+/=]+$/.test(url);
  if (!isHttps && !isImageDataUri) return "";
  return elEscapeHtml(url);
}

function paragraphsHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${elEscapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// Body block renderers
// ─────────────────────────────────────────────────────────────────────────────

function renderParagraphBlock(
  block: Extract<OfficialBodyBlock, { kind: "paragraph" }>,
  language: "en" | "ar" | "bilingual"
): string {
  const emphasisClass = block.emphasis === "salutation" ? " od-salutation" : "";

  if (language === "bilingual") {
    // Synchronized semantic row: EN left / AR right, never split across pages.
    return `<tr class="od-bi-row">
      <td class="od-bi-en${emphasisClass}" lang="en" dir="ltr">${block.en ? paragraphsHtml(block.en) : ""}</td>
      <td class="od-bi-gap"></td>
      <td class="od-bi-ar${emphasisClass}" lang="ar" dir="rtl">${block.ar ? paragraphsHtml(block.ar) : ""}</td>
    </tr>`;
  }
  if (language === "ar") {
    return `<div class="od-para od-ar${emphasisClass}" lang="ar" dir="rtl">${block.ar ? paragraphsHtml(block.ar) : ""}</div>`;
  }
  return `<div class="od-para${emphasisClass}" lang="en" dir="ltr">${block.en ? paragraphsHtml(block.en) : ""}</div>`;
}

function renderFormRow(row: OfficialFormRow, language: "en" | "ar" | "bilingual"): string {
  let label: string;
  if (language === "bilingual" && row.labelAr) {
    label = `${elEscapeHtml(row.labelEn)} <span class="od-label-ar" lang="ar" dir="rtl">/ ${elEscapeHtml(row.labelAr)}</span>`;
  } else if (language === "ar" && row.labelAr) {
    label = `<span lang="ar" dir="rtl">${elEscapeHtml(row.labelAr)}</span>`;
  } else {
    label = elEscapeHtml(row.labelEn);
  }
  const valueHtml = row.signatureCell
    ? `<span class="od-sign-line"></span>`
    : `<span${row.emphasized ? ' class="od-emph"' : ""}>${elEscapeHtml(row.value)}</span>`;
  return `<tr class="od-form-row">
    <td class="od-form-label">${label}</td>
    <td class="od-form-value">${valueHtml}</td>
  </tr>`;
}

function renderFormTableBlock(
  block: Extract<OfficialBodyBlock, { kind: "form_table" }>,
  language: "en" | "ar" | "bilingual"
): string {
  const title =
    block.titleEn || block.titleAr
      ? `<div class="od-block-title">${elEscapeHtml(block.titleEn ?? "")}${
          language !== "en" && block.titleAr
            ? ` <span lang="ar" dir="rtl">/ ${elEscapeHtml(block.titleAr)}</span>`
            : ""
        }</div>`
      : "";
  return `<div class="od-form-block">
    ${title}
    <table class="od-form-table">
      <tbody>${block.rows.map((r) => renderFormRow(r, language)).join("")}</tbody>
    </table>
  </div>`;
}

function renderChecklistBlock(
  block: Extract<OfficialBodyBlock, { kind: "checklist" }>,
  language: "en" | "ar" | "bilingual"
): string {
  const withStatus = block.withStatusColumns !== false;
  const head = withStatus
    ? `<thead><tr>
        <th class="od-chk-col-n">#</th>
        <th>${language === "ar" ? "البند" : language === "bilingual" ? 'Item <span lang="ar" dir="rtl">/ البند</span>' : "Item"}</th>
        <th class="od-chk-col-s">${language === "ar" ? "الحالة" : language === "bilingual" ? 'Status <span lang="ar" dir="rtl">/ الحالة</span>' : "Status"}</th>
        <th class="od-chk-col-r">${language === "ar" ? "ملاحظات" : language === "bilingual" ? 'Remarks <span lang="ar" dir="rtl">/ ملاحظات</span>' : "Remarks"}</th>
      </tr></thead>`
    : "";
  const rows = block.items
    .map((item, i) => {
      let text: string;
      if (language === "bilingual" && item.ar) {
        text = `${elEscapeHtml(item.en)} <span class="od-label-ar" lang="ar" dir="rtl">/ ${elEscapeHtml(item.ar)}</span>`;
      } else if (language === "ar" && item.ar) {
        text = `<span lang="ar" dir="rtl">${elEscapeHtml(item.ar)}</span>`;
      } else {
        text = elEscapeHtml(item.en);
      }
      return `<tr class="od-chk-row">
        <td class="od-chk-col-n">${i + 1}</td>
        <td>${text}</td>
        ${withStatus ? '<td class="od-chk-col-s"></td><td class="od-chk-col-r"></td>' : ""}
      </tr>`;
    })
    .join("");
  const title =
    block.titleEn || block.titleAr
      ? `<div class="od-block-title">${elEscapeHtml(block.titleEn ?? "")}${
          language !== "en" && block.titleAr
            ? ` <span lang="ar" dir="rtl">/ ${elEscapeHtml(block.titleAr)}</span>`
            : ""
        }</div>`
      : "";
  return `<div class="od-form-block">
    ${title}
    <table class="od-chk-table">${head}<tbody>${rows}</tbody></table>
  </div>`;
}

function renderBlocks(model: OfficialDocumentModel, language: "en" | "ar" | "bilingual"): string {
  const parts: string[] = [];
  let bilingualBuffer: string[] = [];

  const flushBilingual = () => {
    if (bilingualBuffer.length > 0) {
      parts.push(`<table class="od-bi-table"><tbody>${bilingualBuffer.join("")}</tbody></table>`);
      bilingualBuffer = [];
    }
  };

  for (const block of model.blocks) {
    if (block.kind === "paragraph") {
      const html = renderParagraphBlock(block, language);
      if (language === "bilingual") bilingualBuffer.push(html);
      else parts.push(html);
      continue;
    }
    flushBilingual();
    if (block.kind === "form_table") parts.push(renderFormTableBlock(block, language));
    else if (block.kind === "checklist") parts.push(renderChecklistBlock(block, language));
    else if (block.kind === "spacer") parts.push(`<div style="height:${Math.min(block.heightMm ?? 6, 40)}mm;"></div>`);
  }
  flushBilingual();
  return parts.join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main renderer
// ─────────────────────────────────────────────────────────────────────────────

export function renderOfficialDocumentHtml(
  definition: OfficialDocumentDefinition,
  ctx: OfficialDocumentRenderContext
): string {
  const model = definition.build(ctx);
  const language = ctx.language;
  const branding = ctx.branding;
  const needsArabic = language !== "en";
  const pageDir = language === "ar" ? "rtl" : "ltr";

  // ── Branding values (pre-gated by the coordinator) ──────────────────────
  const companyNameEn = branding?.companyNameEn ?? "";
  const companyNameAr = branding?.companyNameAr ?? "";
  const logoUrl = branding?.showLogo ? escapeImageSrc(branding.logoUrl) : "";
  const stampUrl = branding?.showStamp ? escapeImageSrc(branding?.stampUrl) : "";
  const signatureUrl = branding?.showSignatory ? escapeImageSrc(branding?.signatureUrl) : "";
  const letterheadBgUrl = escapeImageSrc(branding?.letterheadBackgroundUrl);
  const themePrimary = /^#[0-9a-fA-F]{6}$/.test(branding?.themePrimaryColor ?? "")
    ? (branding!.themePrimaryColor as string)
    : "#1e293b";

  const addressBlock = branding?.addressBlockEn ?? "";
  const contactParts: string[] = [];
  if (branding?.phone) contactParts.push(`Tel: ${elEscapeHtml(branding.phone)}`);
  if (branding?.email) contactParts.push(elEscapeHtml(branding.email));
  if (branding?.website) contactParts.push(elEscapeHtml(branding.website));

  const footerParts: string[] = [];
  if (branding?.footerTextEn) footerParts.push(elEscapeHtml(branding.footerTextEn));
  if (branding?.showTrn !== false && branding?.trn) footerParts.push(`TRN: ${elEscapeHtml(branding.trn)}`);
  if (branding?.showLicense !== false && branding?.tradeLicenseNo)
    footerParts.push(`License: ${elEscapeHtml(branding.tradeLicenseNo)}`);
  if (footerParts.length === 0 && companyNameEn) footerParts.push(elEscapeHtml(companyNameEn));

  // ── Title (shared bilingual title per Section 9.3) ──────────────────────
  let titleHtml = "";
  if (language === "bilingual" && model.titleAr) {
    titleHtml = `${elEscapeHtml(model.titleEn)} <span class="od-title-sep">|</span> <span lang="ar" dir="rtl">${elEscapeHtml(model.titleAr)}</span>`;
  } else if (language === "ar" && model.titleAr) {
    titleHtml = `<span lang="ar" dir="rtl">${elEscapeHtml(model.titleAr)}</span>`;
  } else {
    titleHtml = elEscapeHtml(model.titleEn);
  }

  // ── Metadata strip: document number + issue date ────────────────────────
  // Bilingual labels isolate the Arabic segment (dir="rtl" span) so the bidi
  // algorithm cannot reorder it against the adjacent Latin value.
  const refLabel =
    language === "ar"
      ? "الرقم المرجعي"
      : language === "bilingual"
        ? 'Ref <span lang="ar" dir="rtl">/ الرقم المرجعي</span>'
        : "Ref";
  const dateLabel =
    language === "ar"
      ? "التاريخ"
      : language === "bilingual"
        ? 'Date <span lang="ar" dir="rtl">/ التاريخ</span>'
        : "Date";
  const issuedDate =
    language === "ar" ? ctx.issuedDateAr : language === "bilingual" ? `${ctx.issuedDateEn}` : ctx.issuedDateEn;

  const metaRows = (model.meta ?? [])
    .map((m: OfficialMetaRow) => {
      let label: string;
      if (language === "bilingual" && m.labelAr) {
        label = `${elEscapeHtml(m.labelEn)} <span class="od-label-ar" lang="ar" dir="rtl">/ ${elEscapeHtml(m.labelAr)}</span>`;
      } else if (language === "ar" && m.labelAr) {
        label = `<span lang="ar" dir="rtl">${elEscapeHtml(m.labelAr)}</span>`;
      } else {
        label = elEscapeHtml(m.labelEn);
      }
      return `<tr class="od-form-row"><td class="od-form-label">${label}</td><td class="od-form-value">${elEscapeHtml(m.value)}</td></tr>`;
    })
    .join("");

  // ── Body ─────────────────────────────────────────────────────────────────
  const bodyHtml = renderBlocks(model, language);

  const closingHtml =
    model.closingEn || model.closingAr
      ? language === "bilingual"
        ? `<table class="od-bi-table"><tbody><tr class="od-bi-row">
            <td class="od-bi-en" lang="en" dir="ltr">${model.closingEn ? paragraphsHtml(model.closingEn) : ""}</td>
            <td class="od-bi-gap"></td>
            <td class="od-bi-ar" lang="ar" dir="rtl">${model.closingAr ? paragraphsHtml(model.closingAr) : ""}</td>
          </tr></tbody></table>`
        : language === "ar"
          ? `<div class="od-para od-ar" lang="ar" dir="rtl">${model.closingAr ? paragraphsHtml(model.closingAr) : ""}</div>`
          : `<div class="od-para" lang="en" dir="ltr">${model.closingEn ? paragraphsHtml(model.closingEn) : ""}</div>`
      : "";

  // ── Signature / stamp zone (one shared full-width zone) ─────────────────
  const sigName = branding?.signatoryName ?? "";
  const sigTitle = branding?.signatoryTitleEn ?? "";
  const showSignature = model.showSignature !== false;
  const signatoryLabel =
    language === "ar"
      ? "المفوض بالتوقيع"
      : language === "bilingual"
        ? 'Authorized Signatory <span lang="ar" dir="rtl">/ المفوض بالتوقيع</span>'
        : "Authorized Signatory";

  const signatureHtml = showSignature
    ? `<div class="od-signature">
        <table class="od-signature-table"><tr>
          <td class="od-sig-left">
            ${signatureUrl ? `<img src="${signatureUrl}" alt="Signature" class="od-sig-img" onerror="this.style.display='none'">` : ""}
            <div class="od-sig-rule">
              ${sigName ? `<div class="od-sig-name">${elEscapeHtml(sigName)}</div>` : ""}
              <div class="od-sig-title">${sigTitle ? elEscapeHtml(sigTitle) : signatoryLabel}</div>
            </div>
          </td>
          <td class="od-sig-right">
            ${stampUrl ? `<img src="${stampUrl}" alt="Stamp" class="od-stamp-img" onerror="this.style.display='none'">` : ""}
          </td>
        </tr></table>
      </div>`
    : "";

  // ── QR verification zone (one QR only) ──────────────────────────────────
  let qrHtml = "";
  const verification = ctx.verification;
  if (verification?.qrDataUrl && isValidQrDataUrl(verification.qrDataUrl)) {
    const qrLabel = elEscapeHtml(
      verification.label ??
        (language === "ar" ? "امسح للتحقق" : language === "bilingual" ? "Scan to verify / امسح للتحقق" : "Scan to verify")
    );
    qrHtml = `<div class="od-qr">
      <img src="${verification.qrDataUrl}" alt="QR verification code" class="od-qr-img" />
      <div class="od-qr-label">${qrLabel}</div>
    </div>`;
  }

  // ── Watermark (draft previews only) ─────────────────────────────────────
  const watermarkHtml = ctx.watermarkText
    ? `<div class="od-watermark">${elEscapeHtml(ctx.watermarkText)}</div>`
    : "";

  const bgStyle = letterheadBgUrl
    ? `background-image:url('${letterheadBgUrl}'); background-size:cover; background-position:center;`
    : "";

  return `<!DOCTYPE html>
<html lang="${language === "ar" ? "ar" : "en"}" dir="${pageDir}">
<head>
  <meta charset="UTF-8">
  <title>${elEscapeHtml(model.titleEn)}</title>
  <style>
    ${needsArabic ? buildArabicFontFaceCss() : ""}
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${LATIN_FONT_STACK};
      font-size: 10.5pt;
      color: #1a1a1a;
      line-height: 1.65;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      ${bgStyle}
    }
    [lang="ar"], .od-ar {
      font-family: ${ARABIC_FONT_STACK};
      line-height: 1.9;
    }
    /*
     * Page margins are applied by the PDF engine (Chromium print margins via
     * OFFICIAL_DOCUMENT_PAGE_MARGINS_MM) so every page — including
     * continuation pages — gets identical white margins. The page container
     * itself must NOT carry mm padding or a fixed A4 min-height: that is what
     * pushes content to the paper edge on page 2+ and spills near-blank
     * trailing pages.
     */
    .od-page {
      min-height: 267mm; /* printable A4 height minus engine margins — pins the footer to the bottom of single-page letters */
      display: flex;
      flex-direction: column;
      position: relative;
    }

    /* ── Zone: letterhead header ── */
    .od-header {
      display: flex;
      align-items: center;
      gap: 6mm;
      padding-bottom: 4mm;
      border-bottom: 2.5px solid ${themePrimary};
      break-inside: avoid;
    }
    .od-header-logo img { max-height: 62px; max-width: 150px; object-fit: contain; display: block; }
    .od-header-names { flex: 1; }
    .od-company-en { font-size: 13.5pt; font-weight: 800; color: ${themePrimary}; letter-spacing: 0.2px; line-height: 1.25; }
    .od-company-ar { font-size: 11.5pt; font-weight: 700; color: ${themePrimary}; line-height: 1.5; }
    .od-header-contact { font-size: 7.5pt; color: #555; margin-top: 1.5mm; line-height: 1.5; }

    /* ── Zone: metadata strip ── */
    .od-meta-strip {
      display: flex;
      justify-content: space-between;
      gap: 8mm;
      padding: 3mm 0;
      font-size: 9pt;
      color: #334155;
      border-bottom: 1px solid #e2e8f0;
      break-inside: avoid;
    }
    .od-meta-strip strong { color: #0f172a; }

    /* ── Zone: title ── */
    .od-title {
      text-align: center;
      font-size: 14pt;
      font-weight: 800;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: ${themePrimary};
      margin: 7mm 0 2mm;
      text-decoration: underline;
      text-underline-offset: 4px;
      break-inside: avoid;
    }
    .od-title [lang="ar"] { text-transform: none; letter-spacing: 0; }
    .od-title-sep { color: #94a3b8; font-weight: 400; padding: 0 2mm; }
    .od-subtitle { text-align: center; font-size: 9pt; color: #64748b; margin-bottom: 5mm; }

    /* ── Body ── */
    .od-body { flex: 1; padding-top: 4mm; }
    .od-para { margin-bottom: 4.5mm; text-align: justify; }
    .od-para.od-ar { text-align: justify; }
    .od-para p { margin-bottom: 3mm; }
    .od-salutation { font-weight: 800; letter-spacing: 0.6px; text-align: center !important; margin: 4mm 0 6mm; }
    .od-salutation p { margin-bottom: 0; }
    .od-emph { font-weight: 700; }

    /* ── Bilingual synchronized rows ── */
    .od-bi-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .od-bi-row { break-inside: avoid; page-break-inside: avoid; }
    .od-bi-en, .od-bi-ar { width: 48.5%; vertical-align: top; padding-bottom: 4.5mm; text-align: justify; }
    .od-bi-gap { width: 3%; }
    .od-bi-en p, .od-bi-ar p { margin-bottom: 3mm; }
    .od-bi-en.od-salutation, .od-bi-ar.od-salutation { text-align: center !important; }

    /* ── Form tables (bilingual labels) ── */
    .od-form-block { margin: 3mm 0 5mm; }
    .od-block-title {
      font-size: 9pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;
      color: ${themePrimary}; border-bottom: 1px solid #e2e8f0; padding-bottom: 1.5mm; margin-bottom: 2.5mm;
    }
    .od-form-table { width: 100%; border-collapse: collapse; }
    .od-form-row { break-inside: avoid; page-break-inside: avoid; }
    .od-form-row td { padding: 2mm 2.5mm; border: 1px solid #e2e8f0; font-size: 9.5pt; vertical-align: top; }
    .od-form-label { width: 42%; background: #f8fafc; color: #334155; font-weight: 600; }
    .od-label-ar { color: #475569; font-weight: 600; }
    .od-form-value { color: #0f172a; }
    .od-sign-line { display: inline-block; width: 60%; border-bottom: 1px solid #94a3b8; height: 7mm; }

    /* ── Checklist tables ── */
    .od-chk-table { width: 100%; border-collapse: collapse; }
    .od-chk-table thead { display: table-header-group; }
    .od-chk-table th {
      background: ${themePrimary}; color: #fff; font-size: 8.5pt; font-weight: 700;
      text-align: ${pageDir === "rtl" ? "right" : "left"}; padding: 2mm 2.5mm; letter-spacing: 0.4px;
    }
    .od-chk-row { break-inside: avoid; page-break-inside: avoid; }
    .od-chk-row td { padding: 2mm 2.5mm; border: 1px solid #e2e8f0; font-size: 9.5pt; }
    .od-chk-col-n { width: 8mm; text-align: center; color: #64748b; }
    .od-chk-col-s { width: 24mm; }
    .od-chk-col-r { width: 38mm; }

    /* ── Zone: signature/stamp ── */
    .od-signature { margin-top: 10mm; break-inside: avoid; page-break-inside: avoid; }
    .od-signature-table { width: 100%; border-collapse: collapse; }
    .od-sig-left { width: 58%; vertical-align: bottom; }
    .od-sig-right { width: 42%; vertical-align: bottom; text-align: ${pageDir === "rtl" ? "left" : "right"}; }
    .od-sig-img { max-height: 46px; max-width: 150px; object-fit: contain; display: block; margin-bottom: 1mm; }
    .od-sig-rule { border-top: 1.5px solid #0f172a; width: 58mm; padding-top: 1.5mm; margin-top: 12mm; }
    .od-sig-img + .od-sig-rule { margin-top: 0; }
    .od-sig-name { font-size: 10pt; font-weight: 700; }
    .od-sig-title { font-size: 8.5pt; color: #475569; }
    .od-stamp-img { max-height: 88px; max-width: 88px; object-fit: contain; display: inline-block; }

    /* ── Zone: QR verification ── */
    .od-qr { margin-top: 5mm; display: flex; flex-direction: column; align-items: ${pageDir === "rtl" ? "flex-start" : "flex-end"}; break-inside: avoid; }
    .od-qr-img { width: 68px; height: 68px; image-rendering: pixelated; }
    .od-qr-label { font-size: 6.5pt; color: #64748b; margin-top: 1mm; letter-spacing: 0.3px; }

    /* ── Zone: footer ── */
    .od-footer {
      border-top: 2px solid ${themePrimary};
      margin-top: 6mm;
      padding-top: 2.5mm;
      font-size: 7.5pt;
      color: #64748b;
      text-align: center;
      line-height: 1.6;
      break-inside: avoid;
    }

    /* ── Watermark (draft previews only) ── */
    .od-watermark {
      position: fixed; top: 45%; left: 50%;
      transform: translate(-50%, -50%) rotate(-32deg);
      font-size: 74pt; font-weight: 900; color: rgba(15, 23, 42, 0.07);
      letter-spacing: 8px; pointer-events: none; z-index: 0; white-space: nowrap;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  ${watermarkHtml}
  <div class="od-page">

    <!-- Zone: letterhead header -->
    <div class="od-header">
      ${logoUrl ? `<div class="od-header-logo"><img src="${logoUrl}" alt="Company logo" onerror="this.parentElement.style.display='none'"></div>` : ""}
      <div class="od-header-names">
        ${companyNameEn ? `<div class="od-company-en">${elEscapeHtml(companyNameEn)}</div>` : ""}
        ${companyNameAr ? `<div class="od-company-ar" lang="ar" dir="rtl">${elEscapeHtml(companyNameAr)}</div>` : ""}
        ${addressBlock ? `<div class="od-header-contact">${elEscapeHtml(addressBlock)}</div>` : ""}
        ${contactParts.length > 0 ? `<div class="od-header-contact">${contactParts.join("  ·  ")}</div>` : ""}
      </div>
    </div>

    <!-- Zone: document metadata -->
    <div class="od-meta-strip">
      <div><strong>${refLabel}:</strong> ${elEscapeHtml(ctx.serialNo ?? "—")}</div>
      <div><strong>${dateLabel}:</strong> ${elEscapeHtml(issuedDate)}${language === "bilingual" ? ` <span lang="ar" dir="rtl">/ ${elEscapeHtml(ctx.issuedDateAr)}</span>` : ""}</div>
    </div>

    <!-- Zone: title -->
    <div class="od-title">${titleHtml}</div>
    ${model.subtitleEn || model.subtitleAr ? `<div class="od-subtitle">${elEscapeHtml(model.subtitleEn ?? "")}${language !== "en" && model.subtitleAr ? ` <span lang="ar" dir="rtl">${elEscapeHtml(model.subtitleAr)}</span>` : ""}</div>` : ""}

    <!-- Zone: body -->
    <div class="od-body">
      ${metaRows ? `<div class="od-form-block"><table class="od-form-table"><tbody>${metaRows}</tbody></table></div>` : ""}
      ${bodyHtml}
      ${closingHtml}
      ${signatureHtml}
      ${qrHtml}
    </div>

    <!-- Zone: footer -->
    <div class="od-footer">${footerParts.join("  ·  ")}</div>

  </div>
</body>
</html>`;
}
