/** F04: key generation and retirement of legacy disk values only.
 * Active page/table/search values live in the principal's WorkspaceUiMemoryProvider.
 */

const PREFIX = "algt_erp_workspace_page_state";

export type WorkspacePageStateScope = "route" | "record" | "tab" | "global";

// ── Key generation ─────────────────────────────────────────────────────────────

export function buildPageStateKey(
  scope: WorkspacePageStateScope,
  identifier: string,
  key: string
): string {
  const safe = identifier.replace(/[^a-zA-Z0-9/_-]/g, "_");
  return `${PREFIX}:${scope}:${safe}:${key}`;
}

// ── Delete ─────────────────────────────────────────────────────────────────────

export function clearPageState(storageKey: string): void {
  if (typeof window === "undefined" || !storageKey.startsWith(PREFIX + ":")) return;
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // fail silently
  }
}

// ── Clear all keys for a scope ─────────────────────────────────────────────────

export function clearScopePageState(
  scope: WorkspacePageStateScope,
  identifier: string
): void {
  if (typeof window === "undefined") return;
  try {
    const prefix = `${PREFIX}:${scope}:${identifier.replace(/[^a-zA-Z0-9/_-]/g, "_")}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keysToRemove.push(k);
    }
    keysToRemove.forEach(clearPageState);
  } catch {
    // fail silently
  }
}
