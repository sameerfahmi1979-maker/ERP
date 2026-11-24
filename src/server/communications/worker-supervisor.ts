import "server-only";
import { createPublicKey, verify } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimSupervisedWorkerLaunch, readSignedWorkerBoot, type SignedWorkerBoot } from "./worker-boot-ticket";

const pilotEnd = Date.parse("2026-11-30T19:59:00.000Z");
const ids = z.array(z.uuid()).min(2).max(16).refine(values => new Set(values).size === values.length);
const bound = z.number().int().positive().max(1000000);
const manifestSchema = z.strictObject({v: z.literal(1), purpose: z.literal("erp-communication-supervisor"),
  deploymentId: z.uuid(), until: z.iso.datetime(), planHash: z.string().regex(/^[a-f0-9]{64}$/),
  maxReplicas: z.literal(1), maxRestartsPerDeployment: z.number().int().min(1).max(15), maxDeployments: z.literal(1),
  maxPhysicalStarts: z.number().int().min(2).max(16),
  workers: z.array(z.strictObject({kind: z.enum(["chat_stage","ptt"]), worker: z.uuid(), boots: ids,
    retries: z.number().int().min(0).max(3), quarantineSeconds: z.number().int().min(1).max(14400),
    maxLookups: bound, maxPolls: bound, busySeconds: bound, pollSeconds: bound, retrySeconds: bound,
    restartSeconds: bound, registrationSeconds: z.number().int().nonnegative().max(60), recoverySeconds: bound})).min(1).max(2),
});
export type WorkerSupervisorPlan = {kind: "chat_stage" | "ptt"; worker: string; deploymentId: string; boots: string[];
  retries: number; quarantineSeconds: number; until: number; maxPolls: number; maxPhysicalStarts: number;
  maxRestartsPerDeployment: number};

function decode(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw Error("Invalid manifest encoding");
  const bytes = Buffer.from(value,"base64url");
  if (bytes.toString("base64url") !== value) throw Error("Noncanonical manifest encoding");
  return bytes;
}

/** Default off. A real public key, the platform deployment and a finite reviewed boot list are all required. */
export function readWorkerSupervisorPlans(env: Readonly<Record<string,string | undefined>> = process.env, now = Date.now()): WorkerSupervisorPlan[] {
  if (env.ERP_COMM_WORKER_SUPERVISOR_ENABLED !== "true") return [];
  try {
    const cutoff = z.iso.datetime().parse(env.ERP_COMM_WORKER_SUPERVISOR_UNTIL), until = Date.parse(cutoff);
    if (until <= now + 90000 || until > pilotEnd || until > now + 86400000) return [];
    const deploymentId = z.uuid().parse(env.RAILWAY_DEPLOYMENT_ID), raw = env.ERP_COMM_WORKER_BOOT_PUBLIC_KEY;
    if (!raw || raw.length > 256 || Buffer.from(raw,"base64").toString("base64") !== raw ||
        createPublicKey({key: Buffer.from(raw,"base64"),format:"der",type:"spki"}).asymmetricKeyType !== "ed25519") return [];
    const token=env.ERP_COMM_WORKER_SUPERVISOR_MANIFEST;
    if (!token || token.length>16384) return [];
    const parts=token.split("."); if (parts.length!==2) return [];
    const body=decode(parts[0]), signature=decode(parts[1]);
    const key=createPublicKey({key:Buffer.from(raw,"base64"),format:"der",type:"spki"});
    if (signature.length!==64 || !verify(null,body,key,signature)) return [];
    const manifest=manifestSchema.parse(JSON.parse(new TextDecoder("utf8",{fatal:true}).decode(body)));
    if (manifest.deploymentId!==deploymentId || manifest.until!==cutoff ||
        manifest.maxPhysicalStarts!==manifest.maxReplicas*(1+manifest.maxRestartsPerDeployment)*manifest.maxDeployments ||
        new Set(manifest.workers.map(w=>w.kind)).size!==manifest.workers.length) return [];
    const plans: WorkerSupervisorPlan[] = [];
    for (const signed of manifest.workers) {
      const kind=signed.kind;
      const prefix = kind === "chat_stage" ? "ERP_COMM_CHAT_STAGE" : "ERP_COMM_PTT";
      if (env[prefix + "_CLEANUP_ENABLED"] !== "true") return [];
      const worker = z.uuid().parse(env[kind === "chat_stage" ? prefix + "_CLEANUP_WORKER_ID" : prefix + "_WORKER_ID"]);
      const boots = ids.parse(JSON.parse(env[prefix + "_BOOT_IDS"] ?? ""));
      const retryText = env[prefix + "_LOOKUP_RETRIES"], waitText = env[prefix + "_RECOVERY_WAIT_SECONDS"];
      if (!retryText || !/^[0-3]$/.test(retryText) || !waitText || !/^[1-9][0-9]{0,4}$/.test(waitText)) return [];
      const quarantineSeconds = Number(waitText);
      if (quarantineSeconds !== signed.quarantineSeconds || worker!==signed.worker || Number(retryText)!==signed.retries ||
          JSON.stringify(boots)!==JSON.stringify(signed.boots) || boots.length!==manifest.maxPhysicalStarts ||
          signed.maxLookups!==manifest.maxPhysicalStarts*boots.length*(1+signed.retries) ||
          quarantineSeconds!==signed.busySeconds+signed.pollSeconds+signed.restartSeconds+signed.registrationSeconds ||
          signed.restartSeconds<signed.recoverySeconds || signed.pollSeconds>3600 || signed.restartSeconds>3600 ||
          (kind==="chat_stage" && (boots.length<4 || signed.pollSeconds!==30 || signed.busySeconds<70 || signed.retrySeconds<180 || signed.registrationSeconds<5)) ||
          (kind==="ptt" && (signed.busySeconds<30 || signed.retrySeconds<60 || signed.registrationSeconds!==0))) return [];
      plans.push({kind, worker, deploymentId, boots, retries: Number(retryText), quarantineSeconds, until,
        maxPolls:signed.maxPolls,maxPhysicalStarts:manifest.maxPhysicalStarts,maxRestartsPerDeployment:manifest.maxRestartsPerDeployment});
    }
    for (const kind of ["chat_stage","ptt"] as const) {
      const prefix=kind==="chat_stage"?"ERP_COMM_CHAT_STAGE":"ERP_COMM_PTT";
      if (env[prefix+"_CLEANUP_ENABLED"]==="true" && !plans.some(p=>p.kind===kind)) return [];
    }
    if (new Set(plans.flatMap(p => p.boots)).size !== plans.flatMap(p => p.boots).length) return [];
    return plans;
  } catch {return [];}
}

