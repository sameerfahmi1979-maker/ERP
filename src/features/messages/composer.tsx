"use client";
import { useEffect, useRef, useState } from "react";
import { command, errorText, mutate } from "./client";
import { useLoad, useTask } from "./hooks";
import { Issue } from "./controls";
import { Recorder } from "./media";
import { documentToken, limitBytes, type Member, type Message } from "./model";
import { Vault, type Intent, type UploadItem } from "./vault";

type Draft = { body: string; mentions: string[]; link: string; uploads: UploadItem[]; replyId?: string };
const blank = (): Draft => ({ body: "", mentions: [], link: "", uploads: [] });
export function Composer({
  id,
  members,
  vault,
  reply,
  resetReply,
  accepted,
  termsVersion,
  refresh,
}: {
  id: string;
  members: Member[];
  vault: Vault;
  reply?: Message;
  resetReply: () => void;
  accepted: boolean;
  termsVersion?: string;
  refresh: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(blank),
    [ready, setReady] = useState(false),
    [problem, setProblem] = useState(""),
    [online, setOnline] = useState(true);
  const draftRef = useRef(draft),
    queue = useRef<Promise<void>>(Promise.resolve()),
    typingAt = useRef(0);
  const source = "compose/" + id;
  const { run, busy, issue } = useTask();
  const items = useLoad(
    id,
    (s) => {
      s.throwIfAborted();
      return vault.intents(id);
    },
    4000,
  );
  useEffect(() => {
    let current = true;
    void vault
      .get<Draft>(source)
      .then((d) => {
        if (current) {
          draftRef.current = d ?? blank();
          setDraft(draftRef.current);
          setReady(true);
        }
      })
      .catch((e) => {
        if (current) setProblem(errorText(e));
      });
    return () => {
      current = false;
    };
  }, [source, vault]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  function update(patch: Partial<Draft>) {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    queue.current = queue.current
      .catch(() => {})
      .then(() => vault.put(source, next))
      .catch((e) => {
        setProblem("Could not save this device draft. " + errorText(e));
      });
  }
  async function add(files: File[], voice = false) {
    for (const f of files) {
      if (!f.size || f.size > limitBytes)
        throw Error("Each file must contain data and be 50 MiB or smaller.");
      const item: UploadItem = {
        id: crypto.randomUUID(),
        name: f.name,
        mime: f.type || "application/octet-stream",
        voice,
      };
      await vault.bytes("compose-file/" + id + "/" + item.id, await f.arrayBuffer());
      update({ uploads: [...draftRef.current.uploads, item] });
    }
  }
  const send = () =>
    void run(async () => {
      await queue.current;
      const d = draftRef.current;
      const intent: Intent = {
        id: crypto.randomUUID(),
        conversationId: id,
        session: vault.session,
        termsVersion,
        body: d.body.trim(),
        mentions: d.mentions,
        replyId: reply?.id ?? d.replyId,
        dmsToken: d.link ? documentToken(d.link, window.location.origin) : undefined,
        uploads: d.uploads,
        createdAt: new Date().toISOString(),
        state: "queued",
      };
      const files = [];
      for (const f of d.uploads) {
        const bytes = await vault.readBytes("compose-file/" + id + "/" + f.id);
        if (!bytes) throw Error("A draft attachment is unavailable.");
        files.push(new File([bytes], f.name, { type: f.mime }));
      }
      await vault.persistIntent(intent, files, source);
      draftRef.current = blank();
      setDraft(draftRef.current);
      resetReply();
      items.refresh();
      refresh();
      window.dispatchEvent(new Event("algt-chat-outbox"));
    });
  const replyId = reply?.id ?? draft.replyId;
  return (
    <div className="chat-compose">
      <Issue text={issue || problem || items.issue} />
      {items.data?.map((i) => (
        <div key={i.id} className="chat-panel">
          <strong>
            {i.state === "queued" && i.session === vault.session
              ? "Pending send"
              : "Device draft · review before sending"}
          </strong>
          <p>{i.body}</p>
          <small>{i.uploads.map((f) => f.name).join(", ")}</small>
          <p>{i.issue}</p>
          {(i.state === "draft" || i.session !== vault.session) && (
            <button
              disabled={!accepted || busy}
              onClick={() =>
                void run(async () => {
                  await command("chat.conversation", { conversationId: id, mode: "participant" });
                  await vault.save({
                    ...i,
                    session: vault.session,
                    termsVersion,
                    state: "queued",
                    issue: undefined,
                  });
                  items.refresh();
                  window.dispatchEvent(new Event("algt-chat-outbox"));
                })
              }
            >
              Send reviewed draft
            </button>
          )}
          {(i.state === "draft" || i.session !== vault.session) && (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await vault.remove(i);
                  items.refresh();
                })
              }
            >
              Discard local item
            </button>
          )}
        </div>
      ))}
      <fieldset disabled={!ready || busy}>
        <legend>Compose a message</legend>
        {replyId && (
          <div>
            Replying to {reply?.senderName ?? "a message"}{" "}
            <button
              onClick={() => {
                resetReply();
                update({ replyId: undefined });
              }}
            >
              Cancel reply
            </button>
          </div>
        )}
        <label>
          Message
          <textarea
            dir="auto"
            maxLength={32000}
            value={draft.body}
            onChange={(e) => {
              update({ body: e.target.value, replyId });
              if (online && Date.now() - typingAt.current > 3500) {
                typingAt.current = Date.now();
                void mutate(
                  "chat.pulse",
                  { conversationId: id, typing: true, pulseAt: new Date().toISOString() },
                  crypto.randomUUID(),
                ).catch(() => {});
              }
            }}
          />
        </label>
        <details>
          <summary>Mention colleagues, attach files or share a document</summary>
          <label>
            Mention a member
            <select
              value=""
              onChange={(e) => {
                const m = members.find((p) => p.profileId === e.target.value);
                if (m)
                  update({
                    body: draft.body + "@" + m.name + " ",
                    mentions: [...new Set([...draft.mentions, m.profileId])],
                  });
              }}
            >
              <option value="">Choose a colleague</option>
              {members
                .filter((m) => m.profileId !== vault.profileId)
                .map((m) => (
                  <option key={m.profileId} value={m.profileId}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
          {draft.mentions.map((person) => (
            <button
              key={person}
              onClick={() => update({ mentions: draft.mentions.filter((p) => p !== person) })}
            >
              Remove mention · {members.find((m) => m.profileId === person)?.name ?? person}
            </button>
          ))}
          <label>
            Files (50 MiB each)
            <input
              type="file"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                void run(() => add(files));
              }}
            />
          </label>
          <Recorder disabled={!accepted} onRecord={(f) => void run(() => add([f], true))} />
          <label>
            Protected DMS share link
            <input type="url" value={draft.link} onChange={(e) => update({ link: e.target.value })} />
          </label>
        </details>
        {draft.uploads.map((f) => (
          <button
            key={f.id}
            onClick={() => {
              update({ uploads: draft.uploads.filter((x) => x.id !== f.id) });
              void vault.drop("compose-file/" + id + "/" + f.id).catch((e) => setProblem(errorText(e)));
            }}
          >
            Remove {f.name}
          </button>
        ))}
        <button
          className="chat-primary"
          disabled={!accepted || !(draft.body.trim() || draft.uploads.length || draft.link)}
          onClick={send}
        >
          {online ? "Send message" : "Queue on this device"}
        </button>
        {!accepted && <p>Accept the current communication terms in Privacy and safety to send.</p>}
      </fieldset>
    </div>
  );
}

