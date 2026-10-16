import {z} from 'zod';
import {dmsCreationContractSchema} from './numbered-document-create';
import {zNullableDateString} from './date-validators';
import {batchReceiptSchema,type BatchReceipt,type BatchOrigin} from './batch-admission';

const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const batchDraftSnapshotSchema=z.object({
 upload_session_id:id,session_code:z.string().min(1),batch_id:id.nullable(),analysis_result_id:id,
 owning_company_id:id.nullable(),owning_branch_id:id.nullable(),party_id:id.nullable(),
 document_type_id:id,category_id:id,title:z.string().max(500),description:z.string().nullable(),
 confidentiality_level:z.enum(['internal','company','hr','finance','legal','executive']),
 issue_date:zNullableDateString.nonoptional(),expiry_date:zNullableDateString.nonoptional(),confidence:z.string().nullable(),
 source_fingerprint:z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const batchDraftInputSchema=z.object({uploadSessionId:id,allowDuplicate:z.boolean().default(false),prepared:batchDraftSnapshotSchema.optional()}).strict()
 .refine(value=>!value.prepared||value.prepared.upload_session_id===value.uploadSessionId,'The prepared snapshot belongs to another upload.');
export const batchDraftContractSchema=dmsCreationContractSchema;
export const batchDraftPreparationSchema=z.object({operation_id:z.string().uuid(),snapshot:batchDraftSnapshotSchema}).strict();
export const batchDraftPrepareRpcSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('prepared'),snapshot:batchDraftSnapshotSchema}).strict(),
 z.object({kind:z.literal('analysis_required'),processing:z.boolean(),session_code:z.string().min(1),batch_id:id.nullable()}).strict(),
]);
export const batchDraftReceiptSchema=z.object({documentId:id,documentNo:z.string().min(1),status:z.literal('pending_ai_review'),confidence:z.string().nullable(),operation_id:z.string().uuid(),upload_session_id:id,replayed:z.boolean()}).strict();
export const batchDraftRpcReceiptSchema=batchDraftReceiptSchema.extend({reference_id:id});
export type BatchDraftInput=z.input<typeof batchDraftInputSchema>;
export type BatchDraftSnapshot=z.infer<typeof batchDraftSnapshotSchema>;
export type BatchDraftReceipt=z.infer<typeof batchDraftReceiptSchema>;
export type BatchDraftResult={success:true;data:BatchDraftReceipt}|{success:false;error?:string;uncertain?:boolean;prepared?:z.infer<typeof batchDraftPreparationSchema>};


// Durable SQL wire is canonical, not a normalizing browser-input schema.
export const batchDraftUuidSchema=z.string().length(36).regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const hash=z.string().length(64).regex(/^[0-9a-f]{64}$/);
const source={position:z.number().int().min(0).max(9),upload_session_id:id,session_code:z.string().length(32).regex(/^[0-9A-F]{32}$/)};
const baseRequest=z.object({uploadSessionId:id,allowDuplicate:z.literal(false)}).strict();
const sealedRequest=baseRequest.extend({prepared:batchDraftSnapshotSchema}).strict();
const preparedMember=z.object({...source,kind:z.literal('prepared'),draft_operation_id:batchDraftUuidSchema,request:sealedRequest}).strict();
const unpreparedMember=z.object({...source,kind:z.literal('unprepared'),draft_operation_id:batchDraftUuidSchema,request:baseRequest}).strict();
const historicalMember=z.object({...source,kind:z.literal('historical'),draft_operation_id:z.null()}).strict();
const analysisMember=z.object({...source,kind:z.literal('analysis_required'),draft_operation_id:batchDraftUuidSchema,request:baseRequest,processing:z.boolean()}).strict();
const anchors={version:z.literal(1),admission_operation_id:batchDraftUuidSchema,admission_fingerprint:hash,
 auth_user_id:batchDraftUuidSchema,profile_id:id,batch_id:id,owning_company_id:id.nullable(),owning_branch_id:id.nullable()};
