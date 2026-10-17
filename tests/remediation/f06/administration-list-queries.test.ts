import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ create: vi.fn(), from: vi.fn(), select: vi.fn(), gt: vi.fn(), order: vi.fn(), limit: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: db.create }));
vi.mock('@/lib/logger', () => ({ logger: { error: db.log } }));
import { listBranches } from '@/server/queries/branches';
import { listOrganizations } from '@/server/queries/organizations';
beforeEach(() => {
  vi.resetAllMocks(); db.create.mockResolvedValue(db); db.from.mockReturnValue(db); db.select.mockReturnValue(db); db.gt.mockReturnValue(db); db.order.mockReturnValue(db);
});
for (const [name, table, read] of [['Branches', 'branches', listBranches], ['Organizations', 'owner_companies', listOrganizations]] as const) {
  it(`${name}: a successful empty RLS-visible set remains empty`, async () => {
    db.limit.mockResolvedValue({ data: [], error: null }); expect(await read()).toEqual([]);
    expect(db.from).toHaveBeenCalledExactlyOnceWith(table); expect(db.order).toHaveBeenCalledExactlyOnceWith('id', { ascending: true });
  });
  it(`${name}: successful rows and null joined labels are preserved without enrichment or policy changes`, async () => {
    const data = [{ id: 81, owner_company: null, emirate_rel: null }]; db.limit.mockResolvedValueOnce({ data, error: null }).mockResolvedValueOnce({ data: [], error: null });
    expect(await read()).toEqual(data); expect(db.select).toHaveBeenCalledTimes(2); expect(db.create).toHaveBeenCalledOnce();
  });
  it(`${name}: backend errors are safe failures, never empty data`, async () => {
    db.limit.mockResolvedValue({ data: null, error: { message: 'PRIVATE DATABASE DETAIL' } });
    await expect(read()).rejects.toThrow(`${name} could not be loaded. Try again.`);
  });
  it(`${name}: transport exceptions are safe failures, never empty data`, async () => {
    db.limit.mockRejectedValue(Error('PRIVATE TRANSPORT DETAIL'));
    await expect(read()).rejects.toThrow(`${name} could not be loaded. Try again.`);
  });
  it(`${name}: client creation failure is sanitized`, async () => {
    db.create.mockRejectedValue(Error('PRIVATE CONFIGURATION DETAIL'));
    await expect(read()).rejects.toThrow(`${name} could not be loaded. Try again.`);
  });
  it.each([null, undefined, {}])(`${name}: malformed successful collection %j is not an empty result`, async data => {
    db.limit.mockResolvedValue({ data, error: null });
    await expect(read()).rejects.toThrow(`${name} could not be loaded. Try again.`);
  });
  it.each([100, 200])(`${name}: collects more than 1,000 authorized rows even with a backend cap of %s`, async cap => {
    const rows = Array.from({ length: 1107 }, (_, index) => ({ id: index + 1, owner_company: null, emirate_rel: null }));
    let cursor = 0;
    db.gt.mockImplementation((column: string, value: number) => { expect(column).toBe('id'); cursor = value; return db; });
    db.limit.mockImplementation(async (limit: number) => ({ data: rows.filter(row => row.id > cursor).slice(0, Math.min(limit, cap)), error: null }));
    expect(await read()).toEqual(rows); expect(db.limit.mock.calls.every(([limit]) => limit === 200)).toBe(true);
    expect(db.gt).toHaveBeenLastCalledWith('id', 1107); expect(db.create).toHaveBeenCalledOnce();
  });
  it(`${name}: failure on a later page rejects all partial rows`, async () => {
    db.limit.mockResolvedValueOnce({ data: [{ id: 81 }], error: null }).mockResolvedValueOnce({ data: null, error: { message: 'PRIVATE LATER PAGE' } });
    await expect(read()).rejects.toThrow(`${name} could not be loaded. Try again.`); expect(db.limit).toHaveBeenCalledTimes(2);
  });
  it.each([[{ id: 81 }], [{ id: 80 }], [{ id: '82' }], [{ id: 0 }], [{ id: Number.MAX_SAFE_INTEGER + 1 }], [null], [{ id: 83 }, { id: 82 }]])(
    `${name}: malformed, repeated, or out-of-order later page %j cannot masquerade as complete`, async data => {
      db.limit.mockResolvedValueOnce({ data: [{ id: 81 }], error: null }).mockResolvedValueOnce({ data, error: null });
      await expect(read()).rejects.toThrow(`${name} could not be loaded. Try again.`);
    },
  );
  it(`${name}: unexpectedly oversized transport page fails closed`, async () => {
    db.limit.mockResolvedValue({ data: Array.from({ length: 201 }, (_, index) => ({ id: index + 1 })), error: null });
    await expect(read()).rejects.toThrow(`${name} could not be loaded. Try again.`);
  });
}
