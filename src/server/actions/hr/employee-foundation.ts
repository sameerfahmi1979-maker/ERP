'use server';
import {z} from 'zod';
import {getAuthContext}from '@/lib/rbac/check';
import {canBrowseEmployees}from '@/lib/rbac/employee-access';
import {createClient}from '@/lib/supabase/server';
import {employeeId}from '@/lib/hr/employee-contract';
import {employeeDate}from '@/lib/hr/employee-contract';
import {employmentSnapshotAt}from '@/lib/hr/employee-foundation';
import {getEmployeeEmploymentHistory}from './employees';

const inputSchema=z.object({name:z.string().trim().min(2).max(200),companyId:employeeId,excludeId:employeeId.optional(),page:z.number().int().min(1).max(100000).default(1)}).strict();
const rowSchema=z.object({id:employeeId,employee_code:z.string(),full_name_en:z.string(),owner_company_id:employeeId});
export type EmployeeNameMatch={id:number;employee_code:string;full_name_en:string};
export type EmployeeNameReview={success:true;rows:EmployeeNameMatch[];hasMore:boolean;page:number}|{success:false;error:string};

/** Advisory only. Cookie client/RLS and the selected employer bound every page;
 * a same-name result never merges, blocks creation, grants access or writes. */
export async function reviewEmployeeName(raw:unknown):Promise<EmployeeNameReview>{
 try{
  const ctx=await getAuthContext();
  if(!canBrowseEmployees(ctx))return{success:false,error:'Current employee read access is required for this review.'};
  const input=inputSchema.safeParse(raw);
  if(!input.success)return{success:false,error:'Choose an employer and enter at least two name characters before review.'};
  const {name,companyId,excludeId,page}=input.data;
  const client=await createClient();
  let query=client.from('employees').select('id,employee_code,full_name_en,owner_company_id').is('deleted_at',null).eq('owner_company_id',companyId)
   .ilike('full_name_en',name.replace(/[\\%_]/g,value=>'\\'+value));
  if(excludeId!==undefined)query=query.neq('id',excludeId);
  const from=(page-1)*25;
  const result=await query.order('id',{ascending:true}).range(from,from+25);
  const rows=z.array(rowSchema).max(26).safeParse(result.data);
  if(result.error||!rows.success||rows.data.some((row,index)=>row.owner_company_id!==companyId||row.id===excludeId||index>0&&row.id<=rows.data[index-1].id))return{success:false,error:'Name review could not be verified. This is not a confirmed empty result.'};
  return{success:true,rows:rows.data.slice(0,25).map(({id,employee_code,full_name_en})=>({id,employee_code,full_name_en})),hasMore:rows.data.length>25,page};
 }catch{return{success:false,error:'Name review is unavailable. No employee or identity link was changed.'};}
}

/** Evidence review only, not a replacement salary/leave/official-output source.
 * Complete existing authorized journal pages are required; never resolve from
 * a truncated client history. Future values and pre-system facts are not made up. */
export async function reviewRecordedEmploymentDate(employee:number,date:string){
 if(!employeeId.safeParse(employee).success||!employeeDate.safeParse(date).success)return{status:'review-required' as const,reason:'Choose a valid employee and calendar date.'};
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if(date>today)return{status:'review-required' as const,reason:'Future employment is not scheduled by this system. Current facts were not changed.'};
 const rows:Parameters<typeof employmentSnapshotAt>[0][number][]=[];
 let cursor:number|undefined;
 for(let page=0;page<20;page++){
  const result=await getEmployeeEmploymentHistory(employee,cursor);
  if(!result.success||!result.data)return{status:'review-required' as const,reason:'Complete authorized employment history is unavailable; no date was guessed.'};
  rows.push(...result.data.rows);
  if(result.data.nextCursor===null||result.data.nextCursor===undefined){
   const check=await getEmployeeEmploymentHistory(employee);
   if(!check.success||!check.data||check.data.rows[0]?.id!==rows[0]?.id)return{status:'review-required' as const,reason:'Employment history changed during review. Refresh before reviewing this date.'};
   return employmentSnapshotAt(rows,date);
  }
  if(cursor!==undefined&&result.data.nextCursor>=cursor)return{status:'review-required' as const,reason:'History paging could not be verified.'};
  cursor=result.data.nextCursor;
 }
 return{status:'review-required' as const,reason:'This review exceeds its bounded history limit. No partial historical result was returned.'};
}
