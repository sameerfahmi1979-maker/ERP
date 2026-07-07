/**
 * Report Designer — Server-Side ProseMirror JSON Renderer
 * Phase: REPORT DESIGNER UX.1 — TipTap Rich Text + Multi-Column Layout Foundation
 *
 * Converts a ProseMirror/TipTap JSON document to a safe HTML string.
 * Used server-side only — no TipTap runtime required.
 *
 * Security contract:
 *  - Only allowed node types are rendered; unknown types are silently ignored.
 *  - Only allowed mark types are rendered; unknown marks are silently ignored.
 *  - All text content is HTML-escaped via elEscapeHtml().
 *  - Font size validated to be within 8–36px range.
 *  - Color validated to be a safe 6-digit hex string.
 *  - textAlign validated against allowed enum values.
 *  - No raw HTML, style, script, iframe, or object tags in output.
 *  - {{binding.path}} tokens in text nodes are resolved using bindingValues.
 *  - No dangerouslySetInnerHTML — this module is server-side string generation only.
 */

import { elEscapeHtml } from "@/lib/executive-ledger/formatters";
import { ERP_BINDING_REGISTRY } from "./binding-registry";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SAFE_HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 36;
const ALLOWED_TEXT_ALIGN = new Set(["left", "center", "right", "justify"]);

// ─────────────────────────────────────────────────────────────────────────────
// Internal types (avoid importing heavy ProseMirror packages on server)
// ─────────────────────────────────────────────────────────────────────────────

interface PMNode {
  type: string;
  text?: string;
  content?: PMNode[];
  marks?: PMMark[];
  attrs?: Record<string, unknown>;
}

interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Binding resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve {{binding.path}} tokens in plain text strings.
 * Unknown paths are rendered as the token itself (preserved for display).
 */
