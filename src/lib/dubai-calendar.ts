const DAY_MS = 86_400_000;
const DUBAI_OFFSET_MS = 4 * 3_600_000;
const punchFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC", day: "2-digit", month: "short", year: "numeric",
});

export function dubaiBusinessDate(now = Date.now(), daysAhead = 0): string {
  return new Date(now + DUBAI_OFFSET_MS + daysAhead * DAY_MS).toISOString().slice(0, 10);
}

function dateOnlyMs(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
  const value = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date ? value : NaN;
}

export function businessDateStart(date: string, daysAhead = 0): string {
  const value = dateOnlyMs(date);
  if (!Number.isFinite(value)) throw new Error("Select a valid business date.");
  return new Date(value - DUBAI_OFFSET_MS + daysAhead * DAY_MS).toISOString();
}

export function daysUntilBusinessDate(date: string | null, asOf = dubaiBusinessDate()): number | null {
  if (!date) return null;
  const days = (dateOnlyMs(date) - dateOnlyMs(asOf)) / DAY_MS;
  return Number.isFinite(days) ? days : null;
}

export function msUntilDubaiMidnight(now = Date.now()): number {
  return DAY_MS - (now + DUBAI_OFFSET_MS) % DAY_MS;
}

export function formatBusinessDate(date: string): string {
  const value = dateOnlyMs(date);
  return Number.isFinite(value) ? dateFormatter.format(value) : "";
}

export function formatDubaiPunch(timestamp: string | null): string {
  if (!timestamp) return "";
  const value = Date.parse(timestamp);
  if (!Number.isFinite(value)) throw new Error("Attendance punch time could not be read.");
  return `${dubaiBusinessDate(value)} ${punchFormatter.format(value)}`;
}
