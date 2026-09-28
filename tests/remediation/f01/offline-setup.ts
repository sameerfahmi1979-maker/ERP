import { vi } from 'vitest';
vi.mock('server-only',()=>({}));
vi.stubGlobal('fetch',()=>{throw new Error('Network prohibited in F01 unit tests');});
