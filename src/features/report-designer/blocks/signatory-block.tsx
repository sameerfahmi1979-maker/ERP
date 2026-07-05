"use client";

/**
 * Report Designer — Signatory Block
 * Phase: REPORT DESIGNER.3
 * Security: signature image requires reports.sign permission at render time
 * Canvas shows safe placeholder only; real resolution is REPORT DESIGNER.4+
 */

import type { ComponentConfig } from "@puckeditor/core";

export interface SignatoryBlockProps {
  showSignature: boolean;
  nameOverride: string;
  titleOverrideEn: string;
}

function SignatoryBlockRender({ showSignature, nameOverride, titleOverrideEn }: SignatoryBlockProps) {
  return (
    <div
      style={{
        padding: "8px 0",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "4px",
        minWidth: 160,
      }}
    >
      {showSignature && (
        <div
          style={{
            width: 120,
            height: 48,
            background: "#faf5ff",
            border: "1px dashed #c084fc",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: "0.65rem", color: "#a855f7" }}>Signature Image</span>
        </div>
      )}
      <div
        style={{
          width: 120,
          height: "1px",
          background: "#374151",
          marginBottom: 4,
        }}
      />
      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#111827" }}>
        {nameOverride || "Authorized Signatory (from profile)"}
      </div>
      <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
        {titleOverrideEn || "Title (from branding profile)"}
      </div>
    </div>
  );
}

export const signatoryBlockConfig: ComponentConfig<SignatoryBlockProps> = {
  label: "Signatory",
  fields: {
    showSignature: {
      type: "radio",
      label: "Show Signature Image",
      options: [
        { value: true, label: "Yes (requires reports.sign permission)" },
        { value: false, label: "No" },
      ],
    },
    nameOverride: {
      type: "text",
      label: "Signatory Name Override (leave blank to use branding profile)",
    },
    titleOverrideEn: {
      type: "text",
      label: "Title Override EN (leave blank to use branding profile)",
    },
  },
  defaultProps: { showSignature: false, nameOverride: "", titleOverrideEn: "" },
  render: SignatoryBlockRender,
};
