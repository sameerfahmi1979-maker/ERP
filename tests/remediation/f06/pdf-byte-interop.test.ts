import {it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
it('runs real PDF parser/application byte-interop regressions without a mocked extractor',()=>{
 const actual=spawnSync(process.execPath,['--test','tests/remediation/f06/pdf-byte-interop.cjs'],{cwd:process.cwd(),encoding:'utf8',timeout:25000,windowsHide:true,maxBuffer:2*1024*1024});
 expect(actual.error,actual.stderr).toBeUndefined();expect(actual.signal).toBeNull();expect(actual.status,actual.stdout+'\n'+actual.stderr).toBe(0);expect(actual.stdout).toMatch(/# tests 3\b/);expect(actual.stdout).toMatch(/# pass 3\b/);expect(actual.stdout).toMatch(/# fail 0\b/);
},30000);
