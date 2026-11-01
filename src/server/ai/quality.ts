import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {getAuthContext,canUseApplication} from '@/lib/rbac/check';
import {z} from 'zod';
import {datasetSchema,candidateSchema,qualitySourceSchema,observationsSchema,type QualitySnapshot,type QualityFeedback,type QualityDatasetRow,type QualityEvaluationRow,type QualityOperations} from '@/lib/ai/quality/contracts';
const id=z.number().int().positive().safe();
const resultSchema=z.object({total:z.number().int().positive(),passed:z.number().int().nonnegative(),criticalFailures:z.number().int().nonnegative(),regressions:z.array(z.string()),cases:z.array(z.object({caseId:z.string(),passed:z.boolean()})),eligible:z.boolean(),measurement:z.enum(['synthetic_contract','reviewed_provider_results'])});
const feedbackRow=z.object({id,reference:z.string(),source:qualitySourceSchema,category:z.enum(['wrong_person','wrong_document','incorrect_value','unsupported_answer','missing_result']),correction:z.string(),state:z.enum(['pending','accepted','disagreed','rejected']),createdAt:z.string(),canReview:z.boolean(),provenance:z.record(z.string(),z.unknown())});
const datasetRow=z.object({id,reference:z.string(),definition:datasetSchema,state:z.enum(['draft','approved']),sha256:z.string(),canApprove:z.boolean()});
const evaluationRow=z.object({id,reference:z.string(),datasetId:id,candidate:candidateSchema,result:resultSchema,state:z.enum(['draft','approved']),canApprove:z.boolean(),createdAt:z.string(),reviewedAt:z.string().nullable()});
const operationsSchema=z.object({asOf:z.string(),controls:z.array(z.object({feature:z.enum(['assistant','dms_jobs']),companyId:id.nullable(),companyName:z.string().nullable(),revision:z.number().int(),paused:z.boolean(),dailyLimit:z.number().int().nullable(),dailyUsd:z.number().nullable()})),versions:z.object({contract:z.string(),preparation:z.string()}),queue:z.record(z.string(),z.number()),usage:z.object({calls:z.number(),knownCostUsd:z.number(),unknownCostCalls:z.number(),inputTokens:z.number().nullable(),outputTokens:z.number().nullable(),unknownTokenCalls:z.number(),latencySample:z.number(),averageLatencyMs:z.number().nullable()}),profiles:z.object({active:z.number(),draft:z.number(),stale:z.number()}),companies:z.array(z.object({id,name:z.string()})),models:z.array(z.object({code:z.string(),model:z.string().nullable(),enabled:z.boolean(),purpose:z.string()})),freshness:z.object({lastIndexUpdate:z.string().nullable(),pendingChunks:z.number(),failedChunks:z.number(),pendingReviews:z.number()}),heldTurns:z.array(z.object({id,reference:z.string(),state:z.string(),createdAt:z.string()})).max(25)});
export const qualityFiltersSchema=z.strictObject({feedbackBefore:id.optional(),datasetBefore:id.optional(),evaluationBefore:id.optional(),state:z.enum(['pending','accepted','disagreed','rejected']).optional(),source:z.enum(['assistant','intake','preparation','extraction']).optional(),model:z.string().trim().min(1).max(200).optional(),profile:z.string().trim().min(1).max(200).optional(),dateFrom:z.iso.datetime({offset:true}).optional()});
export async function qualityClient(){
 const ctx=await getAuthContext();if(!ctx.profile||!canUseApplication(ctx))throw Error('Current ERP sign-in required.');
 const db=await createClient();const session=await db.rpc('f03_current_session_valid');if(session.error||session.data!==true)throw Error('Current ERP sign-in required.');return db;
}
export async function qualityRead(raw:unknown={}):Promise<QualitySnapshot>{
 const filters=qualityFiltersSchema.parse(raw),db=await qualityClient();
 const r=await db.rpc('ai_mod05_snapshot',{p_filters:filters});if(r.error)throw Error('AI quality contracts are unavailable. The matching local database/application release is required.');
 const value=z.object({feedback:z.array(feedbackRow).max(26),datasets:z.array(datasetRow).max(26),evaluations:z.array(evaluationRow).max(26),canOperate:z.boolean(),canEvaluate:z.boolean()}).parse(r.data);
 let operations:QualityOperations|null=null;
 // Monitoring is separate from source/evaluation authority. A denied monitoring
 // read does not turn permitted feedback into a global monitoring grant.
 const op=await db.rpc('ai_mod05_operations');if(!op.error)operations=operationsSchema.parse(op.data);
 const current=await db.rpc('f03_current_session_valid');if(current.error||current.data!==true)throw Error('Access changed; refresh before continuing.');
 return {feedback:value.feedback.slice(0,25) as QualityFeedback[],datasets:value.datasets.slice(0,25)as QualityDatasetRow[],evaluations:value.evaluations.slice(0,25)as QualityEvaluationRow[],hasMore:{feedback:value.feedback.length>25,datasets:value.datasets.length>25,evaluations:value.evaluations.length>25},canOperate:value.canOperate,canEvaluate:value.canEvaluate,operations};
}
export async function qualityWrite(name:string,args:Record<string,unknown>){
 let db:Awaited<ReturnType<typeof qualityClient>>;try{db=await qualityClient();}catch{return {success:false as const,uncertain:false,error:'Current ERP access could not be verified. No quality write was attempted.'};}
 const r=await db.rpc(name,args);if(r.error){const missing=['PGRST202','42883'].includes(r.error.code??''),definitive=missing||['22023','23502','23503','23505','23514','22003','22007','22P02','42501','PT409','55000','55P03','40P01','40001','PGRST301'].includes(r.error.code??'');return {success:false as const,uncertain:!definitive,error:missing?'This feature requires the matching database release. No quality request was saved.':definitive?'This request was held or rejected. Refresh the original source, authority and review state.':'The result is unconfirmed. Retain this request and recover it before editing or repeating work.'};}
 const receipt=z.object({id,replayed:z.boolean()}).safeParse(r.data);if(!receipt.success)return {success:false as const,uncertain:true,error:'The result is unconfirmed. Retry the same retained request.'};
 return {success:true as const,data:receipt.data};
}
export {observationsSchema};
