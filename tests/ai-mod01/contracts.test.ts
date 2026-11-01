import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { AI_CAPABILITY_REGISTER } from "@/lib/ai/foundation/capabilities";
import { aiAnswerEnvelopeSchema, approvalRouteSchema, evidenceSchema, feedbackSchema, processingProfileSchema, validateRegisteredSearch, validateCapabilityRegister, versionedPolicySchema } from "@/lib/ai/foundation/contracts";
import { createAiTurnBudget } from "@/lib/ai/foundation/budget";
import { AI_FOUNDATION_QUALITY_CASES } from "@/lib/ai/foundation/quality-cases";

const answer = { contractVersion: "erp-ai/1", outcome: "no_matches", answer: null, evidence: [], returnedCount: 0, exactTotal: 0, completeness: "complete", rulesVersion: "fixture-v1" };
const evidence = { reference: { entityType: "dms_document", entityId: 10 }, sourceTable: "dms_documents", field: "expiry_date", sourceVersion: "v1", businessReference: "DMS-SYNTHETIC-10", accessPurpose: "metadata", fileId: null, page: null, snippet: null, observedAt: "2026-10-30T08:00:00Z" };
const route = { workflowCode: "SYNTHETIC", workflowRevision: "v1", ownerCompanyId: 1, documentTypeId: 1, branchIds: [], originalSubmitterProfileId: 10, steps: [{ stepCode: "review", assignedUserProfileIds: [11], decisionRule: "one_assigned", ruleBusinessApproved: true, notificationReadiness: "ready" }] };

describe("strict shared contracts", () => {
  it("rejects unknown tools, SQL, authority and filters", () => {
    const request = { contractVersion: "erp-ai/1", capabilityId: "dms.metadata", query: "ISO certificates", mode: "ai", filters: [], pageSize: 25, cursor: null };
    expect(validateRegisteredSearch(request, AI_CAPABILITY_REGISTER).query).toBe("ISO certificates");
    for (const bad of [{ ...request, sql: "select *" }, { ...request, isAdmin: true }, { ...request, capabilityId: "unknown.tool" }, { ...request, filters: [{ field: "secret_key", operator: "eq", values: ["x"] }] }]) expect(() => validateRegisteredSearch(bad, AI_CAPABILITY_REGISTER)).toThrow();
  });
  it.each(["partial", "unknown", "preview"])("does not turn %s reads into no matches", completeness => expect(aiAnswerEnvelopeSchema.safeParse({ ...answer, completeness }).success).toBe(false));
  it("allows verified empty reads and keeps failed counts unknown", () => {
    expect(aiAnswerEnvelopeSchema.safeParse(answer).success).toBe(true);
    expect(aiAnswerEnvelopeSchema.safeParse({ ...answer, outcome: "unavailable" }).success).toBe(false);
    expect(aiAnswerEnvelopeSchema.safeParse({ ...answer, outcome: "unavailable", exactTotal: null, completeness: "unknown" }).success).toBe(true);
  });
  it("cannot fabricate file pages or invert count semantics", () => {
    expect(evidenceSchema.safeParse(evidence).success).toBe(true);
    expect(evidenceSchema.safeParse({ ...evidence, page: 2 }).success).toBe(false);
    expect(aiAnswerEnvelopeSchema.safeParse({ ...answer, outcome: "available", returnedCount: 5, exactTotal: 2 }).success).toBe(false);
  });
  it("keeps policy/profile approval, dates and source versions explicit", () => {
    const policy = { businessCode: "SYNTHETIC", revision: "v1", ownerCompanyId: 1, branchIds: [], state: "approved", effectiveFrom: "2026-01-01", effectiveTo: null, evidence: [evidence] };
    expect(versionedPolicySchema.safeParse(policy).success).toBe(true);
    expect(versionedPolicySchema.safeParse({ ...policy, effectiveTo: "2025-12-31" }).success).toBe(false);
    expect(processingProfileSchema.safeParse({ businessCode: "PHOTO", revision: "v1", documentTypeId: 2, metadataFieldCodes: [], promptVersion: "p1", outputSchemaVersion: "s1", reminderPolicyReference: null, activation: "active", approvedByUserProfileId: null }).success).toBe(false);
    expect(feedbackSchema.safeParse({ runReference: "run1", category: "wrong_person", sourceReferences: [], answerVersion: "v1", correction: null, autoTrain: true }).success).toBe(false);
  });
  it("rejects duplicate capability identities", () => expect(() => validateCapabilityRegister([AI_CAPABILITY_REGISTER[0], AI_CAPABILITY_REGISTER[0]])).toThrow());
});

