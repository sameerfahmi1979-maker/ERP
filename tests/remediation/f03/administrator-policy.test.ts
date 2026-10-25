import {describe,expect,it} from 'vitest';
import {administratorScope,assignmentScopeError,inheritsAdministratorPermission,administratorRoleLabel} from '@/lib/rbac/administrator-policy';
import {formatRoleScopeLabel,resolveRoleScope} from '@/lib/users/role-scope';
describe('administrator assignment contract',()=>{
 it.each([
  ['system_admin',null,null,true],['group_admin',null,null,true],['system_admin',1,null,false],['system_admin',1,2,false],
  ['company_admin',1,null,true],['company_admin',null,null,false],['company_admin',1,2,false],
  ['branch_admin',1,2,true],['branch_admin',1,null,false],['branch_admin',null,2,false],
  ['ordinary',1,null,true],['ordinary',1,2,true],['ordinary',null,null,true],['ordinary',null,2,false],
  ['branch_admin',1,0,false],['company_admin',-1,null,false],['branch_admin',1,2.5,false],
 ] as const)('%s company=%s branch=%s valid=%s',(role,company,branch,valid)=>{
  expect(assignmentScopeError(role,company,branch)===null).toBe(valid);
 });
 it('uses reserved codes; friendly labels and editable role level confer no authority',()=>{
  expect(administratorScope('Global System Administrator')).toBe(null);
  expect(administratorScope('custom_admin')).toBe(null);
  expect(administratorRoleLabel('system_admin','old')).toBe('Global System Administrator');
 });
 it.each(['company_admin','branch_admin'])('%s never inherits global or unclassified operations',role=>{
  expect(inheritsAdministratorPermission(role,'global')).toBe(false);
  expect(inheritsAdministratorPermission(role,'held')).toBe(false);
 });
 it('branch permission inheritance never adds company authority',()=>{
  expect(inheritsAdministratorPermission('company_admin','company')).toBe(true);
  expect(inheritsAdministratorPermission('company_admin','branch')).toBe(true);
  expect(inheritsAdministratorPermission('branch_admin','company')).toBe(false);
  expect(inheritsAdministratorPermission('branch_admin','branch')).toBe(true);
  expect(inheritsAdministratorPermission('custom_admin','branch')).toBe(false);
 });
 it('labels branch assignments before company assignments and keeps Global System virtual',()=>{
  expect(resolveRoleScope(1,2)).toBe('branch');expect(resolveRoleScope(1,null)).toBe('company');
  expect(formatRoleScopeLabel(resolveRoleScope(null,null))).toBe('Global System — all companies and branches');
 });
});
