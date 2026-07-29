import { describe, expect, it } from "vitest";

import { runTemplateSecurityReview } from "../security-review";

const validStudioBody = {
  version: 1,
  direction: "ltr",
  blocks: [
    { id: "h1", kind: "heading", text: "For {{employee.full_name_en}}", level: 1, align: "center" },
    {
      id: "p1",
      kind: "paragraph",
      rich: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "bindingToken", attrs: { path: "employee.employee_code" } }],
          },
        ],
      },
    },
  ],
};

describe("runTemplateSecurityReview — studio bodies (OUTPUT.3B)", () => {
  it("passes a clean studio body", () => {
    const r = runTemplateSecurityReview({
      body_schema_json: validStudioBody,
    });
    expect(r.findings.filter((f) => f.field === "body_schema_json")).toHaveLength(0);
    expect(r.passed).toBe(true);
  });

  it("blocks a structurally invalid studio body", () => {
    const r = runTemplateSecurityReview({
      body_schema_json: { version: 1, direction: "ltr", blocks: [{ id: "x", kind: "iframe" }] },
    });
    expect(r.passed).toBe(false);
    expect(r.findings.some((f) => f.rule === "studio_schema_invalid")).toBe(true);
  });

  it("blocks disallowed nodes and non-registry variables", () => {
    const r = runTemplateSecurityReview({
      body_schema_json: {
        version: 1,
        direction: "ltr",
        blocks: [
          { id: "h1", kind: "heading", text: "{{secret.password}}", level: 1, align: "left" },
          {
            id: "p1",
            kind: "paragraph",
            rich: { type: "doc", content: [{ type: "htmlBlock", html: "<script>x()</script>" }] },
          },
        ],
      },
    });
    expect(r.passed).toBe(false);
    const excerpts = r.findings.map((f) => f.excerpt).join(" ");
    expect(excerpts).toContain("secret.password");
    expect(excerpts).toContain("htmlBlock");
  });

  it("does not run the studio branch when body_schema_json is absent", () => {
    const r = runTemplateSecurityReview({ body_html_en: "<p>Hello</p>" });
    expect(r.findings.filter((f) => f.field === "body_schema_json")).toHaveLength(0);
  });
});
