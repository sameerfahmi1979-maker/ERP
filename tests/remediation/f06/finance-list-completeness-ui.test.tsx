// Keep the SSR module loader for the real server-only actions, with Vitest's
// standard jsdom globals for the actual client table (no config/alias changes).
// @vitest-environment node
import '../f05/setup';
import {createClient} from '@supabase/supabase-js';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {isValidElement,Suspense,type ReactElement,type ReactNode} from 'react';
import {FluentProvider,webLightTheme} from '@fluentui/react-components';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {WorkspaceUiMemoryProvider} from '@/hooks/use-persistent-ui-state';
import type {AuthContext} from '@/lib/rbac/check';
import type {CostCenterWithRelations,ProfitCenterWithRelations} from '@/features/master-data/finance-basics/types';

type Center=CostCenterWithRelations|ProfitCenterWithRelations;
type ExportProps={data:Center[];subtitle:string;disabled:boolean};
const dom=await vi.hoisted(async()=>{
 const {builtinEnvironments}=await import('vitest/runtime');
 return await builtinEnvironments.jsdom.setup(globalThis,{jsdom:{url:'http://localhost:3000'}});
});
afterAll(async()=>{
 // Drain React's scheduled cleanup while its DOM still exists.
 await act(async()=>{await new Promise<void>(resolve=>setImmediate(resolve));});
 dom.teardown(globalThis);
});
const port=vi.hoisted(()=>({ctx:{} as AuthContext,client:vi.fn(),redirect:vi.fn(),push:vi.fn(),refresh:vi.fn(),pathname:'/synthetic',exportProps:null as ExportProps|null}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>port.ctx}));
vi.mock('@/lib/supabase/server',()=>({createClient:port.client}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>port.pathname,useRouter:()=>({push:port.push,refresh:port.refresh}),redirect:(href:string)=>{port.redirect(href);throw Error('REDIRECT');}}));
vi.mock('@/components/erp/export/erp-export-menu',()=>({ERPExportMenu:(props:ExportProps)=>{port.exportProps=props;return null;}}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
import {getCostCenters,getProfitCenters} from '@/features/master-data/finance-basics/actions';
import {CostCentersTable} from '@/features/master-data/finance-basics/components/cost-centers-table';
import {ProfitCentersTable} from '@/features/master-data/finance-basics/components/profit-centers-table';
import CostPage from '@/app/(protected)/admin/master-data/finance-basics/cost-centers/page';
import ProfitPage from '@/app/(protected)/admin/master-data/finance-basics/profit-centers/page';
import {invalidateCostCenters,invalidateProfitCenters} from '@/lib/query/invalidation';
import {queryKeys} from '@/lib/query/query-keys';

const permission='master_data.finance_basics.view';
function context(id=41,allowed=true):AuthContext{
 return {profile:{id},isAccountActive:true,roleCodes:[],permissionCodes:allowed?[permission]:[],globalPermissionCodes:[],roleAssignments:allowed?[{roleCode:'synthetic_reader',ownerCompanyId:1,branchId:null,permissionCodes:[permission]}]:[]} as unknown as AuthContext;
}
type Entity='cost_centers'|'profit_centers';
let rows:Center[]=[],calls:{path:string;method:string;offset:string|null}[]=[],mode:'ok'|'database-error'|'label-error'='ok';
const queryClients:QueryClient[]=[];
let clientId=0;
function seed(entity:Entity,count:number){
 const prefix=entity==='cost_centers'?'cost':'profit';
 rows=Array.from({length:count},(_,i)=>({id:i+1,[`${prefix}_center_code`]:`C${String(i+1).padStart(4,'0')}`,[`${prefix}_center_name_en`]:i===500?'Final ledger 0501':`Center ${String(i+1).padStart(4,'0')}`,[`${prefix}_center_name_ar`]:'اسم',
  [`${prefix}_center_type_code`]:'OPERATING',[`parent_${prefix}_center_id`]:null,owner_company_id:1,branch_id:2,is_active:i%2===0,is_system:false,is_locked:false,sort_order:0,workspace_revision:7,
  description_en:null,description_ar:null,notes:null,created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z',created_by:null,updated_by:null,deactivated_at:null,deactivated_by:null,deactivation_reason:null})) as Center[];
}
const labels={owner_company:{company_code:'A',legal_name_en:'Company A'},branch:{branch_code:'A1',branch_name_en:'Branch A1',branch_name_ar:null},parent:null,type_label:null};
const response=(data:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...headers}});
async function transport(input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
 const url=new URL(String(input)),method=init?.method??'GET';
 if(url.origin!=='http://127.0.0.1:1')throw Error('Unexpected offline request origin');
 calls.push({path:url.pathname,method,offset:url.searchParams.get('offset')});
 if(url.pathname==='/rest/v1/rpc/get_finance_reference_labels'&&method==='POST'){
  const body=JSON.parse(String(init?.body)) as {p_entity:Entity;p_ids:number[]};
  if(!['cost_centers','profit_centers'].includes(body.p_entity)||!body.p_ids.every(id=>rows.some(row=>row.id===id)))throw Error('Unexpected label request');
  return mode==='label-error'?response({message:'PRIVATE LABEL DETAIL'},400):response(Object.fromEntries(body.p_ids.map(id=>[id,labels])));
 }
 if(method!=='GET'||!['/rest/v1/cost_centers','/rest/v1/profit_centers'].includes(url.pathname))throw Error('Unexpected offline request');
 if(mode==='database-error')return response({message:'PRIVATE DATABASE DETAIL'},503);
 const from=Number(url.searchParams.get('offset')??0),limit=Math.min(Number(url.searchParams.get('limit')??500),500),data=rows.slice(from,from+limit);
 return response(data,200,{'Content-Range':`${from}-${from+data.length-1}/${rows.length}`});
}
function mount(node:ReactNode){
 const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});queryClients.push(client);
 const wrap=(child:ReactNode)=><FluentProvider theme={webLightTheme}><QueryClientProvider client={client}><WorkspaceUiMemoryProvider>{child}</WorkspaceUiMemoryProvider></QueryClientProvider></FluentProvider>;
 const result=render(wrap(node));return {...result,rerender:(child:ReactNode)=>result.rerender(wrap(child))};
}
type Node=ReactElement<Record<string,unknown>>;
function findSuspense(node:unknown):Node|undefined{
 if(Array.isArray(node)){for(const item of node){const found=findSuspense(item);if(found)return found;}return;}
 if(!isValidElement<Record<string,unknown>>(node))return;
 return node.type===Suspense?node:findSuspense(node.props.children);
}
async function content(page:Awaited<ReturnType<typeof CostPage>>):Promise<ReactNode>{
 const child=findSuspense(page)?.props.children;
 if(!isValidElement<Record<string,unknown>>(child)||typeof child.type!=='function'||!['CostCentersContent','ProfitCentersContent'].includes(child.type.name))throw Error('Unexpected route content');
 return await Reflect.apply(child.type,null,[child.props]) as ReactNode;
}
const exportedIds=()=>port.exportProps?.data.map(row=>row.id)??[];
function selectCode(code:string){const row=screen.getByText(code).closest('tr');if(!row)throw Error('Missing row');fireEvent.click(within(row).getByRole('checkbox',{name:'Select row'}));}
beforeEach(()=>{
 vi.clearAllMocks();port.ctx=context();port.exportProps=null;calls=[];mode='ok';
 vi.spyOn(console,'error').mockImplementation(()=>{});
 port.client.mockResolvedValue(createClient('http://127.0.0.1:1','synthetic-offline-key',{auth:{storageKey:`finance-list-offline-${++clientId}`,persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport}}));
});
afterEach(()=>{
 cleanup();queryClients.splice(0).forEach(client=>client.clear());
 const unexpected=vi.mocked(console.error).mock.calls.filter(([message])=>!/^get(Cost|Profit)Centers exception$/.test(String(message)));
 vi.restoreAllMocks();expect(unexpected).toEqual([]);
});

for(const [entity,read,page,title,Table,invalidate,parentKey] of [
 ['cost_centers',getCostCenters,CostPage,'Cost centers',CostCentersTable,invalidateCostCenters,queryKeys.costCenterParents],
 ['profit_centers',getProfitCenters,ProfitPage,'Profit centers',ProfitCentersTable,invalidateProfitCenters,queryKeys.profitCenterParents],
] as const){
 const href=`/admin/master-data/finance-basics/${entity.replace('_','-')}`,singular=entity==='cost_centers'?'Cost Center':'Profit Center';
 const table=(data:Center[],ctx=port.ctx)=>Table===CostCentersTable?<CostCentersTable costCenters={data as CostCenterWithRelations[]} authContext={ctx}/>:<ProfitCentersTable profitCenters={data as ProfitCenterWithRelations[]} authContext={ctx}/>;
 const load=async()=>{const result=await read();expect(result.success).toBe(true);if(!result.data)throw Error('Missing complete result');return result.data;};
 describe(entity,()=>{
  beforeEach(()=>{port.pathname=href;seed(entity,52);});
  it('feeds the actual501 SDK/action/label result into the actual route and table',async()=>{
   seed(entity,501);mount(await content(await page()));
   expect(calls.map(call=>call.method==='GET'?call.offset:'labels')).toEqual(['0','500','labels']);
   expect(screen.getByText('Showing 25 of 501 matching records (501 loaded)')).toBeTruthy();expect(screen.getByText('Page 1 of 21')).toBeTruthy();
   expect(exportedIds()).toEqual(rows.map(row=>row.id));expect(port.exportProps?.subtitle).toContain('501 filtered records');
   expect(port.exportProps?.subtitle).toContain(`501 ${entity==='cost_centers'?'cost':'profit'} centers configured`);
   const search=screen.getByRole('textbox',{name:`Search ${title.toLowerCase()} by code or name...`});
   fireEvent.change(search,{target:{value:'C0501'}});expect(screen.getByText('Final ledger 0501')).toBeTruthy();expect(exportedIds()).toEqual([501]);
   expect(screen.getByText('Showing 1 of 1 matching records (501 loaded)')).toBeTruthy();
   fireEvent.click(screen.getByRole('button',{name:'Clear search and filters'}));
   // Resolve the accessible control once while 25 rows are visible. Repeating
   // a document-wide accessible-name scan over each 100-row page adds seconds
   // in jsdom without testing additional pagination behavior.
   const next=screen.getByRole('button',{name:'Next',exact:true}) as HTMLButtonElement;
   fireEvent.change(screen.getByLabelText('Rows per page'),{target:{value:'100'}});
   for(let i=0;i<5;i++){
    expect(next.isConnected).toBe(true);expect(next.disabled).toBe(false);
    fireEvent.click(next);expect(screen.getByText(`Page ${i+2} of 6`)).toBeTruthy();
   }
   expect(screen.getByText('Page 6 of 6')).toBeTruthy();expect(screen.getByText('C0501')).toBeTruthy();expect(screen.getByText('Showing 1 of 501 matching records (501 loaded)')).toBeTruthy();
   expect((screen.getByRole('button',{name:'Next',exact:true}) as HTMLButtonElement).disabled).toBe(true);
  });
  it('selects only the current page with Select all and exports selected IDs across pages and sorting',async()=>{
   mount(table(await load()));fireEvent.click(screen.getByRole('checkbox',{name:'Select all'}));expect(exportedIds()).toEqual(rows.slice(0,25).map(row=>row.id));
   fireEvent.click(screen.getByRole('button',{name:'Next',exact:true}));selectCode('C0026');expect(exportedIds()).toEqual(rows.slice(0,26).map(row=>row.id));
   expect(port.exportProps?.subtitle).toContain('26 selected records');
   fireEvent.click(screen.getByRole('button',{name:singular,exact:true}));fireEvent.click(screen.getByRole('button',{name:singular,exact:true}));
   expect([...exportedIds()].sort((a,b)=>a-b)).toEqual(rows.slice(0,26).map(row=>row.id));
  });
  it('clears selection on column-filter apply and exports all matching rows, not only the visible page',async()=>{
   mount(table(await load()));selectCode('C0001');fireEvent.click(screen.getByRole('button',{name:'Edit filters'}));
   fireEvent.change(screen.getByLabelText('Status'),{target:{value:'false'}});fireEvent.click(screen.getByRole('button',{name:'Apply',exact:true}));
   expect(exportedIds()).toEqual(rows.filter(row=>!row.is_active).map(row=>row.id));expect(exportedIds()).toHaveLength(26);
   expect(port.exportProps?.subtitle).toContain('26 filtered records');expect(screen.getByText('Showing 25 of 26 matching records (52 loaded)')).toBeTruthy();
  });
  it('clears selection on explicit search reset, fresh data and principal remount; clamps after shrink',async()=>{
   const data=await load(),rendered=mount(table(data));selectCode('C0001');
   fireEvent.change(screen.getByRole('textbox'),{target:{value:'absent'}});fireEvent.click(screen.getByRole('button',{name:'Clear search and filters'}));expect(exportedIds()).toHaveLength(52);expect(port.exportProps?.subtitle).toContain('52 filtered records');
   selectCode('C0001');rendered.rerender(table([...data]));expect(exportedIds()).toHaveLength(52);
   selectCode('C0001');rendered.rerender(table(data,context(42)));expect(exportedIds()).toHaveLength(52);
   fireEvent.click(screen.getByRole('button',{name:'Next',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Next',exact:true}));expect(screen.getByText('Page 3 of 3')).toBeTruthy();
   rendered.rerender(table(data.slice(0,1),context(42)));await waitFor(()=>expect(screen.getByText('Page 1 of 1')).toBeTruthy());expect(exportedIds()).toEqual([1]);
  });
  it('preserves meaningful labels and inactive history without giving the scoped viewer mutations',async()=>{
   mount(table(await load()));expect(screen.getAllByText('Company A').length).toBeGreaterThan(0);expect(screen.getAllByText('Branch A1').length).toBeGreaterThan(0);expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0);
   expect((screen.getByRole('button',{name:`Add ${singular}`}) as HTMLButtonElement).disabled).toBe(true);
   fireEvent.click(screen.getAllByRole('button',{name:'Record actions'})[0]);await screen.findByRole('menuitem',{name:'View details'});
   for(const name of ['Edit','Deactivate','Lock','Retire; keep history'])expect(screen.queryByRole('menuitem',{name,exact:true})).toBeNull();
  });
  it.each(['database-error','label-error'] as const)('renders safe retryable %s, never an empty/partial table or raw error',async problem=>{
   mode=problem;mount(await content(await page()));expect(screen.getByRole('alert').textContent).toContain(`${title} could not be loaded`);
   expect(screen.getByText('Finance data could not be loaded. Retry without discarding your draft.')).toBeTruthy();expect(screen.queryByRole('table')).toBeNull();expect(document.body.textContent).not.toContain('PRIVATE');
   const retry=screen.getByRole('link',{name:'Try loading again'});expect(retry.tagName).toBe('A');expect(retry.getAttribute('href')).toBe(href);expect(retry.getAttribute('onclick')).toBeNull();retry.focus();expect(document.activeElement).toBe(retry);
   expect(port.refresh).not.toHaveBeenCalled();expect(calls.every(call=>call.method==='GET'||call.path.endsWith('/get_finance_reference_labels'))).toBe(true);
  });
  it('a fresh read after a failed list recovers without a mutation',async()=>{
   mode='database-error';const rendered=mount(await content(await page()));expect(screen.getByRole('alert')).toBeTruthy();mode='ok';calls=[];
   rendered.rerender(await content(await page()));expect(screen.queryByRole('alert')).toBeNull();expect(screen.getByText('Showing 25 of 52 matching records (52 loaded)')).toBeTruthy();
   expect(calls.map(call=>call.method)).toEqual(['GET','POST']);expect(calls[1].path).toBe('/rest/v1/rpc/get_finance_reference_labels');
  });
  it('authorized exact zero renders the empty actual table without an error or label RPC',async()=>{
   seed(entity,0);mount(await content(await page()));expect(screen.queryByRole('alert')).toBeNull();expect(screen.getByText('Showing 0 of 0 matching records (0 loaded)')).toBeTruthy();expect(calls).toHaveLength(1);expect(exportedIds()).toEqual([]);expect(port.exportProps?.disabled).toBe(true);
  });
  it('denied outer route redirects before any client or list read',async()=>{
   port.ctx=context(41,false);await expect(page()).rejects.toThrow('REDIRECT');expect(port.redirect).toHaveBeenCalledWith('/access-denied');expect(port.client).not.toHaveBeenCalled();expect(calls).toEqual([]);
  });
  it('permission revoked between shell and list retains safe denial text without fetching rows',async()=>{
   const shell=await page();port.ctx=context(41,false);mount(await content(shell));expect(screen.getByText('You do not have permission to view finance basics data')).toBeTruthy();expect(screen.getByRole('alert')).toBeTruthy();expect(screen.queryByRole('table')).toBeNull();expect(port.client).not.toHaveBeenCalled();
  });
  it('keeps the Suspense boundary with an accessible resource-specific loading status',async()=>{
   const shell=await page(),boundary=findSuspense(shell);expect(boundary).toBeTruthy();mount(boundary?.props.fallback as ReactNode);
   expect(screen.getByRole('status').textContent).toBe(`Loading ${title.toLowerCase()}`);expect(screen.getByRole('status').querySelector('[aria-hidden="true"]')).toBeTruthy();expect(calls).toEqual([]);
  });
  it('retains the existing master prefix for ordinary and parent-choice invalidation',()=>{
   const client=new QueryClient();queryClients.push(client);const invalidation=vi.spyOn(client,'invalidateQueries');invalidate(client);
   expect(invalidation).toHaveBeenCalledExactlyOnceWith({queryKey:['master',entity]});expect(parentKey(1,2,9).slice(0,2)).toEqual(['master',entity]);
  });
 });
}
