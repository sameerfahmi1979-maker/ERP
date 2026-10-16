import {redirect} from 'next/navigation';
import {getAuthContext,hasPermission,hasGlobalPermission} from '@/lib/rbac/check';
import {LoadError} from '@/components/erp/load-error';
import {listHrReadinessRuleTemplates,listHrRoleRequirementMatrix,listHrSiteRequirementMatrix,listHrApprovalWorkflows} from '@/server/actions/hr/settings';
import {saveHrLookup} from '@/server/hr-lookup-save';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import {loadHrRuleRows,type HrRuleEntity,type HrRuleRow} from '@/lib/hr/specialized-settings-form';
import {HrRuleSettingsPage} from './hr-rule-settings-page';

const lists={hr_readiness_rule_templates:listHrReadinessRuleTemplates,hr_role_requirement_matrix:listHrRoleRequirementMatrix,hr_site_requirement_matrix:listHrSiteRequirementMatrix,hr_approval_workflows:listHrApprovalWorkflows};
const paths={hr_readiness_rule_templates:'readiness-rule-templates',hr_role_requirement_matrix:'role-requirement-matrix',hr_site_requirement_matrix:'site-requirement-matrix',hr_approval_workflows:'approval-workflows'};
export async function HrRuleSettingsRoute({entity}:{entity:HrRuleEntity}){
 const ctx=await getAuthContext();
 if(!hasPermission(ctx,'hr.settings.view')&&!hasPermission(ctx,'hr.settings.manage')&&!hasPermission(ctx,'hr.admin'))redirect('/admin/hr/settings');
 const canManage=hasGlobalPermission(ctx,'hr.settings.manage')||hasGlobalPermission(ctx,'hr.admin');
 let rows:HrRuleRow[];
 try{rows=await loadHrRuleRows<HrRuleRow>(lists[entity]);}catch{return <LoadError title="HR configuration" retryHref={`/admin/hr/settings/${paths[entity]}`}/>;}
 async function save(id:number|null,input:Record<string,unknown>,contract:WorkspaceSaveContract){'use server';return saveHrLookup(entity,id,input,contract);}
 return <HrRuleSettingsPage entity={entity} principalId={ctx.profile?.id} canManage={canManage} rows={rows} onSave={save}/>;
}
