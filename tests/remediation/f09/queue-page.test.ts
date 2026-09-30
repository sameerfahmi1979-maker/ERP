import { beforeEach, expect, it, vi } from "vitest";
import { getEmailQueuePage } from "@/server/actions/notifications/email-queue";
import { queuePageSchema, queueSearchFilter } from "@/lib/email/queue/list-contract";
const m = vi.hoisted(() => ({ ctx: vi.fn(), db: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: m.ctx }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.db }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: m.admin }));
vi.mock("@/server/actions/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/email/queue/service", () => ({ processQueuedEmail: vi.fn(), processQueuedBatch: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
let calls: Array<[string, unknown[]]>, fail: boolean;
beforeEach(() => {
  vi.clearAllMocks(); calls = []; fail = false;
  m.ctx.mockResolvedValue({ profile: { id: 1 }, isAccountActive: true, globalPermissionCodes: ["notifications.email_queue.view"] });
  m.db.mockReturnValue({ from: () => {
    const q: Record<string, unknown> = {}; let head = false;
    for (const key of ["select", "is", "eq", "or", "order", "range", "abortSignal"]) q[key] = (...args: unknown[]) => {
      calls.push([key, args]); if (key === "select") head = !!(args[1] as { head?: boolean })?.head; return q;
    };
    q.then = (resolve: (value: unknown) => void) => resolve({ data: head ? null : [{ id: 201 }], count: 754, error: fail ? { message: "PRIVATE_ERROR" } : null });
    return q;
  } });
});
it("pages beyond the former 200-row cap and uses server exact counts under RLS", async () => {
  const result = await getEmailQueuePage({ page: 9, pageSize: 25 });
  expect(result.success).toBe(true); expect(result.data?.total).toBe(754); expect(result.data?.allTotal).toBe(754);
  expect(calls).toContainEqual(["range", [200, 224]]); expect(m.admin).not.toHaveBeenCalled();
  expect(calls.find(([key]) => key === "select")?.[1][0]).not.toMatch(/html_body|text_body|template_variables/);
});
it("denies scoped/no-role actors before database access", async () => {
  m.ctx.mockResolvedValue({ profile: { id: 1 }, isAccountActive: true, permissionCodes: ["notifications.email_queue.view"], globalPermissionCodes: [] });
  expect((await getEmailQueuePage()).success).toBe(false); expect(m.db).not.toHaveBeenCalled();
});
it.each([{ page: 0 }, { pageSize: 1000 }, { query: "x".repeat(101) }, { sortKey: "secret_ref" }, { status: "invented" }])("rejects unbounded or unknown filters %j", async input => {
  expect(queuePageSchema.safeParse(input).success).toBe(false);
});
it("uses whitelisted stable sorting and applies status/search before paging", async () => {
  await getEmailQueuePage({ sortKey: "scheduled", sortDir: "asc", status: "delivery_unknown", query: "test" });
  expect(calls).toContainEqual(["order", ["scheduled_for", { ascending: true, nullsFirst: false }]]);
  expect(calls).toContainEqual(["order", ["id", { ascending: true }]]);
  expect(calls).toContainEqual(["eq", ["status", "delivery_unknown"]]);
  expect(calls).toContainEqual(["or", ['subject.ilike."%test%",queue_code.ilike."%test%"']]);
});
it("treats LIKE wildcards and PostgREST punctuation as literal search data", () => {
  expect(queueSearchFilter("")).toBeNull(); expect(queueSearchFilter("123")).toContain("id.eq.123");
  expect(queueSearchFilter('x%,id.gt.0_"')).toBe('subject.ilike."%x\\\\%,id.gt.0\\\\_\\"%",queue_code.ilike."%x\\\\%,id.gt.0\\\\_\\"%"');
});
it("never converts query failure into an empty successful queue", async () => {
  fail = true; const result = await getEmailQueuePage(); expect(result.success).toBe(false);
  expect(result.data).toBeUndefined(); expect(result.error).not.toContain("PRIVATE_ERROR");
});
