import { createHash } from "node:crypto";
import { mkdtemp, rm, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { approvedProfilePreviewEnabled, mergeApprovedProfileFields, retainSpecialistProof, verifyApprovedProfile } from "@/server/dms-approved-profile-review";

const digest = "a".repeat(64);
const source = { sha256: digest, mime: "application/pdf", size: 128 };
const name = { code: "candidate_name", value: "Example Candidate", raw: "Example Candidate", page: 1, method: "pdf-text-layer" };
function credentialDecision(requiredFieldCount: number) {
  return {
    status: "prepared-review", approvedFor: "local-validation", liveAuthorization: "none",
    officerReviewRequired: true, issues: [], unverifiedOptionalCodes: [], requiredFieldCount,
  };
}
const witness = {
  sourceSha256: digest, sourceId: "src_" + "a".repeat(32), size: source.size, mime: source.mime,
  profileId: "cv", typeCode: "CV", pageCount: 1, fields: [name], credentialDecision: credentialDecision(1),
};
const baseRegistry = { version: 1, catalogVersion: "phase2-hr.1.2.0", witnesses: [witness] };
const setting = "DMS_ALGT_APPROVED_PROFILE_PREVIEW_FILE";
const hashSetting = "DMS_ALGT_APPROVED_PROFILE_PREVIEW_SHA256";

let directory: string;
let manifest: string;
beforeAll(async () => {
  directory = await mkdtemp(join(process.cwd(), ".test-approved-profile-review-"));
  manifest = join(directory, "verified-corpus.json");
  vi.stubEnv(setting, manifest);
  await writeWitnesses(witness);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  if (!directory) return;
  await rm(manifest, { force: true });
  await rmdir(directory);
});

async function writeRegistry(text: string) {
  await writeFile(manifest, text);
  vi.stubEnv(hashSetting, createHash("sha256").update(text).digest("hex"));
}

async function writeWitnesses(...witnesses: unknown[]) {
  await writeRegistry(JSON.stringify({ ...baseRegistry, witnesses }));
}

it("returns the same source-bound evidence for fresh and saved review without making absent optional fields up", async () => {
  await writeWitnesses(witness);
  const fresh = await verifyApprovedProfile(source, "CV");
  const saved = await verifyApprovedProfile(source, "CV", "CV");
  expect(fresh).toMatchObject({
    state: "verified", profileId: "cv", typeCode: "CV",
    fields: { candidate_name: { value: name.value, raw: name.raw, page: 1 } },
  });
  expect(saved).toEqual(fresh);
  if (fresh.state !== "verified") throw Error("Missing verified evidence");
  expect(fresh.fields.cv_date).toBeUndefined();
});

it("returns a normalized optional date only when the bound witness supplies its raw source evidence", async () => {
  const day = { code: "cv_date", value: "2025-12-17", raw: "17 December 2025", page: 1, method: "pdf-text-layer" };
  await writeWitnesses({ ...witness, fields: [name, day] });
  expect(await verifyApprovedProfile(source, "CV")).toMatchObject({
    state: "verified", fields: { cv_date: { value: day.value, raw: day.raw, page: day.page } },
  });
});

it.each([
  ["digest", { sha256: "b".repeat(64) }],
  ["size", { size: source.size + 1 }],
  ["MIME", { mime: "image/jpeg" }],
])("holds when the attested %s does not match the original receipt", async (_label, input) => {
  await writeWitnesses(witness);
  const result = await verifyApprovedProfile({ ...source, ...input }, "CV");
  expect(result).toMatchObject({ state: "held" });
  expect(result).not.toHaveProperty("fields");
});

it("holds without a matching review receipt", async () => {
  await writeWitnesses();
  expect(await verifyApprovedProfile(source, "CV")).toMatchObject({ state: "held" });
});

it("holds unknown catalog versions and malformed JSON", async () => {
  await writeRegistry(JSON.stringify({ ...baseRegistry, catalogVersion: "phase2-hr.9.9.9" }));
  expect(await verifyApprovedProfile(source, "CV")).toMatchObject({ state: "held" });
  await writeRegistry('{"version":1,"witnesses":[');
  expect(await verifyApprovedProfile(source, "CV")).toMatchObject({ state: "held" });
});

it("does not borrow a verified CV receipt for another document type", async () => {
  await writeWitnesses(witness);
  expect(await verifyApprovedProfile(source, "SALARY_CERTIFICATE_AR")).toMatchObject({ state: "held" });
  expect(await verifyApprovedProfile(source, "SALARY_CERTIFICATE_AR", "CV")).toMatchObject({ state: "held" });
});

it("rejects a receipt whose profile and declared type disagree", async () => {
  await writeWitnesses({ ...witness, typeCode: "SALARY_CERTIFICATE_AR" });
  expect(await verifyApprovedProfile(source, "SALARY_CERTIFICATE_AR")).toMatchObject({ state: "held" });
});

it.each([
  ["missing required candidate", []],
  ["duplicate candidate evidence", [name, { ...name, value: "Conflicting Candidate", raw: "Conflicting Candidate" }]],
  ["out-of-range evidence page", [{ ...name, page: 2 }]],
  ["inverted crop bounds", [{ ...name, bounds: [12, 2, 9, 6] }]],
  ["missing raw source evidence", [{ ...name, raw: "" }]],
  ["non-string field value", [{ ...name, value: 42 }]],
  ["invalid printed date", [name, { ...name, code: "cv_date", value: "2025-02-31", raw: "31 February 2025" }]],
])("withholds %s", async (_label, fields) => {
  await writeWitnesses({ ...witness, fields });
  const result = await verifyApprovedProfile(source, "CV");
  expect(result).toMatchObject({ state: "held" });
  expect(result).not.toHaveProperty("fields");
});

it("withholds ambiguous receipts for the same original", async () => {
  await writeWitnesses(witness, { ...witness, sourceId: "src_" + "b".repeat(32),
    fields: [{ ...name, value: "Conflicting Duplicate", raw: "Conflicting Duplicate" }],
  });
  expect(await verifyApprovedProfile(source, "CV")).toMatchObject({ state: "held" });
});

it("withholds unsupported mixed-document packet semantics rather than treating the whole PDF as a single verified profile", async () => {
  await writeWitnesses({ ...witness, pageCount: 2, mixedPacket: true });
  expect(await verifyApprovedProfile(source, "CV")).toMatchObject({ state: "held" });
});

it("holds before reading review fields when the saved context has no single attested original", async () => {
  await writeWitnesses(witness);
  expect(await verifyApprovedProfile(undefined, "CV", "CV")).toMatchObject({ state: "held", reason: "source_mismatch" });
});

it("holds an issuer disagreement even if the type and source hash agree", async () => {
  const bank = {
    ...witness,
    profileId: "bank-iban-certificate", typeCode: "IBAN_CERTIFICATE", credentialDecision: credentialDecision(3),
    fields: [
      { ...name, code: "account_holder" },
      { ...name, code: "issuer", value: "Example Bank", raw: "EXAMPLE BANK" },
      { ...name, code: "certificate_reference", value: "CERT-001", raw: "CERT-001" },
    ],
  };
  await writeWitnesses(bank);
  expect(await verifyApprovedProfile(source, "IBAN_CERTIFICATE", "IBAN_CERTIFICATE", [
    { code: "issuer", value: "  example    bank " },
  ])).toMatchObject({ state: "verified" });
  expect(await verifyApprovedProfile(source, "IBAN_CERTIFICATE", "IBAN_CERTIFICATE", [
    { code: "issuer", value: "Conflicting Bank" },
  ])).toMatchObject({ state: "held", reason: "issuer_conflict" });
});

it("matches a UAE country name to separately corroborated Emirates ID issuer evidence", async () => {
  const emiratesId = {
    ...witness,
    profileId: "emirates-id", typeCode: "EMIRATES_ID", pageCount: 2,
    credentialDecision: credentialDecision(5),
    fields: [
      { ...name, code: "holder_name" },
      { ...name, code: "emirates_id_number", value: "784-1990-0000000-0", raw: "784-1990-0000000-0" },
      { ...name, code: "date_of_birth", value: "1990-01-01", raw: "01/01/1990" },
      { ...name, code: "expiry_date", value: "2030-01-01", raw: "01/01/2030" },
      { ...name, code: "issuer_country", value: "AE", raw: "ILARE", label: "Matched UAE card MRZ issuer", page: 2 },
    ],
  };
  await writeWitnesses(emiratesId);
  for (const countryName of ["United Arab Emirates", "الإمارات العربية المتحدة"]) {
    expect(await verifyApprovedProfile(source, "EMIRATES_ID", "EMIRATES_ID", [
      { code: "issuer_country", value: countryName },
    ])).toMatchObject({
      state: "verified",
      fields: { issuer_country: { value: "AE", raw: "ILARE", page: 2 } },
    });
  }
  expect(await verifyApprovedProfile(source, "EMIRATES_ID", "EMIRATES_ID", [
    { code: "issuer_country", value: "State of Qatar" },
  ])).toEqual({ state: "held", reason: "issuer_conflict" });
});

it("holds a known catalog profile that was outside the 24-profile owner approval", async () => {
  await writeWitnesses({ ...witness, profileId: "passport", typeCode: "PASSPORT_COPY" });
  expect(await verifyApprovedProfile(source, "PASSPORT_COPY")).toMatchObject({ state: "held", reason: "profile_unapproved" });
});

it("keeps fields outside the approved profile out of the trusted proposal", async () => {
  await writeWitnesses({ ...witness, fields: [name, { ...name, code: "outside_profile" }] });
  const result = await verifyApprovedProfile(source, "CV");
  expect(result).toMatchObject({ state: "verified" });
  expect(result).not.toHaveProperty("fields.outside_profile");
});

it("requires the preview opt-in and exact ALGT company scope", () => {
  expect(approvedProfilePreviewEnabled(1)).toBe(true);
  expect(approvedProfilePreviewEnabled(2)).toBe(false);
  expect(approvedProfilePreviewEnabled("1")).toBe(false);
  expect(approvedProfilePreviewEnabled(null)).toBe(false);
  vi.stubEnv(setting, "");
  expect(approvedProfilePreviewEnabled(1)).toBe(false);
  vi.stubEnv(setting, manifest);
});

it("gives specialty proof sole control of CICPA and training keys", () => {
  const generic = { raw: "generic OCR", value: "generic OCR", page: 1, label: "Generic" };
  const approved = {
    state: "verified", profileId: "cicpa-onshore", typeCode: "CICPA_PASS",
    fields: { cicpa_locations_arabic: generic, company_registration_number: generic, holder_name: generic },
  } as const;
  const specialty = { value: "7353", raw: "7353", page: 1, label: "Reverse-side Company Number", side: "reverse" };
  expect(mergeApprovedProfileFields(approved, { company_registration_number: specialty }, [
    "cicpa_locations_arabic", "company_registration_number",
  ])).toEqual({ holder_name: generic, company_registration_number: specialty });

  const training = {
    state: "verified", profileId: "onshore-induction", typeCode: "ADNOC_INDUCTION",
    fields: { issue_date: generic, expiry_date: generic, training_scope: generic },
  } as const;
  const printed = { value: "2027-05-09", raw: "9 May 2027", page: 1, label: "Printed Expiry Date" };
  expect(mergeApprovedProfileFields(training, { expiry_date: printed }, ["issue_date", "expiry_date"]))
    .toEqual({ training_scope: generic, expiry_date: printed });
});

it("keeps independent specialist evidence on a missing generic witness and withholds it on a conflict", () => {
  const specialist = { company_registration_number: { value: "7353", raw: "7353", page: 1, label: "Reverse-side Company Number" } };
  expect(retainSpecialistProof({ state: "held", reason: "witness_missing" })).toBe(true);
  expect(mergeApprovedProfileFields({ state: "held", reason: "witness_missing" }, specialist)).toEqual(specialist);
  for (const reason of ["witness_conflict", "type_conflict", "issuer_conflict", "source_mismatch", "witness_invalid"] as const) {
    expect(retainSpecialistProof({ state: "held", reason })).toBe(false);
    expect(mergeApprovedProfileFields({ state: "held", reason }, specialist)).toEqual({});
  }
});

it("rejects otherwise valid replacement registry bytes when the pin only authorizes the original bytes", async () => {
  await writeWitnesses(witness);
  expect(await verifyApprovedProfile(source, "CV")).toMatchObject({ state: "verified" });
  await writeFile(manifest, JSON.stringify({ ...baseRegistry, witnesses: [{
    ...witness, fields: [{ ...name, value: "Tampered Candidate" }],
  }] }));
  expect(await verifyApprovedProfile(source, "CV")).toMatchObject({ state: "held", reason: "registry_unavailable" });
});

it("requires an actual local-validation decision with officer review and reconciled required fields", async () => {
  for (const invalid of [
    undefined,
    { ...credentialDecision(1), requiredFieldCount: 0 },
    { ...credentialDecision(1), liveAuthorization: "granted" },
    { ...credentialDecision(1), officerReviewRequired: false },
  ]) {
    await writeWitnesses({ ...witness, credentialDecision: invalid });
    expect(await verifyApprovedProfile(source, "CV")).toMatchObject({ state: "held", reason: "witness_invalid" });
  }
});

it.each([
  ["onshore-induction", "ADNOC_INDUCTION"],
  ["offshore-induction", "ADNOC_INDUCTION"],
  ["h2s-training", "H2S_TRAINING_CERTIFICATE"],
] as const)("projects registered legacy fields from verified %s evidence", (profileId, typeCode) => {
  const participant = { value: "Test Holder", raw: "TEST HOLDER", page: 1, label: "Holder" };
  const provider = { value: "Verified Provider", raw: "VERIFIED PROVIDER", page: 1, label: "Training Provider" };
  const title = { value: "Verified Course", raw: "VERIFIED COURSE", page: 1, label: "Course" };
  const fields = mergeApprovedProfileFields({
    state: "verified", profileId, typeCode,
    fields: { participant_name: participant, provider, course_title: title },
  }, undefined);
  expect(fields).toMatchObject({ holder_name: participant, issuing_authority: provider, training_type: title });
  expect(fields.induction_date).toBeUndefined();
  if (profileId === "h2s-training") {
    expect(fields.certificate_level).toEqual({ ...title, value: "Level 2" });
  } else {
    expect(fields.certificate_level).toBeUndefined();
  }
});

it("does not introduce legacy training aliases outside the verified induction and H2S profiles", () => {
  const course = { value: "First Aid", raw: "FIRST AID", page: 1, label: "Course" };
  expect(mergeApprovedProfileFields({
    state: "verified", profileId: "first-aid-aed-cpr", typeCode: "TRAINING_AWARD",
    fields: { course_title: course },
  }, undefined)).toEqual({ course_title: course });
});
