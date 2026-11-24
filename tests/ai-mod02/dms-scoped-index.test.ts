import { beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createClient as createDatabaseClient } from "@supabase/supabase-js";
import type { AuthContext } from "@/lib/rbac/check";
import { hasPermissionInScope } from "@/lib/rbac/scope";

const fixture = vi.hoisted(() => ({
  ctx: {} as AuthContext,
  caller: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
  enqueue: vi.fn(),
  embed: vi.fn(),
}));

vi.mock("@/lib/rbac/check", async () => ({
  ...await vi.importActual("@/lib/rbac/scope"),
  getAuthContext: async () => fixture.ctx,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: fixture.caller }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: fixture.admin }));
vi.mock("@/lib/dms/ai-jobs/job-runner", () => ({ enqueueUniqueDmsAiJob: fixture.enqueue }));
vi.mock("@/lib/dms/ai/factory", () => ({ getDmsEmbeddingProvider: fixture.embed }));
vi.mock("@/lib/ai/observability/log-dms-ai-usage", () => ({ logDmsAiUsage: vi.fn() }));
vi.mock("@/server/actions/audit", () => ({ logAudit: vi.fn() }));

import {
  adminSemanticIndexBackfill,
  enqueueDmsDocumentSemanticIndex,
  getDmsDocumentSemanticIndexStatus,
  getSemanticIndexQueueSummary,
} from "@/server/actions/dms/intelligence-admin";
import { POST } from "@/app/api/v1/search/route";
import { semanticDocumentIndexHandler } from "@/lib/dms/ai-jobs/handlers/semantic-document-index.handler";

const allowed = { data: true, error: null };
const denied = { data: false, error: null };
const flags = ["DMS_SEMANTIC_INDEX_QUEUE", "DMS_AI_JOB_QUEUE", "DMS_SEMANTIC_CHUNKING"]
  .map(feature_code => ({ feature_code, is_enabled: true }));

function adminReads(failure?: "count" | "content" | "hash", count: number | null = 0) {
  return {
    from: (table: string) => ({
      select: (columns: string) => {
        const isCount = columns === "id";
        const read = table === "erp_ai_feature_flags" ? { data: flags, error: null }
          : {
            data: null,
            error: failure && ((failure === "count" && isCount) ||
              (failure === "content" && table === "dms_document_content") ||
              (failure === "hash" && columns === "content_hash")) ? { message: "Synthetic storage failure" } : null,
            count: isCount ? count : null,
          };
        const query = {
          eq: () => query, is: () => query, not: () => query, gte: () => query,
          order: () => query, limit: () => query, in: () => query,
          maybeSingle: async () => read,
          then: <T>(resolve: (value: typeof read) => T) => Promise.resolve(resolve(read)),
        };
        return query;
      },
    }),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  const permissions = ["dms.documents.view", "dms.admin"];
  fixture.ctx = {
    profile: { id: 7, must_change_password: false } as AuthContext["profile"],
    email: null,
    roleCodes: ["lead_officer"],
    permissionCodes: permissions,
    globalPermissionCodes: [],
    accountStatus: "active",
    isAccountActive: true,
    roleAssignments: [{ roleId: 7, roleCode: "lead_officer", ownerCompanyId: 1, branchId: 11, permissionCodes: permissions }],
  };
  fixture.caller.mockResolvedValue({ rpc: fixture.rpc });
  fixture.rpc.mockResolvedValue(denied);
  fixture.admin.mockReturnValue(adminReads());
  fixture.enqueue.mockResolvedValue({ success: true, jobId: 61 });
});

it("denies sibling, other-company, confidential and absent targets before any privileged manual rebuild call", async () => {
  for (const documentId of [102, 103, 104, 999]) {
    expect(await enqueueDmsDocumentSemanticIndex(documentId)).toMatchObject({ success: false });
    expect(fixture.rpc).toHaveBeenLastCalledWith("f03_has_document_permission", { document_id: documentId, permission_code: "dms.admin" });
  }
  expect(fixture.admin).not.toHaveBeenCalled();
  expect(fixture.enqueue).not.toHaveBeenCalled();
});

