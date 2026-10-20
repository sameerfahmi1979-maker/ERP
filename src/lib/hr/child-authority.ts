import type{AuthContext}from'@/lib/rbac/check';
import{hasPermission}from'@/lib/rbac/scope';
import type{ChildKind}from'./child-save-contract';
/** UI/server admission only; native employee-scoped RLS is always authoritative. */
export function canUseHrChild(ctx:AuthContext,kind?:ChildKind):boolean{
 if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password)return false;
 const base=['hr.actions.view','hr.actions.manage'].every(code=>hasPermission(ctx,code));
 const eos=['hr.actions.view','hr.eos.view'].some(code=>hasPermission(ctx,code))&&['hr.actions.manage','hr.eos.manage'].some(code=>hasPermission(ctx,code));
 const assignments=['hr.assignments.view','hr.assignments.manage'].every(code=>hasPermission(ctx,code));
 const payroll=['hr.payroll.view','hr.payroll.manage'].every(code=>hasPermission(ctx,code));
 const compliance=['hr.compliance.view','hr.compliance.manage'].every(code=>hasPermission(ctx,code)),medical=['hr.medical.view','hr.medical.manage'].every(code=>hasPermission(ctx,code));
 const attendance=['hr.attendance.view','hr.attendance.manage'].every(code=>hasPermission(ctx,code)),leave=['hr.leave.view','hr.leave.manage'].every(code=>hasPermission(ctx,code));
 if(kind===undefined)return base||eos||assignments||payroll||attendance||leave||compliance||medical;
 if(['medical-insurance','medical-record'].includes(kind))return medical;
 if(['identity-document','access-card','training-certificate'].includes(kind))return compliance;
 if(['leave-request','leave-balance'].includes(kind))return leave;
 if(['attendance-summary','attendance-punch','shift-assignment','overtime'].includes(kind))return attendance;
 if(['payroll-profile','salary-component','salary-revision','wps-profile','payroll-hold'].includes(kind))return payroll&&(kind!=='wps-profile'||['hr.banking.view','hr.banking.manage'].every(code=>hasPermission(ctx,code)));
 if(kind==='site-readiness')return assignments&&['hr.compliance.view','hr.medical.view'].every(code=>hasPermission(ctx,code));
 if(['assignment','asset','ppe','accommodation','operational-block','role-requirement','requirements-refresh'].includes(kind))return assignments;
 if(kind==='eos-case'||kind==='clearance')return eos;
 return base&&(!['hr-note','performance','disciplinary'].includes(kind)||['hr.confidential.view','hr.confidential.manage'].every(code=>hasPermission(ctx,code)));
}
