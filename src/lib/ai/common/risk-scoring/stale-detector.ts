/**
 * ERP COMMON AI.5 — Stale Score Detection
 */

export function isScoreStaleByAge(calculatedAt: string, maxAgeHours = 24): boolean {
  const calculated = new Date(calculatedAt).getTime();
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  return calculated < cutoff;
}

export function isScoreStaleBySources(
  calculatedAt: string,
  sourceTimestamps: Array<string | null | undefined>
): boolean {
  const calculatedMs = new Date(calculatedAt).getTime();
  for (const ts of sourceTimestamps) {
    if (!ts) continue;
    const sourceMs = new Date(ts).getTime();
    if (sourceMs > calculatedMs) return true;
  }
  return false;
}

export function computeIsStale(
  calculatedAt: string,
  staleAt: string | null,
  status: string,
  sourceTimestamps: Array<string | null | undefined> = []
): boolean {
  if (status === "stale" || staleAt != null) return true;
  if (isScoreStaleByAge(calculatedAt)) return true;
  return isScoreStaleBySources(calculatedAt, sourceTimestamps);
}
