export type WorkspaceSaveContract = { operationId: string; revision: string | null };
export type WorkspaceSaveReceipt = { id: number; revision: string; replayed: boolean };

/** Keep the exact original request until an authoritative response resolves it. */
export function createWorkspaceSaveAttempt() {
  let pending: { fingerprint: string; contract: WorkspaceSaveContract } | undefined;
  return {
    begin(payload: unknown, revision: string | null) {
      const fingerprint = JSON.stringify([revision, payload]);
      if (pending && pending.fingerprint !== fingerprint) {
        throw new Error("A previous save is unconfirmed. Restore its submitted values and retry, or reopen the record to reconcile it before saving different data.");
      }
      pending ??= { fingerprint, contract: { operationId: crypto.randomUUID(), revision } };
      return pending.contract;
    },
    resolved() { pending = undefined; },
  };
}
