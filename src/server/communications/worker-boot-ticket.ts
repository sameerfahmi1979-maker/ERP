import "server-only";
import { createPublicKey, verify } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";

const count = z.number().int().positive().max(1000000);
const schema = z.strictObject({
  v: z.literal(1), kind: z.enum(["chat_stage", "ptt"]), deploymentId: z.uuid(),
  worker: z.uuid(), boot: z.uuid(), notBefore: z.iso.datetime(), registerBy: z.iso.datetime(),
  until: z.iso.datetime(), maxPolls: count, maxReplicas: count,
  maxRestartsPerDeployment: z.number().int().nonnegative().max(1000000), maxDeployments: count,
  prepaidProbes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), evidenceId: z.string().trim().min(1).max(256),
});

export type SignedWorkerBoot = Omit<z.infer<typeof schema>, "until" | "registerBy" | "notBefore"> & {
  until: number; registerBy: number; notBefore: number;
};

function decode(segment: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return null;
  const bytes = Buffer.from(segment, "base64url");
  return bytes.toString("base64url") === segment ? bytes : null;
}

/** A private issuer signs only the exact SQL receipt after its one-use delivery debit has committed. */
export function readSignedWorkerBoot(token: string, env: Readonly<Record<string,string | undefined>> = process.env, now = Date.now()): SignedWorkerBoot | null {
  if (!token || token.length > 4096 || !env.ERP_COMM_WORKER_BOOT_PUBLIC_KEY || env.ERP_COMM_WORKER_BOOT_PUBLIC_KEY.length > 256) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const body = decode(parts[0]), signature = decode(parts[1]);
    if (!body || signature?.length !== 64) return null;
    const key = createPublicKey({ key: Buffer.from(env.ERP_COMM_WORKER_BOOT_PUBLIC_KEY, "base64"), format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ed25519" || !verify(null, body, key, signature)) return null;
    const grant = schema.parse(JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(body)));
    const chat = grant.kind === "chat_stage";
    const enabled = chat ? env.ERP_COMM_CHAT_STAGE_CLEANUP_ENABLED : env.ERP_COMM_PTT_CLEANUP_ENABLED;
    const worker = chat ? env.ERP_COMM_CHAT_STAGE_CLEANUP_WORKER_ID : env.ERP_COMM_PTT_WORKER_ID;
    const starts = BigInt(grant.maxReplicas) * (BigInt(grant.maxRestartsPerDeployment) + BigInt(1)) * BigInt(grant.maxDeployments);
    const notBefore = Date.parse(grant.notBefore), registerBy = Date.parse(grant.registerBy), until = Date.parse(grant.until);
    if (enabled !== "true" || grant.worker !== worker || grant.deploymentId !== env.RAILWAY_DEPLOYMENT_ID ||
        starts > BigInt(grant.prepaidProbes) || notBefore > now || now + 10000 >= registerBy || registerBy > until) return null;
    return { ...grant, notBefore, registerBy, until };
  } catch { return null; }
}

const state = globalThis as typeof globalThis & { __erpCommunicationWorkerLaunches?: Set<string> };
const started = state.__erpCommunicationWorkerLaunches ??= new Set<string>();
const clock = { now: Date.now, elapsed: () => performance.now(), wait: (ms: number) => delay(ms) };

/** Per-process single attempt, including a lost registration response. SQL owns the cross-process fence. */
export async function claimWorkerLaunch(plan: SignedWorkerBoot, used = started, time = clock): Promise<boolean> {
  if (used.has(plan.kind) || time.now() < plan.notBefore || time.now() + 10000 >= plan.registerBy) return false;
  used.add(plan.kind);
  const before = time.elapsed();
  await time.wait(5001);
  return time.elapsed() - before >= 5000 && time.now() >= plan.notBefore && time.now() + 5000 < plan.registerBy;
}

type ManagedState = { kinds: Set<string>; boots: Set<string>; active: Set<string> };
const managedGlobal = globalThis as typeof globalThis & { __erpManagedCommunicationWorkers?: ManagedState };
const managed = managedGlobal.__erpManagedCommunicationWorkers ??= {kinds: new Set(), boots: new Set(), active: new Set()};

/** Supervisors own a kind for this process. Release only after every local promise has definitively settled.
 * Manual route behavior stays once-per-kind; it cannot overlap a managed kind or reclaim it after a crash.
 */
export async function claimSupervisedWorkerLaunch(plan: SignedWorkerBoot, local = managed, used = started, time = clock): Promise<(() => void) | null> {
  const key = plan.kind + "/" + plan.boot;
  if ((used.has(plan.kind) && !local.kinds.has(plan.kind)) || local.active.has(plan.kind) || local.boots.has(key)
      || time.now() < plan.notBefore || time.now() + 10000 >= plan.registerBy) return null;
  used.add(plan.kind); local.kinds.add(plan.kind); local.boots.add(key); local.active.add(plan.kind);
  const before = time.elapsed();
  try {
    await time.wait(5001);
    if (time.elapsed() - before < 5000 || time.now() < plan.notBefore || time.now() + 5000 >= plan.registerBy) {
      local.active.delete(plan.kind); return null;
    }
    let released = false;
    return () => { if (!released) {released = true; local.active.delete(plan.kind);} };
  } catch { local.active.delete(plan.kind); return null; }
}
