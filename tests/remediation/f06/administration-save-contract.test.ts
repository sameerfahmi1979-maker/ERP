// Actual administration save adapter; auth, RPC and cache are explicit offline doubles.
// No database, network, provider or application service is used by this suite.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceSaveContract } from '@/lib/workspace/save-contract';

const doubles = vi.hoisted(() => ({
  auth: vi.fn(),
  permission: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('@/lib/rbac/check', () => ({
  getAuthContext: doubles.auth,
  hasPermission: doubles.permission,
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: doubles.client }));
vi.mock('next/cache', () => ({ revalidatePath: doubles.revalidate }));

import { saveAdministrationRecord } from '@/server/administration-save';

const principal = { profile: { id: 71 }, isAccountActive: true };
const operationId = 'aabe0d34-468e-4a11-a201-6997b807724d';
const contract: WorkspaceSaveContract = { operationId, revision: '4' };
const receipt = { id: 17, revision: '5', changed: true, replayed: false };
const privateDiagnostic = 'PRIVATE_DATABASE_ROW_PASSWORD_INTERNAL_CONSTRAINT';

beforeEach(() => {
  vi.resetAllMocks();
  doubles.auth.mockResolvedValue(principal);
  doubles.permission.mockReturnValue(true);
  doubles.client.mockResolvedValue({ rpc: doubles.rpc });
  doubles.rpc.mockResolvedValue({ data: receipt, error: null });
});

// W18: actual dispatched adapter, exact codes only; not a transaction/native oracle.
const w18Unknown:unknown[]=['40003','08007','40ZZZ','PGRST000','XX000',undefined,null,'','40','4000','23','PT','40003suffix','40001suffix','42501suffix',' 40003','40003 ','40003\n','40001\n','42501\n','40p01','23p01',40001,42501,['40001'],new String('40001'), 'toString', 'constructor', '__proto__'];
it.each([...w18Unknown,...["57014","57015"]].map(code=>({code})))('W18 unknown code %# retains uncertainty without guidance',async({code})=>{
 doubles.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 const result=await saveAdministrationRecord('owner_companies',17,{is_active:false},contract);
 expect(doubles.rpc.mock.calls).toEqual([w18Expected('company')]);expect(result).toMatchObject({success:false,uncertain:true,error:expect.stringMatching(/unconfirmed/i)});
 expect(JSON.stringify(result)).not.toMatch(/W18_PRIVATE|no .*committed|rolled back|were rejected|was rejected/i);expect(result).not.toHaveProperty('fieldErrors');expect(doubles.revalidate).not.toHaveBeenCalled();
});
it.each(["40000","40001","40002","40P01","22023","23514","42501","P0001","PT404","PT409","PT123","55P03","55000"])('W18 exact known code %s preserves definite rejection',async code=>{
 doubles.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE_DIAGNOSTIC'}});const result=await saveAdministrationRecord('owner_companies',17,{is_active:false},contract);
 expect(doubles.rpc).toHaveBeenCalledOnce();expect(result.success).toBe(false);expect(result.uncertain).not.toBe(true);expect(JSON.stringify(result)).not.toContain('W18_PRIVATE');expect(doubles.revalidate).not.toHaveBeenCalled();
});
it('W18 does not coerce an object into a mapped SQLSTATE',async()=>{
 const toString=vi.fn(()=>'PT409'),code={toString};doubles.rpc.mockResolvedValue({data:null,error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}});
 expect(await saveAdministrationRecord('owner_companies',17,{is_active:false},contract)).toMatchObject({success:false,uncertain:true});expect(toString).not.toHaveBeenCalled();expect(doubles.rpc).toHaveBeenCalledOnce();
});

describe('administration request identity and permission boundary', () => {
  it.each([
    ['missing', undefined],
    ['empty operation', { ...contract, operationId: '' }],
    ['malformed operation', { ...contract, operationId: 'retry-without-original-identity' }],
    ['missing revision', { operationId }],
    ['zero revision', { ...contract, revision: '0' }],
    ['numeric revision', { ...contract, revision: 4 }],
    ['extra authority field', { ...contract, actorId: 999 }],
  ])('rejects a %s contract before opening authorization or database clients', async (_label, input) => {
    const result = await saveAdministrationRecord('owner_companies', 17, { trade_name: 'Updated' }, input as WorkspaceSaveContract);
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/save identity or revision/i) });
    expect(result.uncertain).not.toBe(true);
    expect(doubles.auth).not.toHaveBeenCalled();
    expect(doubles.client).not.toHaveBeenCalled();
    expect(doubles.rpc).not.toHaveBeenCalled();
    expect(doubles.revalidate).not.toHaveBeenCalled();
  });

  it.each([
    ['update without opening revision', 17, { ...contract, revision: null }],
    ['create with an edit revision', null, contract],
    ['zero record ID', 0, contract],
    ['fractional record ID', 17.5, contract],
    ['unsafe record ID', Number.MAX_SAFE_INTEGER + 1, contract],
  ] as const)('rejects %s without a mutation', async (_label, id, input) => {
    const result = await saveAdministrationRecord('branches', id, {}, input);
    expect(result.success).toBe(false);
    expect(result.uncertain).not.toBe(true);
    expect(doubles.auth).not.toHaveBeenCalled();
    expect(doubles.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['owner_companies', 'organizations.manage'],
    ['branches', 'branches.manage'],
  ] as const)('denies %s before RPC when its current permission is absent', async (entity, permission) => {
    doubles.permission.mockReturnValue(false);
    const result = await saveAdministrationRecord(entity, 17, {}, contract);
    expect(doubles.permission).toHaveBeenCalledWith(principal, permission);
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/do not have permission/i) });
    expect(result.uncertain).not.toBe(true);
    expect(doubles.client).not.toHaveBeenCalled();
    expect(doubles.rpc).not.toHaveBeenCalled();
    expect(doubles.revalidate).not.toHaveBeenCalled();
  });

  it.each([
    ['owner_companies', 'organizations.manage', '/admin/organizations'],
    ['branches', 'branches.manage', '/admin/branches'],
  ] as const)('forwards the exact %s payload, opening revision and operation identity', async (entity, permission, path) => {
    const payload = { trade_name: 'Retained value', status: 'inactive', is_head_office: false, latitude: 0, notes: null };
    const result = await saveAdministrationRecord(entity, 17, payload, contract);
    expect(doubles.permission).toHaveBeenCalledWith(principal, permission);
    expect(doubles.rpc).toHaveBeenCalledExactlyOnceWith('save_administration_record', {
      p_entity: entity, p_operation: operationId, p_id: 17, p_revision: '4', p_data: payload,
    });
    expect(result).toEqual({ success: true, data: receipt });
    expect(doubles.revalidate.mock.calls).toEqual([[path], [`${path}/record/17`]]);
  });

  it('creates with a null opening revision and uses the confirmed new identity', async () => {
    const created = { id: 48, revision: '1', changed: true, replayed: false };
    doubles.rpc.mockResolvedValue({ data: created, error: null });
    const result = await saveAdministrationRecord('branches', null, { branch_code: 'SYNTHETIC' }, { operationId, revision: null });
    expect(doubles.rpc).toHaveBeenCalledWith('save_administration_record', {
      p_entity: 'branches', p_operation: operationId, p_id: null, p_revision: null, p_data: { branch_code: 'SYNTHETIC' },
    });
    expect(result).toEqual({ success: true, data: created });
    expect(doubles.revalidate).toHaveBeenCalledWith('/admin/branches/record/48');
  });
});

