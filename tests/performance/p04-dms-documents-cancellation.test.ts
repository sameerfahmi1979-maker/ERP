import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pageSignal: null as AbortSignal | null,
  tagsSignal: null as AbortSignal | null,
  tagsCalls: 0,
  prepare: vi.fn(),
  pageReady: vi.fn(),
}));
vi.mock("@/lib/rbac/check", () => ({
  hasPermission: () => true,
  getAuthContext: async () => ({ profile: { id: 9 }, roleCodes: ["system_admin"] }),
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/ai/search/document-query", () => ({
  prepareDocumentQuery: state.prepare,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: () => {
      state.tagsCalls++;
      const tags = {
        order: () => tags,
        range: () => tags,
        abortSignal: (signal: AbortSignal) => { state.tagsSignal = signal; return tags; },
        then: (complete: (x: unknown) => void) => complete({ data: [], count: 0, error: null }),
      };
      return tags;
    },
  }),
}));
import { POST } from "@/app/api/reads/dms-documents/route";

beforeEach(() => {
  state.pageSignal = null;
  state.tagsSignal = null;
  state.tagsCalls = 0;
  state.pageReady.mockReset().mockResolvedValue({ data: [{ id: 123 }], count: 1, error: null });
  const page = {
    select: () => page,
    is: () => page,
    order: () => page,
    abortSignal: (signal: AbortSignal) => { state.pageSignal = signal; return page; },
    range: () => page,
    returns: state.pageReady,
  };
  state.prepare.mockReset().mockResolvedValue({ query: page });
});

function request(signal: AbortSignal) {
  return new Request("http://localhost/api/reads/dms-documents", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal,
  });
}

it("threads one cancellation signal through search preparation, exact page and tag hydration", async () => {
  const req = request(new AbortController().signal);
  const res = await POST(req);
  expect(res.status).toBe(200);
  expect(state.prepare.mock.calls[0][3]).toMatchObject({ signal: req.signal });
  expect(state.pageSignal).toBe(req.signal);
  expect(state.tagsSignal).toBe(req.signal);
  expect(await res.json()).toMatchObject({ success: true, data: { rows: [{ id: 123, tags: [] }], totalCount: 1 } });
});

it("retires a cancelled exact page before starting its tag read", async () => {
  const controller = new AbortController();
  state.pageReady.mockImplementationOnce(async () => {
    controller.abort("private caller reason");
    return { data: [{ id: 123 }], count: 1, error: null };
  });
  const res = await POST(request(controller.signal));
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ success: false, code: "READ_CANCELLED" });
  expect(state.tagsCalls).toBe(0);
});
