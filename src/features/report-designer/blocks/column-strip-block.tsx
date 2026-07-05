"use client";

/**
 * Report Designer — Column Strip Block
 * Phase: REPORT DESIGNER UX.1 — TipTap Rich Text + Multi-Column Layout Foundation
 *
 * A controlled multi-column layout block for Header, Body, and Footer zones.
 *
 * Design decisions:
 *  - Fixed slot model: left / center / right, each with a contentType selector.
 *  - Curated presets approach: each slot has a contentType + relevant inline props.
 *  - No arbitrary CSS from user — all layout values come from controlled enum presets.
 *  - No nested ColumnStripBlocks.
 *  - No BrandingHeaderBlock or ReportTableBlock in slots (full-width only).
 *
 * Security rules:
 *  - No dangerouslySetInnerHTML
 *  - No external image URLs in any field
 *  - All binding values validated against ERP_BINDING_REGISTRY
 */

import type { ComponentConfig } from "@puckeditor/core";
import type { ColumnStripSlot, ColumnSlotContentType } from "@/lib/report-designer/types";
import { ERP_BINDING_REGISTRY } from "@/lib/report-designer/binding-registry";

// ─────────────────────────────────────────────────────────────────────────────
// Block props
// ─────────────────────────────────────────────────────────────────────────────

