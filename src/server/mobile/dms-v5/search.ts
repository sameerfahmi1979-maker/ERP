import {z} from "zod";
import type {AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {askDmsDocumentsQuestion,searchDmsDocumentsByIntent} from "@/server/actions/dms/ai-search";
import {compareDocumentSources} from "@/server/ai/document-comparison";
import {askVerifiedDmsQuestion} from "@/server/actions/dms/document-qa";
import {readDmsNotifications} from "@/server/reads/dms-notifications";
import {markDmsNotificationRead,dismissDmsNotification} from "@/server/actions/dms/notifications";
import {admitMobileDmsSource,verifyMobileDmsDelivery,verifySession,DmsError,rpc,unavailable,invalid,conflict} from "./access";
import {hash,id,summary,completePage,type CommandFor} from "./contracts";
const fields="id,title,document_no,status,expiry_date,document_type:dms_document_types(name_en)";
const safeRow=z.object({id,title:z.string(),document_no:z.string(),status:z.string(),expiry_date:z.string().nullable(),document_type:z.object({name_en:z.string().nullable()}).nullable()});
const searchSource=z.strictObject({documentId:id,versionId:id,sourceHash:hash});
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
   const paging={page:input.page,pageSize:25};
   const subject=input.subject?{type:input.subject.entityType,id:input.subject.entityId}:undefined;
   await parentCheck();
   const r=await askDmsDocumentsQuestion(input.query,{},paging,subject,true);
   if(!r.success||!r.data){
    if(r.error?.startsWith("Choose the exact person or business record"))return {outcome:"clarification_required",rows:[],totalCount:null,hasMore:false,asOf:new Date().toISOString(),message:"Choose the exact person or site to continue."};
    throw new DmsError(503,"natural_search_unavailable","Natural-language document search is unavailable.");
   }
   const {intent,results,totalCount}=r.data;
   const selections=results.map(({documentId})=>({documentId}));
   const bounds=selections.length?await rpc("mobile_dms_search_sources",{p_sources:selections,p_recheck:false},z.array(searchSource).length(selections.length)):[];
   if(bounds.some((bound,i)=>bound.documentId!==selections[i].documentId))conflict();
   const result=bounds.length?await db.from("dms_documents").select(fields).in("id",bounds.map(s=>s.documentId)).is("deleted_at",null):{data:[],error:null};
   if(result.error||result.data?.length!==bounds.length)unavailable();
   const summaries=new Map(result.data.map(raw=>{const doc=documentSummary(raw);return [doc.id,doc];}));
   const rows=bounds.map((s,i)=>{const doc=summaries.get(s.documentId);const origin=results[i].matchSource;if(!doc||!origin)unavailable();return {...doc,sourceHash:s.sourceHash,matchSource:origin,snippet:null};});
   const page=completePage(rows,input.page,25,totalCount,row=>row.id);
   // Source fingerprints exclude searchable content. Recheck the authorized
   // ordered page, origins and exact count using the already classified intent.
   const current=await searchDmsDocumentsByIntent(intent,paging,{},subject,true);
   if(!current.success||!current.data)unavailable();
   const currentTotal=current.totalCount??(current.data.length===0?0:null);
   if(currentTotal!==totalCount||current.data.length!==results.length||current.data.some((hit,i)=>
    hit.documentId!==results[i].documentId||hit.matchSource!==results[i].matchSource))conflict();
   if(bounds.length){
    await rpc("mobile_dms_search_sources",{p_sources:bounds,p_recheck:true},z.literal(true));
   }
   await parentCheck();
   // A view-only binding can remain valid after a scoped preview revocation.
   // Do not deliver content-dependent origins or totals under a changed scope.
   await verifySession(ctx,true);
   return {outcome:page.totalCount?"available":"no_matches",rows,totalCount:page.totalCount,hasMore:page.hasMore,asOf:page.asOf};
  }
  case "documentNotifications":{
   const r=await readDmsNotifications({audience:"my",page:input.page,pageSize:25,unreadOnly:input.unreadOnly},ctx);if(!r.success)unavailable();
   const bindings=await Promise.all(r.data.rows.map(async n=>{
    if(n.visible_document_id===null)return null;
    try{return await admitMobileDmsSource(ctx,{documentId:n.visible_document_id});}
    catch(e){if(e instanceof DmsError&&[403,404,409].includes(e.status))return null;throw e;}
   }));
   await verifySession(ctx);
   const sources=bindings.filter(b=>b!==null).map(b=>({documentId:b.documentId,versionId:b.documentVersionId,sourceHash:b.sourceHash}));
   const visible=await rpc("mobile_dms_document",{p_action:"notification_targets",p_data:{sources}},z.array(z.boolean()).length(sources.length));
   let position=0;
   const rows=r.data.rows.map((n,i)=>{
    const allowed=bindings[i]!==null&&visible[position++];
    return {id:n.id,title:allowed?n.subject:"Document notification",message:allowed?n.message:"Open your current document workspace for details.",status:n.status,readAt:n.read_at,target:allowed?{kind:"document",documentId:n.visible_document_id,section:"overview"}:null};
   });
   return completePage(rows,input.page,25,r.data.totalCount,row=>row.id);
  }
  case "documentNotificationAction":{
   const r=input.action==="read"?await markDmsNotificationRead(input.notificationId):await dismissDmsNotification(input.notificationId);
   if(!r.success)throw new DmsError(403,"notification_unavailable","The personal notification is unavailable.");
   return {notificationId:input.notificationId,state:input.action==="read"?"read":"dismissed"};
  }
 }
}
