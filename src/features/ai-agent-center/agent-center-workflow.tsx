"use client";

import { useState } from "react";
import { CalendarDays, FileSearch, FileText, Layers, Link2, ShieldCheck, Tag } from "lucide-react";
import { AGENTS, type Agent, type AgentCenterCase } from "@/lib/ai-agent-center/contracts";
import { getMeasuredProgress, type CaseProgress } from "@/lib/ai-agent-center/progress";
import type { CSSProperties } from "react";

const icons = { intake: FileText, extraction: FileSearch, validation: ShieldCheck, linking: Link2,
  catalog: Tag, search: Layers, renewal: CalendarDays };

export type AgentState = { label: string; status: "running" | "review" | "idle" | "scheduled" | "unavailable" | "paused" };

type Props = {
  states: Partial<Record<Agent["key"], AgentState>>;
  selectedAgent: Agent["key"];
  selectedCase: Pick<AgentCenterCase, "id" | "title" | "stage"> | null;
  measurement?: CaseProgress | null;
  handoff: { from: string; to: string } | null;
  onSelect: (key: Agent["key"]) => void;
  onSelectCase: (id: string) => void;
};

export function AgentCenterWorkflow({ states, selectedAgent, selectedCase, measurement, handoff, onSelect, onSelectCase }: Props) {
  const [zoom, setZoom] = useState(100);
  const [filter, setFilter] = useState("all");
  const intakeProgress = getMeasuredProgress(measurement ?? null);

  function node(agent: Agent) {
    const Icon = icons[agent.key];
    const state = states[agent.key] ?? { label: "Status unavailable", status: "unavailable" };
    const marker = selectedCase?.stage === agent.key ? selectedCase : null;

    return <button key={agent.id} type="button" className="ac-node" data-selected={selectedAgent === agent.key}
      data-status={state.status} data-dimmed={filter !== "all" && filter !== agent.key}
      aria-pressed={selectedAgent === agent.key} onClick={() => {
        onSelect(agent.key);
        if (marker) onSelectCase(marker.id);
      }}>
      {marker && <span className="ac-marker" data-transition={handoff?.to === agent.key} title={marker.title}>
        <FileText size={15} aria-hidden="true" /><span>{marker.title}</span>
      </span>}
      <Icon className="ac-node-icon" aria-hidden="true" />
      <span className="ac-node-label">{agent.label}</span>
      <span className="ac-state">{state.label}</span>
      {agent.key === "intake" && intakeProgress && <>
        <span className="ac-progress-line">
          <progress className="ac-progress" aria-label="Files checked" aria-valuenow={intakeProgress.completed}
            value={intakeProgress.completed} max={intakeProgress.total} />
          <span>{intakeProgress.percent}%</span>
        </span>
        <span>{intakeProgress.completed} of {intakeProgress.total} files checked</span>
      </>}
    </button>;
  }

  return <section className="ac-map" aria-label="DMS workflow">
    <div className="ac-map-header">
      <h2>DMS workflow</h2>
      <label className="ac-lane-filter">
        <span className="sr-only">Filter agents</span>
        <select className="ac-select" value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="all">All agents</option>
          {AGENTS.map(agent => <option key={agent.id} value={agent.key}>{agent.label}</option>)}
        </select>
      </label>
    </div>
    <div className="ac-graph">
      <div className="ac-graph-layout" style={{ "--ac-zoom": zoom / 100 } as CSSProperties}>
        <div className="ac-main-path">
          {AGENTS.slice(0, 4).map(node)}
        </div>
        <div className="ac-support-path">
          {AGENTS.slice(4).map(node)}
        </div>
      </div>
      <div className="ac-zoom" aria-label="Workflow zoom">
        <button type="button" aria-label="Zoom out" disabled={zoom <= 80} onClick={() => setZoom(value => value - 10)}>−</button>
        <button type="button" aria-label="Zoom in" disabled={zoom >= 130} onClick={() => setZoom(value => value + 10)}>+</button>
      </div>
    </div>
  </section>;
}
