"use client";

/**
 * Report Designer — Branding Header Block
 * Phase: REPORT DESIGNER.3
 * Security: all values resolved from branding profile at render time — no user URLs
 * Canvas shows safe placeholder only; real asset resolution is REPORT DESIGNER.4+
 */

import type { ComponentConfig } from "@puckeditor/core";

export interface BrandingHeaderBlockProps {
  showLogo: boolean;
  showName: boolean;
  showAddress: boolean;
  showContact: boolean;
}

function BrandingHeaderBlockRender({
  showLogo,
  showName,
  showAddress,
  showContact,
}: BrandingHeaderBlockProps) {
  return (
    <div
      style={{
        border: "1px solid #bfdbfe",
        borderRadius: "6px",
        background: "#eff6ff",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
      }}
    >
      {showLogo && (
        <div
          style={{
            width: 56,
            height: 56,
            background: "#dbeafe",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: "0.6rem",
            color: "#3b82f6",
            textAlign: "center",
          }}
        >
          LOGO
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {showName && (
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "#1e40af" }}>
            Company Legal Name (from branding profile)
          </div>
        )}
        {showAddress && (
          <div style={{ fontSize: "0.8rem", color: "#3b82f6", marginTop: 2 }}>
            Address • City • Country (from branding profile)
          </div>
        )}
        {showContact && (
          <div style={{ fontSize: "0.75rem", color: "#60a5fa", marginTop: 2 }}>
            phone@example.com · www.example.com (from branding profile)
          </div>
        )}
        {!showName && !showAddress && !showContact && (
          <div style={{ fontSize: "0.75rem", color: "#93c5fd" }}>
            Enable fields in the property panel to show branding data
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: "0.65rem",
          color: "#93c5fd",
          background: "#dbeafe",
          padding: "2px 6px",
          borderRadius: "4px",
          flexShrink: 0,
        }}
      >
        BRANDING HEADER
      </div>
    </div>
  );
}

export const brandingHeaderBlockConfig: ComponentConfig<BrandingHeaderBlockProps> = {
  label: "Branding Header",
  fields: {
    showLogo: {
      type: "radio",
      label: "Show Company Logo",
      options: [
        { value: true, label: "Yes" },
        { value: false, label: "No" },
      ],
    },
    showName: {
      type: "radio",
      label: "Show Company Name",
      options: [
        { value: true, label: "Yes" },
        { value: false, label: "No" },
      ],
    },
    showAddress: {
      type: "radio",
      label: "Show Address",
      options: [
        { value: true, label: "Yes" },
        { value: false, label: "No" },
      ],
    },
    showContact: {
      type: "radio",
      label: "Show Phone / Email / Website",
      options: [
        { value: true, label: "Yes" },
        { value: false, label: "No" },
      ],
    },
  },
  defaultProps: {
    showLogo: true,
    showName: true,
    showAddress: true,
    showContact: true,
  },
  render: BrandingHeaderBlockRender,
};
