"use client";

/**
 * Report Designer — Stamp Block
 * Phase: REPORT DESIGNER.3
 * Security: stamp image requires reports.sign permission at render time
 * Canvas shows safe placeholder only; real resolution is REPORT DESIGNER.4+
 */

import type { ComponentConfig } from "@puckeditor/core";

export interface StampBlockProps {
  align: "left" | "center" | "right";
  sizeMm: number;
}

function StampBlockRender({ align, sizeMm }: StampBlockProps) {
  const safeMm = Math.max(20, Math.min(sizeMm ?? 40, 60));
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
          width: px,
          height: px,
          borderRadius: "50%",
          background: "#fff7ed",
          border: "2px dashed #fb923c",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: "0.6rem", color: "#ea580c", textAlign: "center" }}>
          STAMP
        </span>
      </div>
    </div>
  );
}

export const stampBlockConfig: ComponentConfig<StampBlockProps> = {
  label: "Stamp",
  fields: {
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
      max: 60,
    },
  },
  defaultProps: { align: "center", sizeMm: 40 },
  render: StampBlockRender,
};
