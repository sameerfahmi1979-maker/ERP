'use strict';

const http = require('node:http');
const { readFileSync, realpathSync } = require('node:fs');
const path = require('node:path');

const localOrigin = 'http://localhost:3000';
const erpOrigin = 'https://erp.algt.net';
const authOrigin = 'https://mmiefuieduzdiiwnqpie.supabase.co';
const liveCookieName = 'sb-mmiefuieduzdiiwnqpie-auth-token';
const loginPath = '/api/auth/login';
const maxLoginBytes = 8192;

function accessTokenFrom(cookies) {
  const entries = new Map();
  for (const header of cookies) {
    const pair = header.split(';', 1)[0];
    const equals = pair.indexOf('=');
    if (equals < 0) continue;
    const name = pair.slice(0, equals);
    if (name === liveCookieName || name.startsWith(liveCookieName + '.')) {
      if (entries.has(name)) return null;
      entries.set(name, decodeURIComponent(pair.slice(equals + 1)));
    }
  }
  let raw = entries.get(liveCookieName);
  if (raw) {
    if (entries.size !== 1) return null;
  } else {
    if (!entries.size || entries.size > 12) return null;
    const pieces = Array.from({ length: entries.size }, (_, index) => entries.get(liveCookieName + '.' + index));
    if (pieces.some(part => !part)) return null;
    raw = pieces.join('');
  }
  const json = raw.startsWith('base64-') ? Buffer.from(raw.slice(7), 'base64url').toString('utf8') : raw;
  const token = JSON.parse(json).access_token;
  return typeof token === 'string' && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(token) ? token : null;
}

async function verifyErpPassword(owner, password, request = globalThis.fetch) {
  const login = await request(erpOrigin + loginPath, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: erpOrigin },
    body: JSON.stringify({ email: owner.email, password }),
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
  });
  if (!login.ok || (await login.json()).success !== true) return false;

  const accessToken = accessTokenFrom(login.headers.getSetCookie());
  if (!accessToken) return false;
  const headers = { apikey: owner.publicKey, authorization: 'Bearer ' + accessToken };
  let matches = false;
  try {
    const reply = await request(authOrigin + '/auth/v1/user', {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(7000),
    });
    if (reply.ok) {
      const user = await reply.json();
      // This Supabase response validates the JWT before the local account is opened.
      // A verified MFA enrollment requires its own completed flow.
      matches = user.id === owner.subject && user.email?.toLowerCase() === owner.email &&
        Boolean(user.email_confirmed_at) && user.is_anonymous !== true &&
        !user.factors?.some(factor => factor.status === 'verified');
    }
  } finally {
    // Close just the live session opened above, never any of the user's other sessions.
    const logout = await request(authOrigin + '/auth/v1/logout?scope=local', {
      method: 'POST',
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(7000),
    });
    if (!logout.ok) matches = false;
  }
  return matches;
}

function cleanHeaders(source) {
  const dynamic = String(source.connection ?? '').toLowerCase().split(',').map(field => field.trim());
  const hop = new Set([...dynamic, 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade']);
  return Object.fromEntries(Object.entries(source).filter(([key]) => !hop.has(key.toLowerCase())));
}

function finish(response, status) {
  if (!response.headersSent) {
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff' });
    response.end('{"success":false}');
  } else {
    response.destroy();
  }
}

function forward(request, response, port, body) {
  const headers = cleanHeaders(request.headers);
  if (body !== undefined) headers['content-length'] = body.length;
  const upstream = http.request({ host: '127.0.0.1', port, method: request.method,
    path: request.url, headers, agent: false }, result => {
    response.writeHead(result.statusCode, cleanHeaders(result.headers));
    result.once('error', () => response.destroy());
    result.pipe(response);
  });
  upstream.once('error', () => finish(response, 502));
  request.once('aborted', () => upstream.destroy());
  response.once('close', () => { if (!response.writableEnded) upstream.destroy(); });
  if (body === undefined) request.pipe(upstream);
  else upstream.end(body);
}

async function readLogin(request) {
  const limit = request.headers['content-length'];
  if (limit && (!/^\d+$/.test(limit) || Number(limit) > maxLoginBytes)) return null;
  const chunks = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > maxLoginBytes) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, received);
}

function createProxy({ owner, sandboxLogin, backendPort, verify = verifyErpPassword }) {
  return http.createServer(async (request, response) => {
    // Only the localhost authority is served. No external forwarded host is trusted.
    if (request.headers.host !== 'localhost:3000' || !/^\/(?!\/)/.test(request.url ?? '')) {
      finish(response, 403);
      return;
    }
    if (request.method !== 'POST' || request.url !== loginPath) {
      forward(request, response, backendPort);
      return;
    }
    if (request.headers.origin !== localOrigin ||
        ![undefined, 'same-origin'].includes(request.headers['sec-fetch-site'])) {
      finish(response, 403);
      return;
    }
    if (request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      finish(response, 415);
      return;
    }
    try {
      const body = await readLogin(request);
      if (!body) {
        finish(response, 413);
        return;
      }
      const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
      const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
      if (email !== owner.email) {
        forward(request, response, backendPort, body);
        return;
      }
      if (typeof input.password !== 'string' || !input.password.length || input.password.length > 1024 ||
          !await verify(owner, input.password)) {
        finish(response, 200);
        return;
      }
      // The normal ERP password and cookies are never sent to the synthetic stack.
      forward(request, response, backendPort, Buffer.from(JSON.stringify(sandboxLogin)));
    } catch {
      finish(response, 400);
    }
  });
}

function loadConfig(filename) {
  if (!filename || !path.isAbsolute(filename)) throw Error('Pass an absolute path to the local sign-in configuration.');
  const configName = realpathSync(filename);
  const project = path.resolve(__dirname, '..', '..');
  const inside = path.relative(project, configName);
  if (!inside.startsWith('..' + path.sep) && !path.isAbsolute(inside)) {
    throw Error('Store the local sign-in configuration outside the repository.');
  }
  const config = JSON.parse(readFileSync(configName, 'utf8').replace(/^\uFEFF/, ''));
  const { owner, sandboxLogin, backendPort = 3001 } = config;
  if (!/^[\w.-]+@algt\.net$/.test(owner?.email ?? '') ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(owner?.subject ?? '') ||
      !isPublicAuthKey(owner?.publicKey)) throw Error('A pinned ERP user and public Auth key are required.');
  if (!/^[\w.-]+@pilot\.example\.invalid$/.test(sandboxLogin?.email ?? '') ||
      typeof sandboxLogin.password !== 'string' || !sandboxLogin.password.length) {
    throw Error('A synthetic sandbox account is required.');
  }
  if (!Number.isInteger(backendPort) || backendPort <= 3000 || backendPort > 65535) {
    throw Error('Choose a separate loopback backend port.');
  }
  return { owner, sandboxLogin, backendPort };
}

function isPublicAuthKey(key) {
  if (typeof key !== 'string') return false;
  if (/^sb_publishable_[\w-]+$/.test(key)) return true;
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(key)) return false;
  try {
    const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    return claims.role === 'anon' && claims.ref === new URL(authOrigin).hostname.split('.')[0];
  } catch {
    return false;
  }
}

if (require.main === module) {
  const proxy = loadConfig(process.argv[2]);
  for (const host of ['127.0.0.1', '::1']) {
    createProxy(proxy).listen(3000, host, () => console.log('Sandbox ERP ready on ' + host + ':3000'));
  }
}

module.exports = { createProxy, verifyErpPassword };
