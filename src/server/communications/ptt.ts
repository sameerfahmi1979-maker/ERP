import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { setTimeout as supervisedDelay } from 'node:timers/promises';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CommunicationActor } from './access';
import { authorizeCommunicationCleanup, confirmCommunicationCleanup, reserveCommunicationBudget } from './budget';
import { CommunicationHttpError, rpcFailure, userRpc } from './http';
import { communicationFeatureEnabled } from './providers/config';
import type { SignedWorkerBoot } from './worker-boot-ticket';
import { pttCleanupBudget } from './ptt-worker-transport';
import { CloudflarePtt, planShape, providerConfig, signalArgs } from './ptt-provider';

const cleanupJob = z.object({ endpointId: z.uuid(), sessionId: z.string().min(1), mid: z.string().min(1).nullable(), token: z.uuid(), permitId: z.uuid(), uncertain: z.boolean(), appId: z.string().min(1) });
const runtime = globalThis as typeof globalThis & { __erpPttStarted?:boolean; __erpPttTickAt?:number };
const unavailable = () => new CommunicationHttpError('temporarily_unavailable');
const maxCycleMs = 30_000;
const utc = z.iso.datetime({offset:true});
type WorkerPlan = { worker:string; boot:string; until:number; maxPolls:number };
type TickResult = { until:number; healthy:boolean };

type WorkerLaunch=Pick<SignedWorkerBoot,'kind'|'worker'|'boot'|'until'|'maxPolls'|'registerBy'>;
export function pttWorkerSchedule(grant:WorkerLaunch,env: Readonly<Record<string,string|undefined>>=process.env,now=Date.now()):WorkerPlan|null {
  if (grant.kind!=='ptt' || env.ERP_COMM_PTT_CLEANUP_ENABLED!=='true' || grant.worker!==env.ERP_COMM_PTT_WORKER_ID
    || !z.uuid().safeParse(grant.worker).success || !z.uuid().safeParse(grant.boot).success
    || !Number.isSafeInteger(grant.maxPolls) || grant.maxPolls<1 || !Number.isSafeInteger(grant.until)
    || !Number.isSafeInteger(grant.registerBy) || grant.registerBy<=now || grant.until<=now+maxCycleMs) return null;
  return {worker:grant.worker,boot:grant.boot,until:grant.until,maxPolls:grant.maxPolls};
}

async function providerRpc(cmd: string, data: Record<string, unknown>, signal?:AbortSignal) {
  const call = createAdminClient().rpc('erp_ptt_provider_v1', { p_cmd: cmd, p_data: data });
  const result = await (signal ? call.abortSignal(signal):call);
  if (result.error) rpcFailure(result.error);
  return result.data as unknown;
}

async function retireTrack(item:z.infer<typeof cleanupJob>, signal:AbortSignal) {
  const config=providerConfig();
  const retired=providerConfig({ERP_COMM_SFU_APP_ID:process.env.ERP_COMM_SFU_DRAIN_APP_ID,ERP_COMM_SFU_APP_SECRET:process.env.ERP_COMM_SFU_DRAIN_APP_SECRET});
  const closingConfig=[config,retired].find(candidate=>candidate?.appId===item.appId);
  if (!closingConfig) throw unavailable();
  const cleanup={permitId:item.permitId,resourceId:item.endpointId,endpoint:'close_sfu_tracks' as const,attemptId:item.token};
  const budget=pttCleanupBudget(signal);
  const authority=await authorizeCommunicationCleanup(cleanup,budget);
  if (!authority.ok || !authority.newAttempt) throw unavailable();
  await new CloudflarePtt(closingConfig,fetch,signal).close(item.sessionId,item.mid);
  if (item.uncertain) throw unavailable();
  const receipt=await confirmCommunicationCleanup(cleanup,budget);
  if (!receipt.ok) throw unavailable();
  const done=await providerRpc('closed',{endpointId:item.endpointId,token:item.token},signal);
  if (!z.object({ok:z.literal(true)}).safeParse(done).success) throw unavailable();
}

