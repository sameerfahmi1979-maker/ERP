import { beforeEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getDmsDocumentFiles } from "../document-files";

const state = vi.hoisted(() => ({
  client: null as unknown,
  requests: [] as { url: URL; method?: string; prefer: string | null }[],
  allowed: true,
  scopedRpcMissing: false,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: async () => ({ profile: { id: 8511 } }),
  hasPermission: () => true,
  canUseApplication: () => true,
}));

beforeEach(() => {
  state.requests = [];
  state.allowed = true;
  state.scopedRpcMissing = false;
  state.client = createClient("https://synthetic.invalid", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        state.requests.push({ url, method: init?.method, prefer: new Headers(init?.headers).get("prefer") });
        if (url.pathname.endsWith("/f03_has_document_permission")) {
          expect(JSON.parse(String(init?.body))).toEqual({ document_id: 100004, permission_code: "dms.documents.view" });
          return Response.json(state.allowed);
        }
        expect(url.pathname).toBe("/rest/v1/rpc/f03_read_document_files_for_document");
        if (state.scopedRpcMissing) return Response.json({ code: "PGRST202" }, { status: 404 });
        const offset = Number(url.searchParams.get("offset"));
        const rows = Array.from({ length: offset ? 1 : 500 }, (_, i) => ({
          id: i + offset + 1, document_id: 100004, integrity_error_message: null,
          ocr_error_message: null, version: { version_number: 1, version_label: "Original" },
          creator: { full_name: "Synthetic creator" },
        }));
        return Response.json(rows, { headers: { "content-range": `${offset}-${offset + rows.length - 1}/501` } });
      },
    },
  });
});

it("passes the document ID into the protected RPC and preserves exact paging and relationship embeds", async () => {
  const result = await getDmsDocumentFiles(100004);
  expect(result.success).toBe(true);
  expect(result.data?.map(row => row.id)).toEqual(Array.from({ length: 501 }, (_, i) => i + 1));
  expect(result.data?.[500]).toMatchObject({
    document_id: 100004, ocr_error_message: null, integrity_error_message: null,
    version: { version_number: 1, version_label: "Original" }, creator: { full_name: "Synthetic creator" },
  });
  const pages = state.requests.slice(1);
  expect(pages.map(page => Number(page.url.searchParams.get("offset")))).toEqual([0, 500]);
  for (const { url, method, prefer } of pages) {
    expect(method).toBe("GET");
    expect(prefer).toContain("count=exact");
    expect(url.searchParams.get("p_document_id")).toBe("100004");
    expect(url.searchParams.get("order")).toBe("created_at.desc,id.asc");
    const select = url.searchParams.get("select");
    expect(select).toContain("version:dms_document_versions!version_id(version_number,version_label)");
    expect(select).toContain("creator:user_profiles!created_by(full_name)");
    expect(select).not.toMatch(/storage_bucket|storage_path|(?:^|,)ocr_text(?:,|$)/);
  }
});

it("denies the file lookup before querying files when document access fails", async () => {
  state.allowed = false;
  expect(await getDmsDocumentFiles(100004)).toMatchObject({ success: false, error: "Document access is restricted." });
  expect(state.requests).toHaveLength(1);
});

it("reports an unavailable RPC without falling back to the broad file projection", async () => {
  state.scopedRpcMissing = true;
  expect(await getDmsDocumentFiles(100004)).toMatchObject({ success: false, error: expect.stringContaining("completely loaded") });
  expect(state.requests).toHaveLength(2);
});
