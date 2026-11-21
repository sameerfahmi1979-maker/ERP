import { createClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import { createDmsDocumentType, updateDmsDocumentType } from "@/server/actions/dms/document-types";

const state = vi.hoisted(() => ({ client: vi.fn(), canManage: true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: state.client }));
vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: async () => ({ profile: { id: 7 } }),
  hasPermission: (_: unknown, permission: string) => permission === "dms.documents.manage_types" && state.canManage,
}));
vi.mock("@/server/actions/audit", () => ({ logAudit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const customType = {
  type_code: "SYNTHETIC_FLEET",
  name_en: "Synthetic Fleet evidence",
  allowed_entity_types: ["fleet_asset", "vehicle", "equipment"],
} as Parameters<typeof createDmsDocumentType>[0];

function setup(existing = ["fleet_asset", "equipment", "historic_written_value"]) {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return new Response(null, { status: 204 });
    return Response.json({ id: 77, type_code: "SYNTHETIC_FLEET", is_system: true, allowed_entity_types: existing });
  });
  state.client.mockResolvedValue(createClient("https://erp-test.invalid", "synthetic-key", {
    auth: { autoRefreshToken: false, persistSession: false }, global: { fetch },
  }));
  return fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.canManage = true;
});

it("accepts the canonical fleet asset value alongside the existing vehicle and equipment values", async () => {
  const fetch = setup();
  expect(await createDmsDocumentType(customType)).toEqual({ success: true, data: { id: 77 } });
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).allowed_entity_types).toEqual(customType.allowed_entity_types);
});

it("retains existing stored values when editing the type and only permits existing historical values", async () => {
  const retained = ["fleet_asset", "equipment", "historic_written_value"];
  const fetch = setup(retained);
  expect((await updateDmsDocumentType(77, { name_en: "Renamed", allowed_entity_types: retained })).success).toBe(true);
  expect(JSON.parse(String(fetch.mock.calls[1][1]?.body)).allowed_entity_types).toEqual(retained);
  expect((await updateDmsDocumentType(77, { allowed_entity_types: ["unconfigured_new_value"] })).success).toBe(false);
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
});

it("keeps type-management authorization on both create and update", async () => {
  const fetch = setup();
  state.canManage = false;
  expect(await createDmsDocumentType(customType)).toEqual({ success: false, error: "Permission denied" });
  expect(await updateDmsDocumentType(77, { name_en: "Renamed" })).toEqual({ success: false, error: "Permission denied" });
  expect(fetch).not.toHaveBeenCalled();
});
