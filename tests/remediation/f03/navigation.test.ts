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
it.each([
  ['/admin/hr/dashboard', ['hr.dashboard.view'], ['hr.admin']],
  ['/admin/hr/time/attendance', ['hr.attendance.view'], ['hr.attendance.manage']],
  ['/admin/hr/time/shifts', ['hr.attendance.view'], ['hr.admin']],
  ['/admin/hr/time/leave', ['hr.leave.view'], ['hr.leave.manage']],
  ['/admin/hr/operations/assignments', ['hr.assignments.view'], ['hr.assignments.manage']],
  ['/admin/hr/operations/readiness', ['hr.assignments.view'], ['hr.admin']],
  ['/admin/hr/operations/blocks', ['hr.assignments.view'], ['hr.admin']],
  ['/admin/hr/actions/pro', ['hr.actions.view'], ['hr.actions.manage']],
  ['/admin/hr/actions/approvals', ['hr.actions.view'], ['hr.actions.manage']],
  ['/admin/hr/actions/disciplinary', ['hr.actions.view', 'hr.confidential.view'], ['hr.actions.view']],
  ['/admin/hr/actions/eos', ['hr.actions.view'], ['hr.eos.manage']],
  ['/admin/hr/recruitment/offers', ['hr.recruitment.manage'], ['hr.admin']],
  ['/admin/hr/operations/workshop-labour', ['hr.workshop.labour.review', 'hr.attendance.view'], ['hr.workshop.labour.review']],
  ['/admin/hr/payroll/workshop', ['hr.payroll.workshop.review', 'hr.payroll.view'], ['hr.payroll.workshop.review']],
  ['/admin/reports/templates', ['reports.view'], ['settings.email.view']],
  ['/dms/notifications', ['dms.notifications.view'], ['dms.documents.view']],
  ['/modules/workshop/job-work', ['workshop.jobs.manage'], ['supply.request']],
])('reflects scoped page entry for %s', (path, granted, insufficient) => {
  expect(canAccessRoute(path, granted, false)).toBe(true);
  expect(canAccessRoute(path, insufficient, false)).toBe(false);
});

it.each([
  ['/admin/notifications/email-queue', 'notifications.admin'],
  ['/admin/notifications/email-queue', 'notifications.email_queue.view'],
  ['/admin/notifications/logs', 'notifications.logs.view'],
  ['/admin/notifications/templates', 'notifications.templates.view'],
  ['/admin/dms/notification-settings', 'dms.notifications.settings.manage'],
  ['/admin/settings/ai', 'settings.ai.usage.view'],
  ['/admin/settings/email', 'settings.email.logs.view'],
  ['/admin/master-data/parties/types', 'master_data.parties.manage_types'],
])('requires %s to use the global grant for %s', (path, code) => {
  expect(canAccessRoute(path, [code], false, [])).toBe(false);
  expect(canAccessRoute(path, [code], false, [code])).toBe(true);
});

it('does not accept global grants intended for other notification functions', () => {
  expect(canAccessRoute('/admin/notifications/logs', ['notifications.manage'], false, ['notifications.manage'])).toBe(false);
  expect(canAccessRoute('/admin/notifications/templates', ['notifications.templates.manage'], false, ['notifications.templates.manage'])).toBe(false);
});

it.each([
  ['/modules/fleet/12', 'fleet.assets.view'],
  ['/modules/fleet/operations/12', 'fleet.operations.view'],
  ['/modules/workshop/job-work/12', 'workshop.jobs.manage'],
  ['/admin/reports/run/HR_WPS_READINESS', 'reports.run'],
])('rechecks the family access predicate for record %s', (path, grant) => {
  expect(canAccessRoute(path, [grant], false)).toBe(true);
  expect(canAccessRoute(path, ['dashboard.view'], false)).toBe(false);
});

it('does not reopen Payroll Finance using generic reports authority alone', () => {
  const path = '/admin/reports/run/fin_payroll_reconciliation';
  expect(canAccessRoute(path, ['reports.view', 'reports.run'], false)).toBe(false);
  expect(canAccessRoute(path, ['reports.view', 'reports.run', 'hr.payroll.finance.reconcile'], false)).toBe(true);
});

it.each([
  ['/admin/ai/dashboard', 'ai.dashboard.view'],
  ['/admin/ai/dashboard', 'ai.dashboard.admin'],
  ['/admin/ai/dashboard', 'ai.common.view'],
  ['/admin/ai/dashboard', 'ai.common.admin'],
  ['/admin/dms/ai-observability', 'dms.ai_observability.view'],
  ['/admin/dms/ai-observability', 'dms.ai_observability.admin'],
  ['/admin/dms/ai-observability', 'dms.admin'],
  ['/admin/dms/ai-observability', 'settings.ai.view'],
  ['/admin/dms/ai-observability', 'settings.ai.manage'],
])('uses only global observability grants for %s (%s)', (path, code) => {
  expect(canAccessRoute(path, [code], false, [])).toBe(false);
  expect(canAccessRoute(path, [code], false, [code])).toBe(true);
  expect(canAccessRoute(path, ['ai.assistant.view'], false, ['ai.assistant.view'])).toBe(false);
  expect(canAccessRoute(path, [], true, [])).toBe(true);
});
