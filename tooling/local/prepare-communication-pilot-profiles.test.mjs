import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

// Removing an owner/price/evidence/quota guard must fail these tests. Files are
// synthetic test evidence, never provider receipts or live commissioning input.
const modulePath = new URL('./prepare-communication-pilot-profiles.mjs', import.meta.url);
test('strict offline generator exists before any financial profile can be prepared', () => {
  assert.ok(existsSync(modulePath), 'Missing strict offline profile generator');
});

const chatCommands = ['chat.capabilities','chat.historyCapacity','chat.scopeReconcile','chat.resolveDmsReference','chat.directory','chat.linkedIdentity','chat.conversations','chat.direct','chat.groupCreate','chat.groupChange','chat.namedGrant','chat.conversation','chat.members','chat.messages','chat.send','chat.edit','chat.delete','chat.forward','chat.reaction','chat.pin','chat.star','chat.stars','chat.personal','chat.read','chat.readers','chat.search','chat.media','chat.sync','notifications.list','notifications.webList','notifications.webResolve','notifications.webMarkRead','notifications.preview','notifications.resolve','notifications.reply','notifications.markRead','notifications.preferences','notifications.setPreferences','notifications.unregisterDevice'];
const effects = [
 ['chat.direct','chat_direct_members',2],['chat.direct','chat_scope_facts',8],
 ['chat.groupCreate','chat_group_members',2],['chat.groupCreate','chat_scope_facts',8],
 ['chat.groupChange','chat_group_members',1],['chat.groupChange','chat_scope_facts',4],
 ['chat.send','chat_attachments',2],['chat.send','chat_mentions',2],
 ['chat.forward','chat_attachments',2],['chat.edit','chat_mentions',4],
 ['chat.historyCapacity','scope_history_slots',4],['chat.scopeReconcile','scope_reconcile_work',16],['chat.scopeReconcile','scope_departure',1],
];
export function fixture() {
  const dir = mkdtempSync(join(tmpdir(),'pilot-profile-test-'));
  const now = Date.parse('2026-11-24T12:00:00.000Z');
  const startsAt = new Date(now).toISOString(), until = '2026-11-24T14:00:00.000Z';
  const bodies = {
    host: {data:{serviceInstanceLimitOverride:null,serviceInstanceLimits:{containers:{cpu:24,memoryBytes:24000000000,pidLimit:1000}}}},
    operating: {testOnly:true,description:'Synthetic independently reviewed operation, index, backup and shutdown upper bounds'},
    baseline: {testOnly:true,description:'Synthetic included physical plan allocation measurement'},
    approval: {testOnly:true,description:'Synthetic protected owner receipt; SQL still requires the real target receipt'},
    rates: {testOnly:true,cpuMicrosPerMonth:'20000000',ramGbMicrosPerMonth:'10000000',minimumMonthDays:28},
  };
  const evidence = Object.entries(bodies).map(([id,body])=> {
    const file=join(dir,id+'.json'),bytes=Buffer.from(JSON.stringify(body)); writeFileSync(file,bytes);
    return {id,file,sha256:createHash('sha256').update(bytes).digest('hex'),observedAt:startsAt,validUntil:until,coveredUntil:until,maxAgeSeconds:300};
  });
  const spec={v:1,scope:'communications',approval:{id:'11111111-1111-4111-8111-111111111111',ownerAuthId:'22222222-2222-4222-8222-222222222222',ownerProfileId:'10',maxMicros:'5000000',endsAt:'2026-11-30T19:59:00.000Z',fingerprint:'a'.repeat(64),evidenceId:'approval'},allocation:{id:'33333333-3333-4333-8333-333333333333',databaseQuotaBytes:'805306368',storageQuotaBytes:'268435456',policyEvidenceId:'baseline'},window:{startsAt,admissionSeconds:3600,drainSeconds:3600},host:{limitsEvidenceId:'host',ratesEvidenceId:'rates',replicas:1},evidence,baseline:[
    {dimension:'database',billingAccount:'existing-supabase-project',planReference:'existing-paid-plan',physicalLimitBytes:'8589934592',observedTotalBytes:'1073741824',observedCommunicationsBytes:'0',reservedOtherBytes:'1073741824',safetyHeadroomBytes:'1073741824',evidenceId:'baseline'},
    {dimension:'storage',billingAccount:'existing-supabase-project',planReference:'existing-paid-plan',physicalLimitBytes:'107374182400',observedTotalBytes:'1073741824',observedCommunicationsBytes:'0',reservedOtherBytes:'1073741824',safetyHeadroomBytes:'1073741824',evidenceId:'baseline'}
  ],maxReservations:20,profiles:[{feature:'chat',maxReservations:20,operationSeconds:120,ledgerBytes:'1048576',databaseBytes:'8388608',storageBytes:'1',headroomMicros:'100',shutdownEvidenceId:'operating',commands:[...chatCommands],effects:effects.map(([command,effect,maxItems],i)=>({command,effect,slot:effects.slice(0,i).filter(x=>x[0]===command).length+1,baseBytes:'65536',bytesPerItem:'65536',maxItems,evidenceId:'operating'})),meters:[
    {dimension:'railway',unit:'cpu_and_ram_operation_seconds',billingAccount:'existing-railway-account',upperUnits:'120',availableUnits:'7200',upperMicros:'36000',evidenceId:'operating'},
    {dimension:'database',unit:'bounded_database_work',billingAccount:'existing-supabase-project',upperUnits:'1',availableUnits:'24',upperMicros:'0',evidenceId:'operating'},
    {dimension:'railway',unit:'network_egress_bytes',billingAccount:'existing-railway-account',upperUnits:'33554432',availableUnits:'1073741824',upperMicros:'2000',evidenceId:'operating'},
  ]}]};
  return {spec,now,dir,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
async function run(changes,check) { const f=fixture(); try { changes?.(f.spec); const {prepareProfiles}=await import(modulePath); check(()=>prepareProfiles(f.spec,{now:f.now}),f); } finally {f.cleanup();} }

// Explicitly synthetic context and own-byte observation for isolated SQL rehearsals.
export function configureObjectAllocation(s) {
  const observedAt='2026-11-24T10:00:00.000Z';
  const body={testOnly:true,observedAtUtc:observedAt,organization:'ihbccbesrprobvxmivtx',plan:'Pro',spendCap:{enabled:true},settingsOrBillingChanged:false};
  const file=join(dirname(s.evidence[0].file),'plan-context.json'),bytes=Buffer.from(JSON.stringify(body));writeFileSync(file,bytes);
  s.contextEvidence=[{id:'plan-context',file,sha256:createHash('sha256').update(bytes).digest('hex'),observedAt}];
  s.baseline[1]={dimension:'storage',basis:'owner_object_allocation',billingAccount:'existing-supabase-project',projectRef:'mmiefuieduzdiiwnqpie',organizationRef:body.organization,planName:'Pro',spendCapObserved:true,planEvidenceId:'plan-context',observedCommunicationsBytes:'0',pendingUpperBytes:'0',unknownObjectCount:0,evidenceId:'baseline'};
}

test('typed own-object allocation uses authentic dated plan context without inventing physical or global usage',async()=>run(configureObjectAllocation,make=>{
  const p=make();assert.ok(p.sql.includes('allocated_storage_object_bytes'));assert.ok(p.sql.includes('object_storage_allocation_basis'));
  assert.ok(!p.sql.includes('physical_storage_bytes'));assert.equal((p.sql.match(/insert into erp_comm_cost.baseline_capacity_evidence/g)||[]).length,1);
  assert.ok(p.sql.indexOf('insert into erp_comm_cost.object_storage_allocation_basis')<p.sql.indexOf('insert into erp_comm_cost.baseline_allocation'));
  assert.ok(p.sql.includes('2026-11-24T10:00:00.000Z'));assert.equal(p.storageAllocationBasis,'owner_object_allocation');
  assert.ok(!p.unrefreshedMeters.some(m=>m.unit==='allocated_storage_object_bytes'));
}));

test('typed allocation rejects wrong plan identity, unknown own bytes, pending legacy writes and dishonest context',async()=>{
  const mutations=[s=>s.baseline[1].organizationRef='other-org',s=>s.baseline[1].projectRef='other-project',s=>s.baseline[1].spendCapObserved=false,
    s=>s.baseline[1].unknownObjectCount=1,s=>s.baseline[1].pendingUpperBytes='1',s=>s.baseline[1].observedCommunicationsBytes='268435456',
    s=>s.baseline[1].physicalLimitBytes='100000000000',s=>s.allocation.storageQuotaBytes='268435455',
    s=>s.contextEvidence[0].observedAt='2026-11-24T10:01:00.000Z',s=>s.contextEvidence[0].sha256='f'.repeat(64),s=>s.baseline[1].planEvidenceId='operating'];
  for(const mutate of mutations)await run(s=>{configureObjectAllocation(s);mutate(s);},make=>assert.throws(make));
});

test('dated plan context cannot replace fresh operating evidence or contradict its own provider receipt',async()=>{
  for(const mutate of [s=>s.baseline[1].evidenceId='plan-context',s=>s.profiles[0].shutdownEvidenceId='plan-context',s=>{
    const e=s.contextEvidence[0],body=JSON.parse(readFileSync(e.file,'utf8'));body.spendCap.enabled=false;
    const bytes=Buffer.from(JSON.stringify(body));writeFileSync(e.file,bytes);e.sha256=createHash('sha256').update(bytes).digest('hex');
  }])await run(s=>{configureObjectAllocation(s);mutate(s);},make=>assert.throws(make));
});

test('generates actual-owner guarded allocation and positive physical holds without authorizing spend',async()=>run(null,make=>{
  const p=make(); assert.equal(p.state,'prepared-not-applied'); assert.equal(p.maximumBookedMicros,'762000');
  assert.equal(p.profileCount,1); assert.equal(p.maximumReservations,20);
  assert.ok(p.sql.includes('baseline_approval_receipt')); assert.ok(p.sql.includes('baseline_approval_fingerprint'));
  assert.ok(p.sql.includes('physical_database_bytes')); assert.ok(p.sql.includes('physical_storage_bytes'));
  assert.ok(p.sql.includes('effect_chat_mentions_items')); assert.ok(p.sql.includes('existing-plan:33333333'));
  assert.ok(!/insert into erp_comm_cost\.(approval|authority|final_evidence|reservation|control_pool)\b/i.test(p.sql));
  assert.ok(!p.sql.includes('ERP_COMM_CHAT_ENABLED')); assert.ok(p.omittedFeatures.includes('ptt_live'));
}));
test('rejects a noncommunications scope before generating SQL',async()=>run(s=>s.scope='global',make=>assert.throws(make,/scope/)));
test('rejects a different or oversized owner financial envelope',async()=>{
  await run(s=>s.approval.maxMicros='5000001',make=>assert.throws(make,/5000000/));
  await run(s=>s.approval.ownerAuthId='not-an-owner-uuid',make=>assert.throws(make,/owner/));
});
test('rejects any planned worst-case sum greater than the approved money',async()=>run(s=>s.profiles[0].meters[0].upperMicros='300000',make=>assert.throws(make,/budget/)));
test('rejects aggregate maximum claims exceeding physical baseline quota',async()=>run(s=>s.profiles[0].databaseBytes='50000000',make=>assert.throws(make,/quota/)));
test('rejects unpriced reachable commands and missing effect rows',async()=>{
  await run(s=>s.profiles[0].commands.pop(),make=>assert.throws(make,/command coverage/));
  await run(s=>s.profiles[0].effects.pop(),make=>assert.throws(make,/effect coverage/));
});
test('rejects missing, stale or tampered evidence',async()=>{
  await run(s=>s.profiles[0].shutdownEvidenceId='missing',make=>assert.throws(make,/evidence/));
  await run(s=>s.evidence[1].observedAt='2026-11-24T11:54:59.000Z',make=>assert.throws(make,/stale/i));
  await run(s=>s.evidence[1].sha256='0'.repeat(64),make=>assert.throws(make,/hash/));
});
test('rejects fake free Railway metering and understating the observed host ceiling',async()=>{
  await run(s=>s.profiles[0].meters[0].upperMicros='0',make=>assert.throws(make,/Railway/));
  await run(s=>s.profiles[0].meters[0].upperMicros='1000',make=>assert.throws(make,/Railway/));
});
test('refuses live SFU profile instead of converting a client lease into a provider guarantee',async()=>run(s=>s.profiles[0].feature='ptt_live',make=>assert.throws(make,/SFU.*hard bound/)));
test('rejects finite horizon renewal or capacity with insufficient provider headroom',async()=>{
  await run(s=>s.window.admissionSeconds=7200,make=>assert.throws(make,/window/));
  await run(s=>s.baseline[0].physicalLimitBytes='2147483648',make=>assert.throws(make,/headroom/));
});

function configurePrepayment(s){
 s.maxReservations=24;s.commissionerSessionId='44444444-4444-4444-8444-444444444444';
 s.hostFunding={deploymentId:'55555555-5555-4555-8555-555555555555',operationId:'test-host-fund',billingAccount:'existing-railway-account',evidenceId:'host',computeMicros:'2400000',ledgerBytes:'1048576',databaseBytes:'1048576',storageBytes:'1',networkEgressBytes:'1000',networkEgressAvailableBytes:'1073741824',networkEgressMicros:'1'};
 s.profiles[0].usePrepaidHost=true;s.profiles[0].meters=s.profiles[0].meters.filter(m=>m.unit!=='cpu_and_ram_operation_seconds');
 const c=structuredClone(s.profiles[0]);delete c.usePrepaidHost;c.feature='push';c.maxReservations=1;c.commands=['budget.fundControl'];c.effects=[];
 c.control={kind:'budget_alert',subject:'10',maxActions:16,pollSeconds:30};c.operationSeconds=1920;c.meters.unshift({dimension:'railway',unit:'cpu_and_ram_operation_seconds',billingAccount:'existing-railway-account',upperUnits:'1920',availableUnits:'7200',upperMicros:'600000',evidenceId:'operating'});
 c.meters.push({dimension:'fcm',unit:'dispatch_attempts',billingAccount:'existing-fcm-project',upperUnits:'8',availableUnits:'8',upperMicros:'0',evidenceId:'operating'});s.profiles.push(c);
}
test('prepaid host SQL books positive full-host money before linked zero-compute profiles',async()=>run(configurePrepayment,make=>{
 const p=make();assert.equal(p.hostPrepaymentMicros,'2400000');assert.equal(p.maximumReservations,22);
 assert.ok(p.sql.indexOf('insert into erp_comm_cost.host_window')<p.sql.indexOf('insert into erp_comm_cost.host_proof_link'));
 assert.ok(p.sql.includes("'prepaid-host:'||v_host::text"));assert.ok(p.sql.includes('2400000'));
 assert.ok(p.sql.includes('prepaid_host_operation_slots'));assert.ok(p.sql.includes('funded_budget_alert_actions'));
}));

test('denies aggregate provider units even when individual requests and money fit',async()=>run(s=>s.profiles[0].meters[1].availableUnits='19',make=>assert.throws(make,/aggregate physical unit/)));

test('baseline collector funding requires finite physical starts, all nonce probes and metrics capacity',async()=>{
 const configure=s=>{const p=s.profiles[0];p.maxReservations=1;p.commands=['budget.fundControl'];p.effects=[];p.operationSeconds=360;
  p.control={kind:'baseline_poll',subject:'communication-baseline',maxActions:3,pollSeconds:60,maxPhysicalStarts:2};
  p.meters[0].upperUnits='360';p.meters[0].upperMicros='110000';s.commissionerSessionId='44444444-4444-4444-8444-444444444444';};
 await run(configure,make=>assert.throws(make,/baseline collector.*capacity/));
 await run(s=>{configure(s);s.profiles[0].meters.push(
  {dimension:'railway',unit:'funded_baseline_nonce_claim_attempts',billingAccount:'existing-railway-account',upperUnits:'4',availableUnits:'4',upperMicros:'0',evidenceId:'operating'},
  {dimension:'database',unit:'funded_baseline_nonce_claim_attempts',billingAccount:'existing-supabase-project',upperUnits:'4',availableUnits:'4',upperMicros:'0',evidenceId:'operating'},
  {dimension:'database',unit:'funded_baseline_metrics_reads',billingAccount:'existing-supabase-project',upperUnits:'2',availableUnits:'2',upperMicros:'0',evidenceId:'operating'},
  {dimension:'railway',unit:'baseline_metrics_response_bytes',billingAccount:'existing-railway-account',upperUnits:'4194304',availableUnits:'4194304',upperMicros:'0',evidenceId:'operating'});
 },make=>{const p=make();assert.equal(p.maximumReservations,1);assert.ok(p.sql.includes('funded_baseline_poll_actions'));assert.ok(p.sql.includes('funded_baseline_nonce_claim_attempts'));});
});

test('exact command profiles separate read/write bytes and retain distinct issuance quotas',async()=>run(s=>{
 const read=s.profiles[0],write=structuredClone(read);read.mode='command';read.commands=['chat.messages'];read.effects=[];read.maxReservations=10;read.databaseBytes='1048576';
 write.mode='command';write.commands=['chat.send'];write.effects=write.effects.filter(e=>e.command==='chat.send');write.maxReservations=10;write.databaseBytes='2097152';s.profiles.push(write);
},make=>{
 const p=make();assert.equal(p.maximumDatabaseBytes,'31457280');assert.ok(p.sql.includes('erp_comm_cost.command_envelope'));assert.ok(!p.sql.includes('insert into erp_comm_cost.standing_envelope'));
 assert.ok(p.heldCommands.chat.includes('chat.delete'));assert.ok(!p.heldCommands.chat.includes('chat.send'));assert.ok((p.sql.match(/profile_[a-f0-9]+_reservations/g)||[]).length>=2);
}));

test('exact media profiles fund actual writes without charging a full original on each status read',async()=>run(s=>{
 const base=s.profiles[0];base.feature='media_upload';base.mode='command';base.commands=['chat.uploadBegin','chat.uploadStatus','chat.uploadBind','chat.uploadVerified'];base.maxReservations=8;base.effects=[];base.databaseBytes='1048576';
 base.cleanup=[{endpoint:'discard_partial_upload',maxResources:1,maxAttempts:3,evidenceId:'operating'}];base.meters.push({dimension:'storage',unit:'bounded_storage_work',billingAccount:'existing-supabase-project',upperUnits:'1',availableUnits:'24',upperMicros:'0',evidenceId:'operating'});
 const transport=structuredClone(base);transport.commands=['@upload.transport'];transport.maxReservations=2;transport.storageBytes='52428800';
 transport.meters.find(m=>m.unit==='network_egress_bytes').upperUnits='67108864';transport.meters.find(m=>m.unit==='network_egress_bytes').upperMicros='4000';
 const stage=structuredClone(transport);stage.commands=['chat.stageOpen'];stage.maxReservations=1;s.profiles.push(transport,stage);
},make=>{
 const p=make();assert.equal(p.maximumStorageBytes,'157286408');assert.ok(p.sql.includes("'media_upload','@transport'"));assert.deepEqual(p.heldCommands.media_upload,[]);
}));

test('rejects overlapping exact commands or mixing an exact profile with a cheap wildcard',async()=>{
 await run(s=>{s.profiles[0].mode='command';s.profiles[0].commands=['chat.messages'];s.profiles[0].effects=[];s.profiles[0].maxReservations=10;s.profiles.push(structuredClone(s.profiles[0]));},make=>assert.throws(make,/Overlapping/));
 await run(s=>{const exact=structuredClone(s.profiles[0]);exact.mode='command';exact.commands=['chat.messages'];exact.effects=[];s.profiles.push(exact);},make=>assert.throws(make,/mixed feature/));
});

test('refresh certificates bind reviewed artifact hashes and full pessimistic quantity prices',async()=>{
 await run(s=>s.profiles[0].meters[0].refreshBasis={basis:'priced_upper_bound',rateNumeratorMicros:'300',rateDenominatorUnits:'1'},make=>{
  const p=make();assert.ok(p.sql.includes('erp_comm_cost.meter_refresh_basis'));assert.ok(p.sql.includes("'priced_upper_bound'"));assert.ok(p.sql.includes('source_evidence_sha256'));assert.ok(p.sql.includes("'protected_counter'"));
 });
 await run(s=>s.profiles[0].meters[0].refreshBasis={basis:'priced_upper_bound',rateNumeratorMicros:'301',rateDenominatorUnits:'1'},make=>assert.throws(make,/Unpriced provider quantity/));
 await run(s=>s.profiles[0].meters[0].refreshBasis={basis:'fcm_no_cost',rateNumeratorMicros:'0',rateDenominatorUnits:'1'},make=>assert.throws(make,/Only actual FCM/));
});

test('requires separate positive compute and network bounds for bootstrap and ordinary nonprepaid profiles',async()=>{
 await run(s=>s.profiles[0].meters=s.profiles[0].meters.filter(m=>m.unit!=='network_egress_bytes'),make=>assert.throws(make,/independent Railway network/));
 await run(s=>{s.profiles[0].meters[0].upperMicros='0';s.profiles[0].meters.find(m=>m.unit==='network_egress_bytes').upperMicros='40000';},make=>assert.throws(make,/Railway compute/));
});

test('rejects invented PTT transport aliases instead of emitting colliding @transport primary keys',async()=>run(s=>{
 const p=s.profiles[0];p.feature='ptt_replay';p.mode='command';p.commands=['@pttRecording.upload','@pttRecording.replay'];p.effects=[];
},make=>assert.throws(make,/Unknown.*command coverage/)));

test('requires actual-owner prepaid alert read/push capacity before shared host funding',async()=>{
 await run(s=>{configurePrepayment(s);s.profiles[1].control.subject='999';},make=>assert.throws(make,/actual-owner budget_alert/));
 await run(s=>{configurePrepayment(s);s.profiles[1].control.maxActions=15;},make=>assert.throws(make,/sixteen actions/));
 await run(s=>{configurePrepayment(s);s.profiles[1].meters.find(m=>m.dimension==='fcm').upperUnits='7';},make=>assert.throws(make,/FCM dispatch_attempts/));
});

test('supervisor delivery requires both private manifest claim probes before public wake scheduling',async()=>{
 const setup=s=>{configurePrepayment(s);const p=structuredClone(s.profiles[0]);p.maxReservations=1;p.commands=['budget.fundControl'];p.effects=[];p.databaseBytes='1048576';
  p.control={kind:'supervisor_delivery',subject:'communication-supervisor',maxActions:3,pollSeconds:20,supervisorPlan:{physicalStarts:4,maxClaimsPerProcess:3}};s.profiles.push(p);};
 await run(setup,make=>assert.throws(make,/private supervisor manifest probe capacity/));
 await run(s=>{setup(s);s.profiles[2].meters.push(...['railway','database'].map(dimension=>({dimension,unit:'funded_supervisor_manifest_probes',billingAccount:dimension==='railway'?'existing-railway-account':'existing-supabase-project',upperUnits:'12',availableUnits:'12',upperMicros:'0',evidenceId:'operating'})));},make=>{
  const p=make();assert.equal(p.maximumReservations,23);assert.ok(p.sql.includes('funded_supervisor_manifest_probes'));assert.ok(p.sql.includes('funded_supervisor_delivery_actions'));
 });
});
