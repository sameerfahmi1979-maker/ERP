import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';

type Reply={data:unknown;error:unknown};
type QueryCall={table:string;steps:[string,...unknown[]][]};
const port=vi.hoisted(()=>({auth:vi.fn(),client:vi.fn(),log:vi.fn(),replies:[] as (Reply|Error)[],calls:[] as QueryCall[]}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:port.auth}));
vi.mock('@/lib/supabase/server',()=>({createClient:port.client}));
vi.mock('@/lib/logger',()=>({logger:{error:port.log}}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/server/actions/audit',()=>({logAudit:vi.fn(),createAuditDiff:vi.fn()}));
import {listDesignations} from '@/server/actions/common-master-data/designations';
import {getLookupDashboardStats} from '@/server/actions/master-data/lookups';

const secret='PRIVATE_LOOKUP_CONNECTION_AND_QUERY_DETAIL';
const designationFailure={success:false,kind:'failed',error:'Designations could not be loaded. Try again.'};
const dashboardFailure={success:false,kind:'failed',error:'Master data statistics could not be loaded. Try again.'};
const denied={success:false,kind:'forbidden',error:'Permission denied'};
function context(codes:string[]):AuthContext{
  return {profile:{id:41,must_change_password:false},isAccountActive:true,roleCodes:[],permissionCodes:codes,globalPermissionCodes:[],
    roleAssignments:[{roleCode:'synthetic_reader',ownerCompanyId:7,branchId:8,permissionCodes:codes}]} as unknown as AuthContext;
}
function designationRows(){
  return [true,false].map((active,i)=>({id:i+11,designation_code:`ROLE_${i}`,designation_name_en:`Retained ${i}`,designation_name_ar:null,
    owner_company_id:i?null:7,department_id:i?null:8,job_level:null,management_level:'staff',is_supervisor:false,is_authorized_signatory:false,
    has_approval_authority:false,is_safety_critical:false,description:null,is_active:active,created_at:'2026-01-01T00:30:00+04:00',
    updated_at:'2026-09-30T23:45:00Z',deleted_at:null,owner_company:i?null:{id:7,legal_name_en:'Retained company'},
    department:i?null:{id:8,department_name_en:'Retained department'}}));
}
function builder(table:string){
  const index=port.calls.length,call:QueryCall={table,steps:[]};port.calls.push(call);
  const step=(name:string)=>(...args:unknown[])=>{call.steps.push([name,...args]);return query;};
  const query={select:step('select'),eq:step('eq'),is:step('is'),order:step('order'),limit:step('limit'),ilike:step('ilike'),
    then:(resolve:(value:Reply)=>unknown,reject?:(reason:unknown)=>unknown)=>{
      const reply=port.replies[index];
      return (reply instanceof Error?Promise.reject(reply):Promise.resolve(reply)).then(resolve,reject);
    }};
  return query;
}
beforeEach(()=>{
  vi.resetAllMocks();port.calls=[];port.replies=[{data:[],error:null},{data:[],error:null},{data:[],error:null}];
  port.auth.mockResolvedValue(context(['common_md.view','master_data.dashboard.view']));
  port.client.mockResolvedValue({from:builder});
});
function safeFailure(result:unknown,expected:unknown){
  expect(result).toEqual(expected);expect(result).not.toHaveProperty('data');
  expect(JSON.stringify([result,port.log.mock.calls],(_key,value)=>value instanceof Error?{message:value.message,stack:value.stack}:value)).not.toContain(secret);
}

describe('real action authority and setup outcomes',()=>{
  for(const [name,read,view,failure] of [
    ['designations',listDesignations,'common_md.view',designationFailure],
    ['dashboard',getLookupDashboardStats,'master_data.dashboard.view',dashboardFailure],
  ] as const){
    it.each(['none','inactive','password','manager-only','unrelated-lookup'])(`${name}: %s denies before business client`,async mode=>{
      const ctx=context(mode==='manager-only'?['common_md.manage','common_md.designations.manage']:mode==='unrelated-lookup'?['master_data.lookups.view']:[view]);
      if(mode==='none')ctx.permissionCodes=[];
      if(mode==='inactive')ctx.isAccountActive=false;
      if(mode==='password')ctx.profile={...ctx.profile!,must_change_password:true};
      port.auth.mockResolvedValue(ctx);
      expect(await read()).toEqual(denied);expect(port.client).not.toHaveBeenCalled();expect(port.calls).toEqual([]);
    });
    it(`${name}: existing scoped aggregate read capability still admits`,async()=>{
      port.auth.mockResolvedValue(context([view]));expect((await read()).success).toBe(true);expect(port.client).toHaveBeenCalledOnce();
    });
    it(`${name}: real helper admits global admin without fabricated permission codes`,async()=>{
      const ctx=context([]);ctx.roleCodes=['system_admin'];ctx.roleAssignments=[{roleId:1,roleCode:'system_admin',ownerCompanyId:null,branchId:null,permissionCodes:[]}];
      port.auth.mockResolvedValue(ctx);expect((await read()).success).toBe(true);
    });
    it(`${name}: rejected auth setup is failed, not forbidden/empty, without business client or raw log`,async()=>{
      port.auth.mockRejectedValue(new Error(secret));safeFailure(await read(),failure);
      expect(port.client).not.toHaveBeenCalled();expect(port.calls).toEqual([]);
    });
    it(`${name}: rejected client setup is safe failed`,async()=>{
      port.client.mockRejectedValue(new Error(secret));safeFailure(await read(),failure);expect(port.calls).toEqual([]);
    });
  }
});

describe('designation collection outcome',()=>{
  it('retains its designation-specific view alternative',async()=>{
    port.auth.mockResolvedValue(context(['common_md.designations.view']));expect(await listDesignations()).toEqual({success:true,data:[]});
  });
  it.each([null,undefined,{},'not an array'])('rejects malformed collection %j instead of inventing empty success',async data=>{
    port.replies=[{data,error:null}];safeFailure(await listDesignations(),designationFailure);
  });
  it.each([false,true])('a query error wins over supplied data=%s, including 42501',async withData=>{
    port.replies=[{data:withData?designationRows():null,error:{code:'42501',message:secret}}];
    safeFailure(await listDesignations(),designationFailure);expect(port.calls).toHaveLength(1);
  });
  it('a thrown query is safe failed',async()=>{
    port.replies=[new Error(secret)];safeFailure(await listDesignations(),designationFailure);
  });
  it('confirms genuine empty separately, with unchanged projection/deleted/order and no active default',async()=>{
    expect(await listDesignations()).toEqual({success:true,data:[]});
    expect(port.calls).toEqual([{table:'designations',steps:[
      ['select','*, owner_company:owner_companies(id,legal_name_en), department:departments(id,department_name_en)'],
      ['is','deleted_at',null],['order','designation_name_en'],
    ]}]);
  });
  it('passes original active/inactive rows, false/null labels/timestamps and explicit filters unchanged',async()=>{
    const rows=designationRows(),before=structuredClone(rows);port.replies=[{data:rows,error:null}];
    const result=await listDesignations({owner_company_id:7,department_id:8,is_active:false,search:'%_retained'});
    expect(result).toEqual({success:true,data:before});expect(result.data).toBe(rows);expect(rows).toEqual(before);
    expect(port.calls[0].steps.slice(3)).toEqual([['eq','owner_company_id',7],['eq','department_id',8],['eq','is_active',false],['ilike','designation_name_en','%%_retained%']]);
  });
});

describe('dashboard all-three-read boundary',()=>{
  for(const stage of [0,1,2]){
    it.each([false,true])(`stage ${stage}: resolved error wins over data=%s and stops downstream reads`,async withData=>{
      port.replies[stage]={data:withData?[{id:1,is_active:true,is_locked:false,category:{category_name_en:'Valid-looking'}}]:null,error:{code:'42501',message:secret}};
      safeFailure(await getLookupDashboardStats(),dashboardFailure);expect(port.calls).toHaveLength(stage+1);
    });
    it.each([null,undefined,{},'not an array'])(`stage ${stage}: malformed %j is not zero/partial success`,async data=>{
      port.replies[stage]={data,error:null};safeFailure(await getLookupDashboardStats(),dashboardFailure);expect(port.calls).toHaveLength(stage+1);
    });
    it(`stage ${stage}: thrown read is sanitized and stops downstream reads`,async()=>{
      port.replies[stage]=new Error(secret);safeFailure(await getLookupDashboardStats(),dashboardFailure);expect(port.calls).toHaveLength(stage+1);
    });
  }
  it('only three confirmed empty arrays produce exactly eight zeros and an empty recent list',async()=>{
    expect(await getLookupDashboardStats()).toEqual({success:true,data:{total_categories:0,active_categories:0,inactive_categories:0,locked_categories:0,
      total_values:0,active_values:0,inactive_values:0,locked_values:0,recently_updated:[]}});
    expect(port.calls.map(c=>c.table)).toEqual(['global_lookup_categories','global_lookup_values','global_lookup_values']);
  });
  it('keeps all counts, false values, join shapes, dates and the exact original query sequence',async()=>{
    const date='2026-09-30T23:45:00+04:00';
    port.replies=[
      {data:[{id:1,is_active:true,is_locked:true},{id:2,is_active:true,is_locked:false},{id:3,is_active:false,is_locked:false}],error:null},
      {data:[{id:4,is_active:true,is_locked:false},{id:5,is_active:false,is_locked:true},{id:6,is_active:false,is_locked:true},{id:7,is_active:false,is_locked:false}],error:null},
      {data:[{value_label_en:'Object label',updated_at:date,category:{category_name_en:'Object category'}},
        {value_label_en:'Array label',updated_at:date,category:[{category_name_en:'Array category'}]},
        {value_label_en:'Retained unknown',updated_at:date,category:null}],error:null},
    ];
    const before=structuredClone(port.replies);
    expect(await getLookupDashboardStats()).toEqual({success:true,data:{total_categories:3,active_categories:2,inactive_categories:1,locked_categories:1,
      total_values:4,active_values:1,inactive_values:3,locked_values:2,recently_updated:[
        {category_name:'Object category',value_label:'Object label',updated_at:date,updated_by_name:null},
        {category_name:'Array category',value_label:'Array label',updated_at:date,updated_by_name:null},
        {category_name:'Unknown',value_label:'Retained unknown',updated_at:date,updated_by_name:null},
      ]}});
    expect(port.replies).toEqual(before);
    expect(port.calls.map(c=>({...c,steps:c.steps.map(([method,...args])=>[method,...args.map(v=>typeof v==='string'?v.replace(/\s+/g,' ').trim():v)])}))).toEqual([
      {table:'global_lookup_categories',steps:[['select','id, is_active, is_locked']]},
      {table:'global_lookup_values',steps:[['select','id, is_active, is_locked']]},
      {table:'global_lookup_values',steps:[['select','value_label_en, updated_at, category:global_lookup_categories!inner(category_name_en)'],['order','updated_at',{ascending:false}],['limit',10]]},
    ]);
  });
});
