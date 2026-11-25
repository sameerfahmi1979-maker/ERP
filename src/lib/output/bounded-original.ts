import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_RENDERED_PDF_BYTES } from '@/lib/pdf/validate-response';

export class OriginalSizeMismatchError extends Error {}

export function validOriginalSize(size: unknown): size is number {
  return typeof size === "number" && Number.isSafeInteger(size) && size > 0 && size <= MAX_RENDERED_PDF_BYTES;
}

/** Bound bytes before buffering the Storage SDK response. An unavailable or
 * interrupted original stays recoverable; cancellation must never delay exit. */
export async function readBoundedOriginal(storage: ReturnType<SupabaseClient['storage']['from']>, path: string, expectedBytes?: number, signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted();
  if (expectedBytes !== undefined && !validOriginalSize(expectedBytes)) {
    throw new OriginalSizeMismatchError('The retained original manifest is outside the accepted bounds.');
  }
  const limit = expectedBytes ?? MAX_RENDERED_PDF_BYTES;
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    cancel = () => {
      controller.abort();
      reject(new Error('Original transfer cancelled.'));
    };
    signal?.addEventListener('abort', cancel, {once: true});
    timer = setTimeout(() => { controller.abort(); reject(new Error('Original verification transfer timed out. Retain this issuance for recovery.')); }, 30000);
  });
  try {
    const pending = Promise.resolve(storage.download(path, {}, { signal: controller.signal, cache: 'no-store' }).asStream());
    void pending.then(result => {
      if (controller.signal.aborted && result.data) {
        try { void result.data.cancel().catch(() => {}); } catch { /* Already locked. */ }
      }
    }, () => {});
    const result = await Promise.race([pending, deadline]);
    if (result.error || !result.data) throw new Error('Original bytes are unavailable. Retain this issuance for recovery.');
    reader = result.data.getReader();
    const parts: Buffer[] = []; let size = 0;
    for (;;) {
      const next = await Promise.race([reader.read(), deadline]);
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) throw new Error('Invalid original byte stream.');
      size += next.value.byteLength;
      if (size > limit) throw new OriginalSizeMismatchError('Original bytes exceed the accepted bounds.');
      parts.push(Buffer.from(next.value));
    }
    if (!size || (expectedBytes !== undefined && size !== expectedBytes)) {
      throw new OriginalSizeMismatchError('Original bytes are outside the accepted bounds.');
    }
    return Buffer.concat(parts, size);
  } finally {
    if (timer) clearTimeout(timer);
    if (cancel) signal?.removeEventListener('abort', cancel);
    controller.abort();
    if (reader) {
      try { void reader.cancel().catch(() => {}); } catch { /* Best effort. */ }
      try { reader.releaseLock(); } catch { /* Pending read. */ }
    }
  }
}
