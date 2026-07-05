"use client";

/**
 * Report Designer — Heading Block
 * Phase: REPORT DESIGNER.3
 * Security: plain string only, no HTML, no bindings
 */

import type { ComponentConfig } from "@puckeditor/core";

export interface HeadingBlockProps {
  text: string;
  level: "h1" | "h2" | "h3";
  align: "left" | "center" | "right";
}

function HeadingBlockRender({ text, level, align }: HeadingBlockProps) {
  const Tag = level;
  const sizeMap: Record<string, string> = {
    h1: "1.75rem",
    h2: "1.375rem",
    h3: "1.125rem",
  };
  return (
    <Tag
      style={{
        textAlign: align,
        margin: 0,
        padding: "6px 0",
        fontSize: sizeMap[level] ?? "1.25rem",
        fontWeight: 700,
        lineHeight: 1.3,
        color: "#111827",
      }}
    >
      {text || "Heading"}
    </Tag>
  );
}

export const headingBlockConfig: ComponentConfig<HeadingBlockProps> = {
  label: "Heading",
  fields: {
    text: { type: "text", label: "Heading Text" },
    level: {
      type: "select",
      label: "Level",
      options: [
        { value: "h1", label: "H1 — Title" },
        { value: "h2", label: "H2 — Section" },
        { value: "h3", label: "H3 — Sub-section" },
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
  },
  defaultProps: { text: "Section Heading", level: "h2", align: "left" },
  render: HeadingBlockRender,
};
