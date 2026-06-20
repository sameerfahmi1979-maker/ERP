'use server';

/**
 * ERP COMMON AI.15 — AI Data Quality Monitor Server Actions
 *
 * FIX.1 (2026-06-18):
 * - F-001: Replaced broken logAuditEvent() with standard logAudit() using correct audit_logs schema.
 * - F-003: isDataQualityMonitorEnabled() now checks only ERP_AI_DATA_QUALITY_MONITOR (not legacy ERP_AI_DATA_QUALITY).
 * - F-007: Replaced custom checkPermission() with standard getAuthContext() + hasPermission().
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthContext, hasPermission } from '@/lib/rbac/check';
import { logAudit } from '@/server/actions/audit';
import type {
  DataQualityFinding,
  DataQualityFindingEvent,
  DataQualityFindingsFilter,
  DataQualityScanInput,
  DataQualityScanResult,
  DataQualityStatus,
  DataQualitySummary,
} from '@/lib/ai/common/data-quality/types';
import { buildEntityLink } from '@/lib/ai/common/data-quality/route-links';
import { buildDataQualitySummary } from '@/lib/ai/common/data-quality/summary-builder';
import { runDataQualityScan as executeScan } from '@/lib/ai/common/data-quality/scan-engine';

// ---------- permission helpers ----------

type AuthCtx = Awaited<ReturnType<typeof getAuthContext>>;

function canViewDataQuality(ctx: AuthCtx): boolean {
  return (
    hasPermission(ctx, 'ai.data_quality.view') ||
    hasPermission(ctx, 'ai.common.view') ||
    hasPermission(ctx, 'ai.common.admin')
  );
}

function canScanDataQuality(ctx: AuthCtx): boolean {
  return (
    hasPermission(ctx, 'ai.data_quality.scan') ||
    hasPermission(ctx, 'ai.common.admin')
  );
}

function canReviewDataQuality(ctx: AuthCtx): boolean {
  return (
    hasPermission(ctx, 'ai.data_quality.review') ||
    hasPermission(ctx, 'ai.common.admin')
  );
}

// ---------- public actions ----------

export async function isDataQualityMonitorEnabled(): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('erp_ai_feature_flags')
    .select('is_enabled')
    .eq('feature_code', 'ERP_AI_DATA_QUALITY_MONITOR')
    .eq('is_enabled', true)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export async function getDataQualitySummary(
  _input?: DataQualityFindingsFilter
): Promise<{ data: DataQualitySummary | null; error: string | null }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { data: null, error: 'Not authenticated' };
    if (!canViewDataQuality(ctx)) return { data: null, error: 'Insufficient permissions' };

    const summary = await buildDataQualitySummary();
    return { data: summary, error: null };
  } catch (err) {
    return { data: null, error: (err as Error).message };
  }
}

export async function getDataQualityFindings(
  filter?: DataQualityFindingsFilter
): Promise<{ data: DataQualityFinding[]; error: string | null }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { data: [], error: 'Not authenticated' };
    if (!canViewDataQuality(ctx)) return { data: [], error: 'Insufficient permissions' };

    const admin = createAdminClient();
    let query = admin
      .from('erp_ai_data_quality_findings')
      .select('*')
      .is('deleted_at', null)
      .order('detected_at', { ascending: false })
      .limit(filter?.limit ?? 100);

    if (filter?.statuses && filter.statuses.length > 0) {
      query = query.in('status', filter.statuses);
    } else {
      query = query.in('status', ['open', 'reviewed']);
    }

    if (filter?.severities && filter.severities.length > 0) {
      query = query.in('severity', filter.severities);
    }

    if (filter?.entityTypes && filter.entityTypes.length > 0) {
      query = query.in('entity_type', filter.entityTypes);
    }

    if (filter?.ruleCategories && filter.ruleCategories.length > 0) {
      query = query.in('rule_category', filter.ruleCategories);
    }

    if (filter?.offset) {
      query = query.range(filter.offset, filter.offset + (filter.limit ?? 100) - 1);
    }

    const { data, error } = await query;
    if (error) return { data: [], error: error.message };

    const findings: DataQualityFinding[] = (data ?? []).map((f) => ({
      ...f,
      source_link: buildEntityLink(f.entity_type, f.entity_id),
    }));

    return { data: findings, error: null };
  } catch (err) {
    return { data: [], error: (err as Error).message };
  }
}

export async function getDataQualityFindingDetail(
  id: number
): Promise<{ data: DataQualityFinding | null; error: string | null }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { data: null, error: 'Not authenticated' };
    if (!canViewDataQuality(ctx)) return { data: null, error: 'Insufficient permissions' };

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('erp_ai_data_quality_findings')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) return { data: null, error: error.message };
    if (!data) return { data: null, error: 'Finding not found' };

    const finding: DataQualityFinding = {
      ...data,
      source_link: buildEntityLink(data.entity_type, data.entity_id),
    };

    return { data: finding, error: null };
  } catch (err) {
    return { data: null, error: (err as Error).message };
  }
}

export async function runDataQualityScan(
  input?: DataQualityScanInput
): Promise<{ data: DataQualityScanResult | null; error: string | null }> {
  try {
    const enabled = await isDataQualityMonitorEnabled();
    if (!enabled && !input?.dryRun) {
      return { data: null, error: 'Data Quality Monitor feature is disabled' };
    }

    const ctx = await getAuthContext();
    if (!ctx.profile) return { data: null, error: 'Not authenticated' };
    if (!canScanDataQuality(ctx)) return { data: null, error: 'Insufficient permissions to run scan' };

    const userId = ctx.profile.id;

    await logAudit({
      module_code: 'AI',
      entity_name: 'erp_ai_data_quality_findings',
      entity_id: null,
      entity_reference: 'DQ-SCAN',
      action: 'data_quality_scan_started',
      new_values: {
        entity_types: input?.entityTypes ?? 'all',
        dry_run: input?.dryRun ?? false,
      },
    });

    const result = await executeScan(input ?? { scope: 'existing_scope' }, userId);

    await logAudit({
      module_code: 'AI',
      entity_name: 'erp_ai_data_quality_findings',
      entity_id: null,
      entity_reference: 'DQ-SCAN',
      action: 'data_quality_scan_completed',
      new_values: {
        duration_ms: result.duration_ms,
        total_findings_detected: result.total_findings_detected,
        new_findings: result.new_findings,
        resolved_findings: result.resolved_findings,
        dry_run: result.dry_run,
      },
    });

    return { data: result, error: null };
  } catch (err) {
    return { data: null, error: (err as Error).message };
  }
}

async function updateFindingStatus(
  findingId: number,
  newStatus: DataQualityStatus,
  auditAction: string,
  eventType: string,
  note: string,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: 'Not authenticated' };
    if (!canReviewDataQuality(ctx)) return { success: false, error: 'Insufficient permissions' };

    const userId = ctx.profile.id;
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updated_at: now,
    };

    if (newStatus === 'reviewed') {
      updatePayload.reviewed_at = now;
      updatePayload.reviewed_by = userId;
    } else if (newStatus === 'resolved') {
      updatePayload.resolved_at = now;
      updatePayload.resolved_by = userId;
    }

    const { error } = await admin
      .from('erp_ai_data_quality_findings')
      .update(updatePayload)
      .eq('id', findingId)
      .is('deleted_at', null);

    if (error) return { success: false, error: error.message };

    await admin.from('erp_ai_data_quality_finding_events').insert({
      finding_id: findingId,
      event_type: eventType,
      event_note: note,
      safe_metadata_json: { new_status: newStatus },
      created_by: userId,
    });

    await logAudit({
      module_code: 'AI',
      entity_name: 'erp_ai_data_quality_findings',
      entity_id: findingId,
      entity_reference: `DQ-FINDING-${findingId}`,
      action: auditAction,
      new_values: {
        finding_id: findingId,
        new_status: newStatus,
      },
    });

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function reviewDataQualityFinding(
  findingId: number
): Promise<{ success: boolean; error: string | null }> {
  return updateFindingStatus(findingId, 'reviewed', 'data_quality_finding_reviewed', 'reviewed', 'Marked as reviewed');
}

export async function dismissDataQualityFinding(
  findingId: number,
  note?: string
): Promise<{ success: boolean; error: string | null }> {
  return updateFindingStatus(findingId, 'dismissed', 'data_quality_finding_dismissed', 'dismissed', note ?? 'Dismissed by user');
}

export async function markDataQualityFindingFalsePositive(
  findingId: number,
  note?: string
): Promise<{ success: boolean; error: string | null }> {
  return updateFindingStatus(findingId, 'false_positive', 'data_quality_finding_false_positive', 'false_positive', note ?? 'Marked as false positive');
}

export async function reopenDataQualityFinding(
  findingId: number,
  note?: string
): Promise<{ success: boolean; error: string | null }> {
  return updateFindingStatus(findingId, 'open', 'data_quality_finding_reopened', 'reopened', note ?? 'Reopened by user');
}

export async function getDataQualityFindingEvents(
  findingId: number
): Promise<{ data: DataQualityFindingEvent[]; error: string | null }> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { data: [], error: 'Not authenticated' };
    if (!canViewDataQuality(ctx)) return { data: [], error: 'Insufficient permissions' };

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('erp_ai_data_quality_finding_events')
      .select('*')
      .eq('finding_id', findingId)
      .order('created_at', { ascending: true });

    if (error) return { data: [], error: error.message };

    return { data: (data ?? []) as DataQualityFindingEvent[], error: null };
  } catch (err) {
    return { data: [], error: (err as Error).message };
  }
}
