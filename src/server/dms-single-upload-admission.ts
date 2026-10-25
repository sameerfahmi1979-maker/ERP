import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getAuthContext,hasPermission} from '@/lib/rbac/check';
import {dmsFileMetadataSchema,batchUuid} from '@/lib/dms/batch-admission';
import {singleUploadContextSchema,singleUploadRequestSchema,sameSingleUploadRequest,type SingleUploadRequest} from '@/lib/dms/single-upload-admission';
import {verifyTemporaryUpload} from '@/server/dms-temp-upload-verification';
import type {CreateUploadSessionInput,CreateUploadSessionResult,ActionResult,DmsUploadSessionRow} from '@/server/actions/dms/upload-sessions';

const contractSchema=z.object({operationId:batchUuid,authUserId:batchUuid}).strict();
const sessionSchema=z.object({id:z.number().int().positive(),session_code:z.string().min(1),uploaded_by:z.number().int().positive(),
  temp_storage_path:z.string().min(1),original_filename:z.string(),mime_type:z.string(),file_size_bytes:z.number().int().positive(),sha256_hash:z.string(),
  status:z.string(),intake_status:z.string(),document_id:z.number().nullable(),expires_at:z.string(),
  origin_entity_type:z.string().nullable(),origin_entity_id:z.number().nullable(),deleted_at:z.string().nullable(),
  is_duplicate:z.boolean(),duplicate_document_id:z.number().nullable(),uploaded_at:z.string(),completed_at:z.string().nullable(),
  temp_cleaned_at:z.string().nullable(),cleanup_error_message:z.string().nullable(),error_message:z.string().nullable(),
  created_at:z.string(),updated_at:z.string(),ai_result_id:z.number().nullable(),
}).passthrough();
const receiptSchema=z.object({operationId:batchUuid,authUserId:batchUuid,session:sessionSchema,replayed:z.boolean()}).strict();
const cancellationSchema=z.object({cancelled:z.object({operationId:batchUuid,sessionId:z.number().int().positive(),retained:z.literal(true)}).strict()}).strict();
const unknown='Upload admission is unconfirmed. Reselect the same file to recover the retained request; do not start another upload.';
const denied='Your current access does not allow this upload or its original request. Check the selected company and your upload access.';
export type SingleUploadContract=z.infer<typeof contractSchema>;
export type SingleUploadAdmissionResult=ActionResult<CreateUploadSessionResult>&{recovery?:SingleUploadRequest;cancelled?:z.infer<typeof cancellationSchema>['cancelled']};

/** Retains one admission before issuing any short-lived Storage capability.
 * A timeout/throw/invalid reply is never permission to mint another operation. */
