import { createHash } from 'node:crypto';
import { ConnectionError } from './connection.mjs';

const erpEndpoint = 'https://erp.algt.net/api/mobile/dms/v1';
const storageOrigin = 'https://mmiefuieduzdiiwnqpie.supabase.co';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const bearerFormat = /^[\w-]+\.[\w-]+\.[\w-]+$/;
const sessionCode = /^[A-F0-9]{32}$/i;
const fingerprint = /^[a-f0-9]{64}$/;
const batchTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
export const maxBatchSize = 3;
const maxBytes = 3 * 1024 * 1024;
const intakeStatuses = new Set(['uploading', 'uploaded', 'ocr_processing', 'ai_processing',
  'review_pending', 'review_in_progress', 'failed', 'ocr_failed', 'ai_failed']);

export function readDmsPilotConfig(env) {
  if (!env.AGENT_DMS_PILOT) return null;
  const isBatch = env.AGENT_DMS_PILOT === 'small_batch';
  const continuous = env.AGENT_DMS_PILOT === 'continuous';
  if (!continuous && !isBatch && env.AGENT_DMS_PILOT !== 'one_file') throw new ConnectionError('invalid_pilot_mode');
  const agentCenterAdmission = env.PILOT_AGENT_CENTER_ADMISSION === '1';
  if (agentCenterAdmission && !continuous) throw new ConnectionError('agent_center_admission_requires_continuous');
  const config = {
    itemId: env.PILOT_GRAPH_ITEM_ID,
    etag: env.PILOT_GRAPH_ETAG,
    sha256: env.PILOT_FILE_SHA256,
    authUserId: env.PILOT_ERP_AUTH_USER_ID,
    operationId: env.PILOT_OPERATION_ID,
    companyId: Number(env.PILOT_ERP_COMPANY_ID),
    email: env.PILOT_ERP_EMAIL,
    password: env.PILOT_ERP_PASSWORD,
    oneFileSession: env.PILOT_ERP_ONE_FILE_SESSION,
    continuous,
    agentCenterAdmission,
  };
  if (!uuid.test(config.authUserId ?? '') ||
      !Number.isSafeInteger(config.companyId) || config.companyId <= 0 ||
      (config.oneFileSession
        ? !bearerFormat.test(config.oneFileSession) || Boolean(config.password)
        : !config.email || !config.password)) {
    throw new ConnectionError('pilot_configuration_incomplete');
  }
  if (continuous) {
    if (config.oneFileSession) throw new ConnectionError('continuous_requires_scoped_login');
  } else if (isBatch) {
    const from = env.PILOT_BATCH_FROM;
    const through = env.PILOT_BATCH_THROUGH;
    const offset = env.PILOT_BATCH_OFFSET ?? '0';
    const approvedHashes = (env.PILOT_BATCH_ALGT_SHA256 ?? '').split(',');
    if (!config.oneFileSession || !batchTimestamp.test(from ?? '') || !batchTimestamp.test(through ?? '') ||
        !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(through)) || from >= through ||
        (offset !== '0' && offset !== String(maxBatchSize)) ||
        approvedHashes.length > maxBatchSize || !approvedHashes.every(hash => fingerprint.test(hash)) ||
        new Set(approvedHashes).size !== approvedHashes.length) {
      throw new ConnectionError('pilot_batch_configuration_incomplete');
    }
    config.batch = Object.freeze({ from, through, offset: Number(offset), approvedHashes: Object.freeze(approvedHashes) });
  } else if (!/^[A-Za-z0-9_!-]{1,256}$/.test(config.itemId ?? '') ||
      typeof config.etag !== 'string' || !config.etag || config.etag.length > 512 ||
      !fingerprint.test(config.sha256 ?? '') || !uuid.test(config.operationId ?? '')) {
    throw new ConnectionError('pilot_configuration_incomplete');
  }
  return Object.freeze(config);
}

