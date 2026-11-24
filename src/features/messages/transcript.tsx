"use client";
import { useEffect, useState } from "react";
import { command, mutate, pages, ChatError } from "./client";
import { useLoad, useTask } from "./hooks";
import { Issue } from "./controls";
import { Report } from "./safety";
import { AttachmentItem } from "./media";
import { Composer } from "./composer";
import { Details } from "./details";
import {
  canChange,
  type Conversation,
  type Message,
  type Member,
  type Page,
  type Mode,
  type Profile,
} from "./model";
import { Vault, type History } from "./vault";

function MessageActions({
  m,
  c,
  mode,
  profile,
  vault,
  refresh,
  reply,
  members,
}: {
  m: Message;
  c: Conversation;
  mode: Mode;
  profile: Profile;
  vault: Vault;
  refresh: () => void;
  reply: () => void;
  members: Member[];
}) {
  const [open, setOpen] = useState(false),
    [action, setAction] = useState(""),
    [body, setBody] = useState(m.body ?? ""),
    [target, setTarget] = useState(""),
    [emoji, setEmoji] = useState("👍");
  const [mentionIds, setMentionIds] = useState<string[]>(m.mentions ?? []);
  const receivers = useLoad(action === "forward" ? m.id : "", (s) =>
    Promise.all(
      [false, true].map((archived) =>
        pages<Conversation>("chat.conversations", { mode: "participant", archived }, s),
      ),
    ).then(([active, archived]) => [...active, ...archived]),
  );
  const readers = useLoad(action === "readers" ? m.id : "", (s) =>
    pages<{ profileId: string; readAt: string }>("chat.readers", { messageId: m.id }, s),
  );
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!open) return;
    const remaining = Date.parse(m.sentAt) + 900000 - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [open, m.sentAt]);
  const { run, busy, issue } = useTask(),
    rights = canChange(m, c, profile.profileId, now);
  const change = (op: string, args: Record<string, unknown>) =>
    void run(async () => {
      await mutate(op, { messageId: m.id, ...args });
      setAction("");
      setOpen(false);
      refresh();
    });
  const ownReaction = m.reactions.some((r) => r.emoji === emoji && r.profileId === profile.profileId);
  return (
    <article
      className={"chat-message" + (m.senderProfileId === profile.profileId ? " chat-own" : "")}
      id={"message-" + m.id}
      tabIndex={-1}
    >
      <header>
        <strong>{m.senderName || "System notice"}</strong>
        <time dateTime={m.sentAt}>{new Date(m.sentAt).toLocaleString()}</time>
      </header>
      {m.forwarded && <small>Forwarded</small>}
      {m.pinned && <small>Pinned</small>}
      {m.starred && <small>Starred</small>}
      {m.reply && (
        <blockquote>{m.reply.deleted ? "Message deleted" : m.reply.body || "Reply to attachment"}</blockquote>
      )}
      {m.deleted && mode === "review" && <strong>Deleted · retained for review</strong>}
      <p dir="auto" className="chat-body">
        {m.deleted && mode === "participant" ? "Message deleted" : m.body}
      </p>
      {(!m.deleted || mode === "review") && (
        <>
          {m.attachments.map((a) => (
            <AttachmentItem
              key={a.id}
              item={a}
              mode={mode}
              vault={vault}
              incoming={m.senderProfileId !== profile.profileId}
            />
          ))}
          {m.dmsRef && (
            <a href={"/api/mobile/dms/shared#" + encodeURIComponent(m.dmsRef.token)}>
              Open protected document in ALGT ERP System
            </a>
          )}
        </>
      )}
      {m.editedAt && <small>Edited</small>}
      {m.reactions.length > 0 && (
        <p>
          {Array.from(new Set(m.reactions.map((r) => r.emoji))).map((e) => (
            <small key={e}>
              {e} {m.reactions.filter((r) => r.emoji === e).length}{" "}
            </small>
          ))}
        </p>
      )}
      <button
        aria-expanded={open}
        onClick={() => {
          setNow(Date.now());
          setOpen(!open);
        }}
      >
        Message actions
      </button>
      {open && (
        <div className="chat-panel">
          <div className="chat-actions">
            <Report kind="chat_message" id={m.id} label="Report message" />
            {mode === "participant" && (
              <>
                {!m.deleted && (
                  <>
                    <button onClick={reply}>Reply</button>
                    <button onClick={() => setAction("reaction")}>React</button>
                    {m.kind!=="notice"&&<button onClick={() => setAction("forward")}>Forward</button>}
                    <button disabled={busy} onClick={() => change("chat.star", { enabled: !m.starred })}>
                      {m.starred ? "Remove star" : "Star"}
                    </button>
                    {c.canPin && (
                      <button disabled={busy} onClick={() => change("chat.pin", { enabled: !m.pinned })}>
                        {m.pinned ? "Unpin" : "Pin"}
                      </button>
                    )}
                  </>
                )}
                {rights.edit && (
                  <button
                    onClick={() => {
                      setAction("edit");
                      setBody(m.body ?? "");
                      setMentionIds(m.mentions ?? []);
                    }}
                  >
                    Edit
                  </button>
                )}
                {rights.remove && <button onClick={() => setAction("delete")}>Delete</button>}
                {m.senderProfileId === profile.profileId && (
                  <button onClick={() => setAction("readers")}>Read receipts</button>
                )}
              </>
            )}
          </div>
          {action === "edit" && (
            <>
              <label>
                Edited message
                <textarea
                  dir="auto"
                  maxLength={32000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </label>
              <label>
                Mentions
                <select
                  multiple
                  value={mentionIds}
                  onChange={(e) => setMentionIds(Array.from(e.target.selectedOptions, (o) => o.value))}
                >
                  {members.map((p) => (
                    <option key={p.profileId} value={p.profileId}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={busy || !body.trim()}
                onClick={() =>
                  change("chat.edit", { body, expectedRevision: m.revision, mentionProfileIds: mentionIds })
                }
              >
                Save edit
              </button>
            </>
          )}
          {action === "delete" && (
            <>
              <p>Participants will see “Message deleted”. Authorized history reviewers retain access.</p>
              <button disabled={busy} onClick={() => change("chat.delete", { expectedRevision: m.revision })}>
                Confirm delete
              </button>
            </>
          )}
          {action === "reaction" && (
            <>
              <label>
                Emoji
                <input value={emoji} maxLength={32} onChange={(e) => setEmoji(e.target.value)} />
              </label>
              <button
                disabled={busy || !emoji.trim()}
                onClick={() => change("chat.reaction", { emoji, enabled: !ownReaction })}
              >
                {ownReaction ? "Remove reaction" : "Add reaction"}
              </button>
            </>
          )}
          {action === "forward" && (
            <>
              <Issue text={receivers.issue} />
              <label>
                Destination
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">Choose a conversation</option>
                  {receivers.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={busy || !target}
                onClick={() =>
                  void run(async () => {
                    await mutate("chat.forward", {
                      sourceMessageId: m.id,
                      destinationConversationId: target,
                      expectedRevision: m.revision,
                    });
                    setOpen(false);
                    refresh();
                  })
                }
              >
                Forward message
              </button>
            </>
          )}
          {action === "readers" && (
            <>
              <Issue text={readers.issue} />
              {readers.data?.length === 0 && <p>No read receipts yet.</p>}
              <ul>
                {readers.data?.map((r) => (
                  <li key={r.profileId}>
                    {members.find((p) => p.profileId === r.profileId)?.name ?? "ERP user " + r.profileId} ·{" "}
                    {new Date(r.readAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            </>
          )}
          <Issue text={issue} />
        </div>
      )}
    </article>
  );
}
interface View extends History {
  members: Member[];
  offline: boolean;
}
export function Transcript({
  id,
  mode,
  profile,
  vault,
  accepted,
  termsVersion,
  back,
  notify,
  jump,
}: {
  id: string;
  mode: Mode;
  profile: Profile;
  vault: Vault;
  accepted: boolean;
  termsVersion?: string;
  back: () => void;
  notify: () => void;
  jump?: string;
}) {
  const [details, setDetails] = useState(false),
    [reply, setReply] = useState<Message>(),
    [depth, setDepth] = useState(1),
    [pinned, setPinned] = useState(false);
  const log = useLoad<View>(
    JSON.stringify([id, mode, depth, jump, pinned]),
    async (signal) => {
      const cacheKey = "cache/" + id + "/history";
      if (!navigator.onLine && mode === "participant") {
        const cached = await vault.get<History>(cacheKey);
        if (cached?.session !== vault.session) throw Error("No authorized offline history for this session.");
        return { ...cached, members: [], offline: true };
      }
      try {
        const args = { conversationId: id, mode };
        const [conversation, members, first] = await Promise.all([
          command<Conversation>("chat.conversation", args, signal),
          pages<Member>("chat.members", args, signal),
          command<Page<Message>>("chat.messages", args, signal),
        ]);
        let cursor = first.nextCursor;
        const messages = first.items.slice();
        const seen = new Set<string>();
        for (
          let n = 1;
          cursor && (n < depth || pinned || (jump && !messages.some((m) => m.id === jump)));
          n++
        ) {
          if (seen.has(cursor)) throw Error("History pagination did not advance.");
          seen.add(cursor);
          const page = await command<Page<Message>>("chat.messages", { ...args, cursor }, signal);
          messages.push(...page.items);
          cursor = page.nextCursor;
        }
        const history = {
          session: vault.session,
          conversation,
          messages: messages.reverse(),
          nextCursor: cursor,
        };
        if (mode === "participant") {
          signal.throwIfAborted();
          // Reconciled tombstones cannot retain an accessible cached media file.
          const prior = await vault.get<History>(cacheKey);
          for (const m of messages.filter((m) => m.deleted)) {
            for (const file of prior?.messages.find((p) => p.id === m.id)?.attachments ?? [])
              await vault.clear("cache/" + id + "/media/" + vault.session + "/" + file.id);
          }
          await vault.put(cacheKey, history);
        }
        return { ...history, members, offline: false };
      } catch (e) {
        if (e instanceof ChatError && [401, 403, 404].includes(e.status))
          await vault.clear("cache/" + id + "/");
        throw e;
      }
    },
    12000,
  );
  const latest = log.data?.messages.at(-1)?.seq;
  const [readIssue, setReadIssue] = useState("");
  useEffect(() => {
    if (!latest || mode !== "participant" || log.data?.offline) return;
    const control = new AbortController();
    const read = () => {
      if (document.hidden || !document.hasFocus()) return;
      void mutate("chat.read", { conversationId: id, upToSeq: latest }, crypto.randomUUID(), control.signal)
        .then(() => {
          if (!control.signal.aborted) {
            setReadIssue("");
            notify();
          }
        })
        .catch((e) => {
          if (!control.signal.aborted) setReadIssue(e.message);
        });
    };
    read();
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", read);
    return () => {
      control.abort();
      window.removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", read);
    };
  }, [id, latest, mode, log.data?.offline, notify]);
  const activity = useLoad(
    mode === "participant" && log.data && !log.data.offline ? id : "",
    async (signal) => {
      await mutate(
        "chat.pulse",
        { conversationId: id, typing: false, pulseAt: new Date().toISOString() },
        crypto.randomUUID(),
        signal,
      );
      return command<{ items: { profileId: string; online: boolean; typing: boolean }[] }>(
        "chat.activity",
        { conversationId: id },
        signal,
      );
    },
    5000,
  );
  const found = Boolean(jump && log.data?.messages.some((m) => m.id === jump));
  useEffect(() => {
    if (found && jump) document.getElementById("message-" + jump)?.focus();
  }, [jump, found]);
  const data = log.data,
    refresh = () => {
      log.refresh();
      notify();
    };
  return (
    <section className="chat-thread">
      <div className="chat-actions">
        <button onClick={back}>Back to inbox</button>
        <button onClick={refresh}>Refresh conversation</button>
      </div>
      <Issue text={log.issue || readIssue} />
      {!data && !log.issue && <p role="status">Loading conversation…</p>}
      {data && (
        <>
          <header className="chat-head">
            <div>
              <h2>{data.conversation.title}</h2>
              <small>
                {mode === "review"
                  ? "Authorized history review"
                  : data.offline
                    ? "Offline · cached history"
                    : data.conversation.kind === "group"
                      ? "Group conversation"
                      : "Private conversation"}
              </small>
              {mode === "participant" && (
                <small>
                  {activity.data?.items
                    .filter((a) => a.profileId !== profile.profileId)
                    .map(
                      (a) =>
                        (data.members.find((p) => p.profileId === a.profileId)?.name ?? "Member") +
                        (a.typing ? " is typing…" : " is online"),
                    )
                    .join(" · ")}
                </small>
              )}
            </div>
            <button onClick={() => setDetails(!details)}>
              {details ? "Show messages" : "Conversation details"}
            </button>
          </header>
          {details ? (
            <Details
              c={data.conversation}
              mode={mode}
              members={data.members}
              profile={profile}
              vault={vault}
              refresh={refresh}
              leave={back}
            />
          ) : (
            <>
              {jump && !found && <p role="status">The selected message is unavailable.</p>}
              <button onClick={() => setPinned(!pinned)}>
                {pinned ? "Show all messages" : "Show pinned messages"}
              </button>
              {data.nextCursor && !data.offline && (
                <button onClick={() => setDepth((n) => n + 1)}>Load earlier messages</button>
              )}
              <div className="chat-transcript" aria-label="Message history">
                {data.messages
                  .filter((m) => !pinned || m.pinned)
                  .map((m) => (
                    <MessageActions
                      key={m.id}
                      m={m}
                      c={data.conversation}
                      members={data.members}
                      profile={profile}
                      mode={mode}
                      vault={vault}
                      refresh={refresh}
                      reply={() => setReply(m)}
                    />
                  ))}
                {data.messages.filter((m) => !pinned || m.pinned).length === 0 && (
                  <p>{pinned ? "No pinned messages." : "No messages yet."}</p>
                )}
              </div>
              {mode === "participant" && (
                <Composer
                  id={id}
                  members={data.members}
                  vault={vault}
                  reply={reply}
                  resetReply={() => setReply(undefined)}
                  accepted={accepted}
                  termsVersion={termsVersion}
                  refresh={refresh}
                />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
