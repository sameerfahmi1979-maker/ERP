import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {afterAll,expect,it} from 'vitest';

const parent=process.platform==='win32'?'C:/dev/.cache/erp-performance-tests':path.resolve('.performance/overlay-tests');
fs.mkdirSync(parent,{recursive:true});
const root=fs.mkdtempSync(path.join(parent,'perf-overlay-'));
const digest=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
for(const [file,value]of [['src/view.tsx','synthetic view'],['tests/proof.test.ts','synthetic test'],['supabase/migrations/proof.sql','synthetic migration']]){
 fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});
 fs.writeFileSync(path.join(root,file),value);
}
afterAll(()=>{
 const target=path.resolve(root),allowed=path.resolve(parent)+path.sep+'perf-overlay-';
 if(!target.startsWith(allowed))throw Error('Exact owned test directory required');
 fs.rmSync(target,{recursive:true});
});
function current(dependencies:Record<string,string>,sourceSha256=digest('synthetic view')){
 // Execute the inventory's actual decision expression, including its old bug.
 const source=fs.readFileSync('tooling/performance/inventory.mjs','utf8');
 const expression=source.match(/const changed=([^;]+);/)?.[1];
 if(!expression)throw Error('Actual overlay decision must be tested');
 const helperPath=path.resolve('tooling/performance/overlay-source-check.cjs');
 const helper=fs.existsSync(helperPath)?createRequire(import.meta.url)(helperPath).overlaySourcesAreCurrent:undefined;
 const changed=vm.runInNewContext(expression,{root,overlay:{sourceSha256,acceptanceDependencies:dependencies},row:{sourceSha256:digest('synthetic view')},byPath:new Map([['src/view.tsx',{sourceSha256:digest('synthetic view')}]]),overlaySourcesAreCurrent:helper});
 return !changed;
}
it('retains a source-current overlay bound to tests and migrations, not just src discovery rows',()=>{
 expect(current({'src/view.tsx':digest('synthetic view'),'tests/proof.test.ts':digest('synthetic test'),'supabase/migrations/proof.sql':digest('synthetic migration')})).toBe(true);
});
it('still rejects a changed test dependency',()=>expect(current({'tests/proof.test.ts':digest('different test')})).toBe(false));
it('still rejects a changed migration dependency',()=>expect(current({'supabase/migrations/proof.sql':digest('different migration')})).toBe(false));
it('rejects missing dependencies instead of ignoring files outside the src graph',()=>expect(current({'tests/missing.test.ts':digest('synthetic test')})).toBe(false));
it('rejects a changed adopted source',()=>expect(current({},digest('different view'))).toBe(false));
it('keeps source-only overlay checks compatible',()=>expect(current({'src/view.tsx':digest('synthetic view')})).toBe(true));
it('refuses outside-worktree and absolute dependency paths',()=>{
 expect(current({'../outside':digest('synthetic test')})).toBe(false);
 expect(current({'C:/dev/outside':digest('synthetic test')})).toBe(false);
});
it('refuses a directory or an invalid dependency digest',()=>{
 expect(current({'tests':digest('synthetic test')})).toBe(false);
 expect(current({'tests/proof.test.ts':'not-a-digest'})).toBe(false);
});