const recoveryWire=z.object({...anchors,members:z.array(z.discriminatedUnion('kind',[historicalMember,unpreparedMember,preparedMember])).min(1).max(10)}).strict();
const prepareWire=z.object({...anchors,member:z.discriminatedUnion('kind',[preparedMember,analysisMember])}).strict();
type Anchors=z.infer<typeof prepareWire>;
type DurableMember=z.infer<typeof recoveryWire>['members'][number]|Anchors['member'];
function validMember(member:DurableMember,envelope:Anchors|z.infer<typeof recoveryWire>):boolean{
 if(member.kind==='historical')return true;
 if(member.request.uploadSessionId!==member.upload_session_id)return false;
 if(member.kind!=='prepared')return true;
 const s=member.request.prepared;
 return s.upload_session_id===member.upload_session_id&&s.session_code===member.session_code&&s.batch_id===envelope.batch_id&&
  s.owning_company_id===envelope.owning_company_id&&s.owning_branch_id===envelope.owning_branch_id&&hash.safeParse(s.source_fingerprint).success;
}
export const batchDraftRecoveryEnvelopeSchema=recoveryWire.superRefine((value,ctx)=>{
 const members=value.members;
 if(value.owning_branch_id!==null&&value.owning_company_id===null||
  members.some((m,i)=>m.position!==i||!validMember(m,value))||
  new Set(members.map(m=>m.upload_session_id)).size!==members.length||
  new Set(members.map(m=>m.session_code)).size!==members.length||
  (members.some(m=>m.kind==='historical')&&!members.every(m=>m.kind==='historical'))||
  (members[0].kind!=='historical'&&new Set(members.map(m=>m.draft_operation_id)).size!==members.length))
  ctx.addIssue({code:'custom',message:'Incomplete durable batch graph'});
});
export const batchDraftPrepareEnvelopeSchema=prepareWire.superRefine((value,ctx)=>{
 if(value.owning_branch_id!==null&&value.owning_company_id===null||!validMember(value.member,value))
  ctx.addIssue({code:'custom',message:'Invalid durable preparation'});
});
export type RecoveryEnvelope=z.infer<typeof batchDraftRecoveryEnvelopeSchema>;
export type PrepareEnvelope=z.infer<typeof batchDraftPrepareEnvelopeSchema>;
function boundAnchors(value:RecoveryEnvelope|PrepareEnvelope,receipt:BatchReceipt,origin:BatchOrigin):boolean{
 return value.auth_user_id===origin.authUserId&&value.profile_id===origin.profileId&&
  receipt.auth_user_id===origin.authUserId&&receipt.profile_id===origin.profileId&&
  value.admission_operation_id===receipt.operation_id&&value.admission_fingerprint===receipt.fingerprint&&
  value.batch_id===receipt.batch_id&&value.owning_company_id===receipt.company_id&&value.owning_branch_id===receipt.branch_id;
}
function boundMember(member:DurableMember,receipt:BatchReceipt):boolean{
 const source=receipt.members[member.position];
 return !!source&&source.id===member.upload_session_id&&source.code===member.session_code&&
  (member.kind!=='prepared'||member.request.prepared.party_id===(receipt.manifest.context?.id??null));
}
export function parseBatchDraftRecovery(raw:unknown,receipt:BatchReceipt,origin:BatchOrigin):RecoveryEnvelope|null{
 const parsed=batchDraftRecoveryEnvelopeSchema.safeParse(raw);
 return parsed.success&&boundAnchors(parsed.data,receipt,origin)&&parsed.data.members.length===receipt.members.length&&
  parsed.data.members.every(m=>boundMember(m,receipt))?parsed.data:null;
}
export function parseBatchDraftPreparation(raw:unknown,receipt:BatchReceipt,origin:BatchOrigin,position:number):PrepareEnvelope|null{
 const parsed=batchDraftPrepareEnvelopeSchema.safeParse(raw);
 return parsed.success&&boundAnchors(parsed.data,receipt,origin)&&parsed.data.member.position===position&&
  boundMember(parsed.data.member,receipt)?parsed.data:null;
}
export const batchDraftRecoveryFailureSchema=z.union([
 z.object({success:z.literal(false),code:z.enum(['unavailable','conflict','rejected']),uncertain:z.literal(false),error:z.string().min(1)}).strict(),
 z.object({success:z.literal(false),code:z.literal('unconfirmed'),uncertain:z.literal(true),error:z.string().min(1)}).strict(),
]);
export type RecoveryFailure=z.infer<typeof batchDraftRecoveryFailureSchema>;
export const batchDraftRecoveryResultSchema=z.union([
 z.object({success:z.literal(true),receipt:batchReceiptSchema,recovery:batchDraftRecoveryEnvelopeSchema}).strict()
  .refine(v=>!!parseBatchDraftRecovery(v.recovery,v.receipt,{authUserId:v.receipt.auth_user_id,profileId:v.receipt.profile_id})),
 batchDraftRecoveryFailureSchema,
]);
export const batchDraftPreparationResultSchema=z.union([
 z.object({success:z.literal(true),receipt:batchReceiptSchema,preparation:batchDraftPrepareEnvelopeSchema}).strict()
  .refine(v=>!!parseBatchDraftPreparation(v.preparation,v.receipt,{authUserId:v.receipt.auth_user_id,profileId:v.receipt.profile_id},v.preparation.member.position)),
 batchDraftRecoveryFailureSchema,
]);
export type BatchDraftRecoveryResult=z.infer<typeof batchDraftRecoveryResultSchema>;
export type BatchDraftPreparationResult=z.infer<typeof batchDraftPreparationResultSchema>;
