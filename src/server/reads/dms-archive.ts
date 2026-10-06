import "server-only";
import {z} from "zod";
import {hasPermission,type AuthContext} from "@/lib/rbac/check";
import {getReadAuthContext} from "./read-context";
import {createClient} from "@/lib/supabase/server";
import {literalContains,literalLike} from "@/lib/reads/search";
import {readAllPages} from "./all-pages";
import type {ActionResult,ArchivedDocumentRow} from "@/server/actions/dms/documents";

const text=z.string().trim().max(200);
const id=z.number().int().positive();
export const archiveReadSchema=z.object({
 page:z.number().int().min(1).max(100000).default(1),pageSize:z.number().int().min(1).max(100).default(25),
 sortKey:z.enum(["document_no","title","document_type","updated_at"]).default("updated_at"),sortDir:z.enum(["asc","desc"]).default("desc"),
 search:text.default(""),reason:z.enum(["archived","renewed"]).optional(),documentTypeId:id.optional(),categoryId:id.optional(),
 columnFilters:z.object({document_no:text.optional(),title:text.optional(),type:text.optional(),reason:text.optional()}).strict().default({}),
}).strict();
export type ArchiveReadPage={rows:ArchivedDocumentRow[];totalCount:number;page:number;pageSize:number;updatedAt:number};
// Validate the protected reader projection before returning a counted page.
const archiveRowsSchema=z.array(z.object({
 id,document_no:z.string(),legacy_document_code:z.string().nullable(),title:z.string(),description:z.string().nullable(),
 document_type_id:id,category_id:id,status:z.string(),confidentiality_level:z.string(),
 owner_user_id:id.nullable(),owning_company_id:id.nullable(),owning_branch_id:id.nullable(),party_id:id.nullable(),
 issue_date:z.string().nullable(),expiry_date:z.string().nullable(),reminder_policy_id:id.nullable(),
 ocr_status:z.string(),ai_status:z.string(),review_status:z.string(),is_archived:z.boolean(),archived_at:z.string().nullable(),
 created_by:id.nullable(),created_at:z.string(),updated_by:id.nullable(),updated_at:z.string(),deleted_at:z.string().nullable(),
 superseded_by_document_id:id.nullable(),
 document_type:z.object({type_code:z.string(),name_en:z.string(),requires_expiry_tracking:z.boolean(),default_confidentiality:z.string()}).nullable(),
 category:z.object({category_code:z.string(),name_en:z.string()}).nullable(),
 tags:z.array(z.object({tag_id:id,tag:z.object({tag_name:z.string(),color_hex:z.string().nullable()}).nullable()})),
}));
const replacementsSchema=z.array(z.object({id,document_no:z.string(),title:z.string()}));
export async function readDmsArchivePage(input:unknown={},context?:AuthContext):Promise<ActionResult<ArchiveReadPage>>{
 const parsed=archiveReadSchema.safeParse(input);if(!parsed.success)return{success:false,error:"Invalid archive search or page"};
 try{
  const ctx=context??await getReadAuthContext();
  if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password||(!hasPermission(ctx,"dms.documents.view")&&!hasPermission(ctx,"dms.admin")))return{success:false,error:"Permission denied"};
  const p=parsed.data;
  const statuses=["archived","superseded"].filter(status=>(!p.reason||status===(p.reason==="renewed"?"superseded":"archived"))&&(!p.columnFilters.reason||(status==="superseded"?"renewed":"archived").includes(p.columnFilters.reason.toLocaleLowerCase())));
  if(!statuses.length)return{success:true,data:{rows:[],totalCount:0,page:p.page,pageSize:p.pageSize,updatedAt:Date.now()}};
  const db=await createClient();
  // The existing protected client projects/masks every parent and replacement.
  // Resolve label filters to IDs under unchanged type RLS; PostgREST's SETOF
  // inner-embed filter resolves the label against the parent function instead.
  let typeIds:number[]|undefined;
  if(p.columnFilters.type){
   const matches=await readAllPages<{id:number}>(async(from,to)=>{const found=await db.from("dms_document_types").select("id",{count:"exact"}).ilike("name_en",literalLike(p.columnFilters.type!)).order("id").range(from,to);return{...found,data:found.data as {id:number}[]|null};},{identity:row=>row.id,maxRows:5000});
   typeIds=matches.map(row=>row.id);
   if(!typeIds.length)return{success:true,data:{rows:[],totalCount:0,page:p.page,pageSize:p.pageSize,updatedAt:Date.now()}};
  }
  let query=db.from("dms_documents").select(`
   id,document_no,legacy_document_code,title,description,document_type_id,category_id,status,
   confidentiality_level,owner_user_id,owning_company_id,owning_branch_id,party_id,
   issue_date,expiry_date,reminder_policy_id,ocr_status,ai_status,review_status,is_archived,archived_at,created_by,created_at,updated_by,updated_at,deleted_at,
   superseded_by_document_id,
   document_type:dms_document_types(type_code,name_en,requires_expiry_tracking,default_confidentiality),
   category:dms_document_categories(category_code,name_en),
   tags:dms_document_tags(tag_id,tag:dms_tags(tag_name,color_hex))
  `,{count:"exact"}).is("deleted_at",null).in("status",statuses);
  const admin=hasPermission(ctx,"dms.admin")||ctx.roleCodes.includes("system_admin");
  if(!admin){const levels=["internal","company",...["hr","finance","legal","executive"].filter(level=>hasPermission(ctx,`dms.documents.view.${level}`))];query=query.or(`confidentiality_level.in.(${levels.join(",")}),owner_user_id.eq.${ctx.profile.id},created_by.eq.${ctx.profile.id}`);}
  if(p.search){const term=literalContains(p.search);query=query.or(`document_no.ilike.${term},title.ilike.${term},description.ilike.${term}`);}
  if(p.documentTypeId)query=query.eq("document_type_id",p.documentTypeId);
  if(p.categoryId)query=query.eq("category_id",p.categoryId);
  if(p.columnFilters.document_no)query=query.ilike("document_no",literalLike(p.columnFilters.document_no));
  if(p.columnFilters.title)query=query.ilike("title",literalLike(p.columnFilters.title));
  if(typeIds)query=query.in("document_type_id",typeIds);
  const column=p.sortKey==="document_type"?"document_type(name_en)":p.sortKey;
  const from=(p.page-1)*p.pageSize;
  const result=await query.order(column,{ascending:p.sortDir==="asc",nullsFirst:false}).order("id",{ascending:true}).range(from,from+p.pageSize-1);
  if(result.error||result.count===null||!Number.isSafeInteger(result.count)||result.count<0)return{success:false,error:"Archived documents could not be completely loaded. Please retry."};
  const parsedRows=archiveRowsSchema.safeParse(result.data);
  if(!parsedRows.success || parsedRows.data.length!==Math.min(p.pageSize,Math.max(0,result.count-from)) || new Set(parsedRows.data.map(row=>row.id)).size!==parsedRows.data.length)return{success:false,error:"Archived document rows could not be verified. Please retry."};
  // The legacy self-table embed resolves as a reverse relationship for the
  // protected SETOF reader. Resolve only this page's replacement IDs through
  // that same protected reader; an unauthorized replacement remains null.
  const replacementIds=[...new Set(parsedRows.data.map(row=>row.superseded_by_document_id).filter((value):value is number=>typeof value==="number"))];
  const replacements=new Map<number,{id:number;document_no:string;title:string}>();
  if(replacementIds.length){
   const linked=await db.from("dms_documents").select("id,document_no,title",{count:"exact"}).in("id",replacementIds).is("deleted_at",null).order("id").range(0,replacementIds.length-1);
   const parsedLinks=replacementsSchema.safeParse(linked.data);
   if(linked.error||linked.count===null||!parsedLinks.success||linked.count!==parsedLinks.data.length||new Set(parsedLinks.data.map(row=>row.id)).size!==parsedLinks.data.length||parsedLinks.data.some(row=>!replacementIds.includes(row.id)))return{success:false,error:"Archived document replacements could not be completely loaded. Please retry."};
   for(const row of parsedLinks.data)replacements.set(row.id,row);
  }
  const rows=parsedRows.data.map(row=>({...row,tags:row.tags.map(tag=>({...tag,tag:tag.tag??undefined})),reason:row.status==="superseded"?"renewed" as const:"archived" as const,superseded_by:row.superseded_by_document_id?replacements.get(row.superseded_by_document_id)??null:null}));
  return{success:true,data:{rows,totalCount:result.count,page:p.page,pageSize:p.pageSize,updatedAt:Date.now()}};
 }catch{return{success:false,error:"Archived documents could not be completely loaded. Please retry."};}
}
/** Compatibility consumers receive the complete authorized result, not page one. */
export async function readAllDmsArchive():Promise<ActionResult<ArchivedDocumentRow[]>>{
 try{const ctx=await getReadAuthContext();const rows=await readAllPages<ArchivedDocumentRow>(async from=>{const result=await readDmsArchivePage({page:Math.floor(from/100)+1,pageSize:100},ctx);return{data:result.data?.rows??null,count:result.data?.totalCount??null,error:result.success?null:result.error};},{batchSize:100,identity:row=>row.id,maxRows:10000});if(new Set(rows.map(row=>row.id)).size!==rows.length)throw Error("Archive changed during read");return{success:true,data:rows};}catch{return{success:false,error:"Archived documents could not be completely loaded. Please retry."};}
}
