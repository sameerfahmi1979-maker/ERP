import type { DataQualityEntityType } from './types';

export function buildEntityLink(
  entityType: DataQualityEntityType | string,
  entityId: number | null | undefined
): string | null {
  if (!entityId) return null;

  switch (entityType) {
    case 'organization':
      return `/admin/organizations/record/${entityId}`;
    case 'branch':
      return `/admin/branches/record/${entityId}`;
    case 'party':
      return `/admin/master-data/parties/record/${entityId}`;
    case 'work_site':
      return `/admin/common-master-data/work-sites/record/${entityId}`;
    case 'dms_document':
      return `/dms/documents/record/${entityId}`;
    case 'ai_risk_score':
      return `/admin/ai/risk`;
    case 'ai_duplicate_candidate':
      return `/admin/ai/duplicates`;
    case 'ai_compliance_finding':
      return `/admin/ai/compliance`;
    case 'ai_field_suggestion':
      return `/admin/ai/field-suggestions`;
    case 'ai_assistant_draft':
      return `/assistant`;
    case 'ai_audit_explanation':
      return `/admin/ai/audit-explainer`;
    case 'permission':
    case 'feature_flag':
    case 'system':
    default:
      return null;
  }
}

export function buildRuleCategoryLink(category: string): string | null {
  switch (category) {
    case 'dms_health':
      return '/dms/documents';
    case 'ai_health':
      return '/admin/ai/dashboard';
    case 'permission_health':
      return null;
    default:
      return null;
  }
}