it("allows an exact ordinary-role grant and keeps the rebuild idempotency key", async () => {
  fixture.rpc.mockResolvedValue(allowed);
  expect(await enqueueDmsDocumentSemanticIndex(101, true)).toMatchObject({ success: true, data: { jobId: 61 } });
  expect(fixture.enqueue).toHaveBeenCalledWith(expect.objectContaining({
    relatedDocumentId: 101,
    payload: { documentId: 101, source: "manual_rebuild", forceRebuild: true },
    idempotencyKey: "semantic_document_index:doc:101",
  }));
});

it("rechecks native rebuild authority after reading queue flags", async () => {
  fixture.rpc.mockResolvedValueOnce(allowed).mockResolvedValueOnce(denied);
  expect(await enqueueDmsDocumentSemanticIndex(101)).toMatchObject({ success: false });
  expect(fixture.enqueue).not.toHaveBeenCalled();
});

it("reserves catalog-wide semantic backfill and queue counts for global authority", async () => {
  expect(await adminSemanticIndexBackfill({ mode: "dry_run" })).toMatchObject({ success: false });
  expect(await getSemanticIndexQueueSummary()).toMatchObject({ success: false });
  expect(fixture.admin).not.toHaveBeenCalled();
});

it("reports a failed global queue count as unavailable", async () => {
  fixture.ctx.globalPermissionCodes = ["dms.admin"];
  expect(await getSemanticIndexQueueSummary()).toMatchObject({ success: true, data: { queued: 0, completed: 0 } });
  fixture.admin.mockReturnValue(adminReads("count"));
  expect(await getSemanticIndexQueueSummary()).toEqual({ success: false, error: "Semantic index queue status unavailable." });
});

it.each(["count", "content", "hash"] as const)("withholds index status when the %s read fails", async failure => {
  fixture.rpc.mockResolvedValue(allowed);
  fixture.admin.mockReturnValue(adminReads(failure));
  expect(await getDmsDocumentSemanticIndexStatus(101)).toEqual({ success: false, error: "Semantic index status unavailable." });
});

it("distinguishes a verified empty index from an unavailable count", async () => {
  fixture.rpc.mockResolvedValue(allowed);
  expect(await getDmsDocumentSemanticIndexStatus(101)).toMatchObject({
    success: true, data: { totalChunks: 0, lastContentHash: null, isStale: false },
  });
  fixture.admin.mockReturnValue(adminReads(undefined, null));
  expect(await getDmsDocumentSemanticIndexStatus(101)).toEqual({ success: false, error: "Semantic index status unavailable." });
});

it("withholds chunk status if native access changes before delivery", async () => {
  fixture.rpc.mockResolvedValueOnce(allowed).mockResolvedValueOnce(denied);
  expect(await getDmsDocumentSemanticIndexStatus(101)).toMatchObject({ success: false });
});

