import { ConnectionError } from './connection.mjs';

export async function discoverChanges({ sharePoint, ledger, signal, pageLimit = 5 }) {
  let pages = 0;
  let candidates = 0;
  let verified = false;
  while (pages < pageLimit && !signal?.aborted) {
    const checkpoint = await ledger.read();
    if (checkpoint.paused) return { status: 'paused', pages, candidates };
    if (!verified) {
      await sharePoint.verifyFolders();
      verified = true;
    }
    let page;
    try {
      page = await sharePoint.readChangePage(checkpoint.cursor, signal);
    } catch (error) {
      if (signal?.aborted) break;
      if (error instanceof ConnectionError && error.message === 'delta_page_http_410') {
        return { status: 'recovery_required', pages, candidates };
      }
      throw error;
    }
    if (signal?.aborted) break;
    const status = await ledger.commit(checkpoint, page);
    if (status !== 'committed') return { status, pages, candidates };
    pages++;
    candidates += page.changes.filter(change => change.kind === 'file').length;
    if (!page.more) return { status: 'caught_up', pages, candidates };
  }
  return { status: signal?.aborted ? 'stopping' : 'more_pages', pages, candidates };
}
