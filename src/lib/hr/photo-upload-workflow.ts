import {z} from 'zod';
import {singleUploadRequestSchema,sameSingleUploadRequest,type SingleUploadRequest} from '@/lib/dms/single-upload-admission';
import {uploadCreationInputSchema,uploadCreationContractSchema,uploadCreationPreparationSchema,uploadCreationReceiptSchema,type UploadCreationResult} from '@/lib/dms/numbered-upload-create';
import type {SingleUploadAdmissionResult} from '@/server/dms-single-upload-admission';
import {photoFramingSchema} from './photo-framing';
import {photoMetadataRequest} from './photo-metadata';

const id=z.number().int().positive().safe();
export const photoUploadStateSchema=z.object({
  request:singleUploadRequestSchema,
  typeId:id,title:z.string().min(1).max(500),expiry:z.string().nullable(),
  creation:z.object({input:uploadCreationInputSchema,contract:uploadCreationContractSchema}).strict().nullable(),
  receipt:uploadCreationReceiptSchema.nullable(),framing:photoFramingSchema.nullable(),
  metadata:photoMetadataRequest.nullable().default(null),metadataDone:z.boolean().default(false),
}).strict();
export type PhotoUploadState=z.infer<typeof photoUploadStateSchema>;
type Ports={
  current:()=>boolean;persist:(s:PhotoUploadState)=>void|Promise<void>;
  admit:(r:SingleUploadRequest)=>Promise<SingleUploadAdmissionResult>;
  upload:(path:string,token:string,mime:string)=>Promise<void>;
  verify:(id:number)=>Promise<{success:boolean;error?:string}>;
  acknowledge:(r:SingleUploadRequest,id:number)=>Promise<{success:boolean;error?:string}>;
  create:(input:z.input<typeof uploadCreationInputSchema>,contract:z.infer<typeof uploadCreationContractSchema>)=>Promise<UploadCreationResult>;
};
/** Retains original admission, allocation and receipt through lost responses.
 * Signed capabilities and bytes never enter the retained journal. */
export async function runPhotoUpload(raw:PhotoUploadState,p:Ports) {
  let s=photoUploadStateSchema.parse(raw);
  const current=()=>{if(!p.current())throw Error('Photo work belongs to an earlier account or form.');};
  const retain=async()=>{current();await p.persist(s);current();};
  current();
  if(s.receipt)return s.receipt;
  if(!s.creation){
    let admission=await p.admit(s.request);current();
    if(admission.recovery){
      const r=admission.recovery;
      if(!sameSingleUploadRequest({...r,operationId:s.request.operationId},s.request))throw Error('The original photo upload could not be reconciled.');
      s={...s,request:r};await retain();admission=await p.admit(r);current();
    }
    if(!admission.success||!admission.data)throw Error(admission.error??'Photo upload unconfirmed. Retry the same file.');
    const a=admission.data;
    if(a.uploadRequired){await p.upload(a.path,a.token,a.session.mime_type);current();}
    const verified=await p.verify(a.session.id);current();
    if(!verified.success)throw Error(verified.error??'Photo bytes could not be verified. Retry the original upload.');
    const ack=await p.acknowledge(s.request,a.session.id);current();
    if(!ack.success)throw Error(ack.error??'Photo upload unconfirmed. Retry the same file.');
    s={...s,creation:{input:uploadCreationInputSchema.parse({uploadSessionId:a.session.id,title:s.title,document_type_id:s.typeId,expiry_date:s.expiry??undefined}),contract:{operationId:crypto.randomUUID(),revision:null}}};await retain();
  }
  let result=await p.create(s.creation!.input,s.creation!.contract);current();
  if(!result.success&&result.prepared){
    const ready=uploadCreationPreparationSchema.parse(result.prepared),c=s.creation!;
    if(c.input.prepared||ready.operation_id!==c.contract.operationId||ready.snapshot.source.id!==c.input.uploadSessionId||ready.snapshot.type.id!==c.input.document_type_id)throw Error('Photo preparation identity changed.');
    s={...s,creation:{...c,input:uploadCreationInputSchema.parse({...c.input,prepared:ready.snapshot})}};await retain();
    result=await p.create(s.creation!.input,s.creation!.contract);current();
  }
  if(!result.success)throw Error(result.error??'Photo creation unconfirmed. Retry this original request.');
  const receipt=uploadCreationReceiptSchema.parse(result.data),c=s.creation!;
  if(!c.input.prepared||receipt.operation_id!==c.contract.operationId||receipt.upload_session_id!==c.input.uploadSessionId)throw Error('Photo response is incomplete. Retry to reconcile it.');
  s={...s,receipt};await retain();return receipt;
}
