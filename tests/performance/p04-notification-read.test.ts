import {afterEach, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({active: true, password: false, permissions: [] as string[], calls: [] as unknown[][], results: [] as unknown[], authReads: 0}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => {
  state.authReads++; return {profile: {id: 6, must_change_password: state.password}, isAccountActive: state.active, permissionCodes: state.permissions, roleCodes: [], roleAssignments: []};
}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({from: (...args: unknown[]) => {
  state.calls.push(["from", ...args]);
  const result = state.results.shift();
  const query: Record<string, unknown> = {then: (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve)};
  for (const method of ["select", "or", "ilike", "eq", "is", "order", "range", "abortSignal"]) query[method] = (...args: unknown[]) => {state.calls.push([method, ...args]); return query;};
  return query;
}})}));
import {readNotifications, readUnreadNotificationCount} from "@/server/reads/notifications";
import {POST} from "@/app/api/reads/notifications/route";
import {GET} from "@/app/api/notifications/bell/route";
import {literalContains} from "@/lib/reads/search";
const row = {id: 1, notification_code: "PERF-N1", source_module: "HR", source_entity_type: null, source_entity_id: null,
  notification_type: "test", severity: "info", title: "Synthetic notification", message: "Synthetic message", recipient_user_id: 6,
  recipient_role_code: null, recipient_email: null, channel_in_app: true, channel_email: false, status: "unread", scheduled_for: "2026-10-14T00:00:00Z",
  read_at: null, dismissed_at: null, archived_at: null, action_url: "/notifications", action_label: "Open", metadata_json: {secret: "PRIVATE"}, created_at: "2026-10-14T00:00:00Z", updated_at: "2026-10-14T00:00:00Z"};
