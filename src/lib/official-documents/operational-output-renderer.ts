import "server-only";

import { elEscapeHtml } from "@/lib/executive-ledger/formatters";
import { renderOfficialDocumentModelHtml } from "./layout/render";
import { renderOfflinePrintPdf } from "./layout/offline-print-pdf";
import { outputPath, type OperationalOutput } from "./operational-output";

const status = "Internal working copy";
const evidenceTitle = "Retained original evidence";

const retainedVersion = (proof: OperationalOutput["evidence"][number]) =>
  proof.reference + " · version #" + proof.version + " · " + (proof.current ? "Current version" : "Historical version");

function manualSignatures(kind: OperationalOutput["kind"]): string[] {
  switch (kind) {
    case "custody": return ["Handed over by", "Received by"];
    case "timesheet": return ["Actual operator", "Site representative", "Operations verification"];
    case "job-card": return ["Actual technician", "Workshop supervisor", "Independent QC"];
    default: return [];
  }
}

export function renderOperationalOutputHtml(data: OperationalOutput): string {
  const footer = [data.branch, status].join(" · ");
  const evidence = data.evidence.map(proof => ({
    labelEn: proof.label,
    value: retainedVersion(proof) + " · File #" + proof.file,
  }));
  const labels = manualSignatures(data.kind);
  const html = renderOfficialDocumentModelHtml({
    titleEn: data.title,
    subtitleEn: status,
    meta: [
      { labelEn: "Branch", value: data.branch },
      { labelEn: "Source revision", value: data.revision },
      { labelEn: "Source checksum", value: data.source_checksum },
    ],
    blocks: [
      { kind: "form_table", rows: data.rows.map(([labelEn, value]) => ({ labelEn, value: value ?? "Unrecorded" })) },
      ...(evidence.length ? [{ kind: "form_table" as const, titleEn: evidenceTitle, rows: evidence }] : []),
      ...(labels.length ? [{
        kind: "form_table" as const, titleEn: "Paper fallback",
        rows: labels.map(labelEn => ({ labelEn, value: "", signatureCell: true })),
      }] : []),
    ],
    showSignature: false,
  }, {
    language: "en", row: {}, rows: [], inputs: {},
    issuedDateEn: data.as_of + " Dubai time", issuedDateAr: "",
    serialNo: data.reference,
    branding: { companyNameEn: data.company, companyNameAr: data.company_ar, footerTextEn: footer },
  });
  const links = data.evidence.map(proof =>
    `<li><a href="/api/dms/file?fileId=${proof.file}&amp;disposition=inline">${elEscapeHtml(proof.label)} · ${elEscapeHtml(retainedVersion(proof))}</a></li>`,
  ).join("");
  return html.replace("</head>", `<style>.erp-output-links{margin:1rem auto;max-width:174mm;font:14px sans-serif}.erp-output-links li{padding:4px 0}@media print{.erp-output-links{display:none}}</style></head>`)
    .replace("</body>", `<nav class="erp-output-links" aria-label="Print and retained evidence"><a href="${outputPath(data.kind, data.source)}?format=pdf">Open printable PDF</a>${links ? "<ul>" + links + "</ul>" : ""}</nav></body>`);
}

export function renderOperationalOutputPdf(data: OperationalOutput): Buffer {
  const proofs = data.evidence.map(proof => proof.label + " — " + retainedVersion(proof) + " · File #" + proof.file);
  const signatures = manualSignatures(data.kind).map(label => label + "   Signature ______________________   Date __________");
  return renderOfflinePrintPdf({
    title: data.title,
    company: data.company,
    companyArabic: data.company_ar,
    reference: data.reference + " · " + data.branch,
    timestamp: data.as_of + " Dubai time",
    status,
    lines: [
      "Source revision   " + data.revision,
      ...data.rows.map(([label, value]) => label + "   " + (value ?? "Unrecorded")),
      ...proofs,
      ...signatures,
      "Source checksum   " + data.source_checksum,
    ],
  });
}
