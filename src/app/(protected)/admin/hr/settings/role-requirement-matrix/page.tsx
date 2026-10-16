import {HrRuleSettingsRoute} from '@/features/hr/settings/hr-rule-settings-route';

export default async function HrRoleRequirementMatrixPage(){
 return HrRuleSettingsRoute({entity:'hr_role_requirement_matrix'});
}
