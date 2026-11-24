/** Offline existing-issuer preparation only. No SQL, provider, flags or approvals are applied. */
import {createHash,createPrivateKey,randomUUID,sign} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {prepareProfiles} from './prepare-communication-pilot-profiles.mjs';
import {assertProtectedWindowsPath,PILOT_END} from './commission-communication-pilot.mjs';
const fail=(ok,message)=>{if(!ok)throw Error(message);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fields=['v','planId','deploymentId','allocationId','approvalId','approvalFingerprint','startsAt','until','controlUntil','maxPhysicalStarts','calendarEnabled','pushEnabled','profileSha256'];
const exact=(value,names)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===names.length&&names.every(name=>Object.hasOwn(value,name));
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
export function notificationPlanHash(manifest,poolId){
 return createHash('sha256').update(['signed-notifications-v2',poolId,...fields.map(k=>manifest[k]),60,1,125].join('\n'),'utf8').digest('hex');
}
export function prepareSignedNotificationTicks(manifest,receipt,keyBytes,{now=Date.now()}={}){
 fail(exact(manifest,fields)&&exact(receipt,['poolId','manifest','planHash'])&&exact(receipt.manifest,fields),'Compiled manifest and original funding receipt required');
 fail(fields.every(k=>manifest[k]===receipt.manifest[k]),'Original funding does not match the compiled review');
 const input={...manifest,poolId:receipt.poolId,planHash:notificationPlanHash(manifest,receipt.poolId)};
 fail(input.planHash===receipt.planHash,'Original funding receipt hash mismatch');
 fail(input.v===1&&/^[a-f0-9]{64}$/.test(input.approvalFingerprint)&&/^[a-f0-9]{64}$/.test(input.profileSha256),'Invalid reviewed approval or profile digest');
 for(const name of ['planId','deploymentId','poolId','allocationId','approvalId'])fail(typeof input[name]==='string'&&uuid.test(input[name]),'Actual canonical '+name+' required');
 const start=Date.parse(input.startsAt),until=Date.parse(input.until),control=Date.parse(input.controlUntil);
 for(const [name,value]of [['startsAt',start],['until',until],['controlUntil',control]])
  fail(Number.isFinite(value)&&new Date(value).toISOString()===input[name],'Canonical finite UTC '+name+' required');
 fail(start%60000===0&&until%60000===0&&start===Math.floor(now/60000)*60000+60000,'Notification start must be next UTC minute');
 fail(until>now+60000&&until>start&&until<=start+7200000&&control>=until+125000&&control<=Date.parse(PILOT_END),'Invalid fixed notification window or prepaid retirement tail');
 fail(Number.isSafeInteger(input.maxPhysicalStarts)&&input.maxPhysicalStarts>=1&&input.maxPhysicalStarts<=16,'Invalid physical process bound');
 fail(typeof input.calendarEnabled==='boolean'&&typeof input.pushEnabled==='boolean','Exact notification work switches required');
 fail(typeof input.planHash==='string'&&/^[a-f0-9]{64}$/.test(input.planHash),'Reviewed actual plan hash required');
 const key=createPrivateKey(keyBytes);fail(key.asymmetricKeyType==='ed25519','Existing offline Ed25519 issuer required');
 const maxTicks=(until-start)/60000,nonces=Array.from({length:maxTicks},()=>randomUUID());
 const scope={v:1,purpose:'erp-communication-notification-tick',intent:'dispatch-notifications',planId:input.planId,deploymentId:input.deploymentId,
  poolId:input.poolId,allocationId:input.allocationId,startsAt:input.startsAt,until:input.until,maxTicks,maxPhysicalStarts:input.maxPhysicalStarts,
  maxClaims:1,calendarEnabled:input.calendarEnabled,pushEnabled:input.pushEnabled,planHash:input.planHash};
 const tickTokens=nonces.map((nonce,index)=>{const body=Buffer.from(JSON.stringify({...scope,nonce,ordinal:index+1,scheduledAt:new Date(start+index*60000).toISOString()}));
  const token=body.toString('base64url')+'.'+sign(null,body,key).toString('base64url');fail(token.length<=4096,'Notification token exceeds fixed bound');return token;});
 // COPY data travels separately from the visible SQL statement. Only validated
 // UUIDs, timestamps, numerics, booleans, hex and base64url tokens enter this row.
 const columns='id,pool,allocation_id,deployment_id,starts_at,until_at,max_ticks,max_physical_starts,calendar_enabled,push_enabled,plan_hash,nonces,tick_tokens';
 const row=[input.planId,input.poolId,input.allocationId,input.deploymentId,input.startsAt,input.until,maxTicks,input.maxPhysicalStarts,
  input.calendarEnabled,input.pushEnabled,input.planHash,'{'+nonces.join(',')+'}','{'+tickTokens.join(',')+'}'].join('\t');
 const enrollmentSql=[
  '-- PRIVATE. Run with psql from protected storage. COPY keeps future capabilities out of the SQL query text.',
  'begin;', 'copy erp_comm_cost.notification_tick_plan('+columns+') from stdin;',row,'\\.','commit;','',
 ].join('\n');
 return {nonces,tickTokens,maxTicks,maxActions:maxTicks+1,maxClaimAttempts:maxTicks*input.maxPhysicalStarts,enrollmentSql,
  startSql:`-- Separate effectful finite activation after real commissioning.\nselect erp_comm_cost.start_notification_tick_plan(${quote(input.planId)}::uuid);\n`,
  env:{ERP_COMM_NOTIFICATION_SCHEDULER_ENABLED:'true',ERP_COMM_NOTIFICATION_PLAN_ID:input.planId,ERP_COMM_NOTIFICATION_UNTIL:input.until}};
}
function main(args){
 fail(args.length===8&&args[0]==='--spec'&&args[2]==='--receipt'&&args[4]==='--issuer-key'&&args[6]==='--out',
  'Usage: prepare-signed-notification-ticks --spec <reviewed compiler source> --receipt <funded DB receipt> --issuer-key <existing key> --out <private directory>');
 const [spec,receipt,keyFile,out]=[args[1],args[3],args[5],args[7]].map(value=>resolve(value));
 for(const path of [spec,receipt,keyFile,out])fail(isAbsolute(path)&&/^C:[\\/]/i.test(path),'Private artifacts and issuer must resolve to C:');
 assertProtectedWindowsPath(dirname(keyFile),true);assertProtectedWindowsPath(keyFile,false);assertProtectedWindowsPath(out,true);
 const reviewed=prepareProfiles(JSON.parse(readFileSync(spec,'utf8').replace(/^\uFEFF/,'')));
 const prepared=prepareSignedNotificationTicks(reviewed.notificationManifest,JSON.parse(readFileSync(receipt,'utf8').replace(/^\uFEFF/,'')),readFileSync(keyFile));
 for(const [name,body]of [['enroll.sql',prepared.enrollmentSql],['start.sql',prepared.startSql],['app-env.json',JSON.stringify(prepared.env,null,2)+'\n']]){
  const path=join(out,name);writeFileSync(path,body,{flag:'wx',mode:0o600});assertProtectedWindowsPath(path,false);}
 process.stdout.write('Prepared private finite notification artifacts; not applied or activated.\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{main(process.argv.slice(2));}catch{process.stderr.write('Notification preparation failed; no activation performed.\n');process.exitCode=1;}}
