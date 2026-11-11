import { beforeEach, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/rbac/check";
import { readDmsTagCatalogue } from "@/server/reads/dms-tag-catalogue";

const state = vi.hoisted(() => ({
  allowed: true, from: vi.fn(), select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn(), or: vi.fn(), range: vi.fn(),
}));
vi.mock("@/lib/rbac/check", () => ({ hasPermission: () => state.allowed }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: state.from }) }));

const context = { profile: { id: 8 }, isAccountActive: true } as AuthContext;

beforeEach(() => {
  vi.resetAllMocks();
  state.allowed = true;
  const query = { select: state.select, eq: state.eq, is: state.is, order: state.order, or: state.or, range: state.range };
  for (const method of [state.from, state.select, state.eq, state.is, state.order, state.or]) method.mockReturnValue(query);
  state.range.mockResolvedValue({ data: [], count: 500, error: null });
});

it("uses a bounded stable database page and literal search over names and codes", async () => {
  expect(await readDmsTagCatalogue({ page: 20, search: "%_", kind: "custom" }, context))
    .toEqual({ success: true, data: { tags: [], total: 500 } });
  expect(state.from).toHaveBeenCalledExactlyOnceWith("dms_tags");
  expect(state.select).toHaveBeenCalledWith("id,tag_name,tag_code,is_system", { count: "exact" });
  expect(state.eq.mock.calls).toEqual([["is_active", true], ["is_system", false]]);
  expect(state.is).toHaveBeenCalledWith("deleted_at", null);
  expect(state.order.mock.calls).toEqual([["tag_name"], ["id"]]);
  expect(state.or.mock.calls[0][0]).toContain(String.raw`\\%\\_`);
  expect(state.or.mock.calls[0][0]).toContain("tag_code.ilike.");
  expect(state.range).toHaveBeenCalledExactlyOnceWith(475, 499);
});

it("rejects invalid input and denied sessions before opening the catalogue", async () => {
  expect(await readDmsTagCatalogue({ page: 0, search: "", kind: "all" }, context)).toMatchObject({ success: false });
  state.allowed = false;
  expect(await readDmsTagCatalogue({ page: 1, search: "", kind: "all" }, context)).toMatchObject({ success: false });
  expect(state.from).not.toHaveBeenCalled();
});

it("distinguishes a failed read from an empty match set", async () => {
  state.range.mockResolvedValue({ data: null, count: null, error: { message: "private database error" } });
  expect(await readDmsTagCatalogue({ page: 1, search: "", kind: "all" }, context))
    .toEqual({ success: false, error: "Tags could not be loaded" });
});
