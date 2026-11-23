import { mkdtemp, rm, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { applyIntakeCicpaWording, applySavedCicpaWording } from "@/server/dms-cicpa-wording-review";
import type { DmsAiOutput } from "@/lib/dms/ai/types";
import { preparationSnapshotSchema, type ModelPreparation } from "@/lib/dms/preparation/contracts";

const sha256 = "a".repeat(64);
const original = { sha256, mime: "application/pdf" };
const exact = "جميع مواقع الاختبار /م المنطقة الصناعية\n/محطة الاختبار";
const reverseCompany = { page: 2, bounds: [5, 8, 90, 21], text: "0073" };
const witness = { sourceSha256: sha256, page: 1, bounds: [20, 35, 180, 71], text: exact, reverseCompany };
const received = [{
  fieldCode: "company_registration_number", value: "9999", sourceSnippet: "9999", confidenceLabel: "high", confidenceScore: 0.9,
} as const];
const output: DmsAiOutput = {
  classification: { suggestedTypeCode: "CICPA_PASS", suggestedTypeId: 5, confidenceScore: 1, confidenceLabel: "high", reason: "" },
  extraction: {
    fields: received, additionalFields: [{ label: "Company Registration Number", value: "1111", confidenceScore: 1 }],
    suggestedTitle: "CICPA Pass", suggestedDescription: null, issueDateSuggestion: null, expiryDateSuggestion: null, fullTextTranscription: null,
  },
  suggestedLinks: [], detectedEntities: [], warnings: [],
};
const prepared: ModelPreparation = {
  fields: [{ code: "company_registration_number", fileId: 10, value: "9999", snippet: "9999", confidence: 0.9 }],
  documentTypeCode: "CICPA_PASS", title: "CICPA Pass", description: null, summary: null,
  issueDate: null, expiryDate: null, tagNames: [], warnings: [], bundle: "single",
};
const source = preparationSnapshotSchema.parse({
  documentId: 1, documentNo: "DMS-TEST", snapshot: sha256, documentTypeId: 5, categoryId: 2,
  current: { title: "CICPA Pass", description: null, issue_date: null, expiry_date: null },
  profile: null, profileHash: sha256, subject: null, typeName: "CICPA Pass", typeCode: "CICPA_PASS",
  fields: [{ id: 30, code: "company_registration_number", label: "Company Number", type: "text", current: null, required: false, aiExtractable: true }],
  files: [{ id: 10, versionId: 11, sha256, name: "pass.pdf", mime: "application/pdf", size: 100, text: null, bucket: null, path: null }],
  existingTags: [],
});

let directory: string;
let manifest: string;
beforeAll(async () => {
  directory = await mkdtemp(join(process.cwd(), ".test-cicpa-reverse-review-"));
  manifest = join(directory, "witness.json");
  vi.stubEnv("DMS_ALGT_CICPA_WORDING_PREVIEW_FILE", manifest);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  if (!directory) return;
  await rm(manifest, { force: true });
  await rmdir(directory);
});

it("projects separate reviewed crop evidence in both workflows and keeps line breaks and leading zeroes", async () => {
  await writeFile(manifest, JSON.stringify({ version: 1, witnesses: [witness] }));

  const fresh = await applyIntakeCicpaWording(output, original);
  expect(fresh.output.extraction.fields).toEqual(expect.arrayContaining([
    expect.objectContaining({ fieldCode: "cicpa_locations_arabic", value: exact }),
    expect.objectContaining({ fieldCode: "company_registration_number", value: "0073" }),
  ]));
  expect(fresh.output.extraction.additionalFields).toEqual([]);

  const saved = await applySavedCicpaWording(source, prepared, original);
  expect(saved.trusted).toMatchObject({
    sha256, fileId: 10, fields: {
      cicpa_locations_arabic: { value: exact, page: 1, region: "locations", side: "front" },
      company_registration_number: { value: "0073", page: 2, region: "reverse-company", side: "reverse", bounds: reverseCompany.bounds },
    },
  });
  expect(saved.output.fields).toEqual([]);
});

it("never substitutes an OCR company number when the reviewed crop is missing, invalid or bound to a different PDF", async () => {
  const invalid = { ...witness, reverseCompany: { ...reverseCompany, bounds: [5, 8, 3, 21] } };
  await writeFile(manifest, JSON.stringify({ version: 1, witnesses: [invalid] }));
  const partial = await applyIntakeCicpaWording(output, original);
  expect(partial.output.extraction.fields).toEqual([
    expect.objectContaining({ fieldCode: "cicpa_locations_arabic", value: exact }),
  ]);
  expect(partial.output.extraction.additionalFields).toEqual([]);

  await writeFile(manifest, JSON.stringify({ version: 1, witnesses: [witness] }));
  const changed = await applySavedCicpaWording(source, prepared, { ...original, sha256: "b".repeat(64) });
  expect(changed.trusted).toBeUndefined();
  expect(changed.output.fields).toEqual([]);
});

it("withholds a reverse crop that overlaps the location crop on the same page", async () => {
  const overlapping = { ...witness, reverseCompany: { ...reverseCompany, page: witness.page, bounds: [12, 36, 120, 50] } };
  await writeFile(manifest, JSON.stringify({ version: 1, witnesses: [overlapping] }));

  const fresh = await applyIntakeCicpaWording(output, original);
  expect(fresh.output.extraction.fields).toEqual([
    expect.objectContaining({ fieldCode: "cicpa_locations_arabic", value: exact }),
  ]);
  const saved = await applySavedCicpaWording(source, prepared, original);
  expect(saved.trusted?.fields.company_registration_number).toBeUndefined();

  const separate = { ...overlapping, reverseCompany: { ...overlapping.reverseCompany, bounds: [20, 71, 180, 104] } };
  await writeFile(manifest, JSON.stringify({ version: 1, witnesses: [separate] }));
  const allowed = await applySavedCicpaWording(source, prepared, original);
  expect(allowed.trusted?.fields.company_registration_number).toMatchObject({ page: 1, value: "0073" });
});
