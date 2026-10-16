import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => db }));
import { readBranchCompanyChoices } from '@/server/queries/branch-company-choices';

const choice = { id: 7, legal_name_en: 'Synthetic company', company_code: 'SYN' };
beforeEach(() => {
  vi.clearAllMocks();
  db.rpc.mockResolvedValue({ data: [choice], error: null });
});

it('uses the session-bound creation projection without organization access', async () => {
  expect(await readBranchCompanyChoices()).toEqual([choice]);
  expect(db.rpc).toHaveBeenCalledExactlyOnceWith('get_branch_company_choices', { p_branch_id: null });
});
it('passes only the existing branch identity for its retained owner label', async () => {
  expect(await readBranchCompanyChoices(31)).toEqual([choice]);
  expect(db.rpc).toHaveBeenCalledExactlyOnceWith('get_branch_company_choices', { p_branch_id: 31 });
});
it('preserves genuinely empty authority results', async () => {
  db.rpc.mockResolvedValue({ data: [], error: null });
  expect(await readBranchCompanyChoices()).toEqual([]);
});
it('does not truncate a complete creation catalogue at the Data API row cap', async () => {
  const data = Array.from({ length: 1001 }, (_, index) => ({ ...choice, id: index + 1 }));
  db.rpc.mockResolvedValue({ data, error: null });
  expect(await readBranchCompanyChoices()).toHaveLength(1001);
});
it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN])('rejects invalid branch identity %s before I/O', async id => {
  await expect(readBranchCompanyChoices(id)).rejects.toThrow('Choose a valid branch.');
  expect(db.rpc).not.toHaveBeenCalled();
});
it.each([null, {}, [choice, choice], [{ ...choice, bank_account: 'secret' }], [{ ...choice, id: '7' }], [{ ...choice, id: Number.MAX_SAFE_INTEGER + 1 }], [{ id: 7, company_code: 'SYN' }]])('rejects malformed or overbroad projection %j', async data => {
  db.rpc.mockResolvedValue({ data, error: null });
  await expect(readBranchCompanyChoices()).rejects.toThrow('Branch company choices could not be loaded. Try again.');
});
it('rejects multiple company rows for one immutable branch owner', async () => {
  db.rpc.mockResolvedValue({ data: [choice, { ...choice, id: 8 }], error: null });
  await expect(readBranchCompanyChoices(31)).rejects.toThrow('Branch company choices could not be loaded. Try again.');
});
it('does not turn read failures into empty authority or disclose raw diagnostics', async () => {
  db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private diagnostic' } })
    .mockRejectedValueOnce(new Error('private diagnostic'));
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(readBranchCompanyChoices()).rejects.toThrow('Branch company choices could not be loaded. Try again.');
  }
});

const sql = readFileSync('supabase/migrations/20261004162015_f06_branch_company_choices.sql', 'utf8');
it('keeps creation scope company-wide and limits current-record scope to its derived owner', () => {
  expect(sql).toContain("where c.status='active'");
  expect(sql).toContain("permission_in_scope('branches.manage',c.id,null)");
  expect(sql).toContain('join public.owner_companies c on c.id=b.owner_company_id');
  expect(sql).toContain('where b.id=p_branch_id');
  expect(sql).toContain("permission_in_scope('branches.view',b.owner_company_id,b.id)");
  expect(sql).toContain("permission_in_scope('branches.manage',b.owner_company_id,b.id)");
  expect(sql).not.toMatch(/organizations\.(?:view|manage)|current_user_has_permission|createAdminClient/);
});
it('exposes only labels via a restricted invoker wrapper and active session checks', () => {
  expect(sql).toContain('business_principal_is_active()');
  expect(sql).toContain("security definer set search_path=''");
  expect(sql).toContain("security invoker set search_path=''");
  for (const name of ['erp_private.branch_company_choices', 'public.get_branch_company_choices']) {
    expect(sql).toContain(`revoke all on function ${name}(bigint) from public,anon,service_role`);
    expect(sql).toContain(`grant execute on function ${name}(bigint) to authenticated`);
  }
  expect(sql).toContain("'id',c.id,'legal_name_en',c.legal_name_en,'company_code',c.company_code");
  expect(sql).not.toMatch(/select\s+\*|to_jsonb\(c\)|create\s+policy|grant\s+select/i);
});