const result = (data: unknown[] = [row], count = data.length) => ({data, count, error: null});
afterEach(() => Object.assign(state, {active: true, password: false, permissions: [], calls: [], results: [], authReads: 0}));
it("pages beyond 1000 with recipient restriction and minimal projection, no metadata leak", async () => {
  state.results = [result([row], 1101)]; const read = await readNotifications({page: 12, pageSize: 100});
  expect(read.success).toBe(true); expect(read.data?.totalCount).toBe(1101); expect(state.calls).toContainEqual(["eq", "recipient_user_id", 6]);
  expect(state.calls).toContainEqual(["range", 1100, 1199]); expect(state.authReads).toBe(1);
  expect(String(state.calls.find(call => call[0] === "select")?.[1])).not.toMatch(/\*|metadata_json/);
  expect(JSON.stringify(read)).not.toContain("PRIVATE");
});
it.each([{}, {active: false}, {password: true}])("admin read requires active permitted principal: %j", async overrides => {
  Object.assign(state, overrides); const read = await readNotifications({audience: "admin"}); expect(read).toMatchObject({success: false, error: "Permission denied"}); expect(state.calls).toEqual([]);
});
it.each(["notifications.admin", "notifications.manage"])("admin read preserves %s gate without pretending to grant database access", async permission => {
  state.permissions = [permission]; state.results = [result()]; expect((await readNotifications({audience: "admin"})).success).toBe(true);
  expect(state.calls).not.toContainEqual(["eq", "recipient_user_id", 6]);
});
it.each([{page: 0}, {pageSize: 101}, {search: "a".repeat(201)}, {recipientUserId: 7}, {audience: "all"}, {status: "unknown"}, {sorting: [{id: "metadata_json", desc: true}]}])("rejects invalid or authority-injecting criteria %j", async criteria => {
  expect((await readNotifications(criteria)).success).toBe(false); expect(state.calls).toEqual([]); expect(state.authReads).toBe(0);
});
it("filters before range, escapes wildcard search and resolves sort ties by id", async () => {
  state.results = [result([], 0)]; expect((await readNotifications({search: "_%", severity: "urgent", status: "unread", sourceModule: "HR", sorting: [{id: "title", desc: false}]})).success).toBe(true);
  expect(state.calls).toContainEqual(["eq", "severity", "urgent"]); expect(state.calls).toContainEqual(["eq", "status", "unread"]);
  expect(String(state.calls.find(call => call[0] === "or")?.[1])).toContain(`title.ilike.${literalContains("_%")}`);
  expect(state.calls.filter(call => call[0] === "order")).toEqual([["order", "title", {ascending: true, nullsFirst: false}], ["order", "id", {ascending: true}]]);
  expect(state.calls.findIndex(call => call[0] === "or")).toBeLessThan(state.calls.findIndex(call => call[0] === "range"));
});
it.each([result([row], 2), result([row, row]), result([row], -1), result([{...row, recipient_user_id: 7}]), {data: [], error: {message: "PRIVATE"}, count: 0}])("rejects incomplete, duplicate, wrong-owner or failed pages", async response => {
  state.results = [response]; const read = await readNotifications({}); expect(read.success).toBe(false); expect(JSON.stringify(read)).not.toContain("PRIVATE");
});
it.each(["javascript:alert(1)", "https://outside.invalid/", "//outside.invalid/"])("masks untrusted action URL %s", async action_url => {
  state.results = [result([{...row, action_url}])]; const read = await readNotifications({}); expect(read.success).toBe(true); expect(read.data?.rows[0].actionUrl).toBeNull();
});
it("recounts only the exact out-of-range response and never manufactures an empty successful page", async () => {
  state.results = [{data: null, count: null, status: 416, error: {code: "PGRST103"}}, result([], 2)];
  expect(await readNotifications({page: 3})).toMatchObject({success: true, data: {rows: [], totalCount: 2, page: 3}});
});
it.each([null, -1, 1.2, Number.MAX_SAFE_INTEGER + 1])("unknown or invalid unread count %s is not zero", async count => {
  state.results = [{count, error: null}]; expect((await readUnreadNotificationCount()).success).toBe(false);
});
it("true zero unread count is valid and uses head-only own-recipient read", async () => {
  state.results = [{count: 0, error: null}]; expect(await readUnreadNotificationCount()).toEqual({success: true, data: {count: 0}});
  expect(state.calls).toContainEqual(["select", "id", {count: "exact", head: true}]); expect(state.calls).toContainEqual(["eq", "recipient_user_id", 6]);
});
it("already aborted readers do no authentication or query work", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(readNotifications({}, undefined, controller.signal)).rejects.toMatchObject({name: "AbortError"});
  await expect(readUnreadNotificationCount(undefined, controller.signal)).rejects.toMatchObject({name: "AbortError"}); expect(state.authReads).toBe(0);
});
it("list route is private, cookie-varying and uses opaque failure", async () => {
  state.results = [{error: {message: "PRIVATE"}, data: null, count: null}];
  const response = await POST(new Request("http://localhost/api/reads/notifications", {method: "POST", headers: {"Content-Type": "application/json"}, body: "{}"}));
  expect(response.status).toBe(503); expect(response.headers.get("Cache-Control")).toContain("private, no-store"); expect(response.headers.get("Vary")).toBe("Cookie"); expect(await response.text()).not.toContain("PRIVATE");
});
it("bell count failure is HTTP unavailable, not successful zero", async () => {
  state.results = [{error: {message: "PRIVATE"}, count: null}]; const response = await GET(new Request("http://localhost/api/notifications/bell"));
  expect(response.status).toBe(503); expect(await response.text()).not.toMatch(/PRIVATE|"count":0/); expect(state.authReads).toBe(1);
});
it("bell preview performs only one bounded query and one shared authority resolution", async () => {
  state.results = [result()]; const response = await GET(new Request("http://localhost/api/notifications/bell?list=1"));
  expect(response.status).toBe(200); expect(state.authReads).toBe(1); expect(state.calls.filter(call => call[0] === "from")).toHaveLength(1); expect(state.calls).toContainEqual(["range", 0, 9]);
});
