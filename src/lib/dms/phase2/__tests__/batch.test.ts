import { describe, expect, it } from "vitest";
import { analyzePhase2Source, reviewSavedMatches, type SourceEntry } from "../batch";
import { PHASE2_CATALOG } from "../catalog";

const hash = "a".repeat(64);
const source: SourceEntry = { sourceId: "ALGT-1", relativePath: "permit.pdf", sha256: hash, status: "readable", pages: [{
  page: 1, method: "retained-ocr", text: `[Front]
State of Qatar
Residency Permit
ID.No: 20000000001
Expiry: 12/02/2027
Name: Example Holder
[Back]
Passport Number: AB012345
Passport Expiry: 12/05/2036
Serial No: 31320000000001
Residency Type: عمل`,
}] };

describe("Phase 2 review-only batches", () => {
  it("uses the Qatar evidence reader and gives both expiries and identifiers their printed roles", () => {
    const result = analyzePhase2Source(source);
    expect(result.typeCode).toBe("FOREIGN_IMMIGRATION_CREDENTIAL");
    expect(result.fields).toMatchObject({
      permit_expiry_date: { value: "2027-02-12", page: 1, region: "front" },
      supporting_passport_expiry_date: { value: "2036-05-12", page: 1, region: "reverse" },
      qatar_personal_id: { value: "20000000001" }, permit_card_serial: { value: "31320000000001" },
    });
    expect(result.fields).not.toHaveProperty("visa_number");
    expect(result.proposedFilename).toContain("Example_holder");
    expect(result.proposedFilename).not.toContain("20000000001");
    expect(result).toHaveProperty("catalogVersion", PHASE2_CATALOG.version);
  });

  it("holds a missing reverse instead of applying generic profile rules", () => {
    const result = analyzePhase2Source({ ...source, pages: [{ ...source.pages[0], text: source.pages[0].text.split("[Back]")[0] }] });
    expect(result.outcome).toBe("held");
    expect(result.fields).not.toHaveProperty("permit_card_serial");
  });

  it("holds a combined passport and Emirates ID credential packet", () => {
    const result = analyzePhase2Source({ ...source, pages: [
      { page: 1, method: "text", text: "PASSPORT\nP<UTOEXAMPLE<<TEST<<<<<<<<<<<<<<<<<<<<<<<<<<<<" },
      { page: 2, method: "text", text: "Emirates ID\n784-1990-0000001-0" },
    ] });
    expect(result.reasons).toContain("mixed_passport_and_emirates_id");
    expect(result.outcome).toBe("held");
  });

  it("compares exact originals in ALGT and quarantines any cross-company match", () => {
    const result = analyzePhase2Source(source);
    const foreign = { id: 5, owningCompanyId: 2, documentNo: "TEST-05", sha256: hash, typeCode: "RESIDENCE_VISA", metadataKeys: [], tagCodes: [] };
    expect(reviewSavedMatches(source, result, [foreign])).toEqual([]);
    expect(reviewSavedMatches(source, result, [{ ...foreign, owningCompanyId: 1 }])).toEqual([expect.objectContaining({
      documentNo: "TEST-05", match: "current_original", suggestedType: "FOREIGN_IMMIGRATION_CREDENTIAL",
      missingMetadataKeys: expect.arrayContaining(["qatar_personal_id", "permit_expiry_date"]),
    })]);
  });

  it("keeps the medical certificate and test pages together and reads the outcome from the certificate only", () => {
    const result = analyzePhase2Source({ ...source, pages: [
      { page: 1, method: "text", text: "Medical Fitness Certificate\nClinic: Top Care Medical Centre\nPatient Name: Example Holder\nWork Scope: offshore\nSigned Fitness Conclusion: fit" },
      { page: 2, method: "text", text: "Supporting blood test\nPatient Name: Example Holder\nResult: follow-up required" },
    ] });
    expect(result.profileId).toBe("medical-fitness");
    expect(result.packet).toEqual({ certificatePages: [1], supportingPages: [2] });
    expect(result.fields.selected_fitness_outcome).toMatchObject({ page: 1, value: "fit" });
  });

  it("prepares an Indian passport by agreeing on issuer while keeping printed dates and nationality separate", () => {
    const result = analyzePhase2Source({ ...source, pages: [{ page: 1, method: "text", text: [
      "Passport", "Republic of India", "Holder Name: Example Holder", "Nationality: Pakistan",
      "Passport Number: L898902C3", "Date of Birth: 12/08/1974", "Date of Expiry: 15/04/2012",
      "P<INDERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<", "L898902C36PAK7408122F1204159ZE184226B<<<<<10",
    ].join("\n") }] });
    expect(result.profileId).toBe("passport-in");
    expect(result.fields.issuer_country?.value).toBe("IN");
    expect(result.fields.nationality?.value).toBe("Pakistan");
    expect(result.fields.date_of_birth?.value).toBe("1974-08-12");
    expect(result.outcome).toBe("prepared");
  });

  it("withholds proposed edits for a historical original or an ambiguous saved record match", () => {
    const result = analyzePhase2Source(source);
    const saved = { id: 5, owningCompanyId: 1, documentNo: "TEST-05", sha256: hash, typeCode: "RESIDENCE_VISA", metadataKeys: [], tagCodes: [] };
    const historical = reviewSavedMatches(source, result, [{ ...saved, sha256: null, originalSha256s: [hash] }]);
    const multiple = reviewSavedMatches(source, result, [saved, { ...saved, id: 6, documentNo: "TEST-06" }]);
    expect(historical[0]).toMatchObject({ match: "historical_original", suggestedType: null, proposedMetadataKeys: [] });
    expect(multiple).toHaveLength(2);
    expect(multiple.every(item => !item.suggestedType && !item.proposedMetadataKeys.length)).toBe(true);
  });
});
