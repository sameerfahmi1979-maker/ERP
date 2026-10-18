import {afterEach, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({active: true, scoped: false, permissions: ["notifications.email_queue.view"], calls: [] as unknown[][], results: [] as unknown[], authReads: 0}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => {state.authReads++; return {profile: {id: 6, must_change_password: false}, isAccountActive: state.active, permissionCodes: state.permissions, globalPermissionCodes:state.scoped?[]:state.permissions, roleCodes: [], roleAssignments: state.scoped?[{roleId:2,roleCode:'scoped',ownerCompanyId:1,branchId:null,permissionCodes:state.permissions}]:[]};}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({from: (...args: unknown[]) => {
  state.calls.push(["from", ...args]); const result = state.results.shift(); const query: Record<string, unknown> = {then: (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve)};
  for (const method of ["select", "or", "ilike", "eq", "is", "order", "range", "abortSignal"]) query[method] = (...args: unknown[]) => {state.calls.push([method, ...args]); return query;}; return query;
}})}));
import {readEmailQueue, readPendingEmailCount} from "@/server/reads/email-queue";
import {POST} from "@/app/api/reads/email-queue/route";
import {POST as pendingRoute} from "@/app/api/reads/email-pending-count/route";
import {literalContains} from "@/lib/reads/search";
const row = {id: 4, queue_code: "Q-4", notification_id: null, provider_config_id: null, source_module: "PERF", source_entity_type: null, source_entity_id: null, priority: "normal", status: "pending", from_email: null, to_emails: ["synthetic@example.invalid"], subject: "Synthetic queue item", template_code: null, scheduled_for: "2099-01-01T00:00:00Z", sent_at: null, cancelled_at: null, attempt_count: 0, max_attempts: 3, next_retry_at: null, last_error: null, external_message_id: null, created_at: "2026-10-14T00:00:00Z"};
const result = (rows: unknown[] = [row], count = rows.length) => ({data: rows, count, error: null});
afterEach(() => Object.assign(state, {active: true, scoped:false, permissions: ["notifications.email_queue.view"], calls: [], results: [], authReads: 0}));
it('a company-only queue grant cannot read global queue metadata or counts',async()=>{
 state.scoped=true;expect((await readEmailQueue({})).success).toBe(false);expect((await readPendingEmailCount()).success).toBe(false);expect(state.calls).toEqual([]);
});
it('provider-accepted filtering uses the actual durable sent/acceptance columns',async()=>{
 state.results=[result([],0)];await readEmailQueue({status:'provider_accepted'});expect(state.calls).toContainEqual(['eq','status','sent']);expect(state.calls).toContainEqual(['eq','delivery_state','provider_accepted']);
});
it("reads an exact complete queue page beyond the old ceiling without message bodies", async () => {
  state.results = [result([{...row, html_body: "PRIVATE_HTML", bcc_emails: ["PRIVATE"], template_variables_json: {secret: "PRIVATE"}}], 1101)];
  const response = await readEmailQueue({page: 12, pageSize: 100}); expect(response.success).toBe(true); expect(response.data?.totalCount).toBe(1101);
  expect(state.calls).toContainEqual(["from", "perf_email_queue_read"]); expect(state.calls).toContainEqual(["range", 1100, 1199]); expect(JSON.stringify(response)).not.toContain("PRIVATE");
  expect(String(state.calls.find(call => call[0] === "select")?.[1])).not.toMatch(/\*|body|cc_emails|variables/);
});
it.each(["notifications.email_queue.view", "notifications.email_queue.manage", "notifications.admin"])("preserves reader permission %s", async permission => {
  state.permissions = [permission]; state.results = [result()]; expect((await readEmailQueue({})).success).toBe(true);
});
it.each([[], ["notifications.email_queue.process"], ["reports.view"]].map(permissions => ({permissions})))("does not substitute unrelated permissions $permissions", async ({permissions}) => {
  state.permissions = permissions; expect(await readEmailQueue({})).toMatchObject({success: false, error: "Permission denied"}); expect(state.calls).toEqual([]);
});
it("suspended principals never issue database reads", async () => {state.active = false; expect((await readEmailQueue({})).success).toBe(false); expect(state.calls).toEqual([]);});
it.each([{pageSize: 101}, {page: 0}, {status: "bad"}, {providerId: 1}, {search: "a".repeat(201)}, {sorting: [{id: "html_body", desc: false}]}])("rejects invalid criteria %j", async input => {
  expect((await readEmailQueue(input)).success).toBe(false); expect(state.calls).toEqual([]); expect(state.authReads).toBe(0);
});
it.each([["id", "id"], ["status", "status"], ["priority", "priority"], ["sourceModule", "source_module"], ["toEmails", "recipients_search"], ["subject", "subject"], ["attemptCount", "attempt_count"], ["scheduledFor", "scheduled_for"], ["lastError", "last_error"]])("sorts complete result %s through its exact native field", async (id, column) => {
  state.results = [result([], 0)]; await readEmailQueue({sorting: [{id, desc: false}]}); expect(state.calls).toContainEqual(["order", column, {ascending: true, nullsFirst: false}]); expect(state.calls.filter(call => call[0] === "order")).toHaveLength(id === "id" ? 1 : 2);
});
it("recipient search and explicit status/priority filters execute before paging", async () => {
  state.results = [result([], 0)]; await readEmailQueue({search: "test_%", status: "failed", priority: "urgent", sourceModule: "DMS"});
  expect(String(state.calls.find(call => call[0] === "or")?.[1])).toContain(`recipients_search.ilike.${literalContains("test_%")}`);
  expect(state.calls).toContainEqual(["eq", "status", "failed"]); expect(state.calls).toContainEqual(["eq", "priority", "urgent"]);
});
it.each([result([row], 2), result([row, row]), result([], -1), {data: null, count: null, error: {message: "PRIVATE"}}])("fails incomplete or unavailable results instead of empty success", async response => {
  state.results = [response]; const read = await readEmailQueue({}); expect(read.success).toBe(false); expect(JSON.stringify(read)).not.toContain("PRIVATE");
});
it("separate pending total is head-only and not inferred from current page", async () => {
  state.results = [{count: 1207, error: null}]; expect(await readPendingEmailCount()).toEqual({success: true, data: {count: 1207}});
  expect(state.calls).toContainEqual(["select", "id", {count: "exact", head: true}]); expect(state.calls).toContainEqual(["eq", "status", "pending"]);
});
it.each([null, -1, 0.5])("pending total %s cannot masquerade as zero", async count => {state.results = [{count, error: null}]; expect((await readPendingEmailCount()).success).toBe(false);});
it("an aborted queue read does no auth or query work", async () => {const c = new AbortController(); c.abort(); await expect(readEmailQueue({}, undefined, c.signal)).rejects.toMatchObject({name: "AbortError"}); expect(state.authReads).toBe(0);});
it("queue failures keep private headers and opaque HTTP errors", async () => {
  state.results = [{data: null, count: null, error: {message: "PRIVATE"}}]; const response = await POST(new Request("http://localhost/api/reads/email-queue", {method: "POST", headers: {"Content-Type": "application/json"}, body: "{}"}));
  expect(response.status).toBe(503); expect(response.headers.get("Cache-Control")).toContain("private, no-store"); expect(await response.text()).not.toContain("PRIVATE");
});
it.each(["null", "[]", '"bad"', '{"recipient":1}'])("pending-count route rejects %s", async body => {
  const response = await pendingRoute(new Request("http://localhost/api/reads/email-pending-count", {method: "POST", headers: {"Content-Type": "application/json"}, body})); expect(response.status).toBe(400); expect(state.calls).toEqual([]);
});
