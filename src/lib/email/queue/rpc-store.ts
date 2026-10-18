import "server-only";
import type { EmailClaim, EmailQueueStore } from "./worker";
import { boundedQuery, type AbortableQuery } from "./runtime-limits";

/** Minimal typed adapter; accepts the server-only admin client's RPC method.
 * No service credential is stored here and no authenticated browser may call
 * these functions. This is not an authorization layer for caller-supplied IDs. */
export interface QueueRpcClient {
  rpc(name: string, args: Record<string, unknown>): AbortableQuery<{ data: unknown; error: unknown }>;
}
export function createEmailQueueStore<T extends EmailClaim>(
  db: QueueRpcClient, owner: string, filter: { id?: number; module?: string } = {},
): EmailQueueStore<T> {
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await boundedQuery(db.rpc(name, args));
    if (result.error) throw new Error(`Email queue transition failed: ${name}`);
    return result.data;
  };
  const fence = (q: T) => ({ p_id: q.id, p_owner: q.lease_owner, p_token: q.lease_token });
  return {
    async claim() {
      const rows = await call("f09_claim_email", { p_owner: owner, p_id: filter.id ?? null, p_module: filter.module ?? null });
      if (!Array.isArray(rows)) throw new Error("Invalid email claim response");
      return (rows[0] as T | undefined) ?? null;
    },
    async beginDispatch(q, provider) {
      if (!provider) return "rejected";
      const result = await call("f09_admit_email_dispatch", { ...fence(q), p_provider_id: provider.id, p_expected: provider.expected });
      if (result === "allowed") return true;
      if (result === "deferred" || result === "rejected") return result;
      if (result === "lease_lost") return false;
      throw new Error("Invalid provider admission response");
    },
    async finish(q, outcome) {
      return await call("f09_finish_provider_email", { ...fence(q), p_outcome: outcome.kind,
        p_retry_after: outcome.kind === "retry" ? outcome.retryAfter ?? null : null }) === true;
    },
  };
}
