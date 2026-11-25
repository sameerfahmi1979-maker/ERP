import { createHash } from 'node:crypto';
import { maxBatchSize, runDmsPilot } from './dms-pilot.mjs';

export async function runContinuousIntake({ config, client, graph, ledger, signal, runPilot = runDmsPilot }) {
  const receipts = [];
  for (let count = 0; count < maxBatchSize && !signal?.aborted; count++) {
    const item = await ledger.claimPdf();
    if (!item) break;
    const advance = (step, hash) => ledger.advancePdf(item, step, hash);
    let status;
    try {
      const outsidePilot = config.agentCenterSharePointFlow &&
        (item.item_id !== config.itemId || item.version !== config.sourceVersion);
      status = await advance(outsidePilot ? 'defer' : 'inspect');
      if (status === 'download') {
        const source = await graph.readDiscoveredPdf(item.item_id, item.version, signal,
          config.agentCenterSharePointFlow ? config.etag : undefined);
        if (!source.bytes.subarray(0, 1024).includes('%PDF-')) {
          receipts.push(await advance('invalid_pdf'));
          continue;
        }
        const sha256 = createHash('sha256').update(source.bytes).digest('hex');
        if (config.agentCenterSharePointFlow && sha256 !== config.sha256) {
          const deferred = await advance('defer');
          receipts.push(deferred);
          if (deferred === 'paused') break;
          continue;
        }
        let routedCompanyId;
        if (config.employerCompanyIds?.length) {
          await client.profile();
          const route = await client.routeEmployer({
            operationId: item.operation_id, sharePointLease: item.lease_token, sha256, byteCount: source.bytes.length,
          }, source.bytes);
          if (route.status === 'held') {
            receipts.push(route.status);
            continue;
          }
          if (route.status !== 'bound' || ![config.companyId, ...config.employerCompanyIds].includes(route.companyId)) {
            throw new Error('pilot_employer_route_unconfirmed');
          }
          routedCompanyId = route.companyId;
        }
        status = await advance('prepare', sha256);
        if (status === 'ready') {
          const result = await runPilot({
            config: { ...config, routedCompanyId, sha256, operationId: item.operation_id },
            client, graph, source, signal, sharePointLease: item.lease_token,
            ledger: { read: async () => ({ paused: await advance('fence') !== 'ready' }) },
          });
          if (result.status === 'admission_retained') {
            // Leave this isolated receipt for a future claim with the same
            // operation. The remaining worker write boundaries are held.
            receipts.push(result.status);
            break;
          }
          if (config.agentCenterSharePointFlow && ['paused', 'review_pending'].includes(result.status)) {
            // The protected publication already committed the scoped work and
            // review notification event. Never advance it through the legacy path.
            receipts.push(result.status);
            break;
          }
          status = result.status === 'duplicate' ? await advance('prepare', sha256) : await advance('inspect');
        }
      }
      if (['ready', 'waiting', 'download'].includes(status)) status = await advance('defer');
    } catch {
      // The operation is retained. Reconciliation checks the original ERP receipt on retry.
      status = await advance('defer');
    }
    receipts.push(status);
    if (status === 'paused') break;
  }
  return receipts;
}
