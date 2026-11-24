import { createHash } from 'node:crypto';
import { compareAgentIndexRevision, projectAgentIndex } from './index-projection.mjs';

const fileName = 'hr-document-index.json';
const graphId = /^[A-Za-z0-9_!.\-]{1,256}$/u;
const strongEtag = /^"[\x21\x23-\x7e]{1,1024}"$/u;
const utf8 = new TextDecoder('utf-8', { fatal: true });

function sameScope(left, right) {
  return right && left.connection_id === right.connection_id &&
    left.company_id === right.company_id && left.branch_id === right.branch_id;
}

function sameDestination(left, right) {
  return right && left.driveId === right.driveId && left.indexFolderId === right.indexFolderId && left.fileId === right.fileId;
}

function authorizedDestination(destination, authorization, scope, body) {
  if (!destination || ![destination.driveId, destination.indexFolderId, destination.fileId]
    .every(value => typeof value === 'string' && graphId.test(value)) || destination.indexFolderId === destination.fileId) {
    throw new Error('index_invalid_destination');
  }
  if (authorization?.publicationApproved !== true || authorization.exactReadersVerified !== true ||
      !sameDestination(destination, authorization.destination) || !sameScope(scope, authorization.scope) ||
      authorization.payloadSha256 !== createHash('sha256').update(body).digest('hex')) {
    throw new Error('index_publication_unauthorized');
  }
  const { driveId, indexFolderId, fileId } = destination;
  return Object.freeze({ driveId, indexFolderId, fileId });
}

async function readIndex(transport, target) {
  let remote;
  try { remote = await transport.read(target); }
  catch { throw new Error('index_read_unconfirmed'); }
  if (!sameDestination(target, remote?.binding) || remote.binding.name !== fileName) {
    throw new Error('index_destination_mismatch');
  }
  if (typeof remote.etag !== 'string' || !strongEtag.test(remote.etag)) throw new Error('index_invalid_etag');
  if (!(remote.body instanceof Uint8Array)) throw new Error('index_invalid_body');
  const body = Buffer.from(remote.body);
  let manifest = null;
  if (body.length > 0) {
    try { manifest = JSON.parse(utf8.decode(body)); }
    catch { throw new Error('index_invalid_body'); }
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('index_invalid_body');
  }
  return { etag: remote.etag, body, manifest };
}

function compareRead(candidate, body, remote) {
  const state = compareAgentIndexRevision(candidate, remote.manifest);
  return state === 'unchanged' && !body.equals(remote.body) ? 'conflict' : state;
}

// A trusted approval binds the exact projected bytes, scope and destination.
// The transport supplies binding, ETag and original bytes from the same version of
// an existing file. A zero-byte file is empty. Writes encode the body as UTF-8 and
// atomically respect If-Match at commit.
export async function publishAgentIndex({ projectionInput, destination, authorization, transport }) {
  const candidate = projectAgentIndex({ ...projectionInput, allowEmployeeNumbers: false });
  const payload = JSON.stringify(candidate);
  const body = Buffer.from(payload, 'utf8');
  const target = authorizedDestination(destination, authorization, candidate, body);
  const remote = await readIndex(transport, target);
  const initial = compareRead(candidate, body, remote);
  if (initial !== 'advance') return { state: initial, revision: remote.manifest.revision };

  let writeConfirmed = true;
  try { await transport.write(target, { ifMatch: remote.etag, body: payload }); }
  catch { writeConfirmed = false; }

  // A lost response may have committed the approved bytes. Read before deciding
  // whether a later invocation needs a new precondition.
  const readBack = await readIndex(transport, target);
  if (readBack.etag === remote.etag && !readBack.body.equals(remote.body)) {
    throw new Error('index_invalid_read_back');
  }
  const outcome = compareRead(candidate, body, readBack);
  if (outcome === 'unchanged') return { state: writeConfirmed ? 'published' : 'recovered', revision: candidate.revision };
  if (outcome === 'stale' || outcome === 'conflict') return { state: outcome, revision: readBack.manifest.revision };
  throw new Error('index_write_unconfirmed');
}
