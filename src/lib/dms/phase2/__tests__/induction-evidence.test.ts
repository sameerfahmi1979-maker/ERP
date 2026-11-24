import { describe, expect, it } from "vitest";
import { readInductionLayout } from "../induction-evidence";

const typeCode = "ADNOC_INDUCTION";
const academyTitle = "Offshore Induction + ADNOC Life Saving Rules";
const holder = "EXAMPLE CERTIFICATE HOLDER";
const bounds = [0, 0, 828, 612] as const;
const original = (text: string) => ({ page: 1, text, method: "pdf-native" });
const rendered = (text: string, page = 1) => ({ page, text, method: "tesseract-training-page-ocr", bounds });
const academyRead = [
  "CERTIFICATE OF COMPLETION",
  "ADNOC Technical Academy",
  "This is to certify that",
  holder,
  "has attended and completed",
  academyTitle,
  "Certificate Number: CERT-0111",
  "Date of Issue: 21 May 2024",
  "Date of Expiry: 20 May 2026",
].join("\n");
const unlabelledOverlay = original([holder, academyTitle, "CERT-0111", "21 May 2024", "20 May 2026"].join("\n"));
const gtscTitle = "ADNOC OFFSHORE HSE INDUCTION";
const gtsc = original([
  holder,
  "Who has completed a one day course in",
  gtscTitle,
  "ID Card No :.................. 784000000000000",
  "Certificate No :................. 001777",
  "Date of Issue :...................... 12 Oct 2024",
  "Date of Expiry :..................... 11 Oct 2026           Authorized Signatory",
  "Attended Day(s) :...................... 10 Oct 2024",
  "ACTVET License No 1449/2014",
].join("\n"));

