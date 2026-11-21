import {z} from "zod";
import type {AuthContext} from "@/lib/rbac/check";
import {createAdminClient} from "@/lib/supabase/admin";
import {retryDmsOrchestrationStep} from "@/server/actions/dms/orchestration";
import {wakePreparationDispatcher} from "@/server/dms-preparation-dispatcher";
import {withMobileStepReceipt} from "./orchestration-receipt";
import {admitMobileDmsSource,verifyMobileDmsDelivery,rpc,DmsError} from "./access";
import {type CommandFor,id,hash,retryStep} from "./contracts";
const instant=z.iso.datetime({offset:true});
const status=z.strictObject({documentId:id,sourceHash:hash,jobId:id.nullable(),requestId:z.uuid().nullable(),stage:z.enum(["uploaded","waiting","reading","analysing","ready","review_required","held","retry_wait","applied","cancelled","unavailable"]),queueStatus:z.string().max(80).nullable(),workerHealthy:z.boolean().nullable(),createdAt:instant.nullable(),startedAt:instant.nullable(),updatedAt:instant,errorCode:z.string().max(80).nullable(),holdReason:z.enum(["paused","daily_limit","source_changed","reconciliation_required"]).nullable(),steps:z.array(z.strictObject({code:z.string().max(64),label:z.string().max(100),state:z.enum(["pending","running","complete","failed","skipped","held"]),message:z.string().max(500).nullable()})).max(12),actions:z.array(z.discriminatedUnion("action",[z.strictObject({action:z.enum(["cancel","resume"])}),z.strictObject({action:z.literal("retry_step"),step:retryStep})])).max(8),preparation:z.strictObject({snapshot:hash,files:z.array(z.strictObject({id,versionId:id,name:z.string().max(1000),size:id,mime:z.string().max(200),sha256:hash})).max(100)}).nullable()});
export async function processing(input:CommandFor<"processingStatus"|"processingAction">,ctx:AuthContext){
 const src=await admitMobileDmsSource(ctx,{documentId:input.documentId,...("sourceHash" in input?{sourceHash:input.sourceHash}:{})},["dms.documents.preview"]);
 const {op,...data}=input;
 if(op==="processingStatus"){
  const r=await rpc("mobile_dms_progress",{p_data:data},status);
  if(r.documentId!==input.documentId||input.jobId!==undefined&&r.jobId!==input.jobId||r.sourceHash!==src.sourceHash)throw new DmsError(409,"source_changed","The processing source changed.");
  await verifyMobileDmsDelivery(ctx,src,["dms.documents.preview"]);return r;
 }
 const receipt=z.strictObject({documentId:z.literal(input.documentId),jobId:"jobId" in input?z.literal(input.jobId):id,operationId:z.literal(input.operationId),state:z.string().min(1).max(64),replayed:z.boolean()});
 const r=await rpc("mobile_dms_operation",{p_action:"admit",p_data:data},z.union([receipt,z.strictObject({admitted:z.literal(true),sessionCode:z.string().max(64),actor:id})]),true);
 if(!("admitted" in r)){
  if(input.action==="resume"||input.action==="prepare_source")wakePreparationDispatcher();
  await verifyMobileDmsDelivery(ctx,src,["dms.documents.preview"]);return r;
 }
 if(input.action!=="retry_step"||r.actor!==ctx.profile?.id)throw new DmsError(409,"reconciliation_required","Refresh the original processing operation.",true);
 await verifyMobileDmsDelivery(ctx,src,["dms.documents.preview"]);
 let settled:z.infer<typeof receipt>|null=null;
 await withMobileStepReceipt(r.sessionCode,input.step,async(step,overall)=>{
  // A failed provider bridge can have an unconfirmed paid effect. The reservation remains held.
  if(["ai_summary","embedding","tag_suggestions","link_suggestions"].includes(input.step)&&step.status!=="completed")throw new Error("Provider result requires reconciliation");
  const write=await createAdminClient().rpc("mobile_dms_finish_retry",{p_actor:r.actor,p_operation:input.operationId,p_result:step,p_status:overall});
  if(write.error)throw new Error("Unconfirmed canonical step");
  settled=receipt.parse(write.data);
 },()=>retryDmsOrchestrationStep({sessionCode:r.sessionCode,stepCode:input.step}));
 if(!settled)throw new DmsError(409,"reconciliation_required","The original processing operation requires reconciliation.",true);
 await verifyMobileDmsDelivery(ctx,src,["dms.documents.preview"]);return settled;
}
