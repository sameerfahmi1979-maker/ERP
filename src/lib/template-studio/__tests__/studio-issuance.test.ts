import { describe, expect, it } from "vitest";

import { buildIssuableStudioHtml } from "../issuance";

const goodBody = {
  version: 1,
  direction: "ltr",
  blocks: [
    { id: "h1", kind: "heading", text: "Certificate for {{employee.full_name_en}}", level: 1, align: "center" },
    {
      id: "kv1",
      kind: "key_value",
      rows: [{ label: "Employee No", value: "{{employee.employee_code}}" }],
    },
  ],
};

const values = {
  "employee.full_name_en": "John Fixture",
  "employee.employee_code": "EMP-001",
};

describe("buildIssuableStudioHtml (generation-time gate)", () => {
  it("renders full HTML when everything resolves", () => {
    const r = buildIssuableStudioHtml({
      bodySchemaJson: goodBody,
      bindingValues: values,
      documentTitle: "Employment Certificate",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.html).toContain("John Fixture");
      expect(r.html).toContain("EMP-001");
      expect(r.variables).toContain("employee.employee_code");
    }
  });

  it("refuses generation on invalid schema", () => {
    const r = buildIssuableStudioHtml({
      bodySchemaJson: { version: 1, blocks: [{ kind: "iframe" }] },
      bindingValues: values,
      documentTitle: "X",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.stage).toBe("schema");
  });

  it("refuses generation on validation failure (non-registry variable)", () => {
    const r = buildIssuableStudioHtml({
      bodySchemaJson: {
        version: 1,
        direction: "ltr",
        blocks: [{ id: "h1", kind: "heading", text: "{{secret.password}}", level: 1, align: "left" }],
      },
      bindingValues: values,
      documentTitle: "X",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.stage).toBe("validation");
  });

  it("refuses generation when a variable has no real value (zero-unresolved gate)", () => {
    const r = buildIssuableStudioHtml({
      bodySchemaJson: goodBody,
      bindingValues: { "employee.full_name_en": "John Fixture" }, // missing employee_code
      documentTitle: "Employment Certificate",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.stage).toBe("unresolved_tokens");
      expect(r.errors.join(" ")).toContain("employee.employee_code");
    }
  });

  it("enforces the per-output allowlist at generation time", () => {
    const r = buildIssuableStudioHtml({
      bodySchemaJson: {
        version: 1,
        direction: "ltr",
        blocks: [
          // employee.work_site is registry-valid but NOT in the HR_EXPERIENCE_LETTER studio allowlist
          { id: "h1", kind: "heading", text: "{{employee.work_site}}", level: 1, align: "left" },
        ],
      },
      bindingValues: { "employee.work_site": "DIP" },
      documentTitle: "X",
      outputCode: "HR_EXPERIENCE_LETTER",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.stage).toBe("validation");
  });
});
