import { combineChunks, parseCookieHeader, stringFromBase64URL } from "@supabase/ssr";
import type { OfflineBinding } from "./offline-session";

interface Enrollment extends OfflineBinding {
  cookieName: string;
  salt: Uint8Array<ArrayBuffer>;
  wrapped: ArrayBuffer;
}
interface State {
  epoch: string;
  retired?: string;
  enrollment?: Enrollment;
}
const initial: State = { epoch: "initial" };
let database: Promise<IDBDatabase> | undefined;
function db() {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("algt-chat-continuation-v1", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("guard");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }).catch((e) => {
      database = undefined;
      throw e;
    });
  }
  return database;
}
export async function continuationState(): Promise<State> {
  const store = (await db()).transaction("guard").objectStore("guard");
  return new Promise((resolve, reject) => {
    const r = store.get("current");
    r.onsuccess = () => resolve(r.result ?? initial);
    r.onerror = () => reject(r.error);
  });
}
async function change(f: (existing: State) => State) {
  const tx = (await db()).transaction("guard", "readwrite"),
    store = tx.objectStore("guard");
  return new Promise<void>((resolve, reject) => {
    let failure: unknown;
    const r = store.get("current");
    r.onsuccess = () => {
      try {
        store.put(f(r.result ?? initial), "current");
      } catch (e) {
        failure = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure ?? tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
export function markRetired(session: string) {
  try {
    localStorage.setItem("algt-chat-retired/" + session, "1");
  } catch {
    /* IndexedDB retirement remains authoritative. */
  }
}
function assertNotRetired(session: string) {
  if (localStorage.getItem("algt-chat-retired/" + session)) throw Error("Sign in again to unlock messages.");
}
export function retireContinuation(session?: string) {
  if (!session || typeof indexedDB === "undefined") return Promise.resolve();
  markRetired(session);
  return change((current) => {
    if (current.enrollment && current.enrollment.session !== session) return current;
    return { epoch: crypto.randomUUID(), retired: session };
  });
}
const encoded = (text: string) => new TextEncoder().encode(text);
async function localSecret(name: string, binding: OfflineBinding) {
  if (!/^sb-[a-zA-Z0-9_-]+-auth-token$/.test(name)) throw Error("Local ERP session is unavailable.");
  assertNotRetired(binding.session);
  const cookies = new Map(parseCookieHeader(document.cookie).map((c) => [c.name, c.value]));
  const chunks = await combineChunks(name, (n) => cookies.get(n));
  if (!chunks) throw Error("Sign in online to unlock cached messages.");
  const data = JSON.parse(chunks.startsWith("base64-") ? stringFromBase64URL(chunks.slice(7)) : chunks);
  if (typeof data.access_token !== "string" || typeof data.refresh_token !== "string" || !data.refresh_token)
    throw Error("The local ERP session is incomplete.");
  const parts = data.access_token.split(".");
  if (parts.length !== 3 || !parts[2]) throw Error("The local ERP session is incomplete.");
  const claims = JSON.parse(stringFromBase64URL(parts[1]));
  if (claims.sub !== binding.account || typeof claims.session_id !== "string")
    throw Error("The ERP account changed.");
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoded(claims.session_id))),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== binding.session) throw Error("The ERP session changed. Sign in online.");
  // JWT claims identify the session. Decryption additionally requires the original secret token material.
  const raw = encoded(JSON.stringify([data.refresh_token, parts[2]]));
  try {
    return await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
  } finally {
    raw.fill(0);
  }
}
async function sessionKey(e: Enrollment) {
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: e.salt,
      info: encoded("ALGT ERP offline chat v1/" + e.account + "/" + e.session),
    },
    await localSecret(e.cookieName, e),
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}
export async function enrollContinuation(
  epoch: string,
  binding: OfflineBinding,
  cookieName: string,
  contentKey: CryptoKey,
  signal: AbortSignal,
) {
  const enrollment: Enrollment = {
    ...binding,
    cookieName,
    salt: crypto.getRandomValues(new Uint8Array(32)),
    wrapped: new ArrayBuffer(0),
  };
  enrollment.wrapped = await crypto.subtle.wrapKey("raw", contentKey, await sessionKey(enrollment), "AES-KW");
  signal.throwIfAborted();
  await change((previous) => {
    signal.throwIfAborted();
    assertNotRetired(binding.session);
    if (previous.epoch !== epoch || previous.retired === binding.session)
      throw Error("The ERP session changed during offline enrollment.");
    // Every newly authenticated session gets a fresh epoch. Same-session token rotation reseals the key.
    return {
      epoch: previous.enrollment?.session === binding.session ? previous.epoch : crypto.randomUUID(),
      enrollment,
    };
  });
}
export async function continuing(session: string, account: string) {
  assertNotRetired(session);
  const current = await continuationState();
  if (current.enrollment?.session !== session || current.enrollment.account !== account)
    throw Error("The local ERP session was retired.");
  await crypto.subtle.unwrapKey(
    "raw",
    current.enrollment.wrapped,
    await sessionKey(current.enrollment),
    "AES-KW",
    "AES-GCM",
    false,
    ["decrypt"],
  );
  assertNotRetired(session);
}
export async function recoverContinuation() {
  const before = await continuationState(),
    entry = before.enrollment;
  if (!entry) throw Error("Connect and open Messages with your ERP account to enable offline access.");
  const key = await crypto.subtle.unwrapKey(
    "raw",
    entry.wrapped,
    await sessionKey(entry),
    "AES-KW",
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
  const after = await continuationState();
  assertNotRetired(entry.session);
  if (after.epoch !== before.epoch || after.enrollment?.session !== entry.session)
    throw Error("The local ERP session changed.");
  return {
    binding: { account: entry.account, session: entry.session, expectedProfile: entry.expectedProfile },
    key,
  };
}
