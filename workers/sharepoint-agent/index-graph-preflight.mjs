const graphOrigin = 'https://graph.microsoft.com';
const sharePointOrigin = 'https://algtnet.sharepoint.com';
const fileName = 'hr-document-index.json';
const graphId = /^[A-Za-z0-9_!-]{1,256}$/u;
const strongEtag = /^"[\x21\x23-\x7e]{1,1024}"$/u;
const bearerToken = /^[A-Za-z0-9._~+/-]+=*$/u;
const maxIndexBytes = 3 * 1024 * 1024;

class IndexPreflightError extends Error {}

async function discard(response) {
  await response.body?.cancel().catch(() => {});
}

function verifiedDownloadURL(location) {
  let url;
  try { url = new URL(location); }
  catch { throw new IndexPreflightError('index_preflight_download_destination_invalid'); }
  if (url.origin !== sharePointOrigin || url.username || url.password || url.hash) {
    throw new IndexPreflightError('index_preflight_download_destination_invalid');
  }
  return url;
}

async function readContentBytes(response, expectedSize) {
  let size = 0;
  const chunks = [];
  try {
    if (response.body) {
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > expectedSize) throw new IndexPreflightError('index_preflight_size_mismatch');
        chunks.push(chunk);
      }
    }
  } catch (error) {
    if (error instanceof IndexPreflightError) throw error;
    throw new IndexPreflightError('index_preflight_content_unavailable');
  }
  if (size !== expectedSize) throw new IndexPreflightError('index_preflight_size_mismatch');
  return Buffer.concat(chunks, size);
}

// This diagnostic reader checks one existing item without writes. Matching
// metadata on either side of download cannot prove the bytes belong to that
// eTag. Keep this result distinct from the publisher's transport read result.
export function createIndexGraphPreflight({ destination, accessToken, fetch }) {
  const { driveId, indexFolderId, fileId } = destination ?? {};
  if (![driveId, indexFolderId, fileId].every(value => typeof value === 'string' && graphId.test(value)) ||
      fileId === indexFolderId) {
    throw new IndexPreflightError('index_preflight_invalid_destination');
  }
  if (typeof accessToken !== 'string' || !bearerToken.test(accessToken) || typeof fetch !== 'function') {
    throw new IndexPreflightError('index_preflight_invalid_reader');
  }
  const binding = Object.freeze({ driveId, indexFolderId, fileId, name: fileName });
  const itemURL = `${graphOrigin}/v1.0/drives/${driveId}/items/${fileId}`;
  const select = new URLSearchParams({ $select: 'id,name,file,folder,remoteItem,deleted,parentReference,eTag,size' });
  const graphHeaders = Object.freeze({ Authorization: `Bearer ${accessToken}` });

  async function get(stage, url, signal, redirect, headers) {
    try {
      const response = await fetch(url, { method: 'GET', headers, signal, redirect, credentials: 'omit', cache: 'no-store' });
      if (!(response instanceof Response) || response.redirected) throw new Error();
      return response;
    } catch {
      throw new IndexPreflightError(`index_preflight_${stage}_unavailable`);
    }
  }

  async function metadata(signal) {
    const response = await get('metadata', `${itemURL}?${select}`, signal, 'error', graphHeaders);
    if (response.status !== 200) {
      await discard(response);
      throw new IndexPreflightError(`index_preflight_metadata_http_${response.status}`);
    }
    let item;
    try { item = await response.json(); }
    catch { throw new IndexPreflightError('index_preflight_metadata_invalid'); }
    if (item?.id !== fileId || item.name !== fileName || !item.file || typeof item.file !== 'object' ||
        Array.isArray(item.file) || item.folder != null || item.remoteItem != null || item.deleted != null ||
        item.parentReference?.id !== indexFolderId || item.parentReference.driveId !== driveId) {
      throw new IndexPreflightError('index_preflight_destination_mismatch');
    }
    if (typeof item.eTag !== 'string' || !strongEtag.test(item.eTag)) {
      throw new IndexPreflightError('index_preflight_invalid_etag');
    }
    if (!Number.isSafeInteger(item.size) || item.size < 0 || item.size > maxIndexBytes) {
      throw new IndexPreflightError('index_preflight_invalid_size');
    }
    return { etag: item.eTag, size: item.size };
  }

  return Object.freeze({
    async read() {
      const signal = AbortSignal.timeout(45_000);
      const before = await metadata(signal);
      let response = await get('content', `${itemURL}/content`, signal, 'manual', graphHeaders);
      if (response.status === 302) {
        const location = response.headers.get('location');
        await discard(response);
        response = await get('content', verifiedDownloadURL(location), signal, 'error');
      }
      if (response.status !== 200) {
        await discard(response);
        throw new IndexPreflightError(`index_preflight_content_http_${response.status}`);
      }
      const body = await readContentBytes(response, before.size);
      const after = await metadata(signal);
      if (before.etag !== after.etag || before.size !== after.size) {
        throw new IndexPreflightError('index_preflight_changed');
      }
      return { binding, observedMetadataETag: after.etag, body };
    },
  });
}
