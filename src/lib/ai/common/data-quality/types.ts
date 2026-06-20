export type DataQualitySeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type DataQualityStatus =
  | 'open'
  | 'reviewed'
  | 'dismissed'
  | 'resolved'
  | 'false_positive'
  | 'superseded';

export type DataQualityRuleCategory =
  | 'completeness'
  | 'format'
  | 'consistency'
  | 'staleness'
  | 'relationship'
  | 'dms_health'
  | 'ai_health'
  | 'permission_health';

export type DataQualityEntityType =
  | 'organization'
  | 'branch'
  | 'party'
  | 'work_site'
  | 'dms_document'
  | 'ai_field_suggestion'
  | 'ai_duplicate_candidate'
  | 'ai_compliance_finding'
  | 'ai_risk_score'
  | 'ai_assistant_draft'
  | 'ai_audit_explanation'
  | 'permission'
  | 'feature_flag'
  | 'system';

export interface DataQualityFinding {
  id: number;
  finding_key: string;
  entity_type: DataQualityEntityType;
  entity_id: number | null;
  source_table: string | null;
  source_field: string | null;
  rule_code: string;
  rule_category: DataQualityRuleCategory;
  severity: DataQualitySeverity;
  status: DataQualityStatus;
  title: string;
  description: string;
  recommendation: string | null;
  safe_evidence_json: Record<string, unknown>;
  detected_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  resolved_by: number | null;
  reviewed_at: string | null;
  reviewed_by: number | null;
  created_at: string;
  updated_at: string;
  source_link?: string | null;
}

export interface DataQualityFindingEvent {
  id: number;
  finding_id: number;
  event_type: string;
  event_note: string | null;
  safe_metadata_json: Record<string, unknown>;
  created_by: number | null;
  created_at: string;
}

export interface DataQualityRuleDefinition {
  rule_code: string;
  label: string;
  category: DataQualityRuleCategory;
  severity: DataQualitySeverity;
  entity_types: DataQualityEntityType[];
  description: string;
  recommendation_template: string;
  permission_required: string | null;
  is_enabled: boolean;
}

export interface DataQualityScanInput {
  scope?: 'existing_scope';
  entityTypes?: DataQualityEntityType[];
  ruleCategories?: DataQualityRuleCategory[];
  dryRun?: boolean;
  limit?: number;
}

export interface DataQualityScanResult {
  scanned_at: string;
  duration_ms: number;
  dry_run: boolean;
  total_findings_detected: number;
  new_findings: number;
  reopened_findings: number;
  resolved_findings: number;
  findings_by_severity: Record<DataQualitySeverity, number>;
  findings_by_category: Record<string, number>;
}

export interface DataQualitySummary {
  total_open: number;
  total_reviewed: number;
  total_by_severity: Record<DataQualitySeverity, number>;
  total_by_category: Record<string, number>;
  top_entity_types: Array<{ entity_type: string; count: number }>;
  recent_findings: DataQualityFinding[];
  last_scan_at: string | null;
}

export interface DataQualityFindingsFilter {
  scope?: 'existing_scope';
  entityTypes?: DataQualityEntityType[];
  severities?: DataQualitySeverity[];
  statuses?: DataQualityStatus[];
  ruleCategories?: DataQualityRuleCategory[];
  limit?: number;
  offset?: number;
}

export interface DataQualityPermissionState {
  canView: boolean;
  canScan: boolean;
  canReview: boolean;
  canAdmin: boolean;
}
