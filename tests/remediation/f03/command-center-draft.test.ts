import { describe, expect, it } from 'vitest';
import { parseCommandCenterDraft } from '@/features/permissions/command-center-draft';
const change={permissionId:1,roleId:2,permissionCode:'hr.employees.view',permissionName:'Employees',roleCode:'test',roleName:'Test',action:'grant',originalAssigned:false,roleIsSystem:false,permissionIsSystem:false};
describe('permission command-center memory drafts',()=>{
 it('restores reviewed baseline and keyed identity',()=>{expect(parseCommandCenterDraft(JSON.stringify([change])).get('1:2')).toEqual(change);});
 it.each(['null','{}','broken','[1]',JSON.stringify([change,change]),JSON.stringify([{...change,permissionId:-1}]),JSON.stringify([{...change,originalAssigned:true}]),JSON.stringify([{...change,roleName:5}])])('rejects corrupt or conflicting draft: %s',raw=>{expect(parseCommandCenterDraft(raw).size).toBe(0);});
});
