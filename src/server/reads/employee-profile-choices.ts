import 'server-only';
import {z} from 'zod';
import {getReadAuthContext} from './read-context';
import {hasPermission} from '@/lib/rbac/check';
import {createClient} from '@/lib/supabase/server';
import {readAllPages} from './all-pages';
import {employeeProfileChoiceCriteria,employeeProfileChoices,EMPLOYEE_CHOICE_KINDS,type EmployeeChoiceKind} from '@/lib/hr/employee-profile-choices';
const specs={departments:{table:'departments',label:'department_name_en',code:'department_code',active:'is_active'},designations:{table:'designations',label:'designation_name_en',code:'designation_code',active:'is_active'},sites:{table:'work_sites',label:'site_name',code:'site_code',active:'status'},categories:{table:'hr_employee_categories',label:'name_en',code:'code',active:'is_active'},employment:{table:'hr_employment_types',label:'name_en',code:'code',active:'is_active'},mohre:{table:'hr_mohre_establishments',label:'establishment_name',code:'establishment_number',active:'status'},relationships:{table:'hr_relationship_types',label:'name_en',code:'code',active:'is_active'}} as const;
const row=z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),label:z.string(),code:z.string().nullable(),active:z.union([z.boolean(),z.string()])}).strip();
/** One ordinary authenticated request; independent catalogs run in parallel.
 * Minimal labels only, counted complete pages, no admin/raw fallback/cache. */
export async function readEmployeeProfileChoices(input:unknown,signal?:AbortSignal){
 const parsed=employeeProfileChoiceCriteria.safeParse(input);if(!parsed.success)return {success:false,error:'Invalid employee choices request'};
 const ctx=await getReadAuthContext();if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password)return {success:false,error:'Permission denied'};
 if(!['hr.employees.create','hr.employees.update','hr.employees.view','hr.employee_profile.manage','hr.admin'].some(code=>hasPermission(ctx,code)))return {success:false,error:'Permission denied'};
 const p=parsed.data,db=await createClient(),bounded=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(15000)]);
 const group=async(kind:EmployeeChoiceKind)=>{
  const s=specs[kind],selected=p.selected[kind];
  if(['departments','designations','sites'].includes(kind)&&!['common_md.view',`common_md.${s.table}.view`].some(code=>hasPermission(ctx,code)))return {status:'restricted' as const,error:'Choice catalogue permission is required; the saved reference is retained.'};
  if(['departments','sites','mohre'].includes(kind)&&p.companyId===null)return {status:'ready' as const,options:[]};
  try{
   const values=await readAllPages(async(from,to)=>{
    let q=db.from(s.table).select(`id,label:${s.label},code:${s.code},active:${s.active}`,{count:'exact'}).is('deleted_at',null).order(s.label).order('id');
    let active=`${s.active}.eq.${s.active==='status'?'active':'true'}`;
    if(kind==='departments'){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());active=`and(${active},or(effective_from.is.null,effective_from.lte.${today}),or(effective_to.is.null,effective_to.gte.${today}))`;}
    const predicates=[selected===null?active:`or(${active},id.eq.${selected})`];
    if(kind==='designations'){predicates.push(p.companyId===null?'owner_company_id.is.null':`or(owner_company_id.is.null,owner_company_id.eq.${p.companyId})`,p.departmentId===null?'department_id.is.null':`or(department_id.is.null,department_id.eq.${p.departmentId})`);}
    if(kind==='departments'||kind==='sites')q=q.eq('owner_company_id',p.companyId);
    if(kind==='mohre')q=q.eq('owner_company_id',p.companyId);
    if(kind==='departments'||kind==='sites')predicates.push(p.branchId===null?'branch_id.is.null':`or(branch_id.is.null,branch_id.eq.${p.branchId})`);
    q=q.or(`and(${predicates.join(',')})`);
    const r=await q.range(from,to).abortSignal(bounded);return {...r,data:r.error?null:z.array(row).parse(r.data)};
   },{identity:r=>r.id,maxRows:5000});
   return {status:'ready' as const,options:values.map(r=>({value:r.id,label:r.label+((r.active===true||r.active==='active')?'':' (inactive)'),code:r.code,disabled:!(r.active===true||r.active==='active')}))};
  }catch{return {status:'failed' as const,error:'This catalogue could not be completely loaded. Retry it; saved values are retained.'};}
 };
 const groups=await Promise.all(EMPLOYEE_CHOICE_KINDS.map(async kind=>[kind,await group(kind)] as const));
 bounded.throwIfAborted();
 return {success:true,data:employeeProfileChoices.parse(Object.fromEntries(groups))};
}
