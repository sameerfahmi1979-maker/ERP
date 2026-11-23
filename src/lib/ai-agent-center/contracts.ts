import { z } from "zod";

export const AGENT_CENTER_PERMISSIONS = ["dms.documents.view", "dms.admin"];
export const MODULES = [
  { id: "all", label: "All modules" },
  { id: "dms", label: "DMS" },
  { id: "hr", label: "HR" },
  { id: "fleet", label: "Fleet" },
  { id: "workshop", label: "Workshop" },
] as const;

export const AGENTS = [
  { id: "dms.intake", key: "intake", label: "Intake", module: "dms" },
  { id: "dms.extraction", key: "extraction", label: "AI Extraction", module: "dms" },
  { id: "dms.validation", key: "validation", label: "Validation", module: "dms" },
  { id: "dms.erp-linking", key: "linking", label: "ERP Linking", module: "dms" },
  { id: "dms.catalog-quality", key: "catalog", label: "Catalog Quality", module: "dms" },
  { id: "dms.document-search", key: "search", label: "Document Search", module: "dms" },
  { id: "dms.expiry-renewal", key: "renewal", label: "Expiry & Renewal", module: "dms" },
] as const;

export type Agent = (typeof AGENTS)[number];
export type AgentModule = (typeof MODULES)[number]["id"];

export function registeredModules(registry: readonly { module: string }[] = AGENTS) {
  return MODULES.filter(({ id }) => id !== "all" && registry.some(agent => agent.module === id)).map(({ id }) => id);
}

export function agentsInModule<T extends { module: string }>(module: AgentModule, registry: readonly T[]) {
  return registry.filter(agent => module === "all" || agent.module === module);
}

const id = z.number().int().positive();
const timestamp = z.iso.datetime({ offset: true });
const outcome = z.enum(["filed", "duplicate", "review", "failed"]);

export const agentCenterQuerySchema = z.strictObject({
  companyId: id.optional(),
  branchId: id.nullable().optional(),
  search: z.string().trim().max(200).default(""),
  outcome: outcome.nullable().default(null),
  caseId: z.uuid().nullable().default(null),
  offset: z.number().int().min(0).max(5000).default(0),
}).refine(query => !query.branchId || !!query.companyId);

export type AgentCenterQuery = z.input<typeof agentCenterQuerySchema>;
export type Outcome = z.infer<typeof outcome>;

export const agentCenterCaseSchema = z.strictObject({
  id: z.uuid(),
  title: z.string().min(1).max(1024),
  sessionCode: z.string().regex(/^[A-Za-z0-9_-]+$/).max(100).nullable(),
  documentId: id.nullable(),
  dmsNumber: z.string().max(100).nullable(),
  stage: z.enum(["intake", "extraction", "validation", "linking"]),
  status: z.enum(["queued", "running", "review", "filed", "duplicate", "failed", "exception"]),
  discoveredAt: timestamp.nullable(),
  uploadedAt: timestamp.nullable(),
  startedAt: timestamp.nullable(),
  analysisFinishedAt: timestamp.nullable(),
  waitingSince: timestamp.nullable(),
  finishedAt: timestamp.nullable(),
  updatedAt: timestamp,
});

export type AgentCenterCase = z.infer<typeof agentCenterCaseSchema>;

export const agentCenterSnapshotSchema = z.strictObject({
  scope: z.strictObject({ companyId: id, branchId: id.nullable(), company: z.string(), branch: z.string() }),
  choices: z.array(z.strictObject({ id, label: z.string(), branches: z.array(z.strictObject({ id, label: z.string() })) })),
  totals: z.strictObject({
    filed: z.number().int().nonnegative().nullable(),
    duplicate: z.number().int().nonnegative().nullable(),
    review: z.number().int().nonnegative().nullable(),
    failed: z.number().int().nonnegative().nullable(),
  }),
  cases: z.array(agentCenterCaseSchema).max(50),
  selectedCase: agentCenterCaseSchema.nullable(),
  attention: agentCenterCaseSchema.nullable(),
  checkpoint: z.strictObject({ lastCheckedAt: timestamp, policyEnabled: z.boolean(), paused: z.boolean() }).nullable(),
  workerHeartbeatAt: timestamp.optional(),
  laneActivity: z.strictObject({ intakeRunning: z.boolean(), extractionRunning: z.boolean(), reviewWaiting: z.boolean() }),
  intakeProgress: z.strictObject({ completedUnits: z.number().int().nonnegative(), totalUnits: id })
    .refine(progress => progress.completedUnits <= progress.totalUnits).nullable(),
  confirmedAt: timestamp,
  hasMore: z.boolean(),
});

export type AgentCenterSnapshot = z.infer<typeof agentCenterSnapshotSchema>;
