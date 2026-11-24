import { describe, expect, it } from "vitest";
import { readTrainingLayout } from "../training-evidence";
import { PHASE2_CATALOG } from "../catalog";

const page = (text: string, method = "pdf-native") => ({ page: 1, text, method });
const native = (title: string) => [
  "EXAMPLE CERTIFICATE HOLDER", "", "", title, "", "", "", "", "", "Certificate Number : 0040-TEST",
  "Emirates ID : 000000000000000", "Passport Number :", "", "Date of Issue : 22 April 2026", "Date of Expiry : 22 April 2028",
].join("\n");
const academy = [
  "CERTIFICATE", "OF COMPLETION", "This certifies that", "EXAMPLE CERTIFICATE HOLDER",
  "has attended and completed", "H2S Training Level 2", "at the HSE Contractor Academy",
  "ADNOC Technical Academy", "Certificate Number : 0040-TEST", "Date of Issue : 22 April 2026", "Date of Expiry : 22 April 2028",
].join("\n");

describe("source-bound training layouts", () => {
  it("finds the H2S recipient by the certificate statement and keeps the dates and reference separate", () => {
    const result = readTrainingLayout([page(academy, "pdf-ocr")], "H2S_TRAINING_CERTIFICATE");
    expect(result).toMatchObject({
      profileId: "h2s-training",
      fields: {
        participant_name: { value: "EXAMPLE CERTIFICATE HOLDER", line: 4, method: "pdf-ocr" },
        provider: { value: "ADNOC Technical Academy" },
        printed_outcome: { value: "completed", raw: "has attended and completed" },
        certificate_number: { value: "0040-TEST" },
        issue_date: { value: "2026-04-22" },
        expiry_date: { value: "2028-04-22" },
      },
    });
    expect(result?.reasons).toBeUndefined();
  });

  it("extracts the labelled native induction overlay and holds the unseen provider and outcome", () => {
    const result = readTrainingLayout([page(native("Onshore Induction + ADNOC Life Saving Rules"))], "ADNOC_INDUCTION");
    expect(result).toMatchObject({
      profileId: "onshore-induction",
      fields: {
        participant_name: { raw: "EXAMPLE CERTIFICATE HOLDER", page: 1, line: 1 },
        training_scope: { value: "onshore", line: 4 },
        course_title: { value: "Onshore Induction + ADNOC Life Saving Rules" },
        certificate_number: { value: "0040-TEST", line: 10 },
      },
      reasons: expect.arrayContaining(["training_provider_source_unconfirmed", "training_outcome_source_unconfirmed"]),
    });
    expect(result?.fields).not.toHaveProperty("provider");
    expect(result?.fields).not.toHaveProperty("printed_outcome");
  });

  it("uses a bound Academy raster only for static provider and outcome evidence", () => {
    const overlay = page(native("Onshore Induction + ADNOC Life Saving Rules"));
    const raster = {
      page: 1,
      method: "tesseract-training-raster-ocr",
      bounds: [2, 5, 640, 420] as const,
      text: "CERTIFICATE OF COMPLETION\nADNOC Technical Academy\nhas attended and completed\nCertificate Number: RASTER-0006",
    };
    const result = readTrainingLayout([overlay, raster], "ADNOC_INDUCTION");
    expect(result?.reasons).toBeUndefined();
    expect(result?.fields).toMatchObject({
      provider: { value: "ADNOC Technical Academy", method: "tesseract-training-raster-ocr", page: 1, bounds: raster.bounds },
      printed_outcome: { value: "completed", method: "tesseract-training-raster-ocr" },
      certificate_number: { value: "0040-TEST", line: 10, method: "pdf-native" },
      participant_name: { value: "EXAMPLE CERTIFICATE HOLDER", line: 1, method: "pdf-native" },
    });
    expect(readTrainingLayout([overlay, { ...raster, page: 2 }], "ADNOC_INDUCTION")?.fields.provider).toBeUndefined();
    expect(readTrainingLayout([overlay, raster, raster], "ADNOC_INDUCTION")?.reasons).toContain("training_raster_proof_ambiguous");
  });

  it("does not substitute unlabelled native values for a reference, date or holder", () => {
    const text = "EXAMPLE CERTIFICATE HOLDER\n\n\nOffshore Induction + ADNOC Life Saving Rules\n006543\n22 May 2026\n22 May 2028";
    const result = readTrainingLayout([page(text)], "ADNOC_INDUCTION");
    expect(result?.profileId).toBe("offshore-induction");
    expect(result?.reasons).toContain("training_labelled_layout_incomplete");
    expect(Object.keys(result?.fields ?? {}).sort()).toEqual(["course_title", "training_scope"]);
  });

  it("keeps a provider's explicit completed first-aid course distinct from attendance-only or assessment claims", () => {
    const text = [
      "CERTIFICATE OF ATTENDANCE", "NUMERO UNO TRAINING & CONSULTING LLC", "This is to certify that",
      "EXAMPLE CERTIFICATE HOLDER", "has successfully completed",
      "Highfield International Emergency First Aid, AED & CPR All Ages ( Level 3 Award)",
      "Course Date: 16-04-2026 to 17-04-2026", "Expiry Date: 17-04-2029", "Certificate No: TEST/HSE/0041",
    ].join("\n");
    const result = readTrainingLayout([page(text, "pdf-ocr")], "TRAINING_AWARD");
    expect(result).toMatchObject({
      profileId: "first-aid-aed-cpr",
      fields: {
        provider: { value: "NUMERO UNO TRAINING & CONSULTING LLC" },
        course_title: { raw: "Highfield International Emergency First Aid, AED & CPR All Ages ( Level 3 Award)" },
        printed_outcome: { value: "completed" },
        expiry_date: { value: "2029-04-17" },
      },
    });
    expect(result?.fields).not.toHaveProperty("course_date");
    expect(readTrainingLayout([page(text.replace("has successfully completed", "attended the class"))], "TRAINING_AWARD")).toBeNull();
  });

  it("corroborates a T-BOSIET award statement, separates award and expiry, and rejects induction routing", () => {
    const text = [
      "This is to certify that", "EXAMPLE CERTIFICATE HOLDER",
      "attended a course at Emirates Technical & Safety Development Centre", "(ETSDC)",
      "and has been assessed against, and met the outcomes of, the following", "OPITO‐approved standard:",
      "Tropical Basic Offshore Safety Induction and Emergency Training (T‐BOSIET)", "Awarded on 7th July 2026",
      "Expiry Date 7th July 2030", "Unique Certificate No OPITO-TEST-0041", "OPITO Learner No 0000041",
    ].join("\n");
    expect(readTrainingLayout([page(text)], "ADNOC_INDUCTION")).toBeNull();
    expect(readTrainingLayout([page(text)], "ADNOC_OPITO")).toMatchObject({
      profileId: "t-bosiet", fields: {
        participant_name: { value: "EXAMPLE CERTIFICATE HOLDER" },
        award_date: { value: "2026-07-07" },
        expiry_date: { value: "2030-07-07" },
        certificate_number: { value: "OPITO-TEST-0041" },
        learner_reference: { value: "0000041" },
        awarding_body: { value: "OPITO" },
        course_title: {
          value: "Tropical Basic Offshore Safety Induction and Emergency Training (T-BOSIET)",
          raw: "Tropical Basic Offshore Safety Induction and Emergency Training (T‐BOSIET)",
        },
        printed_outcome: {
          value: "has been assessed against, and met the outcomes of, the following OPITO‐approved standard",
          raw: "and has been assessed against, and met the outcomes of, the following\nOPITO‐approved standard:",
        },
      },
    });
  });

  it("preserves the separate Numero Uno defensive/desert course with explicit completion", () => {
    const text = [
      "CERTIFICATE OF COMPLETION", "NUMERO UNO TRAINING & CONSULTING LLC", "This is to certify that",
      "EXAMPLE CERTIFICATE HOLDER", "has successfully completed", "Defensive/Desert Driving -Light Vehicle",
      "Course Date: 16-04-2026 to 17-04-2026", "Expiry Date: 17-04-2029", "Certificate No: TEST/HSE/0041",
    ].join("\n");
    expect(readTrainingLayout([page(text, "pdf-ocr")], "TRAINING_AWARD")).toMatchObject({
      profileId: "defensive-driving",
      fields: {
        course_title: { value: "Defensive/Desert Driving -Light Vehicle" },
        training_vehicle_class: { value: "Light Vehicle" },
        printed_outcome: { value: "completed" },
        expiry_date: { value: "2029-04-17" },
      },
    });
    expect(readTrainingLayout([page(text.replace("Defensive/Desert Driving -Light Vehicle", "ADNOC Defensive Safe Driving ID"))], "TRAINING_AWARD")).toBeNull();
  });

  it("holds Numero Uno attended/passed alternatives even when a certificate expiry is printed", () => {
    const text = [
      "NUMERO UNO TRAINING & CONSULTING LLC", "Certificate of Completiow", "This is to certify that",
      "EXAMPLE CERTIFICATE HOLDER", "has sucessfully attended/passed",
      "Defensive Driving & Desert Driving Course (HGV) (ADSD)", "Expiry Date: 17-04-2029",
    ].join("\n");
    const actual = readTrainingLayout([page(text, "pdf-ocr")], "TRAINING_AWARD");
    expect(actual).toMatchObject({
      profileId: "defensive-driving",
      fields: {
        participant_name: { value: "EXAMPLE CERTIFICATE HOLDER" },
        training_vehicle_class: { value: "HGV" },
        printed_outcome: { raw: "has sucessfully attended/passed", value: "has successfully attended/passed" },
        expiry_date: { value: "2029-04-17" },
      },
      reasons: ["training_outcome_alternatives_unresolved"],
    });
    expect(actual?.fields).not.toHaveProperty("assessment_result");
  });

  it("binds the exact OPITO Basic H2S award and the long provider name independently of its acronym", () => {
    const text = [
      "This is to certify that", "EXAMPLE CERTIFICATE HOLDER",
      "attended a course at Emirates Technical & Safety Development Centre", "(ETSDC)",
      "and has been assessed against, and met the outcomes of, the following", "OPITO-approved standard",
      "Basic H2S Training", "Awarded on 7th July 2026", "Expiry Date 7th July 2028", "Unique Certificate No OPITO-0042",
    ].join("\n");
    expect(readTrainingLayout([page(text)], "ADNOC_OPITO")).toMatchObject({
      profileId: "h2s-training-opito-basic",
      fields: {
        course_title: { value: "Basic H2S Training" },
        provider: { value: "Emirates Technical & Safety Development Centre (ETSDC)", raw: "Emirates Technical & Safety Development Centre", line: 3 },
        awarding_body: { value: "OPITO" },
        printed_outcome: { value: "has been assessed against, and met the outcomes of, the following OPITO-approved standard" },
        award_date: { value: "2026-07-07" },
      },
    });
    expect(readTrainingLayout([page(text)], "H2S_TRAINING_CERTIFICATE")).toBeNull();
  });

  it("does not cast dual passport scope dates or generic safety rules as a person’s endorsement", () => {
    const text = "EXAMPLE HOLDER NAME\nTest Role\nSupplier: EXAMPLE CONTRACTOR\nPassport Number Offshore Expiry Date Onshore Expiry Date\nT0000041 01/05/26 01/05/27 portal.adnoc.ae\nWorking at Height";
    const result = readTrainingLayout([page(text)], "ADNOC_PASSPORT");
    expect(result).toMatchObject({
      profileId: "hse-safety-passport",
      reasons: expect.arrayContaining(["safety_passport_scope_validity_unresolved", "safety_passport_personal_endorsement_unverified"]),
    });
    for (const field of ["safety_passport_id", "passport_expiry_date", "listed_endorsement"]) expect(result?.fields).not.toHaveProperty(field);
  });

  it("reads the Safety Zone narrative without treating same-page logos as a government licence", () => {
    const text = [
      "Certificate", "of Completion", "This is to certify that", "EXAMPLE CERTIFICATE HOLDER", "(ID: N/A)",
      "Employee of: Example Company",
      "Has successfully completed the training course of", "ADSD (Defensive Driving & Desert Driving) – HV",
      "(Approved ADNOC HSE Standard)", "On 23 February & 24 February 2026", "Safety Zone S & S Consultancy",
      "Cer NO: TEST/0042", "Valid till: 24 February 2029",
    ].join("\n");
    const actual = readTrainingLayout([page(text)], "TRAINING_AWARD");
    expect(actual).toMatchObject({
      profileId: "defensive-driving",
      fields: {
        participant_name: { value: "EXAMPLE CERTIFICATE HOLDER" },
        provider: { value: "Safety Zone S & S Consultancy" },
        expiry_date: { value: "2029-02-24", label: "Valid till" },
        printed_outcome: { value: "completed", raw: "Has successfully completed the training course of" },
        training_vehicle_class: { value: "HV" },
        certificate_number: { value: "TEST/0042" },
      },
    });
    expect(actual?.reasons).toBeUndefined();
    expect(actual?.fields).not.toHaveProperty("course_date");
    expect(readTrainingLayout([page(text)], "DRIVING_LICENSE")).toBeNull();
  });

  it("reads the inline certificate fields and holds a temporary document with no matching expiry", () => {
    const text = [
      "Name: EXAMPLE CERTIFICATE HOLDER This is to certify that |",
      "ID Card No. N/A Has successfully Completed",
      "Course: Basic Fire Fighting", "This card is temporary only  Instructor Name:",
      "Issued Date: 25/02/2026  Signature:", "Valid Till: 25/02/2028", "Cert. No: TEST/00044",
    ].join("\n");
    const actual = readTrainingLayout([page(text)], "TRAINING_AWARD");
    expect(actual).toMatchObject({
      profileId: "firefighting-training",
      fields: {
        participant_name: { value: "EXAMPLE CERTIFICATE HOLDER" },
        printed_outcome: { value: "completed" },
        issue_date: { value: "2026-02-25" },
        expiry_date: { value: "2028-02-25" },
        certificate_number: { value: "TEST/00044" },
        temporary_status: { value: "This card is temporary only" },
      },
      reasons: ["training_provider_source_unconfirmed"],
    });
    expect(readTrainingLayout([page(text.replace("Valid Till: 25/02/2028", "no printed validity"))], "TRAINING_AWARD"))
      .toMatchObject({ reasons: expect.arrayContaining(["training_temporary_validity_unconfirmed"]) });
  });

  it("binds the inline issuer logo and left-column reference without using another card's fields", () => {
    const original = page([
      "Name: EXAMPLE CERTIFICATE HOLDER This is to certify that |",
      "ID Card No. N/A Has successfully Completed",
      "Course: Basic Fire Fighting", "Approved ADNOC HSE Standard  Instructor Name:",
      "EXAMPLE COURSE TRAINER", "Issued Date: 25/02/2026  Signature:", "Valid Till: 25/02/2028",
      "Cert. No:  Authorized Sig.", "TEST/00044",
    ].join("\n"));
    const raster = { page: 1, method: "tesseract-training-raster-ocr", region: "issuer-logo",
      bounds: [99, 26, 183, 40] as const, text: "Safety Zone S & S Consultancy" };
    const actual = readTrainingLayout([original, raster], "TRAINING_AWARD");
    expect(actual?.reasons).toBeUndefined();
    expect(actual?.fields).toMatchObject({
      provider: { value: "Safety Zone S & S Consultancy", page: 1, bounds: raster.bounds, method: raster.method },
      trainer: { value: "EXAMPLE COURSE TRAINER", line: 5 },
      certificate_number: { value: "TEST/00044", line: 9, label: "Cert. No:" },
    });
    expect(actual?.fields).not.toHaveProperty("signature_evidence");
    expect(readTrainingLayout([original, { ...raster, page: 2 }], "TRAINING_AWARD")?.reasons)
      .toContain("training_provider_source_unconfirmed");
  });

  it("uses Basic First Aid as its own printed completion variant without inferring AED or CPR", () => {
    const original = page([
      "Name: EXAMPLE CERTIFICATE HOLDER This is to certify that |",
      "ID Card No. N/A Has successfully Completed",
      "Course: Basic First Aid", "Approved ADNOC HSE Standard  Instructor Name:",
      "EXAMPLE COURSE TRAINER", "Issued Date: 25/02/2026  Signature:", "Valid Till: 25/02/2028",
      "Cert. No:  Authorized Sig.", "TEST/00044",
    ].join("\n"));
    const raster = { page: 1, method: "tesseract-training-raster-ocr", region: "issuer-logo",
      bounds: [99, 26, 183, 40] as const, text: "Safety Zone S & S Consultancy" };
    const profile = PHASE2_CATALOG.variants.find(item => item.id === "basic-first-aid-training");
    expect(profile).toMatchObject({ purposeNumber: 39, typeCode: "TRAINING_AWARD" });
    expect(profile?.fields.find(field => field.key === "course_title")).toMatchObject({ fixedValue: "Basic First Aid" });
    const actual = readTrainingLayout([original, raster], "TRAINING_AWARD");
    expect(actual).toMatchObject({
      profileId: "basic-first-aid-training",
      fields: {
        course_title: { value: "Basic First Aid" },
        provider: { value: "Safety Zone S & S Consultancy" },
        printed_outcome: { value: "completed" },
        issue_date: { value: "2026-02-25" },
        expiry_date: { value: "2028-02-25" },
      },
    });
    expect(actual?.fields).not.toHaveProperty("awarding_body");
    expect(readTrainingLayout([{ ...original, text: original.text.replace("Basic First Aid", "Basic First Aid and CPR") }, raster], "TRAINING_AWARD")).toBeNull();
  });

  it("keeps the RoSPA grade and duration separate from authority and validity", () => {
    const text = [
      "This is to certify that", "EXAMPLE CERTIFICATE HOLDER", "Has achieved a",
      "ADNOC Defensive Driving for Light", "Vehicles ( Valid 3 Years )", "Grade: Pass",
      "Date: 26/04/2026 Qualification Number: TEST/9", "Certificate Number: 000045",
      "The Royal Society for the Prevention of Accidents",
    ].join("\n");
    const actual = readTrainingLayout([page(text, "pdf-ocr")], "TRAINING_AWARD");
    expect(actual).toMatchObject({
      profileId: "defensive-driving",
      fields: {
        participant_name: { value: "EXAMPLE CERTIFICATE HOLDER" },
        provider: { value: "The Royal Society for the Prevention of Accidents" },
        course_title: { value: "ADNOC Defensive Driving for Light Vehicles" },
        training_vehicle_class: { value: "Light Vehicles" },
        certificate_number: { value: "000045" },
        qualification_number: { value: "TEST/9" },
        printed_outcome: { value: "Pass", label: "Grade" },
        printed_validity_duration: { value: "3" },
      },
    });
    for (const key of ["expiry_date", "issue_date", "award_date"]) expect(actual?.fields).not.toHaveProperty(key);
    expect(readTrainingLayout([page(text + "\nThis is not a certificate of successful completion")], "TRAINING_AWARD")).toBeNull();
  });

  it("keeps the IOSH examination statement as evidence with only the syntactic lead-in removed", () => {
    const text = [
      "This is a certificate awarded to", "EXAMPLE CERTIFICATE HOLDER", "on successfully completing", "IOSH Managing Safely",
      "NATIONAL CENTRE FOR MANAGEMENT AND", "TRAINING", "IOSH certificate number: IOSH-0123", "Issued Date: 25 April 2027",
    ].join("\n");
    expect(readTrainingLayout([page(text)], "TRAINING_AWARD")).toMatchObject({
      profileId: "other-safety-training",
      fields: {
        printed_outcome: { value: "successfully completing", raw: "on successfully completing" },
        certificate_number: { value: "IOSH-0123" },
      },
    });
  });

  it("corroborates the Safety Zone equipment assessment and keeps exact equipment scope and date roles", () => {
    const text = [
      "Certificate of Achievement", "This Certificate Awarded to:", "Mr. EXAMPLE EQUIPMENT OPERATOR",
      "Nationality: EXAMPLE Certificate №.: SZ/T/00041", "Test Equipment Type: WHEEL LOADER",
      "Location of test: ABU DHABI, UAE.", "In recognition of successfully passed test of Wheel Loader operation & Safety.",
      "3       Overall Results: Good Level Achieved", "DATE OF ISSUE  : 20.05.2026     ASSESSOR: EXAMPLE ASSESSOR",
      "DATE OF EXPIRY : 19.05.2028     SAFETY ZONE S & S CONSULTANCY",
    ].join("\n");
    const result = readTrainingLayout([page(text)], "EQUIPMENT_COMPETENCY");
    expect(result).toMatchObject({
      profileId: "equipment-competency",
      fields: {
        provider: { value: "SAFETY ZONE S & S CONSULTANCY", line: 10 },
        participant_name: { value: "EXAMPLE EQUIPMENT OPERATOR", raw: "Mr. EXAMPLE EQUIPMENT OPERATOR" },
        equipment_type: { value: "WHEEL LOADER" },
        assessment_result: { value: "Good Level Achieved", label: "Overall Results" },
        certificate_number: { value: "SZ/T/00041" },
        issue_date: { value: "2026-05-20" },
        expiry_date: { value: "2028-05-19" },
      },
    });
    expect(result?.reasons).toBeUndefined();
    expect(result?.fields).not.toHaveProperty("licence_class");
    const mismatch = readTrainingLayout([page(text.replace("test of Wheel Loader", "test of Forklift"))], "EQUIPMENT_COMPETENCY");
    expect(mismatch).toMatchObject({ reasons: ["equipment_assessment_scope_mismatch"], limitToProofFields: true });
    expect(mismatch?.fields).not.toHaveProperty("assessment_result");
  });

  it("holds course-completion-only evidence under an equipment assessment suggestion", () => {
    const text = "Certificate of Training\nHas Successfully Completed 1 Day Basic Training Program Of\nExcavator Operator\nExpiry Date: 26 April 2027";
    expect(readTrainingLayout([page(text)], "EQUIPMENT_COMPETENCY")).toEqual({
      profileId: "equipment-competency", fields: {}, reasons: ["equipment_completion_is_not_assessment"], limitToProofFields: true,
    });
  });

  it("holds duplicate bare award matches and conflicting labelled values", () => {
    const duplicate = { ...page(academy), page: 2 };
    expect(readTrainingLayout([page(academy), duplicate], "H2S_TRAINING_CERTIFICATE"))
      .toMatchObject({ fields: {}, reasons: ["training_layout_multi_page"], limitToProofFields: true });
    const result = readTrainingLayout([page(academy + "\nCertificate Number: 0041-TEST")], "H2S_TRAINING_CERTIFICATE");
    expect(result?.reasons).toContain("conflicting_field:certificate_number");
    expect(result?.fields).not.toHaveProperty("certificate_number");
  });
});
