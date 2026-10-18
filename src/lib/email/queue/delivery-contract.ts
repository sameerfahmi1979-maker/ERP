/** Provider acceptance is NOT inbox delivery. Unknown is never auto-retryable. */
export type DeliveryOutcome =
  | { kind: "accepted" }
  | { kind: "retry"; retryAfter?: string }
  | { kind: "permanent" }
  | { kind: "unknown" }
  | { kind: "cancelled" };

export function retryAfterDate(value: string | null, now = Date.now()): string | undefined {
  if (!value) return undefined;
  const ms = /^\d+$/.test(value.trim()) ? now + Number(value) * 1000 : Date.parse(value);
  return Number.isFinite(ms) && ms > now && ms <= 8_640_000_000_000_000
    ? new Date(ms).toISOString() : undefined;
}

export function classifySendResponse(status: number, retryAfter: string | null, now = Date.now()): DeliveryOutcome {
  if (status === 202) return { kind: "accepted" };
  if (status === 429) return { kind: "retry", retryAfter: retryAfterDate(retryAfter, now) };
  // A timeout, proxy error or unexpected successful status may follow delivery.
  if (status === 408 || status >= 500 || (status >= 200 && status < 300)) return { kind: "unknown" };
  return { kind: "permanent" };
}

/** Abort plus a promise deadline: even a broken adapter ignoring AbortSignal
 * cannot strand the caller. Late completion is ignored, never retried blindly. */
export async function withDeadline<T>(ms: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (!Number.isFinite(ms) || ms < 1) throw new Error("Invalid deadline");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Operation deadline exceeded")); }, ms);
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
