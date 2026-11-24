import { describe, expect, it } from "vitest";
import { classifyFeed, readWithinAuthority, retainNewest, SAFE_REFRESH_MS } from "../live";
import { SAMPLE_ONE } from "./sample-one";

describe("scoped live updates", () => {
  const confirmedAt = SAMPLE_ONE.now;
  const now = Date.parse(confirmedAt);

  it("distinguishes fresh, delayed and stale snapshots", () => {
    expect(SAFE_REFRESH_MS).toBe(15_000);
    expect(classifyFeed(confirmedAt, now, false)).toBe("live");
    expect(classifyFeed(confirmedAt, now + 16_000, true)).toBe("delayed");
    expect(classifyFeed(confirmedAt, now + 45_000, true)).toBe("stale");
    expect(classifyFeed(null, now, false)).toBe("loading");
    expect(classifyFeed(null, now, true)).toBe("delayed");
  });

  it("never replaces confirmed current-scope data with an older response", () => {
    const newer = { confirmedAt: "2026-11-20T06:44:25Z", caseId: "new" };
    const older = { confirmedAt, caseId: "old" };
    expect(retainNewest(newer, older)).toBe(newer);
    expect(retainNewest(older, newer)).toBe(newer);
  });

  it("discards an earlier authorized response after a denied read", async () => {
    let denial = 0;
    const authority = { active: () => true, denialVersion: () => denial, revoke: () => { denial++; } };
    const forbidden = new Error("denied");
    const lostAccess = (error: unknown) => error === forbidden;
    let release: (value: string) => void = () => {};
    const pending = readWithinAuthority(authority, () => new Promise<string>(resolve => { release = resolve; }), lostAccess);
    await expect(readWithinAuthority(authority, () => Promise.reject(forbidden), lostAccess)).rejects.toBe(forbidden);
    release("previously authorized receipt");
    await expect(pending).rejects.toHaveProperty("name", "AbortError");
  });
});
