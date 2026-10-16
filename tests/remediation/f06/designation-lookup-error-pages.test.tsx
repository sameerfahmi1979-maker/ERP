// @vitest-environment jsdom
import '../f05/setup';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {Children,cloneElement,isValidElement,Suspense,type ReactElement} from 'react';
import type {AuthContext} from '@/lib/rbac/check';
import type {DesignationRow} from '@/server/actions/common-master-data/designations';
import type {LookupDashboardStats} from '@/features/master-data/lookups/types';

const port=vi.hoisted(()=>({auth:vi.fn(),designations:vi.fn(),dashboard:vi.fn(),redirect:vi.fn(),props:null as {designations:DesignationRow[];canManage:boolean}|null}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:port.auth}));
vi.mock('@/server/actions/common-master-data/designations',()=>({listDesignations:port.designations}));
vi.mock('@/server/actions/master-data/lookups',()=>({getLookupDashboardStats:port.dashboard}));
vi.mock('next/navigation',()=>({redirect:(href:string)=>{port.redirect(href);throw Error('REDIRECT:'+href);}}));
vi.mock('@/features/common-master-data/designations/designations-list-client',()=>({DesignationsListClient:(props:{designations:DesignationRow[];canManage:boolean})=>{
  port.props=props;return <div data-testid="verified-designations">{props.designations.map(row=><p key={row.id}>{row.designation_name_en}</p>)}</div>;
}}));
import DesignationsPage from '@/app/(protected)/admin/common-master-data/designations/page';
import DashboardPage from '@/app/(protected)/admin/master-data/page';

const secret='PRIVATE_PAGE_READ_DETAIL';
function context(codes:string[]):AuthContext{
  return {profile:{id:41,must_change_password:false},isAccountActive:true,roleCodes:[],permissionCodes:codes,globalPermissionCodes:[],
    roleAssignments:[{roleCode:'synthetic_reader',ownerCompanyId:7,branchId:8,permissionCodes:codes}]} as unknown as AuthContext;
}
function zeroStats():LookupDashboardStats{return {total_categories:0,active_categories:0,inactive_categories:0,locked_categories:0,total_values:0,active_values:0,inactive_values:0,locked_values:0,recently_updated:[]};}
function rows():DesignationRow[]{return [{id:12,designation_code:'RETAINED',designation_name_en:'Retained inactive title',designation_name_ar:null,
  owner_company_id:null,department_id:null,job_level:null,management_level:'staff',is_supervisor:false,is_authorized_signatory:false,
  has_approval_authority:false,is_safety_critical:false,description:null,is_active:false,created_at:'2026-01-01T00:30:00+04:00',
  updated_at:'2026-09-30T23:45:00Z',deleted_at:null,owner_company:null,department:null}];}

// Resolve only the actual named async server child. Never invoke arbitrary
// client components with hooks or copy the dashboard implementation into tests.
async function dashboardTree(){
  const tree=DashboardPage();
  const children=await Promise.all(Children.toArray(tree.props.children).map(async child=>{
    if(!isValidElement<{children:ReactElement}>(child)||child.type!==Suspense)return child;
    const content=child.props.children;
    if(typeof content.type!=='function'||content.type.name!=='DashboardContent')throw Error('Expected actual DashboardContent');
    return cloneElement(child,undefined,await Reflect.apply(content.type,null,[content.props]));
  }));
  return cloneElement(tree,undefined,children);
}
beforeEach(()=>{
  vi.resetAllMocks();port.props=null;
  port.auth.mockResolvedValue(context(['common_md.view','master_data.dashboard.view']));
  port.designations.mockResolvedValue({success:true,data:[]});port.dashboard.mockResolvedValue({success:true,data:zeroStats()});
});
afterEach(cleanup);

