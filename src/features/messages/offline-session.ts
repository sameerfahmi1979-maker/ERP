// Only the already-mounted, authenticated document can install an offline view.
// A page reload, account switch, verified denial or changed scope discards it.
export type OfflineBinding = { account: string; session: string; expectedProfile: string };
let binding: OfflineBinding | undefined;
let requests = new AbortController();
export function communicationSignal(signal?: AbortSignal) {
  return signal ? AbortSignal.any([requests.signal, signal]) : requests.signal;
}
let transportTag: string | undefined;
let cache: { account: string; session: string; key: CryptoKey } | undefined;
export function bindTransportSession(session?: string) {
  if (transportTag !== session) clearMessagingSession();
  transportTag = session;
}
export function messagingSessionTag() {
  return transportTag;
}
export function rememberCacheKey(account: string, session: string, key: CryptoKey) {
  if (!session || session !== transportTag) throw Error("The messaging session changed.");
  if (cache?.account !== account || cache.session !== session) cache = { account, session, key };
}
export function cacheKey(account: string, session: string) {
  if (cache?.account !== account || cache.session !== session)
    throw Error("Sign in online with this ERP account to unlock this device.");
  return cache.key;
}
export function sealCache() {
  cache = undefined;
  binding = undefined;
}
export function rememberMessagingSession(next: OfflineBinding) {
  if (transportTag !== next.session) bindTransportSession(next.session);
  binding = next;
}
export function clearMessagingSession() {
  const old = transportTag;
  if (old && typeof localStorage !== "undefined") {
    try {
      localStorage.setItem("algt-chat-retired/" + old, "1");
    } catch {
      /* durable transaction below */
    }
    void import("./continuation").then((m) => m.retireContinuation(old)).catch(() => {});
  }
  requests.abort();
  requests = new AbortController();
  transportTag = undefined;
  sealCache();
}
export function offlineMessagingSession(account: string) {
  return binding?.account === account ? binding : undefined;
}
