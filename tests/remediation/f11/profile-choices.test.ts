import {beforeEach,expect,it,vi} from 'vitest';
import {EMPLOYEE_CHOICE_KINDS} from '@/lib/hr/employee-profile-choices';
import {readEmployeeProfileChoices} from '@/server/reads/employee-profile-choices';

type Call={table:string;steps:[string,...unknown[]][]};
type Row={id:number;label:string;code:string|null;active:boolean|string};
const state=vi.hoisted(()=>({context:{} as unknown,calls:[] as Call[],rows:{} as Record<string,Row[]>,failed:'',noCount:'',partial:'',duplicate:'',countChange:'',oversized:'',started:[] as string[],gate:null as Promise<void>|null,auth:0}));
vi.mock('@/server/reads/read-context',()=>({getReadAuthContext:async()=>{state.auth++;return state.context;}}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope')}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{throw Error('Privileged fallback forbidden');}}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:(table:string)=>{
 const call:Call={table,steps:[]};state.calls.push(call);
 const q:Record<string,unknown>={then:async(resolve:(r:unknown)=>unknown)=>{
  state.started.push(table);await state.gate;
  const [from,to]=call.steps.find(s=>s[0]==='range')!.slice(1) as number[];
  const rows=state.rows[table]??[{id:1,label:'Synthetic',code:'SYNTH',active:true}];
  let data=rows.slice(from,to+1);if(state.partial===table)data=data.slice(0,-1);if(state.duplicate===table&&data.length>1)data[1]=data[0];
  const count=state.noCount===table?null:state.oversized===table?5001:rows.length+(state.countChange===table&&from>0?1:0);
  return resolve({data,error:state.failed===table?{message:'PRIVATE_DATABASE_DETAIL'}:null,count});
 }};
 for(const method of ['select','is','order','eq','or','range','abortSignal'])q[method]=(...args:unknown[])=>{call.steps.push([method,...args]);return q;};
 return q;
}})}));
const input=()=>({companyId:3,branchId:4,departmentId:5,selected:Object.fromEntries(EMPLOYEE_CHOICE_KINDS.map(kind=>[kind,null]))});
beforeEach(()=>{state.context={profile:{id:1},isAccountActive:true,permissionCodes:['hr.employees.update','common_md.view'],roleAssignments:[],roleCodes:[]};state.calls=[];state.rows={};state.failed=state.noCount=state.partial=state.duplicate=state.countChange=state.oversized='';state.started=[];state.gate=null;state.auth=0;});
it.each([{companyId:0},{branchId:'4'},{departmentId:2**53},{selected:{departments:1}},{admin:true}])('rejects malformed criteria before authority/query work: %j',async extra=>{
 expect((await readEmployeeProfileChoices({...input(),...extra})).success).toBe(false);expect(state.auth).toBe(0);expect(state.calls).toEqual([]);
});
it.each([{}, {profile:{id:1},isAccountActive:false}, {profile:{id:1,must_change_password:true},isAccountActive:true}, {profile:{id:1},isAccountActive:true,permissionCodes:[],roleAssignments:[],roleCodes:[]}])('fails closed for unavailable or unadmitted principal %j',async context=>{
 state.context=context;expect((await readEmployeeProfileChoices(input())).success).toBe(false);expect(state.calls).toEqual([]);
});
it('loads seven minimal complete catalogues concurrently with one authority lookup',async()=>{
 let release!:()=>void;state.gate=new Promise<void>(resolve=>{release=resolve;});const result=readEmployeeProfileChoices(input());
 await vi.waitFor(()=>expect(state.started).toHaveLength(7));release();
 expect((await result).success).toBe(true);expect(state.auth).toBe(1);
 for(const call of state.calls){expect(call.steps).toContainEqual(['is','deleted_at',null]);expect(call.steps.find(s=>s[0]==='select')?.[1]).toMatch(/^id,label:[a-z_]+,code:[a-z_]+,active:[a-z_]+$/);expect(call.steps).toContainEqual(['range',0,499]);}
});
it('uses one composite OR predicate without discarding company/branch/department restrictions',async()=>{
 await readEmployeeProfileChoices({...input(),selected:{...input().selected,departments:77,designations:88}});
 const department=state.calls.find(c=>c.table==='departments')!,designation=state.calls.find(c=>c.table==='designations')!;
 expect(department.steps).toContainEqual(['eq','owner_company_id',3]);
 const predicates=department.steps.filter(s=>s[0]==='or');expect(predicates).toHaveLength(1);
 expect(predicates[0][1]).toContain('id.eq.77');expect(predicates[0][1]).toContain('or(branch_id.is.null,branch_id.eq.4)');expect(predicates[0][1]).toContain('effective_from');
 expect(designation.steps.filter(s=>s[0]==='or')).toEqual([['or','and(or(is_active.eq.true,id.eq.88),or(owner_company_id.is.null,owner_company_id.eq.3),or(department_id.is.null,department_id.eq.5))']]);
});
it('retains inactive selected labels as disabled rather than substituting another value',async()=>{
 state.rows.hr_employee_categories=[{id:77,label:'Historical',code:null,active:false}];const result=await readEmployeeProfileChoices({...input(),selected:{...input().selected,categories:77}});
 expect(result.success&&result.data?.categories).toEqual({status:'ready',options:[{value:77,label:'Historical (inactive)',code:null,disabled:true}]});
});
it('returns denied catalogues explicitly without querying or denying unrelated personal choices',async()=>{
 state.context={profile:{id:1},isAccountActive:true,permissionCodes:['hr.employees.update'],roleAssignments:[],roleCodes:[]};const result=await readEmployeeProfileChoices(input());
 expect(result.success&&result.data?.departments.status).toBe('restricted');expect(result.success&&result.data?.categories.status).toBe('ready');expect(state.calls.some(c=>['departments','designations','work_sites'].includes(c.table))).toBe(false);
});
it.each(['failed','noCount','partial','duplicate','countChange','oversized'] as const)('does not present %s or changing catalogue as empty or complete',async flag=>{
 state[flag]='hr_employee_categories';state.rows.hr_employee_categories=Array.from({length:502},(_,i)=>({id:i+1,label:`Synthetic ${i}`,code:null,active:true}));
 const result=await readEmployeeProfileChoices(input());expect(result.success&&result.data?.categories.status).toBe('failed');expect(result.success&&result.data?.employment.status).toBe('ready');expect(JSON.stringify(result)).not.toContain('PRIVATE_DATABASE_DETAIL');
});
it('completes more than 1000 labels and keeps actual zero distinct from failure',async()=>{
 state.rows.hr_employee_categories=Array.from({length:1234},(_,i)=>({id:i+1,label:`Synthetic ${i}`,code:null,active:true}));state.rows.hr_employment_types=[];
 const result=await readEmployeeProfileChoices(input());expect(result.success&&result.data?.categories).toMatchObject({status:'ready',options:expect.any(Array)});
 if(!result.success||result.data?.categories.status!=='ready')throw Error('Expected complete catalogue');expect(result.data.categories.options).toHaveLength(1234);expect(result.data.employment).toEqual({status:'ready',options:[]});
});
it('does not broaden missing parents to all companies or branches',async()=>{
 await readEmployeeProfileChoices({...input(),companyId:null,branchId:null,departmentId:null});
 expect(state.calls.some(c=>['departments','work_sites','hr_mohre_establishments'].includes(c.table))).toBe(false);
 expect(state.calls.find(c=>c.table==='designations')?.steps).toContainEqual(['or','and(is_active.eq.true,owner_company_id.is.null,department_id.is.null)']);
});
it('propagates cancelled request rather than certifying a partial catalogue',async()=>{
 const controller=new AbortController();controller.abort();await expect(readEmployeeProfileChoices(input(),controller.signal)).rejects.toThrow();
});
