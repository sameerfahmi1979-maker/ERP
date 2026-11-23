import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupPtt, dispatchPtt, pttWorkerSchedule, runPttWorker, launchPttWorker } from '../ptt';
import type { CommunicationActor } from '../access';

const mocks = vi.hoisted(() => ({
  recording: vi.fn(), budget: vi.fn(), reserveCleanup: vi.fn(), confirm: vi.fn(), bind: vi.fn(), rpc: vi.fn(), user: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../budget', () => ({
  reserveCommunicationBudget: mocks.budget, authorizeCommunicationCleanup: mocks.reserveCleanup,
  confirmCommunicationCleanup: mocks.confirm, bindCommunicationCleanupResource: mocks.bind,
}));
vi.mock('../ptt-recordings', () => ({cleanupPttRecordings:mocks.recording}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: (name:string,args:unknown) => {
  const pending=Promise.resolve(mocks.rpc(name,args));
  return Object.assign(pending,{abortSignal:()=>pending});
} }) }));
vi.mock('../http', () => ({
  userRpc: mocks.user, rpcFailure: () => { throw Error('RPC unavailable'); },
  CommunicationHttpError: class extends Error { },
}));

const epoch = '00000000-0000-4000-8000-000000000001';
const channelId = '00000000-0000-4000-8000-000000000002';
const endpointId = '00000000-0000-4000-8000-000000000003';
const actor: CommunicationActor = { profileId: '2', authSessionId: epoch, authUserId: channelId, isGlobalSystemAdmin: false };
const job = { endpointId, token: epoch, permitId: channelId, sessionId: 'provider-session', mid: '0', appId: 'fixture', uncertain: false };
const ok = (data: unknown) => ({ data, error: null });
const command = (name: string, args: Record<string, unknown>) => dispatchPtt({ op: 'ptt.' + name, args }, actor);

const plan=()=>({worker:epoch,boot:endpointId,until:Date.now()+3600000,maxPolls:3});
function funded(jobData:unknown=null) {
  mocks.rpc.mockImplementation(async (_name,{p_cmd,p_data})=>p_cmd==='tick'
    ? ok({coveredUntil:new Date(plan().until).toISOString(),poll:p_data.poll,job:jobData}):ok({ok:true,healthy:p_data.healthy===true}));
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ERP_COMM_PTT_LIVE_ENABLED', 'true');
  vi.stubEnv('ERP_COMM_SFU_APP_ID', 'fixture');
  vi.stubEnv('ERP_COMM_SFU_APP_SECRET', 'synthetic-credential-never-use');
  funded();
  mocks.user.mockResolvedValue({ authorized: true });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('PTT orchestration', () => {
  it('permits session establishment for SOS and authenticated teardown with media held', async () => {
    vi.stubEnv('ERP_COMM_PTT_LIVE_ENABLED', 'false');
    mocks.budget.mockResolvedValue({ ok: false });
    await expect(command('start', { deviceId: epoch, confirmTakeover: false })).rejects.toThrow();
    expect(mocks.budget).toHaveBeenCalledWith(expect.objectContaining({ feature: 'realtime', binding: expect.objectContaining({ actorSessionId: epoch }) }));
    mocks.budget.mockClear();
    await command('stop', { epoch });
    await command('release', { epoch, channelId, leaseId: epoch });
    await command('disconnect', { epoch, channelId });
    expect(mocks.budget).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    await expect(command('press', { epoch, channelId, pressId: epoch })).rejects.toThrow();
  });

  it('uses a separately funded exact logical phone command when SFU is held', async () => {
    vi.stubEnv('ERP_COMM_PTT_LIVE_ENABLED', 'false');
    mocks.budget.mockResolvedValue({ ok: true, permitId: endpointId, newReservation: true, expiresAt: new Date(Date.now() + 30000) });
    const input = { epoch, selectedChannelId: channelId };
    await command('monitor', input);
    expect(mocks.budget).toHaveBeenCalledWith(expect.objectContaining({
      feature: 'realtime', binding: { actorSessionId: epoch, command: { op: 'ptt.monitor', args: input } },
    }));
    expect(mocks.user).toHaveBeenCalledWith('erp_ptt_v1', { p_request: { op: 'ptt.monitor', args: input }, p_permit: endpointId });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not reserve for an unknown operation', async () => {
    await expect(command('unrecognized', {})).rejects.toThrow();
    expect(mocks.budget).not.toHaveBeenCalled();
    expect(mocks.user).not.toHaveBeenCalled();
  });

  it('denies a new endpoint when the ledger rejects a nominal zero-cost request', async () => {
    await cleanupPtt(plan());
    mocks.budget.mockResolvedValue({ ok: false });
    await expect(command('signal', { epoch, channelId, action: 'open' })).rejects.toThrow();
    expect(mocks.budget).toHaveBeenCalledWith(expect.objectContaining({ feature: 'ptt_live', actorId: '2', upperBoundMicros: BigInt(0) }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never passes Cloudflare credentials or provider session names through to a handset', async () => {
    await cleanupPtt(plan());
    mocks.budget.mockResolvedValue({ ok: true, permitId: epoch, newReservation: true, expiresAt: new Date(Date.now() + 30000) });
    mocks.rpc.mockResolvedValueOnce(ok({ endpointId, sessionId: null, token: epoch, publisherSessionId: null, trackName: null })).mockResolvedValueOnce(ok({ ok: true }));
    vi.mocked(fetch).mockResolvedValue(Response.json({ sessionId: 'provider-secret-locator' }));
    const reply = await command('signal', { epoch, channelId, action: 'open' });
    expect(JSON.parse(JSON.stringify(reply))).toEqual({ endpointId });
  });

  it('uses only the originating cleanup allocation after a feature pause', async () => {
    vi.stubEnv('ERP_COMM_PTT_LIVE_ENABLED', 'false');
    funded(job);
    mocks.reserveCleanup.mockResolvedValue({ ok: true, newAttempt: true });
    mocks.confirm.mockResolvedValue({ ok: true });
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ tracks: [{ mid: '0', status: 'active' }] }))
      .mockResolvedValueOnce(Response.json({ tracks: [{ mid: '0' }] })).mockResolvedValueOnce(Response.json({ tracks: [{ mid: '0', status: 'inactive' }] }));
    await cleanupPtt(plan());
    expect(mocks.budget).not.toHaveBeenCalled();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('erp_ptt_provider_v1', { p_cmd: 'closed', p_data: { endpointId, token: epoch } });
  });

  it('retains the fence when an SFU close fails or an earlier mutation is ambiguous', async () => {
    for (const uncertain of [false, true]) {
      funded({ ...job, uncertain });
      mocks.reserveCleanup.mockResolvedValue({ ok: true, newAttempt: true });
      vi.mocked(fetch).mockResolvedValueOnce(uncertain ? Response.json({ tracks: [] }) : new Response('', { status: 503 }));
      expect((await cleanupPtt(plan())).healthy).toBe(false);
      expect(mocks.confirm).not.toHaveBeenCalled();
      expect(mocks.rpc.mock.calls.some(([, value]) => value.p_cmd === 'closed')).toBe(false);
    }
  });
});

