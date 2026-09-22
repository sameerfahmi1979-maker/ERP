import { createRequire } from 'node:module';
import { expect,it } from 'vitest';
const {assess,warningKey}=createRequire(import.meta.url)('../../../tooling/quality/lint.cjs');
const root=process.cwd(),file=root+'/src/synthetic.ts';
const warning={severity:1,ruleId:'synthetic-warning',message:'Retained advisory'};
const baseline={warnings:[{key:warningKey(root,file,warning),count:1}]};
it('still fails for an error even when warnings are approved',()=>{expect(assess([{filePath:file,errorCount:1,messages:[warning]}],baseline,root).pass).toBe(false);});
it('rejects new and duplicated warnings',()=>{
 expect(assess([{filePath:file,errorCount:0,messages:[warning,warning]}],baseline,root).pass).toBe(false);
 expect(assess([{filePath:file,errorCount:0,messages:[{...warning,message:'New advisory'}]}],baseline,root).pass).toBe(false);
});
it('allows reducing a reviewed backlog, without disabling the underlying rule',()=>{expect(assess([{filePath:file,errorCount:0,messages:[]}],baseline,root).pass).toBe(true);});
it('gives embedded diagnostic filenames the same identity on Windows and Linux',()=>{
 const windows={...warning,message:'Retained advisory\nC:\\dev\\agt-erp\\src\\synthetic.ts:4:2\ncode frame'};
 const linux={...warning,message:'Retained advisory\n/app/src/synthetic.ts:4:2\ncode frame'};
 expect(warningKey('C:\\dev\\agt-erp','C:\\dev\\agt-erp\\src\\synthetic.ts',windows)).toBe(warningKey('/app','/app/src/synthetic.ts',linux));
 const forwardSlash={...warning,message:'Retained advisory\nC:/dev/agt-erp/src/synthetic.ts:4:2\ncode frame'};
 expect(warningKey('C:\\dev\\agt-erp','C:\\dev\\agt-erp\\src\\synthetic.ts',forwardSlash)).toBe(warningKey('/app','/app/src/synthetic.ts',linux));
});
