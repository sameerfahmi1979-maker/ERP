"use client";

/**
 * Report Designer — Rich Text Editor (TipTap)
 * Phase: REPORT DESIGNER UX.2 — Dynamic Module Field Registry
 *
 * Updated from UX.1 to add:
 *  - bindingToken custom inline node (chip rendered in editor)
 *  - "Insert Field" picker button that inserts bindingToken chips
 *  - Backward compatibility: manually typed {{path}} still supported
 *
 * Security rules (inherited from UX.1):
 *  - No raw HTML input accepted
 *  - No Link, Image, CodeBlock, Code, Blockquote, HorizontalRule, Strike
 *  - Font size capped to 8–36px
 *  - Color validated to safe 6-digit hex
 *  - ProseMirror JSON stored as content — never raw HTML
 *  - bindingToken.attrs.path validated against field registry in security review
 */

import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { useCallback } from "react";
import { ReportFieldPickerPopover } from "../field-picker";

// ─────────────────────────────────────────────────────────────────────────────
// Custom FontSize extension
// ─────────────────────────────────────────────────────────────────────────────

const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 36;

const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => {
              const raw = (el as HTMLElement).style.fontSize;
              if (!raw) return null;
              const n = parseFloat(raw);
              return !isNaN(n) && n >= FONT_SIZE_MIN && n <= FONT_SIZE_MAX ? n : null;
            },
            renderHTML: (attrs) => {
              if (!attrs.fontSize) return {};
              const n = Number(attrs.fontSize);
              if (isNaN(n) || n < FONT_SIZE_MIN || n > FONT_SIZE_MAX) return {};
              return { style: `font-size: ${n}px` };
            },
          },
        },
      },
    ];
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// bindingToken — custom inline node
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Custom TipTap node representing a resolved ERP field binding.
 * Rendered as a non-editable inline chip in the editor.
 * Stored in ProseMirror JSON as { type: "bindingToken", attrs: { path: "..." } }.
 * Server-side renderer resolves it the same way as {{path}} text tokens.
 *
 * SECURITY: attrs.path is validated against the field registry in security review.
 */
export const BindingToken = Node.create({
  name: "bindingToken",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      path: {
        default: "",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-binding-path") ?? "",
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-binding-path": attrs.path ?? "",
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-binding-path]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const path = HTMLAttributes["data-binding-path"] ?? "";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "erp-binding-token",
        contenteditable: "false",
        style:
          "display:inline-block;background:#ede9fe;color:#5b21b6;border:1px solid #c4b5fd;" +
          "border-radius:4px;padding:0 5px;font-size:0.8em;font-family:monospace;cursor:default;" +
          "user-select:none;white-space:nowrap;",
      }),
      `{{${path}}}`,
    ];
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Toolbar helpers
// ─────────────────────────────────────────────────────────────────────────────

function ToolbarBtn({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "2px 6px",
        fontSize: "0.78rem",
        background: active ? "#e0e7ff" : "transparent",
        border: active ? "1px solid #818cf8" : "1px solid transparent",
        borderRadius: "3px",
        cursor: disabled ? "not-allowed" : "pointer",
        color: disabled ? "#9ca3af" : active ? "#3730a3" : "#374151",
        fontWeight: active ? 600 : 400,
        lineHeight: "1.4",
        minWidth: "24px",
      }}
    >
      {children}
    </button>
  );
}

