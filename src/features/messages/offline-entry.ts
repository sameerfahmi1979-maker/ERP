import { recoverContinuation, continuing } from "./continuation";
import {
  bindTransportSession,
  rememberCacheKey,
  clearMessagingSession,
  type OfflineBinding,
} from "./offline-session";
import { Vault, type History, type Intent } from "./vault";
import { type Conversation, type Policy, type Attachment, limitBytes } from "./model";

const main = document.getElementById("work")!;
let epoch = 0,
  binding: OfflineBinding | undefined;
let recorder: MediaRecorder | undefined;
const urls = new Set<string>();
function retireView() {
  epoch++;
  binding = undefined;
  if (recorder) {
    recorder.onstop = null;
    recorder.stream.getTracks().forEach((t) => t.stop());
    if (recorder.state !== "inactive") recorder.stop();
    recorder = undefined;
  }
  for (const url of urls) URL.revokeObjectURL(url);
  urls.clear();
  main.replaceChildren();
}
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, parent: HTMLElement = main) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  parent.append(node);
  return node;
}
function notice(e: unknown) {
  const n = element("p", e instanceof Error ? e.message : "Cached chat is unavailable.");
  n.setAttribute("role", "alert");
}
function button(label: string, action: () => Promise<void> | void, parent: HTMLElement = main) {
  const b = element("button", label, parent);
  b.type = "button";
  b.onclick = () => {
    b.disabled = true;
    Promise.resolve()
      .then(action)
      .catch(notice)
      .finally(() => {
        b.disabled = false;
      });
  };
  return b;
}
async function check(stamp: number) {
  if (!binding || stamp !== epoch || document.hidden)
    throw Error("Open Messages again to verify this device.");
  await continuing(binding.session, binding.account);
  if (stamp !== epoch || document.hidden) throw Error("The session changed.");
}
function heading() {
  element("h1", "Messages");
  element("p", "Offline · cached on this device");
  button("Reconnect to ERP", () => location.reload());
}
async function attachment(v: Vault, a: Attachment, stamp: number, where: HTMLElement) {
  button(
    a.filename,
    async () => {
      await check(stamp);
      const bytes = await v.readBytes("cache/" + a.conversationId + "/media/" + v.session + "/" + a.id);
      if (!bytes) throw Error("This file has not been downloaded on this device.");
      await check(stamp);
      const url = URL.createObjectURL(new Blob([bytes], { type: a.mime }));
      urls.add(url);
      if (["audio", "voice"].includes(a.kind)) {
        const audio = element("audio", undefined, where);
        audio.controls = true;
        audio.src = url;
      } else if (a.kind === "video") {
        const video = element("video", undefined, where);
        video.controls = true;
        video.src = url;
      } else if (a.kind === "image") {
        const image = element("img", undefined, where);
        image.alt = a.filename;
        image.src = url;
      } else {
        const anchor = element("a", "Save cached file", where);
        anchor.href = url;
        anchor.download = a.filename;
        anchor.click();
      }
    },
    where,
  );
}
async function showThread(v: Vault, c: Conversation, stamp: number) {
  await check(stamp);
  const [h, policy, outbox] = await Promise.all([
    v.get<History>("cache/" + c.id + "/history"),
    v.get<{ session: string; policy: Policy }>("policy"),
    v.intents(c.id),
  ]);
  await check(stamp);
  if (!h || h.session !== v.session) throw Error("Open this conversation online before using it offline.");
  main.replaceChildren();
  heading();
  button("Back to inbox", ()=>boot(false));
  element("h2", c.title);
  for (const m of h.messages) {
    const article = element("article");
    element("strong", m.senderName ?? "System notice", article);
    element("small", " · " + new Date(m.sentAt).toLocaleString(), article);
    if (m.reply)
      element(
        "blockquote",
        m.reply.deleted ? "Message deleted" : (m.reply.body ?? "Reply to attachment"),
        article,
      );
    const body = element("p", m.deleted ? "Message deleted" : m.body, article);
    body.dir = "auto";
    if (!m.deleted) for (const a of m.attachments) await attachment(v, a, stamp, article);
  }
  for (const i of outbox) {
    const article = element("article");
    element(
      "strong",
      i.state === "queued" && i.session === v.session
        ? "Pending delivery"
        : "Device draft · review online before sending",
      article,
    );
    element("p", i.body, article);
    element("p", i.uploads.map((f) => f.name).join(", "), article);
  }
  if (policy?.session !== v.session || !policy.policy.accepted || !policy.policy.currentVersion) {
    element("p", "Connect to ERP to check the current communication terms before sending.");
    return;
  }
  const termsVersion = policy.policy.currentVersion,
    form = element("fieldset");
  element("legend", "Queue a message", form);
  const label = element("label", "Message", form),
    text = element("textarea", undefined, label);
  text.dir = "auto";
  text.maxLength = 32000;
  const draftKey = "cold-compose/" + c.id;
  text.value = (await v.get<string>(draftKey)) ?? "";
  let writing = Promise.resolve();
  text.oninput = () => {
    const value = text.value;
    writing = writing
      .catch(() => {})
      .then(() => v.put(draftKey, value))
      .catch(notice);
  };
  const filesLabel = element("label", "Attachments · 50 MiB each", form),
    files = element("input", undefined, filesLabel);
  files.type = "file";
  files.multiple = true;
  let voice: File | undefined;
  const record = button(
    "Record voice note",
    async () => {
      if (recorder?.state === "recording") {
        recorder.stop();
        return;
      }
      await check(stamp);
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia)
        throw Error("Voice recording is unavailable here.");
      const mime = ["audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
      if (!mime) throw Error("No supported recording format.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      try {
        await check(stamp);
        recorder = new MediaRecorder(stream, { mimeType: mime });
      } catch (e) {
        stream.getTracks().forEach((t) => t.stop());
        throw e;
      }
      const current = recorder,
        parts: Blob[] = [];
      let size = 0;
      record.textContent = "Stop recording";
      current.ondataavailable = (e) => {
        size += e.data.size;
        if (size > limitBytes) {
          if (current.state === "recording") current.stop();
        } else parts.push(e.data);
      };
      current.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recorder = undefined;
        if (stamp !== epoch) return;
        record.textContent = "Record voice note";
        if (size > limitBytes || !size) {
          notice(Error("Recording unavailable or over 50 MiB."));
          return;
        }
        voice = new File(parts, mime === "audio/webm" ? "Voice note.webm" : "Voice note.m4a", { type: mime });
        element("p", "Voice note attached.", form);
      };
      current.start(1000);
    },
    form,
  );
  button(
    "Queue on this device",
    async () => {
      await check(stamp);
      if (recorder) throw Error("Stop recording before queuing this message.");
      await writing;
      const pending = Array.from(files.files ?? []);
      if (voice) pending.push(voice);
      if (!text.value.trim() && !pending.length) throw Error("Write a message or attach a file.");
      const intent: Intent = {
        id: crypto.randomUUID(),
        session: v.session,
        conversationId: c.id,
        body: text.value.trim(),
        mentions: [],
        termsVersion,
        state: "queued",
        createdAt: new Date().toISOString(),
        uploads: pending.map((f) => ({
          id: crypto.randomUUID(),
          name: f.name,
          mime: f.type || "application/octet-stream",
          voice: f === voice,
        })),
      };
      await v.persistIntent(intent, pending, draftKey);
      await showThread(v, c, stamp);
    },
    form,
  );
}
async function boot(useDeepLink=true) {
  retireView();
  const stamp = epoch;
  heading();
  try {
    const recovered = await recoverContinuation();
    if (stamp !== epoch || document.hidden) return;
    binding = recovered.binding;
    bindTransportSession(binding.session);
    rememberCacheKey(binding.account, binding.session, recovered.key);
    const v = new Vault(binding.account, binding.session, binding.expectedProfile, true);
    const entries = await Promise.all(
      [false, true].map((a) => v.get<{ session: string; items: Conversation[] }>("cache/inbox/" + a)),
    );
    await check(stamp);
    const items = entries.flatMap((e) => (e?.session === v.session ? e.items : []));
    const id = new URL(location.href).searchParams.get("conversationId"),
      selected = useDeepLink&&items.find((c) => c.id === id);
    if (selected) {
      await showThread(v, selected, stamp);
      return;
    }
    element("h2", "Cached conversations");
    for (const c of items) button(c.title + (c.archived ? " · Archived" : ""), () => showThread(v, c, stamp));
    if (!items.length) element("p", "No conversations are cached for this session.");
  } catch (e) {
    if (stamp === epoch) notice(e);
  }
}
function lock() {
  retireView();
  clearMessagingSession();
  element("p", "Your ERP account or session changed. Reconnect to continue.");
}
window.addEventListener("storage", (e) => {
  if (binding && e.key === "algt-chat-retired/" + binding.session) lock();
});
const changes = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("algt-auth-state") : null;
if (changes) changes.onmessage = lock;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    retireView();
    element("p", "Messages locked while this window is hidden.");
  } else void boot();
});
window.addEventListener("online", () => {
  retireView();
  location.reload();
});
if (location.pathname === "/messages") void boot();
else location.replace("/messages");
