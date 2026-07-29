/**
 * OUTPUT.SPIKE.1 — Fixture builders (synthetic data ONLY).
 *
 * No production employees, no real branding assets, no real stamps/signatures.
 * Branding is data-driven from the SyntheticCompany objects below to prove the
 * renderer takes branding from data, never from hardcoded company identity.
 */

export interface SyntheticCompany {
  key: string;
  nameEn: string;
  nameAr: string;
  accent: string;
  accentDark: string;
  trn: string;
  address: string;
  phone: string;
  email: string;
}

export const COMPANIES: SyntheticCompany[] = [
  {
    key: "companyA",
    nameEn: "SYNTHETIC GULF TRANSPORT LLC",
    nameAr: "شركة الخليج الاصطناعية للنقل ش.ذ.م.م",
    accent: "#1d4ed8",
    accentDark: "#172554",
    trn: "100000000000001",
    address: "P.O. Box 11111, Test City, UAE",
    phone: "+971-0-111-1111",
    email: "fixture-a@example.com",
  },
  {
    key: "companyB",
    nameEn: "SYNTHETIC SCRAP TRADING LLC",
    nameAr: "شركة الخردة الاصطناعية للتجارة ش.ذ.م.م",
    accent: "#047857",
    accentDark: "#022c22",
    trn: "100000000000002",
    address: "P.O. Box 22222, Test City, UAE",
    phone: "+971-0-222-2222",
    email: "fixture-b@example.com",
  },
  {
    key: "companyC",
    nameEn: "FUTURE SYNTHETIC INDUSTRIES FZE",
    nameAr: "المستقبل للصناعات الاصطناعية م.م.ح",
    accent: "#7c3aed",
    accentDark: "#2e1065",
    trn: "100000000000003",
    address: "P.O. Box 33333, Free Zone, UAE",
    phone: "+971-0-333-3333",
    email: "fixture-c@example.com",
  },
];

