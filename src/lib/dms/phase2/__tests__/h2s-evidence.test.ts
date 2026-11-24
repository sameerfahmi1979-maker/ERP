import { describe, expect, it } from "vitest";
import { readH2sLayout } from "../h2s-evidence";
import type { SourcePage } from "../batch";

const typeCode = "H2S_TRAINING_CERTIFICATE";
const overlay = [
  "SAMPLE LEARNER",
  "",
  "        H2S Training Level 2",
  "Emirates ID: 784-1999-0000000-0",
  "Certificate No: ATA-TEST-2025",
  "Date of Issue: 5 February 2025",
  "Date of Expiry: 4 February 2027",
].join("\n");
const original = (text = overlay): SourcePage => ({ page: 1, method: "pdf-native", text });
const visible: Parameters<typeof readH2sLayout>[0] = [
  { page: 1, method: "tesseract-training-raster-ocr", region: "h2s-heading", bounds: [120, 159, 600, 278],
    text: "CERTIFICATE\nOF COMPLETION" },
  { page: 1, method: "tesseract-training-raster-ocr", region: "h2s-outcome", bounds: [121, 326, 320, 350],
    text: "\nhas attended and completed" },
  { page: 1, method: "tesseract-training-raster-ocr", region: "h2s-provider", bounds: [641, 550, 797, 576],
    text: "ADNOC Technical Academy" },
];

describe("readH2sLayout", () => {
  it("verifies title, printed dates and completion against separate evidence from the same page", () => {
    const proof = readH2sLayout([original(), ...visible], typeCode);
    expect(proof?.profileId).toBe("h2s-training");
    expect(proof?.reasons ?? []).toEqual([]);
    expect(proof?.fields.participant_name).toMatchObject({ value: "SAMPLE LEARNER", method: "pdf-native", page: 1, line: 1 });
    expect(proof?.fields.certificate_number).toMatchObject({ value: "ATA-TEST-2025", method: "pdf-native", page: 1, line: 5 });
    expect(proof?.fields.issue_date.value).toBe("2025-02-05");
    expect(proof?.fields.expiry_date.value).toBe("2027-02-04");
    expect(proof?.fields.course_title.value).toBe("H2S Training Level 2");
    expect(proof?.fields.provider).toMatchObject({
      value: "ADNOC Technical Academy", raw: "ADNOC Technical Academy", line: 1, page: 1,
      region: "h2s-provider", bounds: [641, 550, 797, 576],
    });
    expect(proof?.fields.printed_outcome).toMatchObject({
      value: "completed", raw: "has attended and completed", line: 2, page: 1,
      region: "h2s-outcome", bounds: [121, 326, 320, 350],
    });
    expect(proof?.fields.award_date).toBeUndefined();
  });

  it("defers to the existing reader without complete original-bound region proof", () => {
    expect(readH2sLayout([original()], typeCode)).toBeNull();
    expect(readH2sLayout([original(), ...visible.slice(0, 2), { ...visible[2], page: 2 }], typeCode)).toBeNull();
    expect(readH2sLayout([original(), ...visible, visible[2]], typeCode)).toBeNull();
    expect(readH2sLayout([original(), ...visible.slice(0, 2), { ...visible[2], bounds: visible[1].bounds }], typeCode)).toBeNull();
    expect(readH2sLayout([original(), ...visible, { ...original(), page: 2 }], typeCode)).toBeNull();
    expect(readH2sLayout([original(overlay.replace("Level 2", "Level 1")), ...visible], typeCode)).toBeNull();
  });

  it("traces the exact Academy line when the upper logo produces an extra OCR row", () => {
    const withLogo = { ...visible[2], text: "Logo OCR artifact\r\nADNOC Technical Academy" };
    const proof = readH2sLayout([original(), ...visible.slice(0, 2), withLogo], typeCode);
    expect(proof?.reasons ?? []).toEqual([]);
    expect(proof?.fields.provider).toMatchObject({ raw: "ADNOC Technical Academy", line: 2, bounds: visible[2].bounds });
    expect(readH2sLayout([original(), ...visible.slice(0, 2), { ...withLogo, text: "Not ADNOC Technical Academy" }], typeCode)).toBeNull();
    expect(readH2sLayout([original(), ...visible.slice(0, 2), { ...withLogo, text: "ADNOC Technical Academy\nADNOC Technical Academy" }], typeCode)).toBeNull();
  });

  it("holds assessments and OPITO Basic under a conflicting Level 2 type suggestion", () => {
    const assessed = readH2sLayout([original(), visible[0], { ...visible[1], text: "has successfully passed an assessment" }, visible[2]], typeCode);
    expect(assessed?.fields.printed_outcome).toBeUndefined();
    expect(assessed?.reasons).toContain("h2s_completion_conflicts_with_assessment_or_attendance");
    const basic = original("Basic H2S Training\nOPITO-approved standard");
    expect(readH2sLayout([basic], typeCode)).toMatchObject({ fields: {}, reasons: ["h2s_opito_basic_distinct_award"] });
    expect(readH2sLayout([basic], "ADNOC_OPITO")).toBeNull();
  });

  it("binds printed labels recovered by an independent display read to exact original overlay values", () => {
    const native = original("SAMPLE LEARNER\nH2S Training Level 2\nATA-TEST-2025\n5 February 2025\n4 February 2027");
    const display = {
      page: 1, method: "tesseract-training-raster-ocr", region: "h2s-labelled-overlay", bounds: [0, 0, 840, 600] as const,
      text: "CERTIFICATE OF COMPLETION\nThis certifies that\nSAMPLE LEARNER\nhas attended and completed\nH2S Training Level 2\nCertificate No: ATA-TEST-2025\nDate of Issue: 5 February 2025\nDate of Expiry: 4 February 2027",
    };
    const proof = readH2sLayout([native, ...visible, display], typeCode);
    expect(proof).toMatchObject({
      fields: {
        participant_name: { value: "SAMPLE LEARNER", method: display.method, bounds: display.bounds },
        certificate_number: { value: "ATA-TEST-2025", label: "Certificate No" },
        issue_date: { value: "2025-02-05" },
        expiry_date: { value: "2027-02-04" },
      },
      limitToProofFields: true,
    });
    expect(proof?.reasons).toBeUndefined();
    const conflict = readH2sLayout([native, ...visible, { ...display, text: display.text.replace("4 February 2027", "4 February 2028") }], typeCode);
    expect(conflict?.fields.expiry_date).toBeUndefined();
    expect(conflict?.reasons).toContain("h2s_labelled_overlay_value_unconfirmed:expiry_date");
  });

  it("keeps missing or reversed explicit expiry held without deriving it from validity duration", () => {
    const unreadable = readH2sLayout([original(overlay.replace("Date of Expiry: 4 February 2027", "Valid for 2 years")), ...visible], typeCode);
    expect(unreadable?.fields.expiry_date).toBeUndefined();
    expect(unreadable?.reasons).toContain("h2s_expiry_not_independently_printed");
    const reversed = readH2sLayout([original(overlay.replace("4 February 2027", "4 February 2025")), ...visible], typeCode);
    expect(reversed?.fields.expiry_date).toBeUndefined();
    expect(reversed?.reasons).toContain("h2s_expiry_not_after_issue");
  });
});
