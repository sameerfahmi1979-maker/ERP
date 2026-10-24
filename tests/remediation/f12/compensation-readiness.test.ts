import {expect,it} from 'vitest';
import {checkWpsReadiness,type WpsReadinessInput} from '@/lib/hr/payroll/wps-readiness';
import {payrollEmploymentEligible} from '@/lib/hr/payroll/salary-as-of';
const valid:WpsReadinessInput={wpsProfile:{wps_applicable:true,wps_status:'active',bank_id:1,account_number:'000123',iban:'SYNTHETIC_ONLY',exchange_house:null,salary_payment_method:'bank_transfer',labour_card_number:'SYNTHETIC_ONLY',mohre_person_code:null},hasActivePayrollHold:false,hasSalaryComponents:true,grossSalary:1000.01,payrollStatus:'active'};
it.each([NaN,Infinity,-Infinity])('nonfinite salary %s cannot be Ready',grossSalary=>expect(checkWpsReadiness({...valid,grossSalary})).toMatchObject({status:'incomplete',missingRequirements:expect.arrayContaining(['Salary is unavailable'])}));
it.each(['inactive','hold','not_configured','unknown'])('profile %s cannot be Ready',payrollStatus=>expect(checkWpsReadiness({...valid,payrollStatus})).toMatchObject({status:'incomplete',missingRequirements:expect.arrayContaining(['Payroll profile is not active'])}));
it.each(['unknown',''])('unknown payment method %s cannot be Ready',salary_payment_method=>expect(checkWpsReadiness({...valid,wpsProfile:{...valid.wpsProfile!,salary_payment_method}}).status).toBe('incomplete'));
it('unknown WPS status cannot be Ready',()=>expect(checkWpsReadiness({...valid,wpsProfile:{...valid.wpsProfile!,wps_status:'unknown'}}).status).toBe('incomplete'));
it('internal readiness does not imply paid or bank acceptance',()=>{const r=checkWpsReadiness(valid);expect(r).toEqual({status:'ready',missingRequirements:[]});expect(r).not.toHaveProperty('paid');expect(r).not.toHaveProperty('bankAccepted');});
it('hold and exemption remain distinct states',()=>{expect(checkWpsReadiness({...valid,hasActivePayrollHold:true}).status).toBe('on_hold');expect(checkWpsReadiness({...valid,wpsProfile:{...valid.wpsProfile!,wps_applicable:false}}).status).toBe('exempt');});
it.each(['inactive','suspended','terminated','archived'])('%s employment cannot be operationally Ready',employee_status=>{
 const employmentEligible=payrollEmploymentEligible({employee_status,joining_date:'2020-01-01'},'2026-10-24');expect(employmentEligible).toBe(false);expect(checkWpsReadiness({...valid,employmentEligible}).status).toBe('incomplete');
});
it.each(['active','on_leave','probation'])('%s does not invent a new pay deduction rule',employee_status=>expect(payrollEmploymentEligible({employee_status,joining_date:'2020-01-01'},'2026-10-24')).toBe(true));
it('future joining and unknown employment context cannot become Ready',()=>{
 expect(payrollEmploymentEligible({employee_status:'active',joining_date:'2030-01-01'},'2026-10-24')).toBe(false);
 expect(()=>payrollEmploymentEligible({employee_status:'unknown',joining_date:'2020-01-01'},'2026-10-24')).toThrow();
 expect(()=>payrollEmploymentEligible({employee_status:'active',joining_date:'bad'},'2026-10-24')).toThrow();
});
