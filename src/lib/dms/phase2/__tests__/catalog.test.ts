import { describe, expect, it } from "vitest";
import { PHASE2_CATALOG } from "../catalog";

describe("Phase 2 HR profile catalog", () => {
  it("contains all 56 source purposes, each with unique identity and reviewable evidence", () => {
    const { profiles, version } = PHASE2_CATALOG;
    expect(version).toMatch(/^phase2-hr\.\d+\.\d+\.\d+$/);
    expect(profiles.map((profile) => profile.purposeNumber)).toEqual(
      Array.from({ length: 56 }, (_, index) => index + 1),
    );
    expect(new Set(profiles.map((profile) => profile.id)).size).toBe(56);
    for (const profile of profiles) {
      expect(profile.evidence.length, profile.id).toBeGreaterThan(0);
      expect(profile.fields.length, profile.id).toBeGreaterThan(0);
      expect(new Set(profile.fields.map((field) => field.key)).size, profile.id).toBe(profile.fields.length);
      expect(
        [...profile.positiveMarkers, ...profile.negativeMarkers].every(
          (pattern) => new RegExp(pattern, "iu").source.length > 0,
        ),
        profile.id,
      ).toBe(true);
    }
  });

  it("keeps important boundaries for held layouts and preserves an adjacent verified route", () => {
    const byNumber = new Map(PHASE2_CATALOG.profiles.map((profile) => [profile.purposeNumber, profile]));
    for (const number of [18, 21, 38, 44, 49, 54, 55, 56]) {
      expect(byNumber.get(number)?.status).toEqual("held");
      expect(byNumber.get(number)?.holdReason).toBeTruthy();
    }
    expect(byNumber.get(27)?.typeCode).toEqual("EJARI_CONTRACT");
    expect(byNumber.get(27)?.holds.join(" ")).toMatch(/non-Ejari/i);
    expect(byNumber.get(21)?.holds.join(" ")).toMatch(/IBAN_CERTIFICATE/);
  });

  it("keeps entry, expiry, cancellation, contract, and attendance date roles distinct", () => {
    const byNumber = new Map(PHASE2_CATALOG.profiles.map((profile) => [profile.purposeNumber, profile]));
    const roles = (number: number) => byNumber.get(number)?.fields.flatMap((field) =>
      field.type === "date" ? [field.dateRole] : [],
    );
    expect(roles(6)).toContain("entry_deadline");
    expect(roles(6)).not.toContain("credential_expiry");
    expect(roles(7)).toContain("credential_expiry");
    expect(roles(8)).toEqual(expect.arrayContaining(["cancellation_effective", "grace_end", "printed"]));
    expect(roles(10)).toEqual(expect.arrayContaining(["last_working_day", "cancellation_effective"]));
    expect(roles(13)).toContain("contract_end");
    expect(roles(45)).not.toContain("credential_expiry");
  });

  it("never uses a supporting civil ID, an application or a booking as an issued entitlement", () => {
    const byNumber = new Map(PHASE2_CATALOG.profiles.map((profile) => [profile.purposeNumber, profile]));
    expect(byNumber.get(16)?.renewalPolicy).toEqual("none");
    expect(byNumber.get(53)?.renewalPolicy).toEqual("none");
    expect(byNumber.get(46)?.renewalPolicy).toEqual("none");
    expect(byNumber.get(51)?.fields.find((field) => field.key === "cicpa_locations_arabic"))
      .toMatchObject({ required: true, restricted: true, multiline: true });
    expect(byNumber.get(52)?.tags).toContain("SITE_OFFSHORE");
  });

  it("requires a date role and labels for every extraction rule, except evidence-gated fixed facts", () => {
    for (const profile of PHASE2_CATALOG.profiles) {
      for (const field of profile.fields) {
        if (field.type === "date") expect(field.dateRole, profile.id + "." + field.key).toBeTruthy();
        if (field.fixedValue === undefined) expect(field.labels.length, profile.id + "." + field.key).toBeGreaterThan(0);
      }
    }
  });
});

describe("Evidence-specific catalog routes", () => {
  function matches(purposeNumber: number, text: string) {
    const profile = PHASE2_CATALOG.profiles[purposeNumber - 1];
    return profile.positiveMarkers.every((pattern) => new RegExp(pattern, "imu").test(text))
      && !profile.negativeMarkers.some((pattern) => new RegExp(pattern, "imu").test(text));
  }

  it("does not interpret a printed passport reference in an application as passport biodata", () => {
    const text = "Application Form for Persons Security Permit\nName: Example Worker\nPassport No.: AB0123\nDate of Birth: 1988-01-05\nExpiry Date: 2030-06-01";
    expect(matches(53, text)).toBe(true);
    expect(matches(1, text)).toBe(false);
  });

  it("routes confirmed IBAN certificate as its own type and does not classify it as a payroll card", () => {
    const text = "IBAN Certificate\nReference No: 0012345\nAccount Holder: Example Worker";
    const profile = PHASE2_CATALOG.variants.find((item) => item.id === "bank-iban-certificate");
    expect(profile?.typeCode).toBe("IBAN_CERTIFICATE");
    expect(profile?.positiveMarkers.every((pattern) => new RegExp(pattern, "imu").test(text))).toBe(true);
    expect(profile?.fields.map((field) => field.key)).not.toContain("account_number");
    expect(matches(21, text)).toBe(false);
  });

  it("keeps CICPA reverse company reference and front permit strip distinct", () => {
    const profile = PHASE2_CATALOG.profiles[50];
    const fields = new Map(profile.fields.map((field) => [field.key, field]));
    expect(fields.get("pass_number")?.labels).not.toContain("الرقم");
    expect(fields.get("company_registration_number")?.labels).toContain("الرقم");
    expect(fields.get("printed_permit_strip")?.fixedValue).toBe("تصريح دخول بري");
  });
});

it("normalizes only the sampled passport issuing jurisdictions and holds the generic fallback", () => {
  const variants = PHASE2_CATALOG.variants.filter((profile) => profile.purposeNumber === 1);
  const issuers = variants.map((profile) => profile.fields.find((field) => field.key === "issuer_country")?.fixedValue);
  expect(issuers).toEqual(["IN", "PK", "JO", "PS", "SY", "GH", "NG", "NP", "KE", "DE", "UG"]);
  expect(PHASE2_CATALOG.profiles[0].status).toBe("held");
  const india = variants.find((profile) => profile.id === "passport-in")!;
  const text = "PASSPORT\nRepublic of India\nPassport No: X1234567\nDate of Birth: 1991-01-21\nDate of Expiry: 2031-03-20";
  expect(india.positiveMarkers.every((pattern) => new RegExp(pattern, "imu").test(text))).toBe(true);
  expect(india.fields.find((field) => field.key === "issuer_country")?.labels).toContain("Republic of India");
  expect(india.fields.find((field) => field.key === "nationality")?.fixedValue).toBeUndefined();
});
