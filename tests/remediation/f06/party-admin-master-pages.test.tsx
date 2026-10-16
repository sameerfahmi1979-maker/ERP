// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
const m=vi.hoisted(()=>({auth:vi.fn(),read:vi.fn(),redirect:vi.fn(),table:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.auth,hasGlobalPermission:(ctx:{globalPermissionCodes:string[]},code:string)=>ctx.globalPermissionCodes.includes(code)}));
vi.mock('next/navigation',()=>({redirect:m.redirect}));
vi.mock('@/server/actions/master-data/party-admin-masters',()=>({getServiceCategoriesAdmin:m.read,getRelationshipTypesAdmin:m.read}));
vi.mock('@/features/master-data/parties/admin/service-categories-admin-table',()=>({ServiceCategoriesAdminTable:(props:unknown)=>{m.table(props);return <div>Catalogue table</div>;}}));
vi.mock('@/features/master-data/parties/admin/relationship-types-admin-table',()=>({RelationshipTypesAdminTable:(props:unknown)=>{m.table(props);return <div>Catalogue table</div>;}}));
vi.mock('@/components/erp/page-header',()=>({ERPPageHeader:()=>null}));
import ServicePage from '@/app/(protected)/admin/master-data/parties/service-categories/page';
import RelationshipPage from '@/app/(protected)/admin/master-data/parties/relationship-types/page';
afterEach(cleanup);
describe.each([[ServicePage,'master_data.parties.manage_services'],[RelationshipPage,'master_data.parties.manage_relationships']] as const)('mounted catalogue route', (Page,permission)=>{
 beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({globalPermissionCodes:[permission]});m.read.mockResolvedValue({success:true,data:[]});m.redirect.mockImplementation(()=>{throw Error('Redirected');});});
 it('admits the global manager without an invented separate view grant',async()=>{render(await Page());expect(screen.getByText('Catalogue table')).toBeTruthy();expect(m.redirect).not.toHaveBeenCalled();});
 it('never presents failed loading as an editable empty catalogue',async()=>{m.read.mockResolvedValue({success:false,error:'Safe read failure'});render(await Page());expect(screen.getByRole('alert').textContent).toContain('Safe read failure');expect(m.table).not.toHaveBeenCalled();});
 it('denies scoped-only aggregate permission before reading',async()=>{m.auth.mockResolvedValue({globalPermissionCodes:[],permissionCodes:[permission]});await expect(Page()).rejects.toThrow('Redirected');expect(m.read).not.toHaveBeenCalled();});
});
