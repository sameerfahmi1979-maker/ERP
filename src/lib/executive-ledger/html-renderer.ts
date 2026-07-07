/**
 * Executive Ledger Template Engine — HTML Renderer
 * Phase: BRANDING.5 — Executive Ledger Template Engine
 *
 * Produces a complete, self-contained, print-ready A4 HTML document string
 * from an ExecutiveLedgerDocument definition.
 *
 * Security contract:
 * - All dynamic text is escaped via elEscapeHtml() / elEscapeAttr().
 * - Image URLs are validated via elEscapeAttr() (https:// only).
 * - The renderer never queries Supabase, calls OpenAI, or resolves branding assets.
 * - Stamp/signature render only if provided in the already-gated ExportBrandingContext.
 * - No raw dangerouslySetInnerHTML in calling React components — output is safe HTML.
 *
 * Design language — Executive Ledger:
 * - A4 (210×297mm) container
 * - Double border frame (outer shell + inner inset border)
 * - Formal company header with dynamic logo
 * - Title block with document ref and date
 * - Addressee / subject strip
 * - Flexible body sections (text, key-value, ledger table)
 * - Signatory / stamp / signature area
 * - Legal footer with TRN / trade license / company branding text
 */

import type {
  ExecutiveLedgerDocument,
  ExecutiveLedgerSection,
  ExecutiveLedgerBodySection,
  ExecutiveLedgerKeyValueSection,
  ExecutiveLedgerKeyValueRow,
  ExecutiveLedgerTableSection,
  ExecutiveLedgerDividerSection,
  ExecutiveLedgerColumnSection,
  ExecutiveLedgerColumnSlot,
  ExecutiveLedgerParty,
} from "./types";
import {
  elEscapeHtml,
  elEscapeAttr,
  elTextToParagraphs,
} from "./formatters";
import {
  EL_NEUTRAL_COMPANY_NAME,
  EL_NEUTRAL_FOOTER,
  EL_MARGIN_MM,
  EL_LOGO_MAX_HEIGHT_PX,
  EL_STAMP_SIZE_PX,
  EL_SIGNATURE_MAX_WIDTH_PX,
  EL_SIGNATURE_MAX_HEIGHT_PX,
} from "./constants";
import { isValidQrDataUrl } from "@/lib/public-verification/qr";

// ─────────────────────────────────────────────────────────────────────────────
// Section renderers
// ─────────────────────────────────────────────────────────────────────────────

function renderPartyBlock(party: ExecutiveLedgerParty, labelOverride?: string): string {
  const label = labelOverride ?? party.label ?? "";
  return `
    <tr>
      <td style="padding:3px 0; vertical-align:top; width:80px;">
        <span style="font-size:8px; font-weight:700; letter-spacing:1px; color:#555; text-transform:uppercase;">${elEscapeHtml(label)}</span>
      </td>
      <td style="padding:3px 0; vertical-align:top;">
        <span style="font-size:10px; font-weight:700; color:#1a1a1a;">${elEscapeHtml(party.name)}</span>
        ${party.title ? `<span style="font-size:9px; color:#555;"> · ${elEscapeHtml(party.title)}</span>` : ""}
        ${party.company ? `<br><span style="font-size:9px; color:#555;">${elEscapeHtml(party.company)}</span>` : ""}
        ${party.idRef ? `<br><span style="font-size:8.5px; color:#888; font-family:monospace;">${elEscapeHtml(party.idRef)}</span>` : ""}
        ${(party.lines ?? []).map((l) => `<br><span style="font-size:8.5px; color:#555;">${elEscapeHtml(l)}</span>`).join("")}
      </td>
    </tr>`;
}

function renderBodySection(section: ExecutiveLedgerBodySection): string {
  const dir = section.language === "ar" ? ' dir="rtl" style="text-align:right;"' : "";
  // REPORT DESIGNER UX.1: use pre-rendered richHtml when available (set by server-side ProseMirror renderer)
  const bodyContent = section.richHtml
    ? section.richHtml  // Already safe HTML from our controlled renderer
    : `<div style="font-size:10px; line-height:1.7; color:#1a1a1a;">${elTextToParagraphs(section.content)}</div>`;
  return `
    <div class="el-section"${dir}>
      ${section.title ? `<div class="el-section-title">${elEscapeHtml(section.title)}</div>` : ""}
      ${bodyContent}
    </div>`;
}