export async function admitSingleUpload(input:CreateUploadSessionInput,contract?:SingleUploadContract):Promise<SingleUploadAdmissionResult>{
  let dispatched=false;
  try{
    const {context,scope,...metadata}=input;
    const m=dmsFileMetadataSchema.safeParse(metadata),c=contractSchema.safeParse(contract);
    const subject=context===undefined?{success:true as const,data:null}:singleUploadContextSchema.safeParse(context);
    if(!m.success||!subject.success||!c.success)return {success:false,error:'Invalid file, upload subject or retained operation identity.'};
    const request=singleUploadRequestSchema.parse({version:1,...c.data,metadata:m.data,context:subject.data,...(scope===undefined?{}:{scope})});
    const active=async()=>{
      const ctx=await getAuthContext();
      return ctx.profile?.auth_user_id===request.authUserId&&
        (hasPermission(ctx,'dms.documents.upload')||hasPermission(ctx,'dms.admin'))?ctx.profile:null;
    };
    const profile=await active();
    if(!profile)return {success:false,error:denied};
    const client=await createClient();
    const read=async()=>{
      const result=await client.rpc('f07_admit_single_upload',{p_request:request});
      if(result.error)throw result.error;
      const cancelled=cancellationSchema.safeParse(result.data);
      if(cancelled.success){if(cancelled.data.cancelled.operationId!==request.operationId||(await active())?.id!==profile.id)throw Error('Unverified cancellation');return cancelled.data;}
      const recovery=z.object({recovery:singleUploadRequestSchema}).strict().safeParse(result.data);
      if(recovery.success){
        if(!sameSingleUploadRequest({...recovery.data.recovery,operationId:request.operationId},request)||(await active())?.id!==profile.id)throw Error('Unverified original admission');
        return recovery.data;
      }
      const r=receiptSchema.parse(result.data),s=r.session;
      if(r.operationId!==request.operationId||r.authUserId!==request.authUserId||s.uploaded_by!==profile.id||
        s.original_filename!==m.data.original_filename||s.mime_type!==m.data.mime_type||s.file_size_bytes!==m.data.file_size_bytes||s.sha256_hash!==m.data.sha256_hash||
        s.origin_entity_type!==(request.context?.entityType??null)||s.origin_entity_id!==(request.context?.entityId??null)||
        (request.scope&&(s.owning_company_id!==request.scope.companyId||s.owning_branch_id!==request.scope.branchId))||
        s.deleted_at!==null||Date.parse(s.expires_at)<=Date.now()||!Number.isFinite(Date.parse(s.expires_at))||
        s.temp_storage_path!==`sessions/${s.session_code}/${m.data.original_filename.replace(/[^a-zA-Z0-9._-]/g,'_').replace(/_{2,}/g,'_').slice(0,200)}`||
        (await active())?.id!==profile.id)throw Error('Unverified upload receipt');
      return r;
    };
    dispatched=true;
    const admitted=await read();
    if('cancelled' in admitted)return {success:false,cancelled:admitted.cancelled,error:'The original upload was explicitly cancelled. Its history and bytes are retained; you may select a new file.'};
    if('recovery' in admitted)return {success:false,uncertain:true,recovery:admitted.recovery,error:'An earlier admission was recovered. Retain its original identity before continuing.'};
    let session=admitted.session;
    if(session.document_id!==null||!['uploading','uploaded'].includes(session.status))return {success:false,error:'This upload has already progressed. Open its original Inbox entry to continue; no replacement was created.'};
    const storage=createAdminClient().storage.from('dms-temp');
    const existing=await storage.info(session.temp_storage_path);
    const absent=existing.error&&[existing.error.status,existing.error.statusCode].some(v=>String(v)==='404');
    let uploadRequired=true;
    if(!existing.error&&existing.data){
      const verified=await verifyTemporaryUpload(session.id);
      if(!verified.success||!verified.data)return {success:false,uncertain:true,error:verified.error??unknown};
      session=sessionSchema.parse(verified.data);uploadRequired=false;
    }else if(!absent||session.status!=='uploading')return {success:false,uncertain:true,error:unknown};
    // Revalidate the authoritative binding after all remote reads. No service-key
    // query is substituted for this original-caller RLS/permission admission.
    const refreshed=await read();
    if('recovery' in refreshed||'cancelled' in refreshed||refreshed.session.id!==session.id||refreshed.session.temp_storage_path!==session.temp_storage_path||
      refreshed.session.document_id!==null||!['uploading','uploaded'].includes(refreshed.session.status))throw Error('Upload changed');
    let token='',signedUrl='',path=session.temp_storage_path;
    if(uploadRequired){
      const signed=await storage.createSignedUploadUrl(path);
      if(signed.error||!signed.data||signed.data.path!==path||!signed.data.token)return {success:false,uncertain:true,error:unknown};
      ({token,signedUrl,path}=signed.data);
    }
    if((await active())?.id!==profile.id)return {success:false,error:denied};
    const duplicate=await client.from('dms_document_files').select('document_id,dms_documents!document_id(id,document_no,title)')
      .eq('sha256_hash',m.data.sha256_hash).eq('file_role','original').is('deleted_at',null).limit(1).maybeSingle();
    if(duplicate.error)return {success:false,uncertain:true,error:'Duplicate checking is unavailable. Retain the original upload and retry.'};
    if((await active())?.id!==profile.id)return {success:false,error:denied};
    return {success:true,data:{session:session satisfies DmsUploadSessionRow,token,signedUrl,path,uploadRequired,
      isDuplicate:!!duplicate.data,duplicateDocument:duplicate.data?.dms_documents as unknown as CreateUploadSessionResult['duplicateDocument']??null}};
  }catch(e){
    const code=e&&typeof e==='object'&&'code' in e?String(e.code):'';
    const rejected=['42501','22023','PT409','PT422'].includes(code);
    const error=code==='PT422'?'Choose an owning company before uploading. Your administrator account does not need a fixed company assignment.':
      code==='22023'?'The file details or selected upload scope are invalid. Check the file and company selection.':
      code==='PT409'?'This upload request differs from its original attempt. Recover the original upload before changing its file or company.':denied;
    return {success:false,uncertain:dispatched&&!rejected,error:rejected?error:dispatched?unknown:'Upload preparation is unavailable.'};
  }
}

export async function acknowledgeSingleUpload(input:SingleUploadRequest,sessionId:number):Promise<ActionResult>{
 try{
  const request=singleUploadRequestSchema.parse(input);
  if(!Number.isSafeInteger(sessionId)||sessionId<1)return {success:false,error:'Invalid upload acknowledgment.'};
  const client=await createClient(),r=await client.rpc('f07_acknowledge_single_upload',{p_request:request,p_session:sessionId});
  const receipt=z.object({operationId:batchUuid,sessionId:z.number().int().positive(),acknowledged:z.literal(true)}).strict().safeParse(r.data);
  if(r.error||!receipt.success||receipt.data.operationId!==request.operationId||receipt.data.sessionId!==sessionId)return {success:false,uncertain:true,error:unknown};
  return {success:true};
 }catch{return {success:false,uncertain:true,error:unknown};}
}
