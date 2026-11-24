import { describe, expect, it } from "vitest";
import { resolveStandardFileName } from "../resolve-standard-file-name";

const sample = {
  typeCode: "RESIDENCE_VISA",
  requiresExpiryTracking: true,
  originalFilename: "SharePoint_copy.pdf",
  expiryDate: "2027-02-12",
  extractedFields: { holder_name_en: "Test Holder", passport_number: "PP1234567" },
};

describe("Residence Visa standard file name", () => {
  it("uses the holder field and leaves a missing visa reference unknown", () => {
    expect(resolveStandardFileName({
      ...sample,
      aiOwnerHints: { suggestedDescription: "ID: 12345678900" },
    })).toBe("Residence_Visa_Test_holder_DMS-Unknown_2027-02-12.pdf");
  });

  it("uses a reviewed holder and visa number ahead of AI values", () => {
    expect(resolveStandardFileName({
      ...sample,
      metadataValues: { holder_name_en: "Reviewed Holder", visa_number: "V-0123456" },
    })).toBe("Residence_Visa_Reviewed_holder_V-0123456_2027-02-12.pdf");
  });

  it("preserves the approved DMS identifier or an explicit filename", () => {
    expect(resolveStandardFileName({ ...sample, documentNo: "DMS-2026-000762" }))
      .toBe("Residence_Visa_Test_holder_DMS-000762_2027-02-12.pdf");
    expect(resolveStandardFileName({ ...sample, standardFileNameOverride: "Officer choice.pdf" }))
      .toBe("Officer choice.pdf");
  });
});
