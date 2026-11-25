import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { AiEntityReference } from "@/lib/ai/foundation/contracts";

export type ObservedSource = { reference: AiEntityReference; sourceVersion: string };
type SignalKind = "risk" | "compliance" | "duplicates" | "dependents" | "understanding" | "expiry_identity" | "expiry_access" | "policy" | "excerpt" | "document_page" | "global_page" | "subject_lookup" | "type_lookup" | "company_labels" | "branch_labels" | "site_labels" | "site_links" | "approval" | "dashboard_risk" | "dashboard_compliance" | "dashboard_duplicates" | "dashboard_fields" | "dashboard_dms";
type ObservedQuery = { kind: SignalKind; reference?: AiEntityReference; params?: Record<string, unknown>; limit: number; result: unknown; term?: string };
type Observations = { sources: ObservedSource[]; queries: ObservedQuery[] };
const active = new AsyncLocalStorage<Observations>();

/** The actual rows used to generate one response. Never persisted in history. */
export async function observeAssistantGeneration<T>(work: () => Promise<T>) {
  const observations: Observations = { sources: [], queries: [] };
  const result = await active.run(observations, work);
  return { result, observations };
}

export function observeAssistantSource(reference: AiEntityReference, sourceVersion: string) {
  const reads = active.getStore();
  if (!reads || reads.sources.some(s => s.reference.entityType === reference.entityType &&
    s.reference.entityId === reference.entityId && s.sourceVersion === sourceVersion)) return;
  reads.sources.push({ reference, sourceVersion });
}

export function observeAssistantQuery(read: () => ObservedQuery) {
  const observations = active.getStore();
  if (observations) observations.queries.push(read());
}
