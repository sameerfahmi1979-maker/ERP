import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';

type Reply={data:unknown;error:unknown;count?:number|null};
type QueryCall={table:string;steps:[string,...unknown[]][]};
const port=vi.hoisted(()=>({auth:vi.fn(),client:vi.fn(),log:vi.fn(),replies:[] as (Reply|Error)[],calls:[] as QueryCall[],replyTo:null as ((call:QueryCall)=>Reply)|null}));
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
  const query={select:step('select'),eq:step('eq'),is:step('is'),order:step('order'),limit:step('limit'),or:step('or'),range:step('range'),
    then:(resolve:(value:Reply)=>unknown,reject?:(reason:unknown)=>unknown)=>{
      const reply=port.replyTo?.(call) ?? port.replies[index];
      return (reply instanceof Error?Promise.reject(reply):Promise.resolve(reply)).then(resolve,reject);
    }};
  return query;
}
beforeEach(()=>{
  vi.resetAllMocks();port.calls=[];port.replyTo=null;
  port.replies=[{data:[],count:0,error:null},...Array.from({length:5},()=>({data:null,count:0,error:null})),{data:[],error:null}];
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
    port.auth.mockResolvedValue(context(['common_md.designations.view']));expect(await listDesignations()).toEqual({success:true,data:[],totalCount:0});
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
    expect(await listDesignations()).toEqual({success:true,data:[],totalCount:0});
    expect(port.calls).toEqual([{table:'designations',steps:[
      ['select','*, owner_company:owner_companies(id,legal_name_en), department:departments(id,department_name_en)',{count:'exact',head:false}],
      ['is','deleted_at',null],['order','designation_name_en'],['order','id'],['range',0,24],
    ]}]);
  });
  it('passes original active/inactive rows, false/null labels/timestamps and explicit filters unchanged',async()=>{
    const rows=designationRows(),before=structuredClone(rows);port.replies=[{data:rows,count:rows.length,error:null}];
    const result=await listDesignations({owner_company_id:7,department_id:8,is_active:false,search:'%_retained'});
    expect(result).toEqual({success:true,data:before,totalCount:2});expect(result.data).toBe(rows);expect(rows).toEqual(before);
    expect(port.calls[0].steps.slice(3)).toEqual([['eq','owner_company_id',7],['eq','department_id',8],['eq','is_active',false],
      ['or',String.raw`designation_name_en.ilike."%\\%\\_retained%",designation_code.ilike."%\\%\\_retained%"`],['order','id'],['range',0,24]]);
  });
});

describe('dashboard counts and recent-read boundary',()=>{
  it('counts beyond the REST collection limit without fetching status rows',async()=>{
    const categories=Array.from({length:1250},(_,i)=>({id:i+1,is_active:i%5!==0,is_locked:i%10===0}));
    const values=Array.from({length:2705},(_,i)=>({id:i+1,is_active:i%5!==0,is_locked:i%10===0}));
    port.replyTo=({table,steps})=>{
      if(steps.some(([method])=>method==='limit'))return {data:[],error:null};
      const rows=table==='global_lookup_categories'?categories:values;
      const status=steps.find(([method])=>method==='eq')?.[1];
      const matched=rows.filter(row=>status==='is_active'?row.is_active:status==='is_locked'?row.is_locked:true);
      return steps.some(([method,,options])=>method==='select' && (options as {head?:boolean}|undefined)?.head)
        ? {data:null,count:matched.length,error:null}
        : {data:matched.slice(0,1000),error:null};
    };
    expect(await getLookupDashboardStats()).toEqual({success:true,data:{total_categories:1250,active_categories:1000,inactive_categories:250,locked_categories:125,
      total_values:2705,active_values:2164,inactive_values:541,locked_values:271,recently_updated:[]}});
    expect(port.calls.filter(({steps})=>steps.some(([method,,options])=>method==='select' && (options as {head?:boolean}|undefined)?.head))).toHaveLength(6);
  });
  for(const stage of [0,1,2,3,4,5,6]){
    it.each([false,true])(`read ${stage}: resolved error wins over data=%s`,async withData=>{
      port.replies[stage]={data:withData?[{id:1,is_active:true,is_locked:false,category:{category_name_en:'Valid-looking'}}]:null,
        count:withData?0:null,error:{code:'42501',message:secret}};
      safeFailure(await getLookupDashboardStats(),dashboardFailure);
    });
    it(`read ${stage}: thrown read is sanitized`,async()=>{
      port.replies[stage]=new Error(secret);safeFailure(await getLookupDashboardStats(),dashboardFailure);
    });
  }
  it.each([null,undefined,-1,0.5,Number.MAX_SAFE_INTEGER+1])('rejects a malformed exact count %s',async count=>{
    port.replies[0]={data:null,count,error:null};safeFailure(await getLookupDashboardStats(),dashboardFailure);
  });
  it.each([null,undefined,{},'not an array'])('rejects malformed recent data %j',async data=>{
    port.replies[6]={data,error:null};safeFailure(await getLookupDashboardStats(),dashboardFailure);
  });
  it.each([1,2,4,5])('rejects a count at index %s that exceeds its total',async index=>{
    port.replies[index]={data:null,count:1,error:null};safeFailure(await getLookupDashboardStats(),dashboardFailure);
  });
  it('confirmed empty counts and recent data produce exactly eight zeros and an empty recent list',async()=>{
    expect(await getLookupDashboardStats()).toEqual({success:true,data:{total_categories:0,active_categories:0,inactive_categories:0,locked_categories:0,
      total_values:0,active_values:0,inactive_values:0,locked_values:0,recently_updated:[]}});
  });
  it('uses the same visible data for exact counts and retains recent join shapes and dates',async()=>{
    const date='2026-09-30T23:45:00+04:00';
    port.replies=[
      ...[3,2,1,4,1,2].map(count=>({data:null,count,error:null})),
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
    const head=['select','id',{count:'exact',head:true}];
    expect(port.calls.map(c=>({...c,steps:c.steps.map(([method,...args])=>[method,...args.map(v=>typeof v==='string'?v.replace(/\s+/g,' ').trim():v)])}))).toEqual([
      ...['global_lookup_categories','global_lookup_values'].flatMap(table=>[
        {table,steps:[head]},
        {table,steps:[head,['eq','is_active',true]]},
        {table,steps:[head,['eq','is_locked',true]]},
      ]),
      {table:'global_lookup_values',steps:[['select','value_label_en, updated_at, category:global_lookup_categories!inner(category_name_en)'],['order','updated_at',{ascending:false}],['limit',10]]},
    ]);
  });
});
