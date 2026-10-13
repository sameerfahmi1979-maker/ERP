import "server-only";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {hasPermission} from "@/lib/rbac/check";
import {getReadAuthContext} from "./read-context";
import {literalContains,literalLike} from "@/lib/reads/search";
import type {DmsUploadSessionRow} from "@/server/actions/dms/upload-sessions";
const text=z.string().trim().max(200);
export const inboxSchema=z.object({page:z.number().int().min(1).max(100000).default(1),pageSize:z.number().int().min(1).max(100).default(25),search:text.default(""),columnFilters:z.object({original_filename:text.optional(),file_size_bytes:z.string().regex(/^\d*$/).refine(v=>v===""||Number.isSafeInteger(Number(v))).optional(),status:text.optional(),is_duplicate:z.enum(["","true","false"]).optional(),uploaded_at:z.union([z.literal(""),z.iso.date()]).optional(),expires_at:z.union([z.literal(""),z.iso.date()]).optional()}).strict().default({})}).strict();
export type InboxPage={rows:DmsUploadSessionRow[];totalCount:number;page:number;pageSize:number};
export async function readDmsInboxPage(input:unknown):Promise<{success:boolean;data?:InboxPage;error?:string}>{
 const parsed=inboxSchema.safeParse(input);if(!parsed.success)return {success:false,error:"Invalid inbox criteria"};
 try{
  const ctx=await getReadAuthContext();
  if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password||(!hasPermission(ctx,"dms.documents.view")&&!hasPermission(ctx,"dms.admin")))return {success:false,error:"Permission denied"};
  const db=await createClient(),p=parsed.data,f=p.columnFilters;
  let q=db.from("dms_upload_sessions").select(`id,session_code,status,original_filename,mime_type,file_size_bytes,sha256_hash,temp_storage_path,is_duplicate,duplicate_document_id,uploaded_by,uploaded_at,expires_at,completed_at,error_message,temp_cleaned_at,cleanup_error_message,intake_status,ai_result_id,created_at,updated_at,deleted_at,duplicate_document:dms_documents!duplicate_document_id(id,document_no,title),uploader:user_profiles!uploaded_by(full_name)`,{count:"exact"}).is("deleted_at",null).not("status","in",'("completed","cancelled","expired")');
  if(p.search){const t=literalContains(p.search);q=q.or(`original_filename.ilike.${t},session_code.ilike.${t},status.ilike.${t}`);}
  for(const field of ["original_filename","status"] as const)if(f[field])q=q.ilike(field,literalLike(f[field]));
  if(f.file_size_bytes)q=q.eq("file_size_bytes",Number(f.file_size_bytes));
  if(f.is_duplicate)q=q.eq("is_duplicate",f.is_duplicate==="true");
  for(const field of ["uploaded_at","expires_at"] as const)if(f[field]){const start=new Date(f[field]+"T00:00:00.000Z");const end=new Date(start.getTime()+86400000);q=q.gte(field,start.toISOString()).lt(field,end.toISOString());}
  const from=(p.page-1)*p.pageSize;
  q=q.order("created_at",{ascending:false}).order("id",{ascending:true});
  let r=await q.range(from,from+p.pageSize-1);
  if(r.status===416&&r.error?.code==="PGRST103"){const c=await q.range(0,0);if(!c.error&&c.count!==null&&Number.isSafeInteger(c.count)&&c.count>=0&&from>=c.count&&c.data?.length===Math.min(1,c.count))r={...c,data:[]};}
  if(r.error||r.count===null||!Number.isSafeInteger(r.count)||r.count<0||!Array.isArray(r.data)||r.data.length!==Math.min(p.pageSize,Math.max(0,r.count-from))||new Set(r.data.map(row=>row.id)).size!==r.data.length||r.data.some(row=>!Number.isSafeInteger(row.id)||row.id<=0||typeof row.session_code!=="string"||typeof row.original_filename!=="string"||typeof row.status!=="string"))return {success:false,error:"Inbox rows or count could not be verified"};
  return {success:true,data:{rows:r.data as unknown as DmsUploadSessionRow[],totalCount:r.count,page:p.page,pageSize:p.pageSize}};
 }catch{return {success:false,error:"Upload inbox unavailable. Please retry."};}
}
