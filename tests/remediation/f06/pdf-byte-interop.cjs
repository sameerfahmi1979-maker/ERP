// Portable actual-dependency regression. Synthetic bytes only; no network/DB.
/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the actual CommonJS parser and scoped TypeScript loader, not mocked imports. */
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const {createHash}=require('node:crypto');
const ts=require('typescript');
const {jsPDF}=require('jspdf');
const root=process.cwd();
const allowed=new Set(['src/lib/dms/file-content-extractor.ts','src/lib/dms/pdf-to-images.ts','src/lib/dms/pdf-text-quality.ts','src/lib/logger.ts']);
const originalResolve=Module._resolveFilename,originalTs=Module._extensions['.ts'];
let extractFileContent;
try{
 Module._resolveFilename=function(request,parent,...rest){if(request.startsWith('@/'))request=path.join(root,'src',request.slice(2));return originalResolve.call(this,request,parent,...rest);};
 Module._extensions['.ts']=function(module,filename){assert.ok(allowed.has(path.relative(root,filename).split(path.sep).join('/')));const result=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.Node16,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});module._compile(result.outputText,filename);};
 ({extractFileContent}=require(path.join(root,'src/lib/dms/file-content-extractor.ts')));
}finally{Module._resolveFilename=originalResolve;if(originalTs)Module._extensions['.ts']=originalTs;else delete Module._extensions['.ts'];}
const marker='F06 synthetic digital document byte interoperability verification';
function pdfBytes(){const pdf=new jsPDF({compress:false});pdf.text(marker,10,20);return Buffer.from(pdf.output('arraybuffer'));}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function textResult(result){assert.equal(result.method,'pdf-text-layer');assert.equal(result.hasContent,true);assert.equal(result.images.length,0);assert.ok(result.text.includes(marker));}
test('small actual generated PDF Buffer extracts real text without rendering',{timeout:15000},async()=>{
 const bytes=pdfBytes(),before=digest(bytes);assert.ok(bytes.length<8192);textResult(await extractFileContent(bytes,'application/pdf','synthetic-text.pdf'));assert.equal(digest(bytes),before);
});
test('nonzero-offset Buffer excludes sentinel bytes and preserves the complete backing store',{timeout:15000},async()=>{
 const pdf=pdfBytes(),backing=Buffer.alloc(pdf.length+47,0x5a);pdf.copy(backing,13);const bytes=backing.subarray(13,13+pdf.length),before=digest(backing);assert.equal(bytes.byteOffset,13);assert.ok(bytes.equals(pdf));
 textResult(await extractFileContent(bytes,'application/pdf','synthetic-offset.pdf'));assert.equal(digest(backing),before);assert.ok(backing.subarray(0,13).every(b=>b===0x5a));assert.ok(backing.subarray(13+pdf.length).every(b=>b===0x5a));
});
test('repeat real extraction preserves deterministic text and original request bytes',{timeout:15000},async()=>{
 const bytes=pdfBytes(),before=digest(bytes),first=await extractFileContent(bytes,'application/pdf','synthetic-repeat.pdf'),second=await extractFileContent(bytes,'application/pdf','synthetic-repeat.pdf');textResult(first);textResult(second);assert.deepEqual(second,first);assert.equal(digest(bytes),before);
});
