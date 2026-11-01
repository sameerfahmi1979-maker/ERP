import "server-only";
import {z} from "zod";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {getAuthContext} from "@/lib/rbac/check";
import {getDmsAiProvider} from "@/lib/dms/ai/factory";
import {loadMetadataFieldsForDocumentType} from "@/lib/dms/ai/load-metadata-fields";
import {prepareIntakeOutput} from "@/lib/dms/preparation/intake";
import {preparationId,preparationHash} from "@/lib/dms/preparation/contracts";
import {PROMPT_VERSION} from "@/lib/dms/ai/prompt-builders";
import type {DmsAiOutput} from "@/lib/dms/ai/types";
const request=z.strictObject({uploadSessionId:preparationId,documentTypeId:preparationId,mergeMode:z.enum(["fill_missing_only","replace_ai_values","keep_user_values"])});
const receipt=z.object({resultId:preparationId,extractedFieldsJson:z.record(z.string(),z.unknown()),fieldConfidenceJson:z.record(z.string(),z.unknown()),preparation:z.record(z.string(),z.unknown()),draftSnapshot:preparationHash,skipped:z.literal(false)}).strict();
const source=z.strictObject({resultId:preparationId,text:z.string().nullable(),existingFields:z.record(z.string(),z.unknown()).nullable(),existingConfidence:z.record(z.string(),z.unknown()).nullable(),typeCode:z.string(),typeName:z.string(),filename:z.string(),sourceHash:preparationHash,stageHash:preparationHash});
const admission=z.strictObject({state:z.enum(["ready","started","completed","uncertain"]),receipt:receipt.nullable(),token:z.uuid().nullable(),source:source.nullable()});
/** A source-bound admission precedes the paid call. Retries recover its receipt. */
export async function rerunRetainedIntakeMetadata(raw:unknown){
 const parsed=request.safeParse(raw);if(!parsed.success)return {success:false as const,error:"Invalid retained type review."};
 try{
  const ctx=await getAuthContext();if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password)return {success:false as const,error:"Current account required."};
  const p=parsed.data;
  if(p.mergeMode==="keep_user_values")return {success:true as const,data:{extractedFieldsJson:{},fieldConfidenceJson:{},skipped:true as const}};
  const db=await createClient();
  const read=await db.rpc("ai_mod04_intake_stage",{p_action:"read",p_data:p});
  if(read.error)return {success:false as const,error:"Retain the current analysis. Source, schema or extraction authority is unavailable; no replacement request was started."};
  let state=admission.parse(read.data);
  if(state.state==="completed"&&state.receipt)return {success:true as const,data:state.receipt};
  if(state.state!=="ready"||!state.source)return {success:false as const,uncertain:true,error:"The original extraction is unconfirmed. Retain the same review."};
  const preflight=state.source;
  const isPortrait=["EMPLOYEE_PHOTO","DEPENDENT_PHOTO"].includes(preflight.typeCode);
  const defs=await loadMetadataFieldsForDocumentType(db,p.documentTypeId,"intake");
  const configured=isPortrait?null:await getDmsAiProvider();
  if(!isPortrait&&(!preflight.text?.trim()||!configured?.provider.isConfigured()))return {success:false as const,error:"Retained text or the configured provider is unavailable. No paid request was started."};
  const begun=await db.rpc("ai_mod04_intake_stage",{p_action:"begin",p_data:{...p,expectedStageHash:preflight.stageHash}});
  if(begun.error)return {success:false as const,error:"The source changed before analysis. Reload the retained review; no paid call was made."};
  state=admission.parse(begun.data);
  if(state.state==="completed"&&state.receipt)return {success:true as const,data:state.receipt};
  if(state.state!=="started"||!state.source||!state.token)return {success:false as const,uncertain:true,error:"The original extraction is unconfirmed. Its source and request are retained; do not start another paid analysis."};
  const bound=state.source,portrait=["EMPLOYEE_PHOTO","DEPENDENT_PHOTO"].includes(bound.typeCode);
  let output:DmsAiOutput;let providerCode="not_applicable",model:string|null=null;const started=Date.now();
  if(portrait){
   output={classification:{suggestedTypeCode:bound.typeCode,suggestedTypeId:p.documentTypeId,confidenceScore:1,confidenceLabel:"high",reason:"Registered portrait type; no OCR or identity inference.",alternativeDocumentTypes:[]},extraction:{suggestedTitle:null,suggestedDescription:null,issueDateSuggestion:null,expiryDateSuggestion:null,fields:[],additionalFields:[],fullTextTranscription:null},suggestedLinks:[],detectedEntities:[],warnings:[],preparation:{summary:null,tagNames:[],bundle:"single"}};
  }else{
   if(!bound.text?.trim())throw Error("Retained text unavailable");
   if(!configured?.provider.isConfigured())throw Error("Provider unavailable");
   providerCode=configured.provider.providerCode;model=configured.provider.modelId??null;
   output=await configured.provider.analyze({ocrText:bound.text.slice(0,48000),imageFiles:[],currentTypeCode:bound.typeCode,typeCandidates:[{typeCode:bound.typeCode,nameEn:bound.typeName,description:null,categoryName:null}],metadataFields:defs,originalFilename:bound.filename});
  }
  const fields:Record<string,unknown>={},confidence:Record<string,unknown>={};
  const allowed=new Set(defs.map(d=>d.fieldCode));
  for(const field of output.extraction.fields){if(!allowed.has(field.fieldCode))continue;fields[field.fieldCode]=field.value;confidence[field.fieldCode]={score:field.confidenceScore,label:field.confidenceLabel,source_snippet:field.sourceSnippet??null};}
  const preparation=prepareIntakeOutput(output,{typeCode:bound.typeCode,typeName:bound.typeName,originalName:bound.filename,verifiedSubject:null,sourceHash:bound.sourceHash});
  const published=await createAdminClient().rpc("ai_mod04_intake_stage",{p_action:"complete",p_data:{token:state.token,fields,confidence,preparation,provenance:{provider:providerCode,model,promptVersion:PROMPT_VERSION,durationMs:Date.now()-started,promptTokens:output.promptTokens??null,completionTokens:output.completionTokens??null,inputTruncated:(bound.text?.length??0)>48000}}});
  if(published.error)throw Error("Publication unconfirmed");
  const saved=z.strictObject({state:z.literal("completed"),receipt}).parse(published.data);
  const delivery=await db.rpc("ai_mod04_intake_stage",{p_action:"read",p_data:p});
  if(delivery.error)throw Error("Source delivery revoked");
  const confirmed=admission.parse(delivery.data);
  if(confirmed.state!=="completed"||confirmed.receipt?.resultId!==saved.receipt.resultId)throw Error("Source delivery changed");
  const current=await getAuthContext();
  if(current.profile?.auth_user_id!==ctx.profile.auth_user_id||!current.isAccountActive||current.profile.must_change_password)throw Error("Account changed");
  return {success:true as const,data:saved.receipt};
 }catch{return {success:false as const,uncertain:true,error:"Type extraction is unconfirmed. Retry the same review to reconcile its retained result; do not upload again or repeat paid analysis."};}
}
