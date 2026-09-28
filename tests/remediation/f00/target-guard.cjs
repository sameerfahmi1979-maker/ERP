'use strict';
const fs=require('node:fs');
const path=require('node:path');
const PROJECT='algt-f00-local';
const PRODUCTION_REF='mmiefuieduzdiiwnqpie';
const ROOT=path.resolve(__dirname,'../../..');
const LOCAL=path.join(ROOT,'CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F00/local');
const PORTS={api:16421,db:16422,mail:16424,smtp:16425,renderer:16430,banner:16400};
function assertLocalUrl(raw,port){
  let u;try{u=new URL(raw);}catch{throw Error('Invalid local service URL');}
  if(u.username||u.password||u.search||u.hash||u.protocol!=='http:'||u.hostname!=='127.0.0.1'||Number(u.port)!==port||u.pathname!=='/')throw Error('Only the exact F00 loopback endpoint is allowed');
  return u;
}
function assertManifest(m){
  if(!m||m.project_id!==PROJECT||m.synthetic_only!==true||m.external_delivery!==false||m.real_signatures!==false||m.production_project_ref!==PRODUCTION_REF)throw Error('Unsafe or incomplete F00 identity manifest');
  for(const name of ['api','mail','renderer'])assertLocalUrl(m[name+'_url'],PORTS[name]);
  if(m.database_host!=='127.0.0.1'||m.database_port!==PORTS.db)throw Error('Database target must be F00 loopback');
  return true;
}
function assertWorkdir(dir=LOCAL){
  if(path.resolve(dir)!==LOCAL)throw Error('Wrong local workdir');
  const config=fs.readFileSync(path.join(dir,'supabase/config.toml'),'utf8');
  if(!config.includes('project_id = "'+PROJECT+'"')||config.includes(PRODUCTION_REF))throw Error('Refusing production-linked configuration');
  if(fs.existsSync(path.join(dir,'supabase/.temp/project-ref')))throw Error('Local-only stack must never be linked');
}
function assertRecipients(recipients){
  if(!Array.isArray(recipients)||!recipients.length||recipients.some(x=>typeof x!=='string'||!/^f00-[a-z0-9-]+@example\.invalid$/.test(x)))throw Error('Only explicitly synthetic F00 recipients are allowed');
}
module.exports={PROJECT,PRODUCTION_REF,ROOT,LOCAL,PORTS,assertLocalUrl,assertManifest,assertWorkdir,assertRecipients};
