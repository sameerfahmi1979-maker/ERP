import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const runtime=path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F09/local');
const request=(method,url,body)=>new Promise((resolve,reject)=>{
 const text=body?JSON.stringify(body):'';
 const r=http.request({socketPath:'//./pipe/dockerDesktopLinuxEngine',path:url,method,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(text)}},s=>{
 let value='';s.on('data',b=>value+=b);s.on('end',()=>s.statusCode>=300?reject(Error('Docker operation failed '+s.statusCode)):resolve(value?JSON.parse(value):null));
 });r.on('error',reject);r.end(text);
});
const authOnly=process.argv[2]==='enable-local-email-login';
for(const name of authOnly?['supabase_auth_algt-f09-local']:['supabase_db_algt-f09-local','supabase_inbucket_algt-f09-local','supabase_kong_algt-f09-local']){
 const c=JSON.parse(execFileSync('docker',['inspect',name],{encoding:'utf8'}))[0];
 assert.equal(c.Config.Labels['com.supabase.cli.project'],'algt-f09-local');assert.equal(c.State.Running,false);
 fs.writeFileSync(path.join(runtime,name+'-rebind-private.json'),JSON.stringify(c));
 if(authOnly){
  assert.ok(c.Config.Env.includes('GOTRUE_DISABLE_SIGNUP=true'));
  c.Config.Env=c.Config.Env.map(x=>x==='GOTRUE_EXTERNAL_EMAIL_ENABLED=false'?'GOTRUE_EXTERNAL_EMAIL_ENABLED=true':x);
 }
 for(const bindings of Object.values(c.HostConfig.PortBindings))for(const b of bindings){assert.ok(['16521','16522','16524','16525'].includes(b.HostPort));b.HostIp='127.0.0.1';}
 const networks={};for(const [net,value] of Object.entries(c.NetworkSettings.Networks)){assert.equal(net,'algt-f09-loopback');networks[net]={Aliases:value.Aliases.filter(x=>x!==c.Id.slice(0,12))};}
 await request('DELETE','/containers/'+c.Id);
 await request('POST','/containers/create?name='+name,{...c.Config,HostConfig:c.HostConfig,NetworkingConfig:{EndpointsConfig:networks}});
 await request('POST','/containers/'+name+'/start');
 console.log('Recreated loopback-only container '+name+'; original volumes retained.');
}
