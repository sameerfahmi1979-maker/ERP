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

// ─────────────────────────────────────────────────────────────────────────────
// Timezone-aware next-run calculation (built-in Intl — no external dependency)
// ─────────────────────────────────────────────────────────────────────────────

function getLocalParts(date: Date, timezone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  return {
    year: get("year"),
    month: get("month") - 1,
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    dayOfWeek: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      parts.find((p) => p.type === "weekday")?.value ?? "Sun"
    ),
  };
}

function localToUtc(
  year: number,
  month0: number,
  day: number,
  hours: number,
  minutes: number,
  timezone: string
): Date {
  const approx = new Date(Date.UTC(year, month0, day, hours, minutes, 0, 0));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(approx);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  const localH = get("hour") % 24;
  const localM = get("minute");
  const diffMs = ((hours - localH) * 60 + (minutes - localM)) * 60_000;
  return new Date(approx.getTime() + diffMs);
}

export function calculateNextRunAt(
  frequency: "daily" | "weekly" | "monthly",
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  timeOfDay: string,
  timezone: string
): string {
  const tz = timezone || "Asia/Dubai";
  const now = new Date();
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  const local = getLocalParts(now, tz);

  if (frequency === "daily") {
    let next = localToUtc(local.year, local.month, local.day, hours, minutes, tz);
    if (next <= now) {
      const tomorrow = new Date(now.getTime() + 86_400_000);
      const t = getLocalParts(tomorrow, tz);
      next = localToUtc(t.year, t.month, t.day, hours, minutes, tz);
    }
    return next.toISOString();
  }

  if (frequency === "weekly") {
    const targetDow = dayOfWeek ?? 0;
    const daysUntil = (targetDow - local.dayOfWeek + 7) % 7 || 7;
    const target = new Date(now.getTime() + daysUntil * 86_400_000);
    const t = getLocalParts(target, tz);
    const next = localToUtc(t.year, t.month, t.day, hours, minutes, tz);
    return next.toISOString();
  }

  // monthly
  const targetDay = dayOfMonth ?? 1;
  let next = localToUtc(local.year, local.month, targetDay, hours, minutes, tz);
  if (next <= now) {
    const nextMonth = local.month + 1;
    const nextYear = nextMonth > 11 ? local.year + 1 : local.year;
    const adjustedMonth = nextMonth > 11 ? 0 : nextMonth;
    next = localToUtc(nextYear, adjustedMonth, targetDay, hours, minutes, tz);
  }
  return next.toISOString();
}
