import {expect,it} from 'vitest';import {hrServiceGuidance} from '@/lib/hr/service-holds';
it('only allowlisted definite business holds become visible guidance',()=>{
 expect(hrServiceGuidance('23514','Owner clearance cannot be relabelled as HR clearance')).toContain('cannot be relabelled');
 expect(hrServiceGuidance('23514','PRIVATE_SQL_DATA')).toBeUndefined();
 expect(hrServiceGuidance('42501','Owner clearance cannot be relabelled as HR clearance')).toBeUndefined();
 expect(hrServiceGuidance('23514','Owner clearance cannot be relabelled as HR clearance PRIVATE_SQL_DATA')).toBeUndefined();
});
it('separation date validation has static guidance, not raw failed-row details',()=>expect(hrServiceGuidance('23514','new row for relation "employee_eos_cases" violates check constraint "f12_separation_date_order"')).toBe('Employment end date must be on or after the notice and last working dates.'));
