import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {beforeEach,expect,it,vi} from 'vitest';
import {literalContains} from '@/lib/reads/search';

const port=vi.hoisted(()=>({allow:true,client:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({}),hasPermission:()=>port.allow,hasGlobalPermission:()=>false}));
vi.mock('@/lib/supabase/server',()=>({createClient:port.client}));
import * as actions from '@/server/actions/hr/settings';

type Row={id:number;[key:string]:unknown};
type Mode='ok'|'later-error'|'later-denied'|'changed-count'|'missing-count'|'duplicate'|'short';
let rows:Row[]=[],calls:URL[]=[],mode:Mode='ok';
const common=[
 ['employee-categories','listHrEmployeeCategories'],['employment-types','listHrEmploymentTypes'],['grades','listHrGrades'],
 ['identity-document-types','listHrIdentityDocumentTypes'],['access-card-types','listHrAccessCardTypes'],['training-categories','listHrTrainingCategories'],
 ['training-types','listHrTrainingTypes'],['medical-record-types','listHrMedicalRecordTypes'],['leave-types','listHrLeaveTypes'],
 ['relationship-types','listHrRelationshipTypes'],['salary-component-types','listHrSalaryComponentTypes'],['payroll-groups','listHrPayrollGroups'],['pro-process-types','listHrProProcessTypes'],
] as const;
const list=(name:typeof common[number][1],params:Record<string,unknown>)=>actions[name](params);
beforeEach(()=>{
 vi.clearAllMocks();port.allow=true;calls=[];mode='ok';rows=Array.from({length:501},(_,i)=>({id:i+1,code:`CODE_${i+1}`,name_en:'Same name',name_ar:'اسم',is_active:false,sort_order:0,workspace_revision:7,grade_level:0}));
 const db=createClient('http://127.0.0.1:1','synthetic-offline-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{
  const url=new URL(String(input));calls.push(url);const from=Number(url.searchParams.get('offset')??0),size=Number(url.searchParams.get('limit')??rows.length);
  if(from>0&&(mode==='later-error'||mode==='later-denied'))return new Response(JSON.stringify({message:'PRIVATE DATABASE DETAIL'}),{status:mode==='later-denied'?403:503,headers:{'Content-Type':'application/json'}});
  let found=rows;
  const search=url.searchParams.get('or')??url.searchParams.get('name_en')??url.searchParams.get('establishment_name');
  if(search?.includes('501'))found=search.includes('code.ilike')?rows.filter(r=>r.code==='CODE_501'):[];
  const count=found.length+(from>0&&mode==='changed-count'?1:0);
  let data=found.slice(from,from+size);if(mode==='short')data=data.slice(0,10);if(from>0&&mode==='duplicate')data=data.map(r=>({...r,id:1}));
  const head=(init?.method??'GET')==='HEAD';return new Response(head?null:JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json',...(mode==='missing-count'?{}:{'Content-Range':`${from}-${from+data.length-1}/${count}`})}});
 }}});
 port.client.mockResolvedValue(db);
});

