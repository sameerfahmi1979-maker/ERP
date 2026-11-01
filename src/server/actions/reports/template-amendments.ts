'use server';

import {z} from 'zod';
import {getAuthContext} from '@/lib/rbac/check';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {requireReportTemplateCapability,requireTemplateBrandingCapability} from '@/server/report-template-authority';
import {brandingPermission} from '@/lib/branding/asset-permissions';
import {canEditPublishedTemplate,amendmentActions,templateAmendmentReceipt,type TemplateAmendmentReceipt,type TemplateAmendmentAction} from '@/lib/report-center/template-amendment';
import {updateTemplateSchema} from '@/lib/report-center/template-config-schema';
import {runTemplateSecurityReview} from '@/lib/template-governance/security-review';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import {revalidatePath} from 'next/cache';

type Result={success:boolean;data?:TemplateAmendmentReceipt;error?:string;uncertain?:boolean};
const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/)}).strict();
const permissions={read:['reports.manage','reports.template.approve','reports.publish'],save:['reports.manage'],
 submit:['reports.manage'],approve:['reports.template.approve'],reject:['reports.template.approve'],
 publish:['reports.publish','reports.template.approve'],withdraw:['reports.manage'],discard:['reports.manage']};

async function run(id:number,action:TemplateAmendmentAction|'read',contract?:WorkspaceSaveContract,input?:unknown,note?:string):Promise<Result>{
 const parsed=contractSchema.safeParse(contract);
 const config=action==='save'?updateTemplateSchema.safeParse(input):null;
 if(!Number.isSafeInteger(id)||id<1||action!=='read'&&!parsed.success||config&&!config.success
  ||note!==undefined&&(typeof note!=='string'||note.length>2000)
  ||['reject','discard'].includes(action)&&(note??'').trim().length<5){
  return {success:false,error:'Check the template, current revision and required reason before continuing.'};
 }
 let actor:number,session:string,review:ReturnType<typeof runTemplateSecurityReview>|null=null;
 let data:Record<string,unknown>|null=null;
 try{
  const ctx=await getAuthContext();
  if(!ctx.profile||['save','submit','withdraw','discard'].includes(action)&&!canEditPublishedTemplate(ctx))
   return {success:false,error:'Editing reviewed templates requires a current Global System Administrator assignment.'};
  await requireReportTemplateCapability(ctx,id,permissions[action]);
  if(config?.success){
   const {id:inputId,...fields}=config.data;
   if(inputId!==id)return {success:false,error:'Template identity changed. Reopen the template.'};
   const company=await requireTemplateBrandingCapability(ctx,fields.branding_profile_id??null,['reports.manage']);
   if((fields.show_stamp||fields.show_signatory)&&!brandingPermission(ctx,'reports.sign',company))return {success:false,error:'Signing permission is required for this company.'};
   data=fields;
  }
  const db=await createClient(),claims=await db.auth.getClaims(),sessionId=claims.data?.claims.session_id;
  const valid=await db.rpc('f03_current_session_valid');
  if(claims.error||typeof sessionId!=='string'||valid.error||valid.data!==true)return {success:false,error:'Sign in again before changing templates.'};
  actor=ctx.profile.id;session=sessionId;
  if(action==='submit'){
   const current=await createAdminClient().rpc('edit_report_template',{p_actor:actor,p_session:session,p_id:id,p_action:'read'});
   const state=templateAmendmentReceipt.safeParse(current.data);
   if(current.error||!state.success||state.data.id!==id)return {success:false,error:'The pending edit could not be loaded. Retry the retained request.'};
   // A committed submit advances the revision. Still reach the durable receipt
   // on retry; only scan content when it is the exact requested revision.
   if(state.data.revision===parsed.data?.revision){
    review=runTemplateSecurityReview(state.data.template);
    if(!review.passed)return {success:false,error:'Security review found unsafe content. Correct the pending edit before submitting it.'};
   }
  }
 }catch{return {success:false,error:'Template unavailable, or current company/session authority is missing.'};}
 try{
  const {data:raw,error}=await createAdminClient().rpc('edit_report_template',{
   p_actor:actor,p_session:session,p_id:id,p_action:action,
   p_operation:parsed.success?parsed.data.operationId:null,p_revision:parsed.success?parsed.data.revision:null,
   p_data:data,p_note:note??null,p_review:review,
  });
  if(error){
   if(error.code==='PT409')return {success:false,error:'The published template or pending edit changed. Refresh and compare; the published version was not replaced.'};
   if(error.code==='42501'||error.code==='PT404')return {success:false,error:'The template, current session or required company/reviewer authority is unavailable.'};
   if(error.code==='22023')return {success:false,error:'Check the current edit status, independent reviewer, security review and reason. The change was not saved.'};
   const rolledBack=typeof error.code==='string'&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code));
   return {success:false,uncertain:action!=='read'&&!rolledBack,error:action==='read'?'Pending changes could not be loaded.':rolledBack?'The change was rolled back. Retry after correcting the problem.':'Change unconfirmed. Retry the same retained request.'};
  }
  const result=templateAmendmentReceipt.safeParse(raw);
  if(!result.success||result.data.id!==id||result.data.template.id!==id)return {success:false,uncertain:action!=='read',error:'Response incomplete. Retry the same request.'};
  if(result.data.changed)try{revalidatePath('/admin/reports/templates');revalidatePath('/admin/reports/templates/governance');}catch{/* Durable receipt remains authoritative. */}
  return {success:true,data:result.data};
 }catch{return {success:false,uncertain:action!=='read',error:action==='read'?'Pending changes could not be loaded.':'Change unconfirmed. Retry the same retained request.'};}
}

export async function getTemplateAmendment(id:number):Promise<Result>{return run(id,'read');}
export async function saveTemplateAmendment(input:z.infer<typeof updateTemplateSchema>,contract?:WorkspaceSaveContract):Promise<Result>{
 return run(input?.id,'save',contract,input);
}
export async function transitionTemplateAmendment(id:number,action:Exclude<TemplateAmendmentAction,'save'>,contract:WorkspaceSaveContract,note?:string):Promise<Result>{
 if(!amendmentActions.includes(action)||action as string==='save')return {success:false,error:'Invalid template action.'};
 return run(id,action,contract,undefined,note);
}