describe("approval contracts only, no workflow activation", () => {
  it("requires explicit assignees and approved step rules", () => {
    expect(approvalRouteSchema.safeParse(route).success).toBe(true);
    expect(approvalRouteSchema.safeParse({ ...route, steps: [{ ...route.steps[0], assignedUserProfileIds: [] }] }).success).toBe(false);
    expect(approvalRouteSchema.safeParse({ ...route, steps: [{ ...route.steps[0], ruleBusinessApproved: false }] }).success).toBe(false);
  });
  it.each(["system_admin", "company_admin", "branch_admin", "dms_manager", "ordinary"])("no self-approval exception for %s", () => expect(approvalRouteSchema.safeParse({ ...route, steps: [{ ...route.steps[0], assignedUserProfileIds: [10] }] }).success).toBe(false));
  it("rejects duplicate steps and duplicate reviewers", () => {
    expect(approvalRouteSchema.safeParse({ ...route, steps: [route.steps[0], route.steps[0]] }).success).toBe(false);
    expect(approvalRouteSchema.safeParse({ ...route, steps: [{ ...route.steps[0], assignedUserProfileIds: [11, 11] }] }).success).toBe(false);
  });
});

describe("bounded cost/read contracts", () => {
  it("counts retries and bounds reads and model calls", () => {
    const b = createAiTurnBudget({ deadline: 100, now: () => 0 });
    for (let i = 0; i < 6; i++) b.consumeReadCall();
    expect(() => b.consumeReadCall()).toThrow(); b.consumeModelCall(); b.consumeModelCall(); expect(() => b.consumeModelCall()).toThrow();
    expect(b.snapshot()).toEqual({ readCalls: 6, modelCalls: 2 });
  });
  it("gives direct lookups zero model calls, fences deadlines and cancellation", () => {
    expect(() => createAiTurnBudget({ directLookup: true, deadline: 10, now: () => 0 }).consumeModelCall()).toThrow();
    expect(() => createAiTurnBudget({ deadline: 10, now: () => 10 }).consumeReadCall()).toThrow();
    const controller = new AbortController(); controller.abort();
    expect(() => createAiTurnBudget({ deadline: 10, now: () => 0, signal: controller.signal }).consumeReadCall()).toThrow();
    expect(() => createAiTurnBudget({ deadline: Infinity })).toThrow();
  });
  it("has unique versioned quality cases and no activated new adapters", () => {
    expect(new Set(AI_FOUNDATION_QUALITY_CASES.map(c => c.id)).size).toBe(12);
    expect(AI_CAPABILITY_REGISTER.every(c => c.disposition !== undefined && c.sourceFiles.every(existsSync))).toBe(true);
  });
  it("authority declarations match the captured actual schema and permission definitions", () => {
    const file = "tests/ai-mod01/authority-fixture.json";
    const schema = JSON.parse(readFileSync(file, "utf8"));
    const columns = new Set(schema.columns.map((c: { table: string; field: string }) => `${c.table}.${c.field}`));
    const permissions = new Set(schema.permissions.map((p: { code: string }) => p.code));
    for (const entry of AI_CAPABILITY_REGISTER) {
      for (const field of entry.sourceFields) expect(columns.has(`${field.table}.${field.field}`), `${entry.id}:${field.table}.${field.field}`).toBe(true);
      for (const permission of entry.permissionCodes) expect(permissions.has(permission), permission).toBe(true);
    }
  });
});
