import { describe, expect, it } from "vitest";

import { diffStudioSchemas } from "../diff";
import type { StudioBodySchema } from "../schema";

function body(blocks: StudioBodySchema["blocks"], direction: "ltr" | "rtl" = "ltr"): StudioBodySchema {
  return { version: 1, direction, blocks };
}

const heading = (id: string, text: string) =>
  ({ id, kind: "heading", text, level: 2, align: "left" }) as const;
const divider = (id: string) => ({ id, kind: "divider" }) as const;

describe("diffStudioSchemas", () => {
  it("reports identical schemas", () => {
    const a = body([heading("h1", "Title"), divider("d1")]);
    const d = diffStudioSchemas(a, body([heading("h1", "Title"), divider("d1")]));
    expect(d.identical).toBe(true);
    expect(d.counts.unchanged).toBe(2);
  });

  it("detects added and removed blocks", () => {
    const prev = body([heading("h1", "Title")]);
    const next = body([heading("h1", "Title"), divider("d1")]);
    const d = diffStudioSchemas(prev, next);
    expect(d.counts.added).toBe(1);
    expect(d.identical).toBe(false);

    const d2 = diffStudioSchemas(next, prev);
    expect(d2.counts.removed).toBe(1);
    expect(d2.changes.find((c) => c.type === "removed")?.blockId).toBe("d1");
  });

  it("detects modified content by id", () => {
    const prev = body([heading("h1", "Old title")]);
    const next = body([heading("h1", "New title")]);
    const d = diffStudioSchemas(prev, next);
    expect(d.counts.modified).toBe(1);
    expect(d.changes[0].label).toBe("New title");
  });

  it("detects pure moves without content change", () => {
    const prev = body([heading("h1", "A"), divider("d1")]);
    const next = body([divider("d1"), heading("h1", "A")]);
    const d = diffStudioSchemas(prev, next);
    expect(d.counts.moved).toBe(2);
    expect(d.counts.modified).toBe(0);
  });

  it("is insensitive to object key order (canonical compare)", () => {
    const prev = body([{ id: "h1", kind: "heading", text: "A", level: 2, align: "left" }]);
    const next = body([{ align: "left", level: 2, text: "A", kind: "heading", id: "h1" } as never]);
    const d = diffStudioSchemas(prev, next);
    expect(d.identical).toBe(true);
  });

  it("flags direction change", () => {
    const d = diffStudioSchemas(body([], "ltr"), body([], "rtl"));
    expect(d.directionChanged).toBe(true);
    expect(d.identical).toBe(false);
  });
});
