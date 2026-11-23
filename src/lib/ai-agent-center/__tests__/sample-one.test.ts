import { describe, expect, it } from "vitest";
import { SAMPLE_ONE } from "./sample-one";

describe("Sample 1 baseline", () => {
  it("uses separate synthetic CICPA cases and a fixed clock", () => {
    expect(SAMPLE_ONE.selectedCase.title).toBe("CICPA Onshore");
    expect(SAMPLE_ONE.attention.title).toBe("CICPA Offshore");
    expect(Date.parse(SAMPLE_ONE.now) - Date.parse(SAMPLE_ONE.selectedCase.startedAt)).toBe(24_000);
    expect(SAMPLE_ONE.intake.completedUnits / SAMPLE_ONE.intake.totalUnits).toBe(0.6);
    expect(Date.parse(SAMPLE_ONE.nextScanAt)).toBeGreaterThan(Date.parse(SAMPLE_ONE.now));
  });
});
