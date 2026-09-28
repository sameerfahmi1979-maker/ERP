'use strict';
// Read-only release inventory and verification. Does not stage, commit, push, or deploy.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {ESLint}=require('eslint'),{assess}=require('../../../tooling/quality/lint.cjs'),{findSecrets}=require('../../../tooling/security/scan-secrets.cjs');
const root=path.resolve(__dirname,'../../..'),base=path.join(root,'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F04'),dir=path.join(base,process.argv[2]==='--closure'?'closure-20260928':process.argv[2]==='--acceptance'?'acceptance-20260928':'complex-adapters-20260928');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const git=args=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024}).trim();
(async()=>{
 const baseline=JSON.parse(fs.readFileSync(path.join(base,'BASELINE.json')));
 const preserved=baseline.modified_preserve.map(item=>({...item,current_sha256:sha(item.file),unchanged:sha(item.file)===item.sha256}));
 const excluded=new Set([...preserved.map(p=>p.file),'src/lib/ai/common/dashboard/dashboard-collectors.ts']);
 const files=git(['diff','--name-only']).split('\n').filter(f=>f&&!excluded.has(f));
 const newFiles=git(['ls-files','--others','--exclude-standard','src/hooks','src/lib/workspace','src/server/workspace-save.ts','tests/remediation/f04','supabase/migrations/20260928045514_f04_atomic_workspace_saves.sql']).split('\n').filter(Boolean);
 for(const file of newFiles)if(!files.includes(file))files.push(file);
 files.sort();
 if(files.some(f=>!(/^(src\/|tests\/remediation\/(f04\/|f02-final\/|vitest.config.mts$)|tooling\/quality\/lint.cjs$|supabase\/migrations\/20260928045514_f04_atomic_workspace_saves.sql$)/.test(f)||f==='.gitignore')))throw Error('Unexpected file in candidate');
 const manifest={at:new Date().toISOString(),branch:git(['branch','--show-current']),base:git(['rev-parse','HEAD']),files:files.map(file=>({file,status:fs.existsSync(path.join(root,file))?'present':'removed',sha256:fs.existsSync(path.join(root,file))?sha(file):null}))};
 fs.writeFileSync(path.join(dir,'SOURCE_MANIFEST.json'),JSON.stringify(manifest,null,2));
 const exact=[],envFile=path.join(root,'.env.local');
 if(fs.existsSync(envFile))for(const line of fs.readFileSync(envFile,'utf8').split(/\r?\n/)){
  const m=line.match(/^([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);if(m&&!m[1].startsWith('NEXT_PUBLIC_')&&/SECRET|PASSWORD|API_KEY|SERVICE_ROLE_KEY|TOKEN/.test(m[1]))exact.push({name:m[1],value:m[2].replace(/^(["'])(.*)\1$/,'$2')});
 }
 const secrets=manifest.files.filter(f=>f.status==='present').flatMap(f=>{const hits=findSecrets(fs.readFileSync(path.join(root,f.file),'utf8'),exact);return hits.length?[{file:f.file,hits}]:[];});
 fs.writeFileSync(path.join(dir,'SECRET_SCAN.json'),JSON.stringify({scope:'exact candidate source allowlist; not private evidence or full Git history',files:files.length,findings:secrets},null,2));
 const type=cp.spawnSync(process.execPath,['node_modules/typescript/bin/tsc','--project','tsconfig.shipping.json','--noEmit'],{cwd:root,encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(dir,'TYPECHECK.log'),type.stdout+type.stderr);
 const eslint=new ESLint({cwd:root});const lint=assess(await eslint.lintFiles(['src','next.config.ts']),JSON.parse(fs.readFileSync(path.join(root,'tooling/quality/lint-warning-baseline.json'))),root);fs.writeFileSync(path.join(dir,'LINT_RESULT.json'),JSON.stringify(lint,null,2));
 const suites=['UNIT_RESULT','REMEDIATION_RESULT'].map(name=>{const r=JSON.parse(fs.readFileSync(path.join(dir,name+'.json')));return {name,pass:r.success,passed:r.numPassedTests,failed:r.numFailedTests,pending:r.numPendingTests};});
 const remediation=JSON.parse(fs.readFileSync(path.join(dir,'REMEDIATION_RESULT.json')));
 const focused=remediation.testResults.filter(r=>r.name.replaceAll('\\','/').includes('/f04/')).flatMap(r=>r.assertionResults.map(t=>({name:t.fullName,status:t.status})));
 fs.writeFileSync(path.join(dir,'CASE_RESULTS.json'),JSON.stringify(focused,null,2));
 const build=JSON.parse(fs.readFileSync(path.join(base,'BUILD_RESULT.json'))),inputs=JSON.parse(fs.readFileSync(path.join(base,'BUILD_INPUTS.json')));
 const build_inputs_current=inputs.inputs.every(f=>f.path==='src/lib/ai/common/dashboard/dashboard-collectors.ts'||sha(f.path)===f.sha256);
 const checks_pass=type.status===0&&lint.pass&&suites.every(s=>s.pass)&&build_inputs_current&&build.exit_code===0&&secrets.length===0&&preserved.every(p=>p.unchanged);
 const receipt={at:new Date().toISOString(),status:'LOCAL_RELEASE_PREPARATION_ONLY',checks_pass,typecheck_exit:type.status,lint,suites,focused_cases:focused.length,build,build_inputs_current,secret_findings:secrets.length,preserved,production_writes:0,git_publication:false,deployment:false,release_authorized:false};
 fs.writeFileSync(path.join(dir,'CHECKPOINT.json'),JSON.stringify(receipt,null,2));
 console.log(JSON.stringify({...receipt,preserved:preserved.filter(p=>!p.unchanged),build:build.exit_code},null,2));if(!checks_pass)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
