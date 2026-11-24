import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/rbac/check";

const dependencies = vi.hoisted(() => ({
  auth: vi.fn(),
  userFrom: vi.fn(),
  userRpc: vi.fn(),
  adminFrom: vi.fn(),
  embed: vi.fn(),
  candidates: vi.fn(),
}));

vi.mock("@/lib/rbac/check", async () => ({
  ...(await import("@/lib/rbac/scope")),
  getAuthContext: dependencies.auth,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: dependencies.userFrom, rpc: dependencies.userRpc }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: dependencies.adminFrom }),
}));
vi.mock("@/lib/dms/ai/factory", () => ({
  getDmsEmbeddingProvider: async () => ({
    provider: { isConfigured: () => true, embedText: dependencies.embed },
    configId: null,
    modelId: "synthetic",
  }),
}));
vi.mock("@/server/actions/ai/search-candidates", () => ({
  filterSearchCandidateIds: dependencies.candidates,
}));
vi.mock("@/server/actions/audit", () => ({ logAudit: async () => undefined }));
vi.mock("@/server/mobile/dms-v5/orchestration-receipt", () => ({
  markRetryProviderStarted: async () => undefined,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import {
  bulkGenerateMissingDmsEmbeddings,
  findSimilarDmsDocuments,
  generateDmsDocumentEmbedding,
  regenerateDmsDocumentEmbedding,
  semanticSearchDmsDocuments,
} from "../semantic-search";

const viewer = {
  profile: { id: 9, must_change_password: false },
  isAccountActive: true,
  roleCodes: ["synthetic_viewer"],
  permissionCodes: ["dms.documents.view"],
  roleAssignments: [{
    roleId: 2, roleCode: "synthetic_viewer", ownerCompanyId: 3, branchId: 4,
    permissionCodes: ["dms.documents.view"],
  }],
} as AuthContext;

const flags = new Map<string, { enabled: boolean; error?: { code: string } }>();

beforeEach(() => {
  vi.resetAllMocks();
  flags.clear();
  flags.set("DMS_SEMANTIC_SEARCH", { enabled: true });
  flags.set("DMS_SEMANTIC_SEARCH_CHUNKS", { enabled: true });
  dependencies.auth.mockResolvedValue(viewer);
  dependencies.adminFrom.mockImplementation((table: string) => {
    if (table !== "erp_ai_feature_flags") throw new Error("Unexpected service-role read");
    return {
      select: (columns: string) => {
        if (columns !== "is_enabled") throw new Error("Unexpected flag projection");
        return {
          eq: (column: string, flag: string) => {
            if (column !== "feature_code" || !flags.has(flag)) throw new Error("Unexpected flag");
            const row = flags.get(flag)!;
            return { single: async () => ({ data: { is_enabled: row.enabled }, error: row.error }) };
          },
        };
      },
    };
  });
  dependencies.userFrom.mockImplementation((table: string) => {
    if (table === "erp_ai_feature_flags") {
      // The settings policy hides these rows from an ordinary DMS viewer.
      return { select: () => ({ eq: () => ({ single: async () => ({
        data: null, error: { code: "PGRST116" },
      }) }) }) };
    }
    if (table === "erp_ai_usage_logs") return { insert: async () => ({ error: null }) };
    throw new Error(`Unexpected user read: ${table}`);
  });
  dependencies.userRpc.mockImplementation(async (rpc: string) => ({
    data: rpc === "search_dms_document_chunks_by_embedding"
      ? [{ document_id: 42, snippet: "Synthetic chunk", similarity: 0.95 },
         { document_id: 43, snippet: "Constraint mismatch", similarity: 0.90 }]
      : [{ document_id: 42, ai_summary: "Synthetic summary", similarity: 0.95 }],
    error: null,
  }));
  dependencies.embed.mockResolvedValue({ embedding: [1], model: "synthetic" });
  dependencies.candidates.mockResolvedValue({ success: true, data: [42] });
});

describe("DMS semantic search settings visibility", () => {
  it("returns only allowed chunk matches for a viewer with no AI settings access", async () => {
    const result = await semanticSearchDmsDocuments("synthetic search");

    expect(result).toMatchObject({ success: true, data: [
      { documentId: 42, searchMode: "chunk", chunkSnippet: "Synthetic chunk" },
    ] });
    expect(dependencies.userRpc).toHaveBeenCalledExactlyOnceWith(
      "search_dms_document_chunks_by_embedding", expect.objectContaining({ p_is_admin: false }),
    );
    expect(dependencies.candidates).toHaveBeenCalledExactlyOnceWith({
      query: "synthetic search", mode: "semantic", candidateIds: [42, 43],
    });
  });

  it("uses the viewer's document search when chunks are disabled", async () => {
    flags.set("DMS_SEMANTIC_SEARCH_CHUNKS", { enabled: false });

    const result = await semanticSearchDmsDocuments("synthetic search");

    expect(result).toMatchObject({ success: true, data: [
      { documentId: 42, searchMode: "document", aiSummarySnippet: "Synthetic summary" },
    ] });
    expect(dependencies.userRpc).toHaveBeenCalledExactlyOnceWith(
      "search_dms_documents_by_embedding", expect.objectContaining({ p_is_admin: false }),
    );
  });

  it("stops before embedding when reading the main flag fails", async () => {
    flags.set("DMS_SEMANTIC_SEARCH", { enabled: true, error: { code: "XX000" } });

    expect(await semanticSearchDmsDocuments("synthetic search")).toMatchObject({
      success: false, error: "DMS Semantic Search feature is not enabled.",
    });
    expect(dependencies.embed).not.toHaveBeenCalled();
  });

  it.each([
    ["unauthenticated", { ...viewer, profile: null }, "Not authenticated"],
    ["inactive", { ...viewer, isAccountActive: false, roleCodes: ["system_admin"] }, "Permission denied"],
    ["password change required", {
      ...viewer, profile: { ...viewer.profile!, must_change_password: true },
      roleCodes: ["system_admin"],
    }, "Permission denied"],
    ["without DMS permission", { ...viewer, permissionCodes: [], roleAssignments: [] }, "Permission denied"],
  ])("denies %s callers before any feature flag lookup", async (_, context, error) => {
    dependencies.auth.mockResolvedValue(context);

    const attempts = await Promise.all([
      semanticSearchDmsDocuments("synthetic search"),
      findSimilarDmsDocuments(42),
      generateDmsDocumentEmbedding(42),
      regenerateDmsDocumentEmbedding(42),
      bulkGenerateMissingDmsEmbeddings({}),
    ]);

    expect(attempts).toEqual(attempts.map(() => ({
      success: false, error: expect.stringContaining(error),
    })));
    expect(dependencies.userFrom).not.toHaveBeenCalled();
    expect(dependencies.adminFrom).not.toHaveBeenCalled();
    expect(dependencies.embed).not.toHaveBeenCalled();
  });
});