describe('authoritative database rejection versus uncertain transport', () => {
  it.each(['PT409', '40001'])('retains the draft after %s without claiming an uncertain commit', async code => {
    doubles.rpc.mockResolvedValue({ data: null, error: { code, message: privateDiagnostic } });
    const result = await saveAdministrationRecord('owner_companies', 17, {}, contract);
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/changed after you opened it.*draft is retained/i) });
    expect(result.uncertain).not.toBe(true);
    expect(JSON.stringify(result)).not.toContain(privateDiagnostic);
    expect(doubles.revalidate).not.toHaveBeenCalled();
  });

  it('returns a truthful unavailable outcome for a missing record', async () => {
    doubles.rpc.mockResolvedValue({ data: null, error: { code: 'PT404', message: privateDiagnostic } });
    const result = await saveAdministrationRecord('branches', 17, {}, contract);
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/company or branch is unavailable/i) });
    expect(result.uncertain).not.toBe(true);
    expect(JSON.stringify(result)).not.toContain(privateDiagnostic);
    expect(doubles.revalidate).not.toHaveBeenCalled();
  });

  it.each([
    ['42501', /no longer have permission/i],
    ['23505', /identifier already exists/i],
    ['23503', /values or dependencies prevent/i],
    ['23514', /values or dependencies prevent/i],
    ['22023', /keep your entries/i],
    ['P0001', /keep your entries/i],
    ['55P03', /keep your entries/i],
    ['PT403', /keep your entries/i],
  ] as const)('treats %s as a rollback and never exposes database diagnostics', async (code, message) => {
    doubles.rpc.mockResolvedValue({ data: null, error: { code, message: privateDiagnostic, details: privateDiagnostic, hint: privateDiagnostic } });
    const result = await saveAdministrationRecord('branches', 17, {}, contract);
    expect(result).toMatchObject({ success: false, uncertain: false, error: expect.stringMatching(message) });
    expect(JSON.stringify(result)).not.toContain(privateDiagnostic);
    expect(doubles.revalidate).not.toHaveBeenCalled();
  });

  it('maps an approved integrity error to safe field guidance', async () => {
    doubles.rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'Invalid administration geography', details: privateDiagnostic } });
    const result = await saveAdministrationRecord('branches', 17, {}, contract);
    expect(result).toMatchObject({ success: false, uncertain: false, error: 'Country, region, city and area must form one valid location.' });
    expect(JSON.stringify(result)).not.toContain(privateDiagnostic);
  });

  it.each(['08006', 'PGRST000', undefined])('keeps an unconfirmed %s response retryable with the original values', async code => {
    doubles.rpc.mockResolvedValue({ data: null, error: { code, message: privateDiagnostic } });
    const result = await saveAdministrationRecord('owner_companies', 17, {}, contract);
    expect(result).toMatchObject({ success: false, uncertain: true, error: expect.stringMatching(/same values and retry/i) });
    expect(JSON.stringify(result)).not.toContain(privateDiagnostic);
    expect(doubles.revalidate).not.toHaveBeenCalled();
  });

  it('does not mistake a rejected RPC promise for an authoritative rollback', async () => {
    doubles.rpc.mockRejectedValue(Object.assign(new Error(privateDiagnostic), { code: '42501' }));
    const result = await saveAdministrationRecord('owner_companies', 17, {}, contract);
    expect(result).toMatchObject({ success: false, uncertain: true, error: expect.stringMatching(/same values and retry safely/i) });
    expect(JSON.stringify(result)).not.toContain(privateDiagnostic);
    expect(doubles.revalidate).not.toHaveBeenCalled();
  });

  it('reports client creation failures safely without issuing a mutation', async () => {
    doubles.client.mockRejectedValue(new Error(privateDiagnostic));
    const result = await saveAdministrationRecord('branches', 17, {}, contract);
    expect(result).toMatchObject({ success: false, uncertain: true });
    expect(JSON.stringify(result)).not.toContain(privateDiagnostic);
    expect(doubles.rpc).not.toHaveBeenCalled();
    expect(doubles.revalidate).not.toHaveBeenCalled();
  });
});

