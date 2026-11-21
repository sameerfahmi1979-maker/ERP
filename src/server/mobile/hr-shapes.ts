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
const balancePeriod=z.object({id,leave_year:z.number().int(),period_start:z.string().nullable(),period_end:z.string().nullable(),label:z.string().nullish()});
export const mobileBalanceFact=z.union([
  balancePeriod.extend({source:z.literal("t04"),known:z.literal(true),entitled_days:z.number(),earned_days:z.number(),
    used_days:z.number(),reserved_days:z.number(),carry_forward_days:z.number(),available_days:z.number()}),
  balancePeriod.extend({source:z.enum(["t04","legacy"]),known:z.literal(false),entitled_days:z.null(),used_days:z.null(),
    reserved_days:z.null(),review_reason:z.string().min(1)}),
  balancePeriod.extend({source:z.literal("legacy").optional(),known:z.boolean(),entitled_days:z.number(),used_days:z.number(),
    reserved_days:z.number().nullable()}),
]);
export function balanceRow(p:z.infer<typeof mobileBalanceFact>,label:string) {
  const row={id:p.id,label,startDate:p.period_start,endDate:p.period_end,year:p.leave_year,known:p.known,
    entitled:p.entitled_days,used:p.used_days,reserved:p.reserved_days};
  if("review_reason" in p) return {...row,source:p.source,available:null,reviewReason:p.review_reason};
  if(p.source==="t04") return {...row,source:p.source,earned:p.earned_days,carryForward:p.carry_forward_days,available:p.available_days};
  return {...row,available:p.known && p.reserved_days!==null?p.entitled_days-p.used_days-p.reserved_days:null};
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
  "Managed leave requires PRO review before it can be submitted":"Ask HR to review this leave request before submitting it.",
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
