const graphOrigin = 'https://graph.microsoft.com';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const itemId = /^[A-Za-z0-9_!-]{1,256}$/;
const supportedMime = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export class ConnectionError extends Error {}

export function readConnectionConfig(env) {
  function id(name, pattern) {
    const value = env[name];
    if (typeof value !== 'string' || !pattern.test(value)) {
      throw new ConnectionError(`invalid_${name}`);
    }
    return value;
  }

  const config = {
    tenantId: id('GRAPH_TENANT_ID', uuid),
    clientId: id('GRAPH_CLIENT_ID', uuid),
    driveId: id('GRAPH_DRIVE_ID', itemId),
    sourceId: id('GRAPH_SOURCE_FOLDER_ID', itemId),
    indexId: id('GRAPH_INDEX_FOLDER_ID', itemId),
  };
  if (config.sourceId === config.indexId) throw new ConnectionError('distinct_folders_required');
  if (!env.GRAPH_CLIENT_SECRET?.trim()) throw new ConnectionError('missing_GRAPH_CLIENT_SECRET');
  return Object.freeze({ ...config, clientSecret: env.GRAPH_CLIENT_SECRET });
}

function isDeltaCursor(value, driveId) {
  if (typeof value !== 'string' || value.length > 32768) return false;
  try {
    const url = new URL(value);
    if (url.origin !== graphOrigin || url.username || url.password || url.hash) return false;
    const [, version, drives, drive, root, action] = url.pathname.split('/');
    if (version !== 'v1.0' || drives !== 'drives' || decodeURIComponent(drive) !== driveId || root !== 'root') return false;
    if (!action || url.pathname.split('/').length !== 6) return false;
    if (/^delta\(token=.+\)$/.test(action)) return true;
    const token = url.searchParams.get('token') || url.searchParams.get('$skiptoken');
    return action === 'delta' && Boolean(token) && token !== 'latest';
  } catch {
    return false;
  }
}

