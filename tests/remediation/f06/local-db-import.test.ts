// The local database helper is also imported by other test commands. Their
// argument names must never dispatch the helper's standalone CLI operations.
import {afterEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({execFileSync:vi.fn(),spawnSync:vi.fn()}));
vi.mock('node:child_process',()=>mock);
const originalArgv=[...process.argv];
afterEach(()=>{process.argv=originalArgv;vi.resetModules();vi.clearAllMocks();});
it.each(['restore','inspect','catalog','apply','refresh-numbering'])('import does not execute the caller argument %s',async(command)=>{
 process.argv=['node','C:/dev/agt-erp-f06/tests/remediation/f06/another-test.mjs',command];
 await import('./local-db.mjs');
 expect(mock.execFileSync).not.toHaveBeenCalled();expect(mock.spawnSync).not.toHaveBeenCalled();
});
