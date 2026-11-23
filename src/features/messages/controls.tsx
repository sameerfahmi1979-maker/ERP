"use client";

import { useState } from "react";
import Image from "next/image";
import { command } from "./client";
import { useLoad } from "./hooks";
import type { Page, WorkIdentity } from "./model";

export function Issue({ text }: { text?: string }) {
  return text ? (
    <p role="alert" className="chat-error">
      {text}
    </p>
  ) : null;
}
export function People({
  onPick,
  label = "Choose",
  exclude = [],
}: {
  onPick: (p: WorkIdentity) => void;
  label?: string;
  exclude?: string[];
}) {
  const [text, setText] = useState(""),
    [cursor, setCursor] = useState(""),
    [stack, setStack] = useState<string[]>([]);
  const result = useLoad(JSON.stringify([text, cursor]), (s) =>
    command<Page<WorkIdentity>>("chat.directory", { query: text, ...(cursor && { cursor }), limit: 30 }, s),
  );
  return (
    <section aria-label="Work directory">
      <label>
        Find a colleague
        <input
          type="search"
          maxLength={128}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setCursor("");
            setStack([]);
          }}
        />
      </label>
      <Issue text={result.issue} />
      {!result.data && !result.issue && <p role="status">Loading directory…</p>}
      <ul className="chat-list">
        {result.data?.items
          .filter((p) => !exclude.includes(p.profileId))
          .map((p) => (
            <li key={p.profileId}>
              {p.photoRef === "/api/mobile/communications/v1/avatars/" + p.profileId && (
                <Image unoptimized src={p.photoRef} alt="" width={36} height={36} />
              )}
              <div>
                <strong>{p.name}</strong>
                <small>{[p.jobTitle, p.companyName, p.branchName].filter(Boolean).join(" · ")}</small>
              </div>
              <button onClick={() => onPick(p)} aria-label={label + " " + p.name}>
                {label}
              </button>
            </li>
          ))}
      </ul>
      {result.data?.items.length === 0 && <p>No matching colleagues.</p>}
      <div className="chat-actions">
        {stack.length > 0 && (
          <button
            onClick={() => {
              setCursor(stack.at(-1)!);
              setStack(stack.slice(0, -1));
            }}
          >
            Previous people
          </button>
        )}
        {result.data?.nextCursor && (
          <button
            onClick={() => {
              setStack([...stack, cursor]);
              setCursor(result.data!.nextCursor!);
            }}
          >
            More people
          </button>
        )}
      </div>
    </section>
  );
}
export function Dates({
  from,
  until,
  setFrom,
  setUntil,
}: {
  from: string;
  until: string;
  setFrom: (value: string) => void;
  setUntil: (value: string) => void;
}) {
  return (
    <div className="chat-actions">
      <label>
        From
        <input type="date" value={from} max={until || undefined} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label>
        Through
        <input type="date" value={until} min={from || undefined} onChange={(e) => setUntil(e.target.value)} />
      </label>
    </div>
  );
}
