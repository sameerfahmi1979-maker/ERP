'use strict';
// Stage only the reviewed candidate. Does not commit, push, merge or deploy.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),dir=path.join(root,'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F04/closure-20260928');
const git=args=>cp.execFileSync('git',['-c','core.safecrlf=false',...args],{cwd:root,windowsHide:true,encoding:'utf8',maxBuffer:32*1024*1024}).trim();
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'SOURCE_MANIFEST.json'))),quality=JSON.parse(fs.readFileSync(path.join(dir,'CHECKPOINT.json')));
assert.equal(manifest.branch,'codex/f04-workspace-forms');assert.equal(git(['branch','--show-current']),manifest.branch);assert.equal(git(['rev-parse','HEAD']),manifest.base);assert.equal(git(['diff','--cached','--name-only']),'');assert.equal(quality.checks_pass,true);
assert.equal(git(['remote','get-url','origin']),'https://github.com/sameerfahmi1979-maker/ERP.git');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
for(const row of manifest.files){
 assert.ok(!/CODEX_AUDIT|private|\.env|dashboard-collectors/.test(row.file));
 if(row.status==='present')assert.equal(hash(row.file),row.sha256,'Changed candidate: '+row.file);else assert.ok(!fs.existsSync(path.join(root,row.file)));
}
for(const row of quality.preserved)assert.equal(hash(row.file),row.sha256,'Unrelated work changed');
const files=manifest.files.map(f=>f.file).sort();git(['add','--',...files]);assert.deepEqual(git(['diff','--cached','--name-only']).split('\n').sort(),files);git(['diff','--cached','--check']);
for(const row of manifest.files)if(row.status==='present')assert.equal(git(['hash-object','--path='+row.file,row.file]),git(['rev-parse',':'+row.file]));
const scan=cp.spawnSync(process.execPath,['tooling/security/scan-secrets.cjs','--staged'],{cwd:root,windowsHide:true,encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(scan.status,0);fs.writeFileSync(path.join(dir,'STAGED_SECRET_SCAN.json'),scan.stdout);
fs.writeFileSync(path.join(dir,'STAGED.json'),JSON.stringify({at:new Date().toISOString(),base:manifest.base,branch:manifest.branch,files,approval:'Publish the F04 branch and run checks only',merge_authorized:false,deploy_authorized:false,committed:false,pushed:false},null,2));
console.log(JSON.stringify({files:files.length,secret_scan:'PASS',staged_only:true}));