export function useOutbox(vault: Vault, active: boolean, onChange: () => void) {
  const notify = useRef(onChange);
  useEffect(() => {
    notify.current = onChange;
  }, [onChange]);
  useEffect(() => {
    if (!active) return;
    const control = new AbortController();
    let working = false;
    const flush = async () => {
      if (working || control.signal.aborted || !navigator.onLine) return;
      working = true;
      const drain = async () => {
        const keys = await vault.list("out/");
        for (const key of keys) {
          control.signal.throwIfAborted();
          const intent = await vault.get<Intent>(key);
          if (!intent || intent.state !== "queued" || intent.session !== vault.session) continue;
          try {
            await vault.send(intent, control.signal);
          } catch (e) {
            if (control.signal.aborted || e instanceof TypeError || !navigator.onLine) return;
            const saved = await vault.get<Intent>(key);
            if (saved) await vault.save({ ...saved, state: "draft", issue: errorText(e) });
          }
          if (!control.signal.aborted) notify.current();
        }
      };
      try {
        if (navigator.locks)
          await navigator.locks.request("algt-chat-outbox-" + vault.account, { ifAvailable: true }, (lock) =>
            lock ? drain() : undefined,
          );
        else await drain();
      } catch {
        /* Storage or session may have closed. The durable intent remains pending. */
      } finally {
        working = false;
      }
    };
    void flush();
    const timer = setInterval(flush, 10000);
    window.addEventListener("online", flush);
    window.addEventListener("algt-chat-outbox", flush);
    return () => {
      control.abort();
      clearInterval(timer);
      window.removeEventListener("online", flush);
      window.removeEventListener("algt-chat-outbox", flush);
    };
  }, [vault, active]);
}
