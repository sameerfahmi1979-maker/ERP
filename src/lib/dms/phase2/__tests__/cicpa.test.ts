import { describe, expect, it } from "vitest";
import { parseCicpaEvidence, readCicpaLayout, type CicpaEvidenceRegion } from "../cicpa";

const LOCATION_LINES = "جميع مواقع الاختبار / م.محطة الاختبار\nم.وحدة الاختبار / م.الساحة";

function fixture(combined = false): CicpaEvidenceRegion[] {
  const reverse = combined ? 1 : 2;
  const entries = [
    { page: 1, region: "authority", text: "الحرس الوطني / NATIONAL GUARD" },
    { page: 1, region: "permit-strip", text: "تصريح دخول بري" },
    { page: 1, region: "holder", text: "حامل تجريبي" },
    { page: 1, region: "sponsor", text: "مؤسسة الاختبار" },
    { page: 1, region: "expiry", text: "٢٥/٠٢/٢٠٣٠" },
    { page: 1, region: "locations", text: LOCATION_LINES },
    { page: reverse, region: "reverse-company", text: "الشركة: ٠٠٩٢" },
    { page: reverse, region: "reverse-pass", text: "الرقم: ٠٠٠٠١٢٣٤٥٦" },
  ] satisfies CicpaEvidenceRegion[];
  return entries.map((entry) => ({ ...entry, cardGroup: "example", method: "verified-transcription" }));
}

