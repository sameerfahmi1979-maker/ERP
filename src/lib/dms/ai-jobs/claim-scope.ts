import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { setServerLogContextFilter } from "@/lib/log-context";

export type JobClaim = { jobId: number; token: string; workerId: string; attemptNumber: number };
type Scope = JobClaim & { failed: boolean; uncertainWrite: boolean };
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
  "dms_document_content_chunks", "dms_ai_tag_suggestions", "dms_ai_link_suggestions",
  "dms_upload_sessions", "dms_document_types", "dms_review_queue", "erp_ai_usage_logs",
]);
const JOB_RPCS = new Set(["f07_ai_worker", "f07_ai_metadata_suggestions"]);
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
    if (mutation && !(table && JOB_OUTPUT_TABLES.has(table)) && !(rpc && JOB_RPCS.has(rpc))) {
      claim.failed = true;
      throw new Error("AI worker mutation is outside the suggestion/derived-output allowlist.");
    }
    if (!url.pathname.startsWith("/rest/v1/")) return base(input, init);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
    headers.set("x-algt-ai-job", String(claim.jobId));
    headers.set("x-algt-ai-claim", claim.token);
    try {
      const response = await base(input, { ...init, headers });
      if (!response.ok) {
        // Helpers historically swallow PostgREST errors. Poisoning the whole
        // attempt prevents the runner turning a rejected publication into success.
        claim.failed = true;
        claim.uncertainWrite ||= mutation;
        throw new Error("AI job publication was rejected; reconcile before retry.");
      }
      return response;
    } catch (error) {
      claim.failed = true;
      claim.uncertainWrite ||= mutation;
      throw error;
    }
  };
}
