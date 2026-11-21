export function attendanceWorkedFacts(recordedHours: number | null | undefined, workedMinutes: number | null | undefined) {
  if (workedMinutes != null && Number.isInteger(workedMinutes) && workedMinutes >= 0 && workedMinutes <= 1440) {
    return { minutes: workedMinutes, hours: Math.round(workedMinutes * 100 / 60) / 100, state: "Verified" as const };
  }
  if (recordedHours != null && Number.isFinite(recordedHours) && recordedHours >= 0) {
    return { minutes: null, hours: recordedHours, state: "Recorded only" as const };
  }
  return { minutes: null, hours: null, state: "Unknown" as const };
}
