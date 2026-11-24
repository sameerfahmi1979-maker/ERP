import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConnectionError, createSharePointConnection } from './connection.mjs';
import { discoverChanges } from './discovery.mjs';

const config = { tenantId: 'tenant', clientId: 'client', clientSecret: 'secret', driveId: 'b!drive', sourceId: 'source', indexId: 'index' };
const drive = 'https://graph.microsoft.com/v1.0/drives/b!drive';
const next = drive + '/root/delta?$skiptoken=page';
const end = drive + '/root/delta?token=end';
const folder = (id, parent, name = id) => ({ id, name, folder: {}, parentReference: { id: parent, driveId: config.driveId } });
const file = (id, parent) => ({
  id, name: id + '.pdf', file: { mimeType: 'application/pdf' }, size: 200, eTag: 'metadata', cTag: 'bytes',
  parentReference: { id: parent, driveId: config.driveId },
});

test('scopes Graph changes by current ancestry and excludes the full index subtree', async () => {
  const items = {
    source: folder('source', 'root'),
    index: folder('index', 'source', '_AgentIndex'),
    a: file('a', 'nested'),
    excluded: file('excluded', 'indexNested'),
    other: file('other', 'outside'),
    nested: folder('nested', 'source'),
    indexNested: folder('indexNested', 'index'),
    outside: folder('outside', 'root'),
  };
  const calls = [];
  const sharePoint = createSharePointConnection(config, {
    fetch: async url => {
      calls.push(String(url));
      if (url.startsWith('https://login.microsoftonline.com')) {
        return Response.json({ access_token: 'fixture', token_type: 'Bearer', expires_in: 3600 });
      }
      if (url === next) return Response.json({
        value: ['a', 'excluded', 'other'].map(id => ({ id })).concat({ id: 'gone', deleted: {} }),
        '@odata.deltaLink': end,
      });
      const id = new URL(url).pathname.split('/').at(-1);
      return items[id] ? Response.json(items[id]) : new Response(null, { status: 404 });
    },
  });
  assert.deepEqual(await sharePoint.readChangePage(next), {
    cursor: end, more: false, changes: [
      { id: 'a', kind: 'file', name: 'a.pdf', version: 'c:bytes', mime: 'application/pdf', size: 200, ancestors: ['nested', 'source'] },
      { id: 'excluded', kind: 'unavailable' },
      { id: 'other', kind: 'unavailable' },
      { id: 'gone', kind: 'unavailable' },
    ],
  });
  assert.ok(calls.every(url => !url.includes('/content')));
  await assert.rejects(sharePoint.readChangePage('https://example.net/cursor'), /delta_cursor_invalid/);
  assert.ok(calls.every(url => !url.includes('example.net')));
});

test('a failed page commit restarts from the last committed continuation', async () => {
  let checkpoint = { cursor: null, revision: '0', paused: false };
  const attempted = [];
  let failOnce = true;
  const sharePoint = {
    verifyFolders: async () => {},
    readChangePage: async cursor => {
      attempted.push(cursor);
      return cursor ? { cursor: end, more: false, changes: [{ id: 'two' }] } : { cursor: next, more: true, changes: [{ id: 'one' }] };
    },
  };
  const ledger = {
    read: async () => checkpoint,
    commit: async ({ revision }, page) => {
      assert.equal(revision, checkpoint.revision);
      if (page.cursor === end && failOnce) {
        failOnce = false;
        throw Error('commit_failed');
      }
      checkpoint = { cursor: page.cursor, revision: String(Number(revision) + 1), paused: false };
      return 'committed';
    },
  };
  await assert.rejects(discoverChanges({ sharePoint, ledger }), /commit_failed/);
  assert.equal(checkpoint.cursor, next);
  assert.deepEqual(await discoverChanges({ sharePoint, ledger }), { status: 'caught_up', pages: 1, candidates: 0 });
  assert.deepEqual(attempted, [null, next, next]);
});

test('pause and expired cursor never advance the checkpoint', async () => {
  let paused = true;
  let requested = 0;
  const sharePoint = {
    verifyFolders: async () => {},
    readChangePage: async () => { requested++; throw new ConnectionError('delta_page_http_410'); },
  };
  const ledger = {
    read: async () => ({ paused, revision: '1', cursor: next }),
    commit: async () => { assert.fail('unexpected advance'); },
  };
  assert.equal((await discoverChanges({ sharePoint, ledger })).status, 'paused');
  assert.equal(requested, 0);
  paused = false;
  assert.equal((await discoverChanges({ sharePoint, ledger })).status, 'recovery_required');
  assert.equal(requested, 1);
});

test('shutdown while downloading a page preserves the checkpoint', async () => {
  const shutdown = new AbortController();
  const ledger = {
    read: async () => ({ paused: false, cursor: next, revision: '1' }),
    commit: async () => assert.fail('shutdown advanced the checkpoint'),
  };
  const sharePoint = {
    verifyFolders: async () => {},
    readChangePage: async (_, signal) => {
      assert.equal(signal, shutdown.signal);
      shutdown.abort();
      throw new ConnectionError('delta_page_unreachable');
    },
  };
  assert.deepEqual(await discoverChanges({ sharePoint, ledger, signal: shutdown.signal }),
    { status: 'stopping', pages: 0, candidates: 0 });
});

test('downloads the pinned PDF only in the approved subtree without forwarding the Graph token', async () => {
  const raw = Buffer.from('%PDF-1.7\nfixture\n%%EOF');
  let parent = 'source';
  const calls = [];
  const site = 'https://algtnet.sharepoint.com/temporary-pdf?token=fixture';
  const connection = createSharePointConnection(config, { fetch: async (url, options) => {
    url = String(url);
    calls.push([url, options]);
    if (url.startsWith('https://login.microsoftonline.com')) return Response.json({
      access_token: 'fixture', token_type: 'Bearer', expires_in: 3600,
    });
    if (url === site) return new Response(raw);
    if (url.endsWith('/content')) return new Response(null, { status: 302, headers: { Location: site } });
    return Response.json({ ...file('sample', parent), size: raw.length });
  } });
  assert.deepEqual(await connection.readApprovedPdf('sample', 'metadata'), { name: 'sample.pdf', bytes: raw });
  assert.equal(calls.find(([url]) => url === site)[1].headers, undefined);
  await assert.rejects(connection.readApprovedPdf('sample'), /pilot_source_unverified/);
  await assert.rejects(connection.readDiscoveredPdf('sample', 'c:bytes', undefined, 'previous-metadata'), /pilot_source_unverified/);
  assert.deepEqual(await connection.readDiscoveredPdf('sample', 'c:bytes', undefined, 'metadata'), { name: 'sample.pdf', bytes: raw });
  await assert.rejects(connection.readApprovedPdf('sample', 'changed'), /pilot_source_unverified/);
  parent = 'index';
  await assert.rejects(connection.readApprovedPdf('sample', 'metadata'), /pilot_source_unverified/);
  assert.equal(calls.filter(([url]) => url.endsWith('/content')).length, 2);
});
