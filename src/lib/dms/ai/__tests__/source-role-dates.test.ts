import { describe, expect, it } from "vitest";
import { buildCombinedPrompt, PROMPT_VERSION, SOURCE_ROLE_PROMPT_VERSION } from "../prompt-builders";
import { validateAiOutput } from "../result-validator";

const sourceRoles = "source_roles";

function parse(raw: Record<string, unknown>) {
  const result = validateAiOutput(JSON.stringify(raw), sourceRoles);
  expect(result.ok).toBe(true);
  return result.output!;
}

describe("source-role AI Fill dates", () => {
  it("has distinct prompt provenance and asks for printed roles without fallback inference", () => {
    const legacy = buildCombinedPrompt("", [], [], null).systemPrompt;
    const strict = buildCombinedPrompt("", [], [], null, [], undefined, undefined, sourceRoles).systemPrompt;
    expect(SOURCE_ROLE_PROMPT_VERSION).toBe("v3.7-source-dates");
    expect(SOURCE_ROLE_PROMPT_VERSION).not.toBe(PROMPT_VERSION);
    expect(legacy).toContain("expiry date minus 5 years");
    expect(strict).toContain("printed date role");
    expect(strict).toContain("entry deadline");
    expect(strict).not.toMatch(/expiry date minus|the EARLIER date is|if future|MM\/YYYY → YYYY-MM-01/u);
  });

  it("keeps course, award and entry dates separate when the top-level roles were absent", () => {
    const output = parse({
      fields: ["start_date", "end_date", "course_date", "award_date", "entry_deadline"].map(field_code =>
        ({ field_code, value: "2027-03-01", confidence_score: 1 })),
    });
    expect(output.extraction.issueDateSuggestion).toBeNull();
    expect(output.extraction.expiryDateSuggestion).toBeNull();
    expect(output.extraction.fields.map(field => field.fieldCode)).toEqual([
      "start_date", "end_date", "course_date", "award_date", "entry_deadline",
    ]);
  });

  it("accepts separately returned full dates and does not invent days", () => {
    const output = parse({ suggested_issue_date: "17/04/2026", suggested_expiry_date: "2029-04-16" });
    expect(output.extraction.issueDateSuggestion).toBe("2026-04-17");
    expect(output.extraction.expiryDateSuggestion).toBe("2029-04-16");
    const missingDays = parse({ suggested_issue_date: "02/2027", suggested_expiry_date: "2027-02-29" });
    expect(missingDays.extraction.issueDateSuggestion).toBeNull();
    expect(missingDays.extraction.expiryDateSuggestion).toBeNull();
  });

  it("holds chronology conflicts without exchanging values or source snippets", () => {
    const output = parse({
      suggested_issue_date: "2028-04-28",
      suggested_expiry_date: "2024-04-29",
      fields: [
        { field_code: "issue_date", value: "2028-04-28", confidence_score: 1, source_snippet: "Issuing Date 28/04/2028" },
        { field_code: "expiry_date", value: "2024-04-29", confidence_score: 1, source_snippet: "Expiry Date 29/04/2024" },
      ],
    });
    expect(output.extraction.issueDateSuggestion).toBe("2028-04-28");
    expect(output.extraction.expiryDateSuggestion).toBe("2024-04-29");
    expect(output.extraction.fields.map(field => [field.value, field.sourceSnippet])).toEqual([
      ["2028-04-28", "Issuing Date 28/04/2028"],
      ["2024-04-29", "Expiry Date 29/04/2024"],
    ]);
    expect(output.classification.needsHumanReview).toBe(true);
    expect(output.warnings).toContain("Reported issue and expiry dates conflict. Verify their printed roles.");
  });
});