function renderKeyValueRow(row: ExecutiveLedgerKeyValueRow): string {
  if (row.isSubHeader) {
    return `<tr>
      <td colspan="3" style="padding:8px 0 2px; font-size:8.5px; font-weight:700; letter-spacing:0.8px; text-transform:uppercase; color:#555; border-bottom:1px solid #ccc;">
        ${elEscapeHtml(row.label)}
      </td>
    </tr>`;
  }
  const valueStyle = row.emphasized
    ? "font-size:10px; font-weight:700; color:#1a1a1a;"
    : "font-size:10px; color:#1a1a1a;";
  return `<tr>
    <td style="padding:4px 0; font-size:9.5px; color:#555; width:40%; vertical-align:top;">${elEscapeHtml(row.label)}</td>
    <td style="padding:4px 4px; color:#999; font-size:8px; vertical-align:top; white-space:nowrap;">···</td>
    <td style="padding:4px 0; ${valueStyle} vertical-align:top;">${elEscapeHtml(row.value)}</td>
  </tr>`;
}

function renderKeyValueSection(section: ExecutiveLedgerKeyValueSection): string {
  return `
    <div class="el-section">
      ${section.title ? `<div class="el-section-title">${elEscapeHtml(section.title)}</div>` : ""}
      <table style="width:100%; border-collapse:collapse;">
        <tbody>
          ${section.rows.map(renderKeyValueRow).join("")}
        </tbody>
      </table>
    </div>`;
}

function renderTableSection(section: ExecutiveLedgerTableSection): string {
  // REPORT DESIGNER.9: showHeader defaults true; honor false to hide header row
  const showHeader = section.showHeader !== false;

  // REPORT DESIGNER.9: safe column width hints — strip any unsafe patterns
  const safeWidthPattern = /^(\d+(?:\.\d+)?(?:px|%|em|rem|mm|cm)|auto|unset|inherit)$/;
  const widths = (section.columnWidths ?? []).map((w, i) =>
    i < section.headers.length && safeWidthPattern.test(w.trim())
      ? w.trim()
      : ""
  );

  const headerCells = section.headers
    .map((h, i) => {
      const widthAttr = widths[i] ? ` style="padding:5px 8px; text-align:left; font-size:8.5px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; color:#fff; background:#1e293b; width:${elEscapeAttr(widths[i])};"` : ` style="padding:5px 8px; text-align:left; font-size:8.5px; font-weight:700; letter-spacing:0.5px; text-transform:uppercase; color:#fff; background:#1e293b;"`;
      return `<th${widthAttr}>${elEscapeHtml(h)}</th>`;
    })
    .join("");

  const bodyRows = section.rows
    .map((row, i) => {
      const cells = row
        .map((cell) => `<td style="padding:5px 8px; font-size:9.5px; color:#1a1a1a; border-bottom:1px solid #eee;">${elEscapeHtml(cell)}</td>`)
        .join("");
      const bg = i % 2 === 0 ? "#fff" : "#f9fafb";
      return `<tr style="background:${bg};">${cells}</tr>`;
    })
    .join("");

  const totals = (section.totals ?? [])
    .map((row) => `
      <tr>
        <td colspan="${section.headers.length - 1}" style="padding:5px 8px; font-size:9.5px; font-weight:700; color:#555; border-top:1px solid #ccc; text-align:right;">${elEscapeHtml(row.label)}</td>
        <td style="padding:5px 8px; font-size:10px; font-weight:700; color:#1a1a1a; border-top:1px solid #ccc;">${elEscapeHtml(row.value)}</td>
      </tr>`)
    .join("");

  return `
    <div class="el-section">
      ${section.title ? `<div class="el-section-title">${elEscapeHtml(section.title)}</div>` : ""}
      <table style="width:100%; border-collapse:collapse; border:1px solid #e2e8f0;">
        ${showHeader ? `<thead><tr>${headerCells}</tr></thead>` : ""}
        <tbody>
          ${bodyRows}
          ${totals}
        </tbody>
      </table>
    </div>`;
}

