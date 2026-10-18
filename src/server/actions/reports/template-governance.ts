"use server";

import {getAuthContext,hasPermission} from '@/lib/rbac/check';
import {createClient} from '@/lib/supabase/server';
import {requireReportTemplateCapability} from '@/server/report-template-authority';
import {saveTemplateGovernance} from '@/server/template-governance-save';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {ReportTemplate,ReportTemplateEvent} from '@/lib/report-center/types';
import type {TemplateGovernanceReceipt} from '@/lib/report-center/template-governance-receipt';
import type {SecurityReviewResult} from '@/lib/template-governance/security-review';
import {listReportTemplates} from './templates';

type ActionResult<T=unknown>={success:boolean;data?:T;error?:string;uncertain?:boolean;receipt?:TemplateGovernanceReceipt};

export async function submitTemplateForReview(id:number,contract?:WorkspaceSaveContract):Promise<ActionResult>{
 const result=await saveTemplateGovernance(id,'submit',null,contract);
 if(!result.success)return result;
 const receipt=result.data!;
 if(receipt.review?.passed===false)return {success:false,receipt,error:'Template failed security review ('+receipt.review.findings.length+' findings). Correct the content before resubmitting.'};
 // F10 captures the existing template event in its committing transaction.
 return {success:true,receipt};
}
export async function approveTemplate(input:{templateId:number;notes?:string},contract?:WorkspaceSaveContract):Promise<ActionResult>{
 const result=await saveTemplateGovernance(input?.templateId,'approve',input?.notes??null,contract);return {...result,receipt:result.data};
}
export async function rejectTemplate(input:{templateId:number;reason:string},contract?:WorkspaceSaveContract):Promise<ActionResult>{
 const result=await saveTemplateGovernance(input?.templateId,'reject',input?.reason??null,contract);return {...result,receipt:result.data};
}
export async function publishTemplate(id:number,contract?:WorkspaceSaveContract):Promise<ActionResult>{
 const result=await saveTemplateGovernance(id,'publish',null,contract);return {...result,receipt:result.data};
}
export async function archiveTemplate(input:{templateId:number;reason?:string},contract?:WorkspaceSaveContract):Promise<ActionResult>{
 const result=await saveTemplateGovernance(input?.templateId,'archive',input?.reason??null,contract);return {...result,receipt:result.data};
}
export async function createTemplateDraftVersion(id:number,contract?:WorkspaceSaveContract):Promise<ActionResult<{id:number}>>{
 const result=await saveTemplateGovernance(id,'new_version',null,contract);
 return {...result,data:result.data?{id:result.data.id}:undefined,receipt:result.data};
}
export async function runTemplateSecurityReviewAction(id:number,contract?:WorkspaceSaveContract):Promise<ActionResult<SecurityReviewResult>>{
 const result=await saveTemplateGovernance(id,'review',null,contract);
 return {...result,data:result.data?.review??undefined,receipt:result.data};
}

export async function getTemplateGovernanceHistory(id:number):Promise<ActionResult<ReportTemplateEvent[]>>{
 try{
  const ctx=await getAuthContext();
  if(!hasPermission(ctx,'reports.view')&&!hasPermission(ctx,'reports.manage'))return {success:false,error:'You do not have permission to view report templates.'};
  await requireReportTemplateCapability(ctx,id,['reports.view','reports.manage'],true);
  const db=await createClient(),rows:ReportTemplateEvent[]=[];let after=0;
  for(;;){
   const {data,error}=await db.from('erp_report_template_events').select('*').eq('template_id',id).gt('id',after).order('id').limit(200);
   if(error)return {success:false,error:'Template history could not be loaded. Try again.'};
   if(!data?.length)break;
   const next=Number(data[data.length-1].id);if(!Number.isSafeInteger(next)||next<=after)throw Error('Invalid history cursor');
   rows.push(...data as ReportTemplateEvent[]);after=next;
  }
  rows.sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at)||b.id-a.id);
  return {success:true,data:rows};
 }catch{return {success:false,error:'Template history unavailable or not authorized.'};}
}
export interface GovernanceSummary{counts:Record<string,number>;inReviewTemplates:Partial<ReportTemplate>[];failedSecurityReviewTemplates:Partial<ReportTemplate>[]}
export async function getGovernanceSummary():Promise<ActionResult<GovernanceSummary>>{
 try{
  const ctx=await getAuthContext();
  if(!hasPermission(ctx,'reports.view')&&!hasPermission(ctx,'reports.manage')&&!hasPermission(ctx,'reports.template.approve'))return {success:false,error:'You do not have permission to view governance summary.'};
  const catalogue=await listReportTemplates();if(!catalogue.success)return {success:false,error:catalogue.error??'Template governance could not be loaded.'};
  const rows:Partial<ReportTemplate>[]=(catalogue.data??[]).map(t=>({
   id:t.id,workspace_revision:t.workspace_revision,is_active:t.is_active,template_code:t.template_code,template_name:t.template_name,template_type:t.template_type,branding_profile_id:t.branding_profile_id,
   governance_status:t.governance_status,security_review_status:t.security_review_status,version_no:t.version_no,
   submitted_at:t.submitted_at,approved_at:t.approved_at,rejected_at:t.rejected_at,rejection_reason:t.rejection_reason,security_review_notes:t.security_review_notes,
  }));
  const counts:Record<string,number>={draft:0,in_review:0,approved:0,published:0,rejected:0,archived:0};
  for(const row of rows){const status=row.governance_status??'draft';counts[status]=(counts[status]??0)+1;}
  return {success:true,data:{counts,inReviewTemplates:rows.filter(t=>t.governance_status==='in_review'),failedSecurityReviewTemplates:rows.filter(t=>t.security_review_status==='failed'&&t.governance_status!=='archived')}};
 }catch{return {success:false,error:'Template governance could not be loaded. Try again.'};}
}
export async function checkTemplateIsIssuable(id:number):Promise<{isIssuable:boolean;governanceStatus:string|null;error?:string}>{
 try{
  const ctx=await getAuthContext();const {template}=await requireReportTemplateCapability(ctx,id,['reports.view','reports.manage']);
  return {isIssuable:template.is_active&&template.security_review_status!=='failed'&&['approved','published'].includes(template.governance_status),governanceStatus:template.governance_status};
 }catch{return {isIssuable:false,governanceStatus:null,error:'Template unavailable or not authorized.'};}
}