/** Exactly one prepaid cycle. The caller stops this boot if its claim or confirmation is uncertain. */
export async function cleanupPtt(plan:WorkerPlan):Promise<TickResult> {
  runtime.__erpPttTickAt=undefined;
  const started=Date.now();
  if (plan.until<=started+maxCycleMs) throw unavailable();
  const config=providerConfig();
  const poll=randomUUID();
  const identity={worker:plan.worker,boot:plan.boot,poll};
  const response=await providerRpc('tick',{...identity,enabled:!!config && communicationFeatureEnabled('ptt_live'),appId:config?.appId},AbortSignal.timeout(4000));
  const busy=z.object({busy:z.literal(true),coveredUntil:utc}).safeParse(response);
  if (busy.success) return {until:Math.min(plan.until,Date.parse(busy.data.coveredUntil)),healthy:false};
  const claim=z.object({coveredUntil:utc,poll:z.literal(poll),job:cleanupJob.nullable()}).parse(response);
  const until=Math.min(plan.until,Date.parse(claim.coveredUntil));
  const deadline=Math.min(until,started+maxCycleMs);
  const remaining=deadline-Date.now()-2000;
  if (remaining<=0) throw unavailable();
  const signal=AbortSignal.timeout(remaining);
  const outcomes=await Promise.allSettled([
    claim.job ? retireTrack(claim.job,signal):Promise.resolve(),
    import('./ptt-recordings').then(({cleanupPttRecordings})=>cleanupPttRecordings(poll,signal)),
  ]);
  const healthy=outcomes.every(result=>result.status==='fulfilled') && !signal.aborted;
  if (deadline<=Date.now()) throw unavailable();
  const finished=await providerRpc('finishTick',{...identity,healthy},AbortSignal.timeout(Math.max(1,Math.min(2000,deadline-Date.now()))));
  const receipt=z.object({ok:z.literal(true),healthy:z.boolean()}).parse(finished);
  if (deadline<=Date.now()) throw unavailable();
  const ready=healthy && receipt.healthy;
  if (ready) runtime.__erpPttTickAt=Date.now();
  return {until,healthy:ready};
}

type StartWindow={coveredUntil:string;cadenceSeconds:number};
export async function runPttWorker(plan:WorkerPlan,start:(plan:WorkerPlan)=>Promise<StartWindow>,tick:(plan:WorkerPlan)=>Promise<TickResult>) {
  let remaining=plan.maxPolls;
  const startTime=Date.now();
  if (remaining<1 || plan.until<=startTime+maxCycleMs) return;
  let window:StartWindow;
  try { window=await start(plan); } catch {return;}
  let cutoff=Math.min(plan.until,Date.parse(window.coveredUntil));
  const cadence=window.cadenceSeconds*1000;
  if (!Number.isFinite(cutoff) || !Number.isInteger(cadence) || cadence<1000 || cadence>3600000) return;
  const run=async()=>{
    if (remaining<=0 || Date.now()+maxCycleMs>=cutoff) return;
    remaining--;
    try {
      const paid=await tick({...plan,until:cutoff});
      cutoff=Math.min(cutoff,paid.until);
      if (remaining>0 && Date.now()+cadence+maxCycleMs<cutoff) setTimeout(()=>void run(),cadence).unref();
    } catch { runtime.__erpPttTickAt=undefined; }
  };
  await run();
}

/** Called by the deployment-bound signed launch route after its prepaid single-probe check. */
export async function launchPttWorker(grant:WorkerLaunch):Promise<boolean> {
  const plan=pttWorkerSchedule(grant);
  if (!plan || runtime.__erpPttStarted) return false;
  runtime.__erpPttStarted=true;
  try {
    const window=z.object({coveredUntil:utc,cadenceSeconds:z.number().int().min(1).max(3600)}).parse(await providerRpc('startWorker',{
      worker:plan.worker,boot:plan.boot,until:new Date(plan.until).toISOString(),maxPolls:plan.maxPolls,
    },AbortSignal.timeout(4000)));
    if (Date.parse(window.coveredUntil)<=Date.now()+maxCycleMs) return false;
    void runPttWorker(plan,async()=>window,cleanupPtt);
    return true;
  } catch { return false; }
}

/** Awaitable supervised boot. Its caller quarantines the expired SQL lease before considering a fresh boot. */
export async function runSupervisedPttWorker(grant:WorkerLaunch,deps:{
  start?:(plan:WorkerPlan)=>Promise<StartWindow>; tick?:typeof cleanupPtt; wait?:(ms:number)=>Promise<unknown>;
}={}):Promise<void> {
  const plan=pttWorkerSchedule(grant);
  if (!plan) return;
  try {
    const start=deps.start??(async()=>z.object({coveredUntil:utc,cadenceSeconds:z.number().int().min(1).max(3600)}).parse(await providerRpc('startWorker',{
      worker:plan.worker,boot:plan.boot,until:new Date(plan.until).toISOString(),maxPolls:plan.maxPolls,
    },AbortSignal.timeout(4000))));
    const window=await start(plan);
    if (!Number.isFinite(Date.parse(window.coveredUntil)) || !Number.isInteger(window.cadenceSeconds) || window.cadenceSeconds<1 || window.cadenceSeconds>3600) return;
    let cutoff=Math.min(plan.until,Date.parse(window.coveredUntil));
    const cadence=window.cadenceSeconds*1000;
    for (let remaining=plan.maxPolls; remaining>0 && Date.now()+maxCycleMs<cutoff; remaining--) {
      const result=await (deps.tick??cleanupPtt)({...plan,until:cutoff});
      cutoff=Math.min(cutoff,result.until);
      if (!result.healthy || remaining===1 || Date.now()+cadence+maxCycleMs>=cutoff) return;
      await (deps.wait??(ms=>supervisedDelay(ms,undefined,{ref:false})))(cadence);
    }
  } finally {runtime.__erpPttTickAt=undefined;}
}

