/** Read-only evidence assessment. Never schedules backups, removes snapshots,
 * sends alerts or authorizes a restore. Independent proof remains required. */
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : NaN;
const positive = value => Number.isSafeInteger(value) && value > 0;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
export function assessRecoveryTargets(policy, evidence, now = Date.now()) {
  if (!policy || !['rtoMs','rpoMs','dailyRetentionDays','hourlyRetentionHours','operatorAckMs'].every(k=>positive(policy[k])) || !nonempty(policy.operatorId) || !Number.isFinite(now)) throw new Error('Explicit finite recovery targets and intended operator required');
  const gaps = new Set();
  const points = Array.isArray(evidence?.points) ? evidence.points : [];
  const accepted = [], ids = new Set();
  for (const point of points) {
    const cutoff = stamp(point?.cutoff), completed = stamp(point?.completedAt);
    if (typeof point?.id !== 'string' || !point.id || ids.has(point.id) || !Number.isFinite(cutoff) || !Number.isFinite(completed) || cutoff > now || completed > now || completed < cutoff) { gaps.add('invalid_or_duplicate_recovery_point'); continue; }
    ids.add(point.id);
    if (point.databaseIntegrityVerified !== true || point.objectIntegrityVerified !== true || point.crossServiceConsistencyVerified !== true || point.encryptionVerified !== true || point.independentCopyVerified !== true) { gaps.add('incomplete_recovery_point'); continue; }
    accepted.push({cutoff, completed});
  }
  accepted.sort((a,b)=>a.cutoff-b.cutoff);
  const latest = accepted.at(-1);
  if (!latest || now-latest.cutoff>policy.rpoMs) gaps.add('recovery_point_too_old_or_missing');
  // Check the whole rolling interval, not just the latest backup timestamp.
  const hourlyStart=now-policy.hourlyRetentionHours*3600000;
  const before=accepted.filter(p=>p.cutoff<=hourlyStart).at(-1);
  if (!before || hourlyStart-before.cutoff>policy.rpoMs) gaps.add('hourly_history_incomplete');
  const relevant=accepted.filter(p=>p.cutoff>hourlyStart);
  let previous=before?.cutoff??hourlyStart;
  for (const point of relevant) { if (point.cutoff-previous>policy.rpoMs) gaps.add('hourly_history_gap'); previous=point.cutoff; }
  if (now-previous>policy.rpoMs) gaps.add('hourly_history_gap');
  // A backup is available only after its independent copy is verified. Check
  // just BEFORE each completion: starting once per hour cannot guarantee a
  // one-hour RPO when copying and verification take additional time.
  const completedOrder = [...accepted].sort((a,b)=>a.completed-b.completed);
  let availableCutoff = -Infinity;
  for (const point of completedOrder) {
    if (point.completed>hourlyStart && point.completed-availableCutoff>policy.rpoMs) gaps.add('recovery_availability_gap');
    availableCutoff=Math.max(availableCutoff,point.cutoff);
  }
  const atStart=accepted.filter(point=>point.completed<=hourlyStart).at(-1);
  if (!atStart || hourlyStart-atStart.cutoff>policy.rpoMs || now-availableCutoff>policy.rpoMs) gaps.add('recovery_availability_gap');
  for(let day=0;day<policy.dailyRetentionDays;day++){
    const end=now-day*86400000,start=end-86400000;
    if (!accepted.some(p=>p.cutoff>start&&p.cutoff<=end)) {gaps.add('daily_history_incomplete');break;}
  }
  const drill=evidence?.drill,detected=stamp(drill?.detectedAt),verified=stamp(drill?.verifiedAt);
  const validDrill=nonempty(drill?.incidentId)&&Number.isFinite(detected)&&Number.isFinite(verified)&&verified>=detected&&verified<=now&&drill?.scope==='managed-isolated'&&drill?.allRequiredComponentsVerified===true&&drill?.permissionsAndRevocationsVerified===true;
  if (!validDrill) gaps.add('managed_recovery_unverified');
  else if(verified-detected>policy.rtoMs) gaps.add('recovery_time_exceeded');
  const operator=evidence?.operator,alert=stamp(operator?.alertedAt),ack=stamp(operator?.acknowledgedAt);
  if(!validDrill||operator?.incidentId!==drill.incidentId||operator?.operatorId!==policy.operatorId||operator?.intendedPersonConfirmed!==true||operator?.receiptConfirmed!==true||operator?.exerciseCompleted!==true||!Number.isFinite(alert)||!Number.isFinite(ack)||alert<detected||ack<alert||ack>verified) gaps.add('operator_exercise_unverified');
  else if(ack-alert>policy.operatorAckMs) gaps.add('operator_acknowledgement_late');
  return {state:gaps.size?'GATES_OPEN':'RECORDED_EVIDENCE_MEETS_TARGETS',gaps:[...gaps].sort(),verifiedPoints:accepted.length,latestRecoveryAgeMs:latest?now-latest.cutoff:null,productionAccepted:false};
}
