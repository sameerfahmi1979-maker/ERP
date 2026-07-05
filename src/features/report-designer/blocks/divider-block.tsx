"use client";

/**
 * Report Designer — Divider Block
 * Phase: REPORT DESIGNER.3
 */

import type { ComponentConfig } from "@puckeditor/core";

export interface DividerBlockProps {
  label: string;
}

function DividerBlockRender({ label }: DividerBlockProps) {
  if (label) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 0",
        }}
      >
        <div style={{ flex: 1, height: "1px", background: "#d1d5db" }} />
        <span style={{ fontSize: "0.75rem", color: "#9ca3af", whiteSpace: "nowrap" }}>{label}</span>
        <div style={{ flex: 1, height: "1px", background: "#d1d5db" }} />
      </div>
    );
  }
  return (
    <div
      style={{
        height: "1px",
        background: "#d1d5db",
        margin: "8px 0",
      }}
      aria-hidden="true"
    />
  );
}

export const dividerBlockConfig: ComponentConfig<DividerBlockProps> = {
  label: "Divider",
  fields: {
    label: { type: "text", label: "Center Label (optional)" },
  },
  defaultProps: { label: "" },
  render: DividerBlockRender,
};
