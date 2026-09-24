import { expect, it } from 'vitest';
import { userScopeOptionFilter } from '@/lib/users/scope-options';
import type { AuthContext } from '@/lib/rbac/check';
const context = (assignments: NonNullable<AuthContext['roleAssignments']>, extra: Partial<AuthContext> = {}): AuthContext => ({
 profile: { id: 1, must_change_password: false } as any, email: null, roleCodes: [], permissionCodes: [],
 accountStatus: 'active', isAccountActive: true, roleAssignments: assignments, ...extra,
});
const assignment = (company: number|null, branch: number|null, code='users.roles.assign') => ({roleId:1,roleCode:'custom',ownerCompanyId:company,branchId:branch,permissionCodes:[code]});
it('branch delegation shows its parent label but not sibling branch options',()=>{
 expect(userScopeOptionFilter(context([assignment(10,20)]))).toEqual({global:false,companyIds:[10],branchCompanies:[],branchIds:[20]});
});
it('unrelated globally assigned capabilities cannot widen user scope options',()=>{
 expect(userScopeOptionFilter(context([assignment(10,20),assignment(null,null,'hr.employees.view')]))).toEqual({global:false,companyIds:[10],branchCompanies:[],branchIds:[20]});
});
it('company assignments may list their branches',()=>{expect(userScopeOptionFilter(context([assignment(10,null)])).branchCompanies).toEqual([10]);});
it('global user administration may list labels globally',()=>{expect(userScopeOptionFilter(context([assignment(null,null)])).global).toBe(true);});
it.each([{isAccountActive:false},{profile:{id:1,must_change_password:true} as any}])('inactive or forced-password principals receive no options %j',extra=>{
 expect(userScopeOptionFilter(context([assignment(null,null)],extra))).toEqual({global:false,companyIds:[],branchCompanies:[],branchIds:[]});
});