it.each(common)('%s opts into complete rows with native deterministic queries',async(_route,name)=>{
 const result=await list(name,{complete:true,is_active:false});expect(result.success).toBe(true);expect(result.data?.data).toHaveLength(501);expect(result.data?.total).toBe(501);
 expect(result.data?.data[500]).toMatchObject({id:501,is_active:false,sort_order:0,workspace_revision:7,grade_level:0});
 expect(calls).toHaveLength(2);for(const url of calls){expect(url.searchParams.get('order')).toBe('sort_order.asc,name_en.asc,id.asc');expect(url.searchParams.get('is_active')).toBe('eq.false');expect(url.searchParams.get('deleted_at')).toBe('is.null');}
 if(name==='listHrTrainingTypes')expect(calls[0].searchParams.get('select')).toContain('training_category:hr_training_categories(id,name_en)');
});
it.each([51,501])('MOHRE complete read returns all %s rows and retains scope joins',async count=>{
 rows=rows.slice(0,count);const result=await actions.listHrMohreEstablishments({complete:true,owner_company_id:4,status:'inactive'} as never);
 expect(result.success).toBe(true);expect(result.data?.data).toHaveLength(count);for(const url of calls){expect(url.searchParams.get('owner_company_id')).toBe('eq.4');expect(url.searchParams.get('status')).toBe('eq.inactive');expect(url.searchParams.get('order')).toBe('establishment_name.asc,id.asc');expect(url.searchParams.get('select')).toContain('owner_company:owner_companies(id,legal_name_en)');}
});
it('a51-row common catalogue is not mistaken for the default first50',async()=>{rows=rows.slice(0,51);expect((await list('listHrGrades',{complete:true})).data?.data).toHaveLength(51);});
it('default and explicit paged APIs retain their page and exact total',async()=>{
 const initial=await actions.listHrGrades({});expect(initial.data?.data).toHaveLength(50);expect(initial.data?.total).toBe(501);
 const page=await actions.listHrGrades({page:2,page_size:20});expect(page.data?.data[0].id).toBe(21);expect(page.data?.data).toHaveLength(20);expect(page.data?.total).toBe(501);
});
it.each([{page:1},{page_size:50},{page:2,page_size:20}])('complete conflicts with an explicit page %j before any client read',async params=>{
 expect((await list('listHrGrades',{complete:true,...params})).success).toBe(false);
 expect((await actions.listHrMohreEstablishments({complete:true,...params} as never)).success).toBe(false);expect(port.client).not.toHaveBeenCalled();
});
it.each(['later-error','later-denied','changed-count','missing-count','duplicate','short'] as Mode[])('rejects %s rather than expose a partial success',async failure=>{
 mode=failure;const result=await list('listHrGrades',{complete:true});expect(result.success).toBe(false);expect(result.data).toBeUndefined();expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('empty complete data is verified by exact zero count',async()=>{rows=[];expect(await list('listHrGrades',{complete:true})).toMatchObject({success:true,data:{data:[],total:0}});});
it('current read denial makes no database request',async()=>{port.allow=false;expect((await list('listHrGrades',{complete:true})).success).toBe(false);expect(port.client).not.toHaveBeenCalled();});
it('code search reaches the whole catalogue, not only English names',async()=>{expect((await list('listHrGrades',{complete:true,search:'CODE_501'})).data?.data).toEqual([rows[500]]);});
it('uses only fixed escaped displayed fields and identical paged count predicates',async()=>{
 const value='a%,_"\\)';await actions.listHrGrades({search:value});const expected=`(code.ilike.${literalContains(value)},name_en.ilike.${literalContains(value)},name_ar.ilike.${literalContains(value)})`;
 expect(calls).toHaveLength(2);for(const url of calls)expect(url.searchParams.get('or')).toBe(expected);
 calls=[];await actions.listHrMohreEstablishments({search:value});for(const url of calls)expect(url.searchParams.get('or')).toBe(`(establishment_number.ilike.${literalContains(value)},establishment_name.ilike.${literalContains(value)})`);
});
it('all14 routes opt in without replacing management or mutation contracts',()=>{
 for(const route of [...common.map(([name])=>name),'mohre-establishments']){
  const source=fs.readFileSync(`src/app/(protected)/admin/hr/settings/${route}/page.tsx`,'utf8');expect(source).toMatch(/listHr\w+\(\{\s*complete:\s*true\s*\}\)/);expect(source).toContain('hasGlobalPermission');expect(source).toContain('principalId={ctx.profile?.id}');
 }
 const grades=fs.readFileSync('src/app/(protected)/admin/hr/settings/grades/page.tsx','utf8');expect(grades).toContain('createHrGrade({ grade_level: null, ...input }, contract)');
});
