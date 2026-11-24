"use client";
import { useState } from "react";
import { command, mutate } from "./client";
import { useLoad, useTask } from "./hooks";
import { Issue } from "./controls";
import type { Open } from "./discovery";
type Alert = {
  eventId: string;
  id: string;
  kind: string;
  category: string;
  read?: boolean;
  label?: string;
  preview?: string;
  createdAt: string;
  conversationId?: string;
  path?: string;
};
const labels: Record<string, string> = {
  groups: "Group messages",
  direct: "Private messages",
  mentions: "Mentions",
  erp: "ERP alerts",
  intake: "Document intake",
  leaveStart: "Leave start",
  timesheet: "Timesheets",
  label: "Show sender or group",
  textPreview: "Include message text in notifications",
  vibrate: "Vibration",
  sound: "Sound",
};
export function Alerts({ open, manualRefresh = false }: { open: Open; manualRefresh?: boolean }) {
  const [filter, setFilter] = useState("messages"),
    [cursor, setCursor] = useState(""),
    [reply, setReply] = useState(""),
    [selected, setSelected] = useState("");
  const list = useLoad(
    JSON.stringify([filter, cursor]),
    (s) =>
      command<{ items: Alert[]; nextCursor: string | null }>(
        "notifications.webList",
        { filter, ...(cursor && { cursor }) },
        s,
      ),
    manualRefresh ? 0 : 20000,
    manualRefresh ? "pilot" : "window",
  );
  const prefs = useLoad(
    "prefs",
    (s) => command<Record<string, boolean>>("notifications.preferences", {}, s),
    0,
    manualRefresh ? "pilot" : "window",
  );
  const task = useTask();
  const act = (op: string, id: string, extra = {}) =>
    void task.run(async () => {
      await mutate(op, { eventId: id, ...extra });
      list.refresh();
      setSelected("");
      setReply("");
      window.dispatchEvent(new Event("algt-chat-read"));
    });
  return (
    <section className="chat-settings">
      <h2>Alerts</h2>
      <label>
        Filter
        <select
          value={filter}
          onChange={(e) => {
            setCursor("");
            setFilter(e.target.value);
          }}
        >
          <option value="messages">Messages</option>
          <option value="erp">ERP</option>
          <option value="all">All alerts</option>
        </select>
      </label>
      <Issue text={list.issue || task.issue} />
      {manualRefresh && <button onClick={list.refresh}>Refresh alerts</button>}
      <ul className="chat-list">
        {list.data?.items.map((a) => (
          <li key={a.eventId}>
            <div>
              <strong>{a.label || a.category}</strong>
              <small>
                {new Date(a.createdAt).toLocaleString()}
                {a.read ? " · Read" : ""}
              </small>
            </div>
            <button
              disabled={task.busy}
              onClick={() =>
                void task.run(async () => {
                  const item = await command<Alert>("notifications.webResolve", { eventId: a.eventId });
                  if (item.kind === "chat" && item.conversationId) open(item.conversationId, item.id);
                  else if (
                    item.path &&
                    item.path.startsWith("/") &&
                    !item.path.startsWith("//") &&
                    new URL(item.path, location.origin).origin === location.origin
                  )
                    location.assign(item.path);
                  else throw Error("Open this alert in the ALGT ERP System Android app.");
                })
              }
            >
              Open
            </button>
            {!a.read && (
              <button disabled={task.busy} onClick={() => act("notifications.webMarkRead", a.eventId)}>
                Mark as read
              </button>
            )}
            {a.kind === "chat" && (
              <button
                onClick={() => {
                  setSelected(a.eventId);
                  setReply("");
                }}
              >
                Reply
              </button>
            )}
            {selected === a.eventId && (
              <>
                <label>
                  Reply
                  <textarea maxLength={4096} value={reply} onChange={(e) => setReply(e.target.value)} />
                </label>
                <button
                  disabled={!reply.trim() || task.busy}
                  onClick={() => act("notifications.reply", a.eventId, { body: reply })}
                >
                  Send reply
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {list.data?.items.length === 0 && <p>No alerts in this view.</p>}
      {cursor && <button onClick={() => setCursor("")}>Latest alerts</button>}
      {list.data?.nextCursor && (
        <button onClick={() => setCursor(list.data!.nextCursor!)}>Earlier alerts</button>
      )}
      <details>
        <summary>Alert preferences</summary>
        <Issue text={prefs.issue} />
        {Object.entries(labels).map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              disabled={task.busy || !prefs.data}
              checked={prefs.data?.[key] ?? key !== "textPreview"}
              onChange={(e) => {
                const enabled = e.target.checked;
                void task.run(async () => {
                  await mutate("notifications.setPreferences", { settings: { [key]: enabled } });
                  prefs.refresh();
                });
              }}
            />
            {label}
          </label>
        ))}
      </details>
    </section>
  );
}
