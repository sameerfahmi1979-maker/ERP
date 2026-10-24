import {expect,it} from 'vitest';
import {hrDashboardCalendar,employeeDashboardStatus} from '@/lib/hr/dashboard-metrics';
it.each([
 ['2026-10-31T19:59:59.999Z','2026-10-31','2026-10-01'],
 ['2026-10-31T20:00:00Z','2026-11-01','2026-11-01'],
 ['2028-02-28T20:00:00Z','2028-02-29','2028-02-01'],
 ['2026-12-31T20:00:00Z','2027-01-01','2027-01-01'],
])('Dubai calendar %s remains host independent',(instant,today,month)=>{
 expect(hrDashboardCalendar(new Date(instant),0)).toMatchObject({today,month,soon:today});
});
it.each(['active','probation','on_leave','inactive','suspended','terminated','archived'])('only supported employee list status %s is a valid hint',status=>expect(employeeDashboardStatus(status)).toBe(status));
it.each([undefined,null,['active','inactive'],'unknown','active,deleted_at.not.is.null',1])('invalid or repeated status hint cannot become a filter',value=>expect(employeeDashboardStatus(value)).toBeUndefined());
it('week stays Sunday through Saturday, with half-open offset-qualified instants',()=>{
 expect(hrDashboardCalendar(new Date('2026-10-04T08:00:00Z'))).toMatchObject({weekStart:'2026-10-04',nextWeek:'2026-10-11',weekStartInstant:'2026-10-04T00:00:00+04:00',nextWeekInstant:'2026-10-11T00:00:00+04:00'});
});
