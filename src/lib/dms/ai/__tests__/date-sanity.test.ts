import { describe, it, expect } from "vitest";
import { applyDateSanityCorrections } from "../date-sanity";
import type { DmsAiOutput, DmsExtractedField } from "../types";

function makeOutput(overrides?: {
  issueDate?: string | null;
  expiryDate?: string | null;
  fields?: DmsExtractedField[];
}): DmsAiOutput {
  return {
    classification: {
      suggestedTypeCode: "EMIRATES_ID",
      suggestedTypeId: null,
      confidenceScore: 0.95,
      confidenceLabel: "high",
      reason: "test",
    },
    extraction: {
      fields: overrides?.fields ?? [],
      additionalFields: [],
      suggestedTitle: null,
      suggestedDescription: null,
      issueDateSuggestion: overrides?.issueDate ?? null,
      expiryDateSuggestion: overrides?.expiryDate ?? null,
      fullTextTranscription: null,
    },
    suggestedLinks: [],
    detectedEntities: [],
    warnings: [],
  };
}

function dateField(fieldCode: string, value: string, snippet: string | null = null): DmsExtractedField {
  return {
    fieldCode,
    value,
    confidenceScore: 0.9,
    confidenceLabel: "high",
    sourceSnippet: snippet,
  };
}

describe("applyDateSanityCorrections — document-level suggestions", () => {
  it("swaps inverted issue/expiry dates (Emirates ID swap bug)", () => {
    const output = makeOutput({ issueDate: "2028-04-28", expiryDate: "2024-04-29" });
    applyDateSanityCorrections(output);
    expect(output.extraction.issueDateSuggestion).toBe("2024-04-29");
    expect(output.extraction.expiryDateSuggestion).toBe("2028-04-28");
    expect(output.warnings.some((w) => w.includes("Auto-corrected"))).toBe(true);
  });

  it("leaves correctly ordered dates untouched", () => {
    const output = makeOutput({ issueDate: "2024-04-29", expiryDate: "2028-04-28" });
    applyDateSanityCorrections(output);
    expect(output.extraction.issueDateSuggestion).toBe("2024-04-29");
    expect(output.extraction.expiryDateSuggestion).toBe("2028-04-28");
    expect(output.warnings).toHaveLength(0);
  });

  it("does nothing when only one date is present", () => {
    const output = makeOutput({ issueDate: null, expiryDate: "2028-04-28" });
    applyDateSanityCorrections(output);
    expect(output.extraction.issueDateSuggestion).toBeNull();
    expect(output.extraction.expiryDateSuggestion).toBe("2028-04-28");
    expect(output.warnings).toHaveLength(0);
  });

  it("does nothing when a date is unparseable", () => {
    const output = makeOutput({ issueDate: "unknown", expiryDate: "2020-01-01" });
    applyDateSanityCorrections(output);
    expect(output.extraction.issueDateSuggestion).toBe("unknown");
    expect(output.warnings).toHaveLength(0);
  });
});

describe("applyDateSanityCorrections — metadata field level", () => {
  it("swaps inverted issue_date/expiry_date field values including snippets", () => {
    const output = makeOutput({
      fields: [
        dateField("issue_date", "2028-04-28", "Expiry Date 28/04/2028"),
        dateField("expiry_date", "2024-04-29", "Issuing Date 29/04/2024"),
      ],
    });
    applyDateSanityCorrections(output);
    const issue = output.extraction.fields.find((f) => f.fieldCode === "issue_date")!;
    const expiry = output.extraction.fields.find((f) => f.fieldCode === "expiry_date")!;
    expect(issue.value).toBe("2024-04-29");
    expect(issue.sourceSnippet).toBe("Issuing Date 29/04/2024");
    expect(expiry.value).toBe("2028-04-28");
    expect(expiry.sourceSnippet).toBe("Expiry Date 28/04/2028");
    expect(output.warnings.some((w) => w.includes("issue_date"))).toBe(true);
  });

  it("handles DD/MM/YYYY field values", () => {
    const output = makeOutput({
      fields: [
        dateField("issue_date", "28/04/2028"),
        dateField("expiry_date", "29/04/2024"),
      ],
    });
    applyDateSanityCorrections(output);
    expect(output.extraction.fields[0].value).toBe("29/04/2024");
    expect(output.extraction.fields[1].value).toBe("28/04/2028");
  });

  it("leaves correctly ordered field values untouched", () => {
    const output = makeOutput({
      fields: [
        dateField("issue_date", "2024-04-29"),
        dateField("expiry_date", "2028-04-28"),
      ],
    });
    applyDateSanityCorrections(output);
    expect(output.extraction.fields[0].value).toBe("2024-04-29");
    expect(output.extraction.fields[1].value).toBe("2028-04-28");
    expect(output.warnings).toHaveLength(0);
  });
});
