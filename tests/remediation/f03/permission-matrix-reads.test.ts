import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  from: vi.fn(),
  hasPermission: vi.fn(),
  ranges: [] as Array<[number, number]>,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: state.from }),
}));
vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: async () => ({}),
  hasPermission: state.hasPermission,
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { getAllRolePermissions } from "@/server/queries/permissions";

const assignments = Array.from({ length: 1029 }, (_, index) => ({
  id: index + 1,
  permission_id: index + 8,
  role_id: 6,
}));

function mockAssignments(cap = 1000, failAfterFirstPage = false) {
  const page = (from: number, to: number) => ({
    data: assignments.slice(from, Math.min(from + cap, to + 1)),
    error: null,
    count: assignments.length,
  });
  state.from.mockImplementation((table: string) => {
    expect(table).toBe("role_permissions");
    return {
      select: () => ({
        ...page(0, cap - 1),
        order: (column: string) => {
          expect(column).toBe("id");
          return {
            range: async (from: number, to: number) => {
              state.ranges.push([from, to]);
              if (failAfterFirstPage && from > 0) {
                return { data: null, count: null, error: { message: "unavailable" } };
              }
              return page(from, to);
            },
          };
        },
      }),
    };
  });
}

beforeEach(() => {
  state.from.mockReset();
  state.hasPermission.mockReset().mockReturnValue(true);
  state.ranges.length = 0;
});

it.each([1000, 275])("loads the full matrix with a Data API cap of %i rows", async (cap) => {
  mockAssignments(cap);

  const rows = await getAllRolePermissions();

  expect(rows).toHaveLength(1029);
  expect(rows?.[1028]).toEqual({ role_id: 6, permission_id: 1036 });
  expect(state.ranges.length).toBeGreaterThan(1);
});

it("distinguishes a failed second page from unassigned permissions", async () => {
  mockAssignments(1000, true);
  await expect(getAllRolePermissions()).resolves.toBeNull();
});

it("does not query the permission matrix without view access", async () => {
  state.hasPermission.mockReturnValue(false);
  mockAssignments();
  await expect(getAllRolePermissions()).resolves.toBeNull();
  expect(state.from).not.toHaveBeenCalled();
});
