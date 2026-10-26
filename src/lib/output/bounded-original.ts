import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_RENDERED_PDF_BYTES } from '@/lib/pdf/validate-response';

/** Bound bytes before buffering the Storage SDK response. An unavailable or
 * interrupted original stays recoverable; cancellation must never delay exit. */
export async function readBoundedOriginal(storage: ReturnType<SupabaseClient['storage']['from']>, path: string): Promise<Buffer> {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
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
      if (size > MAX_RENDERED_PDF_BYTES) throw new Error('Original bytes exceed the accepted bounds.');
      parts.push(Buffer.from(next.value));
    }
    if (!size) throw new Error('Original bytes are outside the accepted bounds.');
    return Buffer.concat(parts, size);
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
    if (reader) {
      try { void reader.cancel().catch(() => {}); } catch { /* Best effort. */ }
      try { reader.releaseLock(); } catch { /* Pending read. */ }
    }
  }
}
