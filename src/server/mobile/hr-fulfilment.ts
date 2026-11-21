import { mobileAccessToken } from "@/lib/supabase/mobile-request";
import { z } from "zod";
import { getOfficialDocumentDefinition } from "@/lib/official-documents/registry";
import { HR_LETTER_SELECTIONS } from "@/lib/official-documents/hr-source-contract";
import { needsLetterReview } from "@/lib/official-documents/hr-source-review";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateOfficialDocument } from "@/server/actions/output/generate-official-document";
import { recoverOfficialDocument } from "@/server/actions/output/recover-official-document";
import { deliverIssuedFile } from "@/server/issued-file-delivery";
import { type Db } from "./hr-reads";
import { receipt,serviceRpc } from "./hr-services";
import { HrError } from "./hr-shapes";
import { proposalSchema,type ExpandedInput } from "./hr-services-contracts";

type Input=ExpandedInput<"serviceFulfil">;
type Letter=Extract<z.infer<typeof proposalSchema>,{kind:"letter"}>;
function generationInputs(p:Letter,c:Extract<Input["command"],{kind:"issue-letter"}>) {
  const definition=getOfficialDocumentDefinition(p.outputCode);
  const allowed=new Set(definition?.optionalInputs?.map(f=>f.key));
  const inputs:Record<string,string>={};
  if(allowed.has("recipient_mode"))inputs.recipient_mode="specific";
  const recipientKey=[p.language==="ar"?"recipient_organization_ar":"recipient_organization_en",
    p.language==="ar"?"addressee_ar":"addressee","recipient"].find(key=>allowed.has(key));
  if(recipientKey)inputs[recipientKey]=p.recipient;
  const purposeKey=p.language==="ar"?"purpose_ar":"purpose";
  if(allowed.has(purposeKey))inputs[purposeKey]=p.purpose;
  const selection=HR_LETTER_SELECTIONS[p.outputCode];
  if(needsLetterReview(p.outputCode) && c.sourceReviewId)inputs.source_review_id=String(c.sourceReviewId);
  else if(selection && c.sourceId)inputs[selection.key]=String(c.sourceId);
  return inputs;
}
function checkReceipt(result:unknown,i:Input) {
  const parsed=receipt.safeParse(result);
  if(!parsed.success || parsed.data.effect!=="fulfilled" || parsed.data.operationId!==i.operationId || parsed.data.employeeId!==i.employeeId || parsed.data.id!==i.id || parsed.data.canonical===null)
    throw new HrError(503,"The original fulfilment requires reconciliation.",true);
  return parsed.data;
}
export async function fulfilService(db:Db,i:Input) {
  const result=await serviceRpc(db,i,true);
  if(!result || typeof result!=="object" || !("pending" in result))return checkReceipt(result,i);
  const admitted=z.object({pending:z.literal(true),proposal:proposalSchema}).parse(result);
  const p=admitted.proposal,c=i.command;
  if(p.kind!=="letter")throw new HrError(503,"The original operation is pending.",true);
  let id:number,checksum:string;
  if(c.kind==="link-issued-letter"){id=c.issuanceId;checksum=c.checksum;}
  else if(c.kind==="recover-letter" || c.kind==="issue-letter"){
    const outcome=c.kind==="recover-letter"?await recoverOfficialDocument(c.issuanceId):await generateOfficialDocument(p.outputCode,i.employeeId,{
      clientRequestToken:i.operationId,language:p.language,inputs:generationInputs(p,c),...(c.templateId?{templateId:c.templateId}:{})});
    if(!outcome.success || outcome.lifecycleState!=="issued"){
      if(!outcome.success && !outcome.issuanceId && outcome.blocked!=="reconciliation_required")throw new HrError(422,"The official output workflow could not issue this letter. Review its source, wording and policy requirements.");
      throw new HrError(503,"Official issuance is pending. Reconcile the original attempt.",true);
    }
    id=outcome.issuanceId;checksum=outcome.finalSha256;
  } else throw new HrError(422,"Invalid letter fulfilment.");
  const verified=await deliverIssuedFile(id,{employeeId:i.employeeId,checksum,mode:"download"});
  if(!verified.ok)throw new HrError(verified.status===404?403:verified.status===409?409:503,"The issued original could not be verified.",verified.status>=500);
  await verified.body?.cancel();
  const claims=await db.auth.getClaims(mobileAccessToken());
  if(claims.error || !claims.data?.claims.sub || !claims.data.claims.session_id)throw new HrError(401,"Current issuer session required.");
  const attested=await createAdminClient().rpc("mobile_hr_v5_attest_output",{p_claims:{sub:claims.data.claims.sub,session_id:claims.data.claims.session_id},p_data:i,p_issuance:id,p_sha:checksum});
  if(attested.error)throw new HrError(attested.error.code==="42501"?403:attested.error.code==="PT409"?409:503,"The original output could not be bound to this service.",!["42501","PT409"].includes(attested.error.code));
  return checkReceipt(attested.data,i);
}
