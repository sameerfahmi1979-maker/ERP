import {HrRuleSettingsRoute} from '@/features/hr/settings/hr-rule-settings-route';

export default async function HrApprovalWorkflowsPage(){
 return HrRuleSettingsRoute({entity:'hr_approval_workflows'});
}