async function lookup(plan: WorkerSupervisorPlan, boot: string): Promise<string | null> {
  const {data, error} = await createAdminClient().rpc("erp_comm_worker_boot_delivery", {
    p_kind: plan.kind, p_worker: plan.worker, p_deployment: plan.deploymentId, p_boot: boot,
  }).abortSignal(AbortSignal.timeout(5000));
  if (error || (data !== null && typeof data !== "string")) throw Error("Worker receipt unconfirmed");
  return data as string | null;
}
async function run(plan: SignedWorkerBoot) {
  if (plan.kind === "chat_stage") await (await import("./chat-stage-cleanup")).runSupervisedChatStageWorker(plan);
  else await (await import("./ptt")).runSupervisedPttWorker(plan);
}
type Dependencies = {
  lookup?: typeof lookup; read?: (token: string) => SignedWorkerBoot | null;
  claim?: typeof claimSupervisedWorkerLaunch; run?: typeof run;
  now?: () => number; wait?: (ms: number) => Promise<unknown>;
};

/** Finite and failure-isolated. Never races a running lifecycle against a timeout and never logs bearer material. */
export async function runCommunicationWorkerSupervisor(plan: WorkerSupervisorPlan, deps: Dependencies = {}): Promise<void> {
  const now = deps.now ?? Date.now, wait = deps.wait ?? (ms => delay(ms,undefined,{ref:false}));
  let lookupsLeft=plan.boots.length*(1+plan.retries);
  for (const boot of plan.boots) {
    if (now() + 90000 >= plan.until || lookupsLeft<=0) return;
    let token: string | null = null;
    let misses=0;
    while(lookupsLeft>0 && now()+90000<plan.until) {
      lookupsLeft--;
      try {token = await (deps.lookup ?? lookup)(plan, boot);} catch {break;} // uncertain lookup burns this explicit boot
      if(token?.startsWith("hold:")) {
        const held=Date.parse(token.slice(5)),left=held-now()+50;
        token=null;
        if(!Number.isFinite(held) || left<=0 || left>plan.quarantineSeconds*1000+50 || held+90000>=plan.until)return;
        await wait(left);continue; // same explicit untaken boot; no scan or unbounded lease polling
      }
      if (token !== null || misses++>=plan.retries) break;
      await wait(1000);
    }
    if (!token || now() + 90000 >= plan.until) continue;
    const grant = (deps.read ?? readSignedWorkerBoot)(token);
    if (!grant || grant.kind !== plan.kind || grant.boot !== boot || grant.worker !== plan.worker ||
        grant.deploymentId !== plan.deploymentId || grant.until > plan.until || grant.maxPolls!==plan.maxPolls ||
        grant.maxReplicas!==1 || grant.maxDeployments!==1 || grant.maxRestartsPerDeployment!==plan.maxRestartsPerDeployment ||
        grant.prepaidProbes!==plan.maxPhysicalStarts) continue;
    const release = await (deps.claim ?? claimSupervisedWorkerLaunch)(grant);
    if (!release) return; // manual/other active lifecycle is a hold, never a reason to scan for another boot
    try {await (deps.run ?? run)(grant);} catch {/* bounded stop; all lifecycle promises have settled */}
    finally {release();}
    // SQL returns the exact remaining old lease on the next funded lookup. Do not add the full
    // worst-case quarantine again after already awaiting the bounded local I/O lifecycle.
    if (now()+90000>=plan.until)return;
  }
}

const shared = globalThis as typeof globalThis & {__erpCommunicationSupervisors?: Set<string>};
const started = shared.__erpCommunicationSupervisors ??= new Set<string>();
export function startCommunicationWorkerSupervisors(env: Readonly<Record<string,string | undefined>> = process.env): void {
  launchPlans(readWorkerSupervisorPlans(env));
}
function launchPlans(plans: WorkerSupervisorPlan[], run = runCommunicationWorkerSupervisor, registry = started): number {
  let count=0;
  for (const plan of plans) {
    const key = plan.deploymentId + "/" + plan.kind;
    if (registry.has(key)) continue;
    registry.add(key);count++;
    void run(plan).catch(() => {});
  }
  return count;
}
/** Post-deployment signed push: validate entirely offline, then the same once-per-process lifecycle. */
export function launchCommunicationWorkerSupervisors(token: string, env: Readonly<Record<string,string|undefined>>=process.env,
  deps: {run?:typeof runCommunicationWorkerSupervisor;registry?:Set<string>}={}) {
  const plans=readWorkerSupervisorPlans({...env,ERP_COMM_WORKER_SUPERVISOR_MANIFEST:token});
  if (!plans.length) return {valid:false,started:0};
  return {valid:true,started:launchPlans(plans,deps.run,deps.registry)};
}
