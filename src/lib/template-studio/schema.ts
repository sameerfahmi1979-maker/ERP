/**
 * OUTPUT.3A — Template Studio structured body schema.
 *
 * The Studio is a STRUCTURED editor (v6.1): admins compose governed blocks —
 * never free-pixel positioning, never raw HTML/CSS. The schema is stored in
 * erp_report_templates.body_schema_json (studio_schema_version = 1) and maps
 * deterministically onto the Executive Ledger document model, so browser
 * preview and Gotenberg issuance share ONE canonical HTML builder.
 */

import { z } from "zod";

export const STUDIO_SCHEMA_VERSION = 1;

// ── Approved style sets (frame/margins are governed OUTSIDE the body) ────────

export const STUDIO_ALIGNMENTS = ["left", "center", "right", "justify"] as const;
export const STUDIO_HEADING_LEVELS = [1, 2, 3] as const;
export const STUDIO_SPACER_MIN_PT = 4;
export const STUDIO_SPACER_MAX_PT = 48;

/**
 * ProseMirror JSON. Runtime-checked to be a `{ type: "doc" }` object here;
 * the full node/mark allowlist walk happens in validate.ts. TS-typed as
 * `unknown` so TipTap's JSONContent flows in/out without unsafe widening.
 */
const pmDocSchema = z.custom<unknown>(
  (v) =>
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    (v as { type?: unknown }).type === "doc",
  { message: "Rich text content must be a ProseMirror doc" }
);

// ── Blocks ────────────────────────────────────────────────────────────────────

const headingBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("heading"),
  text: z.string().max(300),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  align: z.enum(STUDIO_ALIGNMENTS).default("left"),
});

const paragraphBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("paragraph"),
  rich: pmDocSchema,
});

/** Numbered clause — the Studio auto-numbers clauses in document order. */
const clauseBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("clause"),
  title: z.string().max(200),
  rich: pmDocSchema,
});

const keyValueBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("key_value"),
  title: z.string().max(200).optional(),
  rows: z
    .array(
      z.object({
        label: z.string().max(160),
        value: z.string().max(400), // may contain {{tokens}}
        emphasized: z.boolean().optional(),
      })
    )
    .min(1)
    .max(40),
});

const tableBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("table"),
  title: z.string().max(200).optional(),
  headers: z.array(z.string().max(120)).min(1).max(8),
  /** Static rows; cells may contain {{tokens}}. */
  rows: z.array(z.array(z.string().max(300))).max(100),
  /** Bind rows to a repeating dataset (e.g. "ppe_items") instead of static rows. */
  repeatBinding: z.string().max(80).nullable().optional(),
  showHeader: z.boolean().default(true),
});

const dividerBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("divider"),
  label: z.string().max(80).optional(),
});

const spacerBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("spacer"),
  heightPt: z.number().int().min(STUDIO_SPACER_MIN_PT).max(STUDIO_SPACER_MAX_PT),
});

/** Governed two-column layout (no arbitrary widths). */
const columnsBlock = z.object({
  id: z.string().min(1),
  kind: z.literal("columns"),
  layout: z.enum(["equal", "left-wide", "right-wide"]),
  left: pmDocSchema,
  right: pmDocSchema,
});

export const studioBlockSchema = z.discriminatedUnion("kind", [
  headingBlock,
  paragraphBlock,
  clauseBlock,
  keyValueBlock,
  tableBlock,
  dividerBlock,
  spacerBlock,
  columnsBlock,
]);

export type StudioBlock = z.infer<typeof studioBlockSchema>;
export type StudioBlockKind = StudioBlock["kind"];

// ── Body schema root ──────────────────────────────────────────────────────────

export const studioBodySchema = z.object({
  version: z.literal(STUDIO_SCHEMA_VERSION),
  direction: z.enum(["ltr", "rtl"]).default("ltr"),
  blocks: z.array(studioBlockSchema).max(120),
});

export type StudioBodySchema = z.infer<typeof studioBodySchema>;

export function parseStudioBodySchema(value: unknown):
  | { ok: true; schema: StudioBodySchema }
  | { ok: false; errors: string[] } {
  const parsed = studioBodySchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  return { ok: true, schema: parsed.data };
}

export function emptyStudioBody(direction: "ltr" | "rtl" = "ltr"): StudioBodySchema {
  return { version: STUDIO_SCHEMA_VERSION, direction, blocks: [] };
}
