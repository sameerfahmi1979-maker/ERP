import { afterEach, expect, it, vi } from "vitest";
import { boundedQuery, F09_LIMITS, readWorkerInput } from "@/lib/email/queue/runtime-limits";
import { createEmailQueueStore } from "@/lib/email/queue/rpc-store";
import { processOneEmail } from "@/lib/email/queue/worker";
import { authorizeWorker } from "@/lib/email/queue/worker-auth";
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const claim = { id: 1, lease_owner: "synthetic", lease_token: "synthetic", attempt_count: 1, max_attempts: 3 };
it.each([" x".repeat(20), "x".repeat(257), "x".repeat(20)])("fails closed for malformed machine-secret configuration", secret => {
  expect(authorizeWorker("Bearer " + secret, secret)).toBe(false);
});
it("budgets fit the documented host/caller and database lease margins", () => {
  const one = 3 * F09_LIMITS.databaseMs + F09_LIMITS.preparationMs + F09_LIMITS.dispatchMs;
  const batch = F09_LIMITS.databaseMs + F09_LIMITS.batchStartMs + one;
  expect(one).toBe(50_000); expect(batch).toBe(75_000);
  expect(batch + F09_LIMITS.scheduleProductionMs + F09_LIMITS.requestBodyMs).toBeLessThan(F09_LIMITS.callerTimeoutMs);
  expect(one).toBeLessThan(120_000);
});
it("aborts real query transport and bounds a query that ignores abort", async () => {
  vi.useFakeTimers(); let signal: AbortSignal | undefined;
  const pending = Object.assign(new Promise<never>(() => {}), { abortSignal: (s: AbortSignal) => { signal = s; return pending; } });
  const assertion = expect(boundedQuery(pending)).rejects.toThrow("deadline");
  await vi.advanceTimersByTimeAsync(5_001); await assertion; expect(signal?.aborted).toBe(true);
});
it.each(["claim", "admission", "finish"])("lost %s response stops this invocation without a second send", async stage => {
  vi.useFakeTimers(); let late: (value: { data: unknown; error: null }) => void = () => {};
  const lost = new Promise<{ data: unknown; error: null }>(resolve => { late = resolve; });
  const target = { claim: "f09_claim_email", admission: "f09_admit_email_dispatch", finish: "f09_finish_provider_email" }[stage];
  const rpc = vi.fn((name: string) => name === target ? lost : Promise.resolve({ data: name === "f09_claim_email" ? [claim] : name === "f09_admit_email_dispatch" ? "allowed" : true, error: null }));
  const send = vi.fn().mockResolvedValue({ kind: "accepted" });
  const result = processOneEmail(createEmailQueueStore({ rpc }, "synthetic"), async () => ({ ready: true, provider: { id: 1, expected: {} }, send }));
  const assertion = expect(result).rejects.toThrow("deadline");
  await vi.advanceTimersByTimeAsync(5_001); await assertion;
  late({ data: stage === "claim" ? [claim] : stage === "admission" ? "allowed" : true, error: null });
  await vi.advanceTimersByTimeAsync(1);
  expect(send).toHaveBeenCalledTimes(stage === "finish" ? 1 : 0);
  expect(rpc.mock.calls.filter(([name]) => name === target)).toHaveLength(1);
});
it("reads empty and valid machine JSON without touching a worker", async () => {
  expect(await readWorkerInput(new Request("http://localhost"))).toEqual({});
  expect(await readWorkerInput(new Request("http://localhost", { method: "POST", body: '{"limit":2}' }))).toEqual({ limit: 2 });
});
it.each(["invalid", "{" ])("rejects malformed machine JSON: %s", async body => {
  await expect(readWorkerInput(new Request("http://localhost", { method: "POST", body }))).rejects.toThrow("Invalid request");
});
it("limits actual UTF-8 bytes, not characters or a forged short Content-Length", async () => {
  await expect(readWorkerInput(new Request("http://localhost", { method: "POST", headers: { "content-length": "1" }, body: '"' + "ش".repeat(1_100) + '"' }))).rejects.toThrow();
});
it("rejects declared oversized content before consuming its stream", async () => {
  const request = new Request("http://localhost", { method: "POST", headers: { "content-length": "9000000" }, body: "{}" });
  await expect(readWorkerInput(request)).rejects.toThrow(); expect(request.bodyUsed).toBe(false);
});
it("bounds stalled bodies and cancels the stream", async () => {
  vi.useFakeTimers(); const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => {}), cancel });
  const assertion = expect(readWorkerInput({ headers: new Headers(), body } as Request)).rejects.toThrow("Invalid request");
  await vi.advanceTimersByTimeAsync(5_001); await assertion; expect(cancel).toHaveBeenCalled();
});
