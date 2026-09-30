import { vi } from 'vitest';
vi.mock('server-only', () => ({}));
// Fail closed: no production env is loaded and no test may send a real request.
globalThis.fetch = async () => { throw new Error('F09 tests: outbound network disabled'); };
