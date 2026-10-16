import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({allowed:true,client:vi.fn(),reads:[]as Array<{table:string;projection:string;after:number;filters:Array<unknown>}> ,failure:false,duplicate:false}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({}),hasGlobalPermission:()=>m.allowed}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
import {getHrRuleChoices} from '@/server/actions/hr/settings-references';
beforeEach(()=>{
 vi.clearAllMocks();m.allowed=true;m.failure=false;m.duplicate=false;m.reads=[];
 m.client.mockResolvedValue({from:(table:string)=>{const query={table,projection:'',after:0,filters:[]as unknown[]};const q:any={select:(v:string)=>{query.projection=v;return q;},is:(...v:unknown[])=>{query.filters.push(v);return q;},eq:(...v:unknown[])=>{query.filters.push(v);return q;},gt:(_k:string,v:number)=>{query.after=v;return q;},order:()=>q,limit:(n:number)=>{expect(n).toBe(200);return q;},then:(resolve:(value:unknown)=>unknown)=>{
  m.reads.push(query);
  const data=query.after===0?Array.from({length:200},(_,i)=>({id:i+1,rule_name_en:'Named rule '+i,rule_code:'R'+i,name_en:'Named category '+i,code:'C'+i,designation_name_en:'Operator',designation_code:'D'+i,owner_company_id:1,owner_company:{legal_name_en:'Synthetic company'}})):query.after===200?[{id:m.duplicate?200:201,rule_name_en:'Later rule',rule_code:'R201',name_en:'Later category',code:'C201',designation_name_en:'Supervisor',designation_code:'D201',owner_company_id:2,owner_company:{legal_name_en:'Other permitted company'}}]:[];
  return Promise.resolve(m.failure&&query.after===200?{data:null,error:{message:'sensitive SQL diagnostic'}}:{data,error:null}).then(resolve);
 }};return q;}});
});
it('collects every page and keeps company-qualified names, not just IDs',async()=>{const r=await getHrRuleChoices('hr_role_requirement_matrix');expect(r.success).toBe(true);expect(r.data?.designation_id).toHaveLength(201);expect(r.data?.designation_id.at(-1)?.label).toBe('Supervisor · D201 — Other permitted company');expect(m.reads.every(q=>!q.projection.includes('*')&&q.filters.some(v=>JSON.stringify(v)==='["deleted_at",null]'))).toBe(true);expect(m.reads.filter(q=>q.table==='designations').map(q=>q.after)).toEqual([0,200,201]);});
it('fails the whole catalogue on a later-page error without diagnostics',async()=>{m.failure=true;expect(await getHrRuleChoices('hr_role_requirement_matrix')).toEqual({success:false,error:'Reference choices could not load. Retry before saving; your entries are retained.'});});
it('rejects duplicate/nonprogressing response instead of looping',async()=>{m.duplicate=true;const r=await getHrRuleChoices('hr_role_requirement_matrix');expect(r.success).toBe(false);expect(r.data).toBeUndefined();});
it('denied scope never opens a database client',async()=>{m.allowed=false;expect((await getHrRuleChoices('hr_role_requirement_matrix')).success).toBe(false);expect(m.client).not.toHaveBeenCalled();});
it.each(['user_profiles','hr_mohre_establishments','toString','__proto__'])('rejects unlisted entity %s',async entity=>{expect((await getHrRuleChoices(entity as never)).success).toBe(false);expect(m.client).not.toHaveBeenCalled();});
