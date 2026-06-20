import { createAdminClient } from '@/lib/supabase/admin';
import type {
  DataQualityFinding,
  DataQualitySeverity,
  DataQualitySummary,
} from './types';
import { buildEntityLink } from './route-links';

export async function buildDataQualitySummary(): Promise<DataQualitySummary> {
  const supabase = createAdminClient();

  const { data: openFindings } = await supabase
    .from('erp_ai_data_quality_findings')
    .select(
      'id, finding_key, entity_type, entity_id, rule_code, rule_category, severity, status, title, description, recommendation, safe_evidence_json, detected_at, last_seen_at, resolved_at, resolved_by, reviewed_at, reviewed_by, created_at, updated_at, source_table, source_field'
    )
    .in('status', ['open', 'reviewed'])
    .is('deleted_at', null)
    .order('detected_at', { ascending: false })
    .limit(500);

  const allFindings: DataQualityFinding[] = (openFindings ?? []).map((f) => ({
    ...f,
    source_link: buildEntityLink(f.entity_type, f.entity_id),
  })) as DataQualityFinding[];

  const totalOpen = allFindings.filter((f) => f.status === 'open').length;
  const totalReviewed = allFindings.filter((f) => f.status === 'reviewed').length;

  const bySeverity: Record<DataQualitySeverity, number> = {
    info: 0, low: 0, medium: 0, high: 0, critical: 0,
  };
  const byCategory: Record<string, number> = {};
  const byEntityType: Record<string, number> = {};

  for (const f of allFindings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCategory[f.rule_category] = (byCategory[f.rule_category] ?? 0) + 1;
    byEntityType[f.entity_type] = (byEntityType[f.entity_type] ?? 0) + 1;
  }

  const topEntityTypes = Object.entries(byEntityType)
    .map(([entity_type, count]) => ({ entity_type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const { data: lastScanEvent } = await supabase
    .from('erp_ai_data_quality_finding_events')
    .select('created_at')
    .eq('event_type', 'created')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    total_open: totalOpen,
    total_reviewed: totalReviewed,
    total_by_severity: bySeverity,
    total_by_category: byCategory,
    top_entity_types: topEntityTypes,
    recent_findings: allFindings.slice(0, 10),
    last_scan_at: lastScanEvent?.created_at ?? null,
  };
}
