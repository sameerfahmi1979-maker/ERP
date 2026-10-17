import 'server-only';
import {z} from 'zod';
import {getAuthContext} from '@/lib/rbac/check';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {requireReportTemplateCapability} from '@/server/report-template-authority';
import {brandingPermission} from '@/lib/branding/asset-permissions';
import {runTemplateSecurityReview} from '@/lib/template-governance/security-review';
import {templateGovernanceReceipt,type TemplateGovernanceAction,type TemplateGovernanceReceipt} from '@/lib/report-center/template-governance-receipt';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import {revalidatePath} from 'next/cache';

export type GovernanceSaveResult={success:boolean;data?:TemplateGovernanceReceipt;error?:string;uncertain?:boolean};
const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/)}).strict();
const permissions:Record<TemplateGovernanceAction,string[]>={
 submit:['reports.manage'],approve:['reports.template.approve'],reject:['reports.template.approve'],
 publish:['reports.publish','reports.template.approve'],archive:['reports.manage','reports.template.approve'],
 new_version:['reports.manage'],review:['reports.manage','reports.template.approve'],
};
export async function saveTemplateGovernance(id:number,action:TemplateGovernanceAction,note:string|null,contract?:WorkspaceSaveContract):Promise<GovernanceSaveResult>{
 const parsed=contractSchema.safeParse(contract);
 if(!parsed.success||!Number.isSafeInteger(id)||id<1||note!==null&&(typeof note!=='string'||note.length>2000)||action==='reject'&&(note??'').trim().length<5){
  return {success:false,error:'Reopen this template and check its revision and reason before continuing.'};
 }
 let actor:number,session:string,review:ReturnType<typeof runTemplateSecurityReview>|null=null;
 try{
  const ctx=await getAuthContext();if(!ctx.profile)return {success:false,error:'Sign in again before changing templates.'};
  const {template,companyId}=await requireReportTemplateCapability(ctx,id,permissions[action],action==='archive');
  if((action==='approve'||action==='publish')&&/restricted_field_elevated_approval_required|sensitive_fields_require_elevated_approval/.test(template.security_review_notes??'')&&!brandingPermission(ctx,'reports.sensitive_fields.approve',companyId))return {success:false,error:'This template requires sensitive-field approval for its issuing company.'};
  if(action==='new_version'&&(template.show_stamp||template.show_signatory)&&!brandingPermission(ctx,'reports.sign',companyId))return {success:false,error:'Creating a revision with signing assets requires signing permission for this company.'};
  const db=await createClient(),claims=await db.auth.getClaims(),sessionId=claims.data?.claims.session_id;
  const valid=await db.rpc('f03_current_session_valid');
  if(claims.error||typeof sessionId!=='string'||valid.error||valid.data!==true)return {success:false,error:'Sign in again before changing templates.'};
  actor=ctx.profile.id;session=sessionId;
  if(action==='submit'||action==='review')review=runTemplateSecurityReview(template);
 }catch{return {success:false,error:'Template unavailable, review unavailable, or company permission is missing.'};}
 try{
  const {data,error}=await createAdminClient().rpc('transition_report_template',{
   p_actor:actor,p_session:session,p_operation:parsed.data.operationId,p_id:id,p_revision:parsed.data.revision,p_action:action,p_note:note,p_review:review,
  });
  if(error){
   if(error.code==='PT409')return {success:false,error:'The template or its revision family changed. Refresh and compare before continuing.'};
   if(error.code==='42501'||error.code==='PT404')return {success:false,error:'Template unavailable, or your current session/company/signing authority does not permit this action.'};
   if(error.code==='22023')return {success:false,error:'This transition is not available. Check the current status, passed security review, reason and version history.'};
   const rollback=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   return {success:false,uncertain:!rollback,error:rollback?'The change was rolled back. Template and history remain unchanged.':'Change unconfirmed. Retry the same action to recover its result.'};
  }
  const receipt=templateGovernanceReceipt.safeParse(data);
  if(!receipt.success||receipt.data.source_id!==id||action!=='new_version'&&receipt.data.id!==id)return {success:false,uncertain:true,error:'Change response incomplete. Retry the same action.'};
  if(receipt.data.changed)try{
   revalidatePath('/admin/reports');revalidatePath('/admin/reports/templates');revalidatePath('/admin/reports/templates/governance');
  }catch{/* Never turn a durable committed change into an alleged rollback. */}
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:true,error:'Change unconfirmed. Retry the same action to recover its result.'};}
}
