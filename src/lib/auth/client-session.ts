/** UX invalidation only. Server/RLS checks remain the authorization boundary. */
export function clearIdentityWorkspace() {
  try {
    const keys = Object.keys(localStorage).filter(key => key.startsWith("algt_erp_workspace_"));
    keys.forEach(key => localStorage.removeItem(key));
  } catch { /* Storage can be unavailable; a full navigation clears in-memory drafts. */ }
}
export function broadcastIdentityChange() {
  clearIdentityWorkspace();
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("algt-auth-state");
    channel.postMessage("identity-changed"); channel.close();
  }
}

/** Authentication boundaries require a new document, not a retained router cache. */
export function navigateAfterIdentityChange(destination = "/login") {
  broadcastIdentityChange();
  window.location.replace(destination);
}
