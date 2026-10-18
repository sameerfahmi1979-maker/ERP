import {vi} from 'vitest';
vi.mock('server-only',()=>({}));
globalThis.fetch=async()=>{throw Error('F10 offline acceptance: external network disabled');};
