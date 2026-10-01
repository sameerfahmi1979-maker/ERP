import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { boundedQuery, F09_LIMITS } from "./runtime-limits";

/** Authenticated, aggregate-only, no-work probe. This is NOT proof of a running
 * scheduler, working provider credentials, inbox delivery or migration parity. */
export async function getQueueReadiness(enabled: boolean) {
  const db = createAdminClient();
  const now = new Date().toISOString();
  const countQuery = () => db.from("erp_email_queue").select("id", { count: "exact", head: true }).is("deleted_at", null);
  const [pending, processing, unknown, paused, expired, oldest, activity, providers] = await Promise.all([
    boundedQuery(countQuery().eq("status", "pending").is("paused_at", null).lte("scheduled_for", now)
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)),
    boundedQuery(countQuery().eq("status", "processing")),
    boundedQuery(countQuery().eq("status", "delivery_unknown")),
    boundedQuery(countQuery().eq("status", "pending").not("paused_at", "is", null)),
    boundedQuery(countQuery().eq("status", "processing").lte("lease_expires_at", now)),
    boundedQuery(db.from("erp_email_queue").select("scheduled_for").is("deleted_at", null)
      .eq("status", "pending").is("paused_at", null).lte("scheduled_for", now)
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`).order("scheduled_for").limit(1)),
    boundedQuery(db.from("erp_email_attempt_events").select("created_at").order("id", { ascending: false }).limit(1)),
    boundedQuery(db.from("erp_email_provider_configs")
      .select("provider_type,auth_mode,send_mode,throttle_per_minute,daily_send_limit,is_default")
      .eq("is_active", true).eq("is_enabled", true).is("deleted_at", null).limit(101)),
  ]);
  const results = [pending, processing, unknown, paused, expired, oldest, activity, providers];
  if (results.some(result => result.error) || [pending, processing, unknown, paused, expired].some(result => result.count === null))
    throw new Error("Queue readiness unavailable");
  const configurations = providers.data ?? [];
  const configurationIssues: string[] = [];
  if (configurations.length === 0) configurationIssues.push("no_enabled_provider");
  if (configurations.length > 100) configurationIssues.push("provider_inventory_limit_exceeded");
  if (configurations.filter(p => p.is_default).length !== 1) configurationIssues.push("default_provider_missing_or_ambiguous");
  if (configurations.some(p => !Number.isSafeInteger(p.throttle_per_minute) || Number(p.throttle_per_minute) < 1
    || !Number.isSafeInteger(p.daily_send_limit) || Number(p.daily_send_limit) < 1))
    configurationIssues.push("finite_provider_budgets_required");
  if (configurations.some(p => p.provider_type !== "microsoft_graph" || p.auth_mode !== "client_credentials" || p.send_mode !== "graph_send_mail"))
    configurationIssues.push("unsupported_provider_configuration");
  const alerts: string[] = [];
  if (unknown.count! > 0) alerts.push("unknown_outcomes_require_reconciliation");
  if (expired.count! > 0) alerts.push("expired_leases_require_recovery");
  const first = oldest.data?.[0]?.scheduled_for;
  const oldestDueAgeSeconds = first ? Math.max(0, Math.floor((Date.parse(now) - Date.parse(first)) / 1_000)) : null;
  return {
    status: !enabled ? "paused" : configurationIssues.length ? "unready" : alerts.length ? "attention" : "ready",
    workerEnabled: enabled,
    observedAt: now,
    counts: { duePending: pending.count, processing: processing.count, unknown: unknown.count, paused: paused.count, expiredLeases: expired.count },
    oldestDueAgeSeconds,
    lastAttemptEventAt: activity.data?.[0]?.created_at ?? null,
    heartbeatVerified: false,
    providerCredentialsVerified: false,
    inboxDeliveryVerified: false,
    configurationIssues, alerts,
    minimumCallerTimeoutMs: F09_LIMITS.callerTimeoutMs,
  };
}
