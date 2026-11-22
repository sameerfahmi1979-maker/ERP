import { beforeEach, expect, it, vi } from "vitest";

const ports = vi.hoisted(() => ({
  analyze: vi.fn(),
  audit: vi.fn(),
  from: vi.fn(),
  invalidate: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: ports.from,
    rpc: (...args: unknown[]) => {
      const response = Promise.resolve(ports.rpc(...args));
      return Object.assign(response, { retry: () => response });
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: async () => ({ profile: { id: 5 } }),
  hasPermission: () => true,
}));
vi.mock("@/lib/dms/ai/factory", () => ({
  getDmsAiProvider: async () => ({
    provider: { analyze: ports.analyze, isConfigured: () => true, modelId: "fixture", providerCode: "synthetic" },
    configId: 1,
  }),
}));
vi.mock("@/lib/dms/ai/load-metadata-fields", () => ({ loadMetadataFieldsForDocumentType: async () => [] }));
vi.mock("@/lib/ai/observability/log-dms-ai-usage", () => ({ logDmsAiUsage: vi.fn() }));
vi.mock("@/lib/dms/review-queue/review-queue-upsert", () => ({ isDmsAiReviewEnabled: async () => false, upsertDmsReviewQueueItem: vi.fn() }));
vi.mock("@/server/actions/audit", () => ({ logAudit: ports.audit }));
vi.mock("next/cache", () => ({ revalidatePath: ports.invalidate }));

import { runDmsAiAnalysisForDocument } from "@/server/actions/dms/ai-analysis";

const request = { documentId: 17, operationId: "00100000-0000-4000-8000-000000000010" };
const completion = { job_id: 71, result_id: 72, status: "completed" };
let jobStatus: "pending" | "processing" | "completed" | null;
let lostAcknowledgement: boolean;
let blockedRead: boolean;

beforeEach(() => {
  vi.resetAllMocks();
  jobStatus = null;
  lostAcknowledgement = true;
  blockedRead = false;
  ports.analyze.mockResolvedValue({
    classification: { confidenceLabel: "high", confidenceScore: 0.9, suggestedTypeCode: "FIXTURE" },
    extraction: { fields: [] },
    suggestedLinks: [],
  });
  ports.from.mockImplementation((table: string) => {
    let mutation: "insert" | "update" | null = null;
    const execute = async () => {
      if (table === "dms_documents") {
        return { data: { id: 17, document_type_id: 3, confidentiality_level: "internal", current_version_id: 4 }, error: null };
      }
      if (table === "dms_document_files") {
        return { data: [{ id: 19, version_id: 4, storage_bucket: "dms-documents", storage_path: "synthetic.pdf",
          file_name: "synthetic.pdf", mime_type: "application/pdf", sha256_hash: "a".repeat(64), ocr_text: "synthetic", ocr_status: "complete" }], error: null };
      }
      if (table === "dms_document_types") return { data: [{ id: 3, type_code: "FIXTURE" }], error: null };
      if (table === "dms_ai_extraction_jobs") {
        if (mutation === "insert" && jobStatus !== null) return { data: null, error: { code: "23505" } };
        if (mutation === "insert") jobStatus = "pending";
        if (mutation === "update") jobStatus = "processing";
        return { data: { id: 71, status: jobStatus }, count: Number(jobStatus !== null), error: null };
      }
      return { data: null, error: null };
    };
    const query = {
      select: () => query, eq: () => query, is: () => query, order: () => query, in: () => query,
      limit: () => query, retry: () => query, maybeSingle: execute, single: execute,
      update: () => { mutation = "update"; return query; },
      insert: () => { mutation = "insert"; return query; },
      then: (resolve: (data: unknown) => unknown, reject: (error: unknown) => unknown) => execute().then(resolve,reject),
    };
    return query;
  });
  ports.rpc.mockImplementation((name: string) => {
    if (name === "dms_read_saved_classification") {
      if (blockedRead) return { data: null, error: { code: "08007" } };
      return { data: jobStatus === "completed" ? completion : jobStatus ? { job_id: 71, status: jobStatus } : null, error: null };
    }
    expect(name).toBe("dms_publish_saved_classification");
    jobStatus = "completed";
    if (lostAcknowledgement) {
      lostAcknowledgement = false;
      return { data: null, error: { code: "08007" } };
    }
    return { data: completion, error: null };
  });
});

it("replays the exact saved publication after a lost acknowledgement and preserves the receipt after refresh failure", async () => {
  ports.invalidate.mockImplementation(() => { throw new Error("synthetic refresh failure"); });
  expect(await runDmsAiAnalysisForDocument(request)).toMatchObject({ success: true, data: { job_id: 71, result_id: 72 } });
  const calls = ports.rpc.mock.calls.filter(([name]) => name === "dms_publish_saved_classification");
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(calls[0]);
  expect(calls[0][1]).toMatchObject({ p_document: 17, p_version: 4, p_operation: request.operationId });
  blockedRead = true;
  expect(await runDmsAiAnalysisForDocument(request)).toMatchObject({ success: false, uncertain: true });
  blockedRead = false;
  expect(await runDmsAiAnalysisForDocument(request)).toMatchObject({ success: true, data: { result_id: 72, replayed: true } });
  expect(ports.analyze).toHaveBeenCalledOnce();
});

it("admits one model call when two requests share the saved operation", async () => {
  const results = await Promise.all([runDmsAiAnalysisForDocument(request), runDmsAiAnalysisForDocument(request)]);
  expect(results.some(result => result.success)).toBe(true);
  expect(await runDmsAiAnalysisForDocument(request)).toMatchObject({ success: true, data: { result_id: 72, replayed: true } });
  expect(ports.analyze).toHaveBeenCalledOnce();
});
