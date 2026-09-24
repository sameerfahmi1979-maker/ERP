export type PermissionDraft = Record<number, { assigned: boolean; expectedAssigned: boolean }>;

/** Drafts are untrusted memory snapshots, never an authorization source. */
export function parsePermissionDraft(value: string): PermissionDraft {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: PermissionDraft = {};
    for (const [id, change] of Object.entries(parsed)) {
      if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0 || !change || typeof change !== "object") return {};
      const c = change as Record<string, unknown>;
      if (typeof c.assigned !== "boolean" || typeof c.expectedAssigned !== "boolean") return {};
      if (c.assigned !== c.expectedAssigned) result[Number(id)] = { assigned: c.assigned, expectedAssigned: c.expectedAssigned };
    }
    return result;
  } catch { return {}; }
}
