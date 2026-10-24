/** Existing dashboard vocabulary, aligned with the native mutation contracts.
 * Counts describe records unless a metric explicitly says distinct employees.
 * Dubai is the business calendar; ISO instants remain UTC for transport. */
export const HR_OPEN_ACTION_STATES = ['open', 'in_progress'] as const;
export const HR_OPEN_EOS_STATES = ['draft', 'notice_served', 'clearance_in_progress', 'pending_final_settlement'] as const;
export const HR_ACTIVE_CANDIDATE_STATES = ['new', 'screening', 'shortlisted', 'interview', 'selected', 'offered', 'accepted'] as const;
export const HR_PENDING_ONBOARDING_STATES = ['pending', 'in_progress', 'blocked'] as const;
const employeeStatuses=['active','probation','on_leave','inactive','suspended','terminated','archived'] as const;
/** A list hint only; server RLS remains authoritative. Never accept arbitrary
 * predicates, duplicate URL values, or unknown states from a dashboard link. */
export function employeeDashboardStatus(value:unknown):string|undefined {
  return typeof value==='string'&&employeeStatuses.some(s=>s===value)?value:undefined;
}

export function hrDashboardCalendar(now = new Date(), thresholdDays = 60) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(now);
  const part = (kind: string) => parts.find(p => p.type === kind)!.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const day = new Date(today + 'T00:00:00Z');
  const offset = (days: number) => new Date(day.getTime() + days * 86400000).toISOString().slice(0, 10);
  const sunday = -day.getUTCDay();
  const weekStart = offset(sunday), nextWeek = offset(sunday + 7);
  return {today, month: today.slice(0, 7) + '-01', soon: offset(thresholdDays),
    future: offset, weekStart, nextWeek,
    weekStartInstant: weekStart + 'T00:00:00+04:00', nextWeekInstant: nextWeek + 'T00:00:00+04:00',
    monthStartInstant: today.slice(0, 7) + '-01T00:00:00+04:00', tomorrowInstant: offset(1) + 'T00:00:00+04:00'};
}
