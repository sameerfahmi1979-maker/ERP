'use server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {photoRecoveryScope,photoRecoveryRecord,photoRecoveryPayload,photoSaveRequestSchema,type PhotoSaveRequest} from '@/lib/hr/photo-recovery';
import {createEmployee,updateEmployee} from './employees';
import {mutateEmployeeDependent} from './dependent-mutation';

const argsSchema=z.object({scope:photoRecoveryScope,operation:z.string().uuid(),revision:z.number().int().positive().nullable(),company:z.number().int().positive().nullable().optional(),branch:z.number().int().positive().nullable().optional()}).strict();
const rawRecord=photoRecoveryRecord.omit({savePending:true}).extend({save:photoSaveRequestSchema.nullable()}).strict();
type Args=z.infer<typeof argsSchema>;
async function call(mode:'read'|'write'|'finish'|'reject',args:{scope:string;operation?:string;revision?:number|null;company?:number|null;branch?:number|null},payload?:unknown){
 const c=await createClient(),r=await c.rpc('hr_photo_recovery',{p_mode:mode,p_scope:photoRecoveryScope.parse(args.scope),p_operation:args.operation??null,p_expected:args.revision??null,p_payload:payload??null,p_company:args.company??null,p_branch:args.branch??null});
 if(r.error)throw Error('Photo recovery could not be confirmed. Refresh its original request before another save.');
 return r.data===null?null:rawRecord.parse(r.data);
}
function publicRecord(r:z.infer<typeof rawRecord>|null){if(!r)return null;const {save,...value}=r;return photoRecoveryRecord.parse({...value,savePending:save!==null});}
async function settle(r:z.infer<typeof rawRecord>|null){
 if(r&&!r.save&&r.state.receipt&&!r.complete){try{return await call('finish',{scope:r.scope,operation:r.operation});}catch{return await call('read',{scope:r.scope,operation:r.operation});}}
 return r;
}
async function perform(r:PhotoSaveRequest){
 switch(r.kind){
  case 'employee-create':return createEmployee(r.input,r.contract);
  case 'employee-update':return updateEmployee(r.id,r.input,r.contract);
  case 'dependent':return mutateEmployeeDependent(r.input,r.contract);
 }
}
export async function readPhotoRecovery(scope:string){
 try{return {success:true as const,record:publicRecord(await settle(await call('read',{scope})))};}
 catch{return {success:false as const,error:'Photo recovery is unavailable with current access. No replacement upload was started.'};}
}
export async function retainPhotoRecovery(rawArgs:unknown,rawPayload:unknown){
 try{const a=argsSchema.parse(rawArgs),p=photoRecoveryPayload.parse(rawPayload);return {success:true as const,record:publicRecord(await call('write',a,p))!};}
 catch{return {success:false as const,error:'Photo progress is unconfirmed. Retry the original request; no new upload has started.'};}
}
export async function finishPhotoRecovery(raw:unknown){
 try{const a=argsSchema.parse(raw);return {success:true as const,record:publicRecord(await call('finish',a))!};}
 catch{return {success:false as const,error:'Photo assignment remains unconfirmed. Reconcile its original save.'};}
}
/** Store the exact validated save before dispatch. Never return retained private
 * HR fields to the browser merely to replay an interrupted request. */
export async function saveWithPhotoRecovery(raw:unknown,payload:unknown){
 let a:Args;
 try{
  a=argsSchema.parse(raw);const p=photoRecoveryPayload.parse(payload);
  if(!p.save)throw Error('Save request required');
  const before=await call('read',a);
  // A response may have been lost after commit. Replaying the original native
  // operation returns its receipt without issuing a second person or write.
  const c=await createClient(),committed=await c.rpc(p.save.kind==='dependent'?'f11_reconcile_dependent':'f11_reconcile_employee',{p_operation:p.save.contract.operationId});
  if(committed.error)throw Error('Save reconciliation unavailable');
  if(!committed.data)await call('write',{...a,revision:before?.revision??a.revision},p);
  const result=await perform(p.save);
  if(!result.success&&!result.uncertain)await call('reject',a);
  const after=await call('read',a);
  return {result,record:publicRecord(after)};
 }catch{return {result:{success:false,uncertain:true,error:'Photo save is unconfirmed. Reconcile the original operation before changing it.'},record:null};}
}
export async function resumePhotoSave(scope:string){
 try{
  const r=await call('read',{scope});if(!r)return {success:true as const,record:null};
  if(r.save){const result=await perform(r.save);if(!result.success){if(!result.uncertain)await call('reject',{scope,operation:r.operation});return {success:false as const,error:result.error??'Original save remains pending.'};}}
  return {success:true as const,record:publicRecord(await settle(await call('read',{scope,operation:r.operation})))};
 }catch{return {success:false as const,error:'Original photo save could not be reconciled. No replacement request was created.'};}
}
