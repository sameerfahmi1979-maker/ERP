/**
 * OUTPUT.1 — Global Output Framework feature flags (server-side, env-driven).
 *
 * Every flag defaults to the SAFE state so that a fresh deployment without any
 * configuration behaves exactly like the pre-framework system. Flags exist to
 * provide instant rollback without code changes (v6.1 rollback discipline).
 */

function flag(name: string, defaultValue = false): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return defaultValue;
  return v === "true" || v === "1";
}

/** Master switch for the new issuance coordinator path (OUTPUT.2+). */
export function isOutputCoordinatorEnabled(): boolean {
  return flag("OUTPUT_COORDINATOR_ENABLED", true);
}

/** Official issuance activation — gated on OUTPUT.5 UAT (WP9). */
export function isOfficialIssuanceEnabled(): boolean {
  return flag("OUTPUT_OFFICIAL_ISSUANCE_ENABLED", false);
}

// OUTPUT_TEMPLATE_STUDIO_ENABLED was removed in OFFICIAL DOCS.1 Package 9:
// the Template Studio editor code was deleted after Gate 8. Official documents
// are fixed code-based templates under src/lib/official-documents.

/** Operations Console exposure (OUTPUT.6) — gated on its UAT slice. */
export function isOutputOpsConsoleEnabled(): boolean {
  return flag("OUTPUT_OPS_CONSOLE_ENABLED", true);
}

/**
 * Report schedules UI — HIDDEN by default per v6.1 until the schedules worker
 * (OUTPUT.7 / WP11) passes its delivery UAT. Schedule rows and history are preserved.
 */
export function isSchedulesUiEnabled(): boolean {
  return flag("OUTPUT_SCHEDULES_UI_ENABLED", false);
}

/**
 * Schedules processing worker (OUTPUT.7 / WP11). OFF by default — enable only
 * after WORKER_SECRET is configured and the delivery UAT gate passes.
 */
export function isSchedulesWorkerEnabled(): boolean {
  return flag("OUTPUT_SCHEDULES_WORKER_ENABLED", false);
}

/** dms-temp cleanup real-deletion mode. Dry-run is always available. */
export function isDmsTempCleanupDeletionEnabled(): boolean {
  return flag("DMS_TEMP_CLEANUP_DELETE_ENABLED", false);
}

/** Legacy standalone HR employment-letter generator rollback flag (WP5). */
export function isLegacyEmploymentLetterPathEnabled(): boolean {
  return flag("OUTPUT_LEGACY_EMPLOYMENT_LETTER_ENABLED", false);
}
