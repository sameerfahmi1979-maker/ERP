'use strict';
// Local-only built-artifact/bridge rehearsal; no production URL, mail or SQL mutations.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),dir=path.join(root,'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F03');
const guard=require('../f00/target-guard.cjs');
const build=JSON.parse(fs.readFileSync(path.join(dir,'BUILD_RESULT.json'),'utf8'));
assert.equal(build.exit_code,0);assert(build.target.startsWith(dir+path.sep));
const inputs=JSON.parse(fs.readFileSync(path.join(dir,'BUILD_INPUTS.json'),'utf8'));
assert.equal(inputs.sourceManifestHash,build.sourceManifestHash);
for(const f of inputs.inputs)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f.path))).digest('hex'),f.sha256,'Build source drift '+f.path);
const run='f03-maintenance-'+crypto.randomBytes(5).toString('hex'),packageDir=path.join(dir,'private',run),container=run,image='algt-f03-maintenance:'+run;
const output=path.join(dir,'MAINTENANCE_HTTP_2026_09_25.json');assert(!fs.existsSync(output),'Evidence exists; inspect rather than repeat');
const r={at:new Date().toISOString(),run,build_manifest:build.sourceManifestHash,production_mutations:0,database_mutations:0,external_emails:0,cases:[],pass:false,cleanup:false};
const save=()=>fs.writeFileSync(output,JSON.stringify(r,null,2));save();
const children=[],logs=[];let bridgeCreated=false;
const docker=args=>cp.execFileSync('docker',args,{cwd:root,windowsHide:true,encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});
const log=name=>{const fd=fs.openSync(path.join(packageDir,name),'w');logs.push(fd);return fd;};
async function get(port,url,options={}){assert([16434,16435,16436].includes(port));return fetch('http://127.0.0.1:'+port+url,{...options,redirect:'manual',signal:AbortSignal.timeout(5000)});}
async function ready(port){for(let n=0;n<40;n++){try{if((await get(port,'/api/health/release')).status===200)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('Local process did not become healthy');}
const check=name=>{r.cases.push(name);save();};
async function blocked(port,label){
 for(const url of ['/','/login','/auth/confirm?token_hash=synthetic','/auth/verify?invitation=synthetic','/dashboard','/api/internal/process-email-queue','/api/dms/files/test/download','/api/files/private.png','/_next/static/app.js','/_next/image?url=/test.png']){
  const res=await get(port,url);assert.equal(res.status,503,label+url);assert(res.headers.get('cache-control').includes('no-store'));assert.equal(res.headers.get('retry-after'),'120');assert(!res.headers.get('set-cookie'));assert.equal((await res.json()).error,'maintenance');check(label+' GET '+url.split('?')[0]);
 }
 for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS']){
  const res=await get(port,'/dashboard',{method,headers:{'next-action':'synthetic','authorization':'Bearer synthetic','x-middleware-subrequest':'proxy:proxy:proxy:proxy:proxy'},body:method==='POST'?'synthetic only':undefined});assert.equal(res.status,503);check(label+' '+method+' denied');
 }
 const health=await (await get(port,'/api/health/release')).json();assert.equal(health.status,'maintenance');assert.equal(health.check,'liveness-only');check(label+' healthy while held');
 assert.equal((await get(port,'/api/health/release',{method:'POST'})).status,503);check(label+' health POST denied');
 const head=await get(port,'/dashboard',{method:'HEAD'});assert.equal(head.status,503);assert.equal(await head.text(),'');check(label+' HEAD denied without body');
 const html=await get(port,'/login',{headers:{accept:'text/html'}});assert((await html.text()).includes('We’re updating your ERP.'));assert(html.headers.get('content-security-policy').includes("default-src 'none'"));check(label+' branded static page');
}
function startApp(port,mode){
 const env=JSON.parse(fs.readFileSync(path.join(dir,'private/build-env.json'),'utf8'));guard.assertLocalUrl(env.NEXT_PUBLIC_SUPABASE_URL,16421);assert(!Object.values(env).some(v=>String(v).includes(guard.PRODUCTION_REF)));
 env.ERP_MAINTENANCE_MODE=mode;
 const fd=log('next-'+mode+'.log');const child=cp.spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:build.target,env,windowsHide:true,stdio:['ignore',fd,fd]});children.push(child);child.on('error',()=>{});return child;
}
(async()=>{
 try{
  fs.mkdirSync(path.join(packageDir,'public'),{recursive:true});fs.mkdirSync(path.join(packageDir,'tooling/release'),{recursive:true});
  for(const file of ['public/maintenance.html','tooling/release/maintenance-server.cjs'])fs.copyFileSync(path.join(root,file),path.join(packageDir,file));
  fs.copyFileSync(path.join(root,'tooling/release/Dockerfile.maintenance'),path.join(packageDir,'Dockerfile'));
  const built=cp.spawnSync('docker',['build','--tag',image,packageDir],{cwd:root,windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});fs.writeFileSync(path.join(packageDir,'docker-build.log'),built.stdout+built.stderr);assert.equal(built.status,0,'Maintenance image build failed');
  docker(['create','--name',container,'--label','codex.f03.maintenance='+run,'--publish','127.0.0.1:16434:8080',image]);bridgeCreated=true;docker(['start',container]);await ready(16434);await blocked(16434,'bridge');
  const inspection=JSON.parse(docker(['inspect',container]))[0];assert.equal(inspection.Config.User,'node');assert(!inspection.Config.Env.some(v=>/SUPABASE|SECRET|PASSWORD|TOKEN/.test(v)));check('bridge image has no database/provider secrets and runs non-root');
  startApp(16435,'1');await ready(16435);await blocked(16435,'held app');
  // Same immutable build, runtime mode changed; no rebuild or schema modification.
  startApp(16436,'0');await ready(16436);
  assert.equal((await get(16436,'/login')).status,200);check('released same build serves login');
  const denied=await get(16436,'/dashboard');assert.equal(denied.status,307);assert(denied.headers.get('location').includes('/login'));check('released same build retains anonymous business denial');
  const healthy=await (await get(16436,'/api/health/release')).json();assert.equal(healthy.status,'ok');check('released same build reports liveness only');
  const asset=await get(16436,'/maintenance.html');assert.equal(asset.status,200);check('released same build serves static assets');
  r.pass=true;
 }catch(e){r.error=e.message;}
 finally{
  for(const child of children){if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}}
  for(const fd of logs)fs.closeSync(fd);
  if(bridgeCreated){const c=JSON.parse(docker(['inspect',container]))[0];assert.equal(c.Config.Labels['codex.f03.maintenance'],run);docker(['rm','--force',container]);}
  r.cleanup=children.every(c=>c.exitCode!==null||c.signalCode!==null)&&(!bridgeCreated||!docker(['ps','-a','--filter','name=^/'+container+'$','--format','{{.Names}}']).trim());
  r.retained_local_image=image;r.finished_at=new Date().toISOString();r.limits='Loopback built-app/maintenance behavior only. Railway drain/removal, scheduler pause, applied production migrations, legitimate signed-in canaries and mailbox acceptance are not proven by this rehearsal.';save();
 }
 console.log(JSON.stringify(r));if(!r.pass||!r.cleanup)process.exitCode=1;
})();
