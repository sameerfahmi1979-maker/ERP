import { describe, expect, it } from "vitest";
import { getMeasuredProgress, getConfirmedHandoff, dubaiTime } from "../progress";
import { SAMPLE_ONE } from "./sample-one";

describe("worker receipt progress", () => {
  it("reports known counts and rounds down", () => {
    expect(getMeasuredProgress(SAMPLE_ONE.intake)).toEqual({ completed: 12, total: 20, percent: 60 });
    expect(getMeasuredProgress({ completedUnits: 1, totalUnits: 2 })?.percent).toBe(50);
    expect(getMeasuredProgress({ completedUnits: 2, totalUnits: 3 })?.percent).toBe(66);
  });

  it("rejects unknown, empty, fractional or invalid progress", () => {
    for (const value of [null, { completedUnits: 0, totalUnits: 0 }, { completedUnits: 1, totalUnits: 0 },
      { completedUnits: -1, totalUnits: 2 }, { completedUnits: 3, totalUnits: 2 },
      { completedUnits: 1.5, totalUnits: 2 }]) expect(getMeasuredProgress(value)).toBeNull();
  });

  it("moves a selected case for a new confirmed handoff only", () => {
    const before = { id: SAMPLE_ONE.selectedCase.id, stage: "extraction", updatedAt: "2026-11-20T06:44:00Z" } as const;
    const after = { ...before, stage: "validation", updatedAt: "2026-11-20T06:45:00Z" } as const;
    expect(getConfirmedHandoff(before, after)).toEqual({ from: "extraction", to: "validation" });
    expect(getConfirmedHandoff(after, before)).toBeNull();
    expect(getConfirmedHandoff(after, after)).toBeNull();
    expect(getConfirmedHandoff(before, { ...after, id: "different-case" })).toBeNull();
  });

  it("renders time in Dubai across UTC midnight", () => {
    expect(dubaiTime("2026-11-20T20:00:00Z")).toBe("00:00");
  });
});
