import { withDeadline } from "./delivery-contract";

/** Application budgets, not a promise that abort rolls back a remote commit.
 * 5s reap + <20s starts + <=50s last item = <75s queue work;
 * 15s schedule production + queue + 5s input = <95s route work.
 * Configure caller AND host to at least 120s at cutover. DB leases stay 120s.
 * Event-loop stalls/host termination still rely on durable leases, not timers. */
export const F09_LIMITS = Object.freeze({
  databaseMs: 5_000,
  preparationMs: 15_000,
  dispatchMs: 20_000,
  batchStartMs: 20_000,
  scheduleProductionMs: 15_000,
  requestBodyMs: 5_000,
  requestBodyBytes: 2_048,
  callerTimeoutMs: 120_000,
});

export type AbortableQuery<T> = PromiseLike<T> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<T>;
};

/** Apply PostgREST's transport abort as well as a caller deadline. Never retry
 * here: a timed-out write may have committed. Late results cannot start a send. */
export async function boundedQuery<T>(query: AbortableQuery<T>): Promise<T> {
  return withDeadline(F09_LIMITS.databaseMs, async signal =>
    await (query.abortSignal ? query.abortSignal(signal) : query));
}

/** Shared producer signal prevents a timed-out loop from starting more writes. */
export async function queryWithin<T>(query: AbortableQuery<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  const result = await (query.abortSignal ? query.abortSignal(signal) : query);
  signal.throwIfAborted();
  return result;
}

export class InvalidWorkerInput extends Error {
  constructor() { super("Invalid request"); }
}

/** Bound streamed bytes, not string length after unbounded request.text(). */
export async function readWorkerInput(request: Request): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > F09_LIMITS.requestBodyBytes))
    throw new InvalidWorkerInput();
  if (!request.body) return {};
  const reader = request.body.getReader();
  try {
    return await withDeadline(F09_LIMITS.requestBodyMs, async signal => {
      const cancel = () => { void reader.cancel().catch(() => {}); };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          signal.throwIfAborted();
          const part = await reader.read();
          signal.throwIfAborted();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > F09_LIMITS.requestBodyBytes) throw new InvalidWorkerInput();
          chunks.push(part.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return text.trim() ? JSON.parse(text) : {};
      } finally { signal.removeEventListener("abort", cancel); }
    });
  } catch { throw new InvalidWorkerInput(); }
  finally { void reader.cancel().catch(() => {}); }
}
