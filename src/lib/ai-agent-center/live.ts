import type { AgentCenterSnapshot } from "./contracts";

export const SAFE_REFRESH_MS = 15_000;
const STALE_AFTER_MS = 45_000;

export function classifyFeed(confirmedAt: string | null, now: number, failed: boolean) {
  if (!confirmedAt) return failed ? "delayed" : "loading";
  if (now - Date.parse(confirmedAt) >= STALE_AFTER_MS) return "stale";
  return failed ? "delayed" : "live";
}

export function retainNewest<T extends { confirmedAt: string }>(prior: T | undefined, incoming: T): T {
  return prior && Date.parse(prior.confirmedAt) > Date.parse(incoming.confirmedAt) ? prior : incoming;
}

export type CaseReadSnapshot = Pick<AgentCenterSnapshot, "selectedCase" | "attention" | "scope" | "confirmedAt">;

export function reconcileAttention(activity: AgentCenterSnapshot, detail: CaseReadSnapshot | null, searched: boolean) {
  const { attention } = activity;
  const filed = detail?.selectedCase;
  if (!attention || !detail || !filed || filed.id !== attention.id || filed.status !== "filed" ||
    !filed.documentId || !filed.finishedAt || detail.scope.companyId !== activity.scope.companyId ||
    detail.scope.branchId !== activity.scope.branchId || Date.parse(detail.confirmedAt) <= Date.parse(activity.confirmedAt) ||
    Date.parse(filed.updatedAt) <= Date.parse(attention.updatedAt)) return attention;

  // Detail reads can supply the next attention item only for an unsearched activity list.
  return !searched && detail.attention?.id !== filed.id ? detail.attention : null;
}

type ReadAuthority = {
  active: () => boolean;
  denialVersion: () => number;
  revoke: () => void;
};

export async function readWithinAuthority<T>(authority: ReadAuthority, read: () => Promise<T>, denied: (error: unknown) => boolean) {
  const generation = authority.denialVersion();
  const stillAuthorized = () => authority.active() && authority.denialVersion() === generation;
  const abort = () => new DOMException("Read scope was retired.", "AbortError");
  if (!stillAuthorized()) throw abort();
  try {
    const result = await read();
    if (!stillAuthorized()) throw abort();
    return result;
  } catch (error) {
    if (!stillAuthorized()) throw abort();
    if (denied(error)) authority.revoke();
    throw error;
  }
}
