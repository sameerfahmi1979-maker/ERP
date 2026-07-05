"use client";

/**
 * Report Designer — Verification QR Block
 * Phase: REPORT DESIGNER.3
 * Security: actual QR generated at issuance time only (not at design time)
 * Canvas shows safe placeholder only
 */

import type { ComponentConfig } from "@puckeditor/core";

export interface VerificationQrBlockProps {
  label: string;
  align: "left" | "center" | "right";
  sizeMm: number;
}

function VerificationQrBlockRender({ label, align, sizeMm }: VerificationQrBlockProps) {
  const safeMm = Math.max(20, Math.min(sizeMm ?? 30, 50));
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
        flexDirection: "column",
        alignItems: justifyMap[align] as "flex-start" | "center" | "flex-end",
        padding: "4px 0",
        gap: "4px",
      }}
    >
      <div
        style={{
          width: px,
          height: px,
          background: "#f8fafc",
          border: "1px solid #cbd5e1",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* QR grid placeholder */}
        <svg width={px * 0.75} height={px * 0.75} viewBox="0 0 48 48" fill="none">
          <rect x="2" y="2" width="18" height="18" rx="2" stroke="#94a3b8" strokeWidth="2" fill="none" />
          <rect x="28" y="2" width="18" height="18" rx="2" stroke="#94a3b8" strokeWidth="2" fill="none" />
          <rect x="2" y="28" width="18" height="18" rx="2" stroke="#94a3b8" strokeWidth="2" fill="none" />
          <rect x="6" y="6" width="10" height="10" fill="#94a3b8" />
          <rect x="32" y="6" width="10" height="10" fill="#94a3b8" />
          <rect x="6" y="32" width="10" height="10" fill="#94a3b8" />
          <rect x="28" y="28" width="4" height="4" fill="#94a3b8" />
          <rect x="34" y="28" width="4" height="4" fill="#94a3b8" />
          <rect x="40" y="28" width="4" height="4" fill="#94a3b8" />
          <rect x="28" y="34" width="4" height="4" fill="#94a3b8" />
          <rect x="34" y="34" width="4" height="4" fill="#94a3b8" />
          <rect x="40" y="34" width="4" height="4" fill="#94a3b8" />
          <rect x="28" y="40" width="4" height="4" fill="#94a3b8" />
          <rect x="34" y="40" width="4" height="4" fill="#94a3b8" />
          <rect x="40" y="40" width="4" height="4" fill="#94a3b8" />
        </svg>
      </div>
      {label && (
        <span
          style={{
            fontSize: "0.7rem",
            color: "#64748b",
            textAlign: align,
            maxWidth: px,
          }}
        >
          {label}
        </span>
      )}
      <span style={{ fontSize: "0.6rem", color: "#94a3b8" }}>
        QR generated at issuance
      </span>
    </div>
  );
}

export const verificationQrBlockConfig: ComponentConfig<VerificationQrBlockProps> = {
  label: "Verification QR Code",
  fields: {
    label: {
      type: "text",
      label: "Label below QR (optional)",
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
    sizeMm: {
      type: "number",
      label: "Size (mm)",
      min: 20,
      max: 50,
    },
  },
  defaultProps: { label: "Scan to verify document authenticity", align: "left", sizeMm: 30 },
  render: VerificationQrBlockRender,
};
