import { beforeEach, expect, it, vi } from 'vitest';
import { updateDmsDocument, type UpdateDmsDocumentInput } from '@/server/actions/dms/documents';

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  rebuild: vi.fn(),
  event: vi.fn(),
  audit: vi.fn(),
  policy: vi.fn(),
  row: {} as Record<string, unknown>,
  swapScope: false,
  snapshotReads: 0,
}));

vi.mock('@/lib/rbac/check', () => ({
  getAuthContext: async () => ({ profile: { id: 7 }, permissionCodes: ['dms.documents.edit'], roleCodes: [] }),
  hasPermission: (_context: unknown, code: string) => code === 'dms.documents.edit',
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@/server/actions/audit', () => ({ logAudit: mocks.audit }));
vi.mock('@/server/actions/dms/expiry-reminders', () => ({
  generateDmsExpiryRemindersForDocument: vi.fn(),
  rebuildDmsExpiryReminders: mocks.rebuild,
}));
vi.mock('@/server/dms-notification-policy', () => ({ getDmsNotificationSettingsForScheduler: mocks.policy }));
vi.mock('@/server/numbered-dms-create', () => ({ createNumberedDmsDocument: vi.fn() }));
vi.mock('@/server/dms-archive-transition', () => ({ changeDocumentArchive: vi.fn() }));
vi.mock('@/server/reads/dms-documents', () => ({ readAllDmsDocuments: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.swapScope = false;
  mocks.snapshotReads = 0;
  mocks.row = {
    id: 9, title: 'Original title', expiry_date: '2027-06-01', document_type_id: 14,
    owning_company_id: 17, owning_branch_id: null, deleted_at: null,
    status: 'active', confidentiality_level: 'company', reminder_policy_id: null,
  };
  mocks.client.mockResolvedValue({
    from(table: string) {
      if (table === 'dms_document_events') return { insert: mocks.event };
      expect(table).toBe('dms_documents');
      const predicates: Array<[string, unknown]> = [];
      let updates: Record<string, unknown> | undefined;
      async function execute() {
        if (!updates) mocks.snapshotReads++;
        if (updates && mocks.swapScope) mocks.row.owning_branch_id = 24;
        if (!predicates.every(([field, expected]) => mocks.row[field] === expected)) return { data: null, error: null };
        if (updates) Object.assign(mocks.row, updates);
        return { data: { ...mocks.row }, error: null };
      }
      const query = {
        select: () => query,
        eq(field: string, value: unknown) { predicates.push([field, value]); return query; },
        is(field: string, value: null) { predicates.push([field, value]); return query; },
        update(values: Record<string, unknown>) { updates = values; return query; },
        maybeSingle: execute,
      };
      return query;
    },
  });
});

it('saves a changed title without reading scheduler settings or rebuilding unchanged expiry', async () => {
  const result = await updateDmsDocument({
    id: 9, title: 'Changed title', expiry_date: '2027-06-01', document_type_id: 14,
    owning_company_id: 17, owning_branch_id: null,
  });
  expect(result).toMatchObject({ success: true, data: { id: 9 } });
  expect(mocks.row.title).toBe('Changed title');
  expect(mocks.event).toHaveBeenCalledOnce();
  expect(mocks.audit).toHaveBeenCalledOnce();
  expect(mocks.policy).not.toHaveBeenCalled();
  expect(mocks.rebuild).not.toHaveBeenCalled();
});

it.each<Partial<UpdateDmsDocumentInput>>([
  { expiry_date: '2027-07-01' }, { expiry_date: null }, { document_type_id: 15 },
  { owning_company_id: 18 }, { owning_branch_id: 19 },
])('rebuilds once for a real reminder input change %j', async (input) => {
  expect((await updateDmsDocument({ id: 9, ...input })).success).toBe(true);
  expect(mocks.row).toMatchObject(input);
  expect(mocks.rebuild).toHaveBeenCalledExactlyOnceWith(9, { reminderDays: undefined });
});

it('holds a save when the persisted reminder scope changes between read and update', async () => {
  mocks.swapScope = true;
  const result = await updateDmsDocument({ id: 9, title: 'Changed title', expiry_date: '2027-06-01', owning_branch_id: null });
  expect(result.success).toBe(false);
  expect(mocks.row).toMatchObject({ owning_branch_id: 24, title: 'Original title' });
  expect(mocks.audit).not.toHaveBeenCalled();
  expect(mocks.rebuild).not.toHaveBeenCalled();
});

it('keeps the stored status and confidentiality in a partial title update', async () => {
  expect((await updateDmsDocument({ id: 9, title: 'Changed title' })).success).toBe(true);
  expect(mocks.row).toMatchObject({ title: 'Changed title', status: 'active', confidentiality_level: 'company' });
  expect(mocks.rebuild).not.toHaveBeenCalled();
});

it('reconciles watches when an existing expiry becomes eligible again', async () => {
  mocks.row.status = 'superseded';
  expect((await updateDmsDocument({ id: 9, status: 'active', expiry_date: '2027-06-01' })).success).toBe(true);
  expect(mocks.row.status).toBe('active');
  expect(mocks.rebuild).toHaveBeenCalledOnce();
});

const expectedReminderInputs = {
  expiry_date: '2027-06-01', document_type_id: 14, owning_company_id: 17,
  owning_branch_id: null, status: 'active', reminder_policy_id: null,
};

it('uses the form snapshot in the conditional write with zero snapshot or scheduler reads', async () => {
  const result = await updateDmsDocument({
    id: 9, title: 'Changed title', expiry_date: '2027-06-01', expectedReminderInputs,
  });
  expect(result).toMatchObject({ success: true, data: { id: 9, reminderInputs: expectedReminderInputs } });
  expect(mocks.snapshotReads).toBe(0);
  expect(mocks.policy).not.toHaveBeenCalled();
  expect(mocks.rebuild).not.toHaveBeenCalled();
});

it('rejects a mismatched prior expiry even when the requested value matches it', async () => {
  const result = await updateDmsDocument({
    id: 9, title: 'Changed title', expiry_date: '2027-07-01',
    expectedReminderInputs: { ...expectedReminderInputs, expiry_date: '2027-07-01' },
  });
  expect(result.success).toBe(false);
  expect(mocks.row).toMatchObject({ expiry_date: '2027-06-01', title: 'Original title' });
  expect(mocks.snapshotReads).toBe(0);
  expect(mocks.audit).not.toHaveBeenCalled();
  expect(mocks.rebuild).not.toHaveBeenCalled();
});

it('returns the stored reminder inputs after one rebuild of a changed expiry', async () => {
  const result = await updateDmsDocument({ id: 9, expiry_date: '2027-07-01', expectedReminderInputs });
  expect(result).toMatchObject({ success: true, data: { reminderInputs: { expiry_date: '2027-07-01' } } });
  expect(mocks.snapshotReads).toBe(0);
  expect(mocks.rebuild).toHaveBeenCalledOnce();
});
