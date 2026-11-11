import { beforeEach, expect, it, vi } from "vitest";
import { applyDmsDocumentTagChanges } from "@/server/actions/dms/document-tags";

const state = vi.hoisted(() => ({
  access: vi.fn(), audit: vi.fn(), upsert: vi.fn(), remove: vi.fn(),
  assigned: new Set<number>(), available: new Set<number>(),
}));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: async () => ({ profile: { id: 4 } }), hasPermission: () => true }));
vi.mock("@/lib/dms/document-access", () => ({ checkDocumentConfidentialityAccess: state.access }));
vi.mock("@/server/actions/audit", () => ({ logAudit: state.audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/reads/all-pages", () => ({
  readAllPages: async (query: (from: number, to: number) => Promise<{ data: unknown[] }>) => (await query(0, 999)).data,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      let ids: number[] | undefined;
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        in: (_column: string, values: number[]) => { ids = values; return query; },
        order: () => query,
        range: async () => ({ data: [...state.assigned].map(tag_id => ({ tag_id })) }),
        limit: async () => ({ data: [...state.assigned].filter(id => ids?.includes(id)) }),
        upsert: state.upsert,
        delete: () => ({ eq: (_column: string, documentId: number) => ({
          in: (_idColumn: string, removed: number[]) => ({ select: () => state.remove(documentId, removed) }),
        }) }),
        insert: async () => ({ error: null }),
        then(resolve: (result: { data: { id: number }[] }) => void) {
          if (table !== "dms_tags") throw new Error("Unexpected catalogue query");
          resolve({ data: (ids ?? []).filter(id => state.available.has(id)).map(id => ({ id })) });
        },
      };
      return query;
    },
  }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  state.assigned = new Set([1, 8]);
  state.available = new Set([15]);
  state.access.mockResolvedValue({ allowed: true });
  state.upsert.mockImplementation((rows: { tag_id: number }[]) => ({ select: async () => {
    const data = rows.filter(row => !state.assigned.has(row.tag_id));
    for (const row of data) state.assigned.add(row.tag_id);
    return { data };
  } }));
  state.remove.mockImplementation(async (_id: number, removed: number[]) => ({
    data: removed.filter(id => state.assigned.delete(id)).map(tag_id => ({ tag_id })),
  }));
});

it("applies only the selected changes and allows replay without duplicates", async () => {
  const request = { documentId: 500, add: [15, 15], remove: [8] };
  expect(await applyDmsDocumentTagChanges(request)).toMatchObject({ success: true });
  expect(await applyDmsDocumentTagChanges(request)).toMatchObject({ success: true });
  expect([...state.assigned]).toEqual([1, 15]);
  expect(state.upsert).toHaveBeenLastCalledWith([{ document_id: 500, tag_id: 15, created_by: 4 }],
    { onConflict: "document_id,tag_id", ignoreDuplicates: true });
  expect(state.remove).toHaveBeenLastCalledWith(500, [8]);
  expect(state.audit).toHaveBeenCalledOnce();
});

it("leaves current tags intact when scope is denied or a selected addition disappeared", async () => {
  state.access.mockResolvedValue({ allowed: false });
  expect(await applyDmsDocumentTagChanges({ documentId: 500, add: [15], remove: [8] })).toMatchObject({ success: false });
  state.access.mockResolvedValue({ allowed: true });
  expect(await applyDmsDocumentTagChanges({ documentId: 500, add: [16], remove: [8] })).toMatchObject({ success: false });
  expect(state.upsert).not.toHaveBeenCalled();
  expect(state.remove).not.toHaveBeenCalled();
  expect([...state.assigned]).toEqual([1, 8]);
});
