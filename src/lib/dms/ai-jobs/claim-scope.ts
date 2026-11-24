import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { setServerLogContextFilter } from "@/lib/log-context";
import type { SemanticPublicationExpectation } from "@/lib/dms/semantic/semantic-publication";

export type JobClaim = { jobId: number; token: string; workerId: string; attemptNumber: number };
type Scope = JobClaim & { failed: boolean; uncertainWrite: boolean; semanticPublication?: SemanticPublicationExpectation };
const claims = new AsyncLocalStorage<Scope>();
setServerLogContextFilter((message, context) => {
  const claim = claims.getStore();
  return claim ? { message: "[ai-job] worker diagnostic", context: { jobId: claim.jobId, attemptNumber: claim.attemptNumber } } : { message, context };
});
export const currentJobClaim = () => claims.getStore();
export function runWithJobClaim<T>(claim: JobClaim, work: () => PromiseLike<T> | T): Promise<T> {
  // PostgREST builders are lazy thenables. Await them while the scope is still
  // active, rather than returning a builder that can execute after run() exits.
  return claims.run({ ...claim, failed: false, uncertainWrite: false }, async () => await work());
}

// Every worker mutation travels through a database trigger holding the claim
// lock for the statement. Unknown paths fail closed, including RPC/Storage
// writes. This scope does not change any interactive/OCR caller outside jobs.
export const JOB_OUTPUT_TABLES = new Set([
  "dms_documents", "dms_document_files", "dms_document_content",
  "dms_ai_tag_suggestions", "dms_ai_link_suggestions",
  "dms_upload_sessions", "dms_document_types", "dms_review_queue", "erp_ai_usage_logs",
]);
const JOB_RPCS = new Set(["f07_ai_worker", "f07_ai_metadata_suggestions", "ai_mod04_preparation_worker", "ai_mod05_model_gate"]);

function scopedRpcRequest(body: RequestInit["body"], claim: JobClaim): { action: string; documentId: unknown } | undefined {
  if (typeof body !== "string") return;
  try {
    const { p_action: action, p_data: data } = JSON.parse(body);
    if (typeof action === "string" && data?.jobId === claim.jobId && data.token === claim.token) {
      return { action, documentId: data.documentId };
    }
  } catch { return; }
}

export function jobScopedFetch(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    const claim = currentJobClaim();
    if (!claim) return base(input, init);
    if (claim.failed) throw new Error("AI job claim operation failed; reconcile before retry.");
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const mutation = !["GET", "HEAD"].includes(method);
    const table = url.pathname.match(/^\/rest\/v1\/([a-z][a-z0-9_]+)$/)?.[1];
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z][a-z0-9_]+)$/)?.[1];
    const semanticRpc = rpc === "f07_semantic_index";
    const workerRpc = rpc === "f07_ai_worker";
    const request = (semanticRpc || workerRpc) && method === "POST" ? scopedRpcRequest(init?.body, claim) : undefined;
    const documentId = request?.documentId;
    const validSemanticRequest = typeof documentId === "number" && Number.isSafeInteger(documentId) && documentId > 0 &&
      (request?.action === "inspect" || request?.action === "publish");
    if ((semanticRpc && !validSemanticRequest) || (mutation && !semanticRpc &&
      !(table && JOB_OUTPUT_TABLES.has(table)) && !(rpc && JOB_RPCS.has(rpc)))) {
      claim.failed = true;
      throw new Error("AI worker mutation is outside the suggestion/derived-output allowlist.");
    }
    if (!url.pathname.startsWith("/rest/v1/")) return base(input, init);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
    headers.set("x-algt-ai-job", String(claim.jobId));
    headers.set("x-algt-ai-claim", claim.token);
    const canChangeOutputs = mutation && !(semanticRpc && request?.action === "inspect") &&
      !(workerRpc && request?.action === "assert");
    try {
      const response = await base(input, { ...init, headers });
      if (!response.ok) {
        // Helpers historically swallow PostgREST errors. Poisoning the whole
        // attempt prevents the runner turning a rejected publication into success.
        claim.failed = true;
        claim.uncertainWrite ||= canChangeOutputs;
        throw new Error("AI job publication was rejected; reconcile before retry.");
      }
      return response;
    } catch (error) {
      claim.failed = true;
      claim.uncertainWrite ||= canChangeOutputs;
      throw error;
    }
  };
}
