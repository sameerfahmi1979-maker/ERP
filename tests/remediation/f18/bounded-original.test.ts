import { afterEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readBoundedOriginal } from '@/lib/output/bounded-original';
type Storage = ReturnType<SupabaseClient['storage']['from']>;
const storage = (stream: ReadableStream<Uint8Array>) => ({ download: vi.fn(() => ({ asStream: async () => ({ data: stream, error: null }) })) }) as unknown as Storage;
afterEach(() => vi.useRealTimers());
it('returns exact streamed original bytes', async () => {
  const s = storage(new Blob(['synthetic original']).stream());
  expect(await readBoundedOriginal(s, 'retained.pdf')).toEqual(Buffer.from('synthetic original'));
  expect(s.download).toHaveBeenCalledWith('retained.pdf', {}, expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }));
});
it('rejects excessive bytes while streaming without awaiting broken cancellation', async () => {
  const cancel = vi.fn(() => new Promise<void>(() => {}));
  const s = storage(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(33554433)); }, cancel }));
  await expect(readBoundedOriginal(s, 'retained.pdf')).rejects.toThrow('bounds'); expect(cancel).toHaveBeenCalledOnce();
});
it('bounds a stalled read even when cancellation never settles', async () => {
  vi.useFakeTimers(); const s = storage(new ReadableStream({ pull: () => new Promise<void>(() => {}), cancel: () => new Promise<void>(() => {}) }));
  const checked = expect(readBoundedOriginal(s, 'retained.pdf')).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(30000); await checked;
});
it('bounds a missing transfer response before a reader exists', async () => {
  vi.useFakeTimers(); const s = { download: () => ({ asStream: () => new Promise(() => {}) }) } as unknown as Storage;
  const checked = expect(readBoundedOriginal(s, 'retained.pdf')).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(30000); await checked;
});
