import { afterAll, beforeAll, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const state = vi.hoisted(() => ({ admin: null as unknown as ReturnType<typeof createClient>, client: null as unknown as ReturnType<typeof createClient> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { getEmailQueuePage } from "@/server/actions/notifications/email-queue";
import { getQueueReadiness } from "@/lib/email/queue/readiness";
const runtime = path.resolve("CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F09/local");
const keys = JSON.parse(fs.readFileSync(path.join(runtime, "keys-private.json"), "utf8"));
const fixtures = JSON.parse(fs.readFileSync(path.join(runtime, "fixtures-private.json"), "utf8"));
const marker = "F09_PAGE_" + randomUUID();
const recordFile = path.join(runtime, marker + ".json");
const clients: Record<string, ReturnType<typeof createClient>> = {};
const ids: number[] = [];
const saved: { marker: string; ids: number[]; cleanup: string; realEmailsSent: number } = { marker, ids, cleanup: "not_started", realEmailsSent: 0 };
const save = () => fs.writeFileSync(recordFile, JSON.stringify(saved, null, 2));
beforeAll(async () => {
  expect(path.resolve(".").replaceAll("\\", "/")).toBe("C:/dev/agt-erp-f09");
  expect(keys.API_URL).toBe("http://127.0.0.1:16521");
  const originalFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== keys.API_URL) throw new Error("Only F09 loopback traffic allowed");
    return originalFetch(input, init);
  });
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  state.admin = createClient(keys.API_URL, keys.SERVICE_ROLE_KEY, options);
  for (const [name, actor] of Object.entries(fixtures.actors)) {
    const client = createClient(keys.API_URL, keys.ANON_KEY, options);
    expect((await client.auth.signInWithPassword(actor as { email: string; password: string })).error).toBeNull();
    clients[name] = client;
  }
  state.client = clients.operator;
  vi.stubEnv("F09_EMAIL_WORKER_ENABLED", "false");
  save();
  const rows = Array.from({ length: 225 }, (_, index) => ({
    source_module: marker, created_by: fixtures.actors.operator.profileId,
    to_emails: ["f09@example.invalid"], subject: marker + " item " + String(index).padStart(3, "0") + (index === 224 ? ' %,id.gt.0_"' : ""),
    text_body: "Synthetic pagination check only", status: index % 2 ? "cancelled" : "pending",
    paused_at: new Date().toISOString(), scheduled_for: "2099-01-01T00:00:00Z",
  }));
  const inserted = await state.admin.from("erp_email_queue").insert(rows).select("id");
  expect(inserted.error).toBeNull(); ids.push(...inserted.data!.map(row => row.id));
  saved.cleanup = "tracked_for_exact_cleanup"; save();
});
afterAll(async () => {
  try {
    if (ids.length) {
      const deleted = await state.admin.from("erp_email_queue").delete().eq("source_module", marker).in("id", ids).select("id");
      expect(deleted.error).toBeNull(); expect(deleted.data).toHaveLength(ids.length);
      saved.cleanup = "all_225_exact_owned_rows_removed"; save();
    }
    for (const client of Object.values(clients)) await client.auth.signOut({ scope: "local" });
  } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
});
it("reads all 225 synthetic rows across real PostgREST pages, including page 9", async () => {
  const seen: number[] = [];
  for (let page = 1; page <= 9; page++) {
    const result = await getEmailQueuePage({ query: marker, page });
    expect(result.success).toBe(true); expect(result.data?.total).toBe(225);
    expect(result.data?.items).toHaveLength(25); seen.push(...result.data!.items.map(row => row.id));
  }
  expect(new Set(seen).size).toBe(225); expect(seen).toEqual([...ids].sort((a, b) => b - a));
});
it("filters and counts the entire set rather than only the visible page", async () => {
  const result = await getEmailQueuePage({ query: marker, status: "cancelled", page: 2, pageSize: 50 });
  expect(result.success).toBe(true); expect(result.data?.total).toBe(112); expect(result.data?.items).toHaveLength(50);
  expect(result.data!.items.every(row => row.status === "cancelled")).toBe(true);
  const count = await state.client.from("erp_email_queue").select("id", { count: "exact", head: true }).is("deleted_at", null);
  expect(result.data?.allTotal).toBe(count.count);
});
it.each(["id", "status", "priority", "sourceModule", "to", "subject", "attempts", "scheduled", "error"] as const)("sorts %s over the real database with a stable ID tie-break", async sortKey => {
  const result = await getEmailQueuePage({ query: marker, sortKey, sortDir: "asc" });
  expect(result.success).toBe(true); expect(result.data?.items).toHaveLength(25);
});
it("literal wildcards, comma, quotes and filter-looking text cannot escape the search", async () => {
  const result = await getEmailQueuePage({ query: '%,id.gt.0_"' });
  expect(result.success).toBe(true); expect(result.data?.total).toBe(1); expect(result.data?.items[0].id).toBe(ids[224]);
});
it("company-scoped and no-role users cannot read the global operator queue", async () => {
  for (const name of ["scoped", "none"]) {
    state.client = clients[name]; expect((await getEmailQueuePage({ query: marker })).success).toBe(false);
  }
  state.client = clients.operator;
});
it("actual readiness performs reads only and cannot claim, dispatch or produce an event", async () => {
  const before = await state.admin.from("erp_email_attempt_events").select("id", { count: "exact", head: true });
  const result = await getQueueReadiness(false);
  expect(result.status).toBe("paused"); expect(result.heartbeatVerified).toBe(false); expect(result.inboxDeliveryVerified).toBe(false);
  const after = await state.admin.from("erp_email_attempt_events").select("id", { count: "exact", head: true });
  expect(after.count).toBe(before.count);
  const unchanged = await state.admin.from("erp_email_queue").select("attempt_count").eq("source_module", marker);
  expect(unchanged.data?.every(row => row.attempt_count === 0)).toBe(true);
});