function liveConfig() {
  const config = providerConfig();
  if (!config || !communicationFeatureEnabled('ptt_live') || !runtime.__erpPttTickAt || Date.now() - runtime.__erpPttTickAt > 8000) throw unavailable();
  return config;
}

type PttCommand = { op: string; args: Record<string, unknown> };

const realtimeCommands = new Set([
  'ptt.channels', 'ptt.direct', 'ptt.creatorStatus', 'ptt.creatorGrant', 'ptt.channelCreate',
  'ptt.start', 'ptt.availability', 'ptt.pause', 'ptt.monitor', 'ptt.members', 'ptt.request',
  'ptt.manage', 'ptt.reopenReview', 'ptt.scopeReconcile', 'ptt.leave',
]);
const liveCommands = new Set(['ptt.join', 'ptt.press', 'ptt.status']);

async function budgetFor(actor: CommunicationActor, command: PttCommand, feature: 'ptt_live' | 'realtime') {
  const operation = `ptt:${command.op}:${randomUUID()}`;
  // Persistent business records create a continuing storage obligation.
  const retained = ['ptt.direct', 'ptt.channelCreate', 'ptt.manage', 'ptt.request', 'ptt.creatorGrant', 'ptt.leave', 'ptt.press', 'ptt.start', 'ptt.join', 'ptt.monitorLive', 'ptt.reopenReview', 'ptt.scopeReconcile'].includes(command.op);
  const until = retained ? null : new Date(Date.now() + 120000);
  const result = await reserveCommunicationBudget({
    feature, scope: 'communications', operationId: operation, actorId: actor.profileId, upperBoundMicros: BigInt(0),
    binding: { actorSessionId: actor.authSessionId, command }, liabilityEndsAt: until,
  });
  return result.ok && result.expiresAt.getTime() > Date.now() + 1000 && result.newReservation
    ? { permit: result.permitId, until: until?.toISOString(), operation } : null;
}

export async function dispatchPtt(command: PttCommand, actor: CommunicationActor): Promise<unknown> {
  if (command.op !== 'ptt.signal') {
    if (['ptt.capabilities', 'ptt.state', 'ptt.stop', 'ptt.release', 'ptt.disconnect'].includes(command.op)
      || (command.op === 'ptt.pause' && command.args.paused === true)) {
      return userRpc('erp_ptt_v1', { p_request: command });
    }
    if (!realtimeCommands.has(command.op) && !liveCommands.has(command.op)) throw new CommunicationHttpError('invalid_request');
    if (command.op === 'ptt.monitor' && providerConfig() && communicationFeatureEnabled('ptt_live')
      && runtime.__erpPttTickAt && Date.now() - runtime.__erpPttTickAt <= 8000) {
      const live = { op: 'ptt.monitorLive', args: command.args };
      const guard = await budgetFor(actor, live, 'ptt_live');
      if (guard) {
        try { return await userRpc('erp_ptt_v1', { p_request: live, p_permit: guard.permit }); }
        catch (error) {
          // The live database switch or its original approval may have changed since reservation.
          if (!(error instanceof CommunicationHttpError) || error.status !== 503) throw error;
        }
      }
    }
    const feature = liveCommands.has(command.op) ? 'ptt_live' : 'realtime';
    if (feature === 'ptt_live') liveConfig();
    const guard = await budgetFor(actor, command, feature);
    if (!guard) throw unavailable();
    return userRpc('erp_ptt_v1', { p_request: command, p_permit: guard.permit });
  }
  const parsed = signalArgs.safeParse(command.args);
  if (!parsed.success) throw new CommunicationHttpError('invalid_request');
  const args = parsed.data;
  const config = liveConfig();
  const guard = await budgetFor(actor, command, 'ptt_live');
  if (!guard) throw unavailable();
  const plan = planShape.parse(await providerRpc('begin', { actor: actor.profileId, authSession: actor.authSessionId, appId: config.appId, ...args, ...guard }));
  try {
    const result = await new CloudflarePtt(config).signal(args, plan);
    const completed = await providerRpc('finish', { endpointId: plan.endpointId, token: plan.token, sessionId: result.sessionId, mid: result.mid });
    if (!z.object({ ok: z.literal(true) }).safeParse(completed).success) throw unavailable();
    return {
      endpointId: plan.endpointId, sessionDescription: result.sessionDescription, tracks: result.tracks,
      requiresImmediateRenegotiation: result.requiresImmediateRenegotiation
    };
  } catch {
    // Even after an HTTP error, a POST/PUT may have started. Preserve the current and competing authority fences.
    await providerRpc('uncertain', { endpointId: plan.endpointId, token: plan.token }).catch(() => { });
    throw unavailable();
  }
}
