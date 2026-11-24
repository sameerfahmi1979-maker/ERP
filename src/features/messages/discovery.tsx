"use client";
import { useState } from "react";
import { command, mutate } from "./client";
import { useLoad, useTask } from "./hooks";
import { Issue, People, Dates } from "./controls";
import {
  dateInterval,
  type Profile,
  type Conversation,
  type WorkIdentity,
  type Mode,
  type Page,
  type SearchHit,
  type Message,
} from "./model";
import { Block, Report } from "./safety";
export type Open = (thread: string, message?: string) => void;
export function Directory({
  profile,
  accepted,
  open,
  initial,
}: {
  profile: Profile;
  accepted: boolean;
  open: Open;
  initial?: WorkIdentity;
}) {
  const [selected, setSelected] = useState<WorkIdentity | undefined>(initial),
    [members, setMembers] = useState<WorkIdentity[]>([]),
    [group, setGroup] = useState(false),
    [name, setName] = useState("");
  const { run, busy, issue } = useTask();
  return (
    <section className="chat-settings">
      <h2>{group ? "New group" : "Work directory"}</h2>
      {profile.canCreateGroup && (
        <button onClick={() => setGroup(!group)}>{group ? "Cancel group creation" : "Create a group"}</button>
      )}
      <People
        exclude={[profile.profileId, ...(group ? members.map((m) => m.profileId) : [])]}
        label={group ? "Add" : "Select"}
        onPick={(person) => (group ? setMembers([...members, person]) : setSelected(person))}
      />
      {group ? (
        <fieldset disabled={busy}>
          <legend>Group details</legend>
          <label>
            Group name
            <input maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {members.map((p) => (
            <button
              key={p.profileId}
              onClick={() => setMembers(members.filter((m) => m.profileId !== p.profileId))}
            >
              Remove {p.name}
            </button>
          ))}
          <button
            disabled={!accepted || !name.trim()}
            onClick={() =>
              void run(async () => {
                const c = await mutate<Conversation>("chat.groupCreate", {
                  name,
                  memberProfileIds: members.map((p) => p.profileId),
                });
                open(c.id);
              })
            }
          >
            Create group
          </button>
        </fieldset>
      ) : (
        selected && (
          <div className="chat-panel">
            <h3>{selected.name}</h3>
            <p>
              {[selected.jobTitle, selected.companyName, selected.branchName].filter(Boolean).join(" · ")}
            </p>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const c = await mutate<Conversation>("chat.direct", { peerProfileId: selected.profileId });
                  open(c.id);
                })
              }
            >
              Open private conversation
            </button>
            <Report kind="user" id={selected.profileId} label="Report colleague" />
            <Block key={selected.profileId} person={selected} />
          </div>
        )
      )}
      <Issue text={issue} />
    </section>
  );
}
export function Search({ mode, open, onPerson }: { mode: Mode; open: Open; onPerson: (id: string) => void }) {
  const [query, setQuery] = useState(""),
    [sender, setSender] = useState<WorkIdentity>(),
    [from, setFrom] = useState(""),
    [until, setUntil] = useState(""),
    [args, setArgs] = useState<Record<string, unknown>>(),
    [cursor, setCursor] = useState("");
  const { run, issue } = useTask();
  const found = useLoad(args ? JSON.stringify([mode, args, cursor]) : "", (s) =>
    command<Page<SearchHit>>("chat.search", { ...args, mode, ...(cursor && { cursor }) }, s),
  );
  return (
    <section className="chat-settings">
      <h2>Search {mode === "review" ? "authorized history" : "messages"}</h2>
      <label>
        People, groups, message text or filenames
        <input type="search" value={query} maxLength={256} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <details>
        <summary>{sender ? "Sender · " + sender.name : "Filter by sender"}</summary>
        <People onPick={setSender} />
        {sender && <button onClick={() => setSender(undefined)}>Clear sender</button>}
      </details>
      <Dates from={from} until={until} setFrom={setFrom} setUntil={setUntil} />
      <button
        disabled={!query.trim()}
        onClick={() =>
          void run(async () => {
            setCursor("");
            setArgs({
              query,
              ...dateInterval(from, until),
              ...(sender && { senderProfileId: sender.profileId }),
            });
          })
        }
      >
        Search
      </button>
      <Issue text={issue || found.issue} />
      {found.data?.items.length === 0 && <p>No matches.</p>}
      <ul className="chat-list">
        {found.data?.items.map((hit) => (
          <li key={hit.kind + hit.id}>
            <div>
              <strong>{hit.label}</strong>
              <small>{hit.snippet}</small>
            </div>
            {(hit.conversationId || mode === "participant") && (
              <button
                onClick={() =>
                  hit.conversationId ? open(hit.conversationId, hit.messageId) : onPerson(hit.id)
                }
              >
                Open
              </button>
            )}
          </li>
        ))}
      </ul>
      {cursor && <button onClick={() => setCursor("")}>First results</button>}
      {found.data?.nextCursor && (
        <button onClick={() => setCursor(found.data!.nextCursor!)}>More results</button>
      )}
    </section>
  );
}
export function Stars({ open }: { open: Open }) {
  const [cursor, setCursor] = useState("");
  const found = useLoad("stars" + cursor, (s) =>
    command<Page<Message>>("chat.stars", cursor ? { cursor } : {}, s),
  );
  return (
    <section className="chat-settings">
      <h2>Starred messages</h2>
      <Issue text={found.issue} />
      {found.data?.items.length === 0 && <p>No starred messages.</p>}
      <ul className="chat-list">
        {found.data?.items.map((m) => (
          <li key={m.id}>
            <div>
              <strong>{m.senderName}</strong>
              <small>{m.body || m.attachments[0]?.filename}</small>
            </div>
            <button onClick={() => open(m.conversationId, m.id)}>Open</button>
          </li>
        ))}
      </ul>
      {cursor && <button onClick={() => setCursor("")}>First page</button>}
      {found.data?.nextCursor && (
        <button onClick={() => setCursor(found.data!.nextCursor!)}>More starred messages</button>
      )}
    </section>
  );
}
