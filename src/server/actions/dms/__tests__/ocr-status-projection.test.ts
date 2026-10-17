import { beforeEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { withDocumentReadPolicy } from "@/lib/supabase/document-read-policy";

// Use the real SDK and secured SELECT adapter, not a chain-shaped client mock.
// Transport reproduces the verified PostgREST CTE projection/sort contract.
const state = vi.hoisted(() => ({
  client: null as unknown,
  requests: [] as URL[],
  denied: false,
  authenticated: true,
  masked: false,
  failedStage: "",
  warnings: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: async () => ({ profile: state.authenticated ? { id: 1 } : null }),
  hasPermission: () => !state.denied,
}));
vi.mock("@/server/actions/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: state.warnings } }));
import { getDmsOcrStatus } from "../ocr";

beforeEach(() => {
  state.requests = []; state.denied = false; state.authenticated = true;
  state.masked = false; state.failedStage = "";
  state.warnings.mockClear();
  state.client = withDocumentReadPolicy(createClient("https://synthetic.invalid", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)); state.requests.push(url);
      expect(init?.method).toBe("GET");
      expect(url.pathname).toMatch(/^\/rest\/v1\/rpc\/f03_read_document/);
      const fileQuery = url.pathname.endsWith("f03_read_document_files");
      const availability = fileQuery && url.searchParams.get("select") === "id";
      const stage = !fileQuery ? "document" : availability ? "text_availability" : "files";
      if (stage === state.failedStage) return Response.json({ code: "42703", message: "PRIVATE-DATABASE-DETAIL" }, { status: 400 });
      // PostgREST includes selected/filter columns in pgrst_source, but not an
      // ORDER BY-only column. SQL then fails before rows are returned.
      if (fileQuery && !availability) {
        const columns = url.searchParams.get("select")!.split(",");
        for (const order of (url.searchParams.get("order") ?? "").split(",").filter(Boolean)) {
          const column = order.split(".")[0];
          if (!columns.includes(column)) return Response.json({ code: "42703", message: `column dms_document_files.${column} does not exist` }, { status: 400 });
        }
      }
      if (!fileQuery) return Response.json({ id: 745, ocr_status: "complete", ocr_last_run_at: null, ocr_text_available: true });
      if (availability) return Response.json(state.masked ? [] : [{ id: 733 }]);
      return Response.json([{ id: 733, file_name: "synthetic.pdf", mime_type: "application/pdf",
        ocr_status: "complete", ocr_provider: "vision", ocr_model: "gpt-6.1-sol", created_at: "2026-10-17T08:00:00Z" }]);
    } },
  }));
});

it("loads completed OCR through the actual secured SDK projection and preserves its sort column", async () => {
  const r = await getDmsOcrStatus(745);
  expect(r.success).toBe(true);
  expect(r.data?.files).toHaveLength(1);
  expect(r.data?.files[0]).toMatchObject({ file_id: 733, ocr_status: "complete", has_text: true });
  expect(r.data?.files[0]).not.toHaveProperty("ocr_text");
  expect(r.data?.files[0]).not.toHaveProperty("created_at");
  expect(state.requests[1].searchParams.get("select")?.split(",")).toContain("created_at");
  expect(state.requests).toHaveLength(3);
});

it("keeps masked content unavailable without bypassing the secured projection", async () => {
  state.masked = true;
  const r = await getDmsOcrStatus(745);
  expect(r.success).toBe(true); expect(r.data?.files[0].has_text).toBe(false);
  expect(state.requests.every(url => url.pathname.includes("/rpc/f03_read_"))).toBe(true);
});

it.each(["document", "files", "text_availability"])("does not turn a failed %s read into an empty file list", async stage => {
  state.failedStage = stage;
  const r = await getDmsOcrStatus(745);
  expect(r.success).toBe(false); expect(r.data).toBeUndefined();
  expect(r.errorCode).toBe(stage);
  expect(r.reference).toMatch(/^[0-9a-f-]{36}$/);
  expect(r.error).not.toContain("PRIVATE-DATABASE-DETAIL");
  expect(JSON.stringify(state.warnings.mock.calls)).not.toContain("PRIVATE-DATABASE-DETAIL");
  expect(state.warnings).toHaveBeenCalledWith("DMS OCR status read failed", expect.objectContaining({ stage, databaseCode: "42703" }));
});

it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid document ID %s before a database read", async id => {
  expect((await getDmsOcrStatus(id)).success).toBe(false);
  expect(state.requests).toHaveLength(0);
});

it("recovers after a file read fails without treating stale/failed data as an empty list", async () => {
  state.failedStage = "files";
  expect((await getDmsOcrStatus(745)).success).toBe(false);
  state.failedStage = "";
  const r = await getDmsOcrStatus(745);
  expect(r.success).toBe(true); expect(r.data?.files[0].has_text).toBe(true);
});

it("does not make document requests without authentication or permission", async () => {
  state.authenticated = false; expect((await getDmsOcrStatus(745)).success).toBe(false);
  state.authenticated = true; state.denied = true; expect((await getDmsOcrStatus(745)).success).toBe(false);
  expect(state.requests).toHaveLength(0);
});
