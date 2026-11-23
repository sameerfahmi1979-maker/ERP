import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { syntheticPdf } from './document-fixtures';

const storageReads = vi.hoisted(() => ({ read: vi.fn(), info: vi.fn(), parse: vi.fn() }));
vi.mock('@/server/dms-file-verification', async importOriginal => ({
  ...await importOriginal<typeof import('@/server/dms-file-verification')>(),
  readBoundedDmsObject: storageReads.read,
}));
vi.mock('@/server/dms-document-parser', () => ({ validateDmsDocument: storageReads.parse }));

import { readVerifiedIntakeSource } from '@/server/dms-verified-intake-source';

const pdf = syntheticPdf();
const object = { id: '11111111-1111-4111-8111-111111111111', version: '1', lastModified: '2026-10-17T10:00:00Z' };
const source = {
  path: 'synthetic/original.pdf', name: 'original.pdf', mime: 'application/pdf', size: pdf.length,
  sha256: createHash('sha256').update(pdf).digest('hex'),
};
const storage = { info: storageReads.info } as unknown as ReturnType<SupabaseClient['storage']['from']>;

beforeEach(() => {
  vi.resetAllMocks();
  storageReads.info.mockResolvedValue({ data: object, error: null });
  storageReads.read.mockResolvedValue(new Blob([pdf]));
  storageReads.parse.mockResolvedValue(undefined);
});

it('returns the exact parsed Buffer, verified metadata and stable object identity from one materialization', async () => {
  const blob = new Blob([pdf]);
  const materialize = vi.spyOn(blob, 'arrayBuffer');
  storageReads.read.mockResolvedValue(blob);
  const result = await readVerifiedIntakeSource(storage, source);
  expect(result.bytes).toEqual(Buffer.from(pdf));
  expect(result.object).toEqual(object);
  expect(result.proof).toEqual({ sha256: source.sha256, size: pdf.length, mime: source.mime });
  expect(storageReads.read).toHaveBeenCalledExactlyOnceWith(storage, source.path, source.size);
  expect(storageReads.info).toHaveBeenCalledTimes(2);
  expect(materialize).toHaveBeenCalledTimes(1);
  expect(storageReads.parse).toHaveBeenCalledExactlyOnceWith(result.bytes, source.mime);
  expect(result.bytes).toBe(storageReads.parse.mock.calls[0][0]);
});

it('does not read when the identity is missing', async () => {
  storageReads.info.mockResolvedValue({ data: null, error: { message: 'private' } });
  await expect(readVerifiedIntakeSource(storage, source)).rejects.toThrow('identity');
  expect(storageReads.read).not.toHaveBeenCalled();
});

it('rejects replacement during parsing', async () => {
  storageReads.info.mockResolvedValueOnce({ data: object, error: null })
    .mockResolvedValueOnce({ data: { ...object, version: '2' }, error: null });
  await expect(readVerifiedIntakeSource(storage, source)).rejects.toThrow('changed');
});

it('does not expose any bytes when the parser rejects them', async () => {
  storageReads.parse.mockRejectedValue(Error('Invalid format'));
  await expect(readVerifiedIntakeSource(storage, source)).rejects.toThrow('Invalid format');
  expect(storageReads.info).toHaveBeenCalledTimes(1);
});

it('does not accept disappearance after a successful parse', async () => {
  storageReads.info.mockResolvedValueOnce({ data: object, error: null }).mockResolvedValueOnce({ data: null, error: {} });
  await expect(readVerifiedIntakeSource(storage, source)).rejects.toThrow('changed');
});

it.each([{ sha256: '0'.repeat(64) }, { size: 1 }, { mime: 'image/png' }])('checks source metadata %j before parsing', async change => {
  await expect(readVerifiedIntakeSource(storage, { ...source, ...change })).rejects.toThrow();
  expect(storageReads.parse).not.toHaveBeenCalled();
  expect(storageReads.info).toHaveBeenCalledTimes(1);
});
