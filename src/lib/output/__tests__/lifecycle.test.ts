import { describe, it, expect } from "vitest";
import {
  LIFECYCLE_STATES,
  canTransition,
  assertTransition,
  isRetryable,
  isTerminal,
  canActivatePublicToken,
  serialStatusOnTransition,
  stageTimestampColumn,
  isLifecycleState,
} from "../lifecycle";

describe("output lifecycle state machine", () => {
  it("happy path pending → rendering → uploaded → issued", () => {
    expect(canTransition("pending", "rendering")).toBe(true);
    expect(canTransition("rendering", "uploaded")).toBe(true);
    expect(canTransition("uploaded", "issued")).toBe(true);
  });

  it("forbids skipping stages", () => {
    expect(canTransition("pending", "issued")).toBe(false);
    expect(canTransition("pending", "uploaded")).toBe(false);
    expect(canTransition("rendering", "issued")).toBe(false);
  });

  it("issued is terminal — nothing transitions out", () => {
    for (const to of LIFECYCLE_STATES) {
      expect(canTransition("issued", to)).toBe(false);
    }
    expect(isTerminal("issued")).toBe(true);
  });

  it("failed_terminal and cancelled are dead ends", () => {
    for (const to of LIFECYCLE_STATES) {
      expect(canTransition("failed_terminal", to)).toBe(false);
      expect(canTransition("cancelled", to)).toBe(false);
    }
  });

  it("retry is only legal from failed_retryable / reconciliation_required", () => {
    expect(isRetryable("failed_retryable")).toBe(true);
    expect(isRetryable("reconciliation_required")).toBe(true);
    expect(isRetryable("pending")).toBe(false);
    expect(isRetryable("issued")).toBe(false);
    expect(canTransition("failed_retryable", "rendering")).toBe(true);
  });

  it("reconciliation can complete to issued or fail terminally", () => {
    expect(canTransition("reconciliation_required", "issued")).toBe(true);
    expect(canTransition("reconciliation_required", "failed_terminal")).toBe(true);
    expect(canTransition("uploaded", "reconciliation_required")).toBe(true);
  });

  it("QR activation is only allowed from issued (activation-last)", () => {
    for (const s of LIFECYCLE_STATES) {
      expect(canActivatePublicToken(s)).toBe(s === "issued");
    }
  });

  it("assertTransition throws on illegal move", () => {
    expect(() => assertTransition("pending", "issued")).toThrow(/Illegal/);
    expect(() => assertTransition("pending", "rendering")).not.toThrow();
  });

  it("failed/voided serial is never recycled", () => {
    expect(serialStatusOnTransition("failed_terminal", true)).toBe("voided");
    expect(serialStatusOnTransition("cancelled", true)).toBe("voided");
    expect(serialStatusOnTransition("issued", true)).toBe("issued");
    expect(serialStatusOnTransition("failed_retryable", true)).toBe("reserved");
    expect(serialStatusOnTransition("failed_terminal", false)).toBeNull();
  });

  it("maps stage timestamps", () => {
    expect(stageTimestampColumn("rendering")).toBe("rendering_started_at");
    expect(stageTimestampColumn("uploaded")).toBe("uploaded_at");
    expect(stageTimestampColumn("issued")).toBe("issued_at");
    expect(stageTimestampColumn("failed_terminal")).toBe("failed_at");
    expect(stageTimestampColumn("cancelled")).toBe("cancelled_at");
  });

  it("validates state strings", () => {
    expect(isLifecycleState("issued")).toBe(true);
    expect(isLifecycleState("done")).toBe(false);
    expect(isLifecycleState(null)).toBe(false);
  });
});
