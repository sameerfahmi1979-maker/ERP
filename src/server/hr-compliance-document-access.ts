import 'server-only';
import {isHrAiFeatureEnabled} from '@/lib/hr/ai/feature-flags';
import {hasPermission,type AuthContext} from '@/lib/rbac/check';
/** Entry-point feature gating is separate from native employee/evidence scope.
 * This grants nothing: the ordinary atomic write still enforces all RLS. */
export async function canUseComplianceDocumentEntry(ctx:AuthContext){
 const admin=ctx.roleCodes?.includes('system_admin')||ctx.roleCodes?.includes('group_admin');
 return !!(ctx.isAccountActive&&ctx.profile&&!ctx.profile.must_change_password&&
  (admin||hasPermission(ctx,'hr.compliance.manage')||hasPermission(ctx,'hr.admin'))&&
  (admin||hasPermission(ctx,'dms.documents.view')||hasPermission(ctx,'dms.admin'))&&
  (admin||await isHrAiFeatureEnabled('ERP_AI_HR_DOCUMENT_TO_RECORD')));
}
