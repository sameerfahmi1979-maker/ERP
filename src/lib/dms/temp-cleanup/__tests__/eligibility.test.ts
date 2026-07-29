import { describe, it, expect } from "vitest";
import {
  evaluateSessionEligibility,
  resolveRetentionHours,
  findOrphanFolders,
  type DmsTempCleanupSettings,
  type CleanupSessionInput,
} from "../eligibility";

const SETTINGS: DmsTempCleanupSettings = {
  enabled: true,
  retention_hours_completed: 24,
  retention_hours_cancelled: 24,
  retention_hours_failed: 168,
  retention_hours_expired: 336,
  batch_size: 100,
  legal_hold_prefixes: ["sessions/HOLDCASE"],
  manual_retain_session_ids: [42],
};

const NOW = new Date("2026-07-26T12:00:00Z");

function session(overrides: Partial<CleanupSessionInput>): CleanupSessionInput {
  return {
    id: 1,
    status: "completed",
    temp_storage_path: "sessions/ABC123/file.pdf",
    temp_cleaned_at: null,
    uploaded_at: "2026-07-20T12:00:00Z", // 6 days old
    ...overrides,
  };
}

describe("dms-temp cleanup eligibility", () => {
  it("old completed session with temp path is eligible", () => {
    expect(evaluateSessionEligibility(session({}), SETTINGS, NOW)).toEqual({ eligible: true });
  });

  it("active statuses are never eligible", () => {
    for (const s of ["uploaded", "ready_to_attach", "duplicate_detected", "processing"]) {
      expect(evaluateSessionEligibility(session({ status: s }), SETTINGS, NOW)).toEqual({
        eligible: false,
        reason: "active_status",
      });
    }
  });

  it("already-cleaned sessions are skipped", () => {
    expect(
      evaluateSessionEligibility(session({ temp_cleaned_at: "2026-07-21T00:00:00Z" }), SETTINGS, NOW)
    ).toEqual({ eligible: false, reason: "already_cleaned" });
  });

  it("sessions with no temp path are skipped", () => {
    expect(evaluateSessionEligibility(session({ temp_storage_path: null }), SETTINGS, NOW)).toEqual({
      eligible: false,
      reason: "no_temp_path",
    });
  });

  it("respects per-status retention windows", () => {
    // failed keeps 168h — a 6-day-old failed session is NOT eligible
    expect(evaluateSessionEligibility(session({ status: "failed" }), SETTINGS, NOW)).toEqual({
      eligible: false,
      reason: "too_recent",
    });
    // ... but an 8-day-old failed session is
    expect(
      evaluateSessionEligibility(
        session({ status: "failed", uploaded_at: "2026-07-18T00:00:00Z" }),
        SETTINGS,
        NOW
      )
    ).toEqual({ eligible: true });
    expect(resolveRetentionHours("expired", SETTINGS)).toBe(336);
  });

  it("too-recent completed sessions are skipped", () => {
    expect(
      evaluateSessionEligibility(session({ uploaded_at: "2026-07-26T02:00:00Z" }), SETTINGS, NOW)
    ).toEqual({ eligible: false, reason: "too_recent" });
  });

  it("legal-hold prefixes are never deleted", () => {
    expect(
      evaluateSessionEligibility(
        session({ temp_storage_path: "sessions/HOLDCASE99/contract.pdf" }),
        SETTINGS,
        NOW
      )
    ).toEqual({ eligible: false, reason: "legal_hold_prefix" });
  });

  it("empty legal-hold prefix does not match everything", () => {
    const s = { ...SETTINGS, legal_hold_prefixes: [""] };
    expect(evaluateSessionEligibility(session({}), s, NOW)).toEqual({ eligible: true });
  });

  it("manual retain list is honored", () => {
    expect(evaluateSessionEligibility(session({ id: 42 }), SETTINGS, NOW)).toEqual({
      eligible: false,
      reason: "manual_retain",
    });
  });

  it("orphan reconciliation flags storage folders without session rows", () => {
    const orphans = findOrphanFolders(["AAA", "BBB", "CCC"], new Set(["AAA", "CCC"]));
    expect(orphans).toEqual(["BBB"]);
    expect(findOrphanFolders([], new Set())).toEqual([]);
  });
});
