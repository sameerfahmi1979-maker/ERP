import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AGENTS, type AgentCenterCase, type AgentCenterSnapshot } from "../contracts";
import { AgentCenterInspector } from "@/features/ai-agent-center/agent-center-inspector";
import { AgentCenterWorkflow } from "@/features/ai-agent-center/agent-center-workflow";
import { SAMPLE_ONE } from "./sample-one";

describe("Sample 1 workflow", () => {
  it("shows the selected intake and its destination independently of attention cases", () => {
    const selected: AgentCenterCase = {
      id: SAMPLE_ONE.selectedCase.id, title: "Qatar permit example.pdf", sessionCode: "SESSION_1151",
      documentId: null, dmsNumber: null, stage: "validation", status: "review",
      discoveredAt: SAMPLE_ONE.selectedCase.discoveredAt, uploadedAt: SAMPLE_ONE.selectedCase.importedAt,
      startedAt: SAMPLE_ONE.selectedCase.startedAt, analysisFinishedAt: SAMPLE_ONE.now,
      waitingSince: SAMPLE_ONE.now, finishedAt: null, updatedAt: SAMPLE_ONE.now,
    };
    const attention: AgentCenterCase = { ...selected, id: "00000000-0000-4000-8000-000000000002", title: "Intake 1131", sessionCode: "SESSION_1131" };
    const snapshot: AgentCenterSnapshot = {
      scope: SAMPLE_ONE.scope, totals: SAMPLE_ONE.totals, cases: [{ ...selected, title: "Intake 1151" }],
      selectedCase: selected, attention, choices: [], checkpoint: null, intakeProgress: null,
      laneActivity: { intakeRunning: false, extractionRunning: false, reviewWaiting: true },
      confirmedAt: SAMPLE_ONE.now, hasMore: false,
    };
    const props = {
      snapshot, caseReference: "Intake 1151", listLabel: "Recent cases", offset: 0, filtered: false,
      onTab: () => {}, onSelect: () => {}, onPrevious: () => {}, onMore: () => {}, onClearList: () => {},
    };
    const timeline = renderToStaticMarkup(createElement(AgentCenterInspector, { ...props, tab: "case" }));
    expect(timeline).toContain("Open Intake 1151");
    expect(timeline).toContain('href="/dms/intake/SESSION_1151"');
    expect(timeline).toContain("Qatar permit example.pdf");
    expect(timeline).not.toContain("Intake 1131");
    const activity = renderToStaticMarkup(createElement(AgentCenterInspector, { ...props, tab: "activity" }));
    expect(activity).toContain("Intake 1151");
    expect(activity).toContain("Intake 1131");
  });

  it("renders the seven agents in order with accessible measured progress", () => {
    const html = renderToStaticMarkup(createElement(AgentCenterWorkflow, {
      states: Object.fromEntries(AGENTS.map(agent => [agent.key, { label: "Idle", status: "idle" }])),
      selectedAgent: "extraction",
      selectedCase: { id: SAMPLE_ONE.selectedCase.id, title: SAMPLE_ONE.selectedCase.title, stage: "extraction" },
      measurement: SAMPLE_ONE.intake,
      handoff: null,
      onSelect: () => {},
      onSelectCase: () => {},
    }));
    let lastIndex = -1;
    for (const node of AGENTS) {
      const index = html.indexOf(`class="ac-node-label">${node.label.replaceAll("&", "&amp;")}<`, lastIndex + 1);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
    expect(html).toContain("60%");
    expect(html).toContain("CICPA Onshore");
    expect(html).toContain('aria-valuenow="12"');
  });
});