function ToolbarSep() {
  return (
    <div
      style={{
        width: "1px",
        height: "18px",
        background: "#e5e7eb",
        margin: "0 2px",
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main editor component
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportDesignerRichTextEditorProps {
  value: JSONContent | null | undefined;
  onChange: (value: JSONContent) => void;
  placeholder?: string;
}

export function ReportDesignerRichTextEditor({
  value,
  onChange,
  placeholder = "Enter text. Use Insert Field to add dynamic data.",
}: ReportDesignerRichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        heading: false,
        // Disable built-in underline to avoid duplicate extension warning
        // (we add the standalone Underline extension below)
        underline: false,
      }),
      Underline,
      TextStyle,
      FontSize,
      Color,
      TextAlign.configure({
        types: ["paragraph"],
        alignments: ["left", "center", "right", "justify"],
        defaultAlignment: "left",
      }),
      BindingToken,
    ],
    content: value ?? null,
    editorProps: {
      attributes: {
        style: [
          "min-height: 120px",
          "padding: 8px 10px",
          "font-size: 0.875rem",
          "line-height: 1.6",
          "color: #1f2937",
          "outline: none",
          "font-family: inherit",
        ].join("; "),
        "data-placeholder": placeholder,
      },
    },
    onUpdate({ editor: e }) {
      onChange(e.getJSON() as JSONContent);
    },
  });

  const setFontSize = useCallback(
    (size: number) => {
      if (!editor) return;
      const clamped = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, size));
      editor.chain().focus().setMark("textStyle", { fontSize: clamped }).run();
    },
    [editor]
  );

  const setColor = useCallback(
    (hex: string) => {
      if (!editor) return;
      const safeHex = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#1a1a1a";
      editor.chain().focus().setColor(safeHex).run();
    },
    [editor]
  );

  /** Insert a bindingToken chip at the current cursor position */
  const handleInsertField = useCallback(
    (fieldPath: string) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .insertContent({
          type: "bindingToken",
          attrs: { path: fieldPath },
        })
        .run();
    },
    [editor]
  );

  if (!editor) return null;

  const currentFontSize: number =
    (editor.getAttributes("textStyle").fontSize as number | undefined) ?? 10;
  const currentColor: string =
    (editor.getAttributes("textStyle").color as string | undefined) ?? "#1a1a1a";

  return (
    <div
      style={{
        border: "1px solid #d1d5db",
        borderRadius: "4px",
        overflow: "hidden",
        background: "#fff",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "2px",
          padding: "4px 6px",
          background: "#f9fafb",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        {/* Bold / Italic / Underline */}
        <ToolbarBtn
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <strong>B</strong>
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <em>I</em>
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline"
        >
          <u>U</u>
        </ToolbarBtn>

        <ToolbarSep />

        {/* Alignment */}
        <ToolbarBtn
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          title="Align Left"
        >
          ≡
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          title="Center"
        >
          ≡
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          title="Align Right"
        >
          ≡
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive({ textAlign: "justify" })}
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          title="Justify"
        >
          ≡
        </ToolbarBtn>

        <ToolbarSep />

        {/* Lists */}
        <ToolbarBtn
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet List"
        >
          •≡
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Ordered List"
        >
          1≡
        </ToolbarBtn>

        <ToolbarSep />

        {/* Font size */}
        <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>Size:</span>
          <button
            type="button"
            title="Decrease font size"
            onClick={() => setFontSize(currentFontSize - 1)}
            style={{
              padding: "0 4px",
              fontSize: "0.8rem",
              background: "transparent",
              border: "1px solid #e5e7eb",
              borderRadius: "3px",
              cursor: "pointer",
              color: "#374151",
              lineHeight: "1.6",
            }}
          >
            −
          </button>
          <input
            type="number"
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            value={currentFontSize}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n)) setFontSize(n);
            }}
            style={{
              width: "38px",
              padding: "1px 4px",
              fontSize: "0.78rem",
              border: "1px solid #e5e7eb",
              borderRadius: "3px",
              textAlign: "center",
              color: "#374151",
            }}
          />
          <button
            type="button"
            title="Increase font size"
            onClick={() => setFontSize(currentFontSize + 1)}
            style={{
              padding: "0 4px",
              fontSize: "0.8rem",
              background: "transparent",
              border: "1px solid #e5e7eb",
              borderRadius: "3px",
              cursor: "pointer",
              color: "#374151",
              lineHeight: "1.6",
            }}
          >
            +
          </button>
        </div>

        <ToolbarSep />

        {/* Color */}
        <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
          <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>Color:</span>
          <input
            type="color"
            value={currentColor}
            title="Text color"
            onChange={(e) => setColor(e.target.value)}
            style={{
              width: "24px",
              height: "24px",
              padding: "0",
              border: "1px solid #d1d5db",
              borderRadius: "3px",
              cursor: "pointer",
              background: "none",
            }}
          />
          <button
            type="button"
            title="Reset color to black"
            onClick={() => setColor("#1a1a1a")}
            style={{
              padding: "1px 5px",
              fontSize: "0.72rem",
              background: "transparent",
              border: "1px solid #e5e7eb",
              borderRadius: "3px",
              cursor: "pointer",
              color: "#374151",
            }}
          >
            ↺
          </button>
        </div>

        <ToolbarSep />

        {/* Clear formatting */}
        <ToolbarBtn
          onClick={() =>
            editor.chain().focus().unsetAllMarks().clearNodes().run()
          }
          title="Clear formatting"
        >
          ✕
        </ToolbarBtn>

        <ToolbarSep />

        {/* Insert Field picker */}
        <ReportFieldPickerPopover
          onInsert={handleInsertField}
          label="Insert Field"
          className="h-[26px] text-[0.72rem] px-2"
        />
      </div>

      {/* Editor body */}
      <EditorContent editor={editor} />

      {/* Binding hint */}
      <div
        style={{
          padding: "3px 8px",
          background: "#f5f3ff",
          borderTop: "1px solid #ede9fe",
          fontSize: "0.7rem",
          color: "#7c3aed",
        }}
      >
        Tip: Use <strong>Insert Field</strong> to add dynamic values, or type{" "}
        <code>{"{{employee.full_name_en}}"}</code> directly
      </div>
    </div>
  );
}
