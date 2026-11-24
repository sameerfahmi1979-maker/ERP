import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,verify} from 'node:crypto';
import {notificationPlanHash,prepareSignedNotificationTicks} from './prepare-signed-notification-ticks.mjs';
const issuer=generateKeyPairSync('ed25519'),now=Date.parse('2026-11-24T12:00:01Z');
const spec=()=>({v:1,planId:randomUUID(),deploymentId:randomUUID(),approvalId:randomUUID(),approvalFingerprint:"c".repeat(64),allocationId:randomUUID(),
 startsAt:'2026-11-24T12:01:00.000Z',until:'2026-11-24T12:03:00.000Z',controlUntil:'2026-11-24T14:00:00.000Z',
 maxPhysicalStarts:11,calendarEnabled:true,pushEnabled:true,profileSha256:'a'.repeat(64)});
const poolId=randomUUID();
const receipt=m=>({poolId,manifest:{...m},planHash:notificationPlanHash(m,poolId)});
const prepare=m=>prepareSignedNotificationTicks(m,receipt(m),key(),{now});
const key=()=>issuer.privateKey.export({format:'pem',type:'pkcs8'});
test('issues only finite current-nonce caps and protected enrollment, never shared secrets',()=>{
 const input=spec(),result=prepare(input);
 assert.equal(result.tickTokens.length,2);assert.equal(result.maxActions,3);assert.equal(result.maxClaimAttempts,22);
 for(let index=0;index<2;index++){
  const [body,signature]=result.tickTokens[index].split('.');assert.ok(verify(null,Buffer.from(body,'base64url'),issuer.publicKey,Buffer.from(signature,'base64url')));
  const cap=JSON.parse(Buffer.from(body,'base64url'));assert.equal(cap.nonce,result.nonces[index]);assert.equal(cap.ordinal,index+1);
  assert.equal(cap.maxClaims,1);assert.equal(cap.poolId,poolId);assert.equal(cap.maxPhysicalStarts,11);assert.equal(cap.nonces,undefined);
 }
 assert.match(result.enrollmentSql,/notification_tick_plan/);assert.doesNotMatch(result.enrollmentSql,/vault|INTERNAL_API_SECRET|grant |cron\.schedule/i);
 assert.match(result.startSql,/start_notification_tick_plan/);assert.equal(result.env.ERP_COMM_NOTIFICATION_PLAN_ID,input.planId);
});
test('rejects unsigned scope expansion, missing funding tail, oversized or noncanonical windows',()=>{
 for(const patch of [{extra:true},{maxPhysicalStarts:17},{maxPhysicalStarts:0},{pushEnabled:'true'},
  {controlUntil:'2026-11-24T12:05:04.999Z'},{until:'2026-11-24T14:02:00.000Z'},
  {startsAt:'2026-11-24T12:01:01.000Z'},{planHash:'placeholder'},{poolId:'not-actual'}])
  assert.throws(()=>prepare({...spec(),...patch}));
});

test('55 minute pilot has 56 actions and 110 separately funded claim probes for two physical starts',()=>{
 const input={...spec(),until:'2026-11-24T12:56:00.000Z',controlUntil:'2026-11-24T14:00:00.000Z',maxPhysicalStarts:2};
 const result=prepare(input);
 assert.equal(result.maxTicks,55);
 assert.equal(result.maxActions,56);
 assert.equal(result.maxClaimAttempts,110);
 assert.equal(new Set(result.nonces).size,55);
 assert.equal(JSON.parse(Buffer.from(result.tickTokens.at(-1).split('.')[0],'base64url')).scheduledAt,'2026-11-24T12:55:00.000Z');
 assert.match(result.enrollmentSql,/^copy .* from stdin;$/m);
 assert.throws(()=>prepare({...input,controlUntil:'2026-11-24T12:58:04.999Z'}));
});

test('issuer rejects edited compiler manifest or mismatched original funding receipt',()=>{
 const reviewed=spec(),original=receipt(reviewed);
 for(const patch of [{pushEnabled:false},{calendarEnabled:false},{allocationId:randomUUID()},{maxPhysicalStarts:1},{approvalFingerprint:'e'.repeat(64)},{profileSha256:'a'.repeat(63)+'b'}]){
  assert.throws(()=>prepareSignedNotificationTicks({...reviewed,...patch},original,key(),{now}));
 }
 for(const patch of [{poolId:randomUUID()},{planHash:'f'.repeat(64)}]){
  assert.throws(()=>prepareSignedNotificationTicks(reviewed,{...original,...patch},key(),{now}));
 }
});
