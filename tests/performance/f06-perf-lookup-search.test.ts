import {beforeEach, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({auth: vi.fn(), client: vi.fn()}));
vi.mock("@/lib/rbac/check", () => ({getAuthContext: state.auth, hasGlobalPermission: () => false}));
vi.mock("@/lib/supabase/server", () => ({createClient: state.client}));
import {readLookupSearch} from "@/server/reads/lookup-values";

type Operation = {table: string; method: string; args: unknown[]};
const operations: Operation[] = [];
beforeEach(() => {
  operations.length = 0;
  state.auth.mockResolvedValue({profile: {must_change_password: false}, isAccountActive: true});
  state.client.mockImplementation(async () => ({from: (table: string) => {
    const builder: Record<string, unknown> = {then: (resolve: (value: unknown) => void) =>
      Promise.resolve(table === "erp_lookup_category_choices"
        ? {data: {id: 1, is_active: true}, error: null}
        : {data: [], count: 0, error: null}).then(resolve)};
    for (const method of ["select", "eq", "is", "order", "range", "maybeSingle", "ilike"]) {
      builder[method] = (...args: unknown[]) => {operations.push({table, method, args}); return builder;};
    }
    return builder;
  }}));
});

it.each([
  ["percent %", "%percent \\%%"],
  ["under_score", "%under\\_score%"],
  ["back\\slash", "%back\\\\slash%"],
  ["%_\\", "%\\%\\_\\\\%"],
])("preserves literal wildcard and backslash search for %s through the authorized F06 view", async (search, pattern) => {
  expect((await readLookupSearch({categoryCode: "TEST", search})).success).toBe(true);
  expect(operations).toContainEqual({table: "erp_lookup_value_choices", method: "ilike", args: ["value_label_en", pattern]});
  expect(operations.some(operation => operation.table.startsWith("global_lookup"))).toBe(false);
  expect(operations).toContainEqual({table: "erp_lookup_value_choices", method: "range", args: [0, 24]});
});
