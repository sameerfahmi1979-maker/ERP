"use client";
import { useState } from "react";
import { command, mutate, exportChat } from "./client";
import { useLoad, useTask } from "./hooks";
import { Dates, Issue, People } from "./controls";
import { Block, Report } from "./safety";
import { AttachmentItem } from "./media";
import {
  dateInterval,
  type Member,
  type Mode,
  type Conversation,
  type Profile,
  type Page,
  type Attachment,
} from "./model";
import type { Vault } from "./vault";

export function Details({
  c,
  mode,
  members,
  profile,
  vault,
  refresh,
  leave,
}: {
  c: Conversation;
  mode: Mode;
  members: Member[];
  profile: Profile;
  vault: Vault;
  refresh: () => void;
  leave: () => void;
}) {
  const [name, setName] = useState(c.title),
    [from, setFrom] = useState(""),
    [until, setUntil] = useState(""),
    [media, setMedia] = useState(false),
    [cursor, setCursor] = useState(""),
    [kind, setKind] = useState("");
  const { run, busy, issue } = useTask();
  const files = useLoad(media ? JSON.stringify([c.id, mode, kind, cursor, c.changeSeq]) : "", (s) =>
    command<Page<Attachment>>(
      "chat.media",
      { conversationId: c.id, mode, ...(cursor && { cursor }), ...(kind && { kind }) },
      s,
    ),
  );
  const change = (action: string, args = {}) =>
    void run(async () => {
      await mutate("chat.groupChange", {
        conversationId: c.id,
        expectedRevision: c.revision,
        action,
        ...args,
      });
      if (action === "leave") leave();
      else refresh();
    });
  return (
    <aside className="chat-settings">
      <h2>Conversation details</h2>
      {mode === "participant" && (
        <div className="chat-actions">
          {(["muted", "archived"] as const).map((k) => (
            <button
              key={k}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await mutate("chat.personal", { conversationId: c.id, [k]: !c[k] });
                  refresh();
                })
              }
            >
              {k === "muted" ? (c.muted ? "Unmute" : "Mute") : c.archived ? "Unarchive" : "Archive"}
            </button>
          ))}
        </div>
      )}
      <h3>People</h3>
      <ul className="chat-list">
        {members.map((m) => (
          <li key={m.profileId}>
            <div>
              <strong>{m.name}</strong>
              <small>{m.role}</small>
            </div>
            {m.profileId !== profile.profileId && (
              <div>
                <Report kind="user" id={m.profileId} label="Report user" />
                <Block person={m} />
              </div>
            )}
            {c.kind === "group" && m.role !== "owner" && (
              <div>
                {c.canManageAdmins && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      change(m.role === "admin" ? "demote" : "promote", { targetProfileId: m.profileId })
                    }
                  >
                    {m.role === "admin" ? "Remove admin role" : "Appoint admin"}
                  </button>
                )}
                {c.canManageMembers &&
                  m.profileId !== profile.profileId &&
                  (m.role !== "admin" || c.ownerProfileId === profile.profileId) && (
                    <button
                      disabled={busy}
                      onClick={() => change("remove", { targetProfileId: m.profileId })}
                    >
                      Remove member
                    </button>
                  )}
                {profile.isGlobalSystemAdmin && (
                  <button
                    disabled={busy}
                    onClick={() => change("replaceOwner", { targetProfileId: m.profileId })}
                  >
                    Replace absent or inactive owner
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {c.kind === "group" && (
        <>
          <Report kind="chat_thread" id={c.id} label="Report group" />
          {c.canManageMembers && (
            <>
              <label>
                Group name
                <input maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <button
                disabled={busy || !name.trim() || name === c.title}
                onClick={() => change("rename", { name })}
              >
                Save group name
              </button>
              <details>
                <summary>Add group member</summary>
                <People
                  exclude={members.map((m) => m.profileId)}
                  onPick={(p) => change("add", { targetProfileId: p.profileId })}
                />
              </details>
            </>
          )}
          {mode === "participant" && (
            <details>
              <summary>Leave group</summary>
              <p>You will lose member access to this conversation and its files.</p>
              <button disabled={busy} onClick={() => change("leave")}>
                Confirm leave
              </button>
            </details>
          )}
        </>
      )}
      <h3>Shared media and files</h3>
      <button onClick={() => setMedia(!media)}>{media ? "Close files" : "Browse files"}</button>
      {media && (
        <>
          <label>
            File type
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setCursor("");
              }}
            >
              {["", "file", "image", "audio", "video", "voice"].map((k) => (
                <option key={k} value={k}>
                  {k || "All files"}
                </option>
              ))}
            </select>
          </label>
          <Issue text={files.issue} />
          {files.data?.items.map((a) => (
            <AttachmentItem key={a.id} item={a} mode={mode} vault={vault} />
          ))}
          {files.data?.items.length === 0 && <p>No shared files.</p>}
          {cursor && <button onClick={() => setCursor("")}>Latest files</button>}
          {files.data?.nextCursor && (
            <button onClick={() => setCursor(files.data!.nextCursor!)}>More files</button>
          )}
        </>
      )}
      <details>
        <summary>Export PDF transcript and files</summary>
        <p>
          Select dates or leave both blank for all accessible history. Dates use{" "}
          {Intl.DateTimeFormat().resolvedOptions().timeZone}.
        </p>
        <Dates from={from} until={until} setFrom={setFrom} setUntil={setUntil} />
        <button
          disabled={busy}
          onClick={() =>
            void run(() => exportChat({ conversationId: c.id, mode, ...dateInterval(from, until) }))
          }
        >
          Download ZIP
        </button>
      </details>
      <button
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await vault.clear("cache/" + c.id + "/");
            leave();
          })
        }
      >
        Clear cached history and files on this device
      </button>
      <Issue text={issue} />
    </aside>
  );
}
