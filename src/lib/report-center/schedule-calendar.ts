/** Calendar policy: clamp month-end; skip nonexistent DST times; use the first
 * occurrence of an ambiguous wall time (never twice on the same local date).
 * No external I/O; `after` makes boundary tests deterministic. */
export function calculateNextRunAt(
  frequency: "daily" | "weekly" | "monthly",
  dayOfWeek: number | null,
  dayOfMonth: number | null,
  timeOfDay: string,
  timezone: string,
  after: Date = new Date(),
): string {
  if (!Number.isFinite(after.getTime())) throw new Error("Invalid schedule reference time");
  if (!["daily", "weekly", "monthly"].includes(frequency)) throw new Error("Invalid frequency");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(timeOfDay)) throw new Error("Invalid schedule time");
  const dow = dayOfWeek ?? 0, dom = dayOfMonth ?? 1;
  if (frequency === "weekly" && (!Number.isInteger(dow) || dow < 0 || dow > 6)) throw new Error("Invalid weekday");
  if (frequency === "monthly" && (!Number.isInteger(dom) || dom < 1 || dom > 31)) throw new Error("Invalid month day");
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || "Asia/Dubai", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const wall = (ms: number) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(p => [p.type, p.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  };
  const local = new Date(wall(after.getTime()));
  const [h, m] = timeOfDay.split(":").map(Number);
  // Iterate calendar dates, not fixed elapsed 24-hour increments in the zone.
  for (let days = 0; days < 400; days++) {
    const date = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days));
    const year = date.getUTCFullYear(), month = date.getUTCMonth(), day = date.getUTCDate();
    if (frequency === "weekly" && date.getUTCDay() !== dow) continue;
    const end = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    if (frequency === "monthly" && day !== Math.min(dom, end)) continue;
    const wanted = Date.UTC(year, month, day, h, m);
    // Both sides of an offset transition, including non-hour offsets. A UTC
    // candidate must round-trip the entire local date, not just hour/minute.
    const offsets = new Set<number>();
    for (let delta = -48; delta <= 48; delta += 6) {
      const probe = wanted + delta * 3_600_000;
      offsets.add(wall(probe) - probe);
    }
    const matches = [...offsets].map(offset => wanted - offset)
      .filter(instant => wall(instant) === wanted).sort((a, b) => a - b);
    // Choose first ambiguous occurrence before checking `after`; otherwise a
    // just-executed first occurrence would incorrectly schedule the second.
    if (matches.length && matches[0] > after.getTime()) return new Date(matches[0]).toISOString();
  }
  throw new Error("No valid calendar occurrence within search horizon");
}
