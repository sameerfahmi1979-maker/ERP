// @vitest-environment jsdom
// Real route components and shared Fluent/F04 controls; reads/auth/writes doubled.
import '../f05/setup';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {FluentProvider,webLightTheme} from '@fluentui/react-components';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {WorkspaceUiMemoryProvider} from '@/hooks/use-persistent-ui-state';
const m=vi.hoisted(()=>({manage:true,list:vi.fn(),save:vi.fn(),read:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:1},roleCodes:[],permissionCodes:[]}),hasPermission:()=>true,hasGlobalPermission:()=>m.manage}));
vi.mock('@/server/reads/hr-rule-settings',async importOriginal=>({...await importOriginal<typeof import('@/server/reads/hr-rule-settings')>(),readHrRuleSettings:m.list}));
vi.mock('@/lib/reads/client',()=>({readJson:m.read}));
vi.mock('next/navigation',()=>({redirect:vi.fn(),usePathname:()=>'/admin/hr/settings',useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/server/actions/hr/settings',()=>({listHrReadinessRuleTemplates:m.list,listHrRoleRequirementMatrix:m.list,listHrSiteRequirementMatrix:m.list,listHrApprovalWorkflows:m.list,createHrReadinessRuleTemplate:m.save,updateHrReadinessRuleTemplate:m.save,createHrRoleRequirementMatrix:m.save,updateHrRoleRequirementMatrix:m.save,createHrSiteRequirementMatrix:m.save,updateHrSiteRequirementMatrix:m.save,createHrApprovalWorkflow:m.save,updateHrApprovalWorkflow:m.save,archiveHrSettingsRow:m.save}));
vi.mock('@/server/actions/common-master-data/archive',()=>({listArchivedMasters:vi.fn(),restoreArchivedMaster:vi.fn()}));
vi.mock('@/server/hr-lookup-save',()=>({saveHrLookup:m.save}));
vi.mock('@/server/actions/hr/settings-references',()=>({getHrRuleChoices:vi.fn()}));
vi.mock('@/components/erp/export/erp-export-menu',()=>({ERPExportMenu:()=>null}));
import Readiness from '@/app/(protected)/admin/hr/settings/readiness-rule-templates/page';
import Role from '@/app/(protected)/admin/hr/settings/role-requirement-matrix/page';
import Site from '@/app/(protected)/admin/hr/settings/site-requirement-matrix/page';
import Workflow from '@/app/(protected)/admin/hr/settings/approval-workflows/page';
beforeEach(()=>{vi.clearAllMocks();m.manage=true;m.list.mockResolvedValue({success:true,data:{data:[],total:0}});});
afterEach(cleanup);
async function show(page:()=>Promise<React.ReactNode>){const content=await page();return render(<FluentProvider theme={webLightTheme}><QueryClientProvider client={new QueryClient()}><WorkspaceUiMemoryProvider>{content}</WorkspaceUiMemoryProvider></QueryClientProvider></FluentProvider>);}
it.each([['Readiness',Readiness,'Add readiness rule'],['Role',Role,'Add role requirement'],['Site',Site,'Add site requirement'],['Workflow',Workflow,'Add workflow step']]as const)('%s: approved manager can start creation',async(_name,page,label)=>{await show(page);expect(screen.getByRole('button',{name:label,exact:true}).matches(':disabled')).toBe(false);});
it.each([Readiness,Role,Site,Workflow])('scoped readers see explicit read-only explanation',async page=>{m.manage=false;await show(page);expect(screen.getByText(/global HR configuration permission is required/i)).toBeTruthy();expect(screen.queryByRole('button',{name:/^Add /})).toBeNull();});
it.each([Readiness,Role,Site,Workflow])('read failure is not presented as an empty configuration',async page=>{m.list.mockResolvedValue({success:false,error:'private database diagnostic'});await show(page);expect(screen.queryByText('private database diagnostic')).toBeNull();expect(screen.queryByRole('button',{name:/^Add /})).toBeNull();expect(screen.getByRole('link',{name:'Try loading again'})).toBeTruthy();});
it.each([Readiness,Role,Site,Workflow])('opens one 25-row page even when 1,201 records match',async page=>{
 m.list.mockImplementation(async ({page:p,page_size:size}:{page:number;page_size:number})=>({success:true,data:{data:Array.from({length:Math.min(size,1201-(p-1)*size)},(_,i)=>({id:(p-1)*size+i+1,is_active:true})),total:1201}}));
 await show(page);
 expect(m.list).toHaveBeenCalledOnce();
 expect(m.list.mock.calls[0][0]).toMatchObject({page:1,page_size:25});
 expect(screen.getByText(/25 of 1201 matching records/)).toBeTruthy();
});
it('does not show a partial page as verified',async()=>{
 m.list.mockResolvedValue({success:true,data:{data:[{id:1,is_active:true}],total:26}});
 await show(Workflow);
 expect(screen.getByRole('link',{name:'Try loading again'})).toBeTruthy();
 expect(m.list).toHaveBeenCalledOnce();
});
it('search reaches eligible rows beyond the first page and aborts a superseded table request',async()=>{
 await show(Workflow);
 let old:AbortSignal|undefined;
 m.read.mockImplementationOnce((_resource,_criteria,signal)=>{old=signal;return new Promise(resolve=>signal.addEventListener('abort',()=>resolve({success:false}),{once:true}));});
 const search=screen.getByPlaceholderText('Search permitted configurations…');
 fireEvent.change(search,{target:{value:'older label'}});
 await waitFor(()=>expect(m.read).toHaveBeenCalledOnce());
 m.read.mockResolvedValueOnce({success:true,data:{data:[{id:1201,is_active:true,workflow_name_en:'Late authorized workflow'}],total:1}});
 fireEvent.change(search,{target:{value:'late %_'}});
 expect(old?.aborted).toBe(true);
 await screen.findByText('Late authorized workflow');
 expect(m.read.mock.calls[1][1]).toMatchObject({kind:'list',entity:'hr_approval_workflows',page:1,page_size:25,tableSearch:'late %_'});
});
