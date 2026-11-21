import {z} from "zod";
import type {AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {askDmsDocumentsQuestion} from "@/server/actions/dms/ai-search";
import {compareDocumentSources} from "@/server/ai/document-comparison";
import {askVerifiedDmsQuestion} from "@/server/actions/dms/document-qa";
import {readDmsNotifications} from "@/server/reads/dms-notifications";
import {markDmsNotificationRead,dismissDmsNotification} from "@/server/actions/dms/notifications";
import {admitMobileDmsSource,verifyMobileDmsDelivery,verifySession,DmsError,rpc,unavailable,invalid} from "./access";
import {id,summary,completePage,type CommandFor} from "./contracts";
const fields="id,title,document_no,status,expiry_date,document_type:dms_document_types(name_en)";
const safeRow=z.object({id,title:z.string(),document_no:z.string(),status:z.string(),expiry_date:z.string().nullable(),document_type:z.object({name_en:z.string().nullable()}).nullable()});
function documentSummary(raw:unknown){const r=safeRow.parse(raw);return summary.parse({id:r.id,title:r.title,number:r.document_no,status:r.status,expiry:r.expiry_date,type:r.document_type?.name_en??null});}
export function parseQr(payload:string){
 const match=/^ALGT:DMS:1:([1-9][0-9]{0,15})$/.exec(payload);
 if(match&&id.safeParse(Number(match[1])).success)return {id:Number(match[1])};
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(payload))invalid();
 return {number:payload};
}
export async function search(input:CommandFor<"documentQrLookup"|"documentNaturalSearch"|"documentCompare"|"documentQuestion"|"documentNotifications"|"documentNotificationAction">,ctx:AuthContext){
 const db=await createClient();
 switch(input.op){
  case "documentQuestion":return askVerifiedDmsQuestion(input);
  case "documentCompare":{
   const bounds=await Promise.all(input.sources.map(s=>admitMobileDmsSource(ctx,{...s,historical:true},["dms.documents.preview"])));
   const read=await compareDocumentSources({sources:input.sources,recordFindings:false});
   if(!read.success)unavailable();
   await Promise.all(bounds.map(s=>verifyMobileDmsDelivery(ctx,s,["dms.documents.preview"],true)));
   return {...read.data,sources:read.data.sources.map(({documentId,documentNo,versionId,sourceHash,complete,facts,passages})=>({documentId,documentNo,versionId,sourceHash,complete,facts,passages}))};
  }
  case "documentQrLookup":{
   const key=parseQr(input.payload);let query=db.from("dms_documents").select(fields).is("deleted_at",null);
   query=key.id!==undefined?query.eq("id",key.id):query.eq("document_no",key.number);
   const r=await query.limit(2);if(r.error)unavailable();
   if(r.data?.length!==1)throw new DmsError(404,"unavailable","The document is unavailable.");
   const doc=documentSummary(r.data[0]);
   const src=await admitMobileDmsSource(ctx,{documentId:doc.id});await verifyMobileDmsDelivery(ctx,src);
   return {outcome:"available",document:doc};
  }
  case "documentNaturalSearch":{
   const parentCheck=async()=>{if(input.subject)await rpc("mobile_dms_document",{p_action:"search_parent",p_data:{parent:input.subject}},z.literal(true));};
   await parentCheck();
   const r=await askDmsDocumentsQuestion(input.query,{},{page:input.page,pageSize:25},input.subject?{type:input.subject.entityType,id:input.subject.entityId}:undefined);
   if(!r.success||!r.data){
    if(r.error?.startsWith("Choose the exact person or business record"))return {outcome:"clarification_required",rows:[],totalCount:null,hasMore:false,asOf:new Date().toISOString(),message:"Choose the exact person or site to continue."};
    throw new DmsError(503,"natural_search_unavailable","Natural-language document search is unavailable.");
   }
   const bounds=await Promise.all(r.data.results.map(hit=>admitMobileDmsSource(ctx,{documentId:hit.documentId})));
   const result=bounds.length?await db.from("dms_documents").select(fields).in("id",bounds.map(s=>s.documentId)).is("deleted_at",null):{data:[],error:null};
   if(result.error||result.data?.length!==bounds.length)unavailable();const summaries=result.data.map(documentSummary);
   const rows=bounds.map(s=>{const doc=summaries.find(d=>d.id===s.documentId);if(!doc)unavailable();return {...doc,sourceHash:s.sourceHash,matchSource:"metadata",snippet:null};});
   const page=completePage(rows,input.page,25,r.data.totalCount,row=>row.id);
   await Promise.all(bounds.map(s=>verifyMobileDmsDelivery(ctx,s)));await parentCheck();
   return {outcome:page.totalCount?"available":"no_matches",rows,totalCount:page.totalCount,hasMore:page.hasMore,asOf:page.asOf};
  }
  case "documentNotifications":{
   const r=await readDmsNotifications({audience:"my",page:input.page,pageSize:25,unreadOnly:input.unreadOnly},ctx);if(!r.success)unavailable();
   const rows=await Promise.all(r.data.rows.map(async n=>{
    let visible=false;
    if(n.visible_document_id!==null){try{await admitMobileDmsSource(ctx,{documentId:n.visible_document_id});visible=true;}catch(e){if(!(e instanceof DmsError)||![403,404,409].includes(e.status))throw e;}}
    return {id:n.id,title:visible?n.subject:"Document notification",message:visible?n.message:"Open your current document workspace for details.",status:n.status,readAt:n.read_at,target:visible?{kind:"document",documentId:n.visible_document_id,section:"overview"}:null};
   }));await verifySession(ctx);return completePage(rows,input.page,25,r.data.totalCount,row=>row.id);
  }
  case "documentNotificationAction":{
   const r=input.action==="read"?await markDmsNotificationRead(input.notificationId):await dismissDmsNotification(input.notificationId);
   if(!r.success)throw new DmsError(403,"notification_unavailable","The personal notification is unavailable.");
   return {notificationId:input.notificationId,state:input.action==="read"?"read":"dismissed"};
  }
 }
}
