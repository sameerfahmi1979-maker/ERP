import { calculateNextRunAt } from './schedule-calendar';

export interface DueScheduleSlot {
  id: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  day_of_week: number | null;
  day_of_month: number | null;
  time_of_day: string;
  timezone: string;
  next_run_at: string;
  updated_at: string;
}

/** Caller must explicitly choose how overdue slots are handled at cutover.
 * No implicit historical backlog replay. One bad schedule cannot stop others. */
export async function reserveScheduleSlots(
  schedules: DueScheduleSlot[],
  policy: 'one-slot-at-a-time' | 'skip-missed-after-current',
  reserve: (schedule: DueScheduleSlot, nextDue: string) => Promise<number | null>,
  now = new Date(),
): Promise<{ reserved: number; conflicted: number; invalid: number }> {
  if (!['one-slot-at-a-time','skip-missed-after-current'].includes(policy)) throw new Error('Missing catch-up policy');
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid reference clock');
  const totals = { reserved: 0, conflicted: 0, invalid: 0 };
  for (const schedule of schedules) {
    try {
      const original = new Date(schedule.next_run_at);
      if (!Number.isFinite(original.getTime())) throw new Error('Invalid due slot');
      if (original > now) { totals.conflicted++; continue; }
      const after = policy === 'one-slot-at-a-time' ? original : now;
      const nextDue = calculateNextRunAt(schedule.frequency, schedule.day_of_week, schedule.day_of_month,
        schedule.time_of_day, schedule.timezone, after);
      if (await reserve(schedule, nextDue) === null) totals.conflicted++; else totals.reserved++;
    } catch { totals.invalid++; }
  }
  return totals;
}
