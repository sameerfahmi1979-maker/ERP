import { expect, it } from 'vitest';
import { canAccessRoute, getFirstPermittedRoute } from '@/lib/rbac/route-access-registry';
import { permissionModuleGroup, permissionModuleLabel, permissionScopeLabel } from '@/lib/rbac/permission-taxonomy';

it.each(['hr.employees.view.self','hr.employees.view.team','hr.employee_profile.view'])('has a reachable employee entry for %s', code => {
 expect(canAccessRoute('/admin/hr/employees',[code],false)).toBe(true);
 expect(getFirstPermittedRoute([code],false)).toBe('/admin/hr/employees');
 expect(canAccessRoute('/admin/users',[code],false)).toBe(false);
});
it('does not treat generic HR admin as employee subject authority',()=>{
 expect(canAccessRoute('/admin/hr/employees',['hr.admin'],false)).toBe(false);
});
it.each(['HR','hr_payroll','hr.recruitment','Human Resource','Human Resources'])('groups display taxonomy %s without changing grants',code=>{
 expect(permissionModuleGroup(code)).toBe('hr');
 expect(permissionModuleLabel(code)).toBe('Human Resources');
});
it('keeps other namespaces distinct',()=>{
 expect(permissionModuleGroup('hrish')).toBe('hrish');
 expect(permissionModuleGroup('roles')).toBe('roles');
});
it('labels the company and branch separately without widening the scope',()=>{
 expect(permissionScopeLabel({scope_type:'branch',owner_company_id:101,branch_id:201})).toBe('Company 101 / branch 201');
 expect(permissionScopeLabel({scope_type:'company',owner_company_id:101,branch_id:null})).toBe('Company 101');
 expect(permissionScopeLabel({scope_type:'global',owner_company_id:null,branch_id:null})).toBe('Global');
});
