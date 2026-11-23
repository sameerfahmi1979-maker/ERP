// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { jsx } from "react/jsx-runtime";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReadCacheBoundary } from "@/components/layout/read-cache-boundary";
import { AgentCenterPageClient } from "@/features/ai-agent-center/agent-center-page-client";
import { readJson, ReadError } from "@/lib/reads/client";
import type { AgentCenterCase, AgentCenterSnapshot } from "../contracts";
import { SAMPLE_ONE } from "./sample-one";

vi.mock("@/lib/reads/client", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/reads/client")>(),
  readJson: vi.fn(),
}));
vi.mock("@/server/actions/ai-agent-center", () => ({ inspectAgentControl: vi.fn(), changeAgentControl: vi.fn() }));

const item: AgentCenterCase = {
  id: SAMPLE_ONE.selectedCase.id, title: "Intake 1151", sessionCode: "SESSION_1151", documentId: null, dmsNumber: null,
  stage: "validation", status: "review", discoveredAt: SAMPLE_ONE.now, uploadedAt: SAMPLE_ONE.now,
  startedAt: SAMPLE_ONE.now, analysisFinishedAt: SAMPLE_ONE.now, waitingSince: SAMPLE_ONE.now, finishedAt: null, updatedAt: SAMPLE_ONE.now,
};
const nextAttention: AgentCenterCase = {
  ...item, id: "00000000-0000-4000-8000-000000000002", title: "Intake 1152", sessionCode: "SESSION_1152",
};
const previousReceipt: AgentCenterCase = {
  ...item, id: "00000000-0000-4000-8000-000000000003", title: "DMS-2026-000701", sessionCode: "SESSION_1150",
  documentId: 701, dmsNumber: "DMS-2026-000701", status: "filed", waitingSince: null, finishedAt: SAMPLE_ONE.now,
};
const initial: AgentCenterSnapshot = {
  scope: SAMPLE_ONE.scope, totals: SAMPLE_ONE.totals, cases: [item, previousReceipt], selectedCase: null, attention: item,
  choices: [], checkpoint: null, intakeProgress: null, hasMore: false, confirmedAt: new Date().toISOString(),
  laneActivity: { intakeRunning: false, extractionRunning: false, reviewWaiting: true },
};

let host: HTMLElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(readJson).mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const seedOwner = { authUserId: "test-user", scopeVersion: "test-scope" };
  await act(async () => root.render(jsx(ReadCacheBoundary, {
    ...seedOwner, children: createElement(AgentCenterPageClient, { initial, seedOwner, canInspectControls: false }),
  })));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function click(label: string) {
  const button = Array.from(host.querySelectorAll("button")).find(candidate => candidate.textContent?.includes(label));
  expect(button).toBeDefined();
  await act(async () => button?.click());
}

it("keeps the dashboard mounted during a first case read and switches both tabs without another request", async () => {
  let resolve!: (response: { data: AgentCenterSnapshot }) => void;
  vi.mocked(readJson).mockReturnValue(new Promise(done => { resolve = done; }));
  const workflow = host.querySelector(".ac-map");
  const inspector = host.querySelector(".ac-inspector");
  expect(workflow).not.toBeNull();
  expect(inspector).not.toBeNull();

  await click("Intake 1151");
  expect(host.querySelector(".ac-map")).toBe(workflow);
  expect(host.querySelector(".ac-inspector")).toBe(inspector);
  expect(host.textContent).toContain("Loading case timeline");
  expect(readJson).toHaveBeenCalledTimes(1);

  await click("Live activity");
  expect(host.textContent).toContain("Recent cases");
  await act(async () => {
    resolve({ data: { ...initial, selectedCase: { ...item, title: "Qatar permit.pdf" } } });
    await new Promise(done => setTimeout(done, 15));
  });
  await click("Intake 1151");
  expect(host.querySelector(".ac-case-detail a")?.getAttribute("href")).toBe("/dms/intake/SESSION_1151");
  expect(host.querySelector(".ac-map")).toBe(workflow);
  expect(readJson).toHaveBeenCalledTimes(1);
});

it("withdraws the visible activity and timeline when the detail read denies the scope", async () => {
  let reject!: (reason: unknown) => void;
  vi.mocked(readJson).mockReturnValue(new Promise((_done, fail) => { reject = fail; }));
  await click("Intake 1151");
  await act(async () => {
    reject(new ReadError("Denied", 403));
    await new Promise(done => setTimeout(done, 15));
  });
  expect(host.textContent).toContain("Your access to this scope could not be verified.");
  expect(host.querySelector(".ac-map")).toBeNull();
  expect(host.querySelector(".ac-inspector")).toBeNull();
});

