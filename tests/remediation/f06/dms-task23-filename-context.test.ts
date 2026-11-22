import { beforeEach, expect, it, vi } from 'vitest';
import { previewDmsStandardFileName } from '@/server/actions/dms/standard-file-name';

const mocks = vi.hoisted(() => ({
  reads: [] as string[], batchVisible: true, sessionVisible: true,
  name: 'Synthetic Owner', malformedBatch: false,
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  from(table: string) {
    let columns = '';
    const query = {
      select(value: string) { columns = value; mocks.reads.push(table); return query; },
      eq: () => query,
      is: () => query,
      async maybeSingle() {
        if (table === 'dms_upload_sessions') return { data: mocks.sessionVisible ? {
          batch_id: 5,
          ...(columns.includes('dms_upload_batches') && {
            batch: mocks.batchVisible
              ? (mocks.malformedBatch ? [{ entity_type: 'employee', entity_id: 7 }] : { entity_type: 'employee', entity_id: 7 })
              : null,
          }),
        } : null, error: null };
        if (table === 'dms_upload_batches') return {
          data: mocks.batchVisible ? { entity_type: 'employee', entity_id: 7 } : null, error: null,
        };
        if (table === 'employees') return { data: { full_name_en: mocks.name }, error: null };
        throw new Error('Unexpected offline source');
      },
    };
    return query;
  },
}) }));

beforeEach(() => {
  mocks.reads.length = 0;
  mocks.batchVisible = true;
  mocks.sessionVisible = true;
  mocks.name = 'Synthetic Owner';
  mocks.malformedBatch = false;
});

const input = { typeCode: 'EMPLOYEE_PASSPORT', uploadSessionId: 3, originalFilename: 'fixture.pdf' };

it('resolves the same visible owner using two scoped reads and no write', async () => {
  const result = await previewDmsStandardFileName(input);
  expect(result).toMatchObject({ success: true, data: { fileName: expect.stringContaining('Synthetic') } });
  expect(mocks.reads).toEqual(['dms_upload_sessions', 'employees']);
});

it.each(['session', 'batch'])('does not reuse a prior visible name after losing the %s relationship', async source => {
  const first = await previewDmsStandardFileName(input);
  expect(first.data?.fileName).toContain('Synthetic');
  mocks.reads.length = 0;
  if (source === 'session') mocks.sessionVisible = false;
  else mocks.batchVisible = false;
  const after = await previewDmsStandardFileName({ ...input, expiryDate: '2027-05-10' });
  expect(after.success).toBe(true);
  expect(after.data?.fileName).not.toContain('Synthetic');
  expect(mocks.reads).toEqual(['dms_upload_sessions']);
});

it('rejects a malformed to-one parent without issuing an owner-name lookup', async () => {
  mocks.malformedBatch = true;
  expect((await previewDmsStandardFileName(input)).success).toBe(false);
  expect(mocks.reads).toEqual(['dms_upload_sessions']);
});
