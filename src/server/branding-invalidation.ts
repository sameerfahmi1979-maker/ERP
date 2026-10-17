import 'server-only';
import {revalidatePath} from 'next/cache';

/** F06 mutation semantics only. PERF owns any shared cache/tag adapter. Never
 * derive the affected company from a browser-selected company or request field. */
export function invalidateCommittedBranding(scope:'report'|'app'|'both',companyId:number|null){
 if(scope!=='app'){
  revalidatePath('/admin/reports/templates');
  revalidatePath('/admin/organizations');
  if(companyId!==null)revalidatePath(`/admin/organizations/record/${companyId}`);
 }
 if(scope!=='report'){
  revalidatePath('/admin/settings/branding');
  revalidatePath('/','layout');
 }
}
