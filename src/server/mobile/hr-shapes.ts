import { z } from "zod";
import { id, revision } from "./hr-contracts";

export class HrError extends Error {
  constructor(readonly status:number, message:string,readonly uncertain=false){super(message);}
}
export const denied = () => new HrError(403,"This HR record or action is outside your current access.");
export const unavailable = () => new HrError(503,"The HR records could not be verified. Try again.");
export const conflict = () => new HrError(409,"The original record changed. Refresh and review the current version.");
export const dbRevision=z.union([id.transform(String),revision]);
const receipt=z.object({operationId:z.uuid(),id,employeeId:id,revision:dbRevision,replayed:z.boolean()});
export function normalizeReceipt(raw:unknown,operation:string,employee?:number,record?:number|null){
  const parsed=receipt.safeParse(raw);
  if(!parsed.success || parsed.data.operationId!==operation || (employee!==undefined && parsed.data.employeeId!==employee)
      || (record!=null && parsed.data.id!==record)) throw new HrError(503,"The original operation receipt could not be verified.",true);
  return parsed.data;
}
type Period = {id:number,leave_type_id:number,leave_year:number,period_start:string|null,period_end:string|null,known:boolean,entitled_days:number,used_days:number,reserved_days:number|null};
export function balanceRow(p:Period,label:string) {
  return {id:p.id,label,startDate:p.period_start,endDate:p.period_end,year:p.leave_year,known:p.known,entitled:p.entitled_days,used:p.used_days,reserved:p.reserved_days,
    available:p.known && p.reserved_days!==null?p.entitled_days-p.used_days-p.reserved_days:null};
}
export const human=(s:string)=>s.replace(/[-_]/g," ").replace(/^./,x=>x.toUpperCase());
export const field=(label:string,v?:string|number|null)=>({label,value:v==null?null:String(v)});
export const proposalKind=z.enum(["profile-correction","attendance-correction","compliance-renewal"]);
const record=z.record(z.string(),z.unknown());
export function formatProposal(kind:string,raw:unknown) {
  const proposal=record.parse(raw);
  const changes=kind==="profile-correction"?record.parse(proposal.changes??{}):proposal;
  const keys=kind==="profile-correction"?["mobile_number","personal_email","emergency_contact_name","emergency_contact_mobile"]:
    kind==="attendance-correction"?["date","reason"]:["reason","documentId","documentVersionId"];
  const source=kind==="compliance-renewal" && typeof proposal.sourceKind==="string" && typeof proposal.sourceId==="number"
    ? [field("Source record",human(proposal.sourceKind)+" #"+proposal.sourceId),field("Source revision",typeof proposal.sourceRevision==="string"?proposal.sourceRevision:null)] : [];
  return [...source,...keys.flatMap(k=>typeof changes[k]==="string" || typeof changes[k]==="number"?[field(human(k),changes[k])]:[])];
}
export const proposalRow=z.object({id,employeeId:id,revision:dbRevision,kind:proposalKind,status:z.string(),canDecide:z.boolean(),
  proposal:record,createdAt:z.string(),decisionReason:z.string().nullable().optional()});
const workflowMessages:Record<string,string>={
  "Reviewed leave policy unavailable":"The selected leave policy or joining date requires HR review.",
  "Leave span is too long":"Select a leave period of at most 366 calendar days.",
  "Current document and version required":"This leave type requires a current certificate from your employee DMS folder.",
  "Only pending leave can be cancelled":"Only a pending leave request can be cancelled.",
  "Current employee replacement evidence unavailable":"Select a current replacement document filed to this employee.",
  "Leave attachment unavailable":"Certificate access is restricted or the selected evidence changed.",
  "Leave evidence changed or access unavailable":"The certificate changed or is outside your current access.",
};
export function rpcFailure(code:string|undefined,write=false,message?:string) {
  if(message && Object.hasOwn(workflowMessages,message))return new HrError(code==="42501"?403:422,workflowMessages[message]);
  if(code==="42501")return denied();
  if(code==="P0409"||code==="PT409"||code==="40001")return conflict();
  if(code==="23514"||code==="22023"||code==="23505"||code==="23P01")return new HrError(422,"The ERP could not accept this change. Check the record, dates, evidence and current workflow state.");
  return new HrError(503,write?"Outcome unconfirmed. Check the original operation before retrying.":"The HR records could not be verified.",write);
}
