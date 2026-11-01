import { describe, expect, it } from "vitest";
import { preparationApplySchema, preparationProfileSchema, preparationEvidenceSchema, preparationStartSchema, type ModelPreparation, type PreparationSnapshot } from "@/lib/dms/preparation/contracts";
import { buildPreparationCandidates, readablePreparationTitle, preparationPrompt } from "@/lib/dms/preparation/candidates";
import { comparePreparedSources, consistencyFindingIdentity, type ComparableSource } from "@/lib/dms/preparation/comparison";
const hash = "a".repeat(64), uuid = "11111111-1111-4111-8111-111111111111";
export const source: PreparationSnapshot = { documentId: 5, documentNo: "SYN-DOC-5", documentTypeId: 1, categoryId: 2, snapshot: hash, profileHash: hash, profile: null,
  current: { title: "Old title", description: "Keep", issue_date: "2026-01-01", expiry_date: "2027-01-01" },
  subject: { kind: "employee", id: 7, name: "SYNTHETIC عربي" }, typeName: "Passport", typeCode: "PASSPORT", existingTags: [{ id: 1, name: "Identity" }],
  fields: [{ id: 4, code: "number", label: "Number", type: "text", current: "OLD", required: true, aiExtractable: true }],
  files: [{ id: 2, versionId: 3, sha256: hash, name: "original.pdf", mime: "application/pdf", size: 10, text: "Passport NEW رقم عربي", bucket: null, path: null }] };
const output: ModelPreparation = { documentTypeCode: null, title: "Model title", description: null, summary: "Review only", issueDate: null, expiryDate: null,
  fields: [{ code: "number", value: "NEW", confidence: 0.9, fileId: 2, snippet: "Passport NEW" }], tagNames: ["IDENTITY", "New unregistered"], warnings: [], bundle: "single" };
