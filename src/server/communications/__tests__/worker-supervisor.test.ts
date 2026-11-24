import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readWorkerSupervisorPlans, runCommunicationWorkerSupervisor, startCommunicationWorkerSupervisors } from "../worker-supervisor";
import { claimSupervisedWorkerLaunch, claimWorkerLaunch, type SignedWorkerBoot } from "../worker-boot-ticket";
import { runSupervisedChatStageWorker } from "../chat-stage-cleanup";
import { runSupervisedPttWorker } from "../ptt";
const db = vi.hoisted(() => vi.fn(() => {throw Error("Unexpected database access");}));
vi.mock("@/lib/supabase/admin", () => ({createAdminClient: db}));

const issuer = generateKeyPairSync("ed25519");
const publicKey = issuer.publicKey.export({format: "der", type: "spki"}).toString("base64");
const now = Date.parse("2026-11-24T12:00:00.000Z"), worker = randomUUID(), deployment = randomUUID(), boots = [randomUUID(), randomUUID()];
const env = () => {
  const manifest = {v: 1, purpose: "erp-communication-supervisor", deploymentId: deployment, until: new Date(now + 3600000).toISOString(),
    planHash: "a".repeat(64), maxReplicas: 1, maxRestartsPerDeployment: 1, maxDeployments: 1, maxPhysicalStarts: 2,
    workers: [{kind: "ptt", worker, boots, retries: 1, quarantineSeconds: 100, maxLookups: 8, maxPolls: 400,
      busySeconds: 30, pollSeconds: 10, retrySeconds: 60, restartSeconds: 60, registrationSeconds: 0, recoverySeconds: 60}]};
  const body = Buffer.from(JSON.stringify(manifest));
  return {ERP_COMM_WORKER_SUPERVISOR_ENABLED: "true", ERP_COMM_WORKER_SUPERVISOR_UNTIL: new Date(now + 3600000).toISOString(),
  ERP_COMM_WORKER_SUPERVISOR_MANIFEST: body.toString("base64url") + "." + sign(null, body, issuer.privateKey).toString("base64url"),
  ERP_COMM_WORKER_BOOT_PUBLIC_KEY: publicKey, RAILWAY_DEPLOYMENT_ID: deployment,
  ERP_COMM_PTT_CLEANUP_ENABLED: "true", ERP_COMM_PTT_WORKER_ID: worker, ERP_COMM_PTT_BOOT_IDS: JSON.stringify(boots),
  ERP_COMM_PTT_LOOKUP_RETRIES: "1", ERP_COMM_PTT_RECOVERY_WAIT_SECONDS: "100"};
};
const config = () => readWorkerSupervisorPlans(env(), now)[0];
const grant = (boot: string = boots[0]): SignedWorkerBoot => ({v: 1, kind: "ptt", worker, deploymentId: deployment, boot,
  notBefore: now - 1000, registerBy: now + 3600000, until: now + 3600000, maxPolls: 400,
  maxReplicas: 1, maxRestartsPerDeployment: 1, maxDeployments: 1, prepaidProbes: 2, evidenceId: "synthetic-test"});
beforeEach(()=>vi.spyOn(Date,"now").mockReturnValue(now));
afterEach(() => {vi.unstubAllEnvs(); vi.useRealTimers();vi.restoreAllMocks();});

