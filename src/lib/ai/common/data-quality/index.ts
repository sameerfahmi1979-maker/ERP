// Client-safe exports only — no server-only imports
export type {
  DataQualitySeverity,
  DataQualityStatus,
  DataQualityRuleCategory,
  DataQualityEntityType,
  DataQualityFinding,
  DataQualityFindingEvent,
  DataQualityRuleDefinition,
  DataQualityScanInput,
  DataQualityScanResult,
  DataQualitySummary,
  DataQualityFindingsFilter,
  DataQualityPermissionState,
} from './types';

export { DATA_QUALITY_RULES, getRuleByCode, getEnabledRules } from './rule-registry';
export { buildEntityLink, buildRuleCategoryLink } from './route-links';
