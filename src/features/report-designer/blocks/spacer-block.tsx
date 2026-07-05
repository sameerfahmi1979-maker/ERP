"use client";

/**
 * Report Designer — Spacer Block
 * Phase: REPORT DESIGNER.3
 */

import type { ComponentConfig } from "@puckeditor/core";

export interface SpacerBlockProps {
  heightMm: number;
}

function SpacerBlockRender({ heightMm }: SpacerBlockProps) {
  const safeMm = Math.max(4, Math.min(heightMm ?? 8, 40));
  // In editor canvas: 1mm ≈ 3.78px
  const px = Math.round(safeMm * 3.78);
  return (
    <div
      aria-hidden="true"
      style={{
        height: px,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          border: "1px dashed #e5e7eb",
          borderRadius: "2px",
        }}
      />
      <span style={{ fontSize: "0.65rem", color: "#d1d5db", zIndex: 1 }}>
        {safeMm}mm spacer
      </span>
    </div>
  );
}

export const spacerBlockConfig: ComponentConfig<SpacerBlockProps> = {
  label: "Spacer",
  fields: {
    heightMm: {
      type: "number",
      label: "Height (mm)",
      min: 4,
      max: 40,
    },
  },
  defaultProps: { heightMm: 8 },
  render: SpacerBlockRender,
};
