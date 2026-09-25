'use strict';
// Disposable isolated Auth process. Reuses only guarded local DB/mail-sink configuration.
const cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const db=require('../f00/local-db.cjs'),api=require('../f00/local-client.cjs'),guard=require('../f00/target-guard.cjs');
const docker=args=>cp.execFileSync('docker',args,{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
async function start(){
 db.assertDatabase();const k=api.keys();assert.equal(k.API_URL,'http://127.0.0.1:16421');
 const source=JSON.parse(docker(['inspect','supabase_auth_'+guard.PROJECT]))[0];
 assert.equal(source.Config.Labels['com.supabase.cli.project'],guard.PROJECT);assert(source.State.Running);assert(source.NetworkSettings.Networks['algt-f00-loopback']);
 const run=crypto.randomBytes(6).toString('hex'),name='f03-secure-password-'+run,base='http://127.0.0.1:16427';
 const env={...process.env},names=[];
 for(const entry of source.Config.Env){const i=entry.indexOf('='),key=entry.slice(0,i),value=entry.slice(i+1);
  if(!/^(GOTRUE_[A-Z0-9_]+|API_EXTERNAL_URL|PORT)$/.test(key))continue;
  assert(!value.includes(guard.PRODUCTION_REF));env[key]=value;names.push(key);
 }
 assert(env.GOTRUE_DB_DATABASE_URL?.includes('supabase_db_'+guard.PROJECT));
 assert(env.GOTRUE_SMTP_HOST?.includes('supabase_inbucket_'+guard.PROJECT));
 const overrides={GOTRUE_DISABLE_SIGNUP:'true',GOTRUE_MAILER_AUTOCONFIRM:'false',GOTRUE_PASSWORD_MIN_LENGTH:'10',GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION:'true',GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD:'false'};
 for(const [key,value] of Object.entries(overrides)){env[key]=value;if(!names.includes(key))names.push(key);}
 const stop=()=>{const c=JSON.parse(docker(['inspect',name]))[0];assert.equal(c.Name,'/'+name);assert.equal(c.Config.Labels['codex.f03.secure-password'],run);docker(['rm','--force',name]);};
 cp.execFileSync('docker',['create','--name',name,'--label','codex.f03.secure-password='+run,'--network','algt-f00-loopback','--publish','127.0.0.1:16427:9999',...names.flatMap(key=>['--env',key]),source.Image],{env,windowsHide:true,encoding:'utf8'});
 try{
  docker(['start',name]);
  for(let i=0;i<30;i++){
   try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(1000)})).ok)return {name,base,keys:k,stop,image:source.Image};}catch{}
   await new Promise(r=>setTimeout(r,500));
  }
  throw Error('Isolated secure Auth did not become healthy');
 }catch(e){stop();throw e;}
}
module.exports={start};