describe("finite in-process worker supervisor", () => {
  it("defaults off and requires finite UTC deadline, exact host, explicit boot/retry/wait bounds and a real public key", () => {
    expect(readWorkerSupervisorPlans({}, now)).toEqual([]);
    expect(config()).toMatchObject({kind: "ptt", boots, retries: 1, quarantineSeconds: 100});
    for (const patch of [{ERP_COMM_WORKER_SUPERVISOR_ENABLED: "false"}, {RAILWAY_DEPLOYMENT_ID: ""},
      {ERP_COMM_WORKER_SUPERVISOR_MANIFEST: ""}, {ERP_COMM_WORKER_SUPERVISOR_MANIFEST: env().ERP_COMM_WORKER_SUPERVISOR_MANIFEST + "x"},
      {ERP_COMM_WORKER_BOOT_PUBLIC_KEY: "fake"}, {ERP_COMM_PTT_BOOT_IDS: JSON.stringify([boots[0], boots[0]])},
      {ERP_COMM_PTT_LOOKUP_RETRIES: "-1"}, {ERP_COMM_PTT_LOOKUP_RETRIES: "4"}, {ERP_COMM_PTT_LOOKUP_RETRIES: "2"},
      {ERP_COMM_PTT_RECOVERY_WAIT_SECONDS: "0"}, {ERP_COMM_PTT_RECOVERY_WAIT_SECONDS: "101"},
      {ERP_COMM_WORKER_SUPERVISOR_UNTIL: "2026-12-01T00:00:00Z"}, {ERP_COMM_WORKER_SUPERVISOR_UNTIL: new Date(now - 1).toISOString()}]) {
      expect(readWorkerSupervisorPlans({...env(), ...patch}, now)).toEqual([]);
    }
  });
  it("makes zero database probes for missing/altered manifests and rejects signed arithmetic/schema mismatches", async () => {
    db.mockClear();
    for (const token of ["", env().ERP_COMM_WORKER_SUPERVISOR_MANIFEST+"x"]) {
      startCommunicationWorkerSupervisors({...env(),ERP_COMM_WORKER_SUPERVISOR_MANIFEST:token});
    }
    await Promise.resolve(); expect(db).not.toHaveBeenCalled();
    for (const change of [(m: Record<string,unknown>) => m.extra=true, (m: Record<string,unknown>) => m.maxPhysicalStarts=3]) {
      const e=env(), m=JSON.parse(Buffer.from(e.ERP_COMM_WORKER_SUPERVISOR_MANIFEST.split(".")[0],"base64url").toString()); change(m);
      const body=Buffer.from(JSON.stringify(m)); e.ERP_COMM_WORKER_SUPERVISOR_MANIFEST=body.toString("base64url")+"."+sign(null,body,issuer.privateKey).toString("base64url");
      expect(readWorkerSupervisorPlans(e,now)).toEqual([]);
    }
  });
  it("reads only explicit finite boots and waits for definitive lifecycle completion then quarantine before recovery", async () => {
    let clock = now, finish!: () => void;
    const first = new Promise<void>(resolve => {finish = resolve;});
    let held=false;
    const lookup = vi.fn(async (_p, boot: string) => {
      if(boot===boots[1] && !held){held=true;return "hold:"+new Date(clock+100000).toISOString();}return boot;
    }), release = vi.fn();
    const run = vi.fn().mockImplementationOnce(() => first).mockResolvedValue(undefined);
    const wait = vi.fn(async (ms: number) => {clock += ms;});
    const task = runCommunicationWorkerSupervisor(config(), {lookup, read: token => grant(token), claim: async () => release, run, now: () => clock, wait});
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(lookup).toHaveBeenCalledTimes(1); expect(release).not.toHaveBeenCalled();
    finish(); await task;
    expect(lookup.mock.calls.map(c => c[1])).toEqual([boots[0],boots[1],boots[1]]);
    expect(run).toHaveBeenCalledTimes(2); expect(release).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(100050);
  });
  it("bounds null retries, burns uncertain lookups and never reuses a returned token", async () => {
    let clock = now;
    const lookup = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockRejectedValueOnce(Error("lost"));
    const run = vi.fn(), claim = vi.fn(), wait = vi.fn(async (ms: number) => {clock += ms;});
    await runCommunicationWorkerSupervisor(config(), {lookup, run, claim, now: () => clock, wait});
    expect(lookup.mock.calls.map(c => c[1])).toEqual([boots[0], boots[0], boots[1]]);
    expect(run).not.toHaveBeenCalled(); expect(claim).not.toHaveBeenCalled();
  });
  it("rejects wrong boot/deployment/window receipts before registration and stops when a local active lifecycle prevents claim", async () => {
    for (const patch of [{boot: randomUUID()}, {deploymentId: randomUUID()}, {until: now + 7200000}]) {
      const run = vi.fn(), claim = vi.fn();
      await runCommunicationWorkerSupervisor({...config(), boots: [boots[0]]}, {lookup: async () => "token", read: () => ({...grant(), ...patch}), run, claim, now: () => now});
      expect(run).not.toHaveBeenCalled(); expect(claim).not.toHaveBeenCalled();
    }
    const lookup = vi.fn(async () => "token"), run = vi.fn();
    await runCommunicationWorkerSupervisor(config(), {lookup, read: () => grant(), claim: async () => null, run, now: () => now});
    expect(lookup).toHaveBeenCalledTimes(1); expect(run).not.toHaveBeenCalled();
  });
  it("keeps recovery finite after a failed completed loop and stops at deadline without ERP shutdown or token logging", async () => {
    let clock = now;
    const lookup = vi.fn(async (_p, boot: string) => boot), release = vi.fn(), run = vi.fn(async()=>{clock=now+3600000;throw Error("bounded stop");});
    await runCommunicationWorkerSupervisor(config(), {lookup, read: token => grant(token), claim: async () => release, run,
      now: () => clock, wait: async () => {clock = now + 3600000;}});
    expect(run).toHaveBeenCalledTimes(1); expect(lookup).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledOnce();
  });
  it("keeps managed boots unique and mutually exclusive and preserves the manual once-per-kind fence", async () => {
    let clock = now;
    const time = {now: () => clock, elapsed: () => clock - now, wait: async (ms: number) => {clock += ms;}};
    const local = {kinds: new Set<string>(), boots: new Set<string>(), active: new Set<string>()}, used = new Set<string>();
    const first = await claimSupervisedWorkerLaunch(grant(), local, used, time);
    expect(first).toBeTypeOf("function");
    expect(await claimSupervisedWorkerLaunch(grant(boots[1]), local, used, time)).toBeNull();
    expect(await claimWorkerLaunch(grant(boots[1]), used, time)).toBe(false);
    first!();
    expect(await claimSupervisedWorkerLaunch(grant(), local, used, time)).toBeNull();
    const second = await claimSupervisedWorkerLaunch(grant(boots[1]), local, used, time);
    expect(second).toBeTypeOf("function"); second!();
    expect(await claimSupervisedWorkerLaunch(grant(), {kinds: new Set(), boots: new Set(), active: new Set()}, new Set(["ptt"]), time)).toBeNull();
  });
  it("awaits the actual chat cleanup promise and never declares local completion while a poll remains unresolved", async () => {
    let finish!: (value: number) => void;
    const pending = new Promise<number>(resolve => {finish = resolve;}); let ended = false;
    const p = {...grant(), kind: "chat_stage" as const, maxPolls: 1};
    const task = runSupervisedChatStageWorker(p, {open: async () => p.until, poll: async () => pending, sleep: async () => {}}).then(() => {ended = true;});
    await Promise.resolve(); await Promise.resolve(); expect(ended).toBe(false);
    finish(p.until); await task; expect(ended).toBe(true);
  });
  it("awaits PTT drain completion, stops on an unhealthy cycle and leaves no detached retry", async () => {
    vi.stubEnv("ERP_COMM_PTT_CLEANUP_ENABLED", "true"); vi.stubEnv("ERP_COMM_PTT_WORKER_ID", worker);
    let finish!: (value: {until: number; healthy: boolean}) => void;
    const pending = new Promise<{until: number; healthy: boolean}>(resolve => {finish = resolve;}); let ended = false;
    const tick = vi.fn(async () => pending), wait = vi.fn();
    const task = runSupervisedPttWorker(grant(), {start: async () => ({coveredUntil: new Date(grant().until).toISOString(), cadenceSeconds: 10}), tick, wait}).then(() => {ended = true;});
    await vi.waitFor(() => expect(tick).toHaveBeenCalledOnce()); expect(ended).toBe(false);
    finish({until: grant().until, healthy: false}); await task;
    expect(ended).toBe(true); expect(wait).not.toHaveBeenCalled(); expect(tick).toHaveBeenCalledOnce();
  });
});
