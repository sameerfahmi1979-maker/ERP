"use client";
import { useState } from "react";
import { command, mutate } from "./client";
import { useLoad, useTask } from "./hooks";
import { People, Issue } from "./controls";
import { usdMicros } from "./model";

const features = {
  chat: "Chat",
  realtime: "Realtime updates",
  media_upload: "Upload",
  media_download: "Download",
  export: "Transcript export",
  push: "Push notifications",
  ptt_live: "Walkie-Talkie live",
  ptt_replay: "Walkie-Talkie replay",
  sos: "SOS",
} as const;
const scope = "communications";
type Approval = {
  id: string;
  maxMicros: string;
  spentMicros: string;
  reservedMicros: string;
  endsAt: string;
  features: string[];
};
type Status = {
  canApprove: boolean;
  canMonitor: boolean;
  approval?: Approval;
  paused?: Record<string, string>;
  heldReasons?: string[];
  disabledFeatures?: string[];
};
function usd(value: string) {
  const digits = value.padStart(7, "0");
  return "$" + digits.slice(0, -6) + "." + digits.slice(-6);
}
type BudgetAlert = {
  eventId: string;
  kind: "budget";
  reason: string;
  feature: string;
  scope: string;
  createdAt: string;
  read: boolean;
};
function BudgetAlerts() {
  const [cursor, setCursor] = useState(""),
    [selected, setSelected] = useState<BudgetAlert>();
  const result = useLoad("control-inbox" + cursor, (s) =>
    command<{ items: BudgetAlert[]; nextCursor: string | null }>(
      "notifications.controlInbox",
      cursor ? { cursor } : {},
      s,
    ),
  );
  const task = useTask();
  return (
    <section>
      <h3>Budget alerts</h3>
      <Issue text={result.issue || task.issue} />
      {result.data?.items.length === 0 && <p>No budget alerts.</p>}
      <ul>
        {result.data?.items
          .filter((a) => a.kind === "budget")
          .map((a) => (
            <li key={a.eventId}>
              <button
                disabled={task.busy}
                onClick={() =>
                  void task.run(async () => {
                    setSelected(
                      await command<BudgetAlert>("notifications.controlResolve", { eventId: a.eventId }),
                    );
                  })
                }
              >
                {a.feature} · {a.reason.replaceAll("_", " ")} · {new Date(a.createdAt).toLocaleString()}
              </button>
            </li>
          ))}
      </ul>
      {selected && (
        <div>
          <p>
            {selected.scope} · {selected.reason.replaceAll("_", " ")}
          </p>
          {!selected.read && (
            <button
              disabled={task.busy}
              onClick={() =>
                void task.run(async () => {
                  await mutate("notifications.controlMarkRead", { eventId: selected.eventId });
                  setSelected(undefined);
                  result.refresh();
                })
              }
            >
              Mark budget alert as read
            </button>
          )}
        </div>
      )}
      {cursor && <button onClick={() => setCursor("")}>Newest budget alerts</button>}
      {result.data?.nextCursor && (
        <button onClick={() => setCursor(result.data!.nextCursor!)}>Older budget alerts</button>
      )}
    </section>
  );
}
export function Budget() {
  const status = useLoad("budget", (s) => command<Status>("budget.status", { scope }, s));
  const monitors = useLoad(status.data?.canMonitor ? "monitor" : "", (s) =>
    command<{ recipientProfileIds: string[]; canEdit: boolean }>("budget.monitor", { scope }, s),
  );
  const { run, busy, issue } = useTask();
  const [chosen, setChosen] = useState<string[]>([]),
    [amount, setAmount] = useState(""),
    [ends, setEnds] = useState(""),
    [feature, setFeature] = useState("chat"),
    [reason, setReason] = useState("");
  const [manualRecipient, setManualRecipient] = useState("");
  const [edited, setEdited] = useState<string[] | null>(null),
    [receipt, setReceipt] = useState("");
  if (status.issue) return <Issue text={status.issue} />;
  if (!status.data?.canMonitor) return null;
  const data = status.data,
    a = data.approval,
    recipients = edited ?? monitors.data?.recipientProfileIds ?? [];
  const apply = (op: string, args: Record<string, unknown>) =>
    void run(async () => {
      await mutate(op, { scope, ...args });
      setReceipt("ERP confirmed the change.");
      status.refresh();
      monitors.refresh();
      setEdited(null);
    });
  return (
    <details className="chat-settings">
      <summary>Communications usage and alerts</summary>
      <BudgetAlerts />
      {a ? (
        <p>
          Approved {usd(a.maxMicros)} USD · Spent {usd(a.spentMicros)} · Reserved {usd(a.reservedMicros)} ·
          Ends {new Date(a.endsAt).toLocaleString()} · {a.features.join(", ")}
        </p>
      ) : (
        <p>No active spending approval.</p>
      )}
      {data.heldReasons?.map((v) => (
        <p key={v}>{v.replaceAll("_", " ")}</p>
      ))}
      {Boolean(data.disabledFeatures?.length) && (
        <p>Disabled services · {data.disabledFeatures!.join(", ")}</p>
      )}
      {Object.entries(data.paused ?? {}).map(([f, r]) => (
        <p key={f}>
          Paused · {f} · {r}
        </p>
      ))}
      <fieldset disabled={busy}>
        <legend>Pause a service</legend>
        <label>
          Service
          <select value={feature} onChange={(e) => setFeature(e.target.value)}>
            {Object.entries(features).map(([key, name]) => (
              <option value={key} key={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reason
          <input value={reason} maxLength={256} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button disabled={!reason.trim()} onClick={() => apply("budget.pause", { feature, reason })}>
          Pause service
        </button>
      </fieldset>
      {data.canApprove && (
        <fieldset disabled={busy}>
          <legend>Owner spending approval</legend>
          {Object.entries(features).map(([key, name]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={chosen.includes(key)}
                onChange={(e) =>
                  setChosen(e.target.checked ? [...chosen, key] : chosen.filter((k) => k !== key))
                }
              />
              {name}
            </label>
          ))}
          <label>
            Maximum USD
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            Expires at
            <input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
          </label>
          <button
            disabled={!chosen.length || !amount || !ends}
            onClick={() =>
              void run(async () => {
                await mutate("budget.approve", {
                  scope,
                  currency: "USD",
                  features: chosen,
                  maxMicros: usdMicros(amount),
                  endsAt: new Date(ends).toISOString(),
                });
                status.refresh();
                setReceipt("ERP confirmed the spending approval.");
              })
            }
          >
            Approve maximum spend
          </button>
          {a && (
            <button onClick={() => apply("budget.revoke", { approvalId: a.id })}>
              Revoke active approval
            </button>
          )}
        </fieldset>
      )}
      <h3>Alert recipients</h3>
      <Issue text={monitors.issue} />
      <ul>
        {recipients.map((id) => (
          <li key={id}>
            ERP profile {id}{" "}
            {monitors.data?.canEdit && (
              <button onClick={() => setEdited(recipients.filter((x) => x !== id))}>Remove</button>
            )}
          </li>
        ))}
      </ul>
      {data.canApprove && monitors.data?.canEdit && (
        <>
          <People
            exclude={recipients}
            label="Add recipient"
            onPick={(p) => setEdited([...recipients, p.profileId])}
          />
          <label>
            ERP profile ID
            <input
              inputMode="numeric"
              value={manualRecipient}
              onChange={(e) => setManualRecipient(e.target.value)}
            />
          </label>
          <button
            disabled={!/^[1-9]\d{0,18}$/.test(manualRecipient) || recipients.includes(manualRecipient)}
            onClick={() => {
              setEdited([...recipients, manualRecipient]);
              setManualRecipient("");
            }}
          >
            Add profile ID
          </button>
          <button
            disabled={busy || !edited}
            onClick={() => apply("budget.monitor", { recipientProfileIds: recipients })}
          >
            Save alert recipients
          </button>
        </>
      )}
      <Issue text={issue} />
      <p role="status">{receipt}</p>
    </details>
  );
}
