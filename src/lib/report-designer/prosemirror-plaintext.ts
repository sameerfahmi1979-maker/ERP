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

/** Paragraph-level attrs worth preserving across plain-text rebuilds */
const PRESERVED_PARAGRAPH_ATTRS = ["textAlign"] as const;

/**
 * When a full plain-text rebuild is unavoidable, copy paragraph-level attrs
 * (textAlign, etc.) from the original doc onto the rebuilt doc by index.
 */
export function rebuildPreservingParagraphAttrs(
  plainText: string,
  originalDoc: Record<string, unknown> | null | undefined
): ProseMirrorDocJson | null {
  const rebuilt = buildProseMirrorDocFromPlainText(plainText);
  if (!rebuilt || !originalDoc || originalDoc.type !== "doc") return rebuilt;

  const origContent = originalDoc.content as Array<Record<string, unknown>> | undefined;
  const newContent = rebuilt.content as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(origContent) || !Array.isArray(newContent)) return rebuilt;

  const origParagraphs = origContent.filter((n) => n.type === "paragraph");
  const newParagraphs = newContent.filter((n) => n.type === "paragraph");
  const count = Math.min(origParagraphs.length, newParagraphs.length);

  for (let i = 0; i < count; i++) {
    const origAttrs = origParagraphs[i].attrs as Record<string, unknown> | undefined;
    if (!origAttrs || typeof origAttrs !== "object") continue;

    const preserved: Record<string, unknown> = {};
    for (const key of PRESERVED_PARAGRAPH_ATTRS) {
      if (origAttrs[key] != null && origAttrs[key] !== "") {
        preserved[key] = origAttrs[key];
      }
    }
    if (Object.keys(preserved).length === 0) continue;

    newParagraphs[i].attrs = {
      ...((newParagraphs[i].attrs as Record<string, unknown> | undefined) ?? {}),
      ...preserved,
    };
  }

  return rebuilt;
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
 * True when a richContent doc contains at least one binding token that is
 * missing its path attribute. Catches both fully-corrupt docs (all tokens
 * missing paths, produced by stale bundles pre-UX.2) and partially-corrupt
 * docs (some tokens good, some empty-path — can occur when old stale-bundle
 * content was partially re-edited before a hard refresh).
 *
 * When true, the Puck shell sanitizer rebuilds richContent from the plain-text
 * `content` fallback, which always carries well-formed {{path}} tokens.
 */
export function isCorruptRichContentDoc(
  doc: Record<string, unknown> | null | undefined
): boolean {
  if (!doc || doc.type !== "doc") return false;
  const tokens = collectBindingTokens(doc);
  if (tokens.length === 0) return false;
  return tokens.some((t) => {
    const attrs = t.attrs as Record<string, unknown> | undefined;
    return !attrs || !attrs.path;
  });
}

/**
 * Normalize a ProseMirror doc in place:
 *
 *  1. Strip `link` marks from text nodes. TipTap StarterKit v3 bundles the
 *     Link extension with autolink — pasting text containing
 *     {{binding.path}} tokens linkified fragments like "company.legal",
 *     SPLITTING the binding across multiple text nodes so it could never
 *     resolve (binding resolution is per text node).
 *  2. Merge adjacent text nodes that carry identical marks — re-joining the
 *     binding fragments the link marks split apart.
 *
 * Returns true when anything was changed. Mutates `doc` — callers pass an
 * already deep-cloned doc.
 */
