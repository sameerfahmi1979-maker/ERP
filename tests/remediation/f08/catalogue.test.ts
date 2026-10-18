import { describe, it, expect } from "vitest";
import { listOfficialDocumentDefinitions, buildInputsSchema, findMissingDataErrors } from "@/lib/official-documents/registry";
import { officialTemplateCatalogue, officialWordingBlockers } from "@/lib/official-documents/catalogue";

describe("F08 fixed catalogue governance", () => {
  const definitions = listOfficialDocumentDefinitions();
  it("retains fourteen identities, ten technically published and four wording-pending", () => {
    const catalogue = officialTemplateCatalogue();
    expect(catalogue).toHaveLength(14);
    expect(catalogue.filter(def => def.status === "published")).toHaveLength(10);
    expect(catalogue.filter(def => def.status === "disabled_pending_wording")).toHaveLength(4);
    expect(new Set(catalogue.map(def => def.code)).size).toBe(14);
    expect(JSON.stringify(catalogue)).not.toContain('"build"');
  });
  it.each(definitions)("does not invent approval for $documentCode", def => {
    for (const language of def.supportedLanguages) expect(officialWordingBlockers(def, language).length).toBeGreaterThan(0);
  });
  it("returns all missing employee fields together, including non-finite salary", () => {
    const def = definitions.find(def => def.documentCode === "HR_SALARY_CERT_WITH_AMOUNT")!;
    expect(findMissingDataErrors(def, {}).length).toBe(def.requiredSourceFields.length);
    const values = Object.fromEntries(def.requiredSourceFields.map(key => [key, key.includes("salary") ? Infinity : "value"]));
    expect(findMissingDataErrors(def, values).length).toBeGreaterThan(0);
  });
  it("trims required inputs and rejects whitespace-only or undeclared expressions", () => {
    const def = { ...definitions[0], optionalInputs: [{ key: "purpose", labelEn: "Purpose", type: "text" as const, required: true, maxLength: 50 }] };
    expect(buildInputsSchema(def).safeParse({ purpose: "   " }).success).toBe(false);
    expect(buildInputsSchema(def).parse({ purpose: "  Travel  " })).toEqual({ purpose: "Travel" });
    expect(buildInputsSchema(def).safeParse({ purpose: "Travel", html: "<script>" }).success).toBe(false);
  });
});
