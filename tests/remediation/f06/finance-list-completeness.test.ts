import {createClient} from '@supabase/supabase-js';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
import {literalContains} from '@/lib/reads/search';

// Actual actions, SDK, collector and label projection; synthetic transport only.
const port=vi.hoisted(()=>({ctx:{} as AuthContext,client:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>port.ctx}));
vi.mock('@/lib/supabase/server',()=>({createClient:port.client}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {getCostCenters,getProfitCenters} from '@/features/master-data/finance-basics/actions';

const view='master_data.finance_basics.view',manage='master_data.finance_basics.manage',lock='master_data.lookups.lock';
const failure={success:false,error:'Finance data could not be loaded. Retry without discarding your draft.'};
const denied={success:false,error:'You do not have permission to view finance basics data'};
type Entity='cost_centers'|'profit_centers';
type Mode='ok'|'first-error'|'later-error'|'later-denied'|'network'|'missing-count'|'invalid-count'|'negative-count'|'changed-count'|'duplicate-page'|'duplicate-within'|'overshoot'|'short'|'empty-later'|'label-error'|'missing-label'|'unsolicited-label'|'malformed-label';
type Row=Record<string,unknown>&{id:number};
type Call={url:URL;method:string;headers:Headers;body?:{p_entity:Entity;p_ids:number[]}};
let rows:Row[]=[],calls:Call[]=[],mode:Mode='ok';
function context(code=view,global=false):AuthContext{
 return {profile:{id:41},isAccountActive:true,roleCodes:[],permissionCodes:code?[code]:[],globalPermissionCodes:global?[code]:[],roleAssignments:code?[{roleCode:'synthetic_reader',ownerCompanyId:global?null:1,branchId:null,permissionCodes:[code]}]:[]} as unknown as AuthContext;
}
function seed(entity:Entity,count:number){
 const prefix=entity==='cost_centers'?'cost':'profit';
 rows=Array.from({length:count},(_,i)=>({id:i+1,[`${prefix}_center_code`]:`C${i+1}`,[`${prefix}_center_name_en`]:'Tied name',[`${prefix}_center_name_ar`]:'اسم',
  [`${prefix}_center_type_code`]:'OPERATING',[`parent_${prefix}_center_id`]:9,owner_company_id:1,branch_id:2,is_active:false,is_system:false,is_locked:false,sort_order:0,workspace_revision:7,
  created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z',notes:'Retained history',owner_company:null,branch:null,parent:null}));
}
const labels={owner_company:{company_code:'A',legal_name_en:'Company A'},branch:{branch_code:'A1',branch_name_en:'Branch A1',branch_name_ar:null},parent:{code:'PARENT',name_en:'Parent history',name_ar:null},type_label:{value_code:'OPERATING',value_label_en:'Operating',value_label_ar:null}};
const response=(data:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...headers}});
async function transport(input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
 const url=new URL(String(input)),method=init?.method??'GET',headers=new Headers(init?.headers);
 if(url.origin!=='http://127.0.0.1:1')throw Error('Unexpected offline request origin');
 const call:Call={url,method,headers};calls.push(call);
 if(url.pathname==='/rest/v1/rpc/get_finance_reference_labels'&&method==='POST'){
  const body=JSON.parse(String(init?.body)) as NonNullable<Call['body']>;call.body=body;
  if(!['cost_centers','profit_centers'].includes(body.p_entity)||!body.p_ids.every(id=>rows.some(row=>row.id===id)))throw Error('Unexpected label request');
  const batch=calls.filter(c=>c.body).length;
  if(mode==='label-error'&&batch===2)return response({message:'PRIVATE LABEL DETAIL'},400);
  const data:Record<string,unknown>=Object.fromEntries(body.p_ids.map(id=>[id,labels]));
  if(mode==='missing-label')delete data[body.p_ids[0]];
  if(mode==='unsolicited-label')data[999999]=labels;
  if(mode==='malformed-label')data[body.p_ids[0]]={...labels,secret:'PRIVATE LABEL DETAIL'};
  return response(data);
 }
 if(method!=='GET'||!['/rest/v1/cost_centers','/rest/v1/profit_centers'].includes(url.pathname))throw Error('Unexpected offline request');
 const from=Number(url.searchParams.get('offset')??0),size=Math.min(Number(url.searchParams.get('limit')??500),500);
 if(mode==='network')throw new TypeError('PRIVATE NETWORK DETAIL');
 if(mode==='first-error'||(from>0&&(mode==='later-error'||mode==='later-denied')))return response({message:'PRIVATE DATABASE DETAIL'},mode==='later-denied'?403:503);
 let data=rows.slice(from,from+size);
 if(mode==='short')data=data.slice(0,10);
 if(mode==='empty-later'&&from>0)data=[];
 if(mode==='duplicate-page'&&from>0)data=data.map(row=>({...row,id:1}));
 if(mode==='duplicate-within'&&data.length>1)data[1]={...data[1],id:data[0].id};
 const count=mode==='invalid-count'?'invalid':mode==='negative-count'?-1:mode==='overshoot'?1:rows.length+(mode==='changed-count'&&from>0?1:0);
 return response(data,200,mode==='missing-count'?{}:{'Content-Range':`${from}-${from+data.length-1}/${count}`});
}
beforeEach(()=>{
 vi.clearAllMocks();port.ctx=context();mode='ok';calls=[];
 vi.spyOn(console,'error').mockImplementation(()=>{});
 port.client.mockResolvedValue(createClient('http://127.0.0.1:1','synthetic-offline-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:transport}}));
});
afterEach(()=>vi.restoreAllMocks());

for(const [entity,read,prefix] of [['cost_centers',getCostCenters,'cost'],['profit_centers',getProfitCenters,'profit']] as const){
 describe(entity,()=>{
  beforeEach(()=>seed(entity,501));
  it('collects501 complete full rows beyond the SDK cap before attaching labels',async()=>{
   const result=await read();expect(result.success).toBe(true);expect(result.data).toHaveLength(501);
   expect(result.data?.map(row=>row.id)).toEqual(rows.map(row=>row.id));
   expect(result.data?.[500]).toMatchObject({id:501,sort_order:0,is_active:false,is_system:false,is_locked:false,workspace_revision:7,notes:'Retained history',owner_company:labels.owner_company,branch:labels.branch,type_label:labels.type_label,parent:{[`${prefix}_center_code`]:'PARENT',[`${prefix}_center_name_en`]:'Parent history',[`${prefix}_center_name_ar`]:null}});
   expect(calls.map(call=>call.body?'labels':call.url.searchParams.get('offset'))).toEqual(['0','500','labels']);
  });
  it.each([0,1,500,501,1001])('verifies exact count %i, bounded pages and label batches',async count=>{
   seed(entity,count);const result=await read();expect(result).toMatchObject({success:true});expect(result.data).toHaveLength(count);
   expect(result.data?.map(row=>row.id)).toEqual(rows.map(row=>row.id));
   const business=calls.filter(call=>!call.body);
   expect(business.map(call=>call.url.searchParams.get('offset'))).toEqual(Array.from({length:Math.max(1,Math.ceil(count/500))},(_,i)=>String(i*500)));
   expect(calls.filter(call=>call.body).map(call=>call.body?.p_ids.length)).toEqual(count===0?[]:count<=1000?[count]:[1000,count-1000]);
   for(const call of business){expect(call.headers.get('prefer')).toContain('count=exact');expect(call.url.searchParams.get('limit')).toBe('500');}
  });
  it('keeps original projection, stable ties, scope/history and every explicit false filter on every page',async()=>{
   await read({owner_company_id:1,branch_id:2,[`parent_${prefix}_center_id`]:9,[`${prefix}_center_type_code`]:'OPERATING',is_active:false,is_system:false,is_locked:false});
   const business=calls.filter(call=>!call.body);expect(business).toHaveLength(2);
   for(const {url} of business){
    expect(url.searchParams.get('order')).toBe(`sort_order.asc,${prefix}_center_name_en.asc,id.asc`);
    expect(url.searchParams.get('select')).toBe(`*,parent:${entity}!parent_${prefix}_center_id(${prefix}_center_code,${prefix}_center_name_en,${prefix}_center_name_ar),owner_company:owner_companies(company_code,legal_name_en),branch:branches!${entity}_branch_id_fkey(branch_code,branch_name_en,branch_name_ar)`);
    for(const [key,value] of Object.entries({owner_company_id:1,branch_id:2,[`parent_${prefix}_center_id`]:9,[`${prefix}_center_type_code`]:'OPERATING',is_active:false,is_system:false,is_locked:false}))expect(url.searchParams.get(key)).toBe(`eq.${value}`);
    expect(url.searchParams.has('deleted_at')).toBe(false);
   }
  });
  it('does not add an active-only, company or parent-choice restriction by default',async()=>{
   await read();for(const {url} of calls.filter(call=>!call.body))for(const field of ['is_active','is_system','is_locked','owner_company_id','branch_id',`parent_${prefix}_center_id`,'deleted_at'])expect(url.searchParams.has(field)).toBe(false);
  });
  it.each(['%','_','\\','"',',','(',')','اسم','x%,_"\\)'])('quotes literal search %s in fixed code and bilingual fields on every page',async search=>{
   await read({search});const business=calls.filter(call=>!call.body);expect(business).toHaveLength(2);
   for(const {url} of business)expect(url.searchParams.get('or')).toBe(`(${prefix}_center_code.ilike.${literalContains(search)},${prefix}_center_name_en.ilike.${literalContains(search)},${prefix}_center_name_ar.ilike.${literalContains(search)})`);
  });
  it.each(['first-error','later-error','later-denied','network','missing-count','invalid-count','negative-count','changed-count','duplicate-page','duplicate-within','overshoot','short','empty-later'] as Mode[])('rejects %s with no partial prefix or premature labels',async problem=>{
   mode=problem;const result=await read();expect(result).toEqual(failure);expect(calls.some(call=>call.body)).toBe(false);expect(JSON.stringify(result)).not.toContain('PRIVATE');
   if(problem==='first-error'||problem==='network')expect(calls).toHaveLength(1);
   if(problem==='later-error'||problem==='later-denied')expect(calls).toHaveLength(2);
  });
  it.each(['label-error','missing-label','unsolicited-label','malformed-label'] as Mode[])('rejects %s after complete rows instead of forwarding a partial labelled result',async problem=>{
   seed(entity,1001);mode=problem;expect(await read()).toEqual(failure);
   expect(calls.slice(0,3).map(call=>call.url.searchParams.get('offset'))).toEqual(['0','500','1000']);
   if(problem==='label-error')expect(calls.filter(call=>call.body).map(call=>call.body?.p_ids.length)).toEqual([1000,1]);
  });
  it.each(['',manage,lock])('denies non-view/scoped-only %s before client creation',async code=>{
   port.ctx=context(code);expect(await read()).toEqual(denied);expect(port.client).not.toHaveBeenCalled();expect(calls).toEqual([]);
  });
  it.each([manage,lock])('retains global %s admission without a scoped view grant',async code=>{
   port.ctx=context(code,true);expect((await read()).success).toBe(true);expect(calls.filter(call=>!call.body)).toHaveLength(2);
  });
  it('retains account-active admission before a view grant can load data',async()=>{
   port.ctx={...context(),isAccountActive:false};expect(await read()).toEqual(denied);expect(port.client).not.toHaveBeenCalled();
  });
 });
}
