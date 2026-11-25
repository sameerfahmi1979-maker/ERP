import {z} from "zod";
import {type CommandFor,completePage,hash,id,parent,requestStatus} from "./contracts";
import {pagePayload} from "./collections";
import {rpc,unavailable} from "./access";
const action=z.enum(["start","submit_document","fulfil","reject","cancel"]);
const kind=z.enum(["missing","renewal"]);
const requestRow=z.strictObject({id,kind,parent,ruleId:id.nullable(),documentTypeId:id.nullable(),sourceDocumentId:id.nullable(),sourceVersionId:id.nullable(),status:requestStatus,canonicalStatus:z.string().nullable(),revision:id,requesterLabel:z.string(),assigneeId:id.nullable(),assigneeLabel:z.string().nullable(),dueDate:z.iso.date().nullable(),notes:z.string().max(2000),submittedDocumentId:id.nullable(),submittedVersionId:id.nullable(),createdAt:z.iso.datetime({offset:true}),updatedAt:z.iso.datetime({offset:true}),actions:z.array(action).max(5)});
const checklistRow=z.strictObject({ruleId:id,label:z.string(),documentTypeId:id.nullable(),state:z.enum(["present","missing","unknown"]),canRequest:z.boolean(),checklistHash:hash.nullable()}).refine(r=>r.canRequest===(r.checklistHash!==null)&&(!r.canRequest||r.state==="missing"&&r.documentTypeId!==null));
export async function requests(input:CommandFor<"requiredChecklist"|"documentRequestOptions"|"documentRequests"|"documentRequestEvidence"|"documentRequestCreate"|"documentRequestAct">){
 const {op,...data}=input;
 switch(input.op){
  case "requiredChecklist":{
   const r=await rpc("mobile_dms_checklist",{p_data:data},pagePayload(checklistRow).extend({coverage:z.enum(["complete","partial","unknown"]),missingCount:z.number().int().nonnegative().safe().nullable()}).refine(v=>(v.coverage==="complete")===(v.missingCount!==null)));
   return {...completePage(r.rows,input.page,25,r.totalCount,x=>x.ruleId),coverage:r.coverage,missingCount:r.missingCount};
  }
  case "documentRequestOptions":{
   const r=await rpc("mobile_dms_requests",{p_action:"options",p_data:data},pagePayload(z.strictObject({id,label:z.string()})).extend({canSubmit:z.boolean(),canManage:z.boolean()}));
   return {...completePage(r.rows,input.page,25,r.totalCount,x=>x.id),canSubmit:r.canSubmit,canManage:r.canManage};
  }
  case "documentRequests":{
   const r=await rpc("mobile_dms_requests",{p_action:"list",p_data:data},pagePayload(requestRow));
   return completePage(r.rows,input.page,25,r.totalCount,v=>v.kind+"/"+v.id);
  }
  case "documentRequestEvidence":{
   const available=await rpc("mobile_dms_request_evidence",{p_data:data},z.literal(true));
   return {available};
  }
  default:{
   const result=z.strictObject({request:requestRow,operationId:z.literal(input.operationId),replayed:z.boolean()});
   const r=op==="documentRequestCreate"&&input.kind==="renewal"?await rpc("mobile_dms_renewal_request",{p_data:data},result,true):await rpc("mobile_dms_requests",{p_action:op==="documentRequestAct"?"act":"create",p_data:data},result,true);
   if(r.request.kind!==input.kind||input.op==="documentRequestAct"&&r.request.id!==input.requestId||input.op==="documentRequestCreate"&&(r.request.parent.entityId!==input.parent.entityId||r.request.parent.entityType!==input.parent.entityType))unavailable();
   return r;
  }
 }
}
