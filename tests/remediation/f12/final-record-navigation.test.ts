import {expect,it} from 'vitest';import {employeeRecordSection,canApplyEmployeeSectionHint} from '@/lib/hr/employee-navigation';
it.each(['payroll','hr-actions','compliance','operations','time','letters'])('existing section %s is a navigation hint only',s=>expect(employeeRecordSection(s)).toBe(s));
it.each([undefined,null,['payroll'],'admin','../payroll',1])('invalid or repeated section cannot enter the form',s=>expect(employeeRecordSection(s)).toBeUndefined());
it.each([{pending:true,active:true},{pending:false,active:false},{pending:true,active:false}])('busy or hidden retained forms do not switch sections: %j',({pending,active})=>expect(canApplyEmployeeSectionHint('payroll','profile',pending,active)).toBe(false));
it('a new active explicit section is applied once, not repeatedly after user navigation',()=>{expect(canApplyEmployeeSectionHint('payroll','profile',false,true)).toBe(true);expect(canApplyEmployeeSectionHint('payroll','payroll',false,true)).toBe(false);});
