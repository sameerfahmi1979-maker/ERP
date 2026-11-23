import { describe, expect, it } from "vitest";
import { agentCenterQuerySchema, agentCenterSnapshotSchema, agentsInModule, registeredModules } from "../contracts";
import { ROUTE_ACCESS_REGISTRY, canAccessRoute } from "@/lib/rbac/route-access-registry";
import { SAMPLE_ONE } from "./sample-one";

describe("authorized agent center projection contracts", () => {
  it("validates scoped search and selection criteria", () => {
    expect(agentCenterQuerySchema.safeParse({ companyId: 2, branchId: 1 }).success).toBe(true);
    expect(agentCenterQuerySchema.safeParse({ branchId: 1 }).success).toBe(false);
    expect(agentCenterQuerySchema.safeParse({ companyId: 0 }).success).toBe(false);
    expect(agentCenterQuerySchema.safeParse({ companyId: 1, userId: 2 }).success).toBe(false);
    expect(agentCenterQuerySchema.safeParse({ search: "a".repeat(201) }).success).toBe(false);
  });

  it("rejects a case carrying extra raw worker fields", () => {
    const item = { id: SAMPLE_ONE.selectedCase.id, title: "Intake 1", sessionCode: "EXAMPLE_1", documentId: null,
      dmsNumber: null, stage: "extraction", status: "running", discoveredAt: SAMPLE_ONE.selectedCase.discoveredAt,
      uploadedAt: SAMPLE_ONE.selectedCase.importedAt, startedAt: SAMPLE_ONE.selectedCase.startedAt,
      analysisFinishedAt: null, waitingSince: null, finishedAt: null, updatedAt: SAMPLE_ONE.now };
    const snapshot = { scope: SAMPLE_ONE.scope, choices: [], totals: SAMPLE_ONE.totals, cases: [item], selectedCase: null,
      attention: null, checkpoint: null, confirmedAt: SAMPLE_ONE.now, hasMore: false,
      laneActivity: { intakeRunning: false, extractionRunning: true, reviewWaiting: false }, intakeProgress: null };
    expect(agentCenterSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(agentCenterSnapshotSchema.safeParse({ ...snapshot, workerHeartbeatAt: SAMPLE_ONE.now }).success).toBe(true);
    expect(agentCenterSnapshotSchema.safeParse({ ...snapshot, workerHeartbeatAt: "unconfirmed" }).success).toBe(false);
    expect(agentCenterSnapshotSchema.safeParse({ ...snapshot, cases: [{ ...item, rawOcr: "private" }] }).success).toBe(false);
  });

  it("registers other permitted modules without changing the DMS layout", () => {
    expect(registeredModules()).toEqual(["dms"]);
    const registry = [{ module: "hr", name: "HR draft reviewer" }, { module: "dms", name: "DMS intake" }];
    expect(registeredModules(registry)).toEqual(["dms", "hr"]);
    expect(agentsInModule("all", registry)).toHaveLength(2);
    expect(agentsInModule("hr", registry).map(agent => agent.name)).toEqual(["HR draft reviewer"]);
  });

  it("registers the route with normal DMS view permission", () => {
    expect(Object.keys(ROUTE_ACCESS_REGISTRY)).toContain("/ai-agent-center");
    expect(canAccessRoute("/ai-agent-center", [], false)).toBe(false);
    expect(canAccessRoute("/ai-agent-center", ["dms.documents.view"], false)).toBe(true);
  });
});
