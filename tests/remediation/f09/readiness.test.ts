import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getQueueReadiness } from "@/lib/email/queue/readiness";
import { GET } from "@/app/api/internal/process-email-queue/route";
const m = vi.hoisted(() => ({ db: vi.fn(), batch: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: m.db }));
vi.mock("@/lib/email/queue/service", () => ({ processQueuedBatch: m.batch, emailWorkerEnabled: () => process.env.F09_EMAIL_WORKER_ENABLED === "true" }));
let providers: Record<string, unknown>[], error: unknown, unknown: number, expired: number;
let calls: Array<[string, string, unknown[]]>;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("F09_EMAIL_WORKER_ENABLED", "true"); vi.stubEnv("INTERNAL_API_SECRET", "x".repeat(40));
  providers = [{ provider_type: "microsoft_graph", auth_mode: "client_credentials", send_mode: "graph_send_mail", throttle_per_minute: 10, daily_send_limit: 100, is_default: true }];
  error = null; unknown = 0; expired = 0; calls = [];
  m.db.mockReturnValue({ from: (table: string) => {
    let selected = "", status = "", lease = false;
    const q: Record<string, unknown> = {};
    for (const key of ["select", "is", "not", "eq", "lte", "or", "order", "limit", "abortSignal"]) q[key] = (...args: unknown[]) => {
      calls.push([table, key, args]); if (key === "select") selected = String(args[0]);
      if (key === "eq" && args[0] === "status") status = String(args[1]);
      if (key === "lte" && args[0] === "lease_expires_at") lease = true;
      return q;
    };
    q.then = (resolve: (value: unknown) => void) => resolve({ error,
      count: status === "delivery_unknown" ? unknown : lease ? expired : 0,
      data: table === "erp_email_provider_configs" ? providers : selected === "scheduled_for" || selected === "created_at" ? [] : null,
    }); return q;
  } });
});
it("reports no-work readiness without invoking a worker or selecting message/secret payloads", async () => {
  const result = await getQueueReadiness(true);
  expect(result).toMatchObject({ status: "ready", heartbeatVerified: false, inboxDeliveryVerified: false, providerCredentialsVerified: false });
  expect(result.oldestDueAgeSeconds).toBeNull(); expect(m.batch).not.toHaveBeenCalled();
  expect(calls.some(([, key]) => ["insert", "update", "rpc", "delete"].includes(key))).toBe(false);
  const selection = calls.filter(([, key]) => key === "select").map(([, , args]) => args[0]).join(";");
  expect(selection).not.toMatch(/\*|sender_email|secret_ref|to_emails|subject|html_body/);
});
it("paused status does not pretend that credentials or provider limits are ready", async () => {
  providers[0].daily_send_limit = null;
  const result = await getQueueReadiness(false); expect(result.status).toBe("paused");
  expect(result.configurationIssues).toContain("finite_provider_budgets_required");
});
it.each([null, 0, -1, 1.5])("fails readiness for non-finite/invalid provider budget %s", async value => {
  providers[0].daily_send_limit = value; expect((await getQueueReadiness(true)).status).toBe("unready");
});
it("detects missing/ambiguous default providers", async () => {
  providers = []; expect((await getQueueReadiness(true)).configurationIssues).toContain("no_enabled_provider");
  providers = Array.from({ length: 2 }, () => ({ is_default: true }));
  expect((await getQueueReadiness(true)).configurationIssues).toContain("default_provider_missing_or_ambiguous");
});
it("unknown outcomes and expired leases require attention, not a resend", async () => {
  unknown = 2; expired = 1; const result = await getQueueReadiness(true);
  expect(result.status).toBe("attention"); expect(result.alerts).toHaveLength(2); expect(m.batch).not.toHaveBeenCalled();
});
it("rejects missing credentials before any database access", async () => {
  expect((await GET(new NextRequest("http://localhost"))).status).toBe(401); expect(m.db).not.toHaveBeenCalled();
});
it("does not cache readiness and returns 503 when enabled but unready", async () => {
  providers[0].throttle_per_minute = null;
  const result = await GET(new NextRequest("http://localhost", { headers: { authorization: "Bearer " + "x".repeat(40) } }));
  expect(result.status).toBe(503); expect(result.headers.get("cache-control")).toBe("no-store");
});
it("sanitizes database failures instead of leaking diagnostic content", async () => {
  error = { message: "PRIVATE_TEST_CONTENT" };
  const result = await GET(new NextRequest("http://localhost", { headers: { authorization: "Bearer " + "x".repeat(40) } }));
  expect(result.status).toBe(503); expect(await result.text()).not.toContain("PRIVATE_TEST_CONTENT");
});
