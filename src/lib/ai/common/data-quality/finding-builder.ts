import type {
  DataQualityEntityType,
  DataQualityFinding,
  DataQualityRuleCategory,
  DataQualitySeverity,
} from './types';
import { buildSafeEvidence } from './safe-evidence';
import { getRuleByCode } from './rule-registry';

export interface FindingInput {
  rule_code: string;
  entity_type: DataQualityEntityType;
  entity_id?: number | null;
  source_table?: string;
  source_field?: string;
  title: string;
  description: string;
  recommendation?: string;
  evidence?: Record<string, unknown>;
}

export function buildFindingKey(
  rule_code: string,
  entity_type: string,
  entity_id: number | null | undefined
): string {
  const parts = [rule_code, entity_type];
  if (entity_id != null) parts.push(String(entity_id));
  return parts.join('::');
}

export function buildDataQualityFinding(input: FindingInput): Omit<
  DataQualityFinding,
  'id' | 'detected_at' | 'last_seen_at' | 'created_at' | 'updated_at' | 'resolved_at' | 'resolved_by' | 'reviewed_at' | 'reviewed_by'
> {
  const rule = getRuleByCode(input.rule_code);
  const now = new Date().toISOString();

  return {
    finding_key: buildFindingKey(input.rule_code, input.entity_type, input.entity_id),
    entity_type: input.entity_type,
    entity_id: input.entity_id ?? null,
    source_table: input.source_table ?? null,
    source_field: input.source_field ?? null,
    rule_code: input.rule_code,
    rule_category: (rule?.category ?? 'completeness') as DataQualityRuleCategory,
    severity: (rule?.severity ?? 'medium') as DataQualitySeverity,
    status: 'open',
    title: input.title,
    description: input.description,
    recommendation: input.recommendation ?? rule?.recommendation_template ?? null,
    safe_evidence_json: buildSafeEvidence(input.evidence ?? {}),
  };
}

export function dedupeFindings(
  findings: ReturnType<typeof buildDataQualityFinding>[]
): ReturnType<typeof buildDataQualityFinding>[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    if (seen.has(f.finding_key)) return false;
    seen.add(f.finding_key);
    return true;
  });
}
