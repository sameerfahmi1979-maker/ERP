import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifiedAggregate, verifiedHead, verifiedPreview } from "@/server/reads/verified-aggregate";
import { buildUsageSnapshot, type UsageRow } from "@/lib/ai/observability/usage-summary";
import type { ObservabilityFilters, PipelineHealthData, JobQueueObservabilityData } from "@/server/actions/dms/ai-observability";

const date = z.string().date().nullish();
const label = z.string().trim().min(1).max(120).nullish();
const filtersSchema = z.object({ dateFrom: date, dateTo: date, featureArea: label, operationType: label, modelId: label, status: label, documentId: z.number().int().positive().nullish() }).strict();
export function observabilityWindow(filters: ObservabilityFilters) {
  const parsed = filtersSchema.parse(filters);
  if (parsed.dateFrom && parsed.dateTo && parsed.dateFrom > parsed.dateTo) throw Error("Invalid date range");
  const from = parsed.dateFrom ? new Date(`${parsed.dateFrom}T00:00:00+04:00`).toISOString() : undefined;
  const until = parsed.dateTo ? new Date(Date.parse(`${parsed.dateTo}T00:00:00+04:00`) + 86_400_000).toISOString() : undefined;
  return { ...parsed, from, until };
}
/** Caller must authorize global monitoring first. No shared cache or provider call. */
export async function readDmsUsage(filters: ObservabilityFilters) {
  const f = observabilityWindow(filters);
  const db = createAdminClient();
  const asOf = new Date().toISOString();
  const signal = AbortSignal.timeout(15_000);
  const { data } = await verifiedAggregate<UsageRow>((from, to) => {
    let q = db.from("erp_ai_usage_logs").select("id,feature_area,operation_type,model_id,provider_config_id,status,input_token_count,output_token_count,estimated_cost,duration_ms,document_id,created_at,error_message,cost_currency:metadata_json->>cost_currency", { count: "exact" })
      .lte("created_at", asOf).order("id", { ascending: true });
    if (f.from) q = q.gte("created_at", f.from);
    if (f.until) q = q.lt("created_at", f.until);
    if (f.featureArea) q = q.eq("feature_area", f.featureArea);
    if (f.operationType) q = q.eq("operation_type", f.operationType);
    if (f.modelId) q = q.eq("model_id", f.modelId);
    if (f.status === "failed") q = q.in("status", ["failed", "failure", "error"]);
    else if (f.status) q = q.eq("status", f.status);
    if (f.documentId) q = q.eq("document_id", f.documentId);
    return q.range(from, to).abortSignal(signal);
  });
  return buildUsageSnapshot(data, asOf);
}
export async function readDmsQueueHealth(): Promise<JobQueueObservabilityData> {
  const db = createAdminClient();
  const signal = AbortSignal.timeout(15_000);
  const count = (status: string) => verifiedHead(db.from("dms_ai_job_queue").select("id", { count: "exact", head: true }).eq("job_status", status).abortSignal(signal));
  const jobSchema = z.object({ id: z.number().int().positive(), job_type: z.string(), job_status: z.string(), related_document_id: z.number().int().positive().nullable(), attempt_count: z.number().int().nonnegative(), max_attempts: z.number().int().nonnegative(), created_at: z.string().datetime({ offset: true }), completed_at: z.string().nullable() });
  const [queued, running, completed, failed, retry, recent, oldest] = await Promise.all([
    count("queued"), count("running"), count("completed"), count("failed"), count("retry_scheduled"),
    verifiedPreview(db.from("dms_ai_job_queue").select("id,job_type,job_status,related_document_id,attempt_count,max_attempts,created_at,completed_at", { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(20).abortSignal(signal), 20),
    verifiedPreview(db.from("dms_ai_job_queue").select("id,created_at", { count: "exact" }).in("job_status", ["queued", "retry_scheduled"]).order("created_at").order("id").limit(1).abortSignal(signal), 1),
  ]);
  const oldestAt = z.object({ id: z.number().int().positive(), created_at: z.string().datetime({ offset: true }) }).array().parse(oldest.data)[0]?.created_at ?? null;
  return { queuedCount: queued.count, runningCount: running.count, completedCount: completed.count, failedCount: failed.count, retryScheduledCount: retry.count, oldestWaitingAt: oldestAt, asOf: new Date().toISOString(),
    recentJobs: jobSchema.array().parse(recent.data).map(j => ({ id: j.id, jobType: j.job_type, jobStatus: j.job_status, relatedDocumentId: j.related_document_id, attemptCount: j.attempt_count, maxAttempts: j.max_attempts, createdAt: j.created_at, completedAt: j.completed_at })) };
}
export async function readDmsPipelineHealth(): Promise<PipelineHealthData> {
  const db = createAdminClient();
  const signal = AbortSignal.timeout(15_000);
  const spec: Array<[Exclude<keyof PipelineHealthData,"asOf">, string, Record<string, string | boolean>, boolean]> = [
    ["documentsWithPendingAi", "dms_documents", { ai_status: "pending" }, true],
    ["documentsAiProcessing", "dms_documents", { ai_status: "processing" }, true],
    ["documentsAiFailed", "dms_documents", { ai_status: "failed" }, true],
    ["documentsAiComplete", "dms_documents", { ai_status: "complete" }, true],
    ["pendingEmbeddingChunks", "dms_document_content_chunks", { embedding_status: "pending", is_active: true }, true],
    ["failedEmbeddingChunks", "dms_document_content_chunks", { embedding_status: "failed", is_active: true }, true],
    ["reviewQueueOpen", "dms_review_queue", { status: "open" }, true],
    ["reviewQueueHighPriority", "dms_review_queue", { status: "open", priority: "high" }, true],
    ["validationFindingsOpen", "dms_ai_validation_findings", { status: "open" }, true],
    ["entityMatchCandidatesPending", "dms_ai_entity_match_candidates", { status: "pending" }, true],
  ];
  const result = {} as PipelineHealthData;
  // Four concurrent counts at most; no broad row transfer or serial per-card waterfall.
  for (let offset = 0; offset < spec.length; offset += 4) await Promise.all(spec.slice(offset, offset + 4).map(async ([key, table, filters, softDelete]) => {
    let q = db.from(table).select("id", { count: "exact", head: true });
    if (softDelete) q = q.is("deleted_at", null);
    for (const [field, value] of Object.entries(filters)) q = q.eq(field, value);
    result[key] = (await verifiedHead(q.abortSignal(signal))).count;
  }));
  return {...result,asOf:new Date().toISOString()};
}