export function createSharePointConnection(config, { fetch = globalThis.fetch, now = Date.now } = {}) {
  let cachedToken;
  const tokenURL = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
  const driveURL = `${graphOrigin}/v1.0/drives/${config.driveId}`;

  async function request(stage, url, options) {
    let response;
    try {
      const deadline = AbortSignal.timeout(15_000);
      const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
      response = await fetch(url, { ...options, redirect: 'error', signal });
    } catch {
      throw new ConnectionError(`${stage}_unreachable`);
    }
    if (!response.ok) {
      if (response.status === 401) cachedToken = undefined;
      await response.body?.cancel().catch(() => {});
      throw new ConnectionError(`${stage}_http_${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new ConnectionError(`${stage}_invalid_json`);
    }
  }

  async function acquireToken(signal) {
    if (cachedToken && cachedToken.expiresAt > now()) return cachedToken.value;
    const startedAt = now();
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: `${graphOrigin}/.default`,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    const result = await request('entra_token', tokenURL, { method: 'POST', body, signal });
    if (typeof result?.access_token !== 'string' || !result.access_token ||
        typeof result.token_type !== 'string' || result.token_type.toLowerCase() !== 'bearer' ||
        !Number.isFinite(result.expires_in) || result.expires_in <= 0) {
      throw new ConnectionError('entra_token_invalid');
    }
    cachedToken = { value: result.access_token, expiresAt: startedAt + (result.expires_in - 60) * 1000 };
    return cachedToken.value;
  }

  async function get(stage, url, signal) {
    const token = await acquireToken(signal);
    return request(stage, url, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal });
  }

  async function verifyFolder(stage, id, parent) {
    const folder = await get(`${stage}_metadata`, `${driveURL}/items/${id}?$select=id,name,folder,parentReference`);
    if (folder?.id !== id || !folder.folder || folder.parentReference?.driveId !== config.driveId ||
        (parent && (folder.parentReference.id !== parent || folder.name !== '_AgentIndex'))) {
      throw new ConnectionError(`${stage}_folder_mismatch`);
    }
  }

  async function verifyFolders() {
    await verifyFolder('source', config.sourceId);
    await verifyFolder('index', config.indexId, config.sourceId);
  }

  async function readItem(id, signal) {
    try {
      const item = await get('delta_item', `${driveURL}/items/${id}?$select=id,name,folder,file,parentReference,eTag,cTag,size`, signal);
      if (item?.id !== id) throw new ConnectionError('delta_item_mismatch');
      return item;
    } catch (error) {
      if (error instanceof ConnectionError && ['delta_item_http_404', 'delta_item_http_403'].includes(error.message)) return null;
      throw error;
    }
  }

  async function readChangePage(cursor, shutdown) {
    if (cursor !== null && !isDeltaCursor(cursor, config.driveId)) throw new ConnectionError('delta_cursor_invalid');
    const deadline = AbortSignal.timeout(90_000);
    const signal = shutdown ? AbortSignal.any([deadline, shutdown]) : deadline;
    const initial = new URLSearchParams({ token: 'latest', $top: '50', $select: 'id,parentReference,deleted' });
    const result = await get('delta_page', cursor ?? `${driveURL}/root/delta?${initial}`, signal);
    const next = result?.['@odata.nextLink'];
    const final = result?.['@odata.deltaLink'];
    const continuation = next ?? final;
    if (!Array.isArray(result?.value) || result.value.length > 512 ||
        (next != null && (final != null || continuation === cursor)) || !isDeltaCursor(continuation, config.driveId) ||
        (cursor === null && (result.value.length !== 0 || next != null))) {
      throw new ConnectionError('delta_page_invalid');
    }
    // The delta feed may repeat an ID. Use its last occurrence on the page.
    const latest = new Map();
    for (const entry of result.value) {
      if (typeof entry?.id !== 'string' || !itemId.test(entry.id)) throw new ConnectionError('delta_item_invalid');
      latest.set(entry.id, entry);
    }
    const changes = [];
    const parents = new Map();
    for (const [id, entry] of latest) {
      if (id === config.sourceId || id === config.indexId) continue;
      const item = entry.deleted ? null : await readItem(id, signal);
      const ancestors = item ? await resolveAncestry(item, parents, signal) : null;
      if (!ancestors) {
        // SQL applies this only to already-known items and descendants.
        changes.push({ id, kind: 'unavailable' });
        continue;
      }
      if (!supportedMime.has(item.file?.mimeType)) continue;
      const tag = item.cTag || item.eTag;
      if (typeof tag !== 'string' || !tag || typeof item.name !== 'string' || !item.name ||
          !Number.isSafeInteger(item.size) || item.size < 0) throw new ConnectionError('delta_file_metadata_invalid');
      changes.push({ id, kind: 'file', name: item.name, version: `${item.cTag ? 'c' : 'e'}:${tag}`,
        mime: item.file.mimeType, size: item.size, ancestors });
    }
    return { cursor: continuation, more: next != null, changes };
  }

  async function resolveAncestry(item, parents, signal) {
    const visited = new Set([item.id]);
    const ancestors = [];
    let current = item;
    while (current?.parentReference?.driveId === config.driveId && current.parentReference.id) {
      const parent = current.parentReference.id;
      if (parent === config.indexId) return null;
      if (typeof parent !== 'string' || !itemId.test(parent) || visited.has(parent) || ancestors.length >= 32) {
        throw new ConnectionError('delta_ancestry_invalid');
      }
      ancestors.push(parent);
      if (parent === config.sourceId) return ancestors;
      visited.add(parent);
      if (!parents.has(parent)) parents.set(parent, await readItem(parent, signal));
      current = parents.get(parent);
      if (!current?.folder) return null;
    }
    return null;
  }

  async function readApprovedPdf(id, etag, shutdown, version) {
    if (!itemId.test(id)) throw new ConnectionError('pilot_item_invalid');
    if (version === undefined && !etag) throw new ConnectionError('pilot_source_unverified');
    const deadline = AbortSignal.timeout(45_000);
    const signal = shutdown ? AbortSignal.any([shutdown, deadline]) : deadline;
    const first = await readItem(id, signal);
    const observedVersion = first && (first.cTag ? `c:${first.cTag}` : `e:${first.eTag}`);
    if (first?.file?.mimeType !== 'application/pdf' || typeof first.eTag !== 'string' || !first.eTag ||
        (version !== undefined && observedVersion !== version) ||
        (etag !== undefined && first.eTag !== etag) ||
        !Number.isSafeInteger(first.size) || first.size < 1 || first.size > 3 * 1024 * 1024 ||
        !await resolveAncestry(first, new Map(), signal)) {
      throw new ConnectionError('pilot_source_unverified');
    }

    let response;
    try {
      const token = await acquireToken(signal);
      response = await fetch(`${driveURL}/items/${id}/content`, {
        method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'manual', signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel().catch(() => {});
        const target = new URL(location);
        if (target.origin !== 'https://algtnet.sharepoint.com' || target.username || target.password || target.hash) {
          throw new ConnectionError('pilot_download_destination_invalid');
        }
        response = await fetch(target, { method: 'GET', redirect: 'error', signal });
      }
    } catch (error) {
      if (error instanceof ConnectionError) throw error;
      throw new ConnectionError('pilot_download_unavailable');
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {});
      throw new ConnectionError('pilot_download_unavailable');
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > first.size) throw new ConnectionError('pilot_size_changed');
      chunks.push(chunk);
    }
    const last = await readItem(id, signal);
    if (size !== first.size || last?.size !== first.size || last.eTag !== first.eTag || last.cTag !== first.cTag || last.name !== first.name ||
        last.parentReference?.id !== first.parentReference.id || !await resolveAncestry(last, new Map(), signal)) {
      throw new ConnectionError('pilot_source_changed');
    }
    return { name: first.name, bytes: Buffer.concat(chunks) };
  }

  return {
    verifyFolders,
    readChangePage,
    readApprovedPdf,
    readDiscoveredPdf: (id, version, signal, etag) => {
      if (typeof version !== 'string' || !/^[ce]:.+$/.test(version)) {
        throw new ConnectionError('pilot_source_version_invalid');
      }
      return readApprovedPdf(id, etag, signal, version);
    },
    async probe() {
      await verifyFolders();
      const query = new URLSearchParams({ token: 'latest', $select: 'id,parentReference,deleted' });
      const delta = await get('delta_cursor', `${driveURL}/root/delta?${query}`);
      if (!Array.isArray(delta?.value) || delta.value.length !== 0 || delta['@odata.nextLink'] ||
          !isDeltaCursor(delta['@odata.deltaLink'], config.driveId)) {
        throw new ConnectionError('delta_cursor_invalid');
      }
      return { source: 'verified', index: 'verified', delta: 'verified' };
    },
  };
}