describe("CICPA personnel pass evidence", () => {
  it("uses a bounded OCR crop to identify an explicit offshore strip and keeps all locations held", () => {
    const card = { page: 1, bounds: [15, 20, 310, 200] as const, method: "tesseract-card-region-ocr",
      text: "NATIONAL GUARD\nتصريح دخول بحري\nالمواقع المصرح بها\nموقع الاختبار" };
    expect(readCicpaLayout([card], "CICPA_PASS")).toMatchObject({
      profileId: "cicpa-offshore", reasons: ["cicpa_regions_require_verification"],
      fields: { access_scope: { value: "offshore", page: 1, bounds: card.bounds }, issuing_authority: { value: "National Guard" } },
    });
    expect(readCicpaLayout([card], "PERSONNEL_PERMIT_APPLICATION")).toBeNull();
    expect(readCicpaLayout([{ ...card, bounds: undefined }], "CICPA_PASS")).toBeNull();
    expect(readCicpaLayout([{ ...card, text: "NATIONAL GUARD\nبحري" }], "CICPA_PASS")).toEqual({
      profileId: null, fields: {}, reasons: ["cicpa_scope_strip_unreadable"],
    });
    expect(readCicpaLayout([card, { ...card, text: "NATIONAL GUARD\nتصريح دخول بري" }], "CICPA_PASS")).toBeNull();
    expect(readCicpaLayout([card, { page: 2, text: "Security Permit Application" }], "CICPA_PASS")).toBeNull();
  });

  const frontBounds = [100, 120, 260, 380] as const;
  const focusedFront = [
    { page: 1, method: "tesseract-cicpa-front-region-ocr", region: "authority", cardBounds: frontBounds,
      bounds: [104, 128, 255, 166], text: "الحرس الوطني\nNATIONAL GUARD" },
    { page: 1, method: "tesseract-cicpa-front-region-ocr", region: "permit-strip", cardBounds: frontBounds,
      bounds: [110, 301, 251, 330], text: "تصريح دخول بحري" },
    { page: 1, method: "tesseract-cicpa-front-region-ocr", region: "expiry", cardBounds: frontBounds,
      bounds: [124, 287, 237, 317], text: "2031-06-18" },
  ] satisfies CicpaEvidenceRegion[];

  it("binds exact authority, permit wording and red expiry to the same front, without clearing the locations or pairing hold", () => {
    const result = readCicpaLayout(focusedFront, "CICPA_PASS");
    expect(result).toMatchObject({
      profileId: "cicpa-offshore",
      reasons: ["cicpa_regions_require_verification"],
      fields: {
        issuing_authority: { value: "National Guard", bounds: focusedFront[0].bounds },
        printed_permit_strip: { value: "تصريح دخول بحري", bounds: focusedFront[1].bounds },
        expiry_date: { value: "2031-06-18", bounds: focusedFront[2].bounds, side: "front" },
      },
    });
    for (const key of ["cicpa_locations_arabic", "company_registration_number", "pass_number", "holder_name"]) {
      expect(result?.fields).not.toHaveProperty(key);
    }
  });

  it("does not reuse a date from another card frame or infer the scope from an authority-only crop", () => {
    const wrongFrame = { ...focusedFront[2], cardBounds: [81, 100, 280, 379] as const };
    const result = readCicpaLayout([...focusedFront.slice(0, 2), wrongFrame], "CICPA_PASS");
    expect(result?.fields).not.toHaveProperty("expiry_date");
    expect(readCicpaLayout([focusedFront[0], focusedFront[2]], "CICPA_PASS")).toMatchObject({
      profileId: null, reasons: ["cicpa_scope_strip_unreadable"],
    });
  });

  it("holds inconsistent expiry readings and refuses a mismatched reverse crop", () => {
    const extraExpiry = { ...focusedFront[2], text: "2031-06-19" };
    const reverse = {
      page: 1, method: "tesseract-card-region-ocr", bounds: [20, 10, 190, 280] as const,
      text: "NATIONAL GUARD\nالشركة: 0014\nالرقم: 0000000005",
    };
    const result = readCicpaLayout([reverse, ...focusedFront, extraExpiry], "CICPA_PASS");
    expect(result).toMatchObject({ profileId: "cicpa-offshore", reasons: ["cicpa_regions_require_verification", "cicpa_front_expiry_conflicting"] });
    expect(result?.fields).not.toHaveProperty("expiry_date");
    expect(result?.fields).not.toHaveProperty("pass_number");
    expect(result?.fields).not.toHaveProperty("company_registration_number");
  });

  it("retains multi-line onshore Arabic, typed expiry, and the two reverse identifiers", () => {
    const result = parseCicpaEvidence(fixture());
    expect(result.issues).toEqual([]);
    expect(result).toMatchObject({
      status: "verified",
      variant: "onshore",
      fields: {
        permitStrip: { value: "تصريح دخول بري" },
        expiry: { value: "2030-02-25", evidence: { page: 1, region: "expiry" } },
        locationsArabic: {
          value: LOCATION_LINES,
          evidence: { page: 1, region: "locations", method: "verified-transcription", side: "front" },
        },
        companyNumber: { value: "0092", evidence: { page: 2, region: "reverse-company", side: "reverse" } },
        passNumber: { value: "0000123456", evidence: { page: 2, region: "reverse-pass", side: "reverse" } },
      },
    });
  });

  it("accepts a combined card and keeps offshore group wording unchanged", () => {
    const groupText = "جميع م.المجموعة الأولى / جميع م.المجموعة الثانية";
    const evidence = fixture(true).map((entry) => {
      if (entry.region === "permit-strip") return { ...entry, text: "تصريح دخول بحري" };
      if (entry.region === "locations") return { ...entry, text: groupText };
      return entry;
    });
    expect(parseCicpaEvidence(evidence)).toMatchObject({
      status: "verified",
      variant: "offshore",
      fields: { locationsArabic: { value: groupText } },
    });
  });

  it("keeps verified offshore explicit sites without adding a group qualifier", () => {
    const text = "م.الموقع الأول / م.الموقع الثاني / م.الموقع الثالث";
    const evidence = fixture().map((entry) => {
      if (entry.region === "permit-strip") return { ...entry, text: "تصريح دخول بحري" };
      if (entry.region === "locations") return { ...entry, text };
      return entry;
    });
    expect(parseCicpaEvidence(evidence)).toMatchObject({
      status: "verified",
      variant: "offshore",
      fields: { locationsArabic: { value: text } },
    });
  });

  it("holds an OCR-only scope and preserves a verified strip separately", () => {
    const evidence = fixture().map((entry) =>
      entry.region === "locations" ? { ...entry, method: "local-arabic-ocr" } : entry
    );
    const result = parseCicpaEvidence(evidence);
    expect(result.status).toBe("held");
    expect(result.variant).toBe("onshore");
    expect(result.fields.locationsArabic).toBeUndefined();
    expect(result.issues).toContainEqual({ code: "unverified", region: "locations" });
  });

  it("requires a confirmed match between front and reverse even on a combined scan", () => {
    const evidence = fixture(true).map((entry) =>
      entry.region?.startsWith("reverse-") ? { ...entry, cardGroup: "other" } : entry
    );
    expect(parseCicpaEvidence(evidence)).toMatchObject({
      status: "held",
      issues: [{ code: "unpaired-sides" }],
    });
  });

  it("retains independently verified pass evidence while a paired company value is held", () => {
    const evidence = fixture(true).map((entry) =>
      entry.region === "reverse-company" ? { ...entry, method: "local-arabic-ocr" } : entry
    );
    const result = parseCicpaEvidence(evidence);
    expect(result).toMatchObject({
      status: "held",
      fields: { passNumber: { value: "0000123456", evidence: { page: 1, side: "reverse" } } },
      issues: [{ code: "unverified", region: "reverse-company" }],
    });
    expect(result.fields.companyNumber).toBeUndefined();
  });

  it("holds a conflicting second strip even if the scan labels both from one card", () => {
    const evidence = [
      ...fixture(),
      { page: 3, region: "permit-strip", text: "تصريح دخول بحري", cardGroup: "example", method: "verified-transcription" } satisfies CicpaEvidenceRegion,
    ];
    const result = parseCicpaEvidence(evidence);
    expect(result.status).toBe("held");
    expect(result.variant).toBeNull();
    expect(result.issues).toContainEqual({ code: "conflicting", region: "permit-strip" });
  });

  it("requires recognized authority, exact strip and legible Arabic", () => {
    const evidence = fixture().map((entry) => {
      if (entry.region === "authority") return { ...entry, text: "Another company" };
      if (entry.region === "permit-strip") return { ...entry, text: "Brown card" };
      if (entry.region === "locations") return { ...entry, text: "… / " };
      return entry;
    });
    const result = parseCicpaEvidence(evidence);
    expect(result.status).toBe("held");
    expect(result.variant).toBeNull();
    expect(result.fields.locationsArabic).toBeUndefined();
    expect(result.issues).toEqual(expect.arrayContaining([
      { code: "unsupported", region: "authority" },
      { code: "unsupported", region: "permit-strip" },
      { code: "unreadable", region: "locations" },
    ]));
  });

  it("requires the correct reverse label and rejects an impossible expiry", () => {
    const evidence = fixture().map((entry) => {
      if (entry.region === "expiry") return { ...entry, text: "31/02/2030" };
      if (entry.region === "reverse-company") return { ...entry, text: "الرقم: 123" };
      return entry;
    });
    const result = parseCicpaEvidence(evidence);
    expect(result.status).toBe("held");
    expect(result.fields.expiry).toBeUndefined();
    expect(result.fields.companyNumber).toBeUndefined();
    expect(result.issues).toEqual(expect.arrayContaining([
      { code: "unreadable", region: "expiry" },
      { code: "unreadable", region: "reverse-company" },
    ]));
  });

  it("holds unsegmented page OCR even when it contains a permit phrase", () => {
    const result = parseCicpaEvidence([{ page: 1, text: "تصريح دخول بري\nجميع مواقع الاختبار" }]);
    expect(result.status).toBe("held");
    expect(result.variant).toBeNull();
    expect(result.fields).toEqual({});
  });
});
