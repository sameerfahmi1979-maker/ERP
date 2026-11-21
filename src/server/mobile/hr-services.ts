import { z } from "zod";
import { getOfficialDocumentDefinition } from "@/lib/official-documents/registry";
import { rpc, type Db } from "./hr-reads";
import { canonical, id, revision, fulfilSchema,proposalSchema, type ExpandedCommand } from "./hr-services-contracts";
import { cursorOf } from "./hr-page";
import { conflict, denied, HrError, unavailable } from "./hr-shapes";

const serviceKind=z.enum(["letter","issue-replacement","issue-return","task-evidence","dependent-change","accommodation-issue","overtime","shift-change","pro-follow-up","clearance-evidence","issue-acknowledgement"]);
export const receipt=z.strictObject({operationId:z.uuid(),id,employeeId:id,revision,replayed:z.boolean(),effect:z.enum(["submitted","approved","rejected","acknowledged","fulfilled"]),canonical:canonical.nullable()});
const summary=z.strictObject({id,employeeId:id,employeeLabel:z.string().nullable(),revision,kind:serviceKind.nullable(),title:z.string(),createdAt:z.string(),
  review:z.enum(["pending","approved","rejected","not-required"]),fulfilment:z.enum(["not-started","pending","fulfilled","not-applicable"]),canRead:z.boolean(),canDecide:z.boolean(),canFulfil:z.boolean()});
const ack=z.strictObject({kind:z.literal("issue-acknowledgement"),source:z.strictObject({kind:z.enum(["asset","ppe"]),id,revision}),statementVersion:z.literal("receipt-v1"),confirmed:z.literal(true)});
export const opening=summary.extend({visibility:z.enum(["summary","full"]),proposal:z.union([proposalSchema,ack]).nullable(),decidedAt:z.string().nullable(),decisionReason:z.string().nullable(),fulfilledAt:z.string().nullable(),
  result:z.strictObject({canonical,at:z.string(),actorLabel:z.string().nullable()}).nullable(),fields:z.array(z.strictObject({key:z.string(),label:z.string(),value:z.string().nullable()}))})
  .refine(r=>r.visibility==="full"?r.canRead && r.kind!==null && r.proposal?.kind===r.kind:
    !r.canRead && !r.canDecide && !r.canFulfil && r.kind===null && r.title==="Employee service" && [r.proposal,r.decidedAt,r.decisionReason,r.fulfilledAt,r.result].every(v=>v===null) && !r.fields.length);
export const serviceRpc=(db:Db,d:ExpandedCommand,write=false)=>rpc(db,"mobile_hr_service_v5",{p_data:d},write);
export async function serviceReadWrite(db:Db,i:ExpandedCommand) {
  const write=["serviceDecision","serviceSubmit","issueAcknowledge"].includes(i.op);
  if(i.op==="serviceSubmit" && i.proposal.kind==="letter"){
    const {outputCode,language}=i.proposal;
    const languages=getOfficialDocumentDefinition(outputCode)?.supportedLanguages??["en"];
    if(!languages.some(supported=>supported===language))throw new HrError(422,"The letter does not support the requested language.");
  }
  const raw=await serviceRpc(db,i,write);
  if(write || i.op==="serviceReceipt"){
    if(!raw)throw new HrError(503,"Original service receipt is unavailable.",true);
    const r=receipt.parse(raw);
    if(!("operationId" in i) || r.operationId!==i.operationId || ("employeeId" in i && i.employeeId!==r.employeeId) || ("id" in i && i.id!==r.id))throw new HrError(503,"Original service receipt could not be verified.",true);
    return r;
  }
  if(i.op==="serviceOpening"){
    const r=opening.parse(raw);if(r.employeeId!==i.employeeId || r.id!==i.id)throw denied();if(r.revision!==i.revision)throw conflict();return r;
  }
  if(i.op==="serviceRequests")return cursorOf(i.employeeId,z.array(summary).max(26).parse(raw));
  if(i.op==="serviceOptions"){
    const r=z.strictObject({employeeId:id,employeeRevision:revision,kind:serviceKind,canSubmit:z.boolean(),evidenceAllowed:z.boolean(),requiresSource:z.boolean()}).parse(raw);
    if(r.employeeId!==i.employeeId || r.kind!==i.kind)throw denied();return r;
  }
  if(i.op==="serviceAttempt"){
    const a=z.strictObject({employeeId:id,id,revision,attempt:z.strictObject({operationId:z.uuid(),command:fulfilSchema,state:z.enum(["pending","fulfilled"])}).nullable()}).parse(raw);
    if(a.id!==i.id || a.employeeId!==i.employeeId || a.revision!==i.revision)throw conflict();
    return a;
  }
  const choice=z.strictObject({id,label:z.string()});
  if(i.op==="serviceEvidence")return cursorOf(i.employeeId,z.array(choice.extend({versionId:id})).max(26).parse(raw));
  if(i.op==="serviceChoices"){
    if(i.kind==="letter"){
      const rows=z.array(choice.extend({code:z.string()})).max(26).parse(raw).map(r=>({...r,languages:getOfficialDocumentDefinition(r.code)?.supportedLanguages??["en"]}));
      return cursorOf(i.employeeId,rows);
    }
    if(i.kind==="shift-assignment")return cursorOf(i.employeeId,z.array(choice.extend({source:z.strictObject({kind:z.literal("shift-assignment"),id,revision})})).max(26).parse(raw));
    if(i.kind==="shift")return cursorOf(i.employeeId,z.array(choice.extend({calendarId:id.nullable()})).max(26).parse(raw));
    return cursorOf(i.employeeId,z.array(choice).max(26).parse(raw));
  }
  if(i.op==="serviceActionChoices"){
    const scope={kind:z.literal(i.kind)};
    const schema=i.kind==="canonical-proof"?choice.extend({...scope,canonical,source:z.strictObject({kind:z.enum(["asset","ppe","dependent","accommodation"]),id,revision}).nullable()}):
      i.kind==="issuance"?choice.extend({...scope,issuanceId:id,checksum:z.string().regex(/^[a-f0-9]{64}$/).nullable()}):
      i.kind==="letter-template"?choice.extend({...scope,templateId:id}):choice.extend({...scope,sourceId:id.nullable(),sourceReviewId:id.nullable()});
    return cursorOf(i.employeeId,z.array(schema).max(26).parse(raw));
  }
  throw unavailable();
}
