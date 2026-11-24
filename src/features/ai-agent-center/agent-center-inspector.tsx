"use client";

import { ArrowUpRight, AlertTriangle, Check, Clock, FileText } from "lucide-react";
import Link from "next/link";
import { CASE_STATUS, caseHref, caseTimeline } from "@/lib/ai-agent-center/cases";
import { dubaiTime } from "@/lib/ai-agent-center/progress";
import type { AgentCenterSnapshot } from "@/lib/ai-agent-center/contracts";

export type InspectorTab = "activity" | "case";

const heartbeatDateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dubai", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

type Props = {
  snapshot: AgentCenterSnapshot;
  caseReference: string | null;
  caseLoading?: boolean;
  onRetryCase?: () => void;
  tab: InspectorTab;
  listLabel: string;
  onTab: (tab: InspectorTab) => void;
  onSelect: (item: Pick<AgentCenterSnapshot["cases"][number], "id" | "title">) => void;
  onPrevious: () => void;
  onMore: () => void;
  onClearList: () => void;
  filtered: boolean;
  offset: number;
};

export function AgentCenterInspector({ snapshot, caseReference, caseLoading, onRetryCase, tab, listLabel, onTab, onSelect, onPrevious, onMore, onClearList, filtered, offset }: Props) {
  const item = snapshot.selectedCase;
  const link = item && caseHref(item);
  const attention = snapshot.attention;
  return <aside className="ac-inspector" aria-label="Agent details">
    <div className="ac-tabs" role="group" aria-label="Inspector view">
      <button type="button" aria-pressed={tab === "activity"} onClick={() => onTab("activity")}>Live activity</button>
      <button type="button" aria-pressed={tab === "case"} onClick={() => onTab("case")}>Case timeline</button>
    </div>
    {tab === "case" && item ? <div className="ac-case-detail">
      <div className="ac-case-heading">
        <FileText size={20} aria-hidden="true" />
        <h3>{caseReference ?? item.title}</h3>
        {link && <Link href={link.href}>{caseReference ? `Open ${caseReference}` : link.label}<ArrowUpRight size={14} aria-hidden="true" /></Link>}
      </div>
      {caseReference && item.title !== caseReference && <p className="ac-case-filename">{item.title}</p>}
      <ol className="ac-timeline">
        {caseTimeline(item).map((event, index) => <li key={`${event.at}-${index}`}>
          <Check size={14} aria-hidden="true" /><span>{event.label}</span><time dateTime={event.at}>{dubaiTime(event.at)}</time>
        </li>)}
      </ol>
      <p className="ac-status" role="status">{CASE_STATUS[item.status]}</p>
    </div> : tab === "case" ? <div className="ac-case-detail" aria-busy={caseLoading || undefined}>
      {caseReference && <div className="ac-case-heading"><FileText size={20} aria-hidden="true" /><h3>{caseReference}</h3></div>}
      <p className="ac-status" role="status">{caseLoading ? "Loading case timeline…" : caseReference
        ? "Case timeline is unavailable." : "Select a case to view its timeline."}</p>
      {onRetryCase && <div className="ac-control-actions"><button type="button" onClick={onRetryCase}>Retry timeline</button></div>}
    </div> :
      <div className="ac-activity-detail">
        <div className="ac-case-heading"><h3>{listLabel}</h3>
          {filtered && <button type="button" onClick={onClearList}>Clear filters</button>}
        </div>
        {snapshot.cases.length === 0 ? <p className="ac-status">No matching activity in this scope.</p> :
          <ul className="ac-case-list">
            {snapshot.cases.map(row => <li key={row.id}>
              <button type="button" className="ac-list-row" onClick={() => onSelect(row)}>
                <FileText size={16} aria-hidden="true" />
                <span><strong title={row.title}>{row.title}</strong><small>{CASE_STATUS[row.status]}</small></span>
                <time dateTime={row.updatedAt}>{dubaiTime(row.updatedAt)}</time>
              </button>
            </li>)}
          </ul>}
        {(offset > 0 || snapshot.hasMore) && <div className="ac-control-actions">
          <button type="button" onClick={onPrevious} disabled={offset === 0}>Previous</button>
          <button type="button" onClick={onMore} disabled={!snapshot.hasMore || offset >= 5000}>More</button>
        </div>}
      </div>}
    {tab === "activity" && attention && <section className="ac-attention" aria-label="Needs attention">
      <h3><AlertTriangle size={17} aria-hidden="true" />Needs attention</h3>
      <button type="button" className="ac-list-row" onClick={() => onSelect(attention)}>
        <FileText size={16} aria-hidden="true" />
        <span><strong title={attention.title}>{attention.title}</strong><small>{CASE_STATUS[attention.status]}</small></span>
        <span>View timeline</span>
      </button>
    </section>}
    <div className="ac-next-scan">
      <span><Clock size={15} aria-hidden="true" />Last SharePoint check</span>
      {snapshot.checkpoint ? <time dateTime={snapshot.checkpoint.lastCheckedAt}>{dubaiTime(snapshot.checkpoint.lastCheckedAt)} GST</time> : <span>Unavailable</span>}
    </div>
    {tab === "activity" && snapshot.workerHeartbeatAt && <div className="ac-next-scan">
      <span><Clock size={15} aria-hidden="true" />Last local SharePoint heartbeat</span>
      <time dateTime={snapshot.workerHeartbeatAt}>{heartbeatDateTime.format(new Date(snapshot.workerHeartbeatAt))} GST</time>
    </div>}
  </aside>;
}
