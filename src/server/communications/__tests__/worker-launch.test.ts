import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/internal/communications/worker-launch/route";
import { skipsSessionRefresh } from "@/lib/release/maintenance";
import { claimWorkerLaunch, readSignedWorkerBoot } from "../worker-boot-ticket";

const io = vi.hoisted(() => ({ chat: vi.fn(), ptt: vi.fn() }));
vi.mock("../chat-stage-cleanup", () => ({ launchChatStageWorker: io.chat }));
vi.mock("../ptt", () => ({ launchPttWorker: io.ptt }));
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const worker = randomUUID(), deploymentId = randomUUID(), boot = randomUUID();
const env = { ERP_COMM_WORKER_BOOT_PUBLIC_KEY: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  RAILWAY_DEPLOYMENT_ID: deploymentId, ERP_COMM_CHAT_STAGE_CLEANUP_ENABLED: "true", ERP_COMM_CHAT_STAGE_CLEANUP_WORKER_ID: worker };
const base = () => ({ v: 1, kind: "chat_stage", worker, deploymentId, boot, evidenceId: "test", maxPolls: 5, maxReplicas: 2,
  maxRestartsPerDeployment: 10, maxDeployments: 2, prepaidProbes: 44, notBefore: new Date(Date.now() - 60000).toISOString(),
  registerBy: new Date(Date.now() + 25 * 3600000).toISOString(), until: new Date(Date.now() + 26 * 3600000).toISOString() });
const token = (args = {}) => { const buf = Buffer.from(JSON.stringify({ ...base(), ...args })); return buf.toString("base64url") + "." + sign(null, buf, privateKey).toString("base64url"); };
const path = "/api/internal/communications/worker-launch";
const req = (key: string, extra: RequestInit = {}) => new Request("https://erp.algt.net" + path, { method: "POST", headers: { authorization: "Bearer " + key }, ...extra });
beforeEach(() => { vi.clearAllMocks(); for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v); });
afterEach(() => vi.unstubAllEnvs());

describe("private post-deployment worker enrollment", () => {
  it("requires a signed prepaid receipt, exact host and worker identity, a bounded window and enough probes for all starts", () => {
    expect(readSignedWorkerBoot(token(), env)).toMatchObject({ worker, boot, maxPolls: 5 });
    for (const bad of [{ v: 2 }, { boot: "" }, { additional: "field" }, { deploymentId: boot }, { worker: boot }, { kind: "ptt" },
      { prepaidProbes: 43 }, { maxPolls: 0 }, { until: base().notBefore }, { registerBy: new Date().toISOString() }, { notBefore: base().until }]) {
      expect(readSignedWorkerBoot(token(bad), env)).toBeNull();
    }
    const good = token();
    for (const bad of ["", good + "=", good + ".x", good + "x", "x".repeat(4100)]) expect(readSignedWorkerBoot(bad, env)).toBeNull();
    expect(readSignedWorkerBoot(good, { ...env, ERP_COMM_WORKER_BOOT_PUBLIC_KEY: "" })).toBeNull();
    expect(readSignedWorkerBoot(good, { ...env, ERP_COMM_CHAT_STAGE_CLEANUP_ENABLED: "false" })).toBeNull();
  });
  it("spends the process attempt before waiting and never reuses it after an ambiguous registration", async () => {
    const p = readSignedWorkerBoot(token(), env)!;
    const state = new Set<string>(), start = Date.now(); let clock = start;
    const time = { now: () => clock, elapsed: () => clock - start, wait: async (ms: number) => { clock += ms; } };
    expect(await Promise.all([claimWorkerLaunch(p, state, time), claimWorkerLaunch({ ...p, boot: randomUUID() }, state, time)])).toEqual([true, false]);
    expect(await claimWorkerLaunch(p, state, time)).toBe(false);
    expect(await claimWorkerLaunch(p, new Set(), { ...time, wait: async () => {} })).toBe(false);
    expect(await claimWorkerLaunch(p, new Set(), { ...time, now: () => p.registerBy })).toBe(false);
  });
  it("rejects invalid signature, target, cookies, browser metadata, oversized tokens and every nonempty body without a registration call", async () => {
    for (const request of [req("invalid"), req(token({ deploymentId: boot })), req(token({ prepaidProbes: 0 })), req(token({ maxPolls: 0 })),
      req(token({ registerBy: base().notBefore })), req("x".repeat(4100)), req(token(), { body: "x" }), req("", { headers: { cookie: "k=v" } }),
      req("", { headers: { origin: "https://erp.algt.net" } }), req("", { headers: { "content-length": "123456789" } })]) {
      expect([400, 403]).toContain((await POST(request)).status);
    }
    expect(io.chat).not.toHaveBeenCalled(); expect(io.ptt).not.toHaveBeenCalled();
  });
  it("skips ERP session refresh only for this exact POST", () => {
    expect(skipsSessionRefresh(path, "POST")).toBe(true);
    for (const method of ["GET","PUT","HEAD"]) expect(skipsSessionRefresh(path, method)).toBe(false);
    for (const other of [path + "/",path + "/other","/api/internal/communications","/api/mobile/communications/v1"]) expect(skipsSessionRefresh(other,"POST")).toBe(false);
  });
  it("accepts a signed post-deployment grant through a real loopback HTTP POST with an empty Node request stream", async () => {
    vi.stubEnv("ERP_COMM_PTT_CLEANUP_ENABLED", "true");
    vi.stubEnv("ERP_COMM_PTT_WORKER_ID", worker);
    io.ptt.mockResolvedValue(true);
    const server = createServer(async (incoming, outgoing) => {
      try {
        const forwarded = new Request("http://127.0.0.1" + path, {
          method: incoming.method, headers: incoming.headers as HeadersInit, body: Readable.toWeb(incoming) as unknown as BodyInit, duplex: "half",
        } as RequestInit);
        outgoing.writeHead((await POST(forwarded)).status).end();
      } catch { outgoing.writeHead(500).end(); }
    });
    server.listen(0, "127.0.0.1");
    try {
      await once(server, "listening");
      const address = server.address() as AddressInfo;
      const result = await fetch("http://127.0.0.1:" + address.port + path, {
        method: "POST", headers: { authorization: "Bearer " + token({ kind: "ptt" }) }, redirect: "error", signal: AbortSignal.timeout(10000),
      });
      expect(result.status).toBe(204);
      expect(io.ptt).toHaveBeenCalledTimes(1); expect(io.chat).not.toHaveBeenCalled();
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  }, 15000);
  it("declined SQL registration cannot be retried by a concurrent or later signed request in this process", async () => {
    io.chat.mockResolvedValue(false);
    const result = await Promise.all([POST(req(token())), POST(req(token()))]);
    expect(result.map(r => r.status).sort()).toEqual([409, 503]);
    expect((await POST(req(token({ boot: randomUUID() })))).status).toBe(409);
    expect(io.chat).toHaveBeenCalledTimes(1);
  }, 10000);
});
