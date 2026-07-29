import { describe, it, expect } from "vitest";
import {
  buildRunKey,
  retryBackoffMs,
  isSchedulableClass,
  sanitizeFailureReason,
} from "@/lib/report-center/schedule-worker-core";
import { calculateNextRunAt } from "@/lib/report-center/schedule-worker-core";

describe("schedule-worker run keys (idempotency)", () => {
  it("is deterministic for the same schedule + due slot", () => {
    expect(buildRunKey(1, "2026-07-03T07:00:00+00:00")).toBe(
      buildRunKey(1, "2026-07-03T07:00:00+00:00")
    );
  });

  it("is equal across ISO representations of the same instant", () => {
    expect(buildRunKey(1, "2026-07-03T07:00:00.000Z")).toBe(
      buildRunKey(1, "2026-07-03T07:00:00+00:00")
    );
  });

  it("differs per schedule and per slot", () => {
    expect(buildRunKey(1, "2026-07-03T07:00:00Z")).not.toBe(buildRunKey(2, "2026-07-03T07:00:00Z"));
    expect(buildRunKey(1, "2026-07-03T07:00:00Z")).not.toBe(buildRunKey(1, "2026-07-04T07:00:00Z"));
  });
});

describe("schedule-worker retry backoff", () => {
  it("uses linear backoff of 5 minutes per attempt", () => {
    expect(retryBackoffMs(1)).toBe(5 * 60_000);
    expect(retryBackoffMs(2)).toBe(10 * 60_000);
    expect(retryBackoffMs(3)).toBe(15 * 60_000);
  });
});

describe("schedule-worker output class policy", () => {
  it("refuses official classes A-D (no scheduled official issuance or public QR)", () => {
    for (const c of ["A", "B", "C", "D"]) {
      expect(isSchedulableClass(c)).toBe(false);
    }
  });

  it("allows analytical/export classes and unclassified reports", () => {
    for (const c of ["E", "F", "G", null, undefined, ""]) {
      expect(isSchedulableClass(c)).toBe(true);
    }
  });
});

describe("schedule-worker failure reason sanitization", () => {
  it("redacts bearer tokens and secret-like pairs", () => {
    const out = sanitizeFailureReason(
      "SMTP error: Bearer abc123XYZ rejected; api_key=sk-live-999 password: hunter2"
    );
    expect(out).not.toContain("abc123XYZ");
    expect(out).not.toContain("sk-live-999");
    expect(out).not.toContain("hunter2");
    expect(out).toContain("[redacted]");
  });

  it("caps length at 500 chars", () => {
    expect(sanitizeFailureReason("x".repeat(2000)).length).toBe(500);
  });
});

describe("calculateNextRunAt", () => {
  it("returns a future instant for daily schedules", () => {
    const next = new Date(calculateNextRunAt("daily", null, null, "07:00", "Asia/Dubai"));
    expect(next.getTime()).toBeGreaterThan(Date.now());
    // Never more than 24h + tz wiggle away.
    expect(next.getTime() - Date.now()).toBeLessThanOrEqual(24.5 * 3600 * 1000);
  });

  it("returns the requested weekday for weekly schedules", () => {
    const iso = calculateNextRunAt("weekly", 1, null, "09:30", "Asia/Dubai");
    const localDay = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dubai", weekday: "short" })
      .format(new Date(iso));
    expect(localDay).toBe("Mon");
  });

  it("returns the requested day-of-month for monthly schedules", () => {
    const iso = calculateNextRunAt("monthly", null, 15, "06:00", "Asia/Dubai");
    const localDate = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dubai", day: "numeric" })
      .format(new Date(iso));
    expect(localDate).toBe("15");
    expect(new Date(iso).getTime()).toBeGreaterThan(Date.now());
  });
});
