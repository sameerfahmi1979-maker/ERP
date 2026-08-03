import { describe, expect, it } from "vitest";
import { extractIdentitySignals, nameTokenOverlap } from "../intake-link-suggester";

describe("nameTokenOverlap (HR.DOCLINK.1A)", () => {
  it("returns 0.95 for exact normalized matches", () => {
    expect(nameTokenOverlap("SAMEER FAHMI", "Sameer Fahmi")).toBe(0.95);
  });

  it("scores spelling-variant names by shared tokens", () => {
    // "Abu Alayan" vs "Abu Elayyan" — 3 of 5 tokens match
    const score = nameTokenOverlap(
      "Sameer Fahmi Ibrahim Abu Alayan",
      "Sameer Fahmi Abu Elayyan"
    );
    expect(score).toBeGreaterThanOrEqual(0.5);
    expect(score).toBeLessThan(0.95);
  });

  it("returns 0 when fewer than 2 tokens match", () => {
    expect(nameTokenOverlap("Gipson Barekye", "Sameer Fahmi Abu Elayyan")).toBe(0);
    expect(nameTokenOverlap("", "Sameer")).toBe(0);
  });
});

describe("extractIdentitySignals (HR.DOCLINK.1A)", () => {
  it("returns empty arrays for null/empty input", () => {
    expect(extractIdentitySignals(null)).toEqual({ names: [], emiratesIds: [], passportNumbers: [] });
    expect(extractIdentitySignals({})).toEqual({ names: [], emiratesIds: [], passportNumbers: [] });
  });

  it("extracts and normalizes an Emirates ID number", () => {
    const r = extractIdentitySignals({ emirates_id_number: "784-1979-1234567-1" });
    expect(r.emiratesIds).toEqual(["784197912345671"]);
  });

  it("extracts passport numbers from passport_number and passport_no keys", () => {
    expect(extractIdentitySignals({ passport_number: "N 1234567" }).passportNumbers).toEqual(["n1234567"]);
    expect(extractIdentitySignals({ passport_no: "P-7654321" }).passportNumbers).toEqual(["p7654321"]);
  });

  it("extracts holder names from known name keys", () => {
    const r = extractIdentitySignals({
      full_name_en: "Sameer Fahmi",
      holder_name: "SAMEER FAHMI",
      visa_holder_name: "Sameer F.",
    });
    expect(r.names).toContain("Sameer Fahmi");
    expect(r.names).toContain("SAMEER FAHMI");
    expect(r.names).toContain("Sameer F.");
  });

  it("ignores sponsor/employer/issuer names", () => {
    const r = extractIdentitySignals({
      sponsor_name: "AL GHURAIR TRADING LLC",
      employer_name: "ALGT",
      issuing_authority: "GDRFA Dubai",
      full_name_en: "Actual Holder",
    });
    expect(r.names).toEqual(["Actual Holder"]);
  });

  it("recurses into __additional_fields (object map shape)", () => {
    const r = extractIdentitySignals({
      title: "Some Doc",
      __additional_fields: { emirates_id_number: "784 2001 7654321 2" },
    });
    expect(r.emiratesIds).toEqual(["784200176543212"]);
  });

  it("parses __additional_fields production array shape ({label,value})", () => {
    const r = extractIdentitySignals({
      full_name_en: "GIPSON BAREKYE",
      __additional_fields: [
        { label: "Passport Number", value: "A00237922", confidence: 0.95 },
        { label: "Full Name (English)", value: "GIPSON BAREKYE", confidence: 0.95 },
        { label: "Emirates ID Number", value: "784-1992-5848378-5", confidence: 0.9 },
        { label: "Profession", value: "Cleaner", confidence: 0.95 },
      ],
    });
    expect(r.passportNumbers).toEqual(["a00237922"]);
    expect(r.emiratesIds).toEqual(["784199258483785"]);
    expect(r.names).toEqual(["GIPSON BAREKYE"]);
  });

  it("rejects too-short identity numbers and non-string values", () => {
    const r = extractIdentitySignals({
      emirates_id_number: "784",
      passport_number: "AB1",
      full_name_en: 42 as unknown as string,
    });
    expect(r.emiratesIds).toEqual([]);
    expect(r.passportNumbers).toEqual([]);
    expect(r.names).toEqual([]);
  });

  it("dedupes repeated values", () => {
    const r = extractIdentitySignals({
      emirates_id_number: "784-1979-1234567-1",
      __additional_fields: { eid_number: "784197912345671" },
    });
    expect(r.emiratesIds).toEqual(["784197912345671"]);
  });
});
