import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  permissionCodes: ["dms.documents.view"],
  transport: vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>(),
}));

vi.mock("@/lib/rbac/check", async () => ({
  ...await import("@/lib/rbac/scope"),
  getAuthContext: async () => ({ profile: { id: 1, must_change_password: false }, isAccountActive: true, roleAssignments: [], permissionCodes: state.permissionCodes }),
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/supabase/server", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { createClient: async () => createClient("https://taxonomy-fixture.invalid", "inert-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const url = new URL(String(input));
      if (url.origin !== "https://taxonomy-fixture.invalid") throw new Error("Unexpected transport");
      return state.transport(url, init);
    } },
  }) };
});
import { POST } from "@/app/api/reads/dms-list-choices/route";

function request(input: unknown, signal?: AbortSignal) {
  return new Request("http://localhost/api/reads/dms-list-choices", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal,
  });
}

beforeEach(() => {
  state.permissionCodes = ["dms.documents.view"];
  state.transport.mockReset();
});

it("returns exact ordinary-caller taxonomy labels, preserving historical choices", async () => {
  state.transport.mockImplementation(async url => Response.json([{ id: 12, name_en: url.pathname.endsWith("categories") ? "Safety" : "Retired policy type" }], {
    headers: { "content-range": "0-0/1" },
  }));
  const req = request({});
  const result = await POST(req);
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(await result.json()).toEqual({ success: true, data: {
    categories: [{ id: 12, name_en: "Safety" }], documentTypes: [{ id: 12, name_en: "Retired policy type" }],
  } });
  expect(state.transport).toHaveBeenCalledTimes(2);
  for (const [url, init] of state.transport.mock.calls) {
    expect(url.searchParams.get("select")).toBe("id,name_en");
    expect(url.searchParams.get("order")).toBe("sort_order.asc,id.asc");
    expect(url.searchParams.get("deleted_at")).toBe("is.null");
    expect(url.searchParams.has("is_active")).toBe(false);
    expect(new Headers(init?.headers).get("prefer")).toBe("count=exact");
    expect(init?.signal).toBe(req.signal);
  }
});

it("denies missing permission and rejects caller-selected scope before transport", async () => {
  expect((await POST(request({ ownerCompanyId: 1 }))).status).toBe(400);
  state.permissionCodes = [];
  expect((await POST(request({}))).status).toBe(403);
  expect(state.transport).not.toHaveBeenCalled();
});

it("rejects an incomplete catalogue instead of returning partial choices", async () => {
  state.transport.mockImplementation(async () => Response.json([{ id: 12, name_en: "Synthetic" }], {
    headers: { "content-range": "0-0/2" },
  }));
  const result = await POST(request({}));
  expect(result.status).toBe(503);
  expect(await result.json()).not.toHaveProperty("data");
});

it("cancels both taxonomy queries and exposes only the route cancellation contract", async () => {
  const controller = new AbortController();
  let bothStarted!: () => void;
  const started = new Promise<void>(resolve => { bothStarted = resolve; });
  state.transport.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Synthetic transport detail", "AbortError")), { once:true });
    if (state.transport.mock.calls.length === 2) bothStarted();
  }));
  const pending = POST(request({}, controller.signal));
  await started;
  controller.abort();
  const result = await pending;
  expect(result.headers.get("X-ERP-Read-Outcome")).toBe("cancelled");
  expect(await result.json()).toMatchObject({ success: false, code: "READ_CANCELLED" });
  expect(state.transport.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
});
