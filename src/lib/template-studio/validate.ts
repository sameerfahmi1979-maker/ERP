/**
 * OUTPUT.3A — Template Studio save-time validation and sanitization (pure).
 *
 * Defense-in-depth on top of the zod schema:
 *  - ProseMirror JSON allowlist walk (nodes/marks/attrs) — anything unknown is
 *    a hard rejection at save time (not silently dropped, unlike render time).
 *  - Variable validation: bindingToken paths and {{tokens}} in any text must
 *    be on the binding registry AND the per-output allowlist when provided.
 *  - Style clamps: font size 8–36, 6-digit hex colors, approved alignments.
 */

import { ERP_BINDING_REGISTRY } from "@/lib/report-designer/binding-registry";
import { extractVariableTokens } from "@/lib/output/variable-allowlist";
import type { StudioBodySchema, StudioBlock } from "./schema";

const ALLOWED_NODES = new Set([
  "doc",
  "paragraph",
  "text",
  "hardBreak",
  "bulletList",
  "orderedList",
  "listItem",
  "bindingToken",
]);
const ALLOWED_MARKS = new Set(["bold", "italic", "underline", "textStyle"]);
const ALLOWED_ALIGN = new Set(["left", "center", "right", "justify"]);
const SAFE_HEX = /^#[0-9a-fA-F]{6}$/;
const FONT_MIN = 8;
const FONT_MAX = 36;
const TOKEN_PATH = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

interface PmNode {
  type?: unknown;
  text?: unknown;
  content?: unknown;
  marks?: unknown;
  attrs?: Record<string, unknown>;
}

export interface StudioValidationResult {
  ok: boolean;
  errors: string[];
  /** All variable paths referenced across the body. */
  variables: string[];
}

export function validateStudioBody(
  schema: StudioBodySchema,
  options?: { outputAllowlist?: readonly string[] | null }
): StudioValidationResult {
  const errors: string[] = [];
  const variables = new Set<string>();

  schema.blocks.forEach((block, i) => {
    const where = `blocks[${i}] (${block.kind})`;
    collectBlockVariables(block).forEach((v) => variables.add(v));
    for (const doc of blockRichDocs(block)) {
      walkPmNode(doc as PmNode, where, errors, variables);
    }
  });

  // Variable governance
  for (const path of variables) {
    if (!TOKEN_PATH.test(path)) {
      errors.push(`Variable '${path}' has an invalid format.`);
      continue;
    }
    if (!ERP_BINDING_REGISTRY[path]) {
      errors.push(`Variable '${path}' is not in the approved field registry.`);
      continue;
    }
    if (options?.outputAllowlist && options.outputAllowlist.length > 0 && !options.outputAllowlist.includes(path)) {
      errors.push(`Variable '${path}' is not allowlisted for this output.`);
    }
  }

  return { ok: errors.length === 0, errors, variables: [...variables] };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function blockRichDocs(block: StudioBlock): unknown[] {
  switch (block.kind) {
    case "paragraph":
    case "clause":
      return [block.rich];
    case "columns":
      return [block.left, block.right];
    default:
      return [];
  }
}

function collectBlockVariables(block: StudioBlock): string[] {
  const out: string[] = [];
  switch (block.kind) {
    case "heading":
      out.push(...extractVariableTokens(block.text));
      break;
    case "key_value":
      for (const r of block.rows) out.push(...extractVariableTokens(`${r.label} ${r.value}`));
      break;
    case "table":
      for (const h of block.headers) out.push(...extractVariableTokens(h));
      for (const row of block.rows) for (const c of row) out.push(...extractVariableTokens(c));
      break;
    default:
      break;
  }
  return out;
}

function walkPmNode(
  node: PmNode,
  where: string,
  errors: string[],
  variables: Set<string>
): void {
  const type = typeof node.type === "string" ? node.type : "";
  if (!ALLOWED_NODES.has(type)) {
    errors.push(`${where}: node type '${type || "unknown"}' is not allowed.`);
    return;
  }

  // Text nodes may carry {{tokens}}
  if (type === "text" && typeof node.text === "string") {
    extractVariableTokens(node.text).forEach((v) => variables.add(v));
  }

  // Binding chips
  if (type === "bindingToken") {
    const path = String(node.attrs?.path ?? "");
    if (!path) errors.push(`${where}: binding chip has no field path.`);
    else variables.add(path);
  }

  // Attrs governance
  if (node.attrs) {
    const align = node.attrs.textAlign;
    if (align !== undefined && align !== null && !ALLOWED_ALIGN.has(String(align))) {
      errors.push(`${where}: text alignment '${String(align)}' is not allowed.`);
    }
    for (const key of Object.keys(node.attrs)) {
      if (!["textAlign", "path", "level", "start", "type", "tight"].includes(key)) {
        errors.push(`${where}: attribute '${key}' on '${type}' is not allowed.`);
      }
    }
  }

  // Marks governance
  if (Array.isArray(node.marks)) {
    for (const raw of node.marks) {
      const mark = raw as { type?: unknown; attrs?: Record<string, unknown> };
      const mt = typeof mark.type === "string" ? mark.type : "";
      if (!ALLOWED_MARKS.has(mt)) {
        errors.push(`${where}: mark '${mt || "unknown"}' is not allowed.`);
        continue;
      }
      if (mt === "textStyle" && mark.attrs) {
        const fs = mark.attrs.fontSize;
        if (fs !== undefined && fs !== null) {
          const n = Number(fs);
          if (Number.isNaN(n) || n < FONT_MIN || n > FONT_MAX) {
            errors.push(`${where}: font size ${String(fs)} outside approved range ${FONT_MIN}–${FONT_MAX}.`);
          }
        }
        const color = mark.attrs.color;
        if (color !== undefined && color !== null && !SAFE_HEX.test(String(color))) {
          errors.push(`${where}: color '${String(color)}' is not a safe 6-digit hex value.`);
        }
      }
    }
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) walkPmNode(child as PmNode, where, errors, variables);
  }
}
