import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { launchChatStageWorker, runChatStagePolls, sweepChatStage } from "../chat-stage-cleanup";
import type { SignedWorkerBoot } from "../worker-boot-ticket";

const io = vi.hoisted(() => ({ rpc: vi.fn(), reply: vi.fn(), signals: vi.fn(), del: vi.fn(), info: vi.fn(), bucket: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: io.rpc }) }));
vi.mock("../media-storage", () => ({ boundedChatStorage: (signal: AbortSignal) => { io.signals(signal); return { from: io.bucket }; } }));
const worker = "17b99cca-bbbe-4500-8f6f-36bf32f097ed", upload = "c4720c4f-45b5-48b5-8427-9a4eec5d32f4";
const boot = "743e4596-785c-4b80-bdd0-b5867d4332d5";
const until = () => Date.now() + 3600000;
const plan = (): SignedWorkerBoot => ({ v: 1, kind: "chat_stage", worker, boot, until: until(), registerBy: until(), notBefore: Date.now(),
  maxPolls: 3, maxReplicas: 1, maxDeployments: 1, maxRestartsPerDeployment: 1, prepaidProbes: 2, evidenceId: "fixture", deploymentId: boot });
const ok = (data: unknown) => ({ data, error: null });
const job = (attempt: string) => ({ uploadId: upload, bucket: "erp-chat-media", path: upload, attemptId: attempt, leaseUntil: new Date(until()).toISOString() });

beforeEach(() => {
  vi.resetAllMocks();
  io.rpc.mockImplementation((op, args) => ({ abortSignal: (signal: AbortSignal) => { io.signals(signal); return io.reply(op, args); } }));
  io.bucket.mockReturnValue({ remove: io.del, info: io.info });
  io.del.mockResolvedValue(ok([]));
  io.info.mockResolvedValue({ data: null, error: { status: 404, statusCode: "NoSuchKey" } });
  io.reply.mockImplementation((op, args) => op === "erp_chat_stage_claim" ? ok({ coveredUntil: new Date(until()).toISOString(), job: job(args.p_attempt) }) : ok({ confirmed: true }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("one financed cleanup registration and bounded service time", () => {
  it("stops before SQL or Storage when less than one complete service fits", async () => {
    await expect(sweepChatStage({ ...plan(), until: Date.now() + 70000 })).rejects.toMatchObject({ status: 503 });
    expect(io.rpc).not.toHaveBeenCalled(); expect(io.bucket).not.toHaveBeenCalled();
  });
  it("binds the boot and finite cutoff on each poll and skips storage for an empty job or rejected poll", async () => {
    const p = plan();
    io.reply.mockReturnValueOnce(ok({ coveredUntil: new Date(p.until).toISOString(), job: null }));
    expect(await sweepChatStage(p)).toBe(p.until);
    expect(io.rpc.mock.calls[0][1]).toMatchObject({ p_boot: boot, p_worker: worker, p_until: new Date(p.until).toISOString() });
    io.reply.mockReturnValueOnce({ error: { code: "PT503" } });
    await expect(sweepChatStage(p)).rejects.toMatchObject({ status: 503 });
    expect(io.bucket).not.toHaveBeenCalled();
  });
  it("binds absence to the exact original claim after logout and supplies AbortSignals for all I/O", async () => {
    await sweepChatStage(plan());
    expect(io.del).toHaveBeenCalledWith([upload]); expect(io.info).toHaveBeenCalledWith(upload);
    expect(io.rpc.mock.calls[1]).toEqual(["erp_chat_stage_finish", { p_upload: upload, p_attempt: io.rpc.mock.calls[0][1].p_attempt, p_absent: true }]);
    expect(io.bucket).toHaveBeenCalledWith("erp-chat-media");
    expect(io.signals.mock.calls).toHaveLength(3);
    for (const [signal] of io.signals.mock.calls) expect(signal).toBeInstanceOf(AbortSignal);
  });
  it("preserves holds on failed deletion, non-object 404, wrong binding and failed finish", async () => {
    io.del.mockResolvedValueOnce({ error: { status: 503 } });
    await expect(sweepChatStage(plan())).rejects.toMatchObject({ status: 503 });
    expect(io.rpc.mock.calls.at(-1)?.[1].p_absent).toBe(false);
    io.info.mockResolvedValueOnce({ error: { status: 404, message: "Bucket not found" } });
    await expect(sweepChatStage(plan())).rejects.toMatchObject({ status: 503 });
    expect(io.rpc.mock.calls.at(-1)?.[1].p_absent).toBe(false);
    io.reply.mockImplementationOnce((_, args) => ok({ coveredUntil: new Date(until()).toISOString(), job: { ...job(args.p_attempt), path: worker } }));
    await expect(sweepChatStage(plan())).rejects.toMatchObject({ status: 409 });
    expect(io.del).toHaveBeenCalledTimes(2);
    io.reply.mockImplementationOnce((_, args) => ok({ coveredUntil: new Date(until()).toISOString(), job: job(args.p_attempt) })).mockReturnValueOnce({ error: { code: "PT409" } });
    await expect(sweepChatStage(plan())).rejects.toMatchObject({ status: 409 });
  });
  it("aborts a stalled transfer, records negative evidence under the remaining finish budget, and holds", async () => {
    const ctl = new AbortController();
    const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => ms === 60000 ? ctl.signal : nativeTimeout(ms));
    io.del.mockImplementation(async () => { ctl.abort(); return ok([]); });
    await expect(sweepChatStage(plan())).rejects.toMatchObject({ status: 503 });
    expect(io.info).not.toHaveBeenCalled();
    expect(io.rpc.mock.calls.at(-1)?.[1].p_absent).toBe(false);
  });
  it("declines ambiguous boot outcomes and permits only one registration RPC per call", async () => {
    io.reply.mockReturnValueOnce(ok(null));
    expect(await launchChatStageWorker(plan())).toBe(false);
    expect(io.rpc).toHaveBeenCalledTimes(1);
    expect(io.rpc.mock.calls[0][1]).toMatchObject({ p_boot: boot, p_worker: worker, p_max_polls: 3 });
    expect(io.bucket).not.toHaveBeenCalled();
  });
  it("enforces 70 seconds of service plus 30 seconds idle for each busy poll, with a finite count and absolute cutoff", async () => {
    vi.useFakeTimers(); const start = Date.now(), calls: number[] = [];
    const p = plan();
    const deps = { open: vi.fn(), poll: vi.fn(async () => { calls.push(Date.now() - start); vi.setSystemTime(Date.now() + 70000); return p.until; }),
      sleep: vi.fn(async (ms: number) => { vi.setSystemTime(Date.now() + ms); }) };
    await runChatStagePolls(p, p.until, deps);
    expect(calls).toEqual([0, 100000, 200000]);
    expect(deps.sleep.mock.calls).toEqual([[30000], [30000]]);
    vi.setSystemTime(start); calls.length = 0;
    await runChatStagePolls(p, start + 170000, deps);
    expect(calls).toEqual([0]);
  });
  it("halts immediately after lost poll or shortened funding and never starts an unbudgeted retry", async () => {
    const p = plan();
    const deps = { open: vi.fn(), poll: vi.fn().mockRejectedValueOnce(Error("lost")), sleep: vi.fn() };
    await expect(runChatStagePolls(p, p.until, deps)).rejects.toThrow("lost");
    deps.poll.mockResolvedValueOnce(Date.now() + 5000);
    await runChatStagePolls(p, p.until, deps);
    expect(deps.poll).toHaveBeenCalledTimes(2); expect(deps.sleep).not.toHaveBeenCalled();
  });
});
