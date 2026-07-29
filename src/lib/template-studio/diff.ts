/**
 * OUTPUT.3B — Template Studio version comparison (pure).
 *
 * Block-level diff between two studio body schemas (e.g. a draft revision vs
 * its published parent). Matches blocks by stable block id; content changes
 * are detected by canonical JSON comparison.
 */

import type { StudioBodySchema, StudioBlock } from "./schema";

export type StudioBlockChangeType = "added" | "removed" | "modified" | "moved" | "unchanged";

export interface StudioBlockChange {
  type: StudioBlockChangeType;
  blockId: string;
  kind: StudioBlock["kind"];
  /** Index in the previous version (undefined for added blocks). */
  fromIndex?: number;
  /** Index in the new version (undefined for removed blocks). */
  toIndex?: number;
  /** Short human-readable label for the block (title/text/kind). */
  label: string;
}

export interface StudioSchemaDiff {
  directionChanged: boolean;
  changes: StudioBlockChange[];
  counts: Record<StudioBlockChangeType, number>;
  /** True when there is no difference at all. */
  identical: boolean;
}

function blockLabel(block: StudioBlock): string {
  switch (block.kind) {
    case "heading":
      return block.text || "Heading";
    case "clause":
      return block.title || "Clause";
    case "key_value":
      return block.title ?? "Key/Value";
    case "table":
      return block.title ?? `Table (${block.headers.length} cols)`;
    case "divider":
      return block.label ?? "Divider";
    case "spacer":
      return `Spacer ${block.heightPt}pt`;
    case "columns":
      return `Columns (${block.layout})`;
    default:
      return "Paragraph";
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

export function diffStudioSchemas(
  previous: StudioBodySchema,
  next: StudioBodySchema
): StudioSchemaDiff {
  const changes: StudioBlockChange[] = [];
  const prevById = new Map(previous.blocks.map((b, i) => [b.id, { block: b, index: i }]));
  const nextIds = new Set(next.blocks.map((b) => b.id));

  next.blocks.forEach((block, toIndex) => {
    const prev = prevById.get(block.id);
    if (!prev) {
      changes.push({ type: "added", blockId: block.id, kind: block.kind, toIndex, label: blockLabel(block) });
      return;
    }
    const contentChanged = canonical(prev.block) !== canonical(block);
    const moved = prev.index !== toIndex;
    changes.push({
      type: contentChanged ? "modified" : moved ? "moved" : "unchanged",
      blockId: block.id,
      kind: block.kind,
      fromIndex: prev.index,
      toIndex,
      label: blockLabel(block),
    });
  });

  previous.blocks.forEach((block, fromIndex) => {
    if (!nextIds.has(block.id)) {
      changes.push({ type: "removed", blockId: block.id, kind: block.kind, fromIndex, label: blockLabel(block) });
    }
  });

  const counts: Record<StudioBlockChangeType, number> = {
    added: 0,
    removed: 0,
    modified: 0,
    moved: 0,
    unchanged: 0,
  };
  for (const c of changes) counts[c.type] += 1;

  const directionChanged = previous.direction !== next.direction;

  return {
    directionChanged,
    changes,
    counts,
    identical:
      !directionChanged &&
      counts.added === 0 &&
      counts.removed === 0 &&
      counts.modified === 0 &&
      counts.moved === 0,
  };
}
