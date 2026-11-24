"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { command, pages, ChatError, mutate } from "./client";
import { useLoad, useTask } from "./hooks";
import { Issue } from "./controls";
import { Safety } from "./safety";
import { Budget } from "./budget";
import { Alerts } from "./alerts";
import {
  rememberMessagingSession,
  clearMessagingSession,
  sealCache,
  bindTransportSession,
} from "./offline-session";
import { Directory, Search, Stars } from "./discovery";
import { Transcript } from "./transcript";
import { useOutbox } from "./composer";
import { Vault, unlockVault } from "./vault";
import { continuationState, retireContinuation } from "./continuation";
import type { Mode, Conversation, Profile, Policy, WorkIdentity } from "./model";
import "./messages.css";

type Tab = "inbox" | "directory" | "search" | "stars" | "alerts" | "settings";
type Props = {
  account: string;
  session: string;
  expectedProfile: string;
  initialThread?: string;
  initialMessage?: string;
  initialReview?: boolean;
  employeeId?: string;
};
export function Messages({
  account,
  session,
  expectedProfile,
  initialThread,
  initialMessage,
  initialReview = false,
  employeeId,
}: Props) {
  const vault = useMemo(
    () => new Vault(account, session, expectedProfile, true),
    [account, session, expectedProfile],
  );
  const [tab, setTab] = useState<Tab>(employeeId ? "directory" : "inbox"),
    [mode, setMode] = useState<Mode>(initialReview ? "review" : "participant");
  const [id, setId] = useState(initialThread ?? ""),
    [jump, setJump] = useState(initialMessage),
    [archived, setArchived] = useState(false),
    [filter, setFilter] = useState("");
  const [locked, setLocked] = useState(false),
    [offlineIssue, setOfflineIssue] = useState("");
  const task = useTask();
  useEffect(() => {
    bindTransportSession(session);
  }, [session]);
  useEffect(() => {
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("algt-auth-state");
    if (channel)
      channel.onmessage = () => {
        clearMessagingSession();
        setLocked(true);
      };
    const onRetirement = (e: StorageEvent) => {
      if (e.key === "algt-chat-retired/" + session) {
        clearMessagingSession();
        setLocked(true);
      }
    };
    window.addEventListener("storage", onRetirement);
    return () => {
      channel?.close();
      window.removeEventListener("storage", onRetirement);
    };
  }, [session]);
  const actor = useLoad(
    locked ? "" : session,
    async (s) => {
      if (!navigator.onLine) {
        const saved = await vault.get<{ session: string; profile: Profile }>("profile");
        if (saved?.session === session) return saved.profile;
        throw Error("Sign in online to unlock this device's chat.");
      }
      try {
        const guard = await continuationState();
        const { webCache, ...profile } = await command<
          Profile & { webCache?: { version: number; wrappingKey: string | null; reason: string } }
        >("communications.profile", {}, s);
        if (profile.profileId !== expectedProfile)
          throw new ChatError(401, "The active ERP account changed.");
        if (!profile.chat.eligible || !profile.chat.configured) {
          sealCache();
          if (guard.enrollment?.session === session) await retireContinuation(session);
          return profile;
        }
        if (webCache?.version !== 1 || webCache.reason !== "available" || !webCache.wrappingKey) {
          sealCache();
          if (guard.enrollment?.session === session) await retireContinuation(session);
          return {
            ...profile,
            chat: {
              ...profile.chat,
              availability: "held",
              reason: "Secure device storage is unavailable. Check the ERP cache configuration and session.",
            },
          };
        }
        try {
          const cookieName =
            "sb-" + new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0] + "-auth-token";
          await unlockVault(account, session, webCache.wrappingKey, s, {
            epoch: guard.epoch,
            binding: { account, session, expectedProfile },
            cookieName,
          });
        } catch (e) {
          if (!s.aborted) sealCache();
          throw e;
        }
        rememberMessagingSession({ account, session, expectedProfile });
        if ("serviceWorker" in navigator)
          void navigator.serviceWorker
            .register("/messages-offline-worker.js", { scope: "/messages" })
            .then(() => setOfflineIssue(""))
            .catch(() =>
              setOfflineIssue(
                "Offline reload support could not be installed. Keep this page open to use its cache.",
              ),
            );
        else setOfflineIssue("This browser supports offline chat only while the page stays open.");
        await vault.put("profile", { session, profile });
        return profile;
      } catch (e) {
        if (e instanceof ChatError && [401, 403, 404].includes(e.status)) {
          sealCache();
          await retireContinuation(session);
          await vault.drop("profile");
          await vault.clear("cache/");
        }
        throw e;
      }
    },
    30000,
  );
  const reseal = actor.refresh;
  useEffect(() => {
    window.addEventListener("algt-chat-reseal", reseal);
    return () => window.removeEventListener("algt-chat-reseal", reseal);
  }, [reseal]);
  const enabled = Boolean(
    actor.data?.chat.eligible && actor.data.chat.configured && actor.data.chat.availability !== "held",
  );
  const policy = useLoad(
    actor.data ? session : "",
    async (s) => {
      if (!navigator.onLine) {
        const p = await vault.get<{ session: string; policy: Policy }>("policy");
        if (p?.session === session) return p.policy;
        throw Error("Connect to check communication terms.");
      }
      const p = await command<Policy>("policy.status", {}, s);
      if (enabled) await vault.put("policy", { session, policy: p });
      return p;
    },
    30000,
  );
  const scope = mode === "participant" || Boolean(actor.data?.canReviewHistory);
  const list = useLoad(
    enabled && scope ? JSON.stringify([session, mode, archived]) : "",
    async (s) => {
      const cache = "cache/inbox/" + String(archived);
      if (!navigator.onLine && mode === "participant") {
        const stored = await vault.get<{ session: string; items: Conversation[] }>(cache);
        if (stored?.session === session) return stored.items;
        throw Error("No inbox is cached for this session.");
      }
      try {
        if (mode === "review") return pages<Conversation>("chat.conversations", { mode }, s);
        const [inbox, archive] = await Promise.all(
          [false, true].map((a) => pages<Conversation>("chat.conversations", { mode, archived: a }, s)),
        );
        await vault.reconcile([...inbox, ...archive], s);
        await Promise.all([
          vault.put("cache/inbox/false", { session, items: inbox }),
          vault.put("cache/inbox/true", { session, items: archive }),
        ]);
        return archived ? archive : inbox;
      } catch (e) {
        if (e instanceof ChatError && [401, 403, 404].includes(e.status)) await vault.clear("cache/");
        throw e;
      }
    },
    12000,
  );
  const refresh = list.refresh;
  const notify = useCallback(() => {
    refresh();
    window.dispatchEvent(new Event("algt-chat-read"));
  }, [refresh]);
  useOutbox(vault, Boolean(enabled && policy.data?.accepted && !locked), notify);
  const linked = useLoad(employeeId && enabled && !locked ? employeeId : "", (s) =>
    command<WorkIdentity | null>("chat.linkedIdentity", { employeeId }, s),
  );
  const open = (thread: string, message?: string) => {
    setId(thread);
    setJump(message);
    setTab("inbox");
  };
  if (locked) return <p role="alert">Your ERP session changed. Sign in to open Messages.</p>;
  return (
    <main className="chat-desk">
      <header className="chat-title">
        <h1>Messages</h1>
        {actor.data?.canReviewHistory && (
          <label>
            Workspace
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as Mode);
                setId("");
                setTab("inbox");
                setArchived(false);
              }}
            >
              <option value="participant">My conversations</option>
              <option value="review">Authorized history review</option>
            </select>
          </label>
        )}
      </header>
      {!actor.data ? (
        <>
          <Issue text={actor.issue} />
          {actor.issue ? (
            <button onClick={actor.refresh}>Retry connection</button>
          ) : (
            <p role="status">Checking ERP access…</p>
          )}
        </>
      ) : (
        <>
          <nav className="chat-tabs" aria-label="Messaging tools">
            {(["inbox", "directory", "search", "stars", "alerts", "settings"] as Tab[])
              .filter((t) => mode === "participant" || !["directory", "stars", "alerts"].includes(t))
              .map((t) => (
                <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
                  {
                    {
                      inbox: "Inbox",
                      directory: "Directory",
                      search: "Search",
                      stars: "Starred",
                      alerts: "Alerts",
                      settings: "Privacy and settings",
                    }[t]
                  }
                </button>
              ))}
          </nav>
          <Issue text={task.issue || policy.issue} />
          {tab === "settings" ? (
            <>
              <Safety policy={policy.data} refresh={policy.refresh} global={actor.data.isGlobalSystemAdmin} />
              <Budget />
              <Issue text={offlineIssue} />
              <button
                disabled={task.busy}
                onClick={() =>
                  void task.run(async () => {
                    await vault.clear("cache/");
                    setId("");
                  })
                }
              >
                Clear cached conversations and files on this device
              </button>
            </>
          ) : !enabled ? (
            <section className="chat-settings">
              <h2>Messaging is on hold</h2>
              <p>{actor.data.chat.reason.replaceAll("_", " ")}</p>
              <button onClick={actor.refresh}>Check availability</button>
            </section>
          ) : !scope ? (
            <p role="alert">History review is unavailable for this account.</p>
          ) : tab === "directory" ? (
            <>
              <Issue text={linked.issue} />
              {(!employeeId || linked.data !== undefined) && (
                <Directory
                  key={linked.data?.profileId ?? "directory"}
                  initial={linked.data ?? undefined}
                  profile={actor.data}
                  accepted={Boolean(policy.data?.accepted)}
                  open={open}
                />
              )}
              {employeeId && linked.data === null && (
                <p>This employee has no available ERP messaging identity.</p>
              )}
            </>
          ) : tab === "search" ? (
            <Search
              mode={mode}
              open={open}
              onPerson={(peerProfileId) =>
                void task.run(async () => {
                  const c = await mutate<Conversation>("chat.direct", { peerProfileId });
                  open(c.id);
                })
              }
            />
          ) : tab === "alerts" ? (
            <Alerts open={open} />
          ) : tab === "stars" ? (
            <Stars open={open} />
          ) : (
            <div className={"chat-layout" + (id ? " chat-selected" : "")}>
              <aside className="chat-inbox">
                <h2>{mode === "review" ? "Review history" : "Conversations"}</h2>
                <label>
                  Filter conversations
                  <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} />
                </label>
                {mode === "participant" && (
                  <label>
                    <input
                      type="checkbox"
                      checked={archived}
                      onChange={(e) => setArchived(e.target.checked)}
                    />
                    Archived conversations
                  </label>
                )}
                <Issue text={list.issue} />
                {list.issue && <button onClick={refresh}>Retry inbox</button>}
                {!list.data && !list.issue && <p role="status">Loading conversations…</p>}
                {list.data && (
                  <ul>
                    {list.data
                      .filter((c) => c.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))
                      .map((c) => (
                        <li key={c.id}>
                          <button
                            className="chat-thread-choice"
                            aria-current={c.id === id ? "true" : undefined}
                            onClick={() => open(c.id)}
                          >
                            <strong>{c.title}</strong>
                            <small>
                              {c.kind === "group" ? "Group" : "Private"}
                              {c.muted ? " · Muted" : ""}
                              {c.unreadCount > 0 ? " · " + c.unreadCount + " unread" : ""}
                            </small>
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
                {list.data?.length === 0 && (
                  <p>{archived ? "No archived conversations." : "No conversations yet."}</p>
                )}
              </aside>
              {id ? (
                <Transcript
                  key={mode + id}
                  id={id}
                  mode={mode}
                  profile={actor.data}
                  accepted={Boolean(policy.data?.accepted)}
                  termsVersion={policy.data?.currentVersion ?? undefined}
                  vault={vault}
                  back={() => {
                    setId("");
                    setJump(undefined);
                    refresh();
                  }}
                  notify={notify}
                  jump={jump}
                />
              ) : (
                <section className="chat-empty">
                  <h2>Select a conversation</h2>
                  {mode === "participant" && (
                    <button onClick={() => setTab("directory")}>Find a colleague</button>
                  )}
                </section>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