export interface ColumnStripBlockProps {
  layout: "equal" | "left-wide" | "right-wide" | "2-col" | "3-col";
  verticalAlign: "top" | "middle" | "bottom";
  gap: "sm" | "md" | "lg";
  leftSlot: ColumnStripSlot;
  centerSlot: ColumnStripSlot;
  rightSlot: ColumnStripSlot;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout preset widths for canvas preview
// ─────────────────────────────────────────────────────────────────────────────

const LAYOUT_WIDTHS: Record<string, [string, string, string]> = {
  "equal":      ["50%", "0%",  "50%"],
  "2-col":      ["50%", "0%",  "50%"],
  "left-wide":  ["70%", "0%",  "30%"],
  "right-wide": ["30%", "0%",  "70%"],
  "3-col":      ["33%", "34%", "33%"],
};

const GAP_VALUES: Record<string, string> = { sm: "8px", md: "14px", lg: "22px" };
const VALIGN_VALUES: Record<string, string> = { top: "flex-start", middle: "center", bottom: "flex-end" };

// ─────────────────────────────────────────────────────────────────────────────
// Slot preview cell
// ─────────────────────────────────────────────────────────────────────────────

const SLOT_ICONS: Record<ColumnSlotContentType, string> = {
  none:       "—",
  logo:       "🖼",
  heading:    "H",
  text:       "¶",
  key_value:  "≡",
  signatory:  "✍",
  stamp:      "⬡",
  qr:         "⊞",
};

const SLOT_LABELS: Record<ColumnSlotContentType, string> = {
  none:       "Empty",
  logo:       "Company Logo",
  heading:    "Heading",
  text:       "Body Text",
  key_value:  "Key-Value Field",
  signatory:  "Signatory",
  stamp:      "Stamp",
  qr:         "QR Code",
};

function SlotPreview({ slot, label }: { slot: ColumnStripSlot; label: string }) {
  const ct = slot.contentType || "none";
  const icon = SLOT_ICONS[ct] ?? "?";
  const ctLabel = SLOT_LABELS[ct] ?? ct;

  let previewText = "";
  if (ct === "heading") previewText = slot.headingText || "Heading Text";
  if (ct === "text") previewText = slot.bodyContent || "Body text…";
  if (ct === "key_value") previewText = slot.kvLabel ? `${slot.kvLabel}: {{…}}` : "Label: value";
  if (ct === "qr") previewText = slot.qrLabel || "Scan to verify";

  return (
    <div
      style={{
        flex: 1,
        minHeight: "48px",
        border: "1px dashed #c7d2fe",
        borderRadius: "4px",
        padding: "6px 8px",
        background: ct === "none" ? "#fafafa" : "#f0f4ff",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
      }}
    >
      <div
        style={{
          fontSize: "0.68rem",
          color: "#6366f1",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <span style={{ fontSize: "1rem" }}>{icon}</span>
        <span style={{ fontSize: "0.75rem", color: "#374151", fontWeight: 500 }}>
          {ctLabel}
        </span>
      </div>
      {previewText && (
        <div
          style={{
            fontSize: "0.7rem",
            color: "#6b7280",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "100%",
          }}
        >
          {previewText}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Block canvas render
// ─────────────────────────────────────────────────────────────────────────────

function ColumnStripBlockRender({
  layout,
  verticalAlign,
  gap,
  leftSlot,
  centerSlot,
  rightSlot,
}: ColumnStripBlockProps) {
  const widths = LAYOUT_WIDTHS[layout] ?? LAYOUT_WIDTHS["equal"];
  const gapPx = GAP_VALUES[gap] ?? "14px";
  const alignItems = VALIGN_VALUES[verticalAlign] ?? "flex-start";
  const is3col = layout === "3-col";

  return (
    <div
      style={{
        border: "1px solid #e0e7ff",
        borderRadius: "4px",
        padding: "6px",
        background: "#f8f9ff",
      }}
    >
      <div
        style={{
          fontSize: "0.68rem",
          color: "#818cf8",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          marginBottom: "6px",
          fontWeight: 600,
        }}
      >
        ⊞ Column Strip — {layout}
      </div>
      <div
        style={{
          display: "flex",
          gap: gapPx,
          alignItems,
        }}
      >
        <div style={{ flex: 1 }}>
          <SlotPreview slot={leftSlot} label="Left" />
        </div>
        {is3col && (
          <div style={{ flex: 1 }}>
            <SlotPreview slot={centerSlot} label="Center" />
          </div>
        )}
        <div style={{ flex: 1 }}>
          <SlotPreview slot={rightSlot} label="Right" />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Binding options for key_value slots
// ─────────────────────────────────────────────────────────────────────────────

const BINDING_OPTIONS = Object.values(ERP_BINDING_REGISTRY).map((b) => ({
  value: b.path,
  label: `${b.label} [${b.namespace}]`,
}));

// ─────────────────────────────────────────────────────────────────────────────
// Slot field group helper (generates the arrayFields for a single slot)
// ─────────────────────────────────────────────────────────────────────────────

const SLOT_CONTENT_TYPES_OPTIONS = [
  { value: "none",      label: "— Empty —" },
  { value: "logo",      label: "Company Logo" },
  { value: "heading",   label: "Heading Text" },
  { value: "text",      label: "Body Text" },
  { value: "key_value", label: "Key-Value Field" },
  { value: "signatory", label: "Signatory Block" },
  { value: "stamp",     label: "Company Stamp" },
  { value: "qr",        label: "QR Code" },
];

function slotFields() {
  return {
    contentType: {
      type: "select" as const,
      label: "Slot Content",
      options: SLOT_CONTENT_TYPES_OPTIONS,
    },
    // Heading props
    headingText: { type: "text" as const, label: "Heading Text" },
    headingLevel: {
      type: "select" as const,
      label: "Heading Level",
      options: [
        { value: "h1", label: "H1 — Large" },
        { value: "h2", label: "H2 — Medium" },
        { value: "h3", label: "H3 — Small" },
      ],
    },
    headingAlign: {
      type: "select" as const,
      label: "Alignment",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" },
      ],
    },
    // Body text props
    bodyTitle: { type: "text" as const, label: "Section Title" },
    bodyContent: {
      type: "textarea" as const,
      label: "Body Text (use {{binding}} for data)",
    },
    // Key-value props
    kvTitle: { type: "text" as const, label: "Section Title" },
    kvLabel: { type: "text" as const, label: "Field Label" },
    kvBinding: {
      type: "select" as const,
      label: "Data Binding",
      options: BINDING_OPTIONS,
    },
    // Logo props
    logoVariant: {
      type: "select" as const,
      label: "Logo Variant",
      options: [
        { value: "report_logo", label: "Report Logo (full size)" },
        { value: "small_logo",  label: "Small Logo" },
      ],
    },
    logoAlign: {
      type: "select" as const,
      label: "Alignment",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" },
      ],
    },
    logoMaxHeightMm: { type: "number" as const, label: "Max Height (mm, 16–80)" },
    // Signatory props
    showSignature: {
      type: "radio" as const,
      label: "Show Signature Image",
      options: [
        { value: true, label: "Yes" },
        { value: false, label: "No" },
      ],
    },
    signatoryNameOverride: { type: "text" as const, label: "Name Override (leave blank for branding default)" },
    signatoryTitleOverride: { type: "text" as const, label: "Title Override (leave blank for branding default)" },
    // Stamp props
    stampSizeMm: { type: "number" as const, label: "Stamp Size (mm, 20–60)" },
    stampAlign: {
      type: "select" as const,
      label: "Stamp Alignment",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" },
      ],
    },
    // QR props
    qrLabel: { type: "text" as const, label: "QR Label" },
    qrSizeMm: { type: "number" as const, label: "QR Size (mm, 20–50)" },
    qrAlign: {
      type: "select" as const,
      label: "QR Alignment",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" },
      ],
    },
  };
}

const DEFAULT_SLOT: ColumnStripSlot = {
  contentType: "none",
};

// ─────────────────────────────────────────────────────────────────────────────
// Puck ComponentConfig
// ─────────────────────────────────────────────────────────────────────────────

export const columnStripBlockConfig: ComponentConfig<ColumnStripBlockProps> = {
  label: "Column Strip",
  fields: {
    layout: {
      type: "select",
      label: "Column Layout",
      options: [
        { value: "equal",      label: "2 columns — 50 / 50 (equal)" },
        { value: "2-col",      label: "2 columns — 50 / 50 (alias)" },
        { value: "left-wide",  label: "2 columns — 70 / 30 (left wide)" },
        { value: "right-wide", label: "2 columns — 30 / 70 (right wide)" },
        { value: "3-col",      label: "3 columns — 33 / 34 / 33 (equal thirds)" },
      ],
    },
    verticalAlign: {
      type: "select",
      label: "Vertical Alignment",
      options: [
        { value: "top",    label: "Top" },
        { value: "middle", label: "Middle" },
        { value: "bottom", label: "Bottom" },
      ],
    },
    gap: {
      type: "select",
      label: "Column Gap",
      options: [
        { value: "sm", label: "Small (8px)" },
        { value: "md", label: "Medium (16px)" },
        { value: "lg", label: "Large (24px)" },
      ],
    },
    leftSlot: {
      type: "object",
      label: "Left Column",
      objectFields: slotFields(),
    },
    centerSlot: {
      type: "object",
      label: "Center Column (3-col only)",
      objectFields: slotFields(),
    },
    rightSlot: {
      type: "object",
      label: "Right Column",
      objectFields: slotFields(),
    },
  },
  defaultProps: {
    layout: "3-col",
    verticalAlign: "bottom",
    gap: "md",
    leftSlot: {
      ...DEFAULT_SLOT,
      contentType: "signatory",
      showSignature: true,
    },
    centerSlot: {
      ...DEFAULT_SLOT,
      contentType: "stamp",
      stampSizeMm: 40,
      stampAlign: "center",
    },
    rightSlot: {
      ...DEFAULT_SLOT,
      contentType: "qr",
      qrLabel: "Scan to verify",
      qrSizeMm: 35,
      qrAlign: "right",
    },
  },
  render: ColumnStripBlockRender,
};