describe("preparation candidates preserve accepted authority", () => {
  it("uses only verified context in readable titles and retains the original file", () => {
    const before = structuredClone(source), result = buildPreparationCandidates(source, output);
    expect(result.values.find(v => v.key === "title")?.proposed).toBe("Passport — SYNTHETIC عربي");
    expect(source).toEqual(before);
  });
  it("does not erase existing values with unknown/blank suggestions", () => {
    const result = buildPreparationCandidates(source, { ...output, description: " ", fields: [{ ...output.fields[0], value: null }] });
    expect(result.values.find(v=>v.key==="metadata:4")).toMatchObject({current:"OLD",proposed:"OLD",evidence:[],confidence:null});
  });
  it.each(["unknown", "number"])("withholds unsupported source claims for %s", code => {
    const r = buildPreparationCandidates(source, { ...output, fields: [{ ...output.fields[0], code, snippet: "invented quotation" }] });
    expect(r.values.find(v=>v.key==="metadata:4")).toMatchObject({proposed:"OLD",evidence:[],confidence:null});
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it("rejects invented file IDs and duplicate field entries", () => {
    const r = buildPreparationCandidates(source, { ...output, fields: [{ ...output.fields[0], fileId: 999 }, output.fields[0], output.fields[0]] });
    expect(r.values.filter(v => v.key === "metadata:4")).toHaveLength(1);
  });
  it("records precise file/version/hash with snippet-only precision", () => {
    const e = buildPreparationCandidates(source, output).values.find(v => v.key === "metadata:4")!.evidence[0];
    expect(e).toMatchObject({ fileId: 2, versionId: 3, sha256: hash, page: null, locationPrecision: "snippet", box: null });
  });
  it("does not invent tag definitions or entity links", () => {
    const r = buildPreparationCandidates(source, output); expect(r.tagIds).toEqual([1]); expect(r.linkCandidates).toEqual([]);
  });
  it.each(["possibly_multiple", "unknown"])("holds unverified bundle boundaries: %s", bundle => {
    expect(buildPreparationCandidates(source, { ...output, bundle }).readiness.split).toBe("held_unverified_boundaries");
  });
  it("withholds reversed dates", () => {
    const r = buildPreparationCandidates(source, { ...output, issueDate: "2027-01-01", expiryDate: "2026-01-01" });
    expect(r.values.some(v => v.key === "expiry_date")).toBe(false);
  });
  it("does not perform portrait OCR, dates, summary, metadata or face indexing", () => {
    const r = buildPreparationCandidates({ ...source, typeCode: "EMPLOYEE_PHOTO" }, { ...output, issueDate: "2026-01-01", expiryDate: "2027-01-01" });
    expect(r.values.map(v => v.key)).toEqual(["title"]); expect(r.values[0].proposed).toBe("Employee Photo — SYNTHETIC عربي");
    expect(r.summary).toBeNull(); expect(r.readiness.semantic).toBe("not_applicable"); expect(r.readiness.reminders).toBe("not_applicable");
  });
  it("never infers a portrait subject from a filename", () => {
    expect(readablePreparationTitle(null, null, null, "photo.person.jpg", true)).toBe("photo.person");
  });
  it("separates source text from instructions, and never includes storage paths in provider input", () => {
    const prompt = preparationPrompt({ ...source, files: [{ ...source.files[0], path: "private/path" }] });
    expect(prompt.system).toContain("untrusted"); expect(prompt.user).not.toContain("private/path"); expect(prompt.user).toContain("رقم عربي");
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid document identity %s", documentId => {
    expect(preparationStartSchema.safeParse({ documentId, requestId: uuid, snapshot: hash, mode: "reuse_text", fileIds: [2] }).success).toBe(false);
  });
  it("rejects duplicate selected files and unknown modes", () => {
    expect(preparationStartSchema.safeParse({ documentId: 5, requestId: uuid, snapshot: hash, mode: "reuse_text", fileIds: [2, 2] }).success).toBe(false);
    expect(preparationStartSchema.safeParse({ documentId: 5, requestId: uuid, snapshot: hash, mode: "auto_apply", fileIds: [2] }).success).toBe(false);
  });
  it.each(["owner_user_id", "document_no", "employee:7", "metadata:0", "title,title"])("does not accept protected targets: %s", target => {
    expect(preparationApplySchema.safeParse({ documentId: 5, jobId: 6, requestId: uuid, snapshot: hash, selections: [target], humanReviewConfirmed: true, replaceExistingConfirmed: true }).success).toBe(false);
  });
  it("does not accept model boxes without real parser evidence", () => {
    expect(preparationEvidenceSchema.safeParse({ fileId: 2, versionId: 3, sha256: hash, page: null, snippet: "x", locationPrecision: "parser_box", box: [0, 0, 1, 1] }).success).toBe(false);
  });
  it("requires profile evaluation and approval before activation", () => {
    const p = { version: 1, revision: 1, status: "active", applicability: "document", parser: "existing_ocr_router", promptVersion: "dms-preparation/1", schemaVersion: "dms-preparation/1", requiredFields: [], criticalFields: [], titlePattern: "suggested", reminders: "not_applicable", evaluationReference: null, approvedBy: null, approvedAt: null };
    expect(preparationProfileSchema.safeParse(p).success).toBe(false);
    expect(preparationProfileSchema.safeParse({ ...p, status: "draft" }).success).toBe(true);
  });
});
describe("exact selected comparison", () => {
  const a: ComparableSource = { documentId: 1, versionId: 2, sourceHash: hash, subjectKey: "employee:7", facts: [{ key: "amount", value: "10", unit: "tonne", currency: "AED", evidence: [] }], complete: true };
  it("compares actual values, preserving currency and units", () => {
    const result = comparePreparedSources(a, { ...a, documentId: 3, facts: [{ ...a.facts[0], currency: "USD" }] });
    expect(result.differences[0].status).toBe("different_units_or_currency"); expect(result.identity).toBe("same_verified_subject");
  });
  it("missing values or partial sources are never a clean match", () => {
    const result = comparePreparedSources(a, { ...a, subjectKey: null, complete: false, facts: [] });
    expect(result.identity).toBe("unresolved"); expect(result.complete).toBe(false); expect(result.differences[0].status).toBe("incomplete");
  });
  it("keys findings by exact source versions without discarding prior review dispositions", () => {
    expect(consistencyFindingIdentity("identity", "employee:7", [a, { ...a, documentId: 3 }])).toBe(consistencyFindingIdentity("identity", "employee:7", [{ ...a, documentId: 3 }, a]));
    expect(consistencyFindingIdentity("identity", "employee:7", [a])).not.toBe(consistencyFindingIdentity("identity", "employee:7", [{ ...a, versionId: 4 }]));
  });
});