/** Data-driven synthetic logo — a simple SVG monogram in the company accent color. */
export function syntheticLogoDataUri(c: SyntheticCompany): string {
  const initials = c.nameEn.split(" ").slice(0, 2).map((w) => w[0]).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="48" viewBox="0 0 120 48"><rect width="120" height="48" rx="6" fill="${c.accent}"/><text x="60" y="31" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="700" fill="#ffffff" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Unmistakable protected-asset placeholders — never real stamp/signature bytes. */
const STAMP_PLACEHOLDER = `<div class="protected-ph stamp-ph">PROTECTED STAMP<br/>PLACEHOLDER</div>`;
const SIGNATURE_PLACEHOLDER = `<div class="protected-ph sig-ph">PROTECTED SIGNATURE PLACEHOLDER</div>`;

/** Shared print CSS. Fonts are attached as sibling resources of index.html. */
export function baseCss(c: SyntheticCompany, opts?: { rtl?: boolean }): string {
  return `
  @font-face {
    font-family: "Noto Sans Arabic";
    src: url("noto-arabic-400.woff2") format("woff2");
    font-weight: 400;
  }
  @font-face {
    font-family: "Noto Sans Arabic";
    src: url("noto-arabic-700.woff2") format("woff2");
    font-weight: 700;
  }
  :root { --accent: ${c.accent}; --accent-dark: ${c.accentDark}; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ${opts?.rtl ? `"Noto Sans Arabic",` : ""} Arial, Helvetica, sans-serif;
    color: #111827; font-size: 11pt; line-height: 1.55;
    ${opts?.rtl ? "direction: rtl;" : ""}
  }
  p { orphans: 3; widows: 3; }
  .doc-header {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 3px solid var(--accent); padding-bottom: 4mm; margin-bottom: 6mm;
  }
  .doc-header .co-name { font-size: 13pt; font-weight: 700; color: var(--accent-dark); }
  .doc-header .co-sub { font-size: 8pt; color: #6b7280; }
  .doc-footer {
    border-top: 1px solid #d1d5db; margin-top: 8mm; padding-top: 3mm;
    font-size: 8pt; color: #6b7280; display: flex; justify-content: space-between;
  }
  h1.title { text-align: center; text-decoration: underline; font-size: 14pt; letter-spacing: 1px; color: var(--accent-dark); }
  h2.section { font-size: 11.5pt; color: var(--accent-dark); border-bottom: 1px solid var(--accent); padding-bottom: 1mm; }
  table.data { width: 100%; border-collapse: collapse; margin: 4mm 0; }
  table.data th { background: var(--accent); color: #fff; text-align: ${opts?.rtl ? "right" : "left"}; padding: 2mm 3mm; font-size: 9.5pt; }
  table.data td { border: 0.3mm solid #d1d5db; padding: 1.8mm 3mm; font-size: 9.5pt; }
  table.data thead { display: table-header-group; }  /* repeating header across pages */
  table.data tr { page-break-inside: avoid; }
  .kv { margin: 1mm 0; }
  .kv b { display: inline-block; min-width: 52mm; }
  .watermark {
    position: fixed; top: 40%; left: 8%; transform: rotate(-30deg);
    font-size: 46pt; font-weight: 700; color: rgba(107, 114, 128, 0.12);
    pointer-events: none; z-index: 0; letter-spacing: 6px;
  }
  .protected-ph {
    border: 1.5px dashed #b91c1c; color: #b91c1c; background: #fef2f2;
    font-size: 7.5pt; font-weight: 700; text-align: center; padding: 3mm;
    display: inline-block;
  }
  .stamp-ph { width: 34mm; height: 34mm; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
  .sig-ph { width: 52mm; }
  .qr-block { text-align: center; font-size: 7pt; color: #6b7280; }
  .qr-block img { width: 22mm; height: 22mm; }
  .page-break { page-break-before: always; }
  .sig-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 12mm; }
  `;
}

function header(c: SyntheticCompany, logoUri: string, rtl = false): string {
  return `<div class="doc-header">
    <img src="${logoUri}" alt="logo" width="120" height="48"/>
    <div style="text-align:${rtl ? "left" : "right"}">
      <div class="co-name">${rtl ? c.nameAr : c.nameEn}</div>
      <div class="co-sub">${c.address} · TRN ${c.trn}</div>
    </div>
  </div>`;
}

function footer(c: SyntheticCompany, docRef: string): string {
  return `<div class="doc-footer">
    <span>${c.nameEn} · ${c.phone} · ${c.email}</span>
    <span>Ref: ${docRef} · SPIKE FIXTURE — NOT AN OFFICIAL DOCUMENT</span>
  </div>`;
}

function qrBlock(qrDataUri: string, token: string): string {
  return `<div class="qr-block">
    <img src="${qrDataUri}" alt="verification qr"/>
    <div>Verify: (inactive spike token)<br/>${token.slice(0, 12)}…</div>
  </div>`;
}

/** D1/D2/D3 — short certificate, per company (branding-swap proof). */
export function shortCertificateHtml(c: SyntheticCompany, qrDataUri: string, token: string): string {
  const logo = syntheticLogoDataUri(c);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${baseCss(c)}</style></head><body>
  <div class="watermark">SPIKE FIXTURE</div>
  ${header(c, logo)}
  <h1 class="title">TO WHOM IT MAY CONCERN</h1>
  <p>This is to certify that <b>[SYNTHETIC EMPLOYEE NAME]</b>, holding Employee Code
  <b>EMP-SPIKE-001</b>, is currently employed with <b>${c.nameEn}</b> as
  <b>[Designation]</b> in the <b>[Department]</b> Department.</p>
  <h2 class="section">Employee Information</h2>
  <div class="kv"><b>Name:</b> [SYNTHETIC EMPLOYEE NAME]</div>
  <div class="kv"><b>Employee Code / ID:</b> EMP-SPIKE-001</div>
  <div class="kv"><b>Date of Joining:</b> 01 January 2020</div>
  <div class="kv"><b>Employment Status:</b> Active</div>
  <p>This certificate is issued upon request for official use only. It does not constitute
  any financial guarantee on behalf of ${c.nameEn}.</p>
  <div class="sig-row">
    <div>
      <div>For and on behalf of<br/><b>${c.nameEn}</b></div>
      ${SIGNATURE_PLACEHOLDER}
    </div>
    ${STAMP_PLACEHOLDER}
    ${qrBlock(qrDataUri, token)}
  </div>
  ${footer(c, "SPIKE-D-" + c.key)}
  </body></html>`;
}

/** D4 — Arabic RTL certificate with embedded Noto Sans Arabic (shaping proof). */
export function arabicCertificateHtml(c: SyntheticCompany, qrDataUri: string, token: string): string {
  const logo = syntheticLogoDataUri(c);
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><style>${baseCss(c, { rtl: true })}</style></head><body>
  <div class="watermark">نموذج تجريبي</div>
  ${header(c, logo, true)}
  <h1 class="title">إلى من يهمه الأمر</h1>
  <p>نشهد نحن <b>${c.nameAr}</b> بأن الموظف <b>[اسم الموظف التجريبي]</b>، الحامل للرقم الوظيفي
  <b>EMP-SPIKE-001</b>، يعمل لدينا حاليًا بوظيفة <b>[المسمى الوظيفي]</b> في قسم <b>[القسم]</b>.</p>
  <h2 class="section">بيانات الموظف</h2>
  <div class="kv"><b>الاسم:</b> [اسم الموظف التجريبي]</div>
  <div class="kv"><b>الرقم الوظيفي:</b> EMP-SPIKE-001</div>
  <div class="kv"><b>تاريخ الالتحاق بالعمل:</b> ١ يناير ٢٠٢٠</div>
  <div class="kv"><b>الحالة الوظيفية:</b> على رأس العمل</div>
  <p>حُررت هذه الشهادة بناءً على طلب الموظف لاستخدامها في الأغراض الرسمية، ولا تُعد ضمانًا
  ماليًا أو التزامًا قانونيًا على ${c.nameAr}. تخضع كافة البيانات الواردة أعلاه لسجلات
  الموارد البشرية المعتمدة لدى الشركة.</p>
  <div class="sig-row">
    <div>
      <div>عن <b>${c.nameAr}</b></div>
      ${SIGNATURE_PLACEHOLDER}
    </div>
    ${STAMP_PLACEHOLDER}
    ${qrBlock(qrDataUri, token)}
  </div>
  ${footer(c, "SPIKE-D4")}
  </body></html>`;
}

/** D5 — long flowing multi-page letter with page breaks + repeating table headers. */
export function longLetterHtml(c: SyntheticCompany, qrDataUri: string, token: string): string {
  const logo = syntheticLogoDataUri(c);
  const para = `<p>This paragraph exists to prove flowing multi-page text layout, widow and orphan
  control, and consistent typographic rhythm across page boundaries. The quick brown fox jumps
  over the lazy dog while the committee reviews clause after clause of the synthetic employment
  agreement, ensuring that no line of a paragraph is stranded alone at the top or bottom of a
  page when the document is paginated by the print engine.</p>`;
  const rows = Array.from({ length: 60 }, (_, i) =>
    `<tr><td>${i + 1}</td><td>Synthetic allowance line item ${i + 1}</td><td>AED ${(1000 + i * 7).toLocaleString()}</td><td>Monthly</td></tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${baseCss(c)}</style></head><body>
  <div class="watermark">SPIKE FIXTURE</div>
  ${header(c, logo)}
  <h1 class="title">SYNTHETIC LONG-FORM EMPLOYMENT LETTER</h1>
  ${Array.from({ length: 6 }, () => para).join("\n")}
  <h2 class="section">Section 2 — Deliberate Page Break Follows</h2>
  <p>The next heading is forced onto a new page via an explicit page break.</p>
  <div class="page-break"></div>
  <h2 class="section">Section 3 — Repeating Table Header Proof (60 rows)</h2>
  <table class="data">
    <thead><tr><th>#</th><th>Description</th><th>Amount</th><th>Frequency</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${Array.from({ length: 4 }, () => para).join("\n")}
  <div class="sig-row">
    <div>
      <div>For and on behalf of<br/><b>${c.nameEn}</b></div>
      ${SIGNATURE_PLACEHOLDER}
    </div>
    ${STAMP_PLACEHOLDER}
    ${qrBlock(qrDataUri, token)}
  </div>
  ${footer(c, "SPIKE-D5")}
  </body></html>`;
}

/** D6 — fixed-size CR80 card proof (class D). 85.6mm x 54mm, zero margin. */
export function fixedCardHtml(c: SyntheticCompany, qrDataUri: string): string {
  const logo = syntheticLogoDataUri(c);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
  @page { size: 85.6mm 54mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 85.6mm; height: 54mm; font-family: Arial, Helvetica, sans-serif; }
  .card { width: 100%; height: 100%; padding: 3mm; display: flex; flex-direction: column;
    background: linear-gradient(135deg, ${c.accentDark} 0%, ${c.accent} 100%); color: #fff; }
  .row { display: flex; justify-content: space-between; align-items: center; }
  .name { font-size: 10pt; font-weight: 700; margin-top: 2mm; }
  .meta { font-size: 6.5pt; opacity: .85; }
  .qr { background: #fff; padding: 1mm; border-radius: 1mm; }
  .qr img { width: 12mm; height: 12mm; display: block; }
  </style></head><body>
  <div class="card">
    <div class="row">
      <img src="${logo}" width="60" height="24" alt="logo"/>
      <span class="meta">EMPLOYEE ID — SPIKE FIXTURE</span>
    </div>
    <div class="name">[SYNTHETIC EMPLOYEE NAME]</div>
    <div class="meta">EMP-SPIKE-001 · [Designation] · [Department]</div>
    <div class="row" style="margin-top:auto">
      <div class="meta">${c.nameEn}<br/>Valid: SPIKE ONLY — NOT AN ID</div>
      <div class="qr"><img src="${qrDataUri}" alt="qr"/></div>
    </div>
  </div>
  </body></html>`;
}