function resolveBindingsInText(text: string, values: Record<string, string>): string {
  return text.replace(
    /\{\{([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)\}\}/g,
    (match, path: string) => {
      if (ERP_BINDING_REGISTRY[path] && Object.prototype.hasOwnProperty.call(values, path)) {
        return values[path];
      }
      return match; // Preserve unresolved tokens as-is
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mark rendering
// ─────────────────────────────────────────────────────────────────────────────

function renderMarkOpen(mark: PMMark): string {
  switch (mark.type) {
    case "bold":      return "<strong>";
    case "italic":    return "<em>";
    case "underline": return "<u>";
    case "textStyle": {
      const attrs = mark.attrs ?? {};
      const styles: string[] = [];

      const fontSize = attrs.fontSize;
      if (typeof fontSize === "number" && fontSize >= FONT_SIZE_MIN && fontSize <= FONT_SIZE_MAX) {
        styles.push(`font-size:${Math.round(fontSize)}px`);
      }

      const color = attrs.color;
      if (typeof color === "string" && SAFE_HEX_COLOR.test(color)) {
        styles.push(`color:${color}`);
      }

      return styles.length > 0 ? `<span style="${styles.join(";")}">` : "";
    }
    default:
      return ""; // Unknown mark type — silently ignored
  }
}

function renderMarkClose(mark: PMMark): string {
  switch (mark.type) {
    case "bold":      return "</strong>";
    case "italic":    return "</em>";
    case "underline": return "</u>";
    case "textStyle": {
      const attrs = mark.attrs ?? {};
      const hasFontSize = typeof attrs.fontSize === "number";
      const hasColor = typeof attrs.color === "string" && SAFE_HEX_COLOR.test(attrs.color as string);
      return hasFontSize || hasColor ? "</span>" : "";
    }
    default:
      return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Node rendering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute marks that are shared by ALL text nodes in a set of inline nodes.
 * These become "context marks" for the paragraph — when every piece of typed
 * text is bold / a certain font-size / a certain color, the binding chip
 * resolved values should inherit that same formatting in the output.
 *
 * Only marks identical in both type AND attrs on every text node are returned
 * so partial-selection formatting never bleeds onto chips.
 */
function getContextMarks(nodes: PMNode[]): PMMark[] {
  const textNodes = nodes.filter((n) => n.type === "text" && (n.marks?.length ?? 0) > 0);
  if (textNodes.length === 0) return [];

  let common = textNodes[0].marks ?? [];
  for (let i = 1; i < textNodes.length; i++) {
    const nodeMarks = textNodes[i].marks ?? [];
    common = common.filter((cm) =>
      nodeMarks.some(
        (nm) =>
          nm.type === cm.type &&
          JSON.stringify(nm.attrs ?? {}) === JSON.stringify(cm.attrs ?? {})
      )
    );
    if (common.length === 0) break;
  }
  return common;
}

/**
 * Render inline content (text nodes, hardBreaks, bindingTokens inside a block).
 *
 * contextMarks: marks shared by ALL sibling text nodes (see getContextMarks).
 * bindingToken chips are atom nodes and cannot carry marks in ProseMirror JSON,
 * but their resolved values should inherit paragraph-level formatting when the
 * user selects the whole paragraph and applies bold / font-size / color.
 */
function renderInlineContent(
  nodes: PMNode[],
  values: Record<string, string>,
  contextMarks: PMMark[] = []
): string {
  let html = "";
  for (const node of nodes) {
    switch (node.type) {
      case "text": {
        const raw = typeof node.text === "string" ? node.text : "";
        const resolved = resolveBindingsInText(raw, values);
        const escaped = elEscapeHtml(resolved);
        const marks = node.marks ?? [];
        const open  = marks.map(renderMarkOpen).join("");
        const close = [...marks].reverse().map(renderMarkClose).join("");
        html += open + escaped + close;
        break;
      }
      case "hardBreak":
        html += "<br>";
        break;
      case "bindingToken": {
        // UX.2: Resolve binding chip. Marks stored ON the chip itself take
        // priority (user formatted the chip directly); otherwise fall back to
        // contextMarks (marks shared by all sibling text nodes) so
        // paragraph-level formatting also reaches the resolved value.
        const path = typeof node.attrs?.path === "string" ? node.attrs.path : "";
        const chipMarks = node.marks && node.marks.length > 0 ? node.marks : contextMarks;
        const markOpen  = chipMarks.map(renderMarkOpen).join("");
        const markClose = [...chipMarks].reverse().map(renderMarkClose).join("");
        if (path && ERP_BINDING_REGISTRY[path] && Object.prototype.hasOwnProperty.call(values, path)) {
          html += markOpen + elEscapeHtml(values[path]) + markClose;
        } else if (path) {
          // Unresolved token — render as placeholder
          html += markOpen + elEscapeHtml(`{{${path}}}`) + markClose;
        }
        break;
      }
      default:
        // Unknown inline node — silently ignored
        break;
    }
  }
  return html;
}

/**
 * Render a single block-level node.
 * blockTextAlign: when provided, overrides per-paragraph attrs.textAlign.
 */
function renderBlockNode(
  node: PMNode,
  values: Record<string, string>,
  blockTextAlign?: string
): string {
  const children = node.content ?? [];

  switch (node.type) {
    case "paragraph": {
      const attrs = node.attrs ?? {};
      // Block-level alignment (from Puck prop) takes priority over paragraph-level.
      const align =
        (blockTextAlign && ALLOWED_TEXT_ALIGN.has(blockTextAlign) ? blockTextAlign : null) ??
        (attrs.textAlign as string | undefined);
      const alignStyle = align && ALLOWED_TEXT_ALIGN.has(align) ? ` text-align:${align};` : "";
      const ctxMarks = getContextMarks(children);
      const inner = renderInlineContent(children, values, ctxMarks);
      // Single style= attribute: merge base styles + optional text-align
      return `<p style="margin:0 0 6px 0; font-size:10px; line-height:1.7; color:#1a1a1a;${alignStyle}">${inner || "&nbsp;"}</p>`;
    }
    case "bulletList": {
      const items = children.map(item => {
        const itemContent = item.content ?? [];
        // listItem can contain one or more paragraphs
        const text = itemContent.map(n => {
          if (n.type === "paragraph") return renderInlineContent(n.content ?? [], values, getContextMarks(n.content ?? []));
          return renderBlockNode(n, values, blockTextAlign);
        }).join("");
        return `<li style="font-size:10px; color:#1a1a1a; margin-bottom:2px;">${text}</li>`;
      }).join("");
      return `<ul style="margin:0 0 8px 0; padding-left:20px;">${items}</ul>`;
    }
    case "orderedList": {
      const items = children.map(item => {
        const itemContent = item.content ?? [];
        const text = itemContent.map(n => {
          if (n.type === "paragraph") return renderInlineContent(n.content ?? [], values, getContextMarks(n.content ?? []));
          return renderBlockNode(n, values, blockTextAlign);
        }).join("");
        return `<li style="font-size:10px; color:#1a1a1a; margin-bottom:2px;">${text}</li>`;
      }).join("");
      return `<ol style="margin:0 0 8px 0; padding-left:20px;">${items}</ol>`;
    }
    case "listItem": {
      // Usually handled inside bulletList/orderedList, but handle standalone gracefully
      return renderInlineContent(children, values, getContextMarks(children));
    }
    default:
      return ""; // Unknown block node — silently ignored
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Render a ProseMirror JSON document to a safe HTML string.
 *
 * @param doc - ProseMirror JSON doc object (from TipTap storage)
 * @param bindingValues - Flat map of binding paths to resolved values
 * @returns Safe HTML string with all text escaped and marks rendered
 *
 * Security:
 *  - All text is HTML-escaped
 *  - Only allowed nodes/marks/attrs produce output
 *  - Unknown node types produce no output (not even a wrapper element)
 *  - Font size capped to 8–36px
 *  - Color validated as safe hex
 *  - No raw HTML passthrough anywhere
 */
export function renderProseMirrorDocToHtml(
  doc: Record<string, unknown>,
  bindingValues: Record<string, string>,
  blockTextAlign?: string
): string {
  if (!doc || doc.type !== "doc") return "";
  const content = (doc.content as PMNode[] | undefined) ?? [];
  return content.map(node => renderBlockNode(node as PMNode, bindingValues, blockTextAlign)).join("\n");
}

/**
 * Extract all text content from a ProseMirror JSON doc as plain text.
 * Used to generate the legacy `content` fallback string.
 */
export function extractPlainTextFromProseMirror(doc: Record<string, unknown>): string {
  if (!doc || doc.type !== "doc") return "";
  const parts: string[] = [];

  function walkNode(node: PMNode): void {
    if (node.type === "text" && node.text) {
      parts.push(node.text);
    }
    if (node.type === "hardBreak") {
      parts.push("\n");
    }
    // UX.2: Extract path from bindingToken as {{path}} text
    if (node.type === "bindingToken" && typeof node.attrs?.path === "string") {
      parts.push(`{{${node.attrs.path}}}`);
    }
    if (node.type === "paragraph" && parts.length > 0) {
      const last = parts[parts.length - 1];
      if (last !== "\n") parts.push(" ");
    }
    for (const child of node.content ?? []) {
      walkNode(child);
    }
  }

  for (const node of (doc.content as PMNode[] | undefined) ?? []) {
    walkNode(node);
    parts.push("\n");
  }

  return parts.join("").trim();
}