describe('committed receipt validation and cache failures', () => {
  it.each([
    ['empty', null],
    ['array', [receipt]],
    ['wrong record', { ...receipt, id: 99 }],
    ['string record ID', { ...receipt, id: '17' }],
    ['unsafe record ID', { ...receipt, id: Number.MAX_SAFE_INTEGER + 1 }],
    ['missing revision', { id: 17, changed: true, replayed: false }],
    ['zero revision', { ...receipt, revision: '0' }],
    ['numeric revision', { ...receipt, revision: 5 }],
    ['missing changed flag', { id: 17, revision: '5', replayed: false }],
    ['untyped replay flag', { ...receipt, replayed: 'false' }],
  ])('keeps a %s receipt uncertain and does not invalidate on unverified success', async (_label, raw) => {
    doubles.rpc.mockResolvedValue({ data: raw, error: null });
    const result = await saveAdministrationRecord('owner_companies', 17, {}, contract);
    expect(result).toMatchObject({ success: false, uncertain: true, error: expect.stringMatching(/response incomplete/i) });
    expect(result.data).toBeUndefined();
    expect(doubles.revalidate).not.toHaveBeenCalled();
  });

  it.each([
    ['no-op', { ...receipt, revision: '4', changed: false }],
    ['committed replay', { ...receipt, replayed: true }],
    ['no-op replay', { ...receipt, revision: '4', changed: false, replayed: true }],
  ])('accepts and preserves the exact %s receipt', async (_label, confirmed) => {
    doubles.rpc.mockResolvedValue({ data: confirmed, error: null });
    expect(await saveAdministrationRecord('owner_companies', 17, {}, contract)).toEqual({ success: true, data: confirmed });
  });

  it('projects only public receipt fields even if the transport returns private extras', async () => {
    doubles.rpc.mockResolvedValue({ data: { ...receipt, diagnostic: privateDiagnostic, secret_ref: privateDiagnostic }, error: null });
    const result = await saveAdministrationRecord('branches', 17, {}, contract);
    expect(result).toEqual({ success: true, data: receipt });
    expect(JSON.stringify(result)).not.toContain(privateDiagnostic);
  });

  it.each([1, 2])('preserves a confirmed commit when cache invalidation call %s throws', async failedCall => {
    let calls = 0;
    doubles.revalidate.mockImplementation(() => { if (++calls === failedCall) throw new Error(privateDiagnostic); });
    const result = await saveAdministrationRecord('owner_companies', 17, {}, contract);
    expect(result).toEqual({ success: true, data: receipt });
    expect(doubles.rpc).toHaveBeenCalledOnce();
    expect(doubles.revalidate).toHaveBeenCalledTimes(failedCall);
    expect(JSON.stringify(result)).not.toContain(privateDiagnostic);
  });
});

