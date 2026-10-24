'use strict';
// Local non-browser verification. Writes only generated receipts/logs to an explicit C:/dev directory.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const node='C:/dev/toolchains/node-v22.23.4-win-x64/node.exe';
const output=process.argv[2];
if(!output || !/^C:[/\\]dev[/\\]/i.test(path.resolve(output)) || fs.existsSync(output)) throw Error('Specify a new verification folder under C:/dev');
fs.mkdirSync(output,{recursive:true});
const git=(...args)=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).trim();
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function identity(){
  const files=[...new Set([...git('diff','--name-only','HEAD').split(/\r?\n/),...git('ls-files','--others','--exclude-standard').split(/\r?\n/)])].filter(Boolean).sort();
  return {head:git('rev-parse','HEAD'),files:files.map(file=>({file,sha256:hash(fs.readFileSync(path.join(root,file)))}))};
}
const source=identity();
// Deliberately omit inherited credentials and provider/worker configuration.
const env={};
for(const key of ['PATH','SystemRoot','SYSTEMROOT','COMSPEC','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[key])env[key]=process.env[key];
Object.assign(env,{CI:'true',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:16421',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-ci-public-key',NEXT_PUBLIC_SITE_URL:'http://127.0.0.1:16401',NODE_OPTIONS:'--use-system-ca --no-experimental-webstorage --max-old-space-size=16384'});
const gates=[
  ['inventory',['tooling/quality/embedded-list-audit.cjs','--check']],
  ['tests',['node_modules/vitest/vitest.mjs','run','--config','tests/remediation/f05/embedded-regressions.config.mts','--silent','--reporter=json','--outputFile='+path.join(output,'tests.json')]],
  ['types',['node_modules/typescript/bin/tsc','--project','tsconfig.shipping.json','--noEmit']],
  ['lint',['tooling/quality/lint.cjs']],
  ['vendor',['tooling/security/verify-vendor-patches.cjs']],
  ['secrets',['tooling/security/scan-secrets.cjs']],
  ['build',['node_modules/next/dist/bin/next','build','--webpack']],
];
const results=[];
const save=()=>fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify({source,results,productionChanges:false,browserTesting:false},null,2));
(async()=>{
 for(const[name,args]of gates){
  if(JSON.stringify(identity())!==JSON.stringify(source))throw Error('Source changed during verification; do not accept mixed identities');
  const file=path.join(output,name+'.log'),fd=fs.openSync(file,'wx'),started=new Date().toISOString();
  const child=cp.spawn(node,args,{cwd:root,env:{...env,NODE_ENV:name==='tests'?'test':'production'},windowsHide:true,stdio:['ignore',fd,fd]});
  const result=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',(code,signal)=>resolve({code,signal}));});fs.closeSync(fd);
  results.push({name,started,finished:new Date().toISOString(),...result,logSha256:hash(fs.readFileSync(file))});save();console.log(JSON.stringify(results.at(-1)));
  if(result.code!==0 || result.signal)throw Error(name+' failed; fix and rerun affected gates before acceptance');
 }
 if(JSON.stringify(identity())!==JSON.stringify(source))throw Error('Final source differs from checked source');
 const tests=JSON.parse(fs.readFileSync(path.join(output,'tests.json'),'utf8'));
 console.log(JSON.stringify({pass:true,tests:tests.numPassedTests,failed:tests.numFailedTests,suites:tests.testResults.length,buildId:fs.readFileSync(path.join(root,'.next/BUILD_ID'),'utf8').trim()}));
})().catch(error=>{save();console.error(error.message);process.exitCode=1;});
