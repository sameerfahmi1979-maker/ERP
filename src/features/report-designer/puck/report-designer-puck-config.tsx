"use client";

/**
 * Report Designer — Full ERP Puck Config
 * Phase: REPORT DESIGNER.3 — ERP Block Library Foundation
 *
 * Security rules (enforced):
 *  - No dangerouslySetInnerHTML in any block render
 *  - No direct DB/Supabase access from block components
 *  - No service role / admin client
 *  - No external image URL fields (assets resolved from branding profile at render time)
 *  - Binding paths validated against ERP_BINDING_REGISTRY allowlist
 */

import {
  headingBlockConfig,
  bodyTextSectionBlockConfig,
  keyValueSectionBlockConfig,
  dividerBlockConfig,
  spacerBlockConfig,
  brandingHeaderBlockConfig,
  companyLogoBlockConfig,
  signatoryBlockConfig,
  stampBlockConfig,
  verificationQrBlockConfig,
  reportTableBlockConfig,
  columnStripBlockConfig,
} from "../blocks";
import type { ReportDesignerPuckConfig } from "./report-designer-puck-types";

// ─────────────────────────────────────────────────────────────────────────────
// Color field — small hex color picker for root/page settings
// ─────────────────────────────────────────────────────────────────────────────

function HexColorField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#374151" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <input
          type="color"
          value={safe || "#1e293b"}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "32px", height: "26px", padding: 0, border: "1px solid #d1d5db", borderRadius: "4px", cursor: "pointer" }}
        />
        <input
          type="text"
          value={value ?? ""}
          placeholder="Theme default"
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, padding: "3px 8px", fontSize: "0.78rem", fontFamily: "monospace", border: "1px solid #d1d5db", borderRadius: "4px", color: "#374151" }}
        />
        {value ? (
          <button
            type="button"
            title="Reset to branding theme color"
            onClick={() => onChange("")}
            style={{ padding: "2px 8px", fontSize: "0.72rem", background: "#f9fafb", border: "1px solid #d1d5db", borderRadius: "4px", cursor: "pointer", color: "#6b7280" }}
          >
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}

export const reportDesignerPuckConfig: ReportDesignerPuckConfig = {
  components: {
    HeadingBlock: headingBlockConfig,
    BodyTextSectionBlock: bodyTextSectionBlockConfig,
    KeyValueSectionBlock: keyValueSectionBlockConfig,
    DividerBlock: dividerBlockConfig,
    SpacerBlock: spacerBlockConfig,
    BrandingHeaderBlock: brandingHeaderBlockConfig,
    CompanyLogoBlock: companyLogoBlockConfig,
    SignatoryBlock: signatoryBlockConfig,
    StampBlock: stampBlockConfig,
    VerificationQrBlock: verificationQrBlockConfig,
    ReportTableBlock: reportTableBlockConfig,
    ColumnStripBlock: columnStripBlockConfig,
  },
  // Page-level settings (Puck root). Controls the document title band that the
  // Executive Ledger renderer draws under the company header. Only applies to
  // the BODY zone layout — header/footer zone root props are ignored.
  root: {
    fields: {
      titleBarMode: {
        type: "select",
        label: "Title Bar (colored band)",
        options: [
          { value: "auto", label: "Auto — first H1 heading or template name" },
          { value: "custom", label: "Custom text" },
          { value: "hidden", label: "Hidden — no title bar" },
        ],
      },
      titleBarText: { type: "text", label: "Custom Title Text (when Custom)" },
      titleBarBgColor: {
        type: "custom",
        label: "Title Bar Background",
        render: ({ value, onChange }) => (
          <HexColorField
            value={(value as string) ?? ""}
            onChange={onChange as (v: string) => void}
            label="Title Bar Background"
          />
        ),
      },
      titleBarTextColor: {
        type: "custom",
        label: "Title Bar Text Color",
        render: ({ value, onChange }) => (
          <HexColorField
            value={(value as string) ?? ""}
            onChange={onChange as (v: string) => void}
            label="Title Bar Text Color"
          />
        ),
      },
    },
    defaultProps: {
      titleBarMode: "auto",
      titleBarText: "",
      titleBarBgColor: "",
      titleBarTextColor: "",
    },
    render: ({ children }) => <>{children}</>,
  } as ReportDesignerPuckConfig["root"],
};
