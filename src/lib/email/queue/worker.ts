import { withDeadline, type DeliveryOutcome } from "./delivery-contract";

export interface EmailClaim {
  id: number;
  lease_owner: string;
  lease_token: string;
  attempt_count: number;
  max_attempts: number;
}

export interface ProviderAdmission { id: number; expected: Record<string, unknown> }
export interface EmailQueueStore<T extends EmailClaim> {
  claim(): Promise<T | null>;
  beginDispatch(claim: T, provider?: ProviderAdmission): Promise<boolean | "deferred" | "rejected">;
  finish(claim: T, outcome: DeliveryOutcome): Promise<boolean>;
}

export type PreparedDelivery =
  | { ready: false; outcome: Exclude<DeliveryOutcome, { kind: "accepted" } | { kind: "unknown" }> }
  | { ready: true; provider?: ProviderAdmission; send: (signal: AbortSignal, correlationId: string) => Promise<DeliveryOutcome> };

/** One just-in-time claim, never a leased sequential batch. prepare MUST reload
 * active creator/scope, source, recipients, output and provider on EVERY attempt.
 * It may acquire credentials, but must not send. Caller supplies a trusted adapter.
 * Production adoption is intentionally separate from this foundation. */
export async function processOneEmail<T extends EmailClaim>(
  store: EmailQueueStore<T>,
  prepare: (claim: T, signal: AbortSignal) => Promise<PreparedDelivery>,
): Promise<"skipped" | "lease_lost" | "deferred" | DeliveryOutcome["kind"]> {
  const claim = await store.claim();
  if (!claim) return "skipped";
  let prepared: PreparedDelivery;
  try {
    prepared = await withDeadline(15_000, signal => prepare(claim, signal));
  } catch {
    // No dispatch can have happened under the adapter contract.
    prepared = { ready: false, outcome: { kind: "retry" } };
  }
  let outcome: DeliveryOutcome;
  if (!prepared.ready) {
    outcome = prepared.outcome;
  } else {
    const admission = await store.beginDispatch(claim, prepared.provider);
    if (admission === "deferred") return "deferred";
    if (!admission) return "lease_lost";
    if (admission === "rejected") outcome = { kind: "cancelled" };
    else try {
      outcome = await withDeadline(20_000, signal => prepared.send(signal, claim.lease_token));
    } catch {
      outcome = { kind: "unknown" };
    }
  }
  const result = outcome.kind === "retry" && claim.attempt_count >= claim.max_attempts ? "permanent" : outcome.kind;
  // Do NOT catch a database failure and send again. Reaper will hold dispatched
  // mail as unknown, including a lost response after the provider accepted it.
  return await store.finish(claim, outcome) ? result : "lease_lost";
}
