import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { publishAgentIndex } from './index-publisher.mjs';
import { projectAgentIndex } from './index-projection.mjs';

const scope = { connection_id: 'connection-1', company_id: 1, branch_id: 2 };
const destination = { driveId: 'drive-1', indexFolderId: 'folder-1', fileId: 'index-1' };
const binding = { ...destination, name: 'hr-document-index.json' };
const time = '2026-11-22T08:00:00Z';
const source = {
  ...scope, source_item_id: 'item-a', source_version: 'c:version-1',
  source_state: 'present', last_checked_at: time, filename: 'named private file',
};
const receipt = {
  ...source, processing_status: 'complete', outcome: 'filed', document_read_back: true,
  dms_document_number: 'DMS-1900-000001', employee_number: 'EMP-1',
  employee_link_read_back: true, raw_ocr: 'private testimony',
};

function argumentsFor(revision = 2) {
  const projectionInput = {
    scope,
    checkpoint: { ...scope, revision: 1 },
    snapshot: { ...scope, revision, checkpoint_revision: 1, committed_at: time, sources: [source], receipts: [receipt] },
    allowEmployeeNumbers: true,
  };
  const plannedBody = JSON.stringify(projectAgentIndex({ ...projectionInput, allowEmployeeNumbers: false }));
  return {
    projectionInput,
    destination,
    authorization: {
      scope, destination, publicationApproved: true, exactReadersVerified: true,
      payloadSha256: createHash('sha256').update(plannedBody).digest('hex'),
    },
  };
}

function fakeTransport({
  initial = null, initialBody = Buffer.from(initial === null ? '' : JSON.stringify(initial)), remoteBinding = binding,
  onWrite, beforeCommit,
} = {}) {
  let remote = { binding: remoteBinding, etag: '"1"', body: initialBody, manifest: initial };
  const calls = [];
  const rejectedPreconditions = [];
  const transport = {
    async read(target) {
      assert.deepEqual(target, destination);
      calls.push(['read']);
      return structuredClone(remote);
    },
    async write(target, { ifMatch, body }) {
      assert.deepEqual(target, destination);
      calls.push(['write', ifMatch, body]);
      const commit = (body) => { remote = { ...remote, etag: '"2"', body: Buffer.from(body), manifest: JSON.parse(body) }; };
      if (onWrite) return onWrite({ ifMatch, body, commit });
      await beforeCommit?.(body);
      if (ifMatch !== remote.etag) {
        rejectedPreconditions.push(ifMatch);
        throw new Error('precondition failed');
      }
      commit(body);
    },
  };
  return { transport, calls, rejectedPreconditions };
}

test('checks exact scope and destination, conditionally publishes projected JSON and reads back', async () => {
  const { transport, calls } = fakeTransport();
  const result = await publishAgentIndex({ ...argumentsFor(), transport });
  assert.deepEqual(result, { state: 'published', revision: 2 });
  assert.deepEqual(calls.map(([name]) => name), ['read', 'write', 'read']);
  assert.equal(calls[1][1], '"1"');
  assert.doesNotMatch(calls[1][2], /private|EMP-1/u);
  const [file] = JSON.parse(calls[1][2]).files;
  assert.equal(file.dms_document_number, receipt.dms_document_number);
  assert.equal(file.employee_number, null);
  assert.equal(file.filename, undefined);
  assert.deepEqual(await publishAgentIndex({ ...argumentsFor(), transport }), { state: 'unchanged', revision: 2 });
  assert.equal(calls.filter(([name]) => name === 'write').length, 1);
});

test('readers approval and exact binding are required before publication I/O', async () => {
  const { transport, calls } = fakeTransport();
  for (const authorization of [
    { ...argumentsFor().authorization, exactReadersVerified: false },
    { ...argumentsFor().authorization, publicationApproved: false },
    { ...argumentsFor().authorization, scope: { ...scope, branch_id: 3 } },
    { ...argumentsFor().authorization, destination: { ...destination, fileId: 'other-file' } },
  ]) {
    await assert.rejects(publishAgentIndex({ ...argumentsFor(), authorization, transport }), /index_publication_unauthorized/u);
  }
  assert.deepEqual(calls, []);
  for (const remoteBinding of [{ ...binding, indexFolderId: 'other-folder' }, { ...binding, name: 'other.json' }]) {
    const remote = fakeTransport({ remoteBinding });
    await assert.rejects(publishAgentIndex({ ...argumentsFor(), transport: remote.transport }), /index_destination_mismatch/u);
    assert.deepEqual(remote.calls, [['read']]);
  }
});

test('rejects approval that omits the payload digest or applies to different bytes', async () => {
  const { transport, calls } = fakeTransport();
  const approved = argumentsFor();
  const approvalForRevisionTwo = approved.authorization;
  const changedReceipt = { ...receipt, dms_document_number: 'DMS-1900-000002' };
  const changedProjection = {
    ...approved.projectionInput,
    snapshot: { ...approved.projectionInput.snapshot, receipts: [changedReceipt] },
  };
  for (const options of [
    { ...approved, authorization: { ...approvalForRevisionTwo, payloadSha256: undefined } },
    { ...approved, projectionInput: changedProjection },
    { ...argumentsFor(3), authorization: approvalForRevisionTwo },
  ]) {
    await assert.rejects(publishAgentIndex({ ...options, transport }), /index_publication_unauthorized/u);
  }
  assert.deepEqual(calls, []);
});

