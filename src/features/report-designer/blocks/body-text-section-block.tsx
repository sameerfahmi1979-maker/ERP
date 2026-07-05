"use client";

/**
 * Report Designer — Body Text Section Block (with TipTap Rich Text)
 * Phase: REPORT DESIGNER UX.1 — TipTap Rich Text + Multi-Column Layout Foundation
 *
 * Changes from DESIGNER.3:
 *  - Added TipTap rich text editor in the Puck property panel.
 *  - richContent (ProseMirror JSON) stored alongside legacy `content` string.
 *  - Backward compat: existing templates with `content` only still work.
 *
 * Security rules:
 *  - No dangerouslySetInnerHTML in canvas render
 *  - No raw HTML accepted — ProseMirror JSON only
 *  - All formatting validated/rendered server-side via prosemirror-renderer.ts
 *  - {{binding}} placeholders entered as plain text, validated at save/review
 */

import type { ComponentConfig } from "@puckeditor/core";
import type { JSONContent } from "@tiptap/react";
import { ReportDesignerRichTextEditor } from "./report-designer-rich-text-editor";
import { extractPlainTextFromProseMirror } from "@/lib/report-designer/prosemirror-renderer";

export interface BodyTextSectionBlockProps {
  title: string;
  content: string;
  /** REPORT DESIGNER UX.1: ProseMirror JSON rich text — takes priority over content when present */
  richContent?: JSONContent | null;
  language: "en" | "ar" | "bilingual";
}

function BodyTextSectionBlockRender({
  title,
  content,
  richContent,
  language,
}: BodyTextSectionBlockProps) {
  const isRtl = language === "ar";

  // Canvas preview: show content (plain text fallback) — rich rendering is in the output iframe
  const displayContent = content ||
    "Body text content goes here. Use {{binding}} placeholders for dynamic data.";

  return (
    <div
      style={{
        padding: "4px 0",
        direction: isRtl ? "rtl" : "ltr",
        textAlign: isRtl ? "right" : "left",
      }}
    >
      {title && (
        <p
          style={{
            margin: "0 0 4px 0",
            fontWeight: 600,
            fontSize: "0.875rem",
            color: "#374151",
          }}
        >
          {title}
        </p>
      )}
      {richContent ? (
        <div>
          <div
            style={{
              display: "inline-block",
              padding: "1px 6px",
              background: "#e0e7ff",
              borderRadius: "3px",
              fontSize: "0.7rem",
              color: "#3730a3",
              marginBottom: "4px",
            }}
          >
            ✦ Rich Text
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "0.85rem",
              color: "#6b7280",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontStyle: "italic",
            }}
          >
            {displayContent}
          </p>
        </div>
      ) : (
        <p
          style={{
            margin: 0,
            fontSize: "0.9rem",
            color: "#1f2937",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {displayContent}
        </p>
      )}
    </div>
  );
}

export const bodyTextSectionBlockConfig: ComponentConfig<BodyTextSectionBlockProps> = {
  label: "Body Text Section",
  fields: {
    title: { type: "text", label: "Section Title (optional)" },
    richContent: {
      type: "custom",
      label: "Content (Rich Text)",
      render: ({ value, onChange }) => (
        <ReportDesignerRichTextEditor
          value={value as JSONContent | null | undefined}
          onChange={(json) => {
            onChange(json);
          }}
        />
      ),
    },
    content: {
      type: "textarea",
      label: "Plain Text Fallback (auto-synced from rich text)",
    },
    language: {
      type: "select",
      label: "Language / Direction",
      options: [
        { value: "en", label: "English (LTR)" },
        { value: "ar", label: "Arabic (RTL)" },
        { value: "bilingual", label: "Bilingual" },
      ],
    },
  },
  defaultProps: {
    title: "",
    content: "This letter certifies that {{employee.full_name_en}} is employed as {{employee.designation}} at {{company.legal_name_en}}.",
    richContent: null,
    language: "en",
  },
  // TipTap rich text is the source of truth: whenever richContent changes,
  // regenerate the plain-text fallback ({{path}} placeholders included) so the
  // canvas preview, test renderer fallback, and binding validation all stay in
  // sync with what the user typed in the rich text editor.
  resolveData: ({ props }, { changed }) => {
    if (!changed.richContent) return { props };
    const rc = props.richContent;
    if (!rc || rc.type !== "doc") return { props };
    const plain = extractPlainTextFromProseMirror(rc as unknown as Record<string, unknown>);
    if (!plain.trim()) return { props };
    return { props: { ...props, content: plain } };
  },
  render: BodyTextSectionBlockRender,
};