for(const [label,invoke] of [['company',()=>saveAdministrationRecord('owner_companies',17,{is_active:false},contract)],['branch',()=>saveAdministrationRecord('branches',17,{is_active:false},contract)]] as const)it.each(['40003','08007'])(`W18 ${label} %s dispatches once with safe uncertainty`,async code=>{
 doubles.rpc.mockResolvedValueOnce({error:{code,message:'W18_PRIVATE',details:'W18_PRIVATE_DETAILS',hint:'W18_PRIVATE_HINT'}}).mockResolvedValueOnce({error:{code:'40001'}});
 expect(await invoke()).toMatchObject({success:false,uncertain:true});expect(doubles.rpc).toHaveBeenCalledOnce();expect(doubles.revalidate).not.toHaveBeenCalled();
 const first=doubles.rpc.mock.calls[0];expect(first).toEqual(w18Expected(label));expect((await invoke()).success).toBe(false);expect(doubles.rpc).toHaveBeenCalledTimes(2);expect(doubles.rpc.mock.calls[1]).toEqual(first);
 doubles.rpc.mockResolvedValue({data:{...receipt,replayed:true},error:null});expect((await invoke()).success).toBe(true);expect(doubles.rpc).toHaveBeenCalledTimes(3);expect(doubles.rpc.mock.calls[2]).toEqual(first);
 // Explicit repeated calls verify request identity, not the excluded UI lifetime.
});

function w18Expected(label:string){return ['save_administration_record',{p_entity:label==='company'?'owner_companies':'branches',p_operation:operationId,p_id:17,p_revision:'4',p_data:{is_active:false}}];}
