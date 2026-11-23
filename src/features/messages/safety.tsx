"use client";

import { useState } from "react";
import { command, mutate } from "./client";
import { useLoad, useTask } from "./hooks";
import { Issue, People } from "./controls";
import type { Policy, WorkIdentity } from "./model";

const reasons = {
  harassment_threats: "Harassment or threats",
  hate_discrimination: "Hate or discrimination",
  sexual_exploitation: "Sexual exploitation",
  impersonation_spam: "Impersonation or spam",
  privacy: "Privacy or sensitive information",
  other: "Other prohibited conduct",
};
export function Report({
  kind,
  id,
  label = "Report",
}: {
  kind: "user" | "chat_thread" | "chat_message";
  id: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState("harassment_threats"),
    [details, setDetails] = useState(""),
    [reference, setReference] = useState("");
  const { run, busy, issue } = useTask();
  return (
    <div>
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        {label}
      </button>
      {open && (
        <fieldset className="chat-panel" disabled={busy}>
          <legend>{label}</legend>
          <p>
            The moderation team receives the selected{" "}
            {kind === "user" ? "work identity" : kind === "chat_thread" ? "conversation" : "message"}, reason
            and explanation.
          </p>
          <label>
            Reason
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              {Object.entries(reasons).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Explanation (optional)
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />
          </label>
          <button
            disabled={!!reference}
            onClick={() =>
              void run(async () => {
                const receipt = await mutate<{ caseId: string }>("policy.report", {
                  kind,
                  targetId: id,
                  reason,
                  ...(details && { details }),
                });
                setReference(receipt.caseId);
              })
            }
          >
            Submit report
          </button>
          <Issue text={issue} />
          {reference && <p role="status">Report reference {reference}</p>}
        </fieldset>
      )}
    </div>
  );
}
export function Block({ person }: { person: Pick<WorkIdentity, "profileId" | "name"> }) {
  const [open, setOpen] = useState(false),
    [done, setDone] = useState(false);
  const { run, busy, issue } = useTask();
  return (
    <div>
      <button disabled={done} onClick={() => setOpen(!open)}>
        {done ? "Blocked" : "Block " + person.name}
      </button>
      {open && (
        <div className="chat-panel">
          <p>
            Blocking stops private messages and private Walkie-Talkie in both directions. Shared groups and
            channels continue. Directed mention alerts are suppressed.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await mutate("policy.block", { targetProfileId: person.profileId, blocked: true });
                setDone(true);
                setOpen(false);
              })
            }
          >
            Confirm block
          </button>
          <button onClick={() => setOpen(false)}>Cancel</button>
          <Issue text={issue} />
        </div>
      )}
    </div>
  );
}
type Case = {
  caseId: string;
  kind: string;
  reason: keyof typeof reasons;
  status: string;
  updatedAt: string;
  evidenceAvailable: boolean;
  targetId?: string;
  conversationId?: string;
  details?: string;
  outcome?: string;
};
function Moderation() {
  const [cursor, setCursor] = useState(""),
    [selected, setSelected] = useState(""),
    [action, setAction] = useState("review"),
    [note, setNote] = useState(""),
    [until, setUntil] = useState("");
  const list = useLoad("cases" + cursor, (s) =>
    command<{ cases: Case[]; nextBefore: string | null }>(
      "policy.cases",
      { limit: 30, ...(cursor && { before: cursor }) },
      s,
    ),
  );
  const detail = useLoad(selected, (s) => command<Case>("policy.case", { caseId: selected }, s));
  const { run, busy, issue } = useTask();
  return (
    <section>
      <h3>Moderation cases</h3>
      <Issue text={list.issue} />
      <ul>
        {list.data?.cases.map((c) => (
          <li key={c.caseId}>
            <button onClick={() => setSelected(c.caseId)}>
              {reasons[c.reason]} · {c.status} · {c.caseId}
            </button>
          </li>
        ))}
      </ul>
      {list.data?.cases.length === 0 && <p>No cases.</p>}
      {list.data?.nextBefore && (
        <button
          onClick={() => {
            setSelected("");
            setCursor(list.data!.nextBefore!);
          }}
        >
          Older cases
        </button>
      )}
      {cursor && <button onClick={() => setCursor("")}>Latest cases</button>}
      <Issue text={detail.issue} />
      {detail.data && (
        <fieldset disabled={busy}>
          <legend>Case {selected}</legend>
          <p>
            {detail.data.kind} · {detail.data.status}
          </p>
          <p>{detail.data.details}</p>
          {detail.data.evidenceAvailable &&
            detail.data.conversationId &&
            detail.data.kind.startsWith("chat_") && (
              <a
                href={
                  "/messages?mode=review&conversationId=" +
                  encodeURIComponent(detail.data.conversationId) +
                  (detail.data.kind === "chat_message" && detail.data.targetId
                    ? "&messageId=" + encodeURIComponent(detail.data.targetId)
                    : "")
                }
              >
                Open authorized history
              </a>
            )}
          <p>{detail.data.outcome}</p>
          <label>
            Action
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="review">Start review</option>
              <option value="dismiss">Close without action</option>
              <option value="hideContent">Hide reported content</option>
              <option value="restrictCommunication">Restrict communications</option>
            </select>
          </label>
          {action === "restrictCommunication" && (
            <label>
              Restrict until
              <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
          )}
          <label>
            Moderator note
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </label>
          <button
            onClick={() =>
              void run(async () => {
                await mutate("policy.moderate", {
                  caseId: selected,
                  action,
                  ...(note && { note }),
                  ...(action === "restrictCommunication" && { until: new Date(until).toISOString() }),
                });
                detail.refresh();
                list.refresh();
              })
            }
          >
            Apply action
          </button>
        </fieldset>
      )}
      <Issue text={issue} />
    </section>
  );
}
export function Safety({
  policy,
  refresh,
  global,
}: {
  policy?: Policy;
  refresh: () => void;
  global: boolean;
}) {
  const blocks = useLoad("blocks", (s) =>
    command<{ blocks: { targetProfileId: string; displayName?: string }[] }>("policy.blocks", {}, s),
  );
  const [person, setPerson] = useState<WorkIdentity>(),
    [grant, setGrant] = useState("groupCreate"),
    [info, setInfo] = useState("");
  const { run, busy, issue } = useTask();
  return (
    <div className="chat-settings">
      <h2>Privacy and safety</h2>
      <a href="/communications-disclosure.html" target="_blank" rel="noreferrer">
        Privacy disclosure
      </a>
      <h3>Communication terms</h3>
      {policy?.currentVersion ? (
        <>
          <p>Version {policy.currentVersion}</p>
          <p className="chat-body">{policy.termsText}</p>
          {policy.accepted ? (
            <p>Accepted</p>
          ) : (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await mutate("policy.accept", { version: policy.currentVersion });
                  refresh();
                })
              }
            >
              Accept terms
            </button>
          )}
        </>
      ) : (
        <p>Current terms are unavailable. Contributions are on hold.</p>
      )}
      <h3>Blocked users</h3>
      <Issue text={blocks.issue} />
      {blocks.data?.blocks.length === 0 && <p>No blocked users.</p>}
      {blocks.data?.blocks.map((p) => (
        <div key={p.targetProfileId}>
          {p.displayName || p.targetProfileId}{" "}
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await mutate("policy.block", { targetProfileId: p.targetProfileId, blocked: false });
                blocks.refresh();
              })
            }
          >
            Unblock
          </button>
        </div>
      ))}
      {global && (
        <details>
          <summary>Named communications permissions</summary>
          <People onPick={setPerson} />
          {person && (
            <fieldset disabled={busy}>
              <legend>{person.name}</legend>
              <label>
                Permission
                <select value={grant} onChange={(e) => setGrant(e.target.value)}>
                  <option value="groupCreate">Create chat group</option>
                  <option value="historyReview">Review all chat history in assigned scope</option>
                  <option value="moderator">Moderate reported content</option>
                </select>
              </label>
              {[true, false].map((enabled) => (
                <button
                  key={String(enabled)}
                  onClick={() =>
                    void run(async () => {
                      const target = { targetProfileId: person.profileId, enabled };
                      if (grant === "moderator") await mutate("policy.setModerator", target);
                      else await mutate("chat.namedGrant", { ...target, kind: grant });
                      setInfo((enabled ? "Granted to " : "Revoked from ") + person.name);
                    })
                  }
                >
                  {enabled ? "Grant" : "Revoke"}
                </button>
              ))}
            </fieldset>
          )}
        </details>
      )}
      {policy?.canModerate && <Moderation />}
      <Issue text={issue} />
      <p role="status">{info}</p>
    </div>
  );
}
