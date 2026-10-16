import {beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
const mock=vi.hoisted(()=>({ctx:{} as AuthContext,read:vi.fn(),list:vi.fn(),client:vi.fn(),redirect:vi.fn(),notFound:vi.fn(),companies:{data:[],error:null} as {data:unknown[]|null;error:unknown}}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>mock.ctx}));
vi.mock('next/navigation',()=>({redirect:(href:string)=>{mock.redirect(href);throw Error('REDIRECT');},notFound:()=>{mock.notFound();throw Error('NOT_FOUND');}}));
vi.mock('@/server/actions/common-master-data/work-calendars',()=>({getWorkCalendarById:mock.read,listWorkCalendars:mock.list}));
vi.mock('@/lib/supabase/server',()=>({createClient:mock.client}));
vi.mock('@/features/common-master-data/work-calendars/work-calendar-workspace-form',()=>({WorkCalendarWorkspaceForm:()=>null}));
vi.mock('@/features/common-master-data/work-calendars/work-calendars-list-client',()=>({WorkCalendarsListClient:()=>null}));
import ListPage from '@/app/(protected)/admin/common-master-data/work-calendars/page';
import NewPage from '@/app/(protected)/admin/common-master-data/work-calendars/record/new/page';
import RecordPage from '@/app/(protected)/admin/common-master-data/work-calendars/record/[id]/page';
import {LoadError} from '@/components/erp/load-error';
const page=(id='8',mode='view')=>RecordPage({params:Promise.resolve({id}),searchParams:Promise.resolve({mode})});
beforeEach(()=>{
 vi.clearAllMocks();const codes=['common_md.view','common_md.manage'];mock.ctx={profile:{id:1},isAccountActive:true,permissionCodes:codes,globalPermissionCodes:codes,roleCodes:[],roleAssignments:[{roleCode:'test',ownerCompanyId:null,branchId:null,permissionCodes:codes}]} as unknown as AuthContext;
 mock.read.mockResolvedValue({success:true,data:{id:8,owner_company_id:1,workspace_revision:1}});mock.companies={data:[],error:null};
 mock.list.mockResolvedValue({success:true,data:[]});
 const query={select:()=>query,eq:()=>query,order:async()=>mock.companies};mock.client.mockResolvedValue({from:()=>query});
});
it.each(['8junk','0','-1','8.5','9007199254740992'])('rejects noncanonical record id %s without aliasing another record',async id=>{await expect(page(id)).rejects.toThrow('NOT_FOUND');expect(mock.read).not.toHaveBeenCalled();});
it('failed detail read is retryable and not a false 404',async()=>{mock.read.mockResolvedValue({success:false,kind:'failed'});const result=await page();expect(result.type).toBe(LoadError);expect(mock.notFound).not.toHaveBeenCalled();});
it('known missing detail returns not-found',async()=>{mock.read.mockResolvedValue({success:false,kind:'not_found'});await expect(page()).rejects.toThrow('NOT_FOUND');});
it('denied detail renders access-denied rather than a missing record',async()=>{mock.read.mockResolvedValue({success:false,kind:'forbidden'});await expect(page()).rejects.toThrow('REDIRECT');expect(mock.redirect).toHaveBeenCalledWith('/access-denied');});
it('company-scoped authority does not turn a global calendar editable',async()=>{
 mock.ctx={...mock.ctx,globalPermissionCodes:['common_md.view'],roleAssignments:[{roleCode:'test',ownerCompanyId:1,branchId:null,permissionCodes:['common_md.manage']}]};
 mock.read.mockResolvedValue({success:true,data:{id:8,owner_company_id:null}});expect((await page('8','edit')).props.mode).toBe('view');
});
it.each(['create','edit'])('%s organization lookup failure is not silently an empty form',async mode=>{
 mock.companies={data:null,error:{message:'private provider detail'}};const result=mode==='create'?await NewPage():await page('8','edit');
 expect(result.type).toBe(LoadError);expect(JSON.stringify(result.props)).not.toContain('private provider detail');
});
it('authorized edit preserves complete loaded record',async()=>{const result=await page('8','edit');expect(result.props.mode).toBe('edit');expect(result.props.calendar.id).toBe(8);});
const scopedContext=(branchId:number|null)=>({...mock.ctx,globalPermissionCodes:[],roleAssignments:[{roleId:1,roleCode:'calendar_manager',ownerCompanyId:1,branchId,permissionCodes:['common_md.manage']}]} as AuthContext);
it('branch-only list remains readable but does not advertise Add calendar',async()=>{
 mock.ctx=scopedContext(10);const result=await ListPage();
 expect(mock.list).toHaveBeenCalledWith({});expect(result.props.children[0].props.actions).toBeNull();
});
it('direct branch-only new route redirects before organization lookup',async()=>{
 mock.ctx=scopedContext(10);await expect(NewPage()).rejects.toThrow('REDIRECT');
 expect(mock.redirect).toHaveBeenCalledWith('/admin/common-master-data/work-calendars');expect(mock.client).not.toHaveBeenCalled();
});
it.each(['company','global'])('%s manager retains Add and new-page admission',async scope=>{
 if(scope==='company')mock.ctx=scopedContext(null);
 const result=await ListPage();expect(result.props.children[0].props.actions.props.href).toBe('/admin/common-master-data/work-calendars/record/new');
 const form=await NewPage();expect(form.props.mode).toBe('add');expect(form.props.authContext).toBe(mock.ctx);expect(mock.client).toHaveBeenCalledOnce();
});
it('company reader combined with branch manager cannot admit the direct new route',async()=>{
 mock.ctx=scopedContext(10);mock.ctx.roleAssignments!.push({roleId:2,roleCode:'company_reader',ownerCompanyId:1,branchId:null,permissionCodes:['common_md.view']});
 await expect(NewPage()).rejects.toThrow('REDIRECT');expect(mock.client).not.toHaveBeenCalled();
});
