"use client";

/**
 * Report Designer — Company Logo Block
 * Phase: REPORT DESIGNER.3
 * Security: logo resolved from branding profile — no user-supplied URLs
 * Canvas shows safe placeholder; real asset resolution is REPORT DESIGNER.4+
 */

import type { ComponentConfig } from "@puckeditor/core";

export interface CompanyLogoBlockProps {
  variant: "report_logo" | "small_logo";
  align: "left" | "center" | "right";
  maxHeightMm: number;
}

function CompanyLogoBlockRender({ variant, align, maxHeightMm }: CompanyLogoBlockProps) {
  const safeMm = Math.max(16, Math.min(maxHeightMm ?? 32, 80));
  const px = Math.round(safeMm * 3.78);
  const justifyMap: Record<string, string> = {
    left: "flex-start",
    center: "center",
    right: "flex-end",
  };
  return (
    <div
      style={{
        display: "flex",
        justifyContent: justifyMap[align] ?? "flex-start",
        padding: "4px 0",
      }}
    >
      <div
        style={{
          height: px,
          width: px * 2.5,
          maxWidth: "100%",
          background: "#f0fdf4",
          border: "1px dashed #86efac",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="4" fill="#bbf7d0" />
          <path d="M4 17l4-4 4 4 4-6 4 6" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="8" cy="9" r="2" fill="#16a34a" />
        </svg>
        <span style={{ fontSize: "0.65rem", color: "#16a34a" }}>
          {variant === "report_logo" ? "Report Logo" : "Small Logo"}
        </span>
      </div>
    </div>
  );
}

export const companyLogoBlockConfig: ComponentConfig<CompanyLogoBlockProps> = {
  label: "Company Logo",
  fields: {
    variant: {
      type: "select",
      label: "Logo Variant",
      options: [
        { value: "report_logo", label: "Report Logo (A4 header size)" },
        { value: "small_logo", label: "Small Logo (footer / compact)" },
      ],
    },
    align: {
      type: "select",
      label: "Alignment",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
        { value: "right", label: "Right" },
      ],
    },
    maxHeightMm: {
      type: "number",
      label: "Max Height (mm)",
      min: 16,
      max: 80,
    },
  },
  defaultProps: { variant: "report_logo", align: "left", maxHeightMm: 32 },
  render: CompanyLogoBlockRender,
};
