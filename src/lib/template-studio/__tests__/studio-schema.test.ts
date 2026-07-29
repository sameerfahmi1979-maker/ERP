import { describe, expect, it } from "vitest";

import {
  emptyStudioBody,
  parseStudioBodySchema,
  STUDIO_SCHEMA_VERSION,
  type StudioBodySchema,
} from "../schema";
import { validateStudioBody } from "../validate";
import { buildStudioExecutiveLedgerDocument } from "../schema-to-el";

function pmParagraph(text: string, marks?: unknown[]) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
      },
    ],
  };
}

function bodyWith(blocks: StudioBodySchema["blocks"]): StudioBodySchema {
  return { version: STUDIO_SCHEMA_VERSION, direction: "ltr", blocks };
}

describe("parseStudioBodySchema", () => {
  it("accepts an empty body", () => {
    const r = parseStudioBodySchema(emptyStudioBody());
    expect(r.ok).toBe(true);
  });

  it("rejects unknown block kinds", () => {
    const r = parseStudioBodySchema({
      version: 1,
      direction: "ltr",
      blocks: [{ id: "x", kind: "iframe", src: "https://evil" }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects out-of-range spacer heights", () => {
    const r = parseStudioBodySchema(
      bodyWith([{ id: "s1", kind: "spacer", heightPt: 500 } as never])
    );
    expect(r.ok).toBe(false);
  });

  it("rejects wrong schema version", () => {
    const r = parseStudioBodySchema({ version: 99, direction: "ltr", blocks: [] });
    expect(r.ok).toBe(false);
  });
});

describe("validateStudioBody", () => {
  it("accepts registry variables in text and chips", () => {
    const schema = bodyWith([
      {
        id: "p1",
        kind: "paragraph",
        rich: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "This letter certifies that " },
                { type: "bindingToken", attrs: { path: "employee.full_name_en" } },
                { type: "text", text: " ({{employee.employee_code}}) is employed." },
              ],
            },
          ],
        },
      },
    ]);
    const r = validateStudioBody(schema);
    expect(r.ok).toBe(true);
    expect(r.variables).toContain("employee.full_name_en");
    expect(r.variables).toContain("employee.employee_code");
  });

  it("rejects variables not in the registry", () => {
    const schema = bodyWith([
      { id: "h1", kind: "heading", text: "Hello {{secret.password}}", level: 1, align: "left" },
    ]);
    const r = validateStudioBody(schema);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("secret.password");
  });

  it("rejects variables outside the per-output allowlist", () => {
    const schema = bodyWith([
      { id: "h1", kind: "heading", text: "For {{employee.full_name_en}}", level: 2, align: "left" },
    ]);
    const r = validateStudioBody(schema, { outputAllowlist: ["employee.employee_code"] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("not allowlisted");
  });

  it("rejects disallowed ProseMirror nodes (script-style injection)", () => {
    const schema = bodyWith([
      {
        id: "p1",
        kind: "paragraph",
        rich: { type: "doc", content: [{ type: "htmlBlock", html: "<script>x()</script>" }] },
      },
    ]);
    const r = validateStudioBody(schema);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("htmlBlock");
  });

  it("rejects unsafe textStyle values", () => {
    const schema = bodyWith([
      {
        id: "p1",
        kind: "paragraph",
        rich: pmParagraph("Styled", [
          { type: "textStyle", attrs: { fontSize: 96, color: "url(javascript:alert(1))" } },
        ]),
      },
    ]);
    const r = validateStudioBody(schema);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("font size"))).toBe(true);
    expect(r.errors.some((e) => e.includes("color"))).toBe(true);
  });

  it("rejects disallowed marks", () => {
    const schema = bodyWith([
      {
        id: "p1",
        kind: "paragraph",
        rich: pmParagraph("Linked", [{ type: "link", attrs: { href: "https://evil" } }]),
      },
    ]);
    const r = validateStudioBody(schema);
    expect(r.ok).toBe(false);
  });
});

