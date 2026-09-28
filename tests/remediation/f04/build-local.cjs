'use strict';
// Isolated synthetic build; neither the source .env nor any production credential is copied.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const db=require('../f00/local-db.cjs'),api=require('../f00/local-client.cjs');
const root=path.resolve(__dirname,'../../..'),closure=true,evidence=path.join(root,'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F04');
fs.mkdirSync(evidence,{recursive:true});
// The owner's unrelated dirty collector is neither overwritten nor included in this candidate.
const excluded='src/lib/ai/common/dashboard/dashboard-collectors.ts';
const releasedCollector=closure?cp.execFileSync('git',['show','HEAD:'+excluded],{cwd:root,windowsHide:true}):null;
const target=path.join(evidence,'build-'+Date.now());
const previousResult=path.join(evidence,'BUILD_RESULT.json'),previousLog=path.join(evidence,'private/build.log');
if(fs.existsSync(previousResult)){
 const previous=JSON.parse(fs.readFileSync(previousResult,'utf8'));
 const history=path.join(evidence,'private/build-history');fs.mkdirSync(history,{recursive:true});
 const name=path.basename(previous.target);
 fs.copyFileSync(previousResult,path.join(history,name+'.json'));
 if(fs.existsSync(previousLog))fs.copyFileSync(previousLog,path.join(history,name+'.log'));
}
const inputs=[];
const inventory=(dir)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())inventory(file);else if(entry.isFile()){const rel=path.relative(root,file).replaceAll('\\','/');inputs.push({path:rel,sha256:crypto.createHash('sha256').update(closure&&rel===excluded?releasedCollector:fs.readFileSync(file)).digest('hex')});}}};
for(const dir of ['src','public','tooling'])inventory(path.join(root,dir));
for(const name of ['package.json','package-lock.json','tsconfig.json','tsconfig.shipping.json','next.config.ts','next-env.d.ts','postcss.config.mjs'])inputs.push({path:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')});
const sourceManifestHash=crypto.createHash('sha256').update(JSON.stringify(inputs)).digest('hex');
fs.writeFileSync(path.join(evidence,'BUILD_INPUTS.json'),JSON.stringify({at:new Date().toISOString(),sourceManifestHash,inputs},null,2));
db.assertDatabase();fs.mkdirSync(target,{recursive:true});
for(const dir of ['src','public','tooling'])fs.cpSync(path.join(root,dir),path.join(target,dir),{recursive:true});
if(closure)fs.writeFileSync(path.join(target,excluded),releasedCollector);
for(const name of ['package.json','package-lock.json','tsconfig.json','tsconfig.shipping.json','next.config.ts','next-env.d.ts','postcss.config.mjs'])fs.copyFileSync(path.join(root,name),path.join(target,name));
const dependency=path.join(target,'node_modules');fs.symlinkSync(path.join(root,'node_modules'),dependency,'junction');
if(fs.realpathSync(dependency)!==fs.realpathSync(path.join(root,'node_modules')))throw Error('Unexpected dependencies');
if(fs.readdirSync(target).some(name=>name.startsWith('.env')))throw Error('Unexpected build environment');
const k=api.keys(),env={};for(const key of ['PATH','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','APPDATA','LOCALAPPDATA'])if(process.env[key])env[key]=process.env[key];
Object.assign(env,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NODE_OPTIONS:'--max-old-space-size=12288 --no-experimental-webstorage',NEXT_PUBLIC_SUPABASE_URL:k.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:k.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:k.SERVICE_ROLE_KEY,NEXT_PUBLIC_SITE_URL:'http://127.0.0.1:16404',INTERNAL_SITE_URL:'http://127.0.0.1:16404',GOTENBERG_URL:'http://127.0.0.1:16430',INTERNAL_API_SECRET:crypto.randomBytes(32).toString('hex'),PDF_PRINT_TOKEN_SECRET:crypto.randomBytes(32).toString('hex'),AI_SECRET_FILE_WRITES_ENABLED:'false'});
// Use Windows' trusted certificate authorities; keep TLS verification enabled.
env.NODE_OPTIONS += ' --use-system-ca';
const privateDir=path.join(evidence,'private');fs.mkdirSync(privateDir,{recursive:true});fs.writeFileSync(path.join(privateDir,'build-env.json'),JSON.stringify(env),{mode:0o600});
const log=fs.openSync(path.join(privateDir,'build.log'),'w');
const child=cp.spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'build','--webpack'],{cwd:target,env,windowsHide:true,stdio:['ignore',log,log]});
console.log(JSON.stringify({target,child_pid:child.pid,mode:'synthetic-local-only',production_configuration_loaded:false}));
child.on('exit',code=>{fs.closeSync(log);const result={at:new Date().toISOString(),target,sourceManifestHash,exit_code:code,compiler:'webpack',typescript_gate:'enforced tsconfig.shipping.json',production_configuration_loaded:false};fs.writeFileSync(path.join(evidence,'BUILD_RESULT.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));process.exitCode=code||0;});
