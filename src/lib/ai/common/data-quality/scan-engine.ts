import { createAdminClient } from '@/lib/supabase/admin';
import type { DataQualityScanInput, DataQualityScanResult, DataQualitySeverity } from './types';
import { buildFindingKey } from './finding-builder';
import { scanOrganizationRules, scanBranchRules, scanPartyRules, scanWorkSiteRules } from './entity-rules';
import { scanDmsRules } from './dms-rules';
import { scanAiRules } from './ai-rules';
import { scanPermissionRules } from './permission-rules';
import { dedupeFindings } from './finding-builder';

export async function runDataQualityScan(
  input: DataQualityScanInput,
  actorUserId: number
): Promise<DataQualityScanResult> {
  const startedAt = Date.now();
  const supabase = createAdminClient();

  const entityTypes = input.entityTypes ?? [
    'organization', 'branch', 'party', 'work_site',
    'dms_document', 'ai_field_suggestion', 'ai_duplicate_candidate',
    'ai_compliance_finding', 'ai_risk_score', 'ai_assistant_draft',
    'ai_audit_explanation', 'permission',
  ];

  const allFindings: ReturnType<typeof import('./finding-builder').buildDataQualityFinding>[] = [];

  const wantsEntity = (et: string) => entityTypes.includes(et as never);

  if (wantsEntity('organization') || wantsEntity('branch') || wantsEntity('party') || wantsEntity('work_site')) {
    if (wantsEntity('organization')) {
      allFindings.push(...await scanOrganizationRules(supabase));
    }
    if (wantsEntity('branch')) {
      allFindings.push(...await scanBranchRules(supabase));
    }
    if (wantsEntity('party')) {
      allFindings.push(...await scanPartyRules(supabase));
    }
    if (wantsEntity('work_site')) {
      allFindings.push(...await scanWorkSiteRules(supabase));
    }
  }

  if (wantsEntity('dms_document')) {
    allFindings.push(...await scanDmsRules(supabase));
  }

  if (
    wantsEntity('ai_field_suggestion') || wantsEntity('ai_duplicate_candidate') ||
    wantsEntity('ai_compliance_finding') || wantsEntity('ai_risk_score') ||
    wantsEntity('ai_assistant_draft') || wantsEntity('ai_audit_explanation')
  ) {
    allFindings.push(...await scanAiRules(supabase));
  }

  if (wantsEntity('permission')) {
    allFindings.push(...await scanPermissionRules(supabase));
  }

  const dedupedFindings = dedupeFindings(allFindings);

  const severityCounts: Record<DataQualitySeverity, number> = {
    info: 0, low: 0, medium: 0, high: 0, critical: 0,
  };
  const categoryCounts: Record<string, number> = {};

  for (const f of dedupedFindings) {
    severityCounts[f.severity as DataQualitySeverity] = (severityCounts[f.severity as DataQualitySeverity] ?? 0) + 1;
    categoryCounts[f.rule_category] = (categoryCounts[f.rule_category] ?? 0) + 1;
  }

  if (input.dryRun) {
    const durationMs = Date.now() - startedAt;
    return {
      scanned_at: new Date().toISOString(),
      duration_ms: durationMs,
      dry_run: true,
      total_findings_detected: dedupedFindings.length,
      new_findings: dedupedFindings.length,
      reopened_findings: 0,
      resolved_findings: 0,
      findings_by_severity: severityCounts,
      findings_by_category: categoryCounts,
    };
  }

  // Upsert findings
  const now = new Date().toISOString();
  let newCount = 0;
  let reopenedCount = 0;

  for (const finding of dedupedFindings) {
    const { data: existing } = await supabase
      .from('erp_ai_data_quality_findings')
      .select('id, status')
      .eq('finding_key', finding.finding_key)
      .is('deleted_at', null)
      .maybeSingle();

    if (existing) {
      if (['dismissed', 'resolved', 'false_positive', 'superseded'].includes(existing.status)) {
        await supabase
          .from('erp_ai_data_quality_findings')
          .update({ status: 'open', last_seen_at: now, updated_at: now })
          .eq('id', existing.id);

        await supabase.from('erp_ai_data_quality_finding_events').insert({
          finding_id: existing.id,
          event_type: 'reopened',
          event_note: 'Finding re-detected during scan',
          safe_metadata_json: { rule_code: finding.rule_code },
          created_by: actorUserId,
        });
        reopenedCount++;
      } else {
        await supabase
          .from('erp_ai_data_quality_findings')
          .update({ last_seen_at: now, updated_at: now })
          .eq('id', existing.id);
      }
    } else {
      const { data: inserted } = await supabase
        .from('erp_ai_data_quality_findings')
        .insert({ ...finding, detected_at: now, last_seen_at: now })
        .select('id')
        .single();

      if (inserted) {
        await supabase.from('erp_ai_data_quality_finding_events').insert({
          finding_id: inserted.id,
          event_type: 'created',
          event_note: 'Finding first detected by scan',
          safe_metadata_json: {
            rule_code: finding.rule_code,
            entity_type: finding.entity_type,
            severity: finding.severity,
          },
          created_by: actorUserId,
        });
        newCount++;
      }
    }
  }

  // Mark resolved findings
  const detectedKeys = new Set(dedupedFindings.map((f) => f.finding_key));
  const { data: openFindings } = await supabase
    .from('erp_ai_data_quality_findings')
    .select('id, finding_key, rule_code')
    .in('status', ['open', 'reviewed'])
    .is('deleted_at', null)
    .limit(500);

  let resolvedCount = 0;
  for (const existing of openFindings ?? []) {
    if (!detectedKeys.has(existing.finding_key)) {
      await supabase
        .from('erp_ai_data_quality_findings')
        .update({ status: 'resolved', resolved_at: now, updated_at: now })
        .eq('id', existing.id);

      await supabase.from('erp_ai_data_quality_finding_events').insert({
        finding_id: existing.id,
        event_type: 'resolved',
        event_note: 'No longer detected during scan',
        safe_metadata_json: { rule_code: existing.rule_code },
        created_by: actorUserId,
      });
      resolvedCount++;
    }
  }

  const durationMs = Date.now() - startedAt;

  return {
    scanned_at: new Date().toISOString(),
    duration_ms: durationMs,
    dry_run: false,
    total_findings_detected: dedupedFindings.length,
    new_findings: newCount,
    reopened_findings: reopenedCount,
    resolved_findings: resolvedCount,
    findings_by_severity: severityCounts,
    findings_by_category: categoryCounts,
  };
}
