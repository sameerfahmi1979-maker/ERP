import { mobileAccessToken } from "@/lib/supabase/mobile-request";
import { z } from "zod";
import { approvedLetterInputs } from "./hr-letter-inputs";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateOfficialDocument } from "@/server/actions/output/generate-official-document";
import { recoverOfficialDocument } from "@/server/actions/output/recover-official-document";
import { deliverIssuedFile } from "@/server/issued-file-delivery";
import { type Db } from "./hr-reads";
import { receipt,serviceRpc } from "./hr-services";
import { HrError } from "./hr-shapes";
import { proposalSchema,type ExpandedInput } from "./hr-services-contracts";

type Input=ExpandedInput<"serviceFulfil">;
function checkReceipt(result:unknown,i:Input) {
  const parsed=receipt.safeParse(result);
  if(!parsed.success || parsed.data.effect!=="fulfilled" || parsed.data.operationId!==i.operationId || parsed.data.employeeId!==i.employeeId || parsed.data.id!==i.id || parsed.data.canonical===null)
    throw new HrError(503,"The original fulfilment requires reconciliation.",true);
  return parsed.data;
}
async function actorClaims(db:Db) {
  const {data,error}=await db.auth.getClaims(mobileAccessToken());
  if(error || !data?.claims.sub || !data.claims.session_id)throw new HrError(401,"Current issuer session required.");
  return {sub:data.claims.sub,session_id:data.claims.session_id};
}
async function closeUnissued(db:Db,input:Input):Promise<never> {
  const {data,error}=await createAdminClient().rpc("mobile_hr_v5_close_unissued",{p_claims:await actorClaims(db),p_data:input});
  if(!error && data===true)throw new HrError(422,"The official workflow confirmed no issuance. Reopen the request with corrected particulars or an authorized issuer.");
  throw new HrError(503,"Official issuance is pending. Reconcile the original attempt.",true);
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
    let inputs:Record<string,string>={};
    if(c.kind==="issue-letter") {
      try { inputs=approvedLetterInputs(p,c); }
      catch(error) {
        if(error instanceof HrError && error.status===422)return closeUnissued(db,i);
        throw error;
      }
    }
    const outcome=c.kind==="recover-letter"?await recoverOfficialDocument(c.issuanceId):await generateOfficialDocument(p.outputCode,i.employeeId,{
      clientRequestToken:i.operationId,language:p.language,inputs,...(c.templateId?{templateId:c.templateId}:{})});
    if(!outcome.success || outcome.lifecycleState!=="issued"){
      if(c.kind==="issue-letter" && !outcome.success && !outcome.issuanceId &&
        ["approval_required","permission_denied","not_registered","validation_failed","company_isolation_violation"].includes(outcome.blocked)) {
        return closeUnissued(db,i);
      }
      throw new HrError(503,"Official issuance is pending. Reconcile the original attempt.",true);
    }
    id=outcome.issuanceId;checksum=outcome.finalSha256;
  } else throw new HrError(422,"Invalid letter fulfilment.");
  const verified=await deliverIssuedFile(id,{employeeId:i.employeeId,checksum,mode:"download"});
  if(!verified.ok)throw new HrError(verified.status===404?403:verified.status===409?409:503,"The issued original could not be verified.",verified.status>=500);
  await verified.body?.cancel();
  const attested=await createAdminClient().rpc("mobile_hr_v5_attest_output",{p_claims:await actorClaims(db),p_data:i,p_issuance:id,p_sha:checksum});
  if(attested.error)throw new HrError(attested.error.code==="42501"?403:attested.error.code==="PT409"?409:503,"The original output could not be bound to this service.",!["42501","PT409"].includes(attested.error.code));
  return checkReceipt(attested.data,i);
}
