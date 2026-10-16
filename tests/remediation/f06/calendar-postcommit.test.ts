import {beforeEach, expect, it, vi} from 'vitest';
const mock = vi.hoisted(() => ({rpc: vi.fn(), cache: vi.fn(), permissions: new Set<string>()}));
vi.mock('@/lib/supabase/server', () => ({createClient: async () => ({rpc: mock.rpc})}));
vi.mock('@/lib/rbac/check', () => ({getAuthContext: async () => ({}), hasPermission: (_: unknown, code: string) => mock.permissions.has(code)}));
vi.mock('next/cache', () => ({revalidatePath: mock.cache}));
import {createWorkCalendar, updateWorkCalendar, createWorkShift, updateWorkShift} from '@/server/actions/common-master-data/work-calendars';
// Real actions and saveWorkspaceRecord receipt parsing; only external boundaries are doubled.
const operationId = '1ba5d939-132e-48a7-adcd-123456789abc';
const parent = {calendar_code: 'SYN', calendar_name: 'Synthetic', owner_company_id: 1,
  calendar_type: 'standard' as const, working_days: ['mon'] as ['mon'], weekend_days: ['sun'] as ['sun'],
  is_active: false, has_ramadan_timing: false, has_summer_timing: false};
const child = {calendar_id: 71, shift_code: 'SYN-S', shift_name: 'Synthetic shift',
  shift_start_time: '08:00', shift_end_time: '17:00', is_overnight: false, is_active: false};
const cases = [
  {name: 'create calendar', entity: 'work_calendars', id: null, revision: null, payload: parent,
    receipt: {id: 71, revision: '3', changed: true, replayed: false, owner_company_id: 1, calendar_id: null},
    run: () => createWorkCalendar(parent, {operationId, revision: null})},
  {name: 'update calendar', entity: 'work_calendars', id: 71, revision: '2', payload: {notes: 'Changed'},
    receipt: {id: 71, revision: '3', changed: true, replayed: false, owner_company_id: 1, calendar_id: null},
    run: () => updateWorkCalendar({id: 71, notes: 'Changed'}, {operationId, revision: '2'})},
  {name: 'create shift', entity: 'work_shifts', id: null, revision: null, payload: child,
    receipt: {id: 81, revision: '4', changed: true, replayed: false, owner_company_id: 1, calendar_id: 71},
    run: () => createWorkShift(child, {operationId, revision: null})},
  {name: 'update shift', entity: 'work_shifts', id: 81, revision: '3', payload: {shift_name: 'Changed'},
    receipt: {id: 81, revision: '4', changed: true, replayed: false, owner_company_id: 1, calendar_id: 71},
    run: () => updateWorkShift({id: 81, shift_name: 'Changed'}, {operationId, revision: '3'})},
];
const paths = ['/admin/common-master-data/work-calendars', '/admin/hr/settings/work-shifts', '/admin/common-master-data/work-calendars/record/71'];
beforeEach(() => {vi.resetAllMocks(); mock.permissions = new Set(['common_md.work_calendars.manage']);});
for (const c of cases) {
  it.each([0, 1, 2])(`${c.name}: confirmed receipt survives cache fault at %s and all targets are attempted`, async index => {
    mock.rpc.mockResolvedValue({data: c.receipt, error: null});
    mock.cache.mockImplementation(path => {if (path === paths[index]) throw Error('private cache detail');});
    expect(await c.run()).toEqual({success: true, data: c.receipt});
    expect(mock.cache.mock.calls).toEqual(paths.map(path => [path]));
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('save_master_record', {p_entity: c.entity,
      p_operation: operationId, p_id: c.id, p_revision: c.revision, p_data: c.payload});
  });
  it.each([{changed: false, replayed: false}, {changed: true, replayed: true}])(`${c.name}: preserves no-op/replay %j`, async flags => {
    mock.permissions = new Set(['common_md.manage']);
    const receipt = {...c.receipt, ...flags}; mock.rpc.mockResolvedValue({data: receipt, error: null});
    mock.cache.mockImplementation(() => {throw Error('private cache');});
    expect(await c.run()).toEqual({success: true, data: receipt}); expect(mock.rpc).toHaveBeenCalledOnce();
    expect(mock.cache.mock.calls).toEqual(paths.map(path => [path]));
  });
  it.each(['42501', '23505', 'P0601', '40001', '22023'])(`${c.name}: known rejection %s never invalidates`, async code => {
    mock.rpc.mockResolvedValue({data: null, error: {code, message: 'private diagnostic'}});
    const result = await c.run(); expect(result.success).toBe(false); expect(result.uncertain).toBeFalsy();
    expect(result.error).not.toContain('private'); expect(mock.cache).not.toHaveBeenCalled();
  });
  it.each(['throw', 'missing-changed', 'wrong-parent', 'bad-revision'])(`${c.name}: %s stays uncertain`, async kind => {
    if (kind === 'throw') mock.rpc.mockRejectedValue(Error('private transport'));
    else mock.rpc.mockResolvedValue({data: {...c.receipt,
      ...(kind === 'missing-changed' ? {changed: undefined} : kind === 'bad-revision' ? {revision: 'bad'} : {calendar_id: c.entity === 'work_calendars' ? 99 : null})}, error: null});
    const result = await c.run(); expect(result).toMatchObject({success: false, uncertain: true});
    expect(result.error).not.toContain('private'); expect(mock.cache).not.toHaveBeenCalled();
  });
  it(`${c.name}: denied capability never reaches caller RPC or cache`, async () => {
    mock.permissions.clear(); expect(await c.run()).toMatchObject({success: false});
    expect(mock.rpc).not.toHaveBeenCalled(); expect(mock.cache).not.toHaveBeenCalled();
  });
}
it('invalid inputs fail before caller RPC or invalidation', async () => {
  for (const run of [() => createWorkCalendar({...parent, calendar_name: ''}, {operationId, revision: null}),
    () => updateWorkCalendar({id: -1}, {operationId, revision: '2'}),
    () => createWorkShift({...child, shift_end_time: '08:00'}, {operationId, revision: null}),
    () => updateWorkShift({id: -1}, {operationId, revision: '2'})]) expect(await run()).toMatchObject({success: false});
  expect(mock.rpc).not.toHaveBeenCalled(); expect(mock.cache).not.toHaveBeenCalled();
});
