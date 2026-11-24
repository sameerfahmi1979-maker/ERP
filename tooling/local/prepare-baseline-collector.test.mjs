import {generateKeyPairSync,randomUUID,verify} from 'node:crypto';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareBaselineCollector} from './prepare-baseline-collector.mjs';
const now=Date.parse('2026-11-24T10:00:01Z'),key=generateKeyPairSync('ed25519');
const input=()=>({v:1,planId:randomUUID(),deploymentId:randomUUID(),poolId:randomUUID(),allocationId:randomUUID(),
  startsAt:'2026-11-24T10:01:00.000Z',until:'2026-11-24T10:03:00.000Z',maxPhysicalStarts:4,maxStorageObjects:1000,maxRelations:8192,planHash:'a'.repeat(64)});
test('offline collector issuer signs exact finite purpose and writes no SQL/network/financial effect',()=>{
 const spec=input(),result=prepareBaselineCollector(spec,key.privateKey.export({format:'pem',type:'pkcs8'}),{now});
 const [body,sig]=result.manifest.split('.'),parsed=JSON.parse(Buffer.from(body,'base64url'));
 assert.equal(verify(null,Buffer.from(body,'base64url'),key.publicKey,Buffer.from(sig,'base64url')),true);
 assert.equal(parsed.purpose,'erp-communication-baseline-plan');assert.equal(parsed.maxTicks,2);assert.equal(parsed.nonces.length,2);
 assert.equal(new Set(parsed.nonces).size,2);assert.equal(parsed.poolId,spec.poolId);
 for(const [index,token]of result.tickTokens.entries()){
  const [raw,sig]=token.split('.'),tick=JSON.parse(Buffer.from(raw,'base64url'));
  assert.equal(verify(null,Buffer.from(raw,'base64url'),key.publicKey,Buffer.from(sig,'base64url')),true);
  assert.equal(tick.purpose,'erp-communication-baseline-tick');assert.equal(tick.intent,'measure-baseline');
  assert.equal(tick.nonce,parsed.nonces[index]);assert.ok(!Object.hasOwn(tick,'nonces'));assert.equal(tick.ordinal,index+1);
 }
 assert.ok(result.enrollmentSql.includes('baseline_collector_plan'));assert.ok(!result.enrollmentSql.includes('start_baseline_collector'));
 assert.ok(result.startSql.includes('start_baseline_collector'));assert.ok(!result.enrollmentSql.includes('insert into erp_comm_cost.approval'));
 assert.equal(result.env.ERP_COMM_BASELINE_COLLECTOR_PLAN_ID,spec.planId);assert.ok(!JSON.stringify(result).includes('PRIVATE KEY'));
});
test('offline collector refuses stale/caller-defined endpoints, oversized windows, missing funding identity and wrong key',()=>{
 for(const patch of [{url:'https://example.com'},{poolId:''},{startsAt:'2026-11-24T10:00:01.000Z'},
  {until:'2026-12-01T00:00:00.000Z'},{until:'2026-11-24T13:00:00.000Z'},{maxPhysicalStarts:0},{maxRelations:8193}])
  assert.throws(()=>prepareBaselineCollector({...input(),...patch},key.privateKey.export({format:'pem',type:'pkcs8'}),{now}));
 const other=generateKeyPairSync('rsa',{modulusLength:2048});
 assert.throws(()=>prepareBaselineCollector(input(),other.privateKey.export({format:'pem',type:'pkcs8'}),{now}));
});
