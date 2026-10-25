'use server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {getAuthContext,hasPermission} from '@/lib/rbac/check';
const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const row=z.object({companyId:id,branchId:id.nullable(),label:z.string().min(1)}).strict();
export async function readDmsUploadScopes(search:string,after:{companyId:number;branchId:number}|null=null){
 const input=z.object({search:z.string().trim().max(100),after:z.object({companyId:id,branchId:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)}).strict().nullable()}).strict().safeParse({search,after});
 if(!input.success)return {success:false as const,error:'Invalid company search.'};
 try{
  const ctx=await getAuthContext();
  if(!ctx.profile||!(hasPermission(ctx,'dms.documents.upload')||hasPermission(ctx,'dms.admin')))return {success:false as const,error:'Upload access unavailable.'};
  const result=await(await createClient()).rpc('f07_upload_scope_choices',{p_search:input.data.search,p_after_company:after?.companyId??0,p_after_branch:after?.branchId??0});
  const parsed=z.array(row).max(26).safeParse(result.data);
  if(result.error||!parsed.success)return {success:false as const,error:'Permitted upload companies could not be loaded. Retry.'};
  return {success:true as const,rows:parsed.data.slice(0,25),hasMore:parsed.data.length>25};
 }catch{return {success:false as const,error:'Permitted upload companies could not be loaded. Retry.'};}
}
