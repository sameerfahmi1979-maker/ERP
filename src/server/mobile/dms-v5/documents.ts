import {z} from "zod";
import {type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {getDmsDocumentRecordData} from "@/server/actions/dms/documents";
import {getDmsDocumentLifecycle,getDmsDocumentHistoryPage} from "@/server/actions/dms/lifecycle-history";
import {literalContains} from "@/lib/reads/search";
import {admitMobileDmsSource,verifyMobileDmsDelivery,verifyEmployeeDocument,verifySession,readDmsFeatureAvailability,rpc,unavailable,conflict,type Capability} from "./access";
import {id,hash,commentRevision,completePage,summary,source,parent,type CommandFor} from "./contracts";
import {pagePayload} from "./collections";
type DocOp="documentDetails"|"documentSources"|"documentMetadata"|"documentMetadataSave"|"documentTags"|"documentTagOptions"|"documentTagsChange"|"documentComments"|"documentCommentAdd"|"documentCommentEdit"|"documentCommentDelete"|"documentHistory";
export async function readHistory(input:CommandFor<"documentHistory">){
 const r=await getDmsDocumentHistoryPage(input.documentId,input.page,input.filter);
 if(!r.success||!r.data)unavailable();
 const rows=r.data.rows.map(row=>{
  const m=z.object({file_id:id.optional(),version_id:id.optional(),bytes:z.number().int().nonnegative().optional(),delivery:z.enum(["response_prepared","server_response"]).optional(),historical:z.boolean().optional()}).parse(row.metadata_json);
  return {id:row.id,type:row.event_type,description:row.description,actorLabel:row.performer?.display_name??null,at:row.performed_at,...(m.file_id?{fileId:m.file_id}:{}),...(m.version_id?{versionId:m.version_id}:{}),...(m.bytes!==undefined?{bytes:m.bytes}:{}),...(m.delivery?{delivery:m.delivery}:{}),...(m.historical!==undefined?{historical:m.historical}:{})};
 });
 return completePage(rows,input.page,20,r.data.totalCount,r=>r.id);
}
const tag=z.strictObject({id,name:z.string(),color:z.string().nullable()});
const metadataField=z.strictObject({id,code:z.string(),label:z.string(),type:z.string(),isRequired:z.boolean(),isEditable:z.boolean(),options:z.json().nullable(),value:z.json().nullable()});
export const metadataSchema=z.strictObject({source,documentTypeId:id,snapshot:hash,sourceSnapshot:hash.nullable(),fields:z.array(metadataField).max(250)});
type PageRead={data:unknown;count:number|null;error:{code:string}|null;status:number};
async function readCountedWindow(offset:number,fetch:(from:number,to:number)=>PromiseLike<PageRead>){
 const page=await fetch(offset,offset+24);
 if(!page.error)return page;
 if(offset<=0||page.status!==416||page.error.code!=="PGRST103")unavailable();
 const first=await fetch(0,0);
 if(first.error||first.count===null||!Number.isSafeInteger(first.count)||first.count<0||first.count>offset)unavailable();
 return {data:[],count:first.count};
}
async function permissions(doc:number,codes:Capability[]){
 const db=await createClient();
 return Promise.all(codes.map(async code=>{const r=await db.rpc("f03_has_document_permission",{document_id:doc,permission_code:code});if(r.error||typeof r.data!=="boolean")unavailable();return r.data;}));
}
export async function documents(input:CommandFor<DocOp>,ctx:AuthContext){
 const doc=input.documentId;const bound=await admitMobileDmsSource(ctx,{documentId:doc,...("sourceHash" in input?{sourceHash:input.sourceHash}:{})});
 const db=await createClient();
 const employeeLink=async()=>{
  if("employeeId" in input && input.employeeId!==undefined)
   await verifyEmployeeDocument(input.employeeId,doc);
 };
 await employeeLink();
 const read=async()=>{
  switch(input.op){
   case "documentDetails":{
    const [r,l,flags,rights,renewalParent]=await Promise.all([getDmsDocumentRecordData(doc),getDmsDocumentLifecycle(doc),readDmsFeatureAvailability(),permissions(doc,["dms.documents.preview","dms.documents.download","dms.documents.edit","dms.documents.manage_tags","dms.documents.share_external","dms.admin"]),
     rpc("mobile_dms_document",{p_action:"renewal_parent",p_data:{documentId:doc,...(input.renewalParent?{parent:input.renewalParent}:{})}},parent.nullable())]);
    if(!r.success||!r.data||!l.success||!l.data)unavailable();const d=r.data;
    const [preview,download,edit,tags,share,admin]=rights;
    const header=summary.parse({id:d.id,title:d.title,number:d.document_no,type:d.document_type?.name_en??null,expiry:d.expiry_date,status:d.status});
    return {...header,renewalParent,issue:d.issue_date,description:z.string().max(4000).nullable().parse(d.description),currentVersionId:bound.documentVersionId,sourceHash:bound.sourceHash,lifecycle:{stage:l.data.stage,next:l.data.next,owner:l.data.owner,section:l.data.section,blocker:l.data.blocker},actions:{preview,download,editMetadata:(edit||admin)&&!d.is_archived&&!["archived","superseded","deleted"].includes(d.status)&&d.approval_status!=="pending_approval",manageTags:tags||edit,comment:true,compare:preview,ask:flags.questions&&preview&&(!["hr","legal","executive"].includes(d.confidentiality_level)||admin),requestRenewal:renewalParent!==null,share:share&&preview&&download&&!d.is_archived&&!d.superseded_by_document_id}};
   }
   case "documentSources":{
    const offset=(input.page-1)*25;
    if(input.kind==="versions"){
     const r=await readCountedWindow(offset,(from,to)=>db.rpc("read_dms_document_versions",{target_document_id:doc},{get:true,count:"exact"}).select("id,document_id,version_number,version_label,is_current,created_at").eq("document_id",doc).is("unlinked_at",null).order("version_number",{ascending:false}).order("id",{ascending:false}).range(from,to));
     const rows=await Promise.all(z.array(z.object({id,document_id:z.literal(doc),version_number:id,version_label:z.string().nullable(),is_current:z.boolean(),created_at:z.iso.datetime({offset:true})})).max(25).parse(r.data).map(async v=>({id:v.id,number:v.version_number,label:v.version_label,isCurrent:v.is_current,createdAt:v.created_at,isHistorical:!v.is_current,sourceHash:(await admitMobileDmsSource(ctx,{documentId:doc,versionId:v.id,historical:true})).sourceHash})));
     return completePage(rows,input.page,25,r.count,v=>v.id);
    }
    const version=input.versionId??bound.documentVersionId;
    const ver=await admitMobileDmsSource(ctx,{documentId:doc,versionId:version,historical:true});
    const [preview,download]=await permissions(doc,["dms.documents.preview","dms.documents.download"]);
    const r=await readCountedWindow(offset,(from,to)=>db.rpc("f03_read_document_files_for_document",{p_document_id:doc},{get:true,count:"exact"}).select("id,document_id,version_id,file_name,mime_type,file_size_bytes,file_role,sha256_hash").eq("document_id",doc).eq("version_id",version).in("file_role",["original","attachment"]).order("id").range(from,to));
    const rows=await Promise.all(z.array(z.object({id,document_id:z.literal(doc),version_id:z.literal(version),file_name:z.string(),mime_type:z.string().nullable(),file_size_bytes:id,file_role:z.enum(["original","attachment"]),sha256_hash:hash.nullable()})).max(25).parse(r.data).map(async f=>({id:f.id,versionId:version,name:f.file_name,mime:f.mime_type??"application/octet-stream",size:f.file_size_bytes,role:f.file_role,sha256:f.sha256_hash,canPreview:preview,canDownload:download,sourceHash:(await admitMobileDmsSource(ctx,{documentId:doc,versionId:version,fileId:f.id,historical:true})).sourceHash})));
    await verifyMobileDmsDelivery(ctx,ver,["dms.documents.view"],true);
    return completePage(rows,input.page,25,r.count,v=>v.id);
   }
   case "documentHistory":return readHistory(input);
   case "documentMetadata":return rpc("mobile_dms_document",{p_action:"metadata",p_data:{documentId:doc}},metadataSchema);
   case "documentMetadataSave":return rpc("mobile_dms_document",{p_action:"metadata_save",p_data:{documentId:doc,operationId:input.operationId,sourceHash:input.sourceHash,snapshot:input.snapshot,values:input.values}},z.strictObject({documentId:z.literal(doc),operationId:z.literal(input.operationId),snapshot:hash,replayed:z.boolean()}),true);
   case "documentTagsChange":return rpc("mobile_dms_document",{p_action:"tags_change",p_data:{documentId:doc,operationId:input.operationId,sourceHash:input.sourceHash,add:input.add,remove:input.remove}},z.strictObject({documentId:z.literal(doc),operationId:z.literal(input.operationId),changed:z.boolean()}),true);
   case "documentTags":case "documentTagOptions":{
    const offset=(input.page-1)*25;
    if(input.op==="documentTagOptions"){
     const r=await readCountedWindow(offset,(from,to)=>{
      let q=db.from("dms_tags").select("id,name:tag_name,color:color_hex",{count:"exact"}).eq("is_active",true).is("deleted_at",null);
     if(input.search){const pattern=literalContains(input.search);q=q.or(`tag_name.ilike.${pattern},tag_code.ilike.${pattern}`);}
     return q.order("tag_name").order("id").range(from,to);
     });
     return completePage(z.array(tag).parse(r.data),input.page,25,r.count,t=>t.id);
    }
    const r=await readCountedWindow(offset,(from,to)=>db.from("dms_document_tags").select("tag:dms_tags!inner(id,name:tag_name,color:color_hex)",{count:"exact"}).eq("document_id",doc).order("tag_id").range(from,to));
    return completePage(z.array(z.object({tag})).parse(r.data).map(t=>t.tag),input.page,25,r.count,t=>t.id);
   }
   case "documentComments":{
    const r=await rpc("mobile_dms_document",{p_action:"comments",p_data:{documentId:doc,page:input.page}},pagePayload(z.strictObject({id,text:z.string().max(2000),authorLabel:z.string().nullable(),createdAt:z.iso.datetime({offset:true}),updatedAt:z.iso.datetime({offset:true}),revision:commentRevision,canEdit:z.boolean(),canDelete:z.boolean()}),20));
    return completePage(r.rows,input.page,20,r.totalCount,v=>v.id);
   }
   case "documentCommentAdd":case "documentCommentEdit":case "documentCommentDelete":{
    const {op,...data}=input;
    return rpc("mobile_dms_comment",{p_action:op==="documentCommentAdd"?"add":op==="documentCommentEdit"?"edit":"delete",p_data:data},z.strictObject({documentId:z.literal(doc),commentId:id,operationId:z.literal(input.operationId),revision:commentRevision,replayed:z.boolean()}),true);
   }
  }
 };
 const result=await read();
 if("source" in result && result.source.sourceHash!==bound.sourceHash)conflict();
 await verifyMobileDmsDelivery(ctx,bound);await employeeLink();return result;
}

export async function employeeDocuments(employeeId:number,page:number,ctx:AuthContext){
 await verifySession(ctx);
 const r=await rpc("mobile_dms_document",{p_action:"employee_folder",p_data:{employeeId,page}},pagePayload(z.strictObject({id,title:z.string(),number:z.string()})).extend({employeeId:z.literal(employeeId)}));
 return {...completePage(r.rows,page,25,r.totalCount,row=>row.id),employeeId};
}
