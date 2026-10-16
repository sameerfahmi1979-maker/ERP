import {HrRuleSettingsRoute} from '@/features/hr/settings/hr-rule-settings-route';

export default async function HrReadinessRuleTemplatesPage(){
 return HrRuleSettingsRoute({entity:'hr_readiness_rule_templates'});
}
