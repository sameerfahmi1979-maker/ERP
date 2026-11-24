import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSharePointConnection, readConnectionConfig } from './connection.mjs';

const env = {
  GRAPH_TENANT_ID: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  GRAPH_CLIENT_ID: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  GRAPH_CLIENT_SECRET: 'fixture-secret',
  GRAPH_DRIVE_ID: 'b!fixturedrive',
  GRAPH_SOURCE_FOLDER_ID: 'source-folder',
  GRAPH_INDEX_FOLDER_ID: 'index-folder',
};
const root = `https://graph.microsoft.com/v1.0/drives/${env.GRAPH_DRIVE_ID}`;
const delta = `${root}/root/delta?token=latest&%24select=id%2CparentReference%2Cdeleted`;
const cursor = `${root}/root/delta(token=opaque-fixture-token)`;

function fixture(overrides = {}) {
  const requests = [];
  const config = readConnectionConfig(env);
  const token = () => ({ access_token: 'fixture-access-token', token_type: 'Bearer', expires_in: 3600 });
  const authURL = `https://login.microsoftonline.com/${env.GRAPH_TENANT_ID}/oauth2/v2.0/token`;
  const source = `${root}/items/source-folder?$select=id,name,folder,parentReference`;
  const index = `${root}/items/index-folder?$select=id,name,folder,parentReference`;
  let timestamp = 0;
  const responses = {
    [authURL]: token(),
    [source]: { id: 'source-folder', name: 'Human Resources', folder: {}, parentReference: { driveId: env.GRAPH_DRIVE_ID } },
    [index]: { id: 'index-folder', name: '_AgentIndex', folder: {}, parentReference: { id: 'source-folder', driveId: env.GRAPH_DRIVE_ID } },
    [delta]: { value: [], '@odata.deltaLink': cursor },
    ...overrides,
  };
  const fetch = async (url, options) => {
    requests.push({ url: String(url), ...options });
    assert.equal(options.redirect, 'error');
    const response = responses[String(url)];
    assert.ok(response, `Unexpected request to ${url}`);
    return response instanceof Response ? response : Response.json(response);
  };
  return { connection: createSharePointConnection(config, { fetch, now: () => timestamp }), requests, authURL, source, index, advance: ms => { timestamp += ms; } };
}

test('probes only approved folder metadata and the latest delta cursor', async () => {
  const f = fixture();
  assert.deepEqual(await f.connection.probe(), { source: 'verified', index: 'verified', delta: 'verified' });
  assert.deepEqual(f.requests.map(r => [r.method, r.url]), [
    ['POST', f.authURL], ['GET', f.source], ['GET', f.index], ['GET', delta],
  ]);
  assert.equal(f.requests[0].body.get('grant_type'), 'client_credentials');
  assert.equal(f.requests[0].body.get('scope'), 'https://graph.microsoft.com/.default');
  assert.equal(f.requests[0].body.get('client_secret'), env.GRAPH_CLIENT_SECRET);
  assert.equal(f.requests[1].headers.Authorization, 'Bearer fixture-access-token');
  assert.ok(f.requests.every(r => r.signal instanceof AbortSignal));
});

test('refreshes the cached token before it expires', async () => {
  const f = fixture();
  await f.connection.probe();
  f.advance(1000);
  await f.connection.probe();
  f.advance(3_550_000);
  await f.connection.probe();
  assert.equal(f.requests.filter(r => r.url === f.authURL).length, 2);
});

test('invalidates a rejected Graph token and redacts response details', async () => {
  const source = `${root}/items/source-folder?$select=id,name,folder,parentReference`;
  const f = fixture({ [source]: new Response('sensitive upstream details', { status: 401 }) });
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(f.connection.probe(), { message: 'source_metadata_http_401' });
  }
  assert.deepEqual(f.requests.map(r => r.url), [f.authURL, source, f.authURL, source]);
});

test('fails closed if the index folder is moved outside the source', async () => {
  const index = `${root}/items/index-folder?$select=id,name,folder,parentReference`;
  const f = fixture({ [index]: { id: 'index-folder', name: '_AgentIndex', folder: {}, parentReference: { id: 'sibling', driveId: env.GRAPH_DRIVE_ID } } });
  await assert.rejects(f.connection.probe(), { message: 'index_folder_mismatch' });
  assert.ok(f.requests.every(r => r.url !== delta));
});

test('rejects malformed and out-of-scope cursor responses', async () => {
  for (const output of [
    { value: [], '@odata.deltaLink': 'https://example.org/private' },
    { value: [], '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/drives/other/root/delta?token=abc' },
    { value: [], '@odata.deltaLink': `${root}/root/delta` },
    { value: [{ id: 'file' }], '@odata.deltaLink': cursor },
    { value: [], '@odata.nextLink': cursor },
  ]) {
    const f = fixture({ [delta]: output });
    await assert.rejects(f.connection.probe(), { message: 'delta_cursor_invalid' });
  }
});

test('requires a distinct source and index with validated config identifiers', () => {
  assert.throws(() => readConnectionConfig({ ...env, GRAPH_SOURCE_FOLDER_ID: env.GRAPH_INDEX_FOLDER_ID }), /distinct_folders_required/);
  assert.throws(() => readConnectionConfig({ ...env, GRAPH_DRIVE_ID: '../another-drive' }), /invalid_GRAPH_DRIVE_ID/);
  assert.throws(() => readConnectionConfig({ ...env, GRAPH_CLIENT_SECRET: '' }), /missing_GRAPH_CLIENT_SECRET/);
});
