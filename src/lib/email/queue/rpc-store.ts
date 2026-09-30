import "server-only";
import type { EmailClaim, EmailQueueStore } from "./worker";

/** Minimal typed adapter; accepts the server-only admin client's RPC method.
 * No service credential is stored here and no authenticated browser may call
 * these functions. This is not an authorization layer for caller-supplied IDs. */
export interface QueueRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
export function createEmailQueueStore<T extends EmailClaim>(
  db: QueueRpcClient, owner: string, filter: { id?: number; module?: string } = {},
): EmailQueueStore<T> {
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await db.rpc(name, args);
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
    async beginDispatch(q) { return await call("f09_begin_email_dispatch", fence(q)) === true; },
    async finish(q, outcome) {
      return await call("f09_finish_email", { ...fence(q), p_outcome: outcome.kind,
        p_retry_after: outcome.kind === "retry" ? outcome.retryAfter ?? null : null }) === true;
    },
  };
}
