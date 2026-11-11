export type PreparationProgress = {
  stage: 'waiting' | 'reading' | 'analysing' | 'ready' | 'held' | 'retry_wait' | 'applied' | 'cancelled';
  admitted: boolean; workerHealthy: boolean; createdAt: string; startedAt: string | null; updatedAt: string; errorCode: string | null;
  holdReason?: 'paused' | 'daily_limit' | null;
};
export function preparationIsRunning(progress: PreparationProgress | null): boolean {
 return !!progress && progress.admitted && progress.workerHealthy && !progress.holdReason
  && (progress.stage === 'reading' || progress.stage === 'analysing');
}
export function preparationProgressMessage(progress: PreparationProgress): string {
  if (progress.stage === 'ready') return 'Ready for review. Check the suggestions before applying them.';
  if (progress.stage === 'held') {
    const reasons: Record<string, string> = {
      provider_output_invalid: 'AI returned information in an unsupported format.',
      provider_output_incomplete: 'AI stopped before completing its response.',
      provider_refusal: 'The AI provider declined this analysis.',
      provider_request_rejected: 'The AI provider rejected the analysis request. An administrator needs to check its configuration.',
      provider_authentication: 'The AI provider could not verify its credentials. An administrator needs to check the connection.',
      provider_timeout: 'The AI provider did not respond in time. Its outcome needs checking before another run.',
      network_error: 'The AI connection was interrupted. Its outcome needs checking before another run.',
      provider_rate_limit: 'The AI provider reached its request limit.',
      provider_unavailable: 'The AI provider is temporarily unavailable.',
      quality_evaluation_held: 'This analysis is held by the configured model approval rules.',
      preparation_outcome_unconfirmed: 'The earlier analysis outcome is unconfirmed. An administrator must reconcile it before another run.',
      source_changed: 'The document or your access changed during processing. Reload the saved review.',
      database_error: 'The processing result could not be confirmed as saved. Recover the same request.',
    };
    const reason = progress.errorCode && Object.hasOwn(reasons, progress.errorCode) ? reasons[progress.errorCode] : null;
    return reason ? `${reason} No document changes were saved. Your request and original file are retained; do not upload again. Reference: ${progress.errorCode}.`
      : 'Processing needs attention. Your request and original file are retained; do not upload again.';
  }
  if (progress.stage === 'applied') return 'Your reviewed changes were saved.';
  if (progress.stage === 'cancelled') return 'Processing cancelled. Accepted information is unchanged.';
  if (!progress.admitted) return 'This earlier request is saved but has not been scheduled. Resume it to process the same request.';
  if (progress.holdReason === 'paused') return 'AI processing is paused by an administrator. Your request is saved.';
  if (progress.holdReason === 'daily_limit') return 'The configured daily processing limit has been reached. Your saved request will wait for capacity.';
  if (!progress.workerHealthy) return 'The processing service is not responding. Your request is saved and will wait safely for the service.';
  if (progress.stage === 'retry_wait') return 'Waiting for a scheduled retry. The same request will be recovered safely.';
  if (progress.stage === 'reading') return 'Reading the original file…';
  if (progress.stage === 'analysing') return 'Analysing the file and preparing suggestions…';
  return 'Waiting for an available processing slot. You can continue working.';
}
