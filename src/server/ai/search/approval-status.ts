import "server-only";
import {z} from "zod";
import {readDmsApprovals} from "@/server/reads/dms-approvals";
import {getDmsApprovalRouting} from "@/server/actions/dms/document-preparation";
import {getAuthContext} from "@/lib/rbac/check";
import {assertSearchPrincipal} from "./document-query";
import {verifySearchDelivery} from "./security";
/** Read-only handoff. Legacy pool eligibility is never presented as an assigned reviewer. */
export async function readSearchApprovalStatus(raw:unknown,signal?:AbortSignal){
  const parsed=z.strictObject({documentId:z.number().int().positive().safe(),page:z.number().int().min(1).max(100000).default(1),pageSize:z.number().int().min(1).max(100).default(25)}).safeParse(raw);
  if(!parsed.success)return {success:false as const,error:"Invalid approval search criteria"};
  try {
  signal?.throwIfAborted();const ctx=await getAuthContext();assertSearchPrincipal(ctx);
  const state=await readDmsApprovals({mode:"state",documentId:parsed.data.documentId},ctx,signal);
  if(!state.success||!("record"in state.data))return state;
  const history=await readDmsApprovals({mode:"history",...parsed.data},ctx,signal);
  if(!history.success)return history;
  const assigned=await getDmsApprovalRouting(parsed.data.documentId);
  if(!assigned.success||!assigned.data)return {success:false as const,error:"Approval assignment status could not be verified."};
  signal?.throwIfAborted();await verifySearchDelivery(ctx);
  return {success:true as const,data:{contractVersion:"erp-search/2.1",state:state.data.record,history:history.data,
    routing:{...assigned.data,options:undefined,workflow:assigned.data.state==="assigned"?"company_type_branch_configured":assigned.data.state},
    holds:["Notification receipt is not proven by an assigned approval state."],asOf:new Date().toISOString()}};
  }catch(error){signal?.throwIfAborted();return {success:false as const,error:error instanceof Error&&error.message==="Permission denied"?error.message:"Approval search could not be verified. Please retry."};}
}
