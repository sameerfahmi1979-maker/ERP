// @vitest-environment jsdom
import '../remediation/f05/setup';
import React from 'react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {AuthContext} from '@/lib/rbac/check';
import {DASHBOARD_DEFINITIONS,type DashboardRequest,type DashboardResponse} from '@/lib/hr/dashboard-workspace';
const state=vi.hoisted(()=>({read:vi.fn(),path:'/admin/hr/dashboard'}));
vi.mock('next/navigation',()=>({usePathname:()=>state.path}));
vi.mock('@/lib/reads/client',async()=>({...await vi.importActual('@/lib/reads/client'),readJson:state.read}));
vi.mock('@/hooks/realtime/use-realtime-sync',()=>({useRealtimeSync:()=>{}}));
// Chart geometry requires layout. Tests retain real UI, query owner lifecycle and all links.
vi.mock('recharts',()=>({ResponsiveContainer:({children}:React.PropsWithChildren)=><div>{children}</div>,BarChart:({children}:React.PropsWithChildren)=><div>{children}</div>,Bar:()=>null,Cell:()=>null,XAxis:()=>null,YAxis:()=>null,CartesianGrid:()=>null,Tooltip:()=>null}));
import {HrDashboardWorkspace} from '@/features/hr/dashboard/hr-dashboard-workspace';
import {ReadError} from '@/lib/reads/client';
import {invalidateHrDashboardSummary} from '@/lib/query/invalidation';
const auth={profile:{id:1,auth_user_id:'synthetic-one',must_change_password:false},isAccountActive:true,accountStatus:'active',roleCodes:[],permissionCodes:['hr.dashboard.view','hr.employees.view','hr.attendance.view'],roleAssignments:[]} as unknown as AuthContext;
const clients:QueryClient[]=[];
const item={key:'synthetic',label:'Synthetic Employee',reference:'EMP-TEST',detail:'active',date:null,href:'/admin/hr/employees/record/1?section=profile'};
function reply(params:DashboardRequest,token='Synthetic Employee') {
 const data:DashboardResponse={mode:params.mode,scope:{...params.scope,expiryDays:params.scope?.expiryDays??'30'},page:params.page??1,metric:params.metric,asOf:'2026-11-07T08:00:00Z',metrics:params.mode==='options'?{}:Object.fromEntries(DASHBOARD_DEFINITIONS.map(d=>[d.key,{status:'ready',value:2,items:[{...item,label:token}]}])),charts:[{key:'department',label:'Departments',items:[{label:'Synthetic Department',value:2}]}],options:{companies:[{id:1,label:'TEST'},{id:2,label:'SECOND'}],branches:[{id:1,label:'Test Branch',companyId:1}],departments:[],sites:[]}};
 return {success:true,data};
}
function mount(ctx=auth) {
 const client=new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:0}}});clients.push(client);
 const ui=(context:AuthContext)=><QueryClientProvider client={client}><HrDashboardWorkspace authContext={context}/></QueryClientProvider>;
 return {...render(ui(ctx)),client};
}
beforeEach(()=>{state.path='/admin/hr/dashboard';state.read.mockImplementation(async(_resource:string,params:DashboardRequest)=>reply(params));Element.prototype.scrollIntoView=vi.fn();});
afterEach(()=>{cleanup();clients.forEach(c=>c.clear());clients.length=0;vi.clearAllMocks();});
it('loads one overview and one lookup request and shows the six headline figures and existing HR destinations',async()=>{
 mount();await screen.findByText(/Updated.*Dubai/);
 expect(state.read).toHaveBeenCalledTimes(2);expect(screen.getByRole('heading',{name:'Needs your attention'})).toBeTruthy();
 expect(screen.getByRole('link',{name:'Daily attendance'}).getAttribute('href')).toBe('/admin/hr/time/attendance');
 expect(screen.queryByRole('link',{name:'Add employee'})).toBeNull();
 expect(screen.getByText(/not a historical headcount/)).toBeTruthy();
});
it('applies company and branch filters together, clears dependent branch and returns matching records with preserved scope',async()=>{
 mount();await screen.findByRole('option',{name:'TEST'});
 fireEvent.change(screen.getByLabelText('Company'),{target:{value:'1'}});fireEvent.change(screen.getByLabelText('Branch'),{target:{value:'1'}});
 expect(state.read).toHaveBeenCalledTimes(2);
 fireEvent.click(screen.getByRole('button',{name:'Apply filters'}));await waitFor(()=>expect(state.read.mock.calls.some(c=>c[1].scope.companyId===1&&c[1].scope.branchId===1)).toBe(true));
 await waitFor(()=>expect((screen.getAllByRole('button',{name:/Current workforce/})[0] as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(screen.getAllByRole('button',{name:/Current workforce/})[0]);
 await waitFor(()=>expect(state.read.mock.calls.some(c=>c[1].mode==='records'&&c[1].scope.companyId===1&&c[1].metric==='workforce')).toBe(true));
 const panel=screen.getByRole('region',{name:'Matching records'});await within(panel).findByText('Synthetic Employee');
 expect(within(panel).getByRole('link').getAttribute('href')).toContain('?section=profile');
 fireEvent.change(screen.getByLabelText('Company'),{target:{value:'2'}});expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('');
});
it('hides failed values and does not fabricate zero or an all-clear message',async()=>{
 state.read.mockImplementation(async(_resource:string,params:DashboardRequest)=>{const response=reply(params);if(params.mode==='overview')response.data.metrics.expired={status:'failed',items:[]};return response;});
 mount();await screen.findByText(/Some sections could not load/);expect(screen.queryByText('All clear')).toBeNull();
 expect(screen.getAllByText('Could not load').length).toBeGreaterThan(0);
});
it('discards old identity data when switching accounts even if the new request is unresolved',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);
 const ui=(ctx:AuthContext)=><QueryClientProvider client={client}><HrDashboardWorkspace authContext={ctx}/></QueryClientProvider>;
 const view=render(ui(auth));await screen.findAllByText('Synthetic Employee');
 state.read.mockImplementation(()=>new Promise(()=>{}));view.rerender(ui({...auth,profile:{...auth.profile!,auth_user_id:'synthetic-two'}}));
 expect(screen.queryByText('Synthetic Employee')).toBeNull();expect(screen.queryByText('Synthetic Department')).toBeNull();
});
it('denied refresh clears private data and stops automatic retry',async()=>{
 const view=mount();await screen.findAllByText('Synthetic Employee');state.read.mockRejectedValue(new ReadError('Denied',403));
 act(()=>invalidateHrDashboardSummary(view.client));await screen.findByRole('alert');
 expect(screen.queryByText('Synthetic Employee')).toBeNull();const calls=state.read.mock.calls.length;await act(async()=>{await Promise.resolve();});expect(state.read).toHaveBeenCalledTimes(calls);
});
it('inactive retained workspaces make no dashboard reads',()=>{
 state.path='/dms/documents';mount();expect(state.read).not.toHaveBeenCalled();
});

it('offers document browser only with both HR and DMS access',async()=>{
 const view=mount({...auth,permissionCodes:[...auth.permissionCodes,'hr.compliance.view']});await screen.findByText(/Updated.*Dubai/);
 expect(screen.queryByRole('link',{name:'Document browser'})).toBeNull();
 view.unmount();mount({...auth,permissionCodes:[...auth.permissionCodes,'dms.documents.view']});
 expect((await screen.findByRole('link',{name:'Document browser'})).getAttribute('href')).toBe('/admin/hr/document-browser');
});
