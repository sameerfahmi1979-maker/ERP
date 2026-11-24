import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { projectAgentIndex } from '../../workers/sharepoint-agent/index-projection.mjs';
import { publishAgentIndex } from '../../workers/sharepoint-agent/index-publisher.mjs';

const [snapshotsPath] = process.argv.slice(2);
assert.ok(snapshotsPath, 'Pass JSON lines emitted by sharepoint-index-snapshot-fixture.native.sql');
const snapshots = Object.fromEntries(readFileSync(snapshotsPath, 'utf8').trim().split(/\r?\n/u)
  .map(line => JSON.parse(line))
  .map(({ step, projectionInput }) => [step, projectionInput]));
const target = { driveId: 'synthetic-drive', indexFolderId: 'synthetic-parent', fileId: 'synthetic-file' };
const binding = { ...target, name: 'hr-document-index.json' };
const sha256 = body => createHash('sha256').update(body).digest('hex');

function request(step) {
  const projectionInput = snapshots[step];
  const manifest = projectAgentIndex(projectionInput);
  return {
    projectionInput,
    destination: target,
    authorization: {
      destination: target, scope: projectionInput.scope, publicationApproved: true, exactReadersVerified: true,
      payloadSha256: sha256(JSON.stringify(manifest)),
    },
  };
}

function syntheticVersionedItem({ beforeCommit, loseWriteResponse = false } = {}) {
  let generation = 1;
  let storedBytes = Buffer.alloc(0);
  let attempts = 0;
  let preconditionsLost = 0;
  const currentEtag = () => '"' + generation + '"';
  return {
    get attempts() { return attempts; },
    get preconditionsLost() { return preconditionsLost; },
    async read(destination) {
      assert.deepEqual(destination, target);
      return { binding, etag: currentEtag(), body: Buffer.from(storedBytes) };
    },
    async write(destination, { ifMatch, body }) {
      assert.deepEqual(destination, target);
      attempts += 1;
      await beforeCommit?.(JSON.parse(body).revision);
      if (ifMatch !== currentEtag()) {
        preconditionsLost += 1;
        throw new Error('condition failed at commit');
      }
      storedBytes = Buffer.from(body);
      generation += 1;
      if (loseWriteResponse) throw new Error('simulated lost acknowledgement');
    },
  };
}

test('the SQL scope input projects a numbered filing at the same discovery revision', () => {
  const discovered = projectAgentIndex(snapshots.discovered);
  const filed = projectAgentIndex(snapshots.filed);
  const removed = projectAgentIndex(snapshots.removed);
  assert.equal(discovered.files[0].processing_status, 'discovered');
  assert.equal(filed.files[0].outcome, 'filed');
  assert.equal(filed.files[0].dms_document_number, 'DMS-1900-994031');
  assert.equal(filed.files[0].employee_number, null);
  assert.equal(filed.files[0].case_reference, null);
  assert.equal(filed.files[0].dms_intake_reference, null);
  assert.equal(filed.files.length, 1);
  assert.equal(removed.files[0].source_state, 'removed');
  assert.equal(removed.files[0].dms_document_number, 'DMS-1900-994031');
  assert.equal(snapshots.discovered.checkpoint.revision, snapshots.filed.checkpoint.revision);
  assert.ok(filed.revision > discovered.revision);
});

test('the approved SQL-derived bytes are recovered after a lost conditional-write response', async () => {
  const transport = syntheticVersionedItem({ loseWriteResponse: true });
  const publication = request('filed');
  const revision = publication.projectionInput.snapshot.revision;
  assert.deepEqual(await publishAgentIndex({ ...publication, transport }), { state: 'recovered', revision });
  assert.deepEqual(await publishAgentIndex({ ...publication, transport }), { state: 'unchanged', revision });
  const committed = await transport.read(target);
  assert.equal(sha256(committed.body), publication.authorization.payloadSha256);
  assert.equal(transport.attempts, 1);
});

test('a stale filing approval loses at commit after the corrected SQL snapshot wins', async () => {
  const staleAtCommit = Promise.withResolvers();
  const allowStaleCommit = Promise.withResolvers();
  const publication = request('wrong_branch');
  const oldRevision = snapshots.filed.snapshot.revision;
  const newRevision = publication.projectionInput.snapshot.revision;
  const transport = syntheticVersionedItem({
    async beforeCommit(revision) {
      if (revision !== oldRevision) return;
      staleAtCommit.resolve();
      await allowStaleCommit.promise;
    },
  });
  const stale = publishAgentIndex({ ...request('filed'), transport });
  await staleAtCommit.promise;
  let winner;
  try {
    winner = await publishAgentIndex({ ...publication, transport });
  } finally {
    allowStaleCommit.resolve();
  }
  assert.deepEqual(winner, { state: 'published', revision: newRevision });
  assert.deepEqual(await stale, { state: 'stale', revision: newRevision });
  const committed = await transport.read(target);
  assert.equal(transport.preconditionsLost, 1);
  assert.equal(sha256(committed.body), publication.authorization.payloadSha256);
  assert.equal(JSON.parse(committed.body).files[0].dms_document_number, null);
});
