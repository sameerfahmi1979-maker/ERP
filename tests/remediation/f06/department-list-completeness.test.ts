import {createClient} from '@supabase/supabase-js';
import {beforeEach,expect,it,vi} from 'vitest';
import {literalContains} from '@/lib/reads/search';
const port=vi.hoisted(()=>({allow:true,client:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({}),hasPermission:()=>port.allow}));
vi.mock('@/lib/supabase/server',()=>({createClient:port.client}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {listDepartments} from '@/server/actions/common-master-data/departments';
type Mode='ok'|'error'|'denied'|'count'|'missing'|'duplicate'|'short';
let mode:Mode='ok',calls:URL[]=[],rows:Record<string,unknown>[]=[];
beforeEach(()=>{
 vi.clearAllMocks();port.allow=true;mode='ok';calls=[];
 rows=Array.from({length:501},(_,i)=>({id:i+1,department_code:`D${i+1}`,department_name_en:'Same name',department_name_ar:'اسم',owner_company_id:1,branch_id:2,is_active:false,workspace_revision:7,owner_company:{id:1,legal_name_en:'Company',company_code:'C1'},branch:{id:2,branch_name_en:'Branch'},parent_department:{id:9,department_name_en:'Parent'}}));
 port.client.mockResolvedValue(createClient('http://127.0.0.1:1','synthetic-offline-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async input=>{
  const url=new URL(String(input));calls.push(url);const from=Number(url.searchParams.get('offset')??0),size=Number(url.searchParams.get('limit')??500);
  if(from>0&&(mode==='error'||mode==='denied'))return new Response(JSON.stringify({message:'PRIVATE'}),{status:mode==='denied'?403:503});
  let data=rows.slice(from,from+size);if(mode==='short')data=data.slice(0,10);if(from>0&&mode==='duplicate')data=data.map(r=>({...r,id:1}));
  return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json',...(mode==='missing'?{}:{'Content-Range':`${from}-${from+data.length-1}/${rows.length+(from>0&&mode==='count'?1:0)}`})}});
 }}}));
});
it('collects501 caller rows with identical filters, stable ties and original scope labels',async()=>{
 const result=await listDepartments({owner_company_id:1,branch_id:2,is_active:false});expect(result.success).toBe(true);expect(result.data).toHaveLength(501);expect(result.data?.[500]).toMatchObject(rows[500]);
 expect(calls).toHaveLength(2);for(const u of calls){expect(u.searchParams.get('order')).toBe('department_name_en.asc,id.asc');expect(u.searchParams.get('owner_company_id')).toBe('eq.1');expect(u.searchParams.get('branch_id')).toBe('eq.2');expect(u.searchParams.get('is_active')).toBe('eq.false');expect(u.searchParams.get('deleted_at')).toBe('is.null');expect(u.searchParams.get('select')).toContain('parent_department:departments!parent_department_id(id,department_name_en)');}
});
it('uses only escaped fixed code/English/Arabic fields on every page',async()=>{const value='x%,_"\\)';await listDepartments({search:value});expect(calls).toHaveLength(2);for(const u of calls)expect(u.searchParams.get('or')).toBe(`(department_code.ilike.${literalContains(value)},department_name_en.ilike.${literalContains(value)},department_name_ar.ilike.${literalContains(value)})`);});
it.each(['error','denied','count','missing','duplicate','short'] as Mode[])('rejects %s rather than truncated success',async m=>{mode=m;const r=await listDepartments();expect(r).toMatchObject({success:false,kind:'failed'});expect(r.data).toBeUndefined();expect(JSON.stringify(r)).not.toContain('PRIVATE');});
it('verifies exact empty results',async()=>{rows=[];expect(await listDepartments()).toEqual({success:true,data:[]});});
it('denial never creates a client',async()=>{port.allow=false;expect(await listDepartments()).toMatchObject({success:false,kind:'forbidden'});expect(port.client).not.toHaveBeenCalled();});
