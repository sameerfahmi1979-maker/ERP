import {redirect} from 'next/navigation';
import {getAuthContext} from '@/lib/rbac/check';
import {LoadError} from '@/components/erp/load-error';
import {canManageHrRuleSettings,canReadHrRuleSettings,readHrRuleSettings} from '@/server/reads/hr-rule-settings';
import {saveHrLookup} from '@/server/hr-lookup-save';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {HrRuleEntity} from '@/lib/hr/specialized-settings-form';
import {exactHrRulePage} from '@/lib/hr/specialized-settings-read';
import {HR_SETTINGS_FIRST_PAGE} from '@/lib/hr/settings-list';
import {hrReadIdentity} from '@/lib/reads/hr-read-identity';
import {HrRuleSettingsPage} from './hr-rule-settings-page';

const paths={hr_readiness_rule_templates:'readiness-rule-templates',hr_role_requirement_matrix:'role-requirement-matrix',hr_site_requirement_matrix:'site-requirement-matrix',hr_approval_workflows:'approval-workflows'};
export async function HrRuleSettingsRoute({entity}:{entity:HrRuleEntity}){
 const ctx=await getAuthContext();
 if(!canReadHrRuleSettings(ctx))redirect('/admin/hr/settings');
 const result=await readHrRuleSettings({kind:'list',entity,...HR_SETTINGS_FIRST_PAGE},undefined,ctx);
 if(!result.success||!result.data||!exactHrRulePage(result.data,HR_SETTINGS_FIRST_PAGE.page,HR_SETTINGS_FIRST_PAGE.page_size)){
  return <LoadError title="HR configuration" retryHref={`/admin/hr/settings/${paths[entity]}`}/>;
 }
 async function save(id:number|null,input:Record<string,unknown>,contract:WorkspaceSaveContract){'use server';return saveHrLookup(entity,id,input,contract);}
 return <HrRuleSettingsPage entity={entity} readIdentity={hrReadIdentity(ctx)} canManage={canManageHrRuleSettings(ctx)} rows={result.data.data} total={result.data.total} onSave={save}/>;
}
