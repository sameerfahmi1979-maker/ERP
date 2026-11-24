import { describe, expect, it } from "vitest";
import type { DmsAiOutput } from "@/lib/dms/ai/types";
import { verifyProviderField, verifyProviderOutput } from "../provider-evidence";

const page = { page: 7, method: "native", text: "Permit Expiry: 12/02/2027\nPassport Expiry: 12/05/2036\nReference: 001237" };

describe("Phase 2 provider evidence", () => {
  it("requires the printed label to corroborate a value even when the value appears elsewhere", () => {
    const passport = { key: "passport_expiry", type: "date", labels: ["Passport Expiry"], required: true } as const;
    expect(verifyProviderField(passport, "2027-02-12", [page])).toBeNull();
    const unambiguous = { ...page, text: page.text.replace("12/05/2036", "23/05/2036") };
    expect(verifyProviderField(passport, "2036-05-23", [unambiguous])).toMatchObject({ page: 7, line: 2, raw: "23/05/2036" });
    expect(verifyProviderField(passport, "2036-05-12", [page])).toBeNull();
  });

  it("preserves leading zeroes and rejects conflicting labels", () => {
    const reference = { key: "reference", type: "identifier", labels: ["Reference"], required: true } as const;
    expect(verifyProviderField(reference, "1237", [page])).toBeNull();
    expect(verifyProviderField(reference, "001237", [page])).toMatchObject({ page: 7, raw: "001237" });
    expect(verifyProviderField(reference, "001237", [page, { ...page, text: "Reference: 991110" }])).toBeNull();
  });

  it("keeps fields that need verified card regions or Arabic scope held on generic OCR", () => {
    expect(verifyProviderField({ key: "pass_number", type: "identifier", required: true, labels: ["Reference"], side: "reverse" }, "001237", [page])).toBeNull();
    expect(verifyProviderField({ key: "scope", type: "text", required: true, labels: ["Scope"], multiline: true }, "موقع", [{ ...page, text: "Scope: موقع" }])).toBeNull();
  });

  it("can corroborate a compact document-number label when it spans two adjacent text lines", () => {
    const reference = { key: "reference", type: "identifier", labels: ["Document Reference"], required: true } as const;
    expect(verifyProviderField(reference, "AB001237", [{ ...page, text: "Document Reference\nAB001237" }])).toMatchObject({ page: 7, line: 2, raw: "AB001237" });
    expect(verifyProviderField(reference, "AB001237", [{ ...page, text: "Other reference\nAB001237\nDocument Reference\n99110" }])).toBeNull();
  });

  const emptyLocal = { profileId: null, reasons: [], fields: {} };
  const source = (text: string) => [{ page: 1, method: "pdf-native", text }];
  const output = (type: string, fields: Record<string, string>) => ({
    classification: { suggestedTypeCode: type, needsHumanReview: false },
    extraction: { fields: Object.entries(fields).map(([fieldCode, value]) => ({ fieldCode, value })), additionalFields: [] },
  }) as unknown as DmsAiOutput;

  it("binds the permit number and explicit full name to the bilingual entry form, keeping sponsor and holder distinct", () => {
    const text = "United Arab Emirates\nEmployment\nENTRY PERMIT NO : 002 / 2024 / 0/0072345       : رقم دخول إذن\nFull Name : TEST PERSON\nName : TEST SPONSOR     اسم الكفيل : الاسم";
    const result = verifyProviderOutput(output("VISA", { issuer_country: "United Arab Emirates", credential_kind: "Employment",
      entry_permit_number: "002/2024/0/0072345", holder_name: "TEST PERSON" }), source(text), emptyLocal);
    expect(result.prepared).toBe(true);
    expect(result.fields).toMatchObject({ issuer_country: { value: "AE" }, credential_kind: { value: "employment_entry" },
      entry_permit_number: { raw: "002 / 2024 / 0/0072345", page: 1, line: 3 }, holder_name: { raw: "TEST PERSON" } });
    expect(verifyProviderOutput(output("VISA", { holder_name: "TEST SPONSOR" }), source(text), emptyLocal).fields.holder_name).toBeUndefined();
    expect(verifyProviderOutput(output("VISA", { holder_name: "TEST PERSON" }), source(text.replace("Full Name", "Name")), emptyLocal).fields.holder_name).toBeUndefined();
    expect(verifyProviderOutput(output("VISA", { issuer_country: "QA" }), source(text), emptyLocal).fields.issuer_country).toBeUndefined();
  });

  it("reads the anchored OPITO award statement and named-month dates without assigning certificate or learner identifiers across roles", () => {
    const text = "This is to certify that\n\nTEST PERSON\n\nattended a course at TEST CENTRE\n"
      + "and has been assessed against, and met the outcomes of, the following\nOPITO‐approved standard:\nBasic H2S Training\n"
      + "Awarded on 22nd May 2024\nExpiry Date 21st May 2026\nUnique Certificate No 002665\nOPITO Learner No 001234";
    const fields = { participant_name: "TEST PERSON", provider: "TEST CENTRE", course_title: "Basic H2S Training",
      awarding_body: "OPITO", printed_outcome: "has been assessed against, and met the outcomes of, the following OPITO-approved standard",
      certificate_number: "002665", award_date: "2024-05-22", expiry_date: "2026-05-21" };
    const profile = verifyProviderOutput(output("ADNOC_OPITO", fields), source(text), emptyLocal);
    expect(profile).toMatchObject({ prepared: true, fields: { participant_name: { page: 1, line: 3 }, certificate_number: { raw: "002665" },
      award_date: { raw: "22nd May 2024" } } });
    expect(verifyProviderOutput(output("ADNOC_OPITO", { ...fields, certificate_number: "001234" }), source(text), emptyLocal).prepared).toBe(false);
    expect(verifyProviderOutput(output("ADNOC_OPITO", fields), source(text.replace("and met the outcomes of,", "but did not meet the outcomes of,")), emptyLocal).prepared).toBe(false);
  });

  it("uses a locally corroborated layout and evidence only when the catalog and provider type agree", () => {
    const proof = { profileId: "uae-residence-permit", fields: {
      holder_name: { page: 1, label: "Full name", raw: "TEST PERSON", value: "TEST PERSON" },
      issuer_country: { page: 1, label: "Issuer", raw: "United Arab Emirates", value: "AE" },
      residence_reference: { page: 1, label: "Residence reference", raw: "00700", value: "00700" },
      residence_expiry_date: { page: 1, label: "Residence expiry", raw: "22 May 2027", value: "2027-05-22" },
    } };
    const text = "Full name: TEST PERSON\nIssuer: United Arab Emirates\nResidence reference: 00700\nResidence expiry: 22 May 2027";
    expect(verifyProviderOutput(output("RESIDENCE_VISA", { holder_name: "TEST PERSON" }), source(text), emptyLocal, proof))
      .toMatchObject({ prepared: true, fields: proof.fields, profileId: proof.profileId });
    expect(verifyProviderOutput(output("VISA", {}), source(text), emptyLocal, proof).prepared).toBe(false);
    expect(verifyProviderOutput(output("RESIDENCE_VISA", { residence_reference: "700" }), source(text), emptyLocal, proof))
      .toMatchObject({ prepared: false, unverifiedFields: ["residence_reference"] });
    expect(verifyProviderOutput(output("RESIDENCE_VISA", {}), source(text),
      { ...emptyLocal, reasons: ["mixed_passport_and_emirates_id"] }, proof).prepared).toBe(false);
    expect(verifyProviderOutput(output("RESIDENCE_VISA", {}), source(text),
      { ...emptyLocal, profileId: "foreign-visa" }, proof).prepared).toBe(false);
    const needsReview = output("RESIDENCE_VISA", {});
    needsReview.classification.needsHumanReview = true;
    expect(verifyProviderOutput(needsReview, source(text), emptyLocal, proof).reasons).toContain("provider_requested_review");
    expect(verifyProviderOutput(output("RESIDENCE_VISA", {}), source(text), emptyLocal, { ...proof, fields: {
      ...proof.fields, holder_name: { ...proof.fields.holder_name, page: 3 },
    } })).toMatchObject({ prepared: false, missingFields: ["holder_name"] });
  });

  it("uses a source-reviewed type for evidence when AI Fill left classification unresolved, keeping the case held", () => {
    const unclassified = output("", {});
    const result = verifyProviderOutput(unclassified, source("United Arab Emirates\nResidence Permit"), emptyLocal, {
      profileId: "uae-residence-permit", fields: {},
    }, "RESIDENCE_VISA");
    expect(result).toMatchObject({ knownType: "RESIDENCE_VISA", profileId: "uae-residence-permit", prepared: false });
    expect(result.reasons).toContain("provider_type_unresolved_or_outside_catalog");
  });

  it("accepts equivalent completion wording without promoting attendance or assessment to completion", () => {
    const row = (label: string, raw: string, value = raw) => ({ page: 1, label, raw, value });
    const proof = {
      profileId: "first-aid-aed-cpr",
      fields: {
        participant_name: row("Printed participant", "Sample Holder"),
        provider: row("Printed provider", "Test Training Centre"),
        course_title: row("Printed course", "Emergency First Aid"),
        printed_outcome: row("Printed result", "has attended and completed", "completed"),
      },
    };
    const page = source("Emergency First Aid\nSample Holder\nTest Training Centre\nhas attended and completed");
    const verified = (printed_outcome: string) => verifyProviderOutput(output("TRAINING_AWARD", { printed_outcome }), page, emptyLocal, proof);
    expect(verified("successfully completed")).toMatchObject({ prepared: true, fields: { printed_outcome: proof.fields.printed_outcome } });
    for (const conflicting of ["attended", "passed assessment", "has not successfully completed"]) {
      expect(verified(conflicting)).toMatchObject({ prepared: false, missingFields: ["printed_outcome"] });
    }
    const assessment = row("Printed assessment", "has successfully passed an assessment in", "passed_assessment");
    const assessmentProof = { ...proof, fields: { ...proof.fields, printed_outcome: assessment } };
    const assessmentPage = source("Emergency First Aid\nSample Holder\nTest Training Centre\nhas successfully passed an assessment in");
    expect(verifyProviderOutput(output("TRAINING_AWARD", { printed_outcome: "passed an assessment" }), assessmentPage, emptyLocal, assessmentProof))
      .toMatchObject({ prepared: true, fields: { printed_outcome: assessment } });
    expect(verifyProviderOutput(output("TRAINING_AWARD", { printed_outcome: "completed" }), assessmentPage, emptyLocal, assessmentProof))
      .toMatchObject({ prepared: false, missingFields: ["printed_outcome"] });
  });

  it("cannot recover expiry from the generic reader when the training proof withholds packet fields", () => {
    const pages = [
      ...source("H2S Training Level 2\nADNOC Technical Academy\nCertificate of Completion"),
      { page: 2, method: "pdf-native", text: "Expiry Date: 22 May 2027" },
    ];
    const result = verifyProviderOutput(output("H2S_TRAINING_CERTIFICATE", { expiry_date: "2027-05-22" }), pages, emptyLocal, {
      profileId: "h2s-training", fields: {}, reasons: ["training_layout_multi_page"], limitToProofFields: true,
    });
    expect(result.prepared).toBe(false);
    expect(result.reasons).toContain("training_layout_multi_page");
    expect(result.fields.expiry_date).toBeUndefined();
  });

  it("removes a prior missing-MRZ hold only after a complete passport proof, preserving any issuer conflict", () => {
    const field = (value: string) => ({ value, raw: value, page: 1, label: "Verified printed role" });
    const proof = { profileId: "passport-ng", resolves: ["passport_mrz_unverified", "passport_issuer_disagrees_with_mrz"],
      fields: { passport_number: field("TEST08464"), holder_name: field("SAMPLE HOLDER"), issuer_country: field("NG"),
        date_of_birth: field("1997-08-18"), expiry_date: field("2032-08-18") } };
    const prior = { ...emptyLocal, reasons: ["passport_mrz_unverified", "passport_issuer_disagrees_with_mrz"] };
    const packet = source("Passport\nRepublic of Nigeria");
    const verified = verifyProviderOutput(output("PASSPORT_COPY", {}), packet, prior, proof);
    expect(verified.reasons).toContain("passport_issuer_disagrees_with_mrz");
    expect(verified.reasons).not.toContain("passport_mrz_unverified");
    const incomplete = verifyProviderOutput(output("PASSPORT_COPY", {}), packet, prior, { ...proof, fields: {} });
    expect(incomplete.reasons).toContain("passport_mrz_unverified");
  });

  it("retains printed safety-passport dates without adopting a provider-expanded year", () => {
    const evidence = { value: "03/12/27", raw: "03/12/27", page: 1, label: "Offshore Expiry Date" };
    const result = verifyProviderOutput(output("ADNOC_PASSPORT", { offshore_expiry_printed: "2027-12-03" }),
      source("Offshore Expiry Date 03/12/27"), emptyLocal, {
        profileId: "hse-safety-passport", fields: { offshore_expiry_printed: evidence },
        reasons: ["safety_passport_personal_endorsement_unverified"], limitToProofFields: true,
      });
    expect(result.fields.offshore_expiry_printed).toEqual(evidence);
    expect(result.unverifiedFields).toContain("offshore_expiry_printed");
    expect(result.fields.passport_expiry_date).toBeUndefined();
    expect(result.prepared).toBe(false);
  });
});
