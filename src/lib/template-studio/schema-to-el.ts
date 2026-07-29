/**
 * OUTPUT.3A — Studio body schema → Executive Ledger document (pure mapping).
 *
 * This is the ONLY bridge between the Studio and rendering. Both the Studio's
 * live preview and official Gotenberg issuance call this mapper and then
 * `renderExecutiveLedgerHtml` — one canonical HTML builder (v6.1).
 */

import type {
  ExecutiveLedgerDocument,
  ExecutiveLedgerSection,
} from "@/lib/executive-ledger/types";
import type { ExportBrandingContext } from "@/lib/export/export-types";
import { renderProseMirrorDocToHtml } from "@/lib/report-designer/prosemirror-renderer";
import type { StudioBodySchema, StudioBlock } from "./schema";

export interface BuildStudioDocumentInput {
  schema: StudioBodySchema;
  /** Resolved variable values (path → display string). */
  bindingValues: Record<string, string>;
  documentTitle: string;
  documentRef?: string;
  /** Pre-formatted issue date. Defaults to today — pass a fixed value for deterministic baselines. */
  issuedDate?: string;
  branding?: ExportBrandingContext;
  verification?: ExecutiveLedgerDocument["verification"];
  /** Repeating datasets for tables with repeatBinding. */
  repeatData?: Record<string, string[][]>;
}

export function buildStudioExecutiveLedgerDocument(
  input: BuildStudioDocumentInput
): ExecutiveLedgerDocument {
  const sections: ExecutiveLedgerSection[] = [];
  let clauseNo = 0;

  for (const block of input.schema.blocks) {
    const section = mapBlock(block, input, () => ++clauseNo);
    if (section) sections.push(section);
  }

  return {
    documentTitle: input.documentTitle,
    documentRef: input.documentRef,
    issuedDate:
      input.issuedDate ??
      new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    branding: input.branding,
    sections,
    direction: input.schema.direction,
    verification: input.verification,
    qrPlaceholder: !input.verification,
  };
}

// ── Block mapping ─────────────────────────────────────────────────────────────

const HEADING_SIZE_PX: Record<1 | 2 | 3, number> = { 1: 20, 2: 16, 3: 13 };

function mapBlock(
  block: StudioBlock,
  input: BuildStudioDocumentInput,
  nextClauseNo: () => number
): ExecutiveLedgerSection | null {
  switch (block.kind) {
    case "heading": {
      const text = substituteTokens(block.text, input.bindingValues);
      const size = HEADING_SIZE_PX[block.level];
      const weight = block.level === 3 ? 600 : 700;
      return {
        type: "body",
        content: "",
        richHtml: `<div style="font-size:${size}px;font-weight:${weight};text-align:${block.align};margin:2px 0 4px;">${escapeHtml(text)}</div>`,
      };
    }

    case "paragraph": {
      const html = renderProseMirrorDocToHtml(
        block.rich as Record<string, unknown>,
        input.bindingValues
      );
      return { type: "body", content: "", richHtml: html };
    }

    case "clause": {
      const n = nextClauseNo();
      const html = renderProseMirrorDocToHtml(
        block.rich as Record<string, unknown>,
        input.bindingValues
      );
      const title = substituteTokens(block.title, input.bindingValues);
      return {
        type: "body",
        content: "",
        richHtml:
          `<div style="margin:4px 0;"><span style="font-weight:700;">${n}. ${escapeHtml(title)}</span>` +
          `<div style="margin-top:2px;">${html}</div></div>`,
      };
    }

    case "key_value":
      return {
        type: "key_value",
        title: block.title ? substituteTokens(block.title, input.bindingValues) : undefined,
        rows: block.rows.map((r) => ({
          label: substituteTokens(r.label, input.bindingValues),
          value: substituteTokens(r.value, input.bindingValues),
          emphasized: r.emphasized,
        })),
      };

    case "table": {
      const rows =
        block.repeatBinding && input.repeatData?.[block.repeatBinding]
          ? input.repeatData[block.repeatBinding]
          : block.rows.map((row) => row.map((c) => substituteTokens(c, input.bindingValues)));
      return {
        type: "table",
        title: block.title ? substituteTokens(block.title, input.bindingValues) : undefined,
        headers: block.headers.map((h) => substituteTokens(h, input.bindingValues)),
        rows,
        showHeader: block.showHeader,
      };
    }

    case "divider":
      return { type: "divider", label: block.label };

    case "spacer":
      // richHtml is a trusted, mapper-only field — fixed structure, clamped value.
      return {
        type: "body",
        content: "",
        richHtml: `<div style="height:${block.heightPt}pt;"></div>`,
      };

    case "columns": {
      const left = renderProseMirrorDocToHtml(block.left as Record<string, unknown>, input.bindingValues);
      const right = renderProseMirrorDocToHtml(block.right as Record<string, unknown>, input.bindingValues);
      return {
        type: "column",
        layout: block.layout,
        gap: "md",
        slots: { left: { html: left }, right: { html: right } },
      };
    }

    default:
      return null;
  }
}

// ── Token substitution for plain-string fields ────────────────────────────────

function substituteTokens(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, path: string) =>
    Object.prototype.hasOwnProperty.call(values, path) ? values[path] : match
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