describe("ADNOC induction source proof", () => {
  it("binds Academy labels recovered from the rendered page to values present in the native overlay", () => {
    const proof = readInductionLayout([unlabelledOverlay, rendered(academyRead)], typeCode);
    expect(proof).toMatchObject({
      profileId: "offshore-induction",
      fields: {
        course_title: { value: academyTitle, raw: academyTitle, method: "pdf-native" },
        training_scope: { value: "offshore" },
        provider: { value: "ADNOC Technical Academy", method: "tesseract-training-page-ocr", bounds },
        participant_name: { value: holder, method: "tesseract-training-page-ocr" },
        printed_outcome: { value: "completed", raw: "has attended and completed" },
        certificate_number: { value: "CERT-0111", page: 1 },
        issue_date: { value: "2024-05-21" },
        expiry_date: { value: "2026-05-20" },
      },
    });
    expect(proof?.reasons ?? []).toEqual([]);
  });

  it("ignores unrelated raster objects and collapses matching rereads of the same form", () => {
    const raster = {
      page: 1,
      text: "CERTIFICATE OF COMPLETION\nADNOC Technical Academy\nhas attended and completed",
      method: "tesseract-training-raster-ocr",
      bounds,
    };
    const proof = readInductionLayout([
      unlabelledOverlay,
      raster,
      { ...raster, bounds: [0, 0, 828.0001, 612] },
      { ...raster, text: "ADNOC", bounds: [702, 15, 786, 122] },
    ], typeCode);
    expect(proof?.fields.provider?.value).toBe("ADNOC Technical Academy");
    expect(proof?.fields.certificate_number).toBeUndefined();
    expect(proof?.reasons).not.toContain("induction_supplement_ambiguous");
  });

  it("does not bind a rendered value missing from the original overlay", () => {
    const proof = readInductionLayout([unlabelledOverlay, rendered(academyRead.replace("CERT-0111", "CERT-0999"))], typeCode);
    expect(proof?.fields.certificate_number).toBeUndefined();
    expect(proof?.reasons).toContain("induction_rendered_value_unconfirmed:certificate_number");
    expect(proof?.reasons).toContain("training_labelled_layout_incomplete");
  });

  it("keeps same-source attested licence and dates distinct from identifiers and attendance day", () => {
    const raster = { page: 1, text: "GTSC", method: "tesseract-training-raster-ocr", bounds };
    const proof = readInductionLayout([gtsc, raster], typeCode);
    expect(proof).toMatchObject({
      profileId: "offshore-induction",
      fields: {
        provider: { value: "GTSC", method: "tesseract-training-raster-ocr", bounds },
        participant_name: { value: holder },
        printed_outcome: { value: "completed", raw: "Who has completed a one day course in" },
        course_title: { value: gtscTitle, raw: gtscTitle },
        certificate_number: { value: "001777" },
        issue_date: { value: "2024-10-12" },
        expiry_date: { value: "2026-10-11" },
        course_date: { value: "2024-10-10" },
        provider_licence: { value: "1449/2014", label: "ACTVET License No" },
      },
    });
    expect(proof?.fields).not.toHaveProperty("emirates_id_number");
    expect(proof?.reasons ?? []).toEqual([]);
  });

  it("preserves attendance-only originals in review even when they print a validity date", () => {
    const scanned = { page: 1, text: "Unreadable original OCR", method: "pdf-ocr" };
    const attendance = rendered([
      "Certificate of Attendance",
      `${holder} attended ADNOC Offshore HSE Induction`,
      "Valid Until: 20 May 2026",
    ].join("\n"));
    expect(readInductionLayout([scanned, attendance], typeCode)).toMatchObject({
      profileId: null,
      fields: {},
      reasons: ["induction_attendance_only"],
    });
    expect(readInductionLayout([scanned, { ...attendance, page: 2 }], typeCode)).toBeNull();
    expect(readInductionLayout([scanned, attendance], "TRAINING_ACTIVITY")?.reasons).toEqual(["induction_attendance_only"]);
    expect(readInductionLayout([gtsc], "TRAINING_ACTIVITY")).toBeNull();
  });

  it("keeps attendance activity date and printed valid-until in their own roles", () => {
    const scanned = { page: 1, text: "Unreadable original OCR", method: "pdf-ocr" };
    const attendance = rendered([
      "Emirates Technical & Safety Development Centre", "Certificate of Attendance", `Name: ${holder}`,
      "Has successfully attended ADNOC Offshore HSE Induction on 20.05.2026.",
      "Valid Until: 19.05.2028",
    ].join("\n"));
    const activity = readInductionLayout([scanned, attendance], "TRAINING_ACTIVITY");
    expect(activity).toMatchObject({
      profileId: "training-attendance", limitToProofFields: true, reasons: ["induction_attendance_only"],
      fields: {
        participant_name: { value: holder },
        course_title: { value: "ADNOC Offshore HSE Induction" },
        attendance_status: { value: "attended" },
        activity_date: { value: "2026-05-20" },
        printed_activity_valid_until: { value: "2028-05-19" },
      },
    });
    expect(activity?.fields).not.toHaveProperty("expiry_date");
    expect(activity?.fields).not.toHaveProperty("printed_outcome");
    expect(readInductionLayout([scanned, attendance], typeCode)?.fields).toEqual({});
  });

  it("keeps an attestation and a conflicting onshore or offshore scan in review", () => {
    const substituted = academyRead.replace(academyTitle, "Onshore Induction + ADNOC Life Saving Rules");
    const conflict = readInductionLayout([unlabelledOverlay, rendered(substituted)], typeCode);
    expect(conflict?.reasons).toContain("induction_scope_conflict");
    expect(conflict?.fields.printed_outcome).toBeUndefined();
    const attestation = rendered(academyRead.replace("CERTIFICATE OF COMPLETION", "CERTIFICATE OF ATTESTATION"));
    expect(readInductionLayout([unlabelledOverlay, attestation], typeCode)).toMatchObject({
      profileId: null, fields: {}, reasons: ["induction_attestation_only"],
    });
  });

  it("keeps an unrelated course held even when it prints ADNOC and a completion heading", () => {
    const other = original(academyRead.replace(academyTitle, "WORK MANAGEMENT SYSTEM - FULL ADNOC HSE TRAINING"));
    expect(readInductionLayout([other], typeCode)).toBeNull();
    expect(readInductionLayout([unlabelledOverlay], "ADNOC_OPITO")).toBeNull();
  });
});