export function createDmsPilotClient(config, { fetch = globalThis.fetch, shutdown } = {}) {
  let token = config.oneFileSession;
  let expiresAt = 0;
  const signal = ms => shutdown
    ? AbortSignal.any([shutdown, AbortSignal.timeout(ms)])
    : AbortSignal.timeout(ms);

  async function post(op, options = {}, timeout = 20_000) {
    let response;
    try {
      response = await fetch(erpEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ op, ...options }),
        redirect: 'error',
        signal: signal(timeout),
      });
    } catch {
      throw new ConnectionError(`pilot_${op}_unconfirmed`);
    }
    try {
      const result = await response.json();
      if (response.ok && result.success === true) return result.data;
    } catch {
      // ERP response bodies may include source details. Return a fixed reason.
    }
    throw new ConnectionError(`pilot_${op}_http_${response.status}`);
  }

  return {
    async profile() {
      if (!token || (config.continuous && expiresAt < Date.now() + 240_000)) {
        token = undefined;
        const auth = await post('login', { email: config.email, password: config.password });
        if (auth?.userId !== config.authUserId || !bearerFormat.test(auth?.accessToken ?? '')) {
          throw new ConnectionError('pilot_actor_mismatch');
        }
        token = auth.accessToken;
        expiresAt = Number(auth.expiresAt) * 1000 || 0;
      }
      return post('profile');
    },
    async scopes() {
      const scope = await post('scopes', { search: '', after: null });
      if (scope?.more || !Array.isArray(scope?.rows)) throw new ConnectionError('pilot_scope_unavailable');
      return scope.rows;
    },
    admit: request => post('admit', { request }),
    admitSharePoint: (request, sharePointLease) => post('admitSharePoint', { request, sharePointLease }),
    async upload(admission, bytes) {
      let target;
      try {
        target = new URL(admission.uploadUrl, storageOrigin);
      } catch {
        throw new ConnectionError('pilot_invalid_storage_destination');
      }
      if (target.origin !== storageOrigin || target.username || target.password || target.hash ||
          !target.pathname.startsWith(`/storage/v1/object/upload/sign/dms-temp/sessions/${admission.code}/`) ||
          !target.searchParams.get('token')) {
        throw new ConnectionError('pilot_invalid_storage_destination');
      }
      let response;
      try {
        response = await fetch(target, {
          method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' },
          body: bytes, redirect: 'error', signal: signal(40_000),
        });
      } catch {
        throw new ConnectionError('pilot_transfer_unconfirmed');
      }
      await response.body?.cancel().catch(() => {});
      if (!response.ok) throw new ConnectionError(`pilot_transfer_http_${response.status}`);
    },
    complete: (request, sessionId) => post('complete', { request, sessionId }),
    intake: code => post('intake', { code }),
    start: sessionId => post('start', { sessionId }, 180_000),
  };
}

