import{z}from'zod';import{employeeDate,employeeId}from'./employee-contract';
export const workforceKind=z.enum(['identity-document','medical-insurance','medical-record','access-card','training-certificate','dependent','role-requirement','pro-process','assignment','asset','ppe','accommodation','leave-balance']);
export type WorkforceKind=z.infer<typeof workforceKind>;
export const isWorkforceEvidence=(kind:WorkforceKind)=>['identity-document','medical-insurance','medical-record','access-card','training-certificate','dependent'].includes(kind);
export const workforceVerifyData=z.object({document_id:employeeId,version_id:employeeId}).strict();
const hash=z.string().regex(/^[0-9a-f]{64}$/),revision=z.string().regex(/^[1-9]\d*$/);
export const workforcePurpose=(kind:WorkforceKind)=>kind==='role-requirement'?'waiver':kind==='pro-process'?'renewal':kind==='assignment'?'deployment':kind==='leave-balance'?'period':['asset','ppe','accommodation'].includes(kind)?'custody':'evidence';
export const workforceData=z.object({purpose:z.enum(['evidence','waiver','renewal','deployment','custody','period']),document_id:employeeId,version_id:employeeId,rule_id:employeeId.nullable(),reviewer_id:employeeId,responsible_id:employeeId.nullable(),valid_from:employeeDate,valid_until:employeeDate,period_start:employeeDate.nullable().optional(),period_end:employeeDate.nullable().optional()}).strict().refine(v=>v.valid_until>=v.valid_from,{path:['valid_until'],message:'Review end must not precede its start.'});
export const workforceOpeningRequest=z.object({employee_id:employeeId,source_kind:workforceKind,source_id:employeeId,document_id:employeeId.nullable(),rule_id:employeeId.nullable()}).strict();
export const workforceOpening=workforceOpeningRequest.omit({document_id:true}).extend({revision,document_id:employeeId.nullable(),version_id:employeeId.nullable(),fingerprint:hash,label:z.string(),state:z.string().nullable()}).strict();
export const workforceRequest=z.object({employee_id:employeeId,source_kind:workforceKind,source_id:employeeId,operation_id:z.string().uuid(),action:z.enum(['verify','request','approve','reject','revoke','withdraw']),reason:z.string().trim().min(1).max(2000),fingerprint:hash,data:z.union([workforceData,workforceVerifyData,z.object({}).strict()]),review_id:employeeId.nullable(),review_revision:revision.nullable()}).strict().superRefine((v,c)=>{
 if(v.action==='verify'){if(!isWorkforceEvidence(v.source_kind)||v.review_id!==null||v.review_revision!==null||!workforceVerifyData.safeParse(v.data).success)c.addIssue({code:'custom',message:'Current exact evidence identity is required.'});}
 else if(v.action==='request'){const d=workforceData.safeParse(v.data);if(!['role-requirement','assignment'].includes(v.source_kind)||v.review_id!==null||v.review_revision!==null||!d.success||d.data.purpose!==workforcePurpose(v.source_kind))c.addIssue({code:'custom',message:'Original source, purpose and independent review fields are required.'});}
 else if(isWorkforceEvidence(v.source_kind))c.addIssue({code:'custom',message:'Ordinary evidence uses authorized version verification, not a second-person decision.'});
 else if(v.review_id===null||v.review_revision===null||Object.keys(v.data).length)c.addIssue({code:'custom',message:'Decision must retain the original review identity and fields.'});
});
export type WorkforceRequest=z.infer<typeof workforceRequest>;
export const workforceReceipt=z.object({employee_id:employeeId,source_kind:workforceKind,source_id:employeeId,review_id:employeeId,revision,status:z.enum(['pending','approved','rejected','revoked','verified','withdrawn']),operation_id:z.string().uuid(),replayed:z.boolean()}).strict();
export type WorkforceReceipt=z.infer<typeof workforceReceipt>;
export function matchesWorkforceReceipt(r:WorkforceReceipt,q:Pick<WorkforceRequest,'employee_id'|'source_kind'|'source_id'|'operation_id'|'action'|'review_id'|'review_revision'>){
 const status={verify:'verified',request:'pending',approve:'approved',reject:'rejected',revoke:'revoked',withdraw:'withdrawn'}as const;
 return r.employee_id===q.employee_id&&r.source_kind===q.source_kind&&r.source_id===q.source_id&&r.operation_id===q.operation_id&&(q.review_id===null||r.review_id===q.review_id)&&r.status===status[q.action]&&r.revision===(q.review_revision===null?'1':String(BigInt(q.review_revision)+BigInt(1)));
}
export const workforceListRow=z.object({id:employeeId,source_id:employeeId,source_kind:workforceKind,purpose:z.string(),status:z.enum(['pending','approved','rejected','revoked','withdrawn']),revision,fingerprint:hash,document_id:employeeId.nullable(),version_id:employeeId.nullable(),rule_id:employeeId.nullable(),requested_by:employeeId,reviewer_id:employeeId,responsible_id:employeeId.nullable(),valid_from:employeeDate,valid_until:employeeDate,created_at:z.string().datetime({offset:true})}).strict();
export type WorkforceReviewRow=z.infer<typeof workforceListRow>;
