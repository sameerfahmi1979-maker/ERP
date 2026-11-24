/** Offline existing-key issuer. No SQL, provider, environment, approval or runtime action. */
import {createPrivateKey,createPublicKey,randomUUID,sign} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {assertProtectedWindowsPath,PILOT_END} from './commission-communication-pilot.mjs';
const fail=(ok,message)=>{if(!ok)throw Error(message);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fields=['v','planId','deploymentId','poolId','allocationId','startsAt','until','maxPhysicalStarts','maxStorageObjects','maxRelations','planHash'];
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
export function prepareBaselineCollector(input,keyBytes,{now=Date.now()}={}) {
 fail(input&&typeof input==='object'&&!Array.isArray(input)&&fields.every(k=>Object.hasOwn(input,k))&&Object.keys(input).every(k=>fields.includes(k)),'Invalid collector fields');
 fail(input.v===1,'Unsupported collector version');
 for(const k of ['planId','deploymentId','poolId','allocationId'])fail(typeof input[k]==='string'&&uuid.test(input[k]),'Actual canonical '+k+' required');
 const start=Date.parse(input.startsAt),until=Date.parse(input.until);
 fail(Number.isFinite(start)&&new Date(start).toISOString()===input.startsAt&&start%60000===0,'Collector startsAt must be an exact canonical UTC minute');
 fail(Number.isFinite(until)&&new Date(until).toISOString()===input.until&&until<=Date.parse(PILOT_END)&&until>now+60000&&until<=start+7200000,'Invalid finite collector cutoff');
 fail(start>=Math.floor(now/60000)*60000&&start<=Math.floor(now/60000)*60000+60000,'Collector start must be current or next minute');
 for(const [name,max]of [['maxPhysicalStarts',16],['maxStorageObjects',100000],['maxRelations',8192]])
  fail(Number.isSafeInteger(input[name])&&input[name]>=1&&input[name]<=max,'Invalid '+name);
 fail(typeof input.planHash==='string'&&/^[0-9a-f]{64}$/.test(input.planHash),'Reviewed actual plan hash required');
 const maxTicks=Math.ceil((until-start)/60000);fail(maxTicks>=1&&maxTicks<=120,'Invalid collector tick count');
 const key=createPrivateKey(keyBytes);fail(key.asymmetricKeyType==='ed25519','Existing Ed25519 issuer required');
 const payload={v:1,purpose:'erp-communication-baseline-plan',planId:input.planId,deploymentId:input.deploymentId,poolId:input.poolId,
  allocationId:input.allocationId,startsAt:input.startsAt,until:input.until,maxTicks,maxPhysicalStarts:input.maxPhysicalStarts,
  maxStorageObjects:input.maxStorageObjects,maxRelations:input.maxRelations,planHash:input.planHash,nonces:Array.from({length:maxTicks},()=>randomUUID())};
 const body=Buffer.from(JSON.stringify(payload)),manifest=body.toString('base64url')+'.'+sign(null,body,key).toString('base64url');
 const tickTokens=payload.nonces.map((nonce,index)=>{
  const {nonces,...scope}=payload;void nonces;
  const tick={...scope,purpose:'erp-communication-baseline-tick',intent:'measure-baseline',nonce,ordinal:index+1,scheduledAt:new Date(start+index*60000).toISOString()};
  const bytes=Buffer.from(JSON.stringify(tick));const token=bytes.toString('base64url')+'.'+sign(null,bytes,key).toString('base64url');
  fail(token.length<=4096,'Tick envelope exceeds fixed bound');return token;
 });
 fail(manifest.length<=16384,'Collector envelope exceeds fixed byte bound');
 const enrollmentSql=`-- Prepared only. Future tick tokens stay in the protected plan; only the current one-use cap is queued.\nbegin;\ninsert into erp_comm_cost.baseline_collector_plan(id,pool,allocation_id,deployment_id,manifest,plan_hash,starts_at,until_at,max_ticks,max_physical_starts,max_storage_objects,max_relations,nonces,tick_tokens) values(${quote(payload.planId)}::uuid,${quote(payload.poolId)}::uuid,${quote(payload.allocationId)}::uuid,${quote(payload.deploymentId)}::uuid,${quote(manifest)},${quote(payload.planHash)},${quote(payload.startsAt)}::timestamptz,${quote(payload.until)}::timestamptz,${maxTicks},${payload.maxPhysicalStarts},${payload.maxStorageObjects},${payload.maxRelations},array[${payload.nonces.map(n=>quote(n)+'::uuid').join(',')}],array[${tickTokens.map(quote).join(',')}]);\ncommit;\n`;
 const startSql=`-- Separate effectful finite activation. No new amount, proof, quota or service.\nselect erp_comm_cost.start_baseline_collector(${quote(payload.planId)}::uuid);\n`;
 return {payload,manifest,tickTokens,enrollmentSql,startSql,publicKey:createPublicKey(key).export({format:'der',type:'spki'}).toString('base64'),
  env:{ERP_COMM_BASELINE_COLLECTOR_ENABLED:'true',ERP_COMM_BASELINE_COLLECTOR_PLAN_ID:payload.planId,ERP_COMM_BASELINE_COLLECTOR_UNTIL:payload.until}};
}
function main(args) {
 fail(args.length===6&&args[0]==='--spec'&&args[2]==='--issuer-key'&&args[4]==='--out','Usage: node tooling/local/prepare-baseline-collector.mjs --spec <C:\\dev\\spec.json> --issuer-key <existing-protected-key> --out <existing-protected-directory>');
 const [spec,keyFile,out]=[args[1],args[3],args[5]].map(value=>resolve(value));
 for(const p of [spec,keyFile,out])fail(isAbsolute(p)&&/^C:[\\/]/i.test(p),'Collector artifacts and key must resolve to C:');
 assertProtectedWindowsPath(dirname(keyFile),true);assertProtectedWindowsPath(keyFile,false);assertProtectedWindowsPath(out,true);
 const result=prepareBaselineCollector(JSON.parse(readFileSync(spec,'utf8')),readFileSync(keyFile));
 for(const [name,body]of [['plan.json',JSON.stringify(result.payload,null,2)+'\n'],['enroll.sql',result.enrollmentSql],['start.sql',result.startSql],
  ['app-env.json',JSON.stringify(result.env,null,2)+'\n'],['public-key.txt',result.publicKey+'\n']]){
  const file=join(out,name);writeFileSync(file,body,{flag:'wx',mode:0o600});assertProtectedWindowsPath(file,false);
 }
 process.stdout.write('Prepared private finite collector artifacts; not applied or activated.\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{main(process.argv.slice(2));}catch(error){process.stderr.write((error instanceof Error?error.message:'Collector preparation failed')+'\n');process.exitCode=1;}}