describe('finite PTT worker',()=>{
  it('requires the accepted launch to match the locally enabled worker and time window',()=>{
    const grant={...plan(),kind:'ptt' as const,registerBy:Date.now()+30000};
    const env={ERP_COMM_PTT_CLEANUP_ENABLED:'true',ERP_COMM_PTT_WORKER_ID:epoch};
    expect(pttWorkerSchedule(grant,{})).toBeNull();
    expect(pttWorkerSchedule(grant,env)?.maxPolls).toBe(3);
    expect(pttWorkerSchedule({...grant,maxPolls:Infinity},env)).toBeNull();
    expect(pttWorkerSchedule({...grant,boot:'bad'},env)).toBeNull();
    expect(pttWorkerSchedule(grant,env,Date.now()+35000)).toBeNull();
  });
  it('issues no SQL probe for the wrong worker and stops after a malformed accepted probe',async()=>{
    const runtime=globalThis as typeof globalThis & {__erpPttStarted?:boolean};
    const grant={...plan(),kind:'ptt' as const,registerBy:Date.now()+30000};
    vi.stubEnv('ERP_COMM_PTT_CLEANUP_ENABLED','true');
    vi.stubEnv('ERP_COMM_PTT_WORKER_ID',epoch);
    try {
      delete runtime.__erpPttStarted;
      expect(await launchPttWorker({...grant,worker:channelId})).toBe(false);
      expect(mocks.rpc).not.toHaveBeenCalled();
      mocks.rpc.mockResolvedValue(ok({held:true}));
      expect(await launchPttWorker(grant)).toBe(false);
      expect(await launchPttWorker(grant)).toBe(false);
      expect(mocks.rpc).toHaveBeenCalledTimes(1);
      expect(mocks.rpc.mock.calls[0][1].p_cmd).toBe('startWorker');
      expect(mocks.recording).not.toHaveBeenCalled();
    } finally {delete runtime.__erpPttStarted;}
  });
  it('ends idle polling at the prepaid count or deadline even after delayed timers',async()=>{
    vi.useFakeTimers();
    const p=plan(), start=vi.fn().mockResolvedValue({coveredUntil:new Date(p.until).toISOString(),cadenceSeconds:1});
    const tick=vi.fn().mockResolvedValue({until:p.until,healthy:true});
    await runPttWorker(p,start,tick);
    await vi.advanceTimersByTimeAsync(3600000);
    expect(tick).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
    const cutoff=Date.now()+32000;
    tick.mockClear().mockResolvedValue({until:cutoff,healthy:false});
    start.mockResolvedValue({coveredUntil:new Date(cutoff).toISOString(),cadenceSeconds:1});
    await runPttWorker({...plan(),maxPolls:1000},start,tick);
    await vi.advanceTimersByTimeAsync(60000);
    expect(tick).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('stops a rejected boot or uncertain claim without scheduling another debit',async()=>{
    vi.useFakeTimers();
    const p=plan(), tick=vi.fn().mockRejectedValue(Error('ambiguous claim'));
    await runPttWorker(p,vi.fn().mockRejectedValue(Error('fleet full')),tick);
    expect(tick).not.toHaveBeenCalled();
    await runPttWorker(p,async()=>({coveredUntil:new Date(p.until).toISOString(),cadenceSeconds:1}),tick);
    await vi.advanceTimersByTimeAsync(86400000);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('withholds heartbeat and effects after an uncovered poll or failed recording drain',async()=>{
    mocks.rpc.mockResolvedValueOnce(ok({held:true}));
    await expect(cleanupPtt(plan())).rejects.toThrow();
    expect(mocks.recording).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    mocks.recording.mockRejectedValueOnce(Error('storage unavailable'));
    expect((await cleanupPtt(plan())).healthy).toBe(false);
    expect(mocks.rpc).toHaveBeenLastCalledWith('erp_ptt_provider_v1',{p_cmd:'finishTick',p_data:expect.objectContaining({healthy:false})});
    await expect(command('signal',{epoch,channelId,action:'open'})).rejects.toThrow();
    expect(mocks.budget).not.toHaveBeenCalled();
  });
});
