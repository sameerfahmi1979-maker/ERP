import { z } from "zod";
import { entityReferenceSchema, evidenceSchema, aiOutcomeSchema } from "@/lib/ai/foundation/contracts";

export const GUIDANCE_VERSION = "erp-assistant/3.1" as const;
export const questionSchema = z.strictObject({
  question: z.string().trim().min(1).max(1000),
  context: entityReferenceSchema.optional(),
});
/** A classifier selects a read adapter, never SQL, identities, prose facts or mutations. */
export const questionPlanSchema = z.strictObject({
  tool: z.enum(["documents", "expiry", "dependents", "record", "policy", "report", "briefing", "guidance", "approval", "unsupported"]),
  groupBy: z.enum(["none", "status", "type", "expiry", "company", "branch", "site"]).default("none"),
  period: z.enum(["any", "today", "this_month", "next_month", "next_30_days"]).default("any"),
});
export type QuestionPlan = z.infer<typeof questionPlanSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;
export type AssistantEvidence = z.infer<typeof evidenceSchema>;
export interface GuidanceAnswer {
  version: typeof GUIDANCE_VERSION;
  outcome: z.infer<typeof aiOutcomeSchema>;
  answer: string;
  links: Array<{ label: string; route: string }>;
  evidence: AssistantEvidence[];
  exactTotal: number | null;
  completeness: "complete" | "preview" | "partial" | "unknown";
  asOf: string;
  modelCalls: number;
  subject?: z.infer<typeof entityReferenceSchema>;
  /** Aggregates, policy applicability and child collections require fresh reads on replay. */
  replayable: boolean;
}

export const policyLibrarySchema = z.strictObject({
  version: z.literal(1),
  policies: z.array(z.strictObject({
    documentId: z.number().int().positive().safe(),
    companyId: z.number().int().positive().safe(),
    branchIds: z.array(z.number().int().positive().safe()).max(100),
    businessCode: z.string().trim().min(1).max(100),
    revision: z.string().trim().min(1).max(160),
    sourceVersionId: z.number().int().positive().safe(),
    effectiveFrom: z.iso.date(), effectiveTo: z.iso.date().nullable(),
    state: z.enum(["draft", "approved", "superseded", "withdrawn"]),
  }).superRefine((p, ctx) => {
    if (p.effectiveTo && p.effectiveTo < p.effectiveFrom) ctx.addIssue({ code: "custom", message: "Invalid policy period" });
    if (new Set(p.branchIds).size !== p.branchIds.length) ctx.addIssue({ code: "custom", message: "Duplicate branch applicability" });
  })).max(100),
}).superRefine((library, ctx) => {
  if (new Set(library.policies.map(p => `${p.businessCode}:${p.revision}`)).size !== library.policies.length) ctx.addIssue({ code: "custom", message: "Duplicate policy version" });
});
