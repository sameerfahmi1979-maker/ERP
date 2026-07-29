/**
 * OUTPUT.2 — Shared letter → ExecutiveLedgerDocument builder (pure).
 *
 * This is the SAME mapping the LetterPreviewDialog Formal View uses, extracted
 * so that browser preview and official Gotenberg issuance render identical
 * documents (preview–final parity requirement).
 */

import type { ExecutiveLedgerDocument } from "@/lib/executive-ledger/types";
import type { ExportBrandingContext } from "@/lib/export/export-types";
import { elColumnLabel, elFormatValue } from "@/lib/executive-ledger/formatters";

export interface BuildLetterDocumentInput {
  columns: string[];
  row: Record<string, unknown>;
  documentTitle: string;
  branding?: ExportBrandingContext;
  verification?: ExecutiveLedgerDocument["verification"];
  documentRef?: string;
}

export function buildLetterExecutiveLedgerDocument(
  input: BuildLetterDocumentInput
): ExecutiveLedgerDocument {
  const rows = input.columns.map((col) => ({
    label: elColumnLabel(col),
    value: elFormatValue(input.row[col]),
  }));

  const mid = Math.ceil(rows.length / 2);
  const detailRows = rows.slice(0, mid);
  const extraRows = rows.slice(mid);

  const sections: ExecutiveLedgerDocument["sections"] = [
    { type: "key_value", title: "Details", rows: detailRows },
  ];
  if (extraRows.length > 0) {
    sections.push({ type: "key_value", title: "Additional Information", rows: extraRows });
  }

  return {
    documentTitle: input.documentTitle,
    documentRef: input.documentRef,
    issuedDate: new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    branding: input.branding ?? undefined,
    sections,
    verification: input.verification ?? undefined,
    qrPlaceholder: !input.verification,
  };
}
