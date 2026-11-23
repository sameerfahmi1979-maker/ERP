import "server-only";
import {createAdminClient} from "@/lib/supabase/admin";
import {NextRequest} from "next/server";
import type {AuthContext} from "@/lib/rbac/check";
import {GET as deliverDocument} from "@/app/api/dms/file/route";
import {fileResponseReceipt} from "@/server/dms-file-response-receipt";
import {documents} from "./documents";
import {processing} from "./processing";
import {search} from "./search";
import {requests} from "./requests";
import {collections} from "./collections";
import {packs} from "./packs";
import {batch} from "./batch";
import {parseFileMode,resolveShare,readShares,mutateShare} from "./sharing";
import {admitMobileDmsSource,verifyMobileDmsDelivery,verifyEmployeeDocument,verifySession,DmsError,withMutationEffect,mutationCommitted,privateHeaders,conflict,unavailable,type Capability} from "./access";
import {lookupReceipt} from "./receipt";
import type {MobileDmsV5Command} from "./contracts";
export function dmsErrorResponse(e:unknown,operationId?:string){
 const error=e instanceof DmsError?e:new DmsError(503,"temporarily_unavailable","The result could not be verified. Retain your original request.",!!operationId);
 const uncertain=error.uncertain||mutationCommitted();
 return Response.json({success:false,error:error.message,code:error.code,...(uncertain?{uncertain:true,...(operationId?{operationId}:{})}:operationId&&error.code==="source_changed"?{noEffect:true}:{})},{status:error.status,headers:privateHeaders});
}
async function execute(input:MobileDmsV5Command,ctx:AuthContext,packSignal?:AbortSignal){
 switch(input.op){
  case "documentReceiptLookup":return lookupReceipt(input.original);
  case "documentDetails":case "documentSources":case "documentMetadata":case "documentMetadataSave":case "documentTags":case "documentTagOptions":case "documentTagsChange":case "documentComments":case "documentCommentAdd":case "documentCommentEdit":case "documentCommentDelete":case "documentHistory":return documents(input,ctx);
  case "processingStatus":case "processingAction":return processing(input,ctx);
  case "documentCompare":case "documentQuestion":case "documentNaturalSearch":case "documentNotifications":case "documentNotificationAction":case "documentQrLookup":return search(input,ctx);
  case "requiredChecklist":case "documentRequestOptions":case "documentRequests":case "documentRequestEvidence":case "documentRequestCreate":case "documentRequestAct":return requests(input);
  case "documentShareRecipients":case "documentShares":return readShares(input);
  case "documentShareCreate":case "documentShareRevoke":return mutateShare(input);
  case "documentShareResolve":return resolveShare(input.token);
  case "documentPackManifest":case "documentPackValidate":return packs(input,ctx,packSignal);
  case "documentFavourites":case "documentFavouriteSet":case "documentSavedFilters":case "documentSavedFilterSave":case "documentSavedFilterDelete":return collections(input);
  case "documentBatchAdmit":case "documentBatchRecover":case "documentBatchMember":return batch(input);
 }
}
export async function dispatchMobileDmsV5(input:MobileDmsV5Command,ctx:AuthContext,signal?:AbortSignal){
 return withMutationEffect(async()=>{try {
  const packSignal=input.op==="documentPackManifest"||input.op==="documentPackValidate"?signal:undefined;
  const data=await execute(input,ctx,packSignal);
  packSignal?.throwIfAborted();
  await verifySession(ctx);
  packSignal?.throwIfAborted();
  const body=JSON.stringify({success:true,data:{contractVersion:"mobile-dms/5.0",...data}});
  if(Buffer.byteLength(body)>(input.op==="documentCompare"?1572864:1048576))throw new DmsError(413,"output_limit","This result exceeds the supported size.");
  return new Response(body,{headers:{...privateHeaders,"Content-Type":"application/json; charset=utf-8"}});
 }catch(error){return dmsErrorResponse(error,"operationId" in input?input.operationId:undefined);}});
}
export async function deliverMobileDmsV5File(request:NextRequest,ctx:AuthContext){
 try{
  const selected=parseFileMode(request);
  if(selected.mode==="legacy"){
   const response=await deliverDocument(request);response.headers.set("Vary","Authorization");response.headers.set("Referrer-Policy","no-referrer");return response;
  }
  const caps:Capability[]=selected.mode==="share"?["dms.documents.preview","dms.documents.download"]:[selected.disposition==="inline"?"dms.documents.preview":"dms.documents.download"];
  const initial=selected.mode==="share"?await resolveShare(selected.token,"preflight"):null;
  const file=selected.mode==="pinned"?selected:initial!.source;
  const subject=selected.mode==="pinned"?selected.employeeId:undefined;
  if(subject!==undefined)await verifyEmployeeDocument(subject,file.documentId);
  const bound=await admitMobileDmsSource(ctx,{documentId:file.documentId,fileId:file.fileId,versionId:file.versionId,sourceHash:file.sourceHash},caps);
  const url=new URL("/api/dms/file",request.url);url.searchParams.set("fileId",String(file.fileId));url.searchParams.set("disposition",selected.disposition);
  const response=await deliverDocument(new NextRequest(url));
  if(!response.ok){await response.body?.cancel();throw new DmsError([403,404,409].includes(response.status)?response.status:503,"file_unavailable","The protected file is unavailable.");}
  try{
   await verifyMobileDmsDelivery(ctx,bound,caps);
   if(subject!==undefined)await verifyEmployeeDocument(subject,file.documentId);
   if(selected.mode==="share"){
    const event=fileResponseReceipt(response);if(!event)unavailable();
    if(!initial||!ctx.profile)unavailable();
    const attestation=await createAdminClient().rpc("mobile_dms_bind_share_response",{p_event:event,p_share:initial.shareId,p_actor:ctx.profile.id});
    if(attestation.error)unavailable();
    const final=await resolveShare(selected.token,"delivered",event);
    if(final.shareId!==initial?.shareId||final.source.sourceHash!==bound.sourceHash)conflict();
   }
  }catch(error){await response.body?.cancel();throw error;}
  response.headers.set("Vary","Authorization, X-ALGT-DMS-Share");response.headers.set("Referrer-Policy","no-referrer");return response;
 }catch(error){return dmsErrorResponse(error);}
}
