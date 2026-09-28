'use strict';
// Bounded unauthenticated HTTP smoke for this exact isolated build. Not pilot browser acceptance.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),net=require('node:net'),crypto=require('node:crypto');
const db=require('../f00/local-db.cjs'),g=require('../f00/target-guard.cjs');
const dir=path.join(g.ROOT,'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F04'),port=16404,origin='http://127.0.0.1:'+port;
(async()=>{
 db.assertDatabase();
 const build=JSON.parse(fs.readFileSync(path.join(dir,'BUILD_RESULT.json'),'utf8'));
 if(build.exit_code!==0||!path.resolve(build.target).startsWith(path.resolve(dir)+path.sep))throw Error('Unverified local build');
 const inputs=JSON.parse(fs.readFileSync(path.join(dir,'BUILD_INPUTS.json'),'utf8'));
 for(const item of inputs.inputs){
  const bytes=item.path==='src/lib/ai/common/dashboard/dashboard-collectors.ts'
    ?cp.execFileSync('git',['show','HEAD:'+item.path],{cwd:g.ROOT,windowsHide:true})
    :fs.readFileSync(path.join(g.ROOT,item.path));
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('Build source changed: '+item.path);
 }
 const env=JSON.parse(fs.readFileSync(path.join(dir,'private/build-env.json'),'utf8'));
 g.assertLocalUrl(env.NEXT_PUBLIC_SUPABASE_URL,g.PORTS.api);g.assertLocalUrl(env.NEXT_PUBLIC_SITE_URL,port);
 await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(port,'127.0.0.1',()=>server.close(resolve));});
 const log=fs.openSync(path.join(dir,'private/http-runtime.log'),'w');
 const child=cp.spawn(process.execPath,[path.join(g.ROOT,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:build.target,env,windowsHide:true,stdio:['ignore',log,log]});
 const exit=new Promise(resolve=>child.once('exit',resolve));
 const cases=[];
 try {
  let ready=false;
  for(let attempt=0;attempt<40;attempt++){try{const r=await fetch(origin+'/login',{redirect:'manual',signal:AbortSignal.timeout(2000)});if(r.status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
  if(!ready)throw Error('Preview did not become ready');
  for(const route of ['/login','/admin/hr/employees/record/new','/admin/hr/recruitment/candidates/record/new','/admin/common-master-data/departments/record/new']){
   const r=await fetch(origin+route,{redirect:'manual',signal:AbortSignal.timeout(10000)});
   const location=r.headers.get('location')||'';
   const pass=route==='/login'?r.status===200:[302,303,307,308].includes(r.status)&&new URL(location,origin).pathname==='/login';
   cases.push({route,status:r.status,redirectPath:location?new URL(location,origin).pathname:null,pass});
  }
 } finally {child.kill();await exit;fs.closeSync(log);}
 const result={at:new Date().toISOString(),scope:'unauthenticated local HTTP smoke only',buildHash:build.sourceManifestHash,production_configuration_loaded:false,owned_process_stopped:true,cases,pass:cases.length===4&&cases.every(test=>test.pass)};
 fs.writeFileSync(path.join(dir,'HTTP_SMOKE.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 if(!result.pass)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
