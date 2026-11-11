import { z } from "zod";

export const preparationId = z.number().int().positive().safe();
export const preparationHash = z.string().regex(/^[a-f0-9]{64}$/);
const boundedText = z.string().trim().min(1).max(16000);
export const preparationMode = z.enum(["reuse_text", "reread_files"]);
export const preparationReminderPolicySchema = z.strictObject({
  companyId: preparationId.nullable(), branchId: preparationId.nullable(),
  days: z.array(z.number().int().min(0).max(730)).min(1).max(20),
}).refine(p => (p.companyId !== null || p.branchId === null) && new Set(p.days).size === p.days.length, "Select a company for a branch; reminder days must be unique.");

/** Profiles extend the existing document-type master; they never establish identity or authority. */
export const preparationProfileSchema = z.strictObject({
  version: z.literal(1), revision: z.number().int().min(1),
  status: z.enum(["draft", "evaluated", "approved", "active", "retired"]),
  applicability: z.enum(["document", "portrait", "mixed_bundle"]),
  parser: z.literal("existing_ocr_router"), promptVersion: z.literal("dms-preparation/1"),
  schemaVersion: z.literal("dms-preparation/1"),
  requiredFields: z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/)).max(100),
  criticalFields: z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/)).max(100),
  titlePattern: z.enum(["type_subject", "suggested"]),
  reminders: z.union([z.literal("not_applicable"), z.strictObject({ policies: z.array(preparationReminderPolicySchema).min(1).max(100) })]),
  evaluationReference: z.string().trim().min(1).max(200).nullable(),
  approvedBy: preparationId.nullable(), approvedAt: z.iso.datetime({ offset: true }).nullable(),
}).superRefine((p, ctx) => {
  if (["approved", "active"].includes(p.status) && (!p.evaluationReference || !p.approvedBy || !p.approvedAt))
    ctx.addIssue({ code: "custom", message: "Evaluation and explicit approval are required." });
  if (p.applicability === "portrait" && p.reminders !== "not_applicable")
    ctx.addIssue({ code: "custom", message: "Portraits do not have document expiry reminders." });
  for (const list of [p.requiredFields, p.criticalFields])
    if (new Set<string | number>(list).size !== list.length) ctx.addIssue({ code: "custom", message: "Profile entries must be unique." });
  if (typeof p.reminders === "object" && new Set(p.reminders.policies.map(policy => `${policy.companyId}:${policy.branchId}`)).size !== p.reminders.policies.length)
    ctx.addIssue({ code: "custom", message: "Use one policy per company/branch scope." });
});
export type PreparationProfile = z.infer<typeof preparationProfileSchema>;

export const preparationEvidenceSchema = z.strictObject({
  fileId: preparationId, versionId: preparationId, sha256: preparationHash,
  page: z.number().int().min(1).max(100000).nullable(), snippet: z.string().min(1).max(2000),
  // Coordinates are accepted only from a parser, never from model output.
  locationPrecision: z.enum(["snippet", "page", "parser_box"]),
  box: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]).nullable(),
}).superRefine((e, c) => {
  if ((e.locationPrecision === "parser_box") !== (e.box !== null) || (e.locationPrecision !== "snippet" && e.page === null) ||
    (e.box && (e.box[2] <= e.box[0] || e.box[3] <= e.box[1])))
    c.addIssue({ code: "custom", message: "Evidence location is inconsistent." });
});
export type PreparationEvidence = z.infer<typeof preparationEvidenceSchema>;

export const modelPreparationSchema = z.strictObject({
  documentTypeCode: z.string().trim().max(100).nullable().default(null),
  title: z.string().trim().max(500).nullable(), description: z.string().trim().max(2000).nullable(),
  summary: z.string().trim().max(8000).nullable(),
  issueDate: z.iso.date().nullable(), expiryDate: z.iso.date().nullable(),
  fields: z.array(z.strictObject({ code: z.string().min(1).max(100), value: boundedText.nullable(),
    confidence: z.number().min(0).max(1), fileId: preparationId, snippet: z.string().max(2000).nullable() })).max(100),
  tagNames: z.array(z.string().trim().min(1).max(100)).max(30),
  warnings: z.array(z.string().trim().max(500)).max(30),
  bundle: z.enum(["single", "possibly_multiple", "unknown"]),
});
export type ModelPreparation = z.infer<typeof modelPreparationSchema>;

