'use strict';
// Private checkpoint collector. No remote calls, application writes or database operations.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {ESLint}=require('eslint'),{assess}=require('../../../tooling/quality/lint.cjs');
const root=path.resolve(__dirname,'../../..'),out=path.join(root,'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F04');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const git=args=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
(async()=>{
 const baseline=JSON.parse(fs.readFileSync(path.join(out,'BASELINE.json'),'utf8'));
 const preserved=baseline.modified_preserve.map(item=>({...item,unchanged:sha(item.file)===item.sha256}));
 const exclude=new Set(preserved.map(item=>item.file));
 const files=git(['diff','--name-only']).split('\n').filter(file=>file&&!exclude.has(file));
 for(const file of git(['ls-files','--others','--exclude-standard','src/hooks','src/lib/workspace','tests/remediation/f04']).split('\n').filter(Boolean))if(!files.includes(file))files.push(file);
 const source=files.map(file=>({file,sha256:sha(file)}));
 fs.writeFileSync(path.join(out,'SOURCE_MANIFEST.json'),JSON.stringify({at:new Date().toISOString(),base:git(['rev-parse','HEAD']),branch:git(['branch','--show-current']),files:source},null,2));
 const types=cp.spawnSync(process.execPath,['node_modules/typescript/bin/tsc','--project','tsconfig.shipping.json','--noEmit'],{cwd:root,encoding:'utf8',windowsHide:true});
 fs.writeFileSync(path.join(out,'TYPECHECK.log'),types.stdout+types.stderr);
 const eslint=new ESLint({cwd:root}),results=await eslint.lintFiles(['src','next.config.ts']);
 const lint=assess(results,JSON.parse(fs.readFileSync(path.join(root,'tooling/quality/lint-warning-baseline.json'),'utf8')),root);
 fs.writeFileSync(path.join(out,'LINT_RESULT.json'),JSON.stringify(lint,null,2));
 const suites=['UNIT_RESULT','REMEDIATION_RESULT'].map(name=>{const r=JSON.parse(fs.readFileSync(path.join(out,name+'.json'),'utf8'));return {name,pass:r.success,passed:r.numPassedTests,failed:r.numFailedTests,pending:r.numPendingTests};});
 const focused=JSON.parse(fs.readFileSync(path.join(out,'REMEDIATION_RESULT.json'),'utf8')).testResults.filter(item=>item.name.replaceAll('\\','/').includes('/remediation/f04/')).flatMap(item=>item.assertionResults.map(test=>({file:path.basename(item.name),name:test.fullName,status:test.status})));
 const build=JSON.parse(fs.readFileSync(path.join(out,'BUILD_RESULT.json'),'utf8'));
 const http=JSON.parse(fs.readFileSync(path.join(out,'HTTP_SMOKE.json'),'utf8'));
 const receipt={at:new Date().toISOString(),phase:'F04',status:'IN_PROGRESS_LOCAL_ONLY',typecheck_exit:types.status,lint,suites,focused_count:focused.length,focused,preserved,production_writes:0,database_migrations:0,fixture_writes:0,git_publication:false,deployment:false,build,http};
 fs.writeFileSync(path.join(out,'CURRENT_EXECUTION_LEDGER.json'),JSON.stringify(receipt,null,2));
 console.log(JSON.stringify({status:receipt.status,typecheck_exit:types.status,lint,suites,focused:focused.length,unrelated_preserved:preserved.filter(p=>p.unchanged).length,source_files:source.length}));
 if(types.status||!lint.pass||suites.some(s=>!s.pass)||preserved.some(p=>!p.unchanged)||build.exit_code!==0||!http.pass)process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1;});
