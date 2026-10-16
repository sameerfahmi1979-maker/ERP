import 'server-only';
import type {AuthContext} from '@/lib/rbac/check';
import {brandingPermission} from '@/lib/branding/asset-permissions';
import {createClient} from '@/lib/supabase/server';
import type {ReportTemplate} from '@/lib/report-center/types';

/** Read actual ownership through the protected projection, never client claims. */
export async function requireTemplateBrandingCapability(ctx:AuthContext,profileId:number|null,capabilities:string[],allowInactiveBranding=false){
 let companyId:number|null=null;
 if(profileId!==null){
  if(!Number.isSafeInteger(profileId)||profileId<1)throw Error('Template branding unavailable or not authorized.');
  const db=await createClient();
  const profile=await db.from('erp_report_branding_profiles_safe').select('id,owner_company_id,is_active').eq('id',profileId).maybeSingle();
  if(profile.error||!profile.data||(!allowInactiveBranding&&!profile.data.is_active))throw Error('Template branding unavailable or not authorized.');
  companyId=profile.data.owner_company_id;
 }
 if(!capabilities.some(code=>brandingPermission(ctx,code,companyId)))throw Error('Template operation is not authorized for this company.');
 return companyId;
}

/** Preflight for legacy server callers. Atomic mutation/replay remains separately required. */
export async function requireReportTemplateCapability(ctx:AuthContext,id:number,capabilities:string[],allowInactiveBranding=false){
 if(!Number.isSafeInteger(id)||id<1)throw Error('Template unavailable or not authorized.');
 const db=await createClient();
 const result=await db.from('erp_report_templates').select('*').eq('id',id).is('deleted_at',null).maybeSingle();
 if(result.error||!result.data)throw Error('Template unavailable or not authorized.');
 const template=result.data as ReportTemplate;
 const companyId=await requireTemplateBrandingCapability(ctx,template.branding_profile_id,capabilities,allowInactiveBranding);
 return {template,companyId};
}