it("indexes synthetic documents through the queue handler and delivers only current authorized search rows", async () => {
  const scopeRows = [[101, 1, 11, "company"], [102, 1, 12, "company"], [103, 2, 21, "company"], [104, 1, 11, "hr"]] as const;
  const docs = scopeRows.map(([id, company, branch, confidentiality_level]) => ({
    id, owning_company_id: company, owning_branch_id: branch, confidentiality_level,
    document_no: `SYN-INDEX-${id}`, title: "Synthetic inspection bulletin", status: "active",
    issue_date: null, expiry_date: null, document_type_id: null, document_type: null,
    current_version_id: id, updated_at: "2026-11-24T10:00:00Z",
  }));
  const contents = docs.map(doc => {
    const content_text = `Synthetic extraction ${doc.id}: overhauled inspection component.`;
    return {
      id: doc.id, document_id: doc.id, content_text,
      content_text_sha256: createHash("sha256").update(content_text).digest("hex"), is_truncated: false,
    };
  });
  const chunks: Array<{
    id: number; document_id: number; chunk_index: number; chunk_text: string; content_hash: string;
    is_active: boolean; deleted_at: null; embedding_status: string;
  }> = [];
  const provider = vi.fn(async () => ({ embedding: Array.from({ length: 1536 }, (_, index) => Number(index === 0)), model: "fixture" }));
  fixture.embed.mockResolvedValue({ provider: { isConfigured: () => true, embedText: provider }, modelId: "fixture" });
  let vectorsEnabled = false;
  let sessionValid = true;
  let privilegedSearch = false;
  const canRead = (doc: typeof docs[number], permission = "dms.documents.view") => sessionValid &&
    hasPermissionInScope(fixture.ctx, permission, doc.owning_company_id, doc.owning_branch_id) &&
    (doc.confidentiality_level === "company" || hasPermissionInScope(fixture.ctx, "dms.documents.view.hr", doc.owning_company_id, doc.owning_branch_id));
  const searchCandidates = vi.fn();
  const client = (admin: boolean) => createDatabaseClient("https://synthetic.example.invalid", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const endpoint = url.pathname.split("/").at(-1);
      const filters = url.searchParams;
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      const matches = (row: object) => Object.entries(row).every(([key, value]) => {
        const criterion = filters.get(key);
        if (criterion?.startsWith("eq.")) return String(value) === criterion.slice(3);
        if (criterion?.startsWith("in.(")) return criterion.slice(4, -1).split(",").includes(String(value));
        return true;
      });
      let data: unknown[] | boolean;
      if (endpoint === "erp_ai_feature_flags") {
        data = [...flags, { feature_code: "DMS_SEMANTIC_EMBEDDINGS", is_enabled: vectorsEnabled },
          ...["DMS_SEMANTIC_SEARCH", "DMS_SEMANTIC_SEARCH_CHUNKS"].map(feature_code => ({ feature_code, is_enabled: vectorsEnabled }))].filter(matches);
      } else if (endpoint === "dms_document_content") {
        if (!admin) throw Error("Unexpected unscoped canonical content read");
        data = contents.filter(matches);
      } else if (endpoint === "dms_document_content_chunks") {
        if (!admin) throw Error("Unexpected unscoped index read");
        if (method === "POST") {
          for (const row of body) chunks.push({ ...row, id: chunks.length + 1, deleted_at: null });
          return new Response(null, { status: 201 });
        }
        if (method === "PATCH") {
          for (const row of chunks.filter(matches)) Object.assign(row, body);
          return new Response(null, { status: 204 });
        }
        data = chunks.filter(matches);
      } else if (endpoint === "dms_question_publish") {
        data = false;
      } else if (endpoint === "f03_has_document_permission") {
        data = docs.some(doc => doc.id === body.document_id && canRead(doc, body.permission_code));
      } else if (endpoint === "f03_current_session_valid") {
        data = sessionValid;
      } else if (endpoint === "dms_document_types" || endpoint === "ai_mod02_resolve_subject") {
        data = [];
      } else if (endpoint === "search_dms_document_chunks_by_embedding") {
        privilegedSearch ||= admin;
        searchCandidates();
        // Return an intentionally broad candidate set to exercise the source recheck.
        data = chunks.filter(chunk => chunk.is_active && chunk.embedding_status === "complete").map(chunk => {
          const doc = docs.find(entry => entry.id === chunk.document_id)!;
          return { ...doc, chunk_id: chunk.id, document_id: doc.id, chunk_index: chunk.chunk_index, snippet: chunk.chunk_text, similarity: 1 };
        });
      } else if (endpoint === "ai_mod02_search_documents") {
        privilegedSearch ||= admin;
        const terms = filters.get("text_query")?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
        data = docs.filter(doc => canRead(doc) && matches(doc) && terms.every(term => `${doc.title} ${doc.document_no}`.toLowerCase().includes(term)));
      } else if (endpoint === "erp_ai_usage_logs") {
        return new Response(null, { status: 201 });
      } else {
        throw Error(`Unexpected fixture endpoint ${endpoint}`);
      }
      const count = Array.isArray(data) ? data.length : 1;
      if (Array.isArray(data) && filters.has("limit")) data = data.slice(0, Number(filters.get("limit")));
      const accept = new Headers(init?.headers).get("accept");
      if (Array.isArray(data) && accept?.includes("vnd.pgrst.object")) data = data[0] as unknown[];
      return new Response(method === "HEAD" ? null : JSON.stringify(data), {
        headers: { "content-type": "application/json", "content-range": `0-${Math.max(0, count - 1)}/${count}` },
      });
    } },
  });
  const caller = client(false);
  const admin = client(true);
  fixture.caller.mockResolvedValue(caller);
  fixture.admin.mockReturnValue(admin);
  const index = (documentId: number) => semanticDocumentIndexHandler.handle({ documentId, source: "admin_backfill" });
  const search = (mode = "semantic", filters: unknown[] = []) => POST(new Request("http://localhost/api/v1/search", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contractVersion: "erp-ai/1", capabilityId: "dms.metadata", mode, query: "inspection bulletin", filters, pageSize: 25, cursor: null }),
  }));

  expect(await index(101)).toMatchObject({ success: true, safeMessage: "partial: 1 chunks, 0 embedded, 1 pending." });
  expect(await getDmsDocumentSemanticIndexStatus(101)).toMatchObject({ success: true, data: { totalChunks: 1, pendingChunks: 1, embeddedChunks: 0, isStale: false } });
  expect((await search()).status).toBe(503);
  expect(provider).not.toHaveBeenCalled();

  vectorsEnabled = true;
  for (const doc of docs) expect((await index(doc.id)).success).toBe(true);
  expect(provider).toHaveBeenCalledTimes(4);
  expect(chunks).toHaveLength(4);
  expect(await getDmsDocumentSemanticIndexStatus(101)).toMatchObject({ success: true, data: { totalChunks: 1, pendingChunks: 0, embeddedChunks: 1, isStale: false } });
  for (const doc of docs.slice(1)) expect((await getDmsDocumentSemanticIndexStatus(doc.id)).success).toBe(false);

  fixture.ctx.permissionCodes = ["dms.documents.view"];
  fixture.ctx.roleAssignments![0].permissionCodes = fixture.ctx.permissionCodes;
  const semantic = await search();
  expect(semantic.status).toBe(200);
  expect(semantic.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  const semanticResult = await semantic.json();
  expect(semanticResult).toMatchObject({ success: true, data: { countScope: "bounded_preview", complete: false, rows: [{ id: 101 }] } });
  expect(JSON.stringify(semanticResult)).not.toContain("Synthetic extraction");
  expect(semanticResult.data.rows.map((row: { id: number }) => row.id)).toEqual([101]);
  expect(searchCandidates).toHaveBeenCalledOnce();
  expect(privilegedSearch).toBe(false);

  const keyword = await search("keyword");
  expect(await keyword.json()).toMatchObject({ success: true, data: { countScope: "exact_authorized", totalCount: 1, rows: [{ id: 101 }] } });

  contents[0].content_text = "Synthetic extraction 101: replaced inspection component.";
  contents[0].content_text_sha256 = createHash("sha256").update(contents[0].content_text).digest("hex");
  expect(await getDmsDocumentSemanticIndexStatus(101)).toMatchObject({ success: true, data: { isStale: true } });
  expect(await index(101)).toMatchObject({ success: true, safeMessage: "indexed: 1 chunks, 1 embedded, 0 pending." });
  expect(chunks.filter(chunk => chunk.document_id === 101).map(chunk => chunk.is_active)).toEqual([false, true]);
  expect(await getDmsDocumentSemanticIndexStatus(101)).toMatchObject({ success: true, data: {
    isStale: false, totalChunks: 1, lastContentHash: contents[0].content_text_sha256,
  } });

  const sibling = await search("keyword", [{ field: "owning_branch_id", operator: "eq", values: [12] }]);
  expect(await sibling.json()).toMatchObject({ success: true, data: { outcome: "no_matches", totalCount: 0, rows: [] } });
  sessionValid = false;
  expect((await search("keyword")).status).toBe(503);
  fixture.ctx.isAccountActive = false;
  expect((await search()).status).toBe(403);
  expect(searchCandidates).toHaveBeenCalledOnce();
});