function renderDividerSection(section: ExecutiveLedgerDividerSection): string {
  if (section.label) {
    return `<div style="display:flex; align-items:center; margin:12px 0; gap:8px;">
      <div style="flex:1; height:1px; background:#ddd;"></div>
      <span style="font-size:8px; color:#aaa; text-transform:uppercase; letter-spacing:1px; white-space:nowrap;">${elEscapeHtml(section.label)}</span>
      <div style="flex:1; height:1px; background:#ddd;"></div>
    </div>`;
  }
  return `<div style="height:1px; background:#e2e8f0; margin:12px 0;"></div>`;
}

// ─── REPORT DESIGNER UX.1: Column section renderer ───────────────────────────

/** Map layout preset to flex proportions for left / center / right */
const COLUMN_FLEX_PRESETS: Record<string, [number, number, number]> = {
  "equal":      [1, 0, 1],      // 50 / 50 (center unused for 2-col)
  "2-col":      [1, 0, 1],      // alias of equal
  "left-wide":  [7, 0, 3],      // 70 / 30
  "right-wide": [3, 0, 7],      // 30 / 70
  "3-col":      [1, 1, 1],      // 33 / 34 / 33
};

const COLUMN_GAP_PRESETS: Record<string, string> = {
  "sm": "8px",
  "md": "16px",
  "lg": "24px",
};

const COLUMN_VALIGN_PRESETS: Record<string, string> = {
  "top":    "flex-start",
  "middle": "center",
  "bottom": "flex-end",
};

function renderColumnSlot(slot: ExecutiveLedgerColumnSlot): string {
  if (slot.section) {
    // Render using existing section renderer (body or key-value only)
    if (slot.section.type === "body") {
      return renderBodySection(slot.section as ExecutiveLedgerBodySection);
    }
    if (slot.section.type === "key_value") {
      return renderKeyValueSection(slot.section as ExecutiveLedgerKeyValueSection);
    }
  }
  if (slot.html) {
    // Pre-rendered trusted HTML from mapper (logo, stamp, signatory, QR)
    // This is ONLY set by server-side mapper code, never from user input
    return slot.html;
  }
  return "";
}

function renderColumnSection(section: ExecutiveLedgerColumnSection): string {
  const layoutKey = section.layout in COLUMN_FLEX_PRESETS ? section.layout : "equal";
  const [leftFlex, centerFlex, rightFlex] = COLUMN_FLEX_PRESETS[layoutKey];
  const gap = COLUMN_GAP_PRESETS[section.gap ?? "md"] ?? "16px";
  const alignItems = COLUMN_VALIGN_PRESETS[section.verticalAlign ?? "top"] ?? "flex-start";
  const is3col = layoutKey === "3-col";

  const leftHtml   = section.slots.left   ? renderColumnSlot(section.slots.left)   : "";
  const centerHtml = section.slots.center ? renderColumnSlot(section.slots.center) : "";
  const rightHtml  = section.slots.right  ? renderColumnSlot(section.slots.right)  : "";

  const leftDiv   = `<div style="flex:${leftFlex}; min-width:0;">${leftHtml}</div>`;
  const centerDiv = is3col ? `<div style="flex:${centerFlex}; min-width:0;">${centerHtml}</div>` : "";
  const rightDiv  = `<div style="flex:${rightFlex}; min-width:0;">${rightHtml}</div>`;

  return `<div class="el-section" style="display:flex; gap:${gap}; align-items:${alignItems};">
    ${leftDiv}${centerDiv}${rightDiv}
  </div>`;
}