export function normalizeRichContentDoc(
  doc: Record<string, unknown> | null | undefined
): boolean {
  if (!doc || doc.type !== "doc") return false;
  let changed = false;

  const marksKey = (node: Record<string, unknown>): string =>
    JSON.stringify((node.marks as unknown[] | undefined) ?? []);

  const walk = (node: Record<string, unknown>): void => {
    const content = node.content as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(content)) return;

    // 1. Strip link marks
    for (const child of content) {
      const marks = child.marks as Array<{ type?: string }> | undefined;
      if (Array.isArray(marks) && marks.some((m) => m?.type === "link")) {
        const kept = marks.filter((m) => m?.type !== "link");
        if (kept.length > 0) child.marks = kept;
        else delete child.marks;
        changed = true;
      }
    }

    // 2. Merge adjacent text nodes with identical marks
    for (let i = content.length - 1; i > 0; i--) {
      const prev = content[i - 1];
      const curr = content[i];
      if (
        prev.type === "text" &&
        curr.type === "text" &&
        typeof prev.text === "string" &&
        typeof curr.text === "string" &&
        marksKey(prev) === marksKey(curr)
      ) {
        prev.text = prev.text + curr.text;
        content.splice(i, 1);
        changed = true;
      }
    }

    for (const child of content) walk(child);
  };

  walk(doc);
  return changed;
}

/**
 * Self-healing repair for BodyTextSectionBlock richContent whose bindingToken
 * nodes lost their `path` attribute (stale/broken editor bundles serialize
 * chips as {"type":"bindingToken"} with no attrs).
 *
 * Repair strategy — the plain-text fallback (`content`) is auto-synced from
 * the same doc and lists {{path}} tokens in document order, so:
 *  1. If token count matches plain-text path count → fill each missing path
 *     positionally (formatting marks on the doc are preserved).
 *  2. Otherwise → rebuild the whole doc from plain text (data preserved,
 *     block-level formatting lost — still better than a failed save).
 *  3. If plain text has no tokens either → leave as-is (validation will
 *     report it; nothing to repair from).
 *
 * Returns the number of blocks repaired. Mutates `layout` in place — callers
 * pass an already deep-cloned (JSON.parse/stringify) layout.
 */
export function repairLayoutBindingTokenPaths(
  layout: Record<string, unknown> | null | undefined
): number {
  if (!layout) return 0;
  const content = layout.content as
    | Array<{ type?: string; props?: Record<string, unknown> }>
    | undefined;
  if (!Array.isArray(content)) return 0;

  let repaired = 0;

  for (const block of content) {
    if (!block || block.type !== "BodyTextSectionBlock" || !block.props) continue;

    const rc = block.props.richContent as Record<string, unknown> | null | undefined;
    if (!rc || rc.type !== "doc") continue;

    // Heal link-mark splits (pasted {{bindings}} broken by autolink) before
    // token repair so binding resolution works on the saved/rendered doc.
    if (normalizeRichContentDoc(rc)) {
      repaired++;
    }

    const tokens = collectBindingTokens(rc);
    const pathless = tokens.filter((t) => {
      const attrs = t.attrs as Record<string, unknown> | undefined;
      return !attrs || typeof attrs.path !== "string" || !attrs.path;
    });
    if (pathless.length === 0) continue;

    const plainText = typeof block.props.content === "string" ? block.props.content : "";
    BINDING_TOKEN_REGEX.lastIndex = 0;
    const plainPaths = Array.from(plainText.matchAll(BINDING_TOKEN_REGEX)).map((m) => m[1]);

    if (plainPaths.length === tokens.length) {
      // Positional fill: token i ↔ plain-text path i (same document order)
      tokens.forEach((t, i) => {
        const attrs = (t.attrs ?? {}) as Record<string, unknown>;
        if (typeof attrs.path !== "string" || !attrs.path) {
          attrs.path = plainPaths[i];
          t.attrs = attrs;
        }
      });
      repaired++;
    } else if (plainPaths.length > 0) {
      // Counts diverged — rebuild from plain text but preserve paragraph attrs
      // (textAlign, etc.) so alignment survives binding-token repair.
      const rebuilt = rebuildPreservingParagraphAttrs(plainText, rc);
      if (rebuilt) {
        block.props.richContent = rebuilt as unknown as Record<string, unknown>;
        repaired++;
      }
    }
    // else: no plain-text source to repair from — leave for validation to report
  }

  return repaired;
}
