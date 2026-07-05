/**
 * Report Designer — Plain Text ↔ ProseMirror Doc Conversion
 *
 * Client-safe utilities (no server imports) shared by the Puck editor shell
 * and block configs.
 *
 * buildProseMirrorDocFromPlainText:
 *  Converts a plain-text string containing {{binding.path}} placeholders into
 *  a ProseMirror doc with bindingToken nodes. Used to rebuild the TipTap
 *  editor content from the plain-text fallback when richContent is missing
 *  or was corrupted by a stale editor bundle (pre-UX.2 binding token bug).
 */

import type { ProseMirrorDocJson } from "./types";

const BINDING_TOKEN_REGEX = /\{\{([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)\}\}/g;

interface PMInlineNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
}

interface PMParagraphNode {
  type: "paragraph";
  content?: PMInlineNode[];
}

/**
 * Build a ProseMirror doc from plain text with {{path}} placeholders.
 * Each line becomes a paragraph; each {{path}} becomes a bindingToken node.
 * Returns null for empty/whitespace-only input.
 */
export function buildProseMirrorDocFromPlainText(
  text: string
): ProseMirrorDocJson | null {
  if (!text || !text.trim()) return null;

  const paragraphs: PMParagraphNode[] = text.split(/\r?\n/).map((line) => {
    const inline: PMInlineNode[] = [];
    let lastIndex = 0;

    BINDING_TOKEN_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = BINDING_TOKEN_REGEX.exec(line)) !== null) {
      if (match.index > lastIndex) {
        inline.push({ type: "text", text: line.slice(lastIndex, match.index) });
      }
      inline.push({ type: "bindingToken", attrs: { path: match[1] } });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < line.length) {
      inline.push({ type: "text", text: line.slice(lastIndex) });
    }

    return inline.length > 0
      ? { type: "paragraph", content: inline }
      : { type: "paragraph" };
  });

  return { type: "doc", content: paragraphs as unknown[] } as ProseMirrorDocJson;
}

/**
 * Collect all bindingToken nodes (recursively) from a ProseMirror doc.
 * Returns the list of raw token nodes for inspection.
 */
export function collectBindingTokens(
  doc: Record<string, unknown> | null | undefined
): Array<Record<string, unknown>> {
  const tokens: Array<Record<string, unknown>> = [];
  if (!doc) return tokens;

  const walk = (node: Record<string, unknown>): void => {
    if (node.type === "bindingToken") tokens.push(node);
    for (const child of (node.content as unknown[] | undefined) ?? []) {
      walk(child as Record<string, unknown>);
    }
  };

  walk(doc);
  return tokens;
}

/**
 * True when a richContent doc contains binding tokens and ALL of them are
 * missing their path attribute — the corrupt pattern produced by stale
 * editor bundles where the BindingToken schema had no registered attributes.
 */
export function isCorruptRichContentDoc(
  doc: Record<string, unknown> | null | undefined
): boolean {
  if (!doc || doc.type !== "doc") return false;
  const tokens = collectBindingTokens(doc);
  if (tokens.length === 0) return false;
  return tokens.every((t) => {
    const attrs = t.attrs as Record<string, unknown> | undefined;
    return !attrs || !attrs.path;
  });
}
