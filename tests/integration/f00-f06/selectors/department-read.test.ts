import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({permission:vi.fn(),client:vi.fn(),auth:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({hasPermission:m.permission}));
vi.mock('@/server/reads/read-context',()=>({getReadAuthContext:m.auth}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
import {readDepartments} from '@/server/reads/departments';
import {literalContains} from '@/lib/reads/search';
const operations:{method:string;args:unknown[]}[]=[];
let responses:unknown[]=[];
beforeEach(()=>{
 operations.length=0;responses=[];vi.resetAllMocks();m.permission.mockReturnValue(true);m.auth.mockResolvedValue({});
 m.client.mockImplementation(async()=>({from:(table:string)=>{
  expect(table).toBe('departments');
  const builder:Record<string,unknown>={then:(resolve:(value:unknown)=>void)=>Promise.resolve(responses.shift()).then(resolve)};
  for(const method of ['select','retry','is','order','eq','or','range'])builder[method]=(...args:unknown[])=>{operations.push({method,args});return builder;};
  return builder;
 }}));
});
it.each(['DEPT-01','Operations','العمليات','_%",()'])('searches code and both languages literally: %s',async search=>{
 responses=[{data:[],count:0,error:null}];
 expect((await readDepartments({search,owner_company_id:2,branch_id:7,is_active:false})).success).toBe(true);
 const term=literalContains(search);
 expect(operations).toContainEqual({method:'or',args:[`department_code.ilike.${term},department_name_en.ilike.${term},department_name_ar.ilike.${term}`]});
 for(const [column,value] of [['owner_company_id',2],['branch_id',7],['is_active',false]])expect(operations).toContainEqual({method:'eq',args:[column,value]});
});
it('uses a lean revision-aware projection, exact counts and unique stable order',async()=>{
 responses=[{data:[{id:3,workspace_revision:9}],count:1,error:null}];
 expect((await readDepartments()).data?.[0].workspace_revision).toBe(9);
 const select=operations.find(o=>o.method==='select')!;
 expect(select.args[0]).not.toContain('*');expect(select.args[0]).toContain('branch:branches(id,branch_name_en)');
 expect(select.args[1]).toEqual({count:'exact'});
 expect(operations.filter(o=>o.method==='order').map(o=>o.args)).toEqual([['department_name_en'],['id']]);
 expect(operations).toContainEqual({method:'retry',args:[false]});
});
it('collects multiple pages but never returns a partial over-budget collection',async()=>{
 responses=[{data:Array.from({length:500},(_,id)=>({id})),count:501,error:null},{data:[{id:500}],count:501,error:null}];
 expect((await readDepartments()).data).toHaveLength(501);
 responses=[{data:[],count:1001,error:null}];expect((await readDepartments()).success).toBe(false);
});
it('fails closed for denied or invalid reads before querying',async()=>{
 m.permission.mockReturnValue(false);expect((await readDepartments()).kind).toBe('forbidden');expect(m.client).not.toHaveBeenCalled();
 m.permission.mockReturnValue(true);expect((await readDepartments({owner_company_id:-1})).kind).toBe('invalid_input');expect(m.client).not.toHaveBeenCalled();
});
it('does not disclose provider failures or mislabel them as empty departments',async()=>{
 responses=[{data:null,count:null,error:{message:'PRIVATE DATABASE DETAIL'}}];
 const result=await readDepartments();expect(result.success).toBe(false);expect(result.kind).toBe('failed');expect(result.error).not.toContain('PRIVATE');expect(result.data).toBeUndefined();
});
