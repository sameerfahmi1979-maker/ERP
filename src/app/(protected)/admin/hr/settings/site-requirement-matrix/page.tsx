import {HrRuleSettingsRoute} from '@/features/hr/settings/hr-rule-settings-route';

export default async function HrSiteRequirementMatrixPage(){
 return HrRuleSettingsRoute({entity:'hr_site_requirement_matrix'});
}
