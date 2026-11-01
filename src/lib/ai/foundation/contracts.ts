/** AI-MOD-01 contracts only. No retrieval, model calls or business mutations. */
import { z } from "zod";

export const AI_CONTRACT_VERSION = "erp-ai/1" as const;
export const aiId = z.number().int().positive().safe();
const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,99}$/);
const revision = z.string().min(1).max(160);
export const entityTypeSchema = z.enum(["company", "party", "branch", "site", "dms_document", "employee", "dependent"]);
export const entityReferenceSchema = z.strictObject({ entityType: entityTypeSchema, entityId: aiId });
export type AiEntityReference = z.infer<typeof entityReferenceSchema>;
export const aiOutcomeSchema = z.enum(["available", "clarification_required", "no_matches", "partial", "unavailable", "unsupported", "held"]);

export const evidenceSchema = z.strictObject({
  reference: entityReferenceSchema,
  sourceTable: identifier,
  field: identifier.nullable(),
  sourceVersion: revision,
  businessReference: z.string().min(1).max(200),
  accessPurpose: z.enum(["metadata", "content", "sensitive_field"]),
  fileId: aiId.nullable(),
  page: aiId.nullable(),
  snippet: z.string().max(500).nullable(),
  observedAt: z.iso.datetime({ offset: true }),
}).superRefine((value, ctx) => {
  if (value.page !== null && value.fileId === null) ctx.addIssue({ code: "custom", message: "A page needs an exact source file.", path: ["page"] });
});

export const capabilitySchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_.-]{2,99}$/),
  ownerModule: identifier,
  sourceFiles: z.array(z.string().regex(/^src\//)).min(1),
  sourceTables: z.array(identifier).min(1),
  sourceFields: z.array(z.strictObject({ table: identifier, field: identifier, authority: z.enum(["business_record", "reviewed_metadata", "unverified_extraction", "historical", "configuration"]) })).min(1),
  permissionCodes: z.array(z.string().min(1).max(120)).min(1),
  scope: z.enum(["record_parent", "company_branch", "global_configuration", "domain_owned"]),
  sensitivity: z.enum(["metadata", "content", "hr", "medical", "payroll", "administration"]),
  supportedFilters: z.array(identifier),
  countSemantics: z.enum(["exact_authorized", "bounded_preview", "not_applicable"]),
  disposition: z.enum(["existing_partial", "planned", "business_held", "unsupported"]),
  deliveryStage: z.enum(["AI-MOD-02", "AI-MOD-03", "AI-MOD-04", "AI-MOD-05"]),
  acceptanceCaseIds: z.array(z.string().min(1)).min(1),
});
export type AiCapability = z.infer<typeof capabilitySchema>;

export function validateCapabilityRegister(raw: unknown): AiCapability[] {
  const entries = z.array(capabilitySchema).parse(raw);
  if (new Set(entries.map(e => e.id)).size !== entries.length) throw new Error("Duplicate AI capability ID");
  return entries;
}

export const searchContractSchema = z.strictObject({
  contractVersion: z.literal(AI_CONTRACT_VERSION),
  capabilityId: z.string().min(3).max(100),
  query: z.string().trim().min(1).max(1000),
  mode: z.enum(["exact", "keyword", "content", "semantic", "ai"]),
  filters: z.array(z.strictObject({ field: identifier, operator: z.enum(["eq", "in", "gte", "lte"]), values: z.array(z.union([z.string().max(200), z.number().finite(), z.boolean()])).min(1).max(100) })).max(20),
  pageSize: z.number().int().min(1).max(100),
  cursor: z.string().max(1000).nullable(),
  context:entityReferenceSchema.optional(),
  metadataFilters:z.array(z.strictObject({field_code:identifier,value:z.string().min(1).max(200)})).max(20).optional(),
});

/** Client criteria are never authority. Unknown capabilities/fields stay held. */
export function validateRegisteredSearch(raw: unknown, register: readonly AiCapability[]) {
  const request = searchContractSchema.parse(raw);
  const entry = register.find(c => c.id === request.capabilityId);
  if (!entry || entry.disposition === "unsupported" || entry.disposition === "business_held") throw new Error("Unsupported or held AI capability");
  if (request.filters.some(f => !entry.supportedFilters.includes(f.field))) throw new Error("Unsupported AI filter");
  return request;
}

