"use server";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {getAuthContext,canUseApplication} from "@/lib/rbac/check";
import {checkDocumentConfidentialityAccess} from "@/lib/dms/document-access";
import {documentLifecycle} from "@/lib/dms/lifecycle";

const id=z.number().int().positive().refine(Number.isSafeInteger);
const subjectSchema=z.object({id,status:z.string(),review_status:z.string(),approval_status:z.string().nullable(),current_version_id:id.nullable(),is_archived:z.boolean(),superseded_by_document_id:id.nullable(),owner_user_id:id.nullable()});
const eventSchema=z.object({id,document_id:id,event_type:z.string(),description:z.string().nullable(),performed_by:id.nullable(),performed_at:z.iso.datetime({offset:true}),
 metadata_json:z.unknown(),performer:z.object({display_name:z.string().nullable()}).nullable()});
export type LifecycleEvent = z.infer<typeof eventSchema>;
export type LifecycleHistoryPage = {rows:LifecycleEvent[];totalCount:number;page:number;pageSize:number};
const denied={success:false as const,error:"Document history is unavailable or outside your access."};

export async function getDmsDocumentLifecycle(documentId:number) {
 if(!id.safeParse(documentId).success)return denied;
 try {
  const ctx=await getAuthContext();if(!canUseApplication(ctx))return denied;
  const db=await createClient();
  if(!(await checkDocumentConfidentialityAccess(db,documentId,ctx)).allowed)return denied;
  const result=await db.from("dms_documents").select("id,status,review_status,approval_status,current_version_id,is_archived,superseded_by_document_id,owner_user_id").eq("id",documentId).is("deleted_at",null).maybeSingle();
  const subject=subjectSchema.safeParse(result.data);
  if(result.error||!subject.success||subject.data.id!==documentId||!(await checkDocumentConfidentialityAccess(db,documentId,ctx)).allowed)return denied;
  return {success:true as const,data:{...documentLifecycle(subject.data),currentVersionId:subject.data.current_version_id,status:subject.data.status,approvalStatus:subject.data.approval_status}};
 }catch{return {success:false as const,error:"Lifecycle status could not be verified. Retry before taking action."};}
}

/** Bounded, counted pages. Never expose storage paths, tokens, provider payloads,
 * metadata values or arbitrary event JSON in a history/download list. */
export async function getDmsDocumentHistoryPage(documentId:number,page=1,filter:"all"|"downloads"="all") {
 if(!z.tuple([id,z.number().int().min(1).max(100000),z.enum(["all","downloads"])]).safeParse([documentId,page,filter]).success)return denied;
 try {
  const ctx=await getAuthContext();if(!canUseApplication(ctx))return denied;
  const db=await createClient();
  if(!(await checkDocumentConfidentialityAccess(db,documentId,ctx)).allowed)return denied;
  const pageSize=20,from=(page-1)*pageSize;
  const query=(head=false)=>{
   let q=db.from("dms_document_events").select("id,document_id,event_type,description,performed_by,performed_at,metadata_json,performer:user_profiles!performed_by(display_name)",{count:"exact",head}).eq("document_id",documentId);
   if(filter==="downloads")q=q.in("event_type",["file_downloaded","file_previewed","file_download_response_prepared","file_preview_response_prepared"]);
   return q;
  };
  let r=await query().order("performed_at",{ascending:false}).order("id",{ascending:false}).range(from,from+pageSize-1);
  if(r.status===416&&r.error?.code==="PGRST103"){
   const count=await query(true);if(count.error||!Number.isSafeInteger(count.count)||count.count===null||count.count<0||count.count>from)throw Error("Count unavailable");
   r={...r,success:true,error:null,data:[],count:count.count};
  }
  const rows=z.array(eventSchema).safeParse(r.data);
  if(r.error||!rows.success||r.count===null||!Number.isSafeInteger(r.count)||r.count<0||rows.data.length!==Math.min(pageSize,Math.max(0,r.count-from))||new Set(rows.data.map(e=>e.id)).size!==rows.data.length||rows.data.some(e=>e.document_id!==documentId))throw Error("History incomplete");
  if(!(await checkDocumentConfidentialityAccess(db,documentId,ctx)).allowed)return denied;
  return {success:true as const,data:{rows:rows.data.map(e=>{
   const m=e.metadata_json&&typeof e.metadata_json==="object"?e.metadata_json as Record<string,unknown>:{};
   const safe:Record<string,unknown>={};
   for(const key of ["file_id","version_id","bytes"]){if(Number.isSafeInteger(m[key])&&Number(m[key])>=0)safe[key]=m[key];}
   if(m.delivery==="response_prepared"||m.delivery==="server_response")safe.delivery=m.delivery;
   if(typeof m.historical==="boolean")safe.historical=m.historical;
   return {...e,metadata_json:safe};
  }),totalCount:r.count,page,pageSize} satisfies LifecycleHistoryPage};
 }catch{return {success:false as const,error:"History could not be completely loaded. This is not an empty result. Please retry."};}
}
