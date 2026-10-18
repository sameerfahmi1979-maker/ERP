import {expect,it} from 'vitest';
import {REPORT_FILTER_CONTRACTS,reportFilterKeys} from '@/lib/report-center/filter-contract';
it.each([null,undefined,{},[],{filters:null},{filters:[null]}])('repairs the missing profile subject selector for legacy schema %j',schema=>{expect(reportFilterKeys('HR_EMPLOYEE_PROFILE',schema)).toEqual(['employee_id']);});
it('retains registered filters without duplicating or omitting the required subject',()=>{expect(reportFilterKeys('HR_EMPLOYMENT_LETTER',{filters:['employee_id','purpose']})).toEqual(['employee_id','purpose']);});
it('does not invent unsupported filters for unknown registrations',()=>{expect(reportFilterKeys('UNKNOWN',null)).toEqual([]);});
it('restores implemented analytical criteria for legacy null schemas',()=>{expect(reportFilterKeys('HR_EMPLOYEE_LIST',null)).toEqual(REPORT_FILTER_CONTRACTS.HR_EMPLOYEE_LIST);expect(reportFilterKeys('HR_EMPLOYEE_LIST',null)).toContain('owner_company_id');});
