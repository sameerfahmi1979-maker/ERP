'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { test } = require('node:test');
const { createProxy, verifyErpPassword } = require('./erp-sandbox-signin.cjs');

const owner = { email: 'demo@algt.net', subject: '01010101-abab-4bbb-8555-010101010101', publicKey: 'test-public' };
const password = 'synthetic-upstream-password';
const cookieName = 'sb-mmiefuieduzdiiwnqpie-auth-token';
const cookieValue = 'base64-' + Buffer.from(JSON.stringify({ access_token: 'unit.test.token', refresh_token: 'only-upstream' })).toString('base64url');

function mockLive(user, { valid = true, revoke = 204 } = {}) {
  const calls = [];
  return { calls, request: async (url, init) => {
    calls.push([url, init]);
    if (url.endsWith('/api/auth/login')) {
      assert.deepEqual(JSON.parse(init.body), { email: owner.email, password });
      assert.equal(init.headers.origin, 'https://erp.algt.net');
      assert.equal(init.headers.cookie, undefined);
      const headers = new Headers();
      headers.append('Set-Cookie', cookieName + '.0=' + cookieValue.slice(0, 50) + '; Path=/');
      headers.append('Set-Cookie', cookieName + '.1=' + cookieValue.slice(50) + '; Path=/');
      return Response.json({ success: valid }, { headers });
    }
    assert.equal(init.headers.authorization, 'Bearer unit.test.token');
    assert.equal(init.headers.apikey, owner.publicKey);
    assert.equal(init.redirect, 'error');
    if (url.endsWith('/auth/v1/user')) return Response.json(user);
    if (url.endsWith('/auth/v1/logout?scope=local')) {
      assert.equal(init.method, 'POST');
      return new Response(null, { status: revoke });
    }
    assert.fail('Unexpected authentication destination');
  } };
}

const matching = { id: owner.subject, email: owner.email, email_confirmed_at: '2026-11-25T00:00:00Z', is_anonymous: false };

test('uses the ERP login endpoint, verifies the pinned identity and ends only the new live session', async () => {
  const live = mockLive(matching);
  assert.equal(await verifyErpPassword(owner, password, live.request), true);
  assert.deepEqual(live.calls.map(([url]) => url), [
    'https://erp.algt.net/api/auth/login',
    'https://mmiefuieduzdiiwnqpie.supabase.co/auth/v1/user',
    'https://mmiefuieduzdiiwnqpie.supabase.co/auth/v1/logout?scope=local',
  ]);
});

test('requires the exact identity, respects MFA enrollment and fails closed on a failed session cleanup', async () => {
  for (const user of [
    { ...matching, id: 'another-subject' },
    { ...matching, email_confirmed_at: null },
    { ...matching, is_anonymous: true },
    { ...matching, factors: [{ status: 'verified' }] },
  ]) {
    assert.equal(await verifyErpPassword(owner, password, mockLive(user).request), false);
  }
  assert.equal(await verifyErpPassword(owner, password, mockLive(matching, { revoke: 503 }).request), false);
  const invalid = mockLive(matching, { valid: false });
  assert.equal(await verifyErpPassword(owner, password, invalid.request), false);
  assert.equal(invalid.calls.length, 1);
});

function send(port, { body, cookie, origin = 'http://localhost:3000', path = '/api/auth/login', host = 'localhost:3000' }) {
  return new Promise((resolve, reject) => {
    const headers = { host, origin, 'sec-fetch-site': 'same-origin', ...(cookie ? { cookie } : {}) };
    const buffer = body ? Buffer.from(JSON.stringify(body)) : null;
    if (buffer) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = buffer.length;
    }
    const request = http.request({ hostname: '127.0.0.1', port, path, agent: false, method: buffer ? 'POST' : 'GET', headers },
      response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers,
          body: Buffer.concat(chunks).toString() }));
        response.on('error', reject);
      });
    request.setTimeout(10000, () => request.destroy(Error('Local test timed out')));
    request.on('error', reject);
    request.end(buffer);
  });
}

test('opens a sandbox session only after verification and forwards ordinary local logins', async t => {
  const sandboxLogin = { email: 'demo-officer@pilot.example.invalid', password: 'synthetic-sandbox-password' };
  const upstreamSession = 'sb-127-auth-token=synthetic-sandbox-token';
  const sent = [];
  const backend = http.createServer(async (request, response) => {
    if (request.method === 'POST') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      sent.push(JSON.parse(Buffer.concat(chunks).toString()));
      response.writeHead(200, { 'content-type': 'application/json', 'set-cookie': [upstreamSession + '; Path=/'] });
      response.end('{"success":true}');
      return;
    }
    assert.equal(request.url, '/ai-agent-center');
    assert.equal(request.headers.cookie, upstreamSession);
    response.end('AI Agent Center');
  });
  t.after(() => backend.close());
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  const seen = [];
  const server = createProxy({ owner, sandboxLogin, backendPort: backend.address().port, verify: async (_, candidate) => {
    seen.push(candidate);
    return candidate === password;
  } });
  t.after(() => server.close());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const blocked = await send(port, { body: { email: owner.email, password }, origin: 'https://another.invalid' });
  assert.equal(blocked.status, 403);
  const badHost = await send(port, { body: { email: owner.email, password }, host: 'example.invalid' });
  assert.equal(badHost.status, 403);
  assert.deepEqual(seen, []);
  const failed = await send(port, { body: { email: owner.email, password: 'bad' } });
  assert.deepEqual(JSON.parse(failed.body), { success: false });
  assert.equal(failed.headers['set-cookie'], undefined);
  assert.deepEqual(sent, []);
  const reply = await send(port, { body: { email: owner.email, password } });
  assert.equal(reply.status, 200);
  assert.equal(JSON.parse(reply.body).success, true);
  assert.deepEqual(reply.headers['set-cookie'], [upstreamSession + '; Path=/']);
  const page = await send(port, { path: '/ai-agent-center', cookie: upstreamSession });
  assert.equal(page.status, 200);
  assert.match(page.body, /AI Agent Center/);
  const fallback = await send(port, { body: sandboxLogin });
  assert.equal(JSON.parse(fallback.body).success, true);
  assert.deepEqual(sent, [sandboxLogin, sandboxLogin]);
  assert.deepEqual(seen, ['bad', password]);
});