export const preparationStartSchema = z.strictObject({
  documentId: preparationId, requestId: z.uuid(), snapshot: preparationHash,
  mode: preparationMode, fileIds: z.array(preparationId).min(1).max(10),
}).refine(p => new Set(p.fileIds).size === p.fileIds.length, "Select each file once.");
export const preparationApplySchema = z.strictObject({
  documentId: preparationId, jobId: preparationId, requestId: z.uuid(), snapshot: preparationHash,
  selections: z.array(z.string().regex(/^(title|description|issue_date|expiry_date|document_type_id|metadata:[1-9][0-9]*)$/)).max(50),
  edits: z.record(z.string().regex(/^(title|description|issue_date|expiry_date|metadata:[1-9][0-9]*)$/), boundedText).optional(),
  humanReviewConfirmed: z.literal(true), replaceExistingConfirmed: z.boolean(), refreshDerivedConfirmed:z.boolean().default(false),
}).refine(p => (p.selections.length>0||p.refreshDerivedConfirmed) && new Set(p.selections).size === p.selections.length && Object.keys(p.edits ?? {}).every(k => p.selections.includes(k)), "Select each value once and edit only selected values.");

export const preparationFileSchema = z.strictObject({
  id: preparationId, versionId: preparationId, sha256: preparationHash,
  name: z.string().max(1000), mime: z.string().max(200), size: z.number().int().positive().max(52428800),
  text: z.string().max(100000).nullable(), bucket: z.string().nullable(), path: z.string().nullable(),
});
export const preparationSnapshotSchema = z.strictObject({
  documentId: preparationId, documentNo: z.string(), snapshot: preparationHash,
  documentTypeId: preparationId, categoryId: preparationId,
  current: z.strictObject({ title: z.string(), description: z.string().nullable(), issue_date: z.string().nullable(), expiry_date: z.string().nullable() }),
  profileState:z.enum(["not_configured","draft","evaluated","approved","active","retired","schema_review_required"]).optional(),
  profile: preparationProfileSchema.nullable(), profileHash: preparationHash,
  subject: z.strictObject({ kind: z.enum(["employee", "employee_dependent", "company"]), id: preparationId, name: z.string() }).nullable(),
  typeName: z.string().nullable(), typeCode: z.string().nullable(), fields: z.array(z.strictObject({ id: preparationId, code: z.string(), label: z.string(), type: z.string(), current: z.string().nullable(), required: z.boolean(), aiExtractable: z.boolean().default(false) })).max(250),
  files: z.array(preparationFileSchema).max(100),
  existingTags: z.array(z.strictObject({ id: preparationId, name: z.string() })).max(1000),
});
export type PreparationSnapshot = z.infer<typeof preparationSnapshotSchema>;
export const preparationDraftValuesSchema = z.strictObject({
  selections: z.array(z.string().regex(/^(title|description|issue_date|expiry_date|document_type_id|metadata:[1-9][0-9]*)$/)).max(50),
  edits: z.record(z.string().regex(/^(title|description|issue_date|expiry_date|metadata:[1-9][0-9]*)$/), z.string().max(16000)),
  refreshDerived: z.boolean(),
}).refine(v => new Set(v.selections).size === v.selections.length);
export const preparationDraftSaveSchema = z.strictObject({
  documentId: preparationId, jobId: preparationId, requestId: z.uuid(), snapshot: preparationHash,
  expectedRevision: z.number().int().min(0).max(2147483646), values: preparationDraftValuesSchema,
});
export const preparationReviewOpenSchema = z.strictObject({
  source: preparationSnapshotSchema, documentStatus: z.string(), approvalStatus: z.string().nullable(),
  recovery: z.strictObject({ jobId: preparationId, requestId: z.uuid(), snapshot: preparationHash,
    mode: preparationMode, fileIds: z.array(preparationId).min(1).max(10), state: z.string() }).nullable(),
  draft: z.strictObject({revision: z.number().int().positive(), snapshot: preparationHash,
    current: z.boolean(), values: preparationDraftValuesSchema}).nullable(),
});
export const preparationStageReceipt = z.strictObject({ success: z.literal(true), state: z.enum(["started", "completed", "uncertain"]), value: z.unknown().nullable() });

export const duplicateAdvisorySchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("no_visible_match"), authoritative: z.literal(false) }),
  z.strictObject({ status: z.literal("existing_document"), authoritative: z.literal(false), documentId: preparationId, documentNo: z.string(), title: z.string() }),
  z.strictObject({ status: z.literal("retained_upload"), authoritative: z.literal(false), sessionCode: z.string() }),
]);
export type DuplicateAdvisory = z.infer<typeof duplicateAdvisorySchema>;
