import type { SupabaseClient } from '@supabase/supabase-js';
import { buildDataQualityFinding } from './finding-builder';

const BATCH_LIMIT = 200;

export async function scanAiRules(
  supabase: SupabaseClient
): Promise<ReturnType<typeof buildDataQualityFinding>[]> {
  const findings: ReturnType<typeof buildDataQualityFinding>[] = [];
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const twentyOneDaysAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Stale field suggestions (pending > 14 days, aggregated count)
  const { data: staleSuggestions } = await supabase
    .from('erp_ai_field_suggestions')
    .select('id, entity_type, entity_id, created_at')
    .eq('status', 'pending')
    .lt('created_at', fourteenDaysAgo)
    .limit(BATCH_LIMIT);

  if (staleSuggestions && staleSuggestions.length > 0) {
    findings.push(
      buildDataQualityFinding({
        rule_code: 'AI_FIELD_SUGGESTION_PENDING_TOO_LONG',
        entity_type: 'ai_field_suggestion',
        entity_id: null,
        source_table: 'erp_ai_field_suggestions',
        title: 'AI Field Suggestions Pending Too Long',
        description: `${staleSuggestions.length} AI field suggestion(s) have been pending for over 14 days.`,
        evidence: {
          source: 'erp_ai_field_suggestions',
          count: staleSuggestions.length,
          issue: 'stale_pending',
          threshold_days: 14,
        },
      })
    );
  }

  // Duplicate candidates open > 21 days
  const { data: staleDuplicates } = await supabase
    .from('erp_ai_duplicate_candidates')
    .select('id, entity_type_a, entity_id_a, created_at')
    .eq('status', 'open')
    .lt('created_at', twentyOneDaysAgo)
    .limit(BATCH_LIMIT);

  if (staleDuplicates && staleDuplicates.length > 0) {
    findings.push(
      buildDataQualityFinding({
        rule_code: 'AI_DUPLICATE_CANDIDATE_OPEN_TOO_LONG',
        entity_type: 'ai_duplicate_candidate',
        entity_id: null,
        source_table: 'erp_ai_duplicate_candidates',
        title: 'AI Duplicate Candidates Open Too Long',
        description: `${staleDuplicates.length} duplicate/conflict candidate(s) have been open for over 21 days.`,
        evidence: {
          source: 'erp_ai_duplicate_candidates',
          count: staleDuplicates.length,
          issue: 'open_too_long',
          threshold_days: 21,
        },
      })
    );
  }

  // Critical compliance findings open
  const { data: criticalCompliance } = await supabase
    .from('erp_ai_compliance_findings')
    .select('id, severity, status, created_at')
    .eq('severity', 'critical')
    .eq('status', 'open')
    .limit(BATCH_LIMIT);

  if (criticalCompliance && criticalCompliance.length > 0) {
    findings.push(
      buildDataQualityFinding({
        rule_code: 'AI_COMPLIANCE_FINDING_CRITICAL_OPEN',
        entity_type: 'ai_compliance_finding',
        entity_id: null,
        source_table: 'erp_ai_compliance_findings',
        title: 'Critical AI Compliance Findings Open',
        description: `${criticalCompliance.length} critical compliance finding(s) remain unresolved.`,
        evidence: {
          source: 'erp_ai_compliance_findings',
          count: criticalCompliance.length,
          issue: 'critical_open',
        },
      })
    );
  }

  // Compliance findings open > 30 days
  const { data: staleCompliance } = await supabase
    .from('erp_ai_compliance_findings')
    .select('id, severity, status, created_at')
    .eq('status', 'open')
    .lt('created_at', thirtyDaysAgo)
    .limit(BATCH_LIMIT);

  if (staleCompliance && staleCompliance.length > 0) {
    findings.push(
      buildDataQualityFinding({
        rule_code: 'AI_COMPLIANCE_FINDING_OPEN_TOO_LONG',
        entity_type: 'ai_compliance_finding',
        entity_id: null,
        source_table: 'erp_ai_compliance_findings',
        title: 'AI Compliance Findings Open Too Long',
        description: `${staleCompliance.length} compliance finding(s) have been open for over 30 days.`,
        evidence: {
          source: 'erp_ai_compliance_findings',
          count: staleCompliance.length,
          issue: 'open_too_long',
          threshold_days: 30,
        },
      })
    );
  }

  // High-risk scores not reviewed
  const { data: highRisk } = await supabase
    .from('erp_ai_risk_scores')
    .select('id, entity_type, entity_id, risk_level')
    .in('risk_level', ['high', 'critical'])
    .is('reviewed_at', null)
    .limit(BATCH_LIMIT);

  if (highRisk && highRisk.length > 0) {
    findings.push(
      buildDataQualityFinding({
        rule_code: 'AI_RISK_SCORE_HIGH_UNREVIEWED',
        entity_type: 'ai_risk_score',
        entity_id: null,
        source_table: 'erp_ai_risk_scores',
        title: 'High AI Risk Scores Not Reviewed',
        description: `${highRisk.length} high/critical risk score(s) have not been reviewed.`,
        evidence: {
          source: 'erp_ai_risk_scores',
          count: highRisk.length,
          issue: 'high_unreviewed',
        },
      })
    );
  }

  // Assistant drafts pending > 7 days
  const { data: staleDrafts } = await supabase
    .from('erp_ai_assistant_action_drafts')
    .select('id, status, created_at')
    .eq('status', 'pending')
    .lt('created_at', sevenDaysAgo)
    .limit(BATCH_LIMIT);

  if (staleDrafts && staleDrafts.length > 0) {
    findings.push(
      buildDataQualityFinding({
        rule_code: 'AI_ASSISTANT_DRAFT_PENDING_REVIEW_TOO_LONG',
        entity_type: 'ai_assistant_draft',
        entity_id: null,
        source_table: 'erp_ai_assistant_action_drafts',
        title: 'AI Assistant Drafts Pending Review Too Long',
        description: `${staleDrafts.length} assistant draft(s) have been pending review for over 7 days.`,
        evidence: {
          source: 'erp_ai_assistant_action_drafts',
          count: staleDrafts.length,
          issue: 'pending_too_long',
          threshold_days: 7,
        },
      })
    );
  }

  // Audit explanations with missing source audit log
  const { data: explanations } = await supabase
    .from('erp_ai_audit_explanations')
    .select('id, source_type, source_id')
    .eq('source_type', 'audit_log')
    .is('deleted_at', null)
    .limit(BATCH_LIMIT);

  const orphanedExplanations: number[] = [];
  for (const expl of explanations ?? []) {
    if (expl.source_id) {
      const { data: auditEntry } = await supabase
        .from('audit_logs')
        .select('id')
        .eq('id', expl.source_id)
        .maybeSingle();
      if (!auditEntry) {
        orphanedExplanations.push(expl.id);
      }
    }
  }

  if (orphanedExplanations.length > 0) {
    findings.push(
      buildDataQualityFinding({
        rule_code: 'AI_AUDIT_EXPLANATION_SOURCE_MISSING',
        entity_type: 'ai_audit_explanation',
        entity_id: null,
        source_table: 'erp_ai_audit_explanations',
        title: 'AI Audit Explanations — Source Event Missing',
        description: `${orphanedExplanations.length} audit explanation(s) reference audit log entries that no longer exist.`,
        evidence: {
          source: 'erp_ai_audit_explanations',
          count: orphanedExplanations.length,
          issue: 'missing_source_audit_log',
        },
      })
    );
  }

  return findings;
}