describe("buildStudioExecutiveLedgerDocument", () => {
  const values = {
    "employee.full_name_en": "John Fixture",
    "employee.employee_code": "EMP-001",
  };

  it("maps blocks to EL sections with token substitution", () => {
    const schema = bodyWith([
      { id: "h1", kind: "heading", text: "Certificate for {{employee.full_name_en}}", level: 1, align: "center" },
      { id: "kv1", kind: "key_value", rows: [{ label: "Employee No", value: "{{employee.employee_code}}" }] },
      { id: "d1", kind: "divider" },
      { id: "sp1", kind: "spacer", heightPt: 12 },
      {
        id: "t1",
        kind: "table",
        headers: ["Item", "Qty"],
        rows: [["Helmet", "1"]],
        showHeader: true,
      },
    ]);

    const doc = buildStudioExecutiveLedgerDocument({
      schema,
      bindingValues: values,
      documentTitle: "Demo Certificate",
    });

    expect(doc.sections).toHaveLength(5);
    const heading = doc.sections[0] as { richHtml?: string };
    expect(heading.richHtml).toContain("John Fixture");
    expect(heading.richHtml).toContain("text-align:center");
    const kv = doc.sections[1] as { rows: { value: string }[] };
    expect(kv.rows[0].value).toBe("EMP-001");
    const spacer = doc.sections[3] as { richHtml?: string };
    expect(spacer.richHtml).toContain("height:12pt");
  });

  it("keeps unresolved tokens visible instead of fabricating values", () => {
    const schema = bodyWith([
      { id: "h1", kind: "heading", text: "{{employee.designation}}", level: 2, align: "left" },
    ]);
    const doc = buildStudioExecutiveLedgerDocument({
      schema,
      bindingValues: {},
      documentTitle: "Demo",
    });
    const heading = doc.sections[0] as { richHtml?: string };
    expect(heading.richHtml).toContain("{{employee.designation}}");
  });

  it("auto-numbers clauses in document order", () => {
    const schema = bodyWith([
      { id: "c1", kind: "clause", title: "Scope", rich: pmParagraph("First") },
      { id: "p1", kind: "paragraph", rich: pmParagraph("Middle") },
      { id: "c2", kind: "clause", title: "Term", rich: pmParagraph("Second") },
    ]);
    const doc = buildStudioExecutiveLedgerDocument({
      schema,
      bindingValues: {},
      documentTitle: "Demo",
    });
    const c1 = doc.sections[0] as { richHtml?: string };
    const c2 = doc.sections[2] as { richHtml?: string };
    expect(c1.richHtml).toContain("1. Scope");
    expect(c2.richHtml).toContain("2. Term");
  });

  it("escapes HTML in heading text", () => {
    const schema = bodyWith([
      { id: "h1", kind: "heading", text: "<img src=x onerror=alert(1)>", level: 1, align: "left" },
    ]);
    const doc = buildStudioExecutiveLedgerDocument({
      schema,
      bindingValues: {},
      documentTitle: "Demo",
    });
    const heading = doc.sections[0] as { richHtml?: string };
    expect(heading.richHtml).not.toContain("<img");
    expect(heading.richHtml).toContain("&lt;img");
  });

  it("uses repeat data for repeat-bound tables", () => {
    const schema = bodyWith([
      {
        id: "t1",
        kind: "table",
        headers: ["Item", "Qty"],
        rows: [],
        repeatBinding: "ppe_items",
        showHeader: true,
      },
    ]);
    const doc = buildStudioExecutiveLedgerDocument({
      schema,
      bindingValues: {},
      documentTitle: "Demo",
      repeatData: { ppe_items: [["Safety Boots", "1"], ["Hi-Vis Vest", "2"]] },
    });
    const table = doc.sections[0] as { rows: string[][] };
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0][0]).toBe("Safety Boots");
  });

  it("sets RTL direction and QR placeholder when no verification is passed", () => {
    const schema: StudioBodySchema = { version: 1, direction: "rtl", blocks: [] };
    const doc = buildStudioExecutiveLedgerDocument({
      schema,
      bindingValues: {},
      documentTitle: "شهادة",
    });
    expect(doc.direction).toBe("rtl");
    expect(doc.qrPlaceholder).toBe(true);
  });
});
