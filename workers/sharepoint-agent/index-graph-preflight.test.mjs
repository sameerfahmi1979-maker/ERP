import assert from 'node:assert/strict';
import test from 'node:test';
import { createIndexGraphPreflight } from './index-graph-preflight.mjs';

const destination = { driveId: 'b!drive', indexFolderId: 'indexFolder', fileId: 'indexFile' };
const itemURL = 'https://graph.microsoft.com/v1.0/drives/b!drive/items/indexFile';
const downloadURL = 'https://algtnet.sharepoint.com/content?signature=test-only';
const accessToken = 'test-only-bearer';
const bytes = Buffer.from('{ "title": "é" }\n', 'utf8');
const file = {
  id: 'indexFile', name: 'hr-document-index.json', file: {}, eTag: '"{itemGuid},1"', size: bytes.length,
  parentReference: { id: 'indexFolder', driveId: 'b!drive' },
};

function fixture(responses, target = destination) {
  const calls = [];
  const reader = createIndexGraphPreflight({
    destination: target, accessToken,
    async fetch(url, options) {
      calls.push({ url: String(url), ...options });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      assert.ok(next, 'unexpected fetch');
      return next;
    },
  });
  return { reader, calls };
}

function metadata(fields = {}) {
  return Response.json({ ...file, ...fields });
}

function redirect(location = downloadURL) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

test('reports the observed metadata and exact downloaded bytes without sending the bearer to the signed download', async () => {
  const config = { ...destination };
  const { reader, calls } = fixture([metadata(), redirect(), new Response(bytes), metadata()], config);
  config.fileId = 'otherFile';
  const result = await reader.read();
  assert.deepEqual(Object.keys(reader), ['read']);
  assert.deepEqual(result, { binding: { ...destination, name: file.name }, observedMetadataETag: file.eTag, body: bytes });
  const metadataURL = new URL(calls[0].url);
  assert.equal(metadataURL.origin + metadataURL.pathname, itemURL);
  assert.equal(metadataURL.searchParams.get('$select'), 'id,name,file,folder,remoteItem,deleted,parentReference,eTag,size');
  assert.deepEqual(calls.map(call => call.url), [calls[0].url, `${itemURL}/content`, downloadURL, calls[0].url]);
  assert.deepEqual(calls.map(call => call.redirect), ['error', 'manual', 'error', 'error']);
  for (const call of calls) {
    assert.equal(call.method, 'GET');
    assert.equal(call.credentials, 'omit');
    assert.equal(call.cache, 'no-store');
  }
  assert.deepEqual(calls.map(call => new Headers(call.headers).get('authorization')),
    [`Bearer ${accessToken}`, `Bearer ${accessToken}`, null, `Bearer ${accessToken}`]);
});

test('reads zero-byte index content when Graph returns bytes directly', async () => {
  const { reader, calls } = fixture([metadata({ size: 0 }), new Response(null), metadata({ size: 0 })]);
  assert.deepEqual((await reader.read()).body, Buffer.alloc(0));
  assert.equal(calls.length, 3);
});

test('rejects caller-provided destination segments that could escape the immutable route', () => {
  for (const fileId of ['../sibling', 'file?', 'file%2Fcontent', '#file', '', destination.indexFolderId]) {
    assert.throws(() => fixture([], { ...destination, fileId }), { message: 'index_preflight_invalid_destination' });
  }
});

test('stops before download for an unavailable or mismatched target', async () => {
  for (const fields of [
    { id: 'sibling' }, { name: 'HR-DOCUMENT-INDEX.json' }, { file: null }, { folder: {} }, { remoteItem: {} },
    { deleted: {} }, { parentReference: { id: 'siblingFolder', driveId: destination.driveId } },
    { parentReference: { id: destination.indexFolderId, driveId: 'otherDrive' } },
  ]) {
    const { reader, calls } = fixture([metadata(fields)]);
    await assert.rejects(reader.read(), { message: 'index_preflight_destination_mismatch' });
    assert.equal(calls.length, 1);
  }
  for (const status of [403, 404]) {
    const { reader, calls } = fixture([new Response('redacted provider error', { status })]);
    await assert.rejects(reader.read(), { message: `index_preflight_metadata_http_${status}` });
    assert.equal(calls.length, 1);
  }
});

test('rejects weak eTags before or after download and rejects an eTag or binding change', async () => {
  for (const eTag of ['W/"weak"', '*', '"one", "two"', null]) {
    const { reader, calls } = fixture([metadata({ eTag })]);
    await assert.rejects(reader.read(), { message: 'index_preflight_invalid_etag' });
    assert.equal(calls.length, 1);
  }
  for (const [fields, message] of [
    [{ eTag: '"{itemGuid},2"' }, 'index_preflight_changed'],
    [{ eTag: 'W/"weak"' }, 'index_preflight_invalid_etag'],
    [{ size: bytes.length + 1 }, 'index_preflight_changed'],
    [{ parentReference: { ...file.parentReference, id: 'moved' } }, 'index_preflight_destination_mismatch'],
  ]) {
    const { reader } = fixture([metadata(), new Response(bytes), metadata(fields)]);
    await assert.rejects(reader.read(), { message });
  }
});

test('rejects oversized targets and downloads that underflow or overflow item metadata', async () => {
  for (const size of [-1, 1.5, 3 * 1024 * 1024 + 1]) {
    const { reader, calls } = fixture([metadata({ size })]);
    await assert.rejects(reader.read(), { message: 'index_preflight_invalid_size' });
    assert.equal(calls.length, 1);
  }
  for (const content of [bytes.subarray(1), Buffer.concat([bytes, Buffer.from('x')])]) {
    const body = new ReadableStream({ start(controller) { controller.enqueue(content); controller.close(); } });
    const { reader, calls } = fixture([metadata(), new Response(body)]);
    await assert.rejects(reader.read(), { message: 'index_preflight_size_mismatch' });
    assert.equal(calls.length, 2);
  }
});

test('rejects out-of-origin, malformed and chained redirects without exposing a signed URL', async () => {
  for (const href of [
    'https://algtnet.sharepoint.com.other.test/signed?secret', 'http://algtnet.sharepoint.com/signed?secret',
    'https://attacker:creds@algtnet.sharepoint.com/signed?secret', 'https://algtnet.sharepoint.com:444/signed?secret',
    'https://algtnet.sharepoint.com/signed?secret#fragment', '/relative?secret',
  ]) {
    const { reader, calls } = fixture([metadata(), redirect(href)]);
    await assert.rejects(reader.read(), { message: 'index_preflight_download_destination_invalid' });
    assert.equal(calls.length, 2);
  }
  const { reader, calls } = fixture([metadata(), redirect(), redirect()]);
  await assert.rejects(reader.read(), { message: 'index_preflight_content_http_302' });
  assert.equal(calls.length, 3);
});

test('uses safe errors for network, read and parsing failures', async () => {
  const secret = `${accessToken} ${downloadURL}`;
  const broken = new ReadableStream({ start(controller) { controller.error(new Error(secret)); } });
  for (const [responses, message] of [
    [[new Error(secret)], 'index_preflight_metadata_unavailable'],
    [[new Response(secret)], 'index_preflight_metadata_invalid'],
    [[metadata(), redirect(), new Error(secret)], 'index_preflight_content_unavailable'],
    [[metadata(), new Response(broken)], 'index_preflight_content_unavailable'],
  ]) {
    const { reader } = fixture(responses);
    await assert.rejects(reader.read(), err => err.message === message && err.cause === undefined && !err.stack.includes(secret));
  }
});