for(const [name,page,read,view,href,title] of [
  ['designations',DesignationsPage,port.designations,'common_md.view','/admin/common-master-data/designations','Designations'],
  ['dashboard',dashboardTree,port.dashboard,'master_data.dashboard.view','/admin/master-data','Master data statistics'],
] as const){
  describe(`${name} actual route`,()=>{
    function noSuccess(){
      expect(screen.queryByTestId('verified-designations')).toBeNull();
      for(const text of ['No designations yet','Create your first job title.','Total Categories','Total Values','No recent updates'])expect(screen.queryByText(text)).toBeNull();
      expect(screen.queryByRole('link',{name:/Add Designation/})).toBeNull();
    }
    it.each(['none','inactive','password','manage-only'])('%s is denied before business read and redirect is not caught',async mode=>{
      const ctx=context(mode==='manage-only'?['common_md.manage','common_md.designations.manage']:[view]);
      if(mode==='none')ctx.permissionCodes=[];
      if(mode==='inactive')ctx.isAccountActive=false;
      if(mode==='password')ctx.profile={...ctx.profile!,must_change_password:true};
      port.auth.mockResolvedValue(ctx);
      await expect(page()).rejects.toThrow('REDIRECT:/access-denied');expect(port.redirect).toHaveBeenCalledWith('/access-denied');
      expect(read).not.toHaveBeenCalled();expect(screen.queryByRole('alert')).toBeNull();
    });
    it('action-time revocation redirects outside the action rejection catch',async()=>{
      read.mockResolvedValue({success:false,kind:'forbidden',error:secret});
      await expect(page()).rejects.toThrow('REDIRECT:/access-denied');expect(read).toHaveBeenCalledOnce();expect(port.redirect).toHaveBeenCalledWith('/access-denied');noSuccess();
    });
    it.each(['failed','missing-result','null-result','missing-data','null-data','rejected'])('%s mounts safe real alert/native same-route retry without success UI',async mode=>{
      port.auth.mockResolvedValue(context([view,'common_md.manage']));
      if(mode==='rejected')read.mockRejectedValue(new Error(secret));
      else read.mockResolvedValue(mode==='failed'?{success:false,kind:'failed',error:secret}:mode==='missing-result'?undefined:mode==='null-result'?null:{success:true,...(mode==='null-data'?{data:null}:{})});
      render(await page());
      expect(screen.getByRole('alert').textContent).toContain(`${title} could not be loaded`);
      const retry=screen.getByRole('link',{name:'Try loading again'});
      expect(retry.tagName).toBe('A');expect(retry.getAttribute('href')).toBe(href);
      expect(retry.getAttribute('target')).toBeNull();expect(retry.closest('form')).toBeNull();
      expect(document.body.textContent).not.toContain(secret);expect(port.redirect).not.toHaveBeenCalled();noSuccess();
    });
    it('fresh route resolution replaces failed rendering with verified data (not browser/draft-survival proof)',async()=>{
      read.mockResolvedValueOnce({success:false,kind:'failed',error:secret});const mounted=render(await page());expect(screen.getByRole('alert')).toBeTruthy();
      if(name==='designations')read.mockResolvedValue({success:true,data:rows()});
      else read.mockResolvedValue({success:true,data:{...zeroStats(),total_categories:3,recently_updated:[{category_name:'Recovered category',value_label:'Recovered value',updated_at:'2026-09-30T12:00:00Z',updated_by_name:null}]}});
      mounted.rerender(await page());expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByText(name==='designations'?'Retained inactive title':'Recovered value')).toBeTruthy();
      expect(port.auth).toHaveBeenCalledTimes(2);expect(read).toHaveBeenCalledTimes(2);
    });
  });
}

it.each([{},'not an array'])('designation malformed successful payload %j does not reach Add/empty/list',async data=>{
  port.auth.mockResolvedValue(context(['common_md.view','common_md.manage']));port.designations.mockResolvedValue({success:true,data});
  render(await DesignationsPage());expect(screen.getByRole('alert')).toBeTruthy();expect(port.props).toBeNull();
  expect(screen.queryByText('No designations yet')).toBeNull();expect(screen.queryByRole('link',{name:/Add Designation/})).toBeNull();
});
it.each([{manage:[]},{manage:['common_md.manage']},{manage:['common_md.designations.manage']}])('genuine designation empty keeps unchanged management gate $manage',async({manage})=>{
  port.auth.mockResolvedValue(context(['common_md.designations.view',...manage]));render(await DesignationsPage());
  expect(screen.getByText('No designations yet')).toBeTruthy();expect(screen.getByText('Create your first job title.')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();expect(!!screen.queryByRole('link',{name:/Add Designation/})).toBe(manage.length>0);
});
it.each([false,true])('verified rows and canManage=%s reach the unchanged success consumer',async manage=>{
  const data=rows(),before=structuredClone(data);port.auth.mockResolvedValue(context(['common_md.view',...(manage?['common_md.manage']:[])]));
  port.designations.mockResolvedValue({success:true,data});render(await DesignationsPage());
  expect(port.props?.designations).toBe(data);expect(port.props?.canManage).toBe(manage);expect(data).toEqual(before);
  expect(screen.getByText('Retained inactive title')).toBeTruthy();expect(screen.queryByRole('alert')).toBeNull();expect(port.designations).toHaveBeenCalledWith({});
});
it('confirmed dashboard zero stats render actual zero cards and recent empty UI',async()=>{
  render(await dashboardTree());expect(screen.getByText('Total Categories')).toBeTruthy();expect(screen.getByText('Total Values')).toBeTruthy();
  expect(screen.getAllByText('0')).toHaveLength(3);expect(screen.getByText('0%')).toBeTruthy();expect(screen.getByText('No recent updates')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();expect(screen.getByRole('heading',{name:'Master Data Dashboard'})).toBeTruthy();
});
it('confirmed dashboard counts and recent labels render without modifying the action payload',async()=>{
  const data:LookupDashboardStats={total_categories:3,active_categories:2,inactive_categories:1,locked_categories:1,total_values:4,active_values:1,inactive_values:3,locked_values:2,
    recently_updated:[{category_name:'Retained category',value_label:'Retained value',updated_at:'2026-09-30T23:45:00+04:00',updated_by_name:null}]};
  const before=structuredClone(data);port.dashboard.mockResolvedValue({success:true,data});render(await dashboardTree());
  for(const text of ['3','4','2','25%','Retained category','Retained value'])expect(screen.getByText(text)).toBeTruthy();
  expect(data).toEqual(before);expect(screen.queryByRole('alert')).toBeNull();expect(screen.queryByText('No recent updates')).toBeNull();
});
