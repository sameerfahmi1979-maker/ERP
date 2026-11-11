'use server';
import {z} from 'zod';
import {revalidatePath} from 'next/cache';
import {reviewedCall} from '@/server/dms-reviewed-updates';
import {preparationId} from '@/lib/dms/preparation/contracts';
import {savedIntakePayloadSchema,savedIntakeOpenSchema,savedIntakeSchemaState} from '@/lib/dms/saved-intake';
import {savedIntakeErrorCodes,savedIntakeErrorMessages} from '@/lib/dms/saved-intake-errors';
export async function openSavedIntake(documentId:number,fileId:number){
 if(!preparationId.safeParse(documentId).success||!preparationId.safeParse(fileId).success)return {success:false as const,error:'Select a saved document file.'};
 return reviewedCall('dms_saved_intake_review',{p_action:'open',p_data:{documentId,fileId}},savedIntakeOpenSchema.refine(v=>v.review.source.documentId===documentId&&v.review.source.files.some(f=>f.id===fileId)));
}
export async function readSavedIntakeSchema(documentId:number,documentTypeId:number){
 if(!preparationId.safeParse(documentId).success||!preparationId.safeParse(documentTypeId).success)return {success:false as const,error:'Select an available document type.'};
 return reviewedCall('dms_saved_intake_review',{p_action:'schema',p_data:{documentId,documentTypeId}},savedIntakeSchemaState);
}
export async function saveSavedIntake(raw:unknown,draft=false){
 const p=savedIntakePayloadSchema.safeParse(raw);
 if(!p.success)return {success:false as const,error:p.error.issues[0]?.message??'Check the intake fields.'};
 const result=await reviewedCall('dms_saved_intake_review',{p_action:draft?'draft':'apply',p_data:p.data},z.strictObject({documentId:z.literal(p.data.documentId),jobId:z.literal(p.data.jobId),requestId:z.literal(p.data.requestId),state:z.literal(draft?'draft_saved':'applied'),revision:z.number().int().nonnegative(),replayed:z.boolean()}),savedIntakeErrorCodes,savedIntakeErrorMessages);
 if(result.success&&!draft){try{revalidatePath(`/dms/documents/record/${p.data.documentId}`);revalidatePath('/dms/documents');}catch{/* Validated commit remains successful even if cache refresh fails. */}}
 return result;
}
