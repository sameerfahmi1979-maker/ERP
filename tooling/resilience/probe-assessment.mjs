/** Aggregate-only monitoring interpretation. Thresholds are explicit operator
 * inputs, not a hidden production SLA. Never treats HTTP 200 as proof of health. */
export function assessQueueProbe(probe, options) {
  const { now = Date.now(), maxAgeMs, queueAgeSeconds } = options ?? {};
  if (!Number.isFinite(now) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1 || !Number.isSafeInteger(queueAgeSeconds) || queueAgeSeconds < 1) throw new Error('Explicit monitoring thresholds required');
  const invalid = () => ({ severity:'critical',codes:['probe_invalid'],providerDeliveryVerified:false });
  if (!probe || !['ready','attention','unready','paused'].includes(probe.status) || typeof probe.workerEnabled !== 'boolean') return invalid();
  const observed = Date.parse(probe.observedAt ?? '');
  if (!Number.isFinite(observed) || observed > now + 5000 || now - observed > maxAgeMs) return {severity:'critical',codes:['probe_stale_or_invalid'],providerDeliveryVerified:false};
  const keys=['duePending','processing','unknown','paused','expiredLeases'];
  if (keys.some(k => !Number.isSafeInteger(probe.counts?.[k]) || probe.counts[k] < 0)) return invalid();
  if (probe.oldestDueAgeSeconds !== null && (!Number.isSafeInteger(probe.oldestDueAgeSeconds) || probe.oldestDueAgeSeconds < 0)) return invalid();
  if (probe.counts.duePending > 0 && probe.oldestDueAgeSeconds === null) return invalid();
  const codes=[];
  if (probe.status==='unready') codes.push('worker_unready');
  if (probe.configurationIssues !== undefined) {
    if (!Array.isArray(probe.configurationIssues) || probe.configurationIssues.some(x=>typeof x!=='string')) return invalid();
    if (probe.configurationIssues.length) codes.push('provider_configuration_requires_review');
  }
  if (probe.counts.unknown>0) codes.push('delivery_reconciliation_required');
  if (probe.counts.expiredLeases>0) codes.push('lease_recovery_required');
  if (probe.oldestDueAgeSeconds!==null && probe.oldestDueAgeSeconds>=queueAgeSeconds && probe.counts.duePending>0) codes.push('queue_age_exceeded');
  if (!probe.workerEnabled && probe.counts.duePending>0) codes.push('paused_with_due_work');
  return {severity:codes.some(c=>['worker_unready','delivery_reconciliation_required','provider_configuration_requires_review'].includes(c))?'critical':codes.length?'warning':'none',codes,providerDeliveryVerified:false};
}