export async function runDmsPilot({ config, client, graph, ledger, signal, source, sharePointLease }) {
  if (config.agentCenterAdmission && !uuid.test(sharePointLease ?? '')) {
    throw new ConnectionError('pilot_missing_admission_lease');
  }
  const canWrite = async () => !signal?.aborted && !(await ledger.read()).paused;
  if (!await canWrite()) return { status: 'paused' };
  const profile = await client.profile();
  if (profile?.userId !== config.authUserId || profile.capabilities?.upload !== true ||
      profile.capabilities?.preview !== true || profile.capabilities?.review !== true ||
      profile.capabilities?.numbering !== false) {
    throw new ConnectionError('pilot_actor_mismatch');
  }
  const scopes = await client.scopes();
  const companyWide = scopes.filter(scope => scope.companyId === config.companyId && scope.branchId === null);
  // Temporary pilot sessions may have broader ERP access. Admission still
  // requires the configured company-wide scope and the approved source bytes.
  if (companyWide.length !== 1 || scopes.some(scope => (!config.oneFileSession && scope.companyId !== config.companyId) ||
      (scope.branchId !== null && (!Number.isSafeInteger(scope.branchId) || scope.branchId <= 0)))) {
    throw new ConnectionError('pilot_scope_mismatch');
  }
  const { name, bytes } = source ?? await graph.readApprovedPdf(config.itemId, config.etag, signal);
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > maxBytes ||
      createHash('sha256').update(bytes).digest('hex') !== config.sha256) {
    throw new ConnectionError('pilot_fingerprint_mismatch');
  }
  if (typeof name !== 'string' || !/\.pdf$/i.test(name) || [...name].length > 500 ||
      /[\u0000-\u001f\u007f-\u009f]/u.test(name)) throw new ConnectionError('pilot_filename_invalid');

  const request = {
    version: 1, operationId: config.operationId, authUserId: config.authUserId, context: null,
    scope: { companyId: config.companyId, branchId: null },
    metadata: { original_filename: name, mime_type: 'application/pdf', file_size_bytes: bytes.length, sha256_hash: config.sha256 },
  };
  if (!await canWrite()) return { status: 'paused' };
  if (config.agentCenterAdmission) {
    const receipt = await client.admitSharePoint(request, sharePointLease);
    if (!Number.isSafeInteger(receipt?.id) || receipt.id <= 0 || receipt.operationId !== request.operationId ||
        typeof receipt.replayed !== 'boolean') throw new ConnectionError('pilot_admission_unconfirmed');
    return { status: 'admission_retained', sessionId: receipt.id };
  }
  const admission = await client.admit(request);
  if (admission?.duplicate === true) return { status: 'duplicate' };
  if (!Number.isSafeInteger(admission?.id) || admission.id <= 0 || !sessionCode.test(admission?.code ?? '')) {
    throw new ConnectionError('pilot_admission_unconfirmed');
  }
  const { id, code, uploadUrl } = admission;
  const read = async () => {
    const intake = await client.intake(code);
    if (intake?.id !== id || intake.code !== code || intake.documentId !== null || intake.duplicate ||
        !intakeStatuses.has(intake.status)) {
      throw new ConnectionError('pilot_intake_mismatch');
    }
    return intake.status;
  };
  if (uploadUrl) {
    if (!await canWrite()) return { status: 'paused' };
    await client.upload(admission, bytes);
    if (!await canWrite()) return { status: 'paused' };
    await client.complete(request, id);
  }
  let status = await read();
  if (status === 'uploaded') {
    if (!await canWrite()) return { status: 'paused' };
    try {
      await client.start(id);
    } catch (error) {
      status = await read();
      if (status === 'uploaded') throw error;
      return { status, sessionId: id, sessionCode: code };
    }
    status = await read();
  }
  return { status, sessionId: id, sessionCode: code };
}

export async function runDmsBatch({ config, client, graph, ledger, signal }) {
  const items = await ledger.batchCandidates(config.batch);
  if (items.length > maxBatchSize) throw new ConnectionError('pilot_batch_overflow');
  const approved = new Set(config.batch.approvedHashes);
  const processed = new Set();
  const receipts = [];
  for (const [index, item] of items.entries()) {
    const position = index + 1;
    if (signal?.aborted || (await ledger.read()).paused) {
      receipts.push({ position, status: 'paused' });
      break;
    }
    if (!item.current) {
      receipts.push({ position, status: 'held', reason: 'source_version_changed' });
      continue;
    }
    try {
      const source = await graph.readDiscoveredPdf(item.itemId, item.version, signal);
      const hash = createHash('sha256').update(source.bytes).digest('hex');
      if (!approved.has(hash)) {
        receipts.push({ position, status: 'held', reason: 'source_fingerprint_unapproved' });
        continue;
      }
      if (processed.has(hash)) {
        receipts.push({ position, status: 'duplicate' });
        continue;
      }
      processed.add(hash);
      // Reuse DMS admission for retries and future batches containing the same bytes.
      const id = createHash('sha256').update(JSON.stringify([
        'algt-sharepoint-dms-batch-v1', config.authUserId, config.companyId, hash,
      ])).digest().subarray(0, 16);
      id[6] = (id[6] & 0x0f) | 0x40;
      id[8] = (id[8] & 0x3f) | 0x80;
      const hex = id.toString('hex');
      const operationId = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
        hex.slice(16, 20), hex.slice(20)].join('-');
      const receipt = await runDmsPilot({ config: { ...config, sha256: hash, operationId },
        client, graph, ledger, signal, source });
      receipts.push({ position, ...receipt });
      if (receipt.status === 'paused') break;
    } catch (error) {
      const reason = error instanceof ConnectionError ? error.message : 'pilot_batch_item_unconfirmed';
      receipts.push({ position, status: 'held', reason });
    }
  }
  return receipts;
}