function renderSection(section: ExecutiveLedgerSection): string {
  switch (section.type) {
    case "body":      return renderBodySection(section as ExecutiveLedgerBodySection);
    case "key_value": return renderKeyValueSection(section as ExecutiveLedgerKeyValueSection);
    case "table":     return renderTableSection(section as ExecutiveLedgerTableSection);
    case "divider":   return renderDividerSection(section as ExecutiveLedgerDividerSection);
    case "column":    return renderColumnSection(section as ExecutiveLedgerColumnSection);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main renderer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render an ExecutiveLedgerDocument to a complete, self-contained HTML string.
 *
 * The output is safe to:
 * - Inject into an `<iframe srcdoc="">` for preview
 * - Write into a new window for printing
 * - Pass to jsPDF via html plugin for PDF conversion (future)
 *
 * All dynamic text is HTML-escaped. All image URLs are validated.
 */
export function renderExecutiveLedgerHtml(doc: ExecutiveLedgerDocument): string {
  const branding = doc.branding;

  // ── Branding values ────────────────────────────────────────────────────────
  const companyName = branding?.companyNameEn ?? EL_NEUTRAL_COMPANY_NAME;
  const logoUrl = branding?.showLogo ? elEscapeAttr(branding.logoUrl) : "";
  const stampUrl = branding?.showStamp ? elEscapeAttr(branding?.stampUrl) : "";
  const signatureUrl = branding?.showSignatory ? elEscapeAttr(branding?.signatureUrl) : "";
  const letterheadBgUrl = elEscapeAttr(branding?.letterheadBackgroundUrl);
  const watermarkUrl = branding?.showWatermark && branding.watermarkUrl
    ? elEscapeAttr(branding.watermarkUrl)
    : "";
  const watermarkText = branding?.showWatermark && !watermarkUrl
    ? elEscapeHtml(branding?.watermarkText)
    : "";

  const themePrimary = branding?.themePrimaryColor ?? "#1e293b";
  // Title band colors: Report Designer per-template overrides take priority
  // over the branding profile theme (doc.titleBlockStyle is validated hex).
  const themeHeaderBg =
    doc.titleBlockStyle?.bgColor ??
    branding?.themeHeaderBgColor ??
    branding?.themePrimaryColor ??
    "#1e293b";
  const themeHeaderText =
    doc.titleBlockStyle?.textColor ?? branding?.themeHeaderTextColor ?? "#ffffff";

  const addressBlock = branding?.addressBlockEn ?? "";
  const phone = branding?.phone ?? "";
  const trn = branding?.trn ?? "";
  const tradeLicense = branding?.tradeLicenseNo ?? "";
  const website = branding?.website ?? "";
  const footerText = doc.footerOverride ?? branding?.footerTextEn ?? EL_NEUTRAL_FOOTER;

  // ── Signatory ──────────────────────────────────────────────────────────────
  const sigName = doc.signatoryOverride?.name ?? branding?.signatoryName ?? "";
  const sigTitle = doc.signatoryOverride?.titleEn ?? branding?.signatoryTitleEn ?? "";
  // Suppress the built-in signatory when the visual template already renders one
  // via a ColumnStripBlock signatory slot (prevents double-rendering).
  const showSignatoryBlock = !doc.suppressBuiltinSignatory && !!(sigName || signatureUrl || stampUrl);

  // ── Direction ──────────────────────────────────────────────────────────────
  const dir = doc.direction === "rtl" ? "rtl" : "ltr";
  const isLandscape = doc.orientation === "landscape";

  // ── Company header info line ───────────────────────────────────────────────
  const headerInfoParts: string[] = [];
  if (addressBlock) headerInfoParts.push(elEscapeHtml(addressBlock));
  if (phone) headerInfoParts.push(`Tel: ${elEscapeHtml(phone)}`);
  if (website) headerInfoParts.push(elEscapeHtml(website));

  // ── Addressee strip ────────────────────────────────────────────────────────
  const hasAddresseeStrip = !!(doc.addressee || doc.issuer || doc.subject);

  // ── Body sections ──────────────────────────────────────────────────────────
  const sectionsHtml = (doc.sections ?? []).map(renderSection).join("");

  // ── Notes ─────────────────────────────────────────────────────────────────
  const notesHtml = doc.notes
    ? `<div class="el-section" style="background:#f8fafc; border-left:3px solid #cbd5e1; padding:10px 12px;">
         <div class="el-section-title">Notes</div>
         <div style="font-size:9.5px; color:#334155;">${elTextToParagraphs(doc.notes)}</div>
       </div>`
    : "";

  // ── Terms ─────────────────────────────────────────────────────────────────
  const termsHtml =
    doc.terms && doc.terms.length > 0
      ? `<div class="el-section">
           <div class="el-section-title">Terms &amp; Conditions</div>
           <ol style="margin:0; padding-left:18px;">
             ${doc.terms.map((t) => `<li style="font-size:9px; color:#555; margin-bottom:3px;">${elEscapeHtml(t)}</li>`).join("")}
           </ol>
         </div>`
      : "";

  // ── QR / Verification block ───────────────────────────────────────────────
  // Priority: verification.qrDataUrl > verification.publicUrl > qrPlaceholder
  const verification = doc.verification;
  let qrHtml = "";

  if (verification?.qrDataUrl && isValidQrDataUrl(verification.qrDataUrl)) {
    // Real QR code — data URL from trusted local qrcode package only
    const qrLabel = elEscapeHtml(verification.label ?? "Scan to verify");
    qrHtml = `<div style="display:inline-flex; flex-direction:column; align-items:center; gap:3px; margin-top:4px;">
      <img src="${verification.qrDataUrl}" alt="QR Code — ${qrLabel}" style="width:70px; height:70px; display:block; image-rendering:pixelated;" />
      <span style="font-size:7px; color:#64748b; text-align:center; letter-spacing:0.3px;">${qrLabel}</span>
    </div>`;
  } else if (verification?.publicUrl) {
    // URL-only fallback (no QR image available)
    const safeUrl = elEscapeAttr(
      verification.publicUrl.startsWith("https://") ? verification.publicUrl : ""
    );
    const qrLabel = elEscapeHtml(verification.label ?? "Verify document at:");
    if (safeUrl) {
      qrHtml = `<div style="margin-top:4px; text-align:right;">
        <div style="font-size:7px; color:#64748b; letter-spacing:0.3px; margin-bottom:2px;">${qrLabel}</div>
        <div style="font-size:7px; font-family:monospace; color:#1e293b; word-break:break-all; max-width:140px;">${safeUrl}</div>
      </div>`;
    }
  } else if (doc.qrPlaceholder) {
    // Legacy placeholder — hidden in print so a pending QR box doesn't appear on paper
    qrHtml = `<div class="el-no-print" style="display:inline-flex; flex-direction:column; align-items:center; gap:3px; border:1px dashed #cbd5e1; width:60px; height:60px; background:#f8fafc; margin-top:4px; align-items:center; justify-content:center;">
      <span style="font-size:7px; color:#94a3b8; text-align:center; line-height:1.4; padding:4px;">QR<br>Code</span>
    </div>`;
  }

  // ── Signatory block ────────────────────────────────────────────────────────
  const signatoryHtml = showSignatoryBlock
    ? `<div style="margin-top:24px; padding-top:16px; border-top:1px solid #e2e8f0;">
         <table style="width:100%; border-collapse:collapse;">
           <tr>
             <td style="width:55%; vertical-align:bottom; padding-right:20px;">
               ${signatureUrl ? `<img src="${signatureUrl}" alt="Signature" style="max-height:${EL_SIGNATURE_MAX_HEIGHT_PX}px; max-width:${EL_SIGNATURE_MAX_WIDTH_PX}px; object-fit:contain; display:block; margin-bottom:4px;" onerror="this.style.display='none'">` : ""}
               <div style="border-top:1px solid #1a1a1a; width:140px; padding-top:4px; margin-top:${signatureUrl ? "0" : "32px"};">
                 ${sigName ? `<div style="font-size:10px; font-weight:700; color:#1a1a1a;">${elEscapeHtml(sigName)}</div>` : ""}
                 ${sigTitle ? `<div style="font-size:9px; color:#555;">${elEscapeHtml(sigTitle)}</div>` : ""}
               </div>
             </td>
             <td style="width:45%; vertical-align:bottom; text-align:right;">
               ${stampUrl ? `<img src="${stampUrl}" alt="Stamp" style="max-height:${EL_STAMP_SIZE_PX}px; max-width:${EL_STAMP_SIZE_PX}px; object-fit:contain; display:inline-block;" onerror="this.style.display='none'">` : ""}
               ${qrHtml ? `<div style="display:inline-block; vertical-align:bottom;">${qrHtml}</div>` : ""}
             </td>
           </tr>
         </table>
       </div>`
    : qrHtml
      ? `<div style="margin-top:24px; text-align:right;">${qrHtml}</div>`
      : "";

  // ── Footer ─────────────────────────────────────────────────────────────────
  const footerParts: string[] = [elEscapeHtml(footerText)];
  if (trn) footerParts.push(`TRN: ${elEscapeHtml(trn)}`);
  if (tradeLicense) footerParts.push(`License: ${elEscapeHtml(tradeLicense)}`);

  // ── Watermark ─────────────────────────────────────────────────────────────
  const watermarkHtml = watermarkUrl
    ? `<div style="position:fixed; inset:0; z-index:0; pointer-events:none; opacity:0.06; background:url('${watermarkUrl}') center/contain no-repeat;"></div>`
    : watermarkText
      ? `<div style="position:fixed; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-35deg); font-size:72px; color:rgba(0,0,0,0.06); font-weight:900; pointer-events:none; z-index:0; white-space:nowrap;">${watermarkText}</div>`
      : "";

  // ── Letterhead background ──────────────────────────────────────────────────
  const bgStyle = letterheadBgUrl
    ? `background-image:url('${letterheadBgUrl}'); background-size:cover; background-attachment:fixed; background-position:center;`
    : "";

  // ── Page size ─────────────────────────────────────────────────────────────
  const pageSize = isLandscape ? "A4 landscape" : "A4 portrait";

  return `<!DOCTYPE html>
<html lang="en" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${elEscapeHtml(doc.documentTitle)}</title>
  <style>
    /* ── Reset ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 10px;
      color: #1a1a1a;
      background: #e5e7eb;
      ${bgStyle}
    }

    /* ── Print setup ── */
    @media print {
      @page { size: ${pageSize}; margin: 0; }
      body { background: none !important; padding: 0 !important; }
      .el-outer-frame { box-shadow: none !important; margin: 0 !important; padding: ${EL_MARGIN_MM}mm !important; }
      .el-no-print { display: none !important; }
    }

    /* ── A4 container ── */
    .el-outer-frame {
      width: 210mm;
      min-height: 270mm;
      margin: 20px auto;
      background: #fff;
      box-shadow: 0 4px 24px rgba(0,0,0,0.12);
      padding: 10px;
      position: relative;
    }
    .el-inner-frame {
      border: 2px solid #1e293b;
      padding: 16px 20px;
      min-height: 250mm;
      display: flex;
      flex-direction: column;
    }

    /* ── Company header ── */
    .el-header {
      display: flex;
      align-items: center;
      gap: 14px;
      padding-bottom: 12px;
      border-bottom: 2px solid ${themePrimary};
      margin-bottom: 0;
    }
    .el-header-logo img {
      max-height: ${EL_LOGO_MAX_HEIGHT_PX}px;
      max-width: 140px;
      object-fit: contain;
      display: block;
    }
    .el-header-info { flex: 1; }
    .el-company-name {
      font-size: 13px;
      font-weight: 800;
      color: ${themeHeaderBg};
      letter-spacing: 0.3px;
      line-height: 1.2;
    }
    .el-company-sub {
      font-size: 8.5px;
      color: #555;
      margin-top: 2px;
      line-height: 1.5;
    }

    /* ── Title block ── */
    .el-title-block {
      background: ${themeHeaderBg};
      color: ${themeHeaderText};
      padding: 10px 16px;
      margin: 0 -20px;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .el-doc-title {
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .el-doc-subtitle {
      font-size: 9px;
      opacity: 0.85;
      margin-top: 2px;
    }
    .el-doc-meta {
      text-align: right;
      font-size: 9px;
      opacity: 0.9;
      line-height: 1.6;
      white-space: nowrap;
    }

    /* ── Addressee strip ── */
    .el-addressee-strip {
      border-bottom: 1px solid #e2e8f0;
      padding: 10px 0 8px;
      margin-bottom: 0;
    }

    /* ── Subject line ── */
    .el-subject-line {
      padding: 6px 0 10px;
      font-size: 9.5px;
      color: #334155;
      border-bottom: 1px solid #e2e8f0;
    }
    .el-subject-label {
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-right: 6px;
      color: #555;
      font-size: 8px;
    }

    /* ── Sections ── */
    .el-body { flex: 1; padding: 14px 0; }
    .el-section { margin-bottom: 16px; }
    .el-section-title {
      font-size: 8.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: ${themePrimary};
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-bottom: 8px;
    }

    /* ── Footer ── */
    .el-footer {
      border-top: 2px solid ${themePrimary};
      padding-top: 8px;
      margin-top: auto;
      font-size: 8px;
      color: #777;
      text-align: center;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  ${watermarkHtml}
  <div class="el-outer-frame">
    <div class="el-inner-frame">

      <!-- Company Header -->
      <div class="el-header">
        ${logoUrl ? `<div class="el-header-logo"><img src="${logoUrl}" alt="${elEscapeHtml(companyName)} Logo" onerror="this.parentElement.style.display='none'"></div>` : ""}
        <div class="el-header-info">
          <div class="el-company-name">${elEscapeHtml(companyName)}</div>
          ${branding?.companyNameAr ? `<div class="el-company-sub" dir="rtl">${elEscapeHtml(branding.companyNameAr)}</div>` : ""}
          ${headerInfoParts.length > 0 ? `<div class="el-company-sub">${headerInfoParts.join("  ·  ")}</div>` : ""}
        </div>
      </div>

      <!-- Document Title Block -->
      ${doc.hideTitleBlock ? "" : `
      <div class="el-title-block">
        <div>
          <div class="el-doc-title">${elEscapeHtml(doc.documentTitle)}</div>
          ${doc.documentSubtitle ? `<div class="el-doc-subtitle">${elEscapeHtml(doc.documentSubtitle)}</div>` : ""}
        </div>
        <div class="el-doc-meta">
          ${doc.documentRef ? `<div><strong>Ref:</strong> ${elEscapeHtml(doc.documentRef)}</div>` : ""}
          ${doc.issuedDate ? `<div><strong>Date:</strong> ${elEscapeHtml(doc.issuedDate)}</div>` : ""}
          ${doc.issuedAt ? `<div><strong>Location:</strong> ${elEscapeHtml(doc.issuedAt)}</div>` : ""}
        </div>
      </div>`}

      <!-- Addressee Strip -->
      ${hasAddresseeStrip ? `
      <div class="el-addressee-strip">
        <table style="border-collapse:collapse; width:100%;">
          <tbody>
            ${doc.addressee ? renderPartyBlock(doc.addressee) : ""}
            ${doc.issuer ? renderPartyBlock(doc.issuer) : ""}
          </tbody>
        </table>
        ${doc.subject ? `
        <div class="el-subject-line">
          <span class="el-subject-label">RE:</span>
          <strong>${elEscapeHtml(doc.subject)}</strong>
        </div>` : ""}
      </div>` : ""}

      <!-- Document Body -->
      <div class="el-body">
        ${sectionsHtml}
        ${notesHtml}
        ${termsHtml}
        ${signatoryHtml}
      </div>

      <!-- Footer -->
      <div class="el-footer">
        ${footerParts.join("  ·  ")}
      </div>

    </div>
  </div>
</body>
</html>`;
}