export const versionedPolicySchema = z.strictObject({
  businessCode: z.string().min(1).max(100),
  revision,
  ownerCompanyId: aiId,
  branchIds: z.array(aiId).max(100),
  state: z.enum(["draft", "approved", "superseded", "withdrawn"]),
  effectiveFrom: z.iso.date(),
  effectiveTo: z.iso.date().nullable(),
  evidence: z.array(evidenceSchema).min(1).max(20),
}).superRefine((v, ctx) => {
  if (v.effectiveTo && v.effectiveTo < v.effectiveFrom) ctx.addIssue({ code: "custom", message: "Invalid effective period" });
  if (new Set(v.branchIds).size !== v.branchIds.length) ctx.addIssue({ code: "custom", message: "Duplicate branch scope" });
});

export const processingProfileSchema = z.strictObject({
  businessCode: z.string().min(1).max(100), revision, documentTypeId: aiId,
  metadataFieldCodes: z.array(identifier).max(100),
  promptVersion: revision, outputSchemaVersion: revision,
  reminderPolicyReference: revision.nullable(),
  activation: z.enum(["draft", "evaluated", "approved", "active", "retired"]),
  approvedByUserProfileId: aiId.nullable(),
}).superRefine((v, ctx) => {
  if (["approved", "active"].includes(v.activation) && !v.approvedByUserProfileId) ctx.addIssue({ code: "custom", message: "Profile approval identity is required" });
});

export const feedbackSchema = z.strictObject({
  runReference: revision,
  category: z.enum(["wrong_person", "wrong_document", "incorrect_value", "unsupported_answer", "missing_result"]),
  sourceReferences: z.array(entityReferenceSchema).max(20),
  answerVersion: revision,
  correction: z.string().max(1000).nullable(),
});

export const approvalRouteSchema = z.strictObject({
  workflowCode: z.string().min(1).max(100), workflowRevision: revision,
  ownerCompanyId: aiId, documentTypeId: aiId, branchIds: z.array(aiId).max(100),
  originalSubmitterProfileId: aiId,
  steps: z.array(z.strictObject({
    stepCode: identifier,
    assignedUserProfileIds: z.array(aiId).min(1).max(50),
    decisionRule: z.enum(["one_assigned", "all_assigned"]),
    ruleBusinessApproved: z.literal(true),
    notificationReadiness: z.enum(["ready", "held_permission", "pending_delivery"]),
  })).min(1).max(20),
}).superRefine((v, ctx) => {
  if (new Set(v.steps.map(s => s.stepCode)).size !== v.steps.length) ctx.addIssue({ code: "custom", message: "Duplicate approval step" });
  for (const [i, step] of v.steps.entries()) {
    if (step.assignedUserProfileIds.includes(v.originalSubmitterProfileId)) ctx.addIssue({ code: "custom", message: "Self-approval is forbidden, including administrators", path: ["steps", i, "assignedUserProfileIds"] });
    if (new Set(step.assignedUserProfileIds).size !== step.assignedUserProfileIds.length) ctx.addIssue({ code: "custom", message: "Duplicate assignee", path: ["steps", i] });
  }
});

export const aiAnswerEnvelopeSchema = z.strictObject({
  contractVersion: z.literal(AI_CONTRACT_VERSION),
  outcome: aiOutcomeSchema,
  answer: z.string().max(4000).nullable(),
  evidence: z.array(evidenceSchema).max(20),
  returnedCount: z.number().int().nonnegative(),
  exactTotal: z.number().int().nonnegative().nullable(),
  completeness: z.enum(["complete", "preview", "partial", "unknown"]),
  rulesVersion: revision,
}).superRefine((v, ctx) => {
  if (v.exactTotal !== null && v.exactTotal < v.returnedCount) ctx.addIssue({ code: "custom", message: "Exact total cannot be smaller than the returned set" });
  if (v.outcome === "no_matches" && (v.completeness !== "complete" || v.returnedCount !== 0 || v.exactTotal !== 0)) ctx.addIssue({ code: "custom", message: "No matches requires a complete authorized empty read" });
  if (["unavailable", "unsupported", "held"].includes(v.outcome) && (v.evidence.length || v.returnedCount || v.exactTotal !== null)) ctx.addIssue({ code: "custom", message: "A held/failed response cannot expose source counts or evidence" });
});
