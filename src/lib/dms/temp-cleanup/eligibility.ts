/**
 * OUTPUT.1 — dms-temp cleanup eligibility rules (pure, unit-testable).
 *
 * v6.1 upgrade: cleanup is a governed, mandatory deliverable — settings-driven
 * retention, legal-hold prefixes, manual retain list, dry-run default, and a
 * persisted run log. This module contains the decision logic only; storage and
 * DB side effects live in the server action.
 */

export const CLEANABLE_STATUSES = ["completed", "cancelled", "failed", "expired"] as const;
export type CleanableStatus = (typeof CLEANABLE_STATUSES)[number];

export interface DmsTempCleanupSettings {
  enabled: boolean;
  retention_hours_completed: number;
  retention_hours_cancelled: number;
  retention_hours_failed: number;
  retention_hours_expired: number;
  batch_size: number;
  /** Storage-path prefixes under legal hold — never deleted. */
  legal_hold_prefixes: string[];
  /** Explicit session ids retained by an administrator. */
  manual_retain_session_ids: number[];
}

export interface CleanupSessionInput {
  id: number;
  status: string;
  temp_storage_path: string | null;
  temp_cleaned_at: string | null;
  uploaded_at: string;
}

export type SkipReason =
  | "active_status"
  | "already_cleaned"
  | "no_temp_path"
  | "too_recent"
  | "legal_hold_prefix"
  | "manual_retain";

export type EligibilityDecision =
  | { eligible: true }
  | { eligible: false; reason: SkipReason };

export function resolveRetentionHours(
  status: CleanableStatus,
  settings: DmsTempCleanupSettings
): number {
  switch (status) {
    case "completed": return settings.retention_hours_completed;
    case "cancelled": return settings.retention_hours_cancelled;
    case "failed":    return settings.retention_hours_failed;
    case "expired":   return settings.retention_hours_expired;
  }
}

export function evaluateSessionEligibility(
  session: CleanupSessionInput,
  settings: DmsTempCleanupSettings,
  now: Date
): EligibilityDecision {
  if (!CLEANABLE_STATUSES.includes(session.status as CleanableStatus)) {
    return { eligible: false, reason: "active_status" };
  }
  if (session.temp_cleaned_at !== null) {
    return { eligible: false, reason: "already_cleaned" };
  }
  if (!session.temp_storage_path) {
    return { eligible: false, reason: "no_temp_path" };
  }
  if (settings.manual_retain_session_ids.includes(session.id)) {
    return { eligible: false, reason: "manual_retain" };
  }
  const path = session.temp_storage_path;
  if (settings.legal_hold_prefixes.some((p) => p.length > 0 && path.startsWith(p))) {
    return { eligible: false, reason: "legal_hold_prefix" };
  }
  const retention = resolveRetentionHours(session.status as CleanableStatus, settings);
  const ageHours = (now.getTime() - new Date(session.uploaded_at).getTime()) / 3_600_000;
  if (ageHours < retention) {
    return { eligible: false, reason: "too_recent" };
  }
  return { eligible: true };
}

/**
 * Orphan reconciliation (report-only in OUTPUT.1): storage folders under
 * sessions/ whose session_code has no matching dms_upload_sessions row.
 */
export function findOrphanFolders(
  storageFolderCodes: string[],
  knownSessionCodes: Set<string>
): string[] {
  return storageFolderCodes.filter((code) => !knownSessionCodes.has(code));
}
