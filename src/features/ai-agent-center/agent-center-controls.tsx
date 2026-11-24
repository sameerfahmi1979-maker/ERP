"use client";

import { useEffect, useState, useTransition } from "react";
import { Pause, Play } from "lucide-react";
import type { Agent } from "@/lib/ai-agent-center/contracts";
import type { AgentControlRequest, AgentControlState } from "@/lib/ai-agent-center/controls";
import { changeAgentControl, inspectAgentControl } from "@/server/actions/ai-agent-center";

type Props = {
  lane: Agent;
  companyId: number;
  branchId: number | null;
  scopeLabel: string;
  runtimeLabel: string;
  canInspect: boolean;
};

export function AgentCenterControls({ lane, companyId, branchId, scopeLabel, runtimeLabel, canInspect }: Props) {
  const [state, setState] = useState<AgentControlState | null>(null);
  const [request, setRequest] = useState<AgentControlRequest | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!canInspect) return;
    let current = true;
    void inspectAgentControl({ companyId, branchId, agent: lane.id }).then(
      value => { if (current) setState(value); }, () => { if (current) setState(null); },
    );
    return () => { current = false; };
  }, [canInspect, companyId, branchId, lane.id]);

  function prepare(action: AgentControlRequest["action"]) {
    if (!state?.workerBound) return;
    setMessage("");
    setRequest({ companyId, branchId, agent: lane.id, action, expectedRevision: state.revision,
      requestId: crypto.randomUUID(), reason: "" });
  }

  return <section className="ac-controls" aria-label="Selected agent controls">
    <strong>{lane.label}</strong>
    <span>{scopeLabel}</span>
    <span className="ac-status">{runtimeLabel}</span>
    {state?.workerBound ? <div className="ac-control-actions">
      <button type="button" onClick={() => prepare(state.paused ? "resume" : "pause")} disabled={!state.enabled || pending || !!request}>
        {state.paused ? <Play size={16} /> : <Pause size={16} />}
        {state.paused ? "Resume" : "Pause"}
      </button>
      <button type="button" role="switch" aria-checked={state.enabled} aria-label={`${lane.label} enabled`}
        onClick={() => prepare(state.enabled ? "off" : "on")} disabled={pending || !!request}>
        {state.enabled ? "On" : "Off"}
      </button>
    </div> : <span className="ac-status">Controls unavailable</span>}
    {request && <form className="ac-control-confirm" onSubmit={event => {
      event.preventDefault();
      startTransition(async () => {
        try {
          const reply = await changeAgentControl(request);
          if (reply.ok) {
            setState(reply.state);
            setRequest(null);
            setMessage("Control change recorded.");
          } else if (reply.reason === "unconfirmed") {
            setMessage("Outcome unconfirmed. Retry this request to reconcile it.");
          } else {
            const newest = await inspectAgentControl({ companyId, branchId, agent: lane.id });
            setState(newest);
            setRequest(null);
            setMessage("The change was declined. Review the latest scope and status.");
          }
        } catch {
          setMessage("Outcome unconfirmed. Retry this request to reconcile it.");
        }
      });
    }}>
      <p>Confirm {request.action} for {lane.label} in {scopeLabel}. Current mode is {state?.mode}.</p>
      <p>Controls affect new claims and the next checked step in this scope.</p>
      <label>Reason <input required maxLength={240} value={request.reason} disabled={pending || !!message}
        onChange={event => setRequest({ ...request, reason: event.target.value })} /></label>
      <div className="ac-control-actions">
        <button type="submit" disabled={pending || !request.reason.trim()}>{message ? "Reconcile" : "Confirm"}</button>
        <button type="button" disabled={pending} onClick={() => { setRequest(null); setMessage(""); }}>Close</button>
      </div>
    </form>}
    {message && <p role="status">{message}</p>}
  </section>;
}
