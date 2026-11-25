import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/reads/hr-rule-settings/route";
import { readHrRuleSettings } from "@/server/reads/hr-rule-settings";
import { readRoute } from "@/server/reads/route-response";

const m = vi.hoisted(() => ({ allow: true, manage: false, rpc: vi.fn(), abort: vi.fn(), response: {} as unknown }));
vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: async () => ({}),
  hasPermission: () => m.allow,
  hasGlobalPermission: () => m.manage,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: m.rpc }) }));

const workflow = {
  id: 1201, workspace_revision: "901", workflow_code: "HR_1201", workflow_name_en: "Late Workflow",
  workflow_name_ar: null, workflow_type: "general", approval_step: 9, approval_role_id: null,
  escalation_role_id: 12, sla_hours: null, is_required: true, is_active: false,
  reference_labels: { approval_role_id: "Not assigned", escalation_role_id: "Saved selection (details unavailable)" },
};
const request = (params: unknown) => new Request("http://localhost/api/reads/hr-rule-settings", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(params),
});
const worklist = { kind: "list", entity: "hr_approval_workflows" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  m.allow = true;
  m.manage = false;
  m.response = { data: { data: [workflow], total: 1201 }, error: null };
  m.rpc.mockImplementation(() => {
    const query = {
      retry: () => query,
      abortSignal: (signal: AbortSignal) => { m.abort(signal); return query; },
      then: (resolve: (result: unknown) => void) => Promise.resolve(m.response).then(resolve),
    };
    return query;
  });
});

it("returns an exact deep page with its retained mask and forwards cancellation", async () => {
  const input = request({ ...worklist, page: 49, page_size: 25 });
  const response = await POST(input);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, data: { data: [workflow], total: 1201 } });
  expect(m.rpc).toHaveBeenCalledWith("hr_rule_settings_page", {
    p_entity: "hr_approval_workflows", p_page: 49, p_size: 25, p_search: "", p_filters: {}, p_sort: [],
  });
  expect(m.abort).toHaveBeenCalledWith(input.signal);
});

it("accepts fully sized Unicode Notes criteria through the route while preserving the shared default bound", async () => {
  const notes = "備".repeat(2000);
  const criteria = { kind: "list", entity: "hr_role_requirement_matrix", page: 1,
    tableSearch: notes, columnFilters: { notes } };
  expect(new TextEncoder().encode(JSON.stringify(criteria)).byteLength).toBeGreaterThan(12000);
  m.response = { data: { data: [], total: 0 }, error: null };
  expect((await POST(request(criteria))).status).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith("hr_rule_settings_page", expect.objectContaining({ p_search: notes, p_filters: { notes } }));
  const other = vi.fn(async () => ({ success: true }));
  expect((await readRoute(request(criteria), other)).status).toBe(400);
  expect(other).not.toHaveBeenCalled();
});

it("rejects a result whose declared count does not match the requested row window", async () => {
  m.response = { data: { data: [workflow], total: 26 }, error: null };
  expect((await POST(request(worklist))).status).toBe(503);
});

it("rejects a mismatched field, a duplicate sort and an unsupported filter before creating a query", async () => {
  for (const input of [
    { kind: "choices", entity: worklist.entity, field: "required_training_type_id", parent: 3 },
    { ...worklist, sorting: [{ id: "approval_step", desc: true }, { id: "approval_step", desc: false }] },
    { ...worklist, columnFilters: { escalation_role_code: "A", approval_step: "not a number" } },
  ]) expect((await POST(request(input))).status).toBe(400);
  expect(m.rpc).not.toHaveBeenCalled();
});

it("requires global management for parent-bound choices and does not accept an arbitrary selected ID", async () => {
  const criteria = { kind: "choices", entity: worklist.entity, field: "escalation_role_id", parent: 32, page: 2 };
  expect((await POST(request(criteria))).status).toBe(403);
  expect(m.rpc).not.toHaveBeenCalled();
  m.manage = true;
  expect((await POST(request({ ...criteria, selectedId: 42 }))).status).toBe(400);
  expect(m.rpc).not.toHaveBeenCalled();
  m.response = { data: { data: [], total: 0, retained: { id: 19, label: "Inactive choice", eligible: false } }, error: null };
  expect(await readHrRuleSettings(criteria)).toEqual({
    success: true, data: { data: [], total: 0, retained: { id: 19, label: "Inactive choice", eligible: false } },
  });
  expect(m.rpc).toHaveBeenCalledWith("hr_rule_settings_choices", {
    p_entity: worklist.entity, p_field: "escalation_role_id", p_parent: 32, p_page: 2, p_search: "",
  });
});

it("rejects retired list requests before opening a query", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(readHrRuleSettings(worklist, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  expect(m.rpc).not.toHaveBeenCalled();
});
