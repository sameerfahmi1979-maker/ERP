import { beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/rbac/check', async () => ({ ...await vi.importActual('@/lib/rbac/scope'), getAuthContext: mock.auth }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mock.client }));
vi.mock('next/cache', () => ({ revalidatePath: mock.revalidate }));
vi.mock('@/server/actions/audit', () => ({ logAudit: mock.audit }));
import * as actions from '@/server/actions/common-master-data/owner-company-signatories';

const operationId = '4d1a10e4-3e68-49fd-9735-3bfc0578b9eb';
const createContract = { operationId, revision: null };
const input = { company_id: 7, user_id: null, full_name: 'Test Signatory', designation: null, signature_scope: null, is_primary: false, is_active: false, effective_from: null, effective_to: null, notes: null };
const receipt = { id: 19, revision: '1', changed: true, replayed: false };
const principal = (permissions: string[], global = true) => ({ profile: { id: 71 }, isAccountActive: true, permissionCodes: permissions, globalPermissionCodes: global ? permissions : [], roleCodes: [], roleAssignments: permissions.length ? [{ ownerCompanyId: global ? null : 7, branchId: null, roleCode: 'test', permissionCodes: permissions }] : [] });
const create = (payload: unknown = input, contract: unknown = createContract) => Reflect.apply(actions.createCompanySignatory, null, [payload, contract]);

beforeEach(() => {
 vi.resetAllMocks();
 mock.auth.mockResolvedValue(principal(['organizations.view', 'organizations.manage']));
 mock.rpc.mockResolvedValue({ data: receipt, error: null });
 // Legacy fluent double allows baseline failures to prove the old mutation path,
 // while the repaired adapter must exclusively use the RPC below.
 const fluent: Record<string, unknown> = {};
 for (const method of ['select', 'insert', 'update', 'eq', 'is', 'order']) fluent[method] = vi.fn(() => fluent);
 fluent.single = vi.fn(async () => ({ data: { id: 19 }, error: null }));
 fluent.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
 mock.client.mockResolvedValue({ rpc: mock.rpc, from: vi.fn(() => fluent) });
});

// W18: actual dispatched adapter, exact codes only; not a transaction/native oracle.
const w18Unknown:unknown[]=['40003','08007','40ZZZ','PGRST000','XX000',undefined,null,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01','23p01',40001,42501,['40001'],new String('40001'), 'toString', 'constructor', '__proto__'];
it.each([...w18Unknown,...["55000","57015"]].map(code=>({code})))('W18 unknown code %# retains uncertainty without guidance',async({code})=>{
 mock.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 const result=await create();
 expect(mock.rpc.mock.calls).toEqual([w18Expected('create')]);expect(result).toMatchObject({success:false,uncertain:true,error:expect.stringMatching(/unconfirmed/i)});
 expect(JSON.stringify(result)).not.toMatch(/W18_PRIVATE|no .*committed|rolled back|were rejected|was rejected/i);expect(result).not.toHaveProperty('fieldErrors');expect(mock.revalidate).not.toHaveBeenCalled();
});
it.each(["40000","40001","40002","40P01","22023","23514","42501","P0001","PT404","PT409","PT123","55P03","57014"])('W18 exact known code %s preserves definite rejection',async code=>{
 mock.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC'}});const result=await create();
 expect(mock.rpc).toHaveBeenCalledOnce();expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);expect(JSON.stringify(result)).not.toContain('W18_PRIVATE');expect(mock.revalidate).not.toHaveBeenCalled();
});
it('W18 does not coerce an object into a mapped SQLSTATE',async()=>{
 const toString=vi.fn(()=>'PT409'),code={toString};mock.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 expect(await create()).toMatchObject({success:false,uncertain:true});expect(toString).not.toHaveBeenCalled();expect(mock.rpc).toHaveBeenCalledOnce();
});

it('requires a save contract before opening a client', async () => {
 expect(await Reflect.apply(actions.createCompanySignatory, null, [input])).toMatchObject({ success: false });
 expect(mock.client).not.toHaveBeenCalled();
});
it('rejects whitespace-only names', async () => {
 expect(await create({ ...input, full_name: '   ' })).toMatchObject({ success: false });
 expect(mock.client).not.toHaveBeenCalled();
});
it('rejects impossible calendar dates', async () => {
 expect(await create({ ...input, effective_from: '2026-02-30' })).toMatchObject({ success: false });
 expect(mock.client).not.toHaveBeenCalled();
});
it('rejects reversed date ranges', async () => {
 expect(await create({ ...input, effective_from: '2026-10-04', effective_to: '2026-10-03' })).toMatchObject({ success: false });
 expect(mock.client).not.toHaveBeenCalled();
});
it('rejects scoped-only authority honestly before issuing a mutation', async () => {
 mock.auth.mockResolvedValue(principal(['organizations.view', 'organizations.manage'], false));
 expect(await create()).toMatchObject({ success: false, error: expect.stringMatching(/permission|global/i) });
 expect(mock.client).not.toHaveBeenCalled();
});
it('requires the existing read admission as well as manage admission', async () => {
 mock.auth.mockResolvedValue(principal(['organizations.manage']));
 expect(await create()).toMatchObject({ success: false });
 expect(mock.client).not.toHaveBeenCalled();
});

it.each(['common_md', 'common_md.organizations', 'organizations'])('admits the established global %s capability OR without extra policy', async permission => {
 mock.auth.mockResolvedValue(principal([`${permission}.view`, `${permission}.manage`]));
 expect(await create()).toEqual({ success: true, data: receipt });
 expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('save_company_signatory', { p_operation: operationId, p_company_id: 7, p_id: null, p_revision: null, p_action: 'save', p_data: { ...input, company_id: undefined } });
 expect(mock.audit).not.toHaveBeenCalled();
});
it.each([
 { ...input, is_active: 'false' }, { ...input, is_primary: undefined }, { ...input, full_name: 'x'.repeat(201) },
 { ...input, company_id: 0 }, { ...input, company_id: 7.5 }, { ...input, user_id: 0 }, { ...input, user_id: Number.MAX_SAFE_INTEGER + 1 },
 { ...input, deleted_at: '2026-01-01' }, { ...input, workspace_revision: 8 }, { ...input, created_by: 71 },
 { ...input, effective_from: '0000-01-01' }, { ...input, effective_from: '2026-1-1' }, { ...input, effective_from: '' },
])('rejects malformed or protected fields before a client: %j', async payload => { expect((await create(payload)).success).toBe(false); expect(mock.client).not.toHaveBeenCalled(); });
it.each([{}, { operationId, revision: '0' }, { operationId, revision: 1 }, { operationId: 'bad', revision: null }, { operationId, revision: '1' }, { ...createContract, actor: 9 }])('rejects an invalid create contract %j', async contract => { expect((await create(input, contract)).success).toBe(false); expect(mock.client).not.toHaveBeenCalled(); });
it('normalizes text but preserves explicit false values and a valid leap day', async () => {
 await create({ ...input, full_name: '  Jane Doe  ', notes: ' ', effective_from: '2024-02-29' });
 expect(mock.rpc.mock.calls[0][1].p_data).toMatchObject({ full_name: 'Jane Doe', notes: null, is_active: false, is_primary: false, effective_from: '2024-02-29' });
});
it('binds edit fields, company, exact identity and current revision to one RPC', async () => {
 await actions.updateCompanySignatory({ ...input, id: 19 }, { operationId, revision: '4' });
 expect(mock.rpc.mock.calls[0]).toEqual(['save_company_signatory', { p_operation: operationId, p_company_id: 7, p_id: 19, p_revision: '4', p_action: 'save', p_data: { ...input, company_id: undefined } }]);
});
it.each(['archive', 'restore'])('%s requires revision/operation and passes no editable fields', async action => {
 const fn = action === 'archive' ? actions.softDeleteCompanySignatory : actions.restoreCompanySignatory;
 expect((await fn(19, 7)).success).toBe(false);
 expect(await fn(19, 7, { operationId, revision: '4' })).toEqual({ success: true, data: receipt });
 expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('save_company_signatory', { p_operation: operationId, p_company_id: 7, p_id: 19, p_revision: '4', p_action: action, p_data: {} });
});
it.each(['PT404', 'PT409', '42501', '23503', '23514', '22023', 'P0001', '40001', '55P03'])('keeps %s rejection safe and known rolled back', async code => {
 mock.rpc.mockResolvedValue({ data: null, error: { code, message: 'PRIVATE DATABASE DETAILS' } });
 const result = await create(); expect(result).toMatchObject({ success: false, uncertain: false }); expect(JSON.stringify(result)).not.toContain('PRIVATE'); expect(mock.revalidate).not.toHaveBeenCalled();
});
it.each(['08006', 'PGRST000', undefined])('retains an uncertain %s transport for same-operation recovery', async code => {
 mock.rpc.mockResolvedValue({ data: null, error: { code, message: 'PRIVATE DATABASE DETAILS' } });
 const result = await create(); expect(result).toMatchObject({ success: false, uncertain: true }); expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('distinguishes pre-dispatch failure from a lost mutation response', async () => {
 mock.client.mockRejectedValueOnce(Error('PRIVATE')); expect(await create()).toMatchObject({ success: false, uncertain: false });
 mock.rpc.mockRejectedValueOnce(Error('PRIVATE')); expect(await create()).toMatchObject({ success: false, uncertain: true });
});
it.each([null, [], { id: 19 }, { ...receipt, revision: 1 }, { ...receipt, changed: 'false' }])('does not confirm malformed receipts %j', async data => {
 mock.rpc.mockResolvedValue({ data, error: null }); expect(await create()).toMatchObject({ success: false, uncertain: true }); expect(mock.revalidate).not.toHaveBeenCalled();
});
it('does not confirm the wrong updated identity', async () => {
 mock.rpc.mockResolvedValue({ data: { ...receipt, id: 20 }, error: null }); expect(await actions.updateCompanySignatory({ ...input, id: 19 }, { operationId, revision: '1' })).toMatchObject({ success: false, uncertain: true });
});
it.each([{ ...receipt, changed: false }, { ...receipt, replayed: true }])('accepts no-op and replay receipts and tolerates postcommit cache errors', async data => {
 mock.rpc.mockResolvedValue({ data, error: null }); mock.revalidate.mockImplementation(() => { throw Error('PRIVATE'); }); expect(await create()).toEqual({ success: true, data });
});
const row = (id: number, extra: object = {}) => ({ ...input, id, workspace_revision: 1, created_at: '2026-10-04', updated_at: '2026-10-04', deleted_at: null, ...extra });
it('collects beyond provider caps and includes archived history', async () => {
 mock.rpc.mockResolvedValueOnce({ data: Array.from({ length: 200 }, (_, i) => row(i + 1)), error: null })
  .mockResolvedValueOnce({ data: [row(201, { deleted_at: '2026-10-04' })], error: null }).mockResolvedValueOnce({ data: [], error: null });
 const result = await actions.listCompanySignatories(7); expect(result.success).toBe(true); expect(result.data).toHaveLength(201); expect(result.data?.some(r => r.deleted_at)).toBe(true);
 expect(mock.rpc.mock.calls.map(call => call[1].p_after)).toEqual([0, 200, 201]);
});
it.each([null, [{}], [row(3), row(2)], [row(1, { company_id: 8 })]])('fails the entire read on malformed/cross-company/nonadvancing page %j', async data => {
 mock.rpc.mockResolvedValue({ data, error: null }); expect(await actions.listCompanySignatories(7)).toMatchObject({ success: false });
});
it('does not return a partial register after a later-page failure', async () => {
 mock.rpc.mockResolvedValueOnce({ data: [row(1)], error: null }).mockResolvedValueOnce({ data: null, error: { message: 'PRIVATE' } });
 const result = await actions.listCompanySignatories(7); expect(result.success).toBe(false); expect(result.data).toBeUndefined(); expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('distinguishes an authorized empty register from missing or denied parents', async () => {
 mock.rpc.mockResolvedValueOnce({ data: [], error: null }); expect(await actions.listCompanySignatories(7)).toEqual({ success: true, data: [] });
 mock.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PT404' } }); expect((await actions.listCompanySignatories(7)).success).toBe(false);
 mock.auth.mockResolvedValue(principal(['organizations.view'], false)); expect((await actions.listCompanySignatories(7)).success).toBe(false); expect(mock.rpc).toHaveBeenCalledTimes(2);
});

for(const [label,invoke] of [['create',()=>create()],['edit',()=>actions.updateCompanySignatory({...input,id:19},{operationId,revision:'4'})],['archive',()=>actions.softDeleteCompanySignatory(19,7,{operationId,revision:'4'})],['restore',()=>actions.restoreCompanySignatory(19,7,{operationId,revision:'4'})]] as const)it.each(['40003','08007'])(`W18 ${label} %s dispatches once with safe uncertainty`,async code=>{
 mock.rpc.mockResolvedValueOnce({error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}}).mockResolvedValueOnce({error:{code:'40001'}});
 expect(await invoke()).toMatchObject({success:false,uncertain:true});expect(mock.rpc).toHaveBeenCalledOnce();expect(mock.revalidate).not.toHaveBeenCalled();expect(mock.audit).not.toHaveBeenCalled();
 const first=mock.rpc.mock.calls[0];expect(first).toEqual(w18Expected(label));expect((await invoke()).success).toBe(false);expect(mock.rpc).toHaveBeenCalledTimes(2);expect(mock.rpc.mock.calls[1]).toEqual(first);
 mock.rpc.mockResolvedValue({data:{...receipt,replayed:true},error:null});expect((await invoke()).success).toBe(true);expect(mock.rpc).toHaveBeenCalledTimes(3);expect(mock.rpc.mock.calls[2]).toEqual(first);
 // Explicit repeated calls verify request identity, not the excluded UI lifetime.
});

function w18Expected(label:string){return ['save_company_signatory',{p_operation:operationId,p_company_id:7,p_id:label==='create'?null:19,p_revision:label==='create'?null:'4',p_action:label==='archive'||label==='restore'?label:'save',p_data:label==='archive'||label==='restore'?{}:{...input,company_id:undefined}}];}
