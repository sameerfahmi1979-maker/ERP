import { beforeEach, expect, it, vi } from 'vitest';
import { runDmsAiOrchestrationPostDraft } from '@/server/actions/dms/orchestration';

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  enrich: vi.fn(),
  writes: [] as string[],
  replaceSource: false,
  actor: 7,
  flag: false as boolean | null,
  flagError: false,
  writeError: false,
  row: {} as Record<string, unknown>,
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('@/lib/rbac/check', async () => ({
  ...await vi.importActual('@/lib/rbac/scope'),
  getAuthContext: async () => ({
    profile: { id: mocks.actor }, isAccountActive: true, permissionCodes: ['dms.documents.upload'], roleCodes: [],
  }),
}));
vi.mock('@/server/actions/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/server/actions/dms/ai-summary', () => ({ generateAndSaveDmsAiSummary: mocks.enrich }));
vi.mock('@/server/actions/dms/ai-intelligence', () => ({ evaluateDmsDocumentIntelligence: mocks.enrich }));
vi.mock('@/server/actions/dms/ai-links', () => ({ suggestDmsDocumentLinks: mocks.enrich }));
vi.mock('@/server/actions/dms/ai-tags', () => ({ suggestDmsDocumentTags: mocks.enrich }));
vi.mock('@/server/actions/dms/document-content', () => ({ writeDocumentContentTextSystem: mocks.enrich }));
vi.mock('@/server/actions/dms/semantic-search', () => ({ generateDmsDocumentEmbedding: mocks.enrich }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enrich.mockResolvedValue({ success: true });
  mocks.writes.length = 0;
  mocks.replaceSource = false;
  mocks.actor = 7;
  mocks.flag = false;
  mocks.flagError = false;
  mocks.writeError = false;
  mocks.row = {
    id: 5, session_code: 'SYNTHETIC', document_id: 77, uploaded_by: 7, deleted_at: null, ai_result_id: 72,
    intake_status: 'draft_created', orchestration_status: 'pending', orchestration_steps_json: [],
  };
  mocks.client.mockResolvedValue({
    from(table: string) {
      const predicates: Array<[string, unknown]> = [];
      let write: Record<string, unknown> | undefined;
      async function execute() {
        if (table === 'erp_ai_feature_flags') return {
          data: mocks.flag === null ? null : { is_enabled: mocks.flag },
          error: mocks.flagError ? { message: 'private flag detail' } : null,
        };
        if (table !== 'dms_upload_sessions') return { data: null, error: null };
        if (write && mocks.replaceSource) mocks.row.ai_result_id = 73;
        if (!predicates.every(([field, expected]) => mocks.row[field] === expected)) return { data: null, error: null };
        if (write) {
          if (mocks.writeError) return { data: null, error: { message: 'private write detail' } };
          mocks.writes.push(String(write.orchestration_status));
          Object.assign(mocks.row, write);
        }
        return { data: { ...mocks.row }, error: null };
      }
      const query = {
        select: () => query,
        eq(field: string, value: unknown) { predicates.push([field, value]); return query; },
        is(field: string, value: null) { predicates.push([field, value]); return query; },
        update(values: Record<string, unknown>) { write = values; return query; },
        single: execute,
        maybeSingle: execute,
        then: (resolve: (result: unknown) => unknown) => execute().then(resolve),
      };
      return query;
    },
  });
});

const run = () => runDmsAiOrchestrationPostDraft({ sessionCode: 'SYNTHETIC' });

it('returns an unchanged disabled outcome without a new status write', async () => {
  mocks.row.orchestration_status = 'skipped_feature_disabled';
  expect(await run()).toMatchObject({ success: true, data: { orchestrationStatus: 'skipped_feature_disabled' } });
  expect(mocks.writes).toEqual([]);
  expect(mocks.enrich).not.toHaveBeenCalled();
});

it.each(['missing', 'unavailable'])('leaves the session pending when the flag row is %s', async (issue) => {
  mocks.flag = null;
  mocks.flagError = issue === 'unavailable';
  const result = await run();
  expect(result.success).toBe(false);
  expect(JSON.stringify(result)).not.toContain('private flag detail');
  expect(mocks.writes).toEqual([]);
});

it.each(['queued', 'running', 'complete', 'complete_with_warnings'])('returns existing %s without rewriting it', async (status) => {
  mocks.row.orchestration_status = status;
  expect(await run()).toMatchObject({ success: true, data: { orchestrationStatus: status } });
  expect(mocks.writes).toEqual([]);
  expect(mocks.enrich).not.toHaveBeenCalled();
});

it('starts one pipeline when two eligible requests overlap after a disabled outcome', async () => {
  mocks.row.orchestration_status = 'skipped_feature_disabled';
  mocks.flag = true;
  const results = await Promise.all([run(), run()]);
  expect(results.some(result => result.data?.orchestrationStatus === 'complete')).toBe(true);
  expect(mocks.writes).toEqual(['running', 'complete']);
  expect(mocks.enrich).toHaveBeenCalledTimes(5);
});

it('holds all pipeline calls when the running transition fails', async () => {
  mocks.flag = true;
  mocks.writeError = true;
  expect((await run()).success).toBe(false);
  expect(mocks.enrich).not.toHaveBeenCalled();
});

it('does not report completion when the settled transition fails', async () => {
  mocks.flag = true;
  mocks.enrich.mockImplementation(async () => {
    mocks.writeError = true;
    return { success: true };
  });
  expect((await run()).success).toBe(false);
  expect(mocks.writes).toEqual(['running']);
});

it('writes one skipped status across overlapping disabled requests', async () => {
  await Promise.all([run(), run()]);
  expect(mocks.writes).toEqual(['skipped_feature_disabled']);
  expect(mocks.enrich).not.toHaveBeenCalled();
});

it('denies re-evaluation from a different actor without the existing administrator grant', async () => {
  mocks.actor = 8;
  mocks.row.orchestration_status = 'skipped_feature_disabled';
  mocks.flag = true;
  expect((await run()).success).toBe(false);
  expect(mocks.writes).toEqual([]);
  expect(mocks.enrich).not.toHaveBeenCalled();
});

it('does not dispatch after the intake result is replaced before the running write', async () => {
  mocks.flag = true;
  mocks.replaceSource = true;
  expect((await run()).success).toBe(false);
  expect(mocks.writes).toEqual([]);
  expect(mocks.enrich).not.toHaveBeenCalled();
});
