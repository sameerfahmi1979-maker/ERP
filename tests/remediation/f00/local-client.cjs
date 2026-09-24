'use strict';
const cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const g=require('./target-guard.cjs');
let cache;
function keys(){
 g.assertWorkdir();g.assertManifest(JSON.parse(fs.readFileSync(path.join(g.LOCAL,'environment.json'),'utf8')));
 if(!cache){const p=cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"supabase status --workdir '"+g.LOCAL.replaceAll("'","''")+"' --output json"],{encoding:'utf8',windowsHide:true});if(p.status!==0)throw Error('Local status failed');cache=JSON.parse(p.stdout);g.assertLocalUrl(cache.API_URL,g.PORTS.api);}
 if(!cache.ANON_KEY||!cache.SERVICE_ROLE_KEY)throw Error('Missing local API keys');return cache;
}
async function request(route,{method='GET',body,token,admin=false,headers={}}={}){
 if(!/^\/(auth|rest|storage)\/v1\//.test(route)||route.includes('://'))throw Error('Invalid local API path');
 const k=keys(),apiKey=admin?k.SERVICE_ROLE_KEY:k.ANON_KEY;
 const r=await fetch(k.API_URL+route,{method,headers:{apikey:apiKey,Authorization:'Bearer '+(token||apiKey),'Content-Type':'application/json',...headers},body:body===undefined?undefined:(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body)),redirect:'error',signal:AbortSignal.timeout(20000)});
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,ok:r.ok,data};
}
async function login(actor){g.assertRecipients([actor.email]);const r=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:actor.email,password:actor.password}});if(!r.ok||!r.data.access_token)throw Error('Local synthetic login failed: '+r.status);return r.data.access_token;}
module.exports={keys,request,login};
