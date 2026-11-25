import { beforeEach, expect, it, vi } from 'vitest';
import { listDmsUploadBatches } from '@/server/actions/dms/batch-intake';

const mocks = vi.hoisted(() => ({ ranges: [] as Array<{ table: string; to: number; rows: number }>, truncated: false }));
vi.mock('@/lib/rbac/check', () => ({
  getAuthContext: async () => ({ profile: { id: 7 }, isAccountActive: true, roleCodes: [] }),
  hasPermission: (_context: unknown, permission: string) => permission === 'dms.documents.upload',
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from(table: string) {
      let ids: number[] = [];
      const query = {
        select: () => query,
        is: () => query,
        order: () => query,
        in(_column: string, values: number[]) { ids = values; return query; },
        async range(from: number, to: number) {
          const rows = table === 'dms_upload_batches'
            ? Array.from({ length: 1100 }, (_, id) => ({ id: id + 1, batch_code: `SYN-${id + 1}` }))
            : ids.map(id => ({ id, batch_id: id, intake_status: 'failed', document: null }));
          const page = rows.slice(from, to + 1);
          if (mocks.truncated && table === 'dms_upload_batches') page.pop();
          mocks.ranges.push({ table, to, rows: page.length });
          return { data: page, error: null, count: rows.length };
        },
      };
      return query;
    },
  }),
}));

beforeEach(() => { mocks.ranges.length = 0; mocks.truncated = false; });

it('loads only the requested parents before decorating their scoped child counts', async () => {
  const result = await listDmsUploadBatches(2);
  expect(result).toMatchObject({ success: true, data: [{ id: 1, failedCount: 1 }, { id: 2, failedCount: 1 }] });
  expect(mocks.ranges).toEqual([
    { table: 'dms_upload_batches', to: 1, rows: 2 },
    { table: 'dms_upload_sessions', to: 499, rows: 2 },
  ]);
});

it('rejects a partial bounded page without child work', async () => {
  mocks.truncated = true;
  expect((await listDmsUploadBatches(2)).success).toBe(false);
  expect(mocks.ranges).toEqual([{ table: 'dms_upload_batches', to: 1, rows: 1 }]);
});