it("withdraws the cached case reference when the scoped detail is no longer available", async () => {
  let resolve!: (response: { data: AgentCenterSnapshot }) => void;
  vi.mocked(readJson).mockReturnValue(new Promise(done => { resolve = done; }));
  await click("Intake 1151");
  expect(host.querySelector(".ac-case-detail")?.textContent).toContain("Intake 1151");
  await act(async () => {
    resolve({ data: { ...initial, selectedCase: null, confirmedAt: new Date().toISOString() } });
    await new Promise(done => setTimeout(done, 15));
  });
  const detail = host.querySelector(".ac-case-detail");
  expect(detail).not.toBeNull();
  expect(detail?.textContent).not.toContain("Intake 1151");
  expect(detail?.querySelector("a")).toBeNull();
});

const filedAt = new Date(Date.parse(initial.confirmedAt) + 750).toISOString();
const filedCase: AgentCenterCase = {
  ...item, title: "Qatar permit.pdf", documentId: 764, dmsNumber: "DMS-2026-000764", status: "filed",
  waitingSince: null, finishedAt: filedAt, updatedAt: filedAt,
};
const newerRead: AgentCenterSnapshot = {
  ...initial, selectedCase: filedCase, attention: nextAttention,
  confirmedAt: new Date(Date.parse(initial.confirmedAt) + 1_000).toISOString(),
};

async function returnToActivityAfterCaseRead(snapshot: AgentCenterSnapshot) {
  let resolve!: (response: { data: AgentCenterSnapshot }) => void;
  vi.mocked(readJson).mockReturnValue(new Promise(done => { resolve = done; }));
  await click("Intake 1151");
  await act(async () => {
    resolve({ data: snapshot });
    await new Promise(done => setTimeout(done, 15));
  });
  await click("Live activity");
}

it("uses the next authorized attention item after a newer detail read confirms the same case filed", async () => {
  await returnToActivityAfterCaseRead(newerRead);
  const attention = host.querySelector('[aria-label="Needs attention"]');
  expect(attention?.textContent).toContain(nextAttention.title);
  expect(attention?.textContent).not.toContain(item.title);
  expect(host.querySelector(".ac-case-list")?.textContent).toContain(previousReceipt.title);
  expect(readJson).toHaveBeenCalledTimes(1);
  await click("Case timeline");
  expect(host.querySelector(".ac-case-detail a")?.getAttribute("href")).toBe("/dms/documents/record/764");
});

it.each([["empty", null], ["the same stale row", item]] as const)("removes the stale filed attention when the newer attention is %s", async (_description, attention) => {
  await returnToActivityAfterCaseRead({ ...newerRead, attention });
  expect(host.querySelector('[aria-label="Needs attention"]')).toBeNull();
  expect(host.querySelector(".ac-case-list")?.textContent).toContain(previousReceipt.title);
});

it("keeps unsearched attention out of a filtered activity result", async () => {
  vi.mocked(readJson).mockResolvedValueOnce({ data: initial });
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Find a case"]')!;
  await act(async () => fireEvent.change(input, { target: { value: "Intake 1151" } }));
  await act(async () => {
    fireEvent.submit(input.form!);
    await new Promise(done => setTimeout(done, 15));
  });
  expect(host.textContent).toContain("Search results");
  await returnToActivityAfterCaseRead(newerRead);
  expect(host.querySelector('[aria-label="Needs attention"]')).toBeNull();
  expect(host.textContent).not.toContain(nextAttention.title);
});

it.each([
  ["same display text for another UUID", { ...newerRead, selectedCase: { ...filedCase, id: previousReceipt.id, title: item.title } }],
  ["another company", { ...newerRead, scope: { ...initial.scope, companyId: 2 } }],
  ["another branch", { ...newerRead, scope: { ...initial.scope, branchId: 2 } }],
  ["an older detail read", { ...newerRead, confirmedAt: SAMPLE_ONE.now }],
  ["an older case", { ...newerRead, selectedCase: { ...filedCase, updatedAt: item.updatedAt } }],
  ["a missing filing receipt", { ...newerRead, selectedCase: { ...filedCase, finishedAt: null } }],
  ["a missing linked document", { ...newerRead, selectedCase: { ...filedCase, documentId: null } }],
  ["a case still under review", { ...newerRead, selectedCase: { ...item, updatedAt: filedCase.updatedAt } }],
] satisfies [string, AgentCenterSnapshot][])("keeps pending attention for %s", async (_description, snapshot) => {
  await returnToActivityAfterCaseRead(snapshot);
  expect(host.querySelector('[aria-label="Needs attention"]')?.textContent).toContain(item.title);
});
