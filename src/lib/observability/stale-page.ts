/** A hint, never proof of a release or of whether a write committed. */
export function mayNeedCurrentPage(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'ChunkLoadError' ||
    /(?:Failed to find Server Action|Server Action [^\r\n]{1,256} was not found on the server|Loading chunk [^\r\n]{1,256} failed)/i.test(error.message);
}
