/**
 * OUTPUT.7 (WP11) — Pure schedules-worker helpers (no server dependencies).
 * Kept separate from schedule-worker.ts so they are unit-testable.
 */

export const LEASE_MINUTES = 10;
export const RETRY_BACKOFF_MINUTES = 5; // linear: attempt N retries after N * 5 minutes

const OFFICIAL_CLASSES = new Set(["A", "B", "C", "D"]);

/** Idempotency key: one run per (schedule, due slot). */
export function buildRunKey(scheduleId: number, dueSlotIso: string): string {
  return `sched-${scheduleId}-${Date.parse(dueSlotIso)}`;
}

export function retryBackoffMs(attemptCount: number): number {
  return attemptCount * RETRY_BACKOFF_MINUTES * 60_000;
}

/**
 * Output class policy: official classes A–D must never run on a schedule
 * (no scheduled official issuance and no scheduled public QR).
 */
export function isSchedulableClass(documentClass: string | null | undefined): boolean {
  if (!documentClass) return true;
  return !OFFICIAL_CLASSES.has(documentClass);
}

/** Keep failure reasons operational — never include secrets or recipient PII. */
export function sanitizeFailureReason(reason: string): string {
  return reason
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(api[-_]?key|secret|password|token)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .slice(0, 500);
}

export { calculateNextRunAt } from "./schedule-calendar";
