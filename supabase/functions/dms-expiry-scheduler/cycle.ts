/** Compare calendar dates independently of the scheduler's runtime timezone. */
export function reminderMatchesExpiryCycle(reminderDate: unknown, daysBefore: unknown, expiryDate: unknown): boolean {
  if (typeof reminderDate !== "string" || typeof expiryDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(reminderDate) || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) ||
      typeof daysBefore !== "number" || !Number.isInteger(daysBefore) || daysBefore < 0 || daysBefore > 365) {
    return false;
  }
  const due = new Date(`${reminderDate}T00:00:00Z`);
  if (!Number.isFinite(due.getTime()) || due.toISOString().slice(0, 10) !== reminderDate) return false;
  due.setUTCDate(due.getUTCDate() + daysBefore);
  return due.toISOString().slice(0, 10) === expiryDate;
}
