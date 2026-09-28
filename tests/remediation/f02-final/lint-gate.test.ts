import { createRequire } from 'node:module';
import { expect,it } from 'vitest';
const {assess,warningKey}=createRequire(import.meta.url)('../../../tooling/quality/lint.cjs');
it('compiler advisory line movement is stable while duplicate calls still fail',()=>{
 const old=JSON.stringify(['src/table.tsx','react-hooks/incompatible-library','Compiler advisory\n\n<file>:10:5\n10 | useReactTable']);
 const moved={severity:1,ruleId:'react-hooks/incompatible-library',message:'Compiler advisory\n\n/app/src/table.tsx:20:5\n20 | useReactTable'};
 const base={warnings:[{key:old,count:1}]};
 expect(assess([{filePath:'/app/src/table.tsx',errorCount:0,messages:[moved]}],base,'/app').pass).toBe(true);
 expect(assess([{filePath:'/app/src/table.tsx',errorCount:0,messages:[moved,moved]}],base,'/app').pass).toBe(false);
 expect(assess([{filePath:'/app/src/table.tsx',errorCount:0,messages:[{...moved,message:'Different compiler advisory'}]}],base,'/app').pass).toBe(false);
});
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