test('recovers a lost write response using committed read-back and a single write', async () => {
  const { transport, calls } = fakeTransport({
    onWrite({ body, commit }) {
      commit(body);
      throw Error('internal transport details');
    },
  });
  assert.deepEqual(await publishAgentIndex({ ...argumentsFor(), transport }), { state: 'recovered', revision: 2 });
  assert.deepEqual(calls.map(([name]) => name), ['read', 'write', 'read']);
});

test('holds a byte-different equal revision even when Graph content parses to the approved JSON', async () => {
  const initial = projectAgentIndex({ ...argumentsFor().projectionInput, allowEmployeeNumbers: false });
  const { transport, calls } = fakeTransport({ initial, initialBody: Buffer.from(JSON.stringify(initial, null, 2)) });
  assert.deepEqual(await publishAgentIndex({ ...argumentsFor(), transport }), { state: 'conflict', revision: 2 });
  assert.deepEqual(calls, [['read']]);
});

test('confirms neither publication nor lost-response recovery if paired bytes differ', async () => {
  for (const loseResponse of [false, true]) {
    const { transport, calls } = fakeTransport({
      onWrite({ body, commit }) {
        commit(`${body}\n`);
        if (loseResponse) throw new Error('transport response lost');
      },
    });
    assert.deepEqual(await publishAgentIndex({ ...argumentsFor(), transport }), { state: 'conflict', revision: 2 });
    assert.deepEqual(calls.map(([name]) => name), ['read', 'write', 'read']);
  }
});

test('rejects read-back that pairs changed bytes with the original strong ETag', async () => {
  for (const loseResponse of [false, true]) {
    const { transport, calls } = fakeTransport({
      onWrite({ body, commit }) {
        commit(body);
        if (loseResponse) throw new Error('transport response lost');
      },
    });
    const read = transport.read;
    transport.read = async target => ({ ...await read(target), etag: '"1"' });

    await assert.rejects(publishAgentIndex({ ...argumentsFor(), transport }), { message: 'index_invalid_read_back' });
    assert.deepEqual(calls.map(([name]) => name), ['read', 'write', 'read']);
  }
});

test('rejects missing bytes, malformed UTF-8 and encoded null before attempting a write', async () => {
  for (const initialBody of [null, Buffer.from([0xff]), Buffer.from('null')]) {
    const { transport, calls } = fakeTransport({ initialBody });
    await assert.rejects(publishAgentIndex({ ...argumentsFor(), transport }), /index_invalid_body/u);
    assert.deepEqual(calls, [['read']]);
  }
});

test('competing publishers preserve the exact winning bytes when a stale precondition reaches commit', async () => {
  const staleWriteStarted = Promise.withResolvers();
  const resumeStaleWrite = Promise.withResolvers();
  const { transport, calls, rejectedPreconditions } = fakeTransport({
    async beforeCommit(body) {
      if (JSON.parse(body).revision === 2) {
        staleWriteStarted.resolve();
        await resumeStaleWrite.promise;
      }
    },
  });
  const older = publishAgentIndex({ ...argumentsFor(2), transport });
  await staleWriteStarted.promise;
  const approvalForWinner = argumentsFor(3);
  try {
    assert.deepEqual(await publishAgentIndex({ ...approvalForWinner, transport }), { state: 'published', revision: 3 });
  } finally {
    resumeStaleWrite.resolve();
  }
  assert.deepEqual(await older, { state: 'stale', revision: 3 });
  assert.deepEqual(rejectedPreconditions, ['"1"']);
  assert.deepEqual(calls.map(([name]) => name), ['read', 'write', 'read', 'write', 'read', 'read']);
  const stored = await transport.read(destination);
  assert.equal(stored.etag, '"2"');
  assert.equal(createHash('sha256').update(stored.body).digest('hex'), approvalForWinner.authorization.payloadSha256);
});

test('holds an already newer revision or an equal-revision conflict without writing', async () => {
  const base = projectAgentIndex({ ...argumentsFor().projectionInput, allowEmployeeNumbers: false });
  for (const [initial, state] of [[{ ...base, revision: 3 }, 'stale'], [{ ...base, files: [] }, 'conflict']]) {
    const { transport, calls } = fakeTransport({ initial });
    assert.deepEqual(await publishAgentIndex({ ...argumentsFor(), transport }), { state, revision: initial.revision });
    assert.deepEqual(calls, [['read']]);
  }
});

test('refuses weak or wildcard write preconditions and surfaces only a safe reason', async () => {
  for (const etag of ['W/"1"', '*', undefined]) {
    const { transport, calls } = fakeTransport();
    const read = transport.read;
    transport.read = async target => ({ ...await read(target), etag });
    await assert.rejects(publishAgentIndex({ ...argumentsFor(), transport }), /index_invalid_etag/u);
    assert.deepEqual(calls, [['read']]);
  }
  const { transport, calls } = fakeTransport({
    onWrite() { throw Error('sensitive transport diagnostic'); },
  });
  await assert.rejects(publishAgentIndex({ ...argumentsFor(), transport }), { message: 'index_write_unconfirmed' });
  assert.deepEqual(calls.map(([name]) => name), ['read', 'write', 'read']);
});
