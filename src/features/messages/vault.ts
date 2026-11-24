// IndexedDB retains encrypted envelopes. Usable keys live only in memory.
import { continuing, enrollContinuation } from "./continuation";
import type { OfflineBinding } from "./offline-session";
import { cacheKey, rememberCacheKey, messagingSessionTag, communicationSignal } from "./offline-session";
import { type Message, type Conversation, type Args, type Profile, limitBytes } from "./model";
import { ChatError, TerminalChatUploadError, chatUploadStatus, command, mutate, upload } from "./client";

const dbName = "algt-messages-v1";
function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
let connection: Promise<IDBDatabase> | undefined;
function db() {
  if (!connection) {
    const open = indexedDB.open(dbName, 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("keys");
      open.result.createObjectStore("records");
    };
    connection = request(open).catch((error) => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}
async function commit(store: string, change: (s: IDBObjectStore) => void) {
  const tx = (await db()).transaction(store, "readwrite");
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
  change(tx.objectStore(store));
  return done;
}
export async function unlockVault(
  account: string,
  session: string,
  material: string,
  signal: AbortSignal,
  resume?: { epoch: string; binding: OfflineBinding; cookieName: string },
) {
  if (session !== messagingSessionTag() || !/^[A-Za-z0-9_-]{43}$/.test(material))
    throw Error("The ERP could not unlock secure device storage.");
  const raw = Uint8Array.from(atob(material.replaceAll("-", "+").replaceAll("_", "/") + "="), (c) =>
    c.charCodeAt(0),
  );
  const wrapping = await crypto.subtle.importKey("raw", raw, "AES-KW", false, ["wrapKey", "unwrapKey"]);
  raw.fill(0);
  const load = async () =>
    request((await db()).transaction("keys").objectStore("keys").get(account)) as Promise<
      ArrayBuffer | undefined
    >;
  let wrapped = await load();
  if (!wrapped) {
    const newKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
    const candidate = await crypto.subtle.wrapKey("raw", newKey, wrapping, "AES-KW");
    try {
      await commit("keys", (s) => {
        s.add(candidate, account);
      });
      wrapped = candidate;
    } catch (e) {
      wrapped = await load();
      if (!wrapped) throw e;
    }
  }
  if (resume) {
    const exportable = await crypto.subtle.unwrapKey("raw", wrapped, wrapping, "AES-KW", "AES-GCM", true, [
      "encrypt",
      "decrypt",
    ]);
    await enrollContinuation(resume.epoch, resume.binding, resume.cookieName, exportable, signal);
  }
  const key = await crypto.subtle.unwrapKey("raw", wrapped, wrapping, "AES-KW", "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  signal.throwIfAborted();
  rememberCacheKey(account, session, key);
}
export interface History {
  session: string;
  conversation: Conversation;
  messages: Message[];
  nextCursor: string | null;
}
export type MutationKey = ReturnType<typeof crypto.randomUUID>;
export interface UploadItem {
  id: MutationKey;
  uploadKey?: MutationKey;
  name: string;
  mime: string;
  voice: boolean;
}
export interface Intent {
  id: MutationKey;
  conversationId: string;
  session: string;
  body: string;
  mentions: string[];
  termsVersion?: string;
  uploadSession?: string;
  replyId?: string;
  dmsToken?: string;
  uploads: UploadItem[];
  createdAt: string;
  state: "queued" | "draft";
  issue?: string;
  preparedArgs?: Args;
}

async function renewedUploadKey(session: string, intentId: MutationKey, item: UploadItem, stage: string): Promise<MutationKey> {
  const seed = JSON.stringify(["algt-chat-upload-retry-v1", session, intentId, item.id, item.uploadKey, stage]);
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)));
  // UUIDv8 preserves a stable replacement key across concurrent tabs.
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes.subarray(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class Vault {
  constructor(
    readonly account: string,
    readonly session: string,
    readonly profileId: string,
    readonly enforceDeviceEpoch = false,
  ) {}
  private async current() {
    if (this.enforceDeviceEpoch) await continuing(this.session, this.account);
  }
  private path(key: string) {
    return this.account + "/" + key;
  }
  private async encrypt(key: string, body: ArrayBuffer) {
    const path = this.path(key),
      iv = crypto.getRandomValues(new Uint8Array(12));
    const keyHandle = cacheKey(this.account, this.session);
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(path) },
      keyHandle,
      body,
    );
    if (cacheKey(this.account, this.session) !== keyHandle) throw Error("The messaging session changed.");
    await this.current();
    return { iv, cipher };
  }
  async bytes(key: string, body: ArrayBuffer) {
    const value = await this.encrypt(key, body);
    await commit("records", (store) => {
      store.put(value, this.path(key));
    });
  }
  async readBytes(key: string) {
    const path = this.path(key);
    const value = await request((await db()).transaction("records").objectStore("records").get(path));
    if (!value) return null;
    const keyHandle = cacheKey(this.account, this.session);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: value.iv, additionalData: new TextEncoder().encode(path) },
      keyHandle,
      value.cipher,
    );
    if (cacheKey(this.account, this.session) !== keyHandle) throw Error("The messaging session changed.");
    await this.current();
    return plain;
  }
  async put(key: string, value: unknown) {
    await this.bytes(key, new TextEncoder().encode(JSON.stringify(value)).buffer);
  }
  async get<T>(key: string): Promise<T | null> {
    const data = await this.readBytes(key);
    return data ? JSON.parse(new TextDecoder().decode(data)) : null;
  }
  async list(prefix: string) {
    const p = this.path(prefix);
    const keys = await request(
      (await db())
        .transaction("records")
        .objectStore("records")
        .getAllKeys(IDBKeyRange.bound(p, p + "\uffff")),
    );
    return keys.map((k) => String(k).slice(this.account.length + 1));
  }
  async clear(prefix: string) {
    const p = this.path(prefix);
    await commit("records", (s) => {
      s.delete(IDBKeyRange.bound(p, p + "\uffff"));
    });
  }
  async drop(key: string) {
    await commit("records", (s) => {
      s.delete(this.path(key));
    });
  }
  async reconcile(conversations: Conversation[], signal: AbortSignal) {
    const permitted = new Map(conversations.map((c) => [c.id, c.changeSeq]));
    const cached = (await this.list("cache/")).filter((k) => k.endsWith("/history"));
    for (const key of cached) {
      signal.throwIfAborted();
      const history = await this.get<History>(key);
      if (
        history &&
        (!permitted.has(history.conversation.id) ||
          permitted.get(history.conversation.id) !== history.conversation.changeSeq)
      ) {
        await this.clear("cache/" + history.conversation.id + "/");
      }
    }
  }
  async intents(thread: string) {
    const keys = await this.list("out/" + thread + "/");
    const records = await Promise.all(keys.map((key) => this.get<Intent>(key)));
    return records
      .filter((i): i is Intent => Boolean(i))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async persistIntent(intent: Intent, files: File[], composeKey?: string) {
    if (files.length !== intent.uploads.length || files.some((f) => !f.size || f.size > limitBytes))
      throw Error("Each file must contain data and be 50 MiB or smaller.");
    for (const [index, file] of files.entries())
      await this.bytes("payload/" + intent.id + "/" + intent.uploads[index].id, await file.arrayBuffer());
    const key = "out/" + intent.conversationId + "/" + intent.id;
    const value = await this.encrypt(key, new TextEncoder().encode(JSON.stringify(intent)).buffer);
    await commit("records", (store) => {
      store.add(value, this.path(key));
      if (composeKey) store.delete(this.path(composeKey));
      for (const file of intent.uploads)
        store.delete(this.path("compose-file/" + intent.conversationId + "/" + file.id));
    });
  }
  save(intent: Intent) {
    return this.put("out/" + intent.conversationId + "/" + intent.id, intent);
  }
  async remove(intent: Intent) {
    await this.drop("out/" + intent.conversationId + "/" + intent.id);
    await this.clear("payload/" + intent.id + "/");
  }
  async send(intent: Intent, signal: AbortSignal) {
    signal = communicationSignal(signal);
    if (
      messagingSessionTag() !== this.session ||
      intent.session !== this.session ||
      intent.state !== "queued"
    )
      throw Error("Review this device draft before sending.");
    const [profile, conversation, policy] = await Promise.all([
      command<Profile>("communications.profile", {}, signal),
      command<Conversation>(
        "chat.conversation",
        { conversationId: intent.conversationId, mode: "participant" },
        signal,
      ),
      command<{ accepted: boolean; currentVersion: string | null }>("policy.status", {}, signal),
    ]);
    if (
      profile.profileId !== this.profileId ||
      !profile.chat.configured ||
      !profile.chat.eligible ||
      !policy.accepted ||
      !policy.currentVersion ||
      policy.currentVersion !== intent.termsVersion ||
      conversation.id !== intent.conversationId
    )
      throw Error("Review your session, access and terms before sending.");
    const reusable = new Map<number, string>();
    const rotated = new Set<number>();
    const rotateUploads = async (stages: ReadonlyMap<number, string>) => {
      const uploads = await Promise.all(intent.uploads.map(async (item, index) => {
        const stage = stages.get(index);
        if (stage === undefined) return item;
        rotated.add(index);
        return { ...item, uploadKey: await renewedUploadKey(this.session, intent.id, item, stage) };
      }));
      signal.throwIfAborted();
      intent = { ...intent, uploadSession: this.session, preparedArgs: undefined, uploads };
      await this.save(intent);
    };
    if (intent.preparedArgs) {
      try {
        await mutate("chat.send", intent.preparedArgs, intent.id, signal);
        await this.remove(intent);
        return;
      } catch (error) {
        if (
          !(error instanceof ChatError) || error.status !== 404 ||
          !intent.uploads.length || intent.uploadSession !== this.session
        ) throw error;
        const ids = intent.preparedArgs.uploadIds;
        if (!Array.isArray(ids) || ids.length !== intent.uploads.length) throw error;
        const expired = new Map<number, string>();
        // A committed send atomically attaches every stage. Only exact authorized
        // terminal evidence permits rewriting arguments under the same message key.
        for (const [index, id] of ids.entries()) {
          if (typeof id !== "string") throw error;
          const status = await chatUploadStatus(id, conversation.id, signal);
          if (status.terminal) expired.set(index, id);
          else if (status.state === "verified") reusable.set(index, id);
          else throw error;
        }
        if (!expired.size) throw error;
        await rotateUploads(expired);
      }
    }
    if (intent.uploadSession !== this.session) {
      await rotateUploads(new Map(intent.uploads.map((_, index) => [index, ""] as const)));
    }
    const args: Args = {
      conversationId: conversation.id,
      ...(intent.body && { body: intent.body }),
      mentionProfileIds: intent.mentions,
      ...(intent.replyId && { replyToMessageId: intent.replyId }),
    };
    if (intent.dmsToken)
      args.dmsRef = await command("chat.resolveDmsReference", { token: intent.dmsToken }, signal);
    const uploadIds = [];
    for (const [index, item] of intent.uploads.entries()) {
      const existing = reusable.get(index);
      if (existing) {
        uploadIds.push(existing);
        continue;
      }
      const data = await this.readBytes("payload/" + intent.id + "/" + item.id);
      if (!data) throw Error("A local attachment could not be recovered.");
      const file = new File([data], item.name, { type: item.mime });
      try {
        uploadIds.push(await upload(conversation.id, file, item.voice, item.uploadKey ?? item.id, signal));
      } catch (error) {
        if (!(error instanceof TerminalChatUploadError) || rotated.has(index)) throw error;
        await rotateUploads(new Map([[index, error.uploadId]]));
        const replacement = intent.uploads[index];
        uploadIds.push(await upload(conversation.id, file, replacement.voice, replacement.uploadKey ?? replacement.id, signal));
      }
    }
    args.uploadIds = uploadIds;
    await this.save({ ...intent, preparedArgs: args });
    await mutate("chat.send", args, intent.id, signal);
    await this.remove(intent);
  }
}
