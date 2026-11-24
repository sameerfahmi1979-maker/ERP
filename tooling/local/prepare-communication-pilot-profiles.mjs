/** Offline, fail-closed compiler. This writes review artifacts only; it never connects
 * to SQL/providers, signs evidence, approves money, enables flags or launches work.
 * Input bounds are independently collected/reviewed evidence, not facts this tool
 * can authenticate. Generated SQL rechecks the actual protected owner receipt.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PILOT_END='2026-11-30T19:59:00.000Z';
const features=['chat','realtime','media_upload','media_download','export','push','ptt_live','ptt_replay','sos'];
const commands={
 chat:['chat.capabilities','chat.historyCapacity','chat.scopeReconcile','chat.resolveDmsReference','chat.directory','chat.linkedIdentity','chat.conversations','chat.direct','chat.groupCreate','chat.groupChange','chat.namedGrant','chat.conversation','chat.members','chat.messages','chat.send','chat.edit','chat.delete','chat.forward','chat.reaction','chat.pin','chat.star','chat.stars','chat.personal','chat.read','chat.readers','chat.search','chat.media','chat.sync','notifications.list','notifications.webList','notifications.webResolve','notifications.webMarkRead','notifications.preview','notifications.resolve','notifications.reply','notifications.markRead','notifications.preferences','notifications.setPreferences','notifications.unregisterDevice'],
 realtime:['chat.pulse','chat.activity','ptt.channels','ptt.direct','ptt.creatorStatus','ptt.creatorGrant','ptt.channelCreate','ptt.start','ptt.availability','ptt.pause','ptt.monitor','ptt.members','ptt.request','ptt.manage','ptt.reopenReview','ptt.scopeReconcile','ptt.leave'],
 media_upload:['chat.uploadBegin','chat.uploadStatus','chat.uploadBind','chat.stageOpen','chat.uploadVerified','@upload.transport'],
 media_download:['chat.attachmentBind','@attachment.transport'],
 export:['chat.exportPage','@export.transport'],push:['notifications.registerDevice','notifications.deliver'],
 ptt_replay:['pttRecording.preflight','pttRecording.prepare','pttRecording.fail','pttRecording.liveAuthorize','pttRecording.authorize','pttRecording.receipt','pttRecording.cacheCheck','pttRecording.history','pttRecording.recipients','pttRecording.bind','pttRecording.finalize','pttRecording.read'],
 sos:['sos.send','sos.history'],
};
const effects={
 chat:{'chat.direct':['chat_direct_members','chat_scope_facts'],'chat.groupCreate':['chat_group_members','chat_scope_facts'],'chat.groupChange':['chat_group_members','chat_scope_facts'],'chat.send':['chat_attachments','chat_mentions'],'chat.forward':['chat_attachments'],'chat.edit':['chat_mentions'],'chat.historyCapacity':['scope_history_slots'],'chat.scopeReconcile':['scope_reconcile_work','scope_departure']},
 realtime:{'ptt.direct':['ptt_scope_facts'],'ptt.channelCreate':['ptt_scope_facts'],'ptt.manage':['ptt_scope_facts','ptt_roster_rows'],'ptt.members':['ptt_roster_rows'],'ptt.reopenReview':['ptt_roster_rows'],'ptt.scopeReconcile':['ptt_scope_facts']},
};
const dimensions={chat:[],realtime:['realtime'],media_upload:['storage'],media_download:['storage'],export:['storage'],push:['fcm'],ptt_replay:['storage'],sos:['fcm']};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex=/^[0-9a-f]{64}$/;
const check=(ok,message)=>{if(!ok)throw Error(message);};
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const obj=(value,required,name,optional=[])=>{check(value&&typeof value==='object'&&!Array.isArray(value),`Invalid ${name}`);check(required.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>required.includes(k)||optional.includes(k)),`Unexpected or missing ${name} fields`);};
const integer=(v,min,max,name)=>{check(Number.isSafeInteger(v)&&v>=min&&v<=max,`Invalid ${name}`);return v;};
const number=(v,name,min=0n)=>{check(typeof v==='string'&&/^(0|[1-9][0-9]{0,29})$/.test(v)&&BigInt(v)>=min,`Invalid ${name}`);return BigInt(v);};
const id=(v,name)=>{check(typeof v==='string'&&uuid.test(v),`Invalid ${name}`);return v.toLowerCase();};
const text=(v,name)=>{check(typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=2048&&!/[\u0000-\u001f]/.test(v),`Invalid ${name}`);return v;};
const instant=(v,name)=>{check(typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v.replace(/(?<!\.\d{3})Z$/,'.000Z'),`Invalid ${name}`);return Date.parse(v);};
const ceilDiv=(a,b)=>(a+b-1n)/b;
const sameSet=(a,b)=>Array.isArray(a)&&new Set(a).size===a.length&&a.length===b.length&&a.every(x=>b.includes(x));
const commandClass=command=>command.startsWith('@')?'@transport':command;

export function prepareProfiles(input,{now=Date.now()}={}) {
 const s=structuredClone(input);
 obj(s,['v','scope','approval','allocation','window','host','evidence','baseline','maxReservations','profiles'],'spec',['hostFunding','commissionerSessionId','contextEvidence']);
 check(s.v===1,'Unsupported spec version');check(s.scope==='communications','Invalid cost scope');
 obj(s.approval,['id','ownerAuthId','ownerProfileId','maxMicros','endsAt','fingerprint','evidenceId'],'approval');
 s.approval.id=id(s.approval.id,'approval ID');s.approval.ownerAuthId=id(s.approval.ownerAuthId,'owner auth ID');
 number(s.approval.ownerProfileId,'owner profile',1n);check(s.approval.maxMicros==='5000000','Pilot approval must be exactly 5000000 USD micros');
 check(instant(s.approval.endsAt,'approval end')===Date.parse(PILOT_END),'Invalid approved pilot end');check(hex.test(s.approval.fingerprint),'Invalid actual owner receipt fingerprint');
 obj(s.window,['startsAt','admissionSeconds','drainSeconds'],'window');
 check(s.window.admissionSeconds===3600&&s.window.drainSeconds===3600,'Only a fixed 1h admission/1h drain window is supported');
 const start=instant(s.window.startsAt,'window start'),admissionEnd=start+3600000,end=start+7200000;
 check(start<=now+60000&&start>=now-60000&&end<=Date.parse(PILOT_END),'Invalid or stale window');
 const until=new Date(end).toISOString(),admitUntil=new Date(admissionEnd).toISOString();
 integer(s.maxReservations,1,256,'total reservation quota');
 check(Array.isArray(s.evidence)&&s.evidence.length>0,'Independent evidence files required');
 const evidence=new Map();
 for(const e of s.evidence){
  obj(e,['id','file','sha256','observedAt','validUntil','coveredUntil','maxAgeSeconds'],'evidence');text(e.id,'evidence ID');
  check(!evidence.has(e.id),'Duplicate evidence ID');check(isAbsolute(e.file),'Absolute evidence file required');check(hex.test(e.sha256),'Invalid evidence hash');
  const bytes=readFileSync(e.file);check(bytes.length>0&&bytes.length<=10*1024*1024&&hash(bytes)===e.sha256,'Missing or changed evidence hash');
  integer(e.maxAgeSeconds,1,300,'evidence freshness');const observed=instant(e.observedAt,'observedAt');
  check(observed<=now&&observed>=now-e.maxAgeSeconds*1000,'Stale or future evidence observation');
  check(instant(e.validUntil,'validUntil')>=end&&instant(e.coveredUntil,'coveredUntil')>=end,'Evidence does not cover full shutdown horizon');
  evidence.set(e.id,{...e,reference:'sha256:'+e.sha256,bytes});
 }
 const ev=name=>{const value=evidence.get(name);check(value,`Missing independent evidence: ${name}`);return value;};
 // Dated plan/cost-control context is not a fresh operating meter or a promise
 // about future bills. It cannot satisfy ev(), meter age or shutdown coverage.
 const contextEvidence=new Map();
 check(s.contextEvidence===undefined||Array.isArray(s.contextEvidence)&&s.contextEvidence.length<=16,'Invalid context evidence');
 for(const e of s.contextEvidence??[]){
  obj(e,['id','file','sha256','observedAt'],'context evidence');text(e.id,'context evidence ID');
  check(!evidence.has(e.id)&&!contextEvidence.has(e.id),'Duplicate context evidence ID');check(isAbsolute(e.file),'Absolute context evidence file required');check(hex.test(e.sha256),'Invalid context evidence hash');
  const bytes=readFileSync(e.file);check(bytes.length>0&&bytes.length<=10*1024*1024&&hash(bytes)===e.sha256,'Missing or changed context evidence hash');
  check(instant(e.observedAt,'context observedAt')<=now,'Future context observation');contextEvidence.set(e.id,{...e,reference:'sha256:'+e.sha256,bytes});
 }
 ev(s.approval.evidenceId);
 obj(s.host,['limitsEvidenceId','ratesEvidenceId','replicas'],'host');check(s.host.replicas===1,'Only one verified existing host replica is supported');
 const limits=JSON.parse(ev(s.host.limitsEvidenceId).bytes.toString('utf8'));
 check(limits?.data?.serviceInstanceLimitOverride===null&&limits?.data?.serviceInstanceLimits?.containers?.cpu===24&&limits.data.serviceInstanceLimits.containers.memoryBytes===24000000000,'Authentic actual 24 CPU/24000000000-byte host ceiling required');
 const rates=JSON.parse(ev(s.host.ratesEvidenceId).bytes.toString('utf8'));
 check(rates.cpuMicrosPerMonth==='20000000'&&rates.ramGbMicrosPerMonth==='10000000'&&rates.minimumMonthDays===28,'Reviewed conservative current Railway rate evidence required');
 const hostPerMonth=720000000n,monthSeconds=2419200n;
 obj(s.allocation,['id','databaseQuotaBytes','storageQuotaBytes','policyEvidenceId'],'allocation');s.allocation.id=id(s.allocation.id,'allocation ID');ev(s.allocation.policyEvidenceId);
 const dbQuota=number(s.allocation.databaseQuotaBytes,'database quota',1n),storageQuota=number(s.allocation.storageQuotaBytes,'storage quota',1n);
 check(dbQuota<=805306368n&&storageQuota<=268435456n&&dbQuota+storageQuota<=1073741824n,'Baseline allocation exceeds 1 GiB pilot quota');
 check(Array.isArray(s.baseline)&&s.baseline.length===2,'Two physical baseline measurements required');
 const baseline=new Map();
 for(const b of s.baseline){
  if(b?.basis==='owner_object_allocation'){
   obj(b,['dimension','basis','billingAccount','projectRef','organizationRef','planName','spendCapObserved','planEvidenceId','observedCommunicationsBytes','pendingUpperBytes','unknownObjectCount','evidenceId'],'object allocation');
   check(b.dimension==='storage'&&!baseline.has(b.dimension),'Object allocation is storage only');text(b.billingAccount,'object billing account');text(b.organizationRef,'object organization');
   check(b.projectRef==='mmiefuieduzdiiwnqpie'&&b.planName==='Pro'&&b.spendCapObserved===true,'Actual ERP Pro object allocation context required');ev(b.evidenceId);
   const context=contextEvidence.get(b.planEvidenceId);check(context,'Separate dated plan context required');const receipt=JSON.parse(context.bytes.toString('utf8').replace(/^\uFEFF/,''));
   check(receipt.organization===b.organizationRef&&receipt.plan==='Pro'&&receipt.spendCap?.enabled===true&&Date.parse(receipt.observedAtUtc)===Date.parse(context.observedAt),'Plan context identity, cap or observation mismatch');
   check(storageQuota===268435456n&&b.unknownObjectCount===0&&number(b.pendingUpperBytes,'pending own bytes')===0n,'Exact own quota and complete enrollment observation required');
   check(number(b.observedCommunicationsBytes,'observed own object bytes')<=storageQuota,'Existing own bytes exceed object quota');
   baseline.set('storage',{...b,quota:storageQuota,context});continue;
  }
  obj(b,['dimension','billingAccount','planReference','physicalLimitBytes','observedTotalBytes','observedCommunicationsBytes','reservedOtherBytes','safetyHeadroomBytes','evidenceId'],'baseline measurement');
  check(['database','storage'].includes(b.dimension)&&!baseline.has(b.dimension),'Invalid/duplicate physical baseline dimension');text(b.billingAccount,'baseline billing account');text(b.planReference,'plan reference');ev(b.evidenceId);
  const total=number(b.observedTotalBytes,'observed total'),comm=number(b.observedCommunicationsBytes,'observed communication bytes');
  const quota=b.dimension==='database'?dbQuota:storageQuota;
  check(comm<=total&&quota<=number(b.physicalLimitBytes,'physical limit',1n)-(total-comm)-number(b.reservedOtherBytes,'other reservations')-number(b.safetyHeadroomBytes,'safety headroom',1n),'Insufficient actual baseline physical headroom');
  baseline.set(b.dimension,{...b,quota});
 }
 check(Array.isArray(s.profiles)&&s.profiles.length>0&&s.profiles.length<=256,'Finite profiles required');
 const controlAllowance=new Map();
 for(const p of s.profiles)if(p.control){integer(p.control.maxActions,1,1000000,'control actions');controlAllowance.set(p.control.kind,(controlAllowance.get(p.control.kind)??0n)+BigInt(p.control.maxActions));}
 const allEffectBounds=new Map();
 for(const p of s.profiles)for(const e of Array.isArray(p.effects)?p.effects:[]){
  const items=BigInt(integer(e.maxItems,1,65536,'effect item bound')),bytes=number(e.baseBytes,'effect base',65536n)+number(e.bytesPerItem,'effect item',1n)*items,old=allEffectBounds.get(e.effect);
  allEffectBounds.set(e.effect,{items:items>(old?.items??0n)?items:old.items,bytes:bytes>(old?.bytes??0n)?bytes:old.bytes});
 }
 const featureModes=new Map(),commandCoverage=new Map();
 const standing=new Set(),slots=new Map(),normalized=[];let maxClaims=0,booked=0n,dbClaim=0n,storageClaim=0n;
 const addSlot=(dimension,unit,account,available)=>{
  check(/^[a-z][a-z0-9_]{0,63}$/.test(unit),'Invalid physical unit');text(account,'billing account');
  const key=[account,dimension,unit].join('/'),old=slots.get(key);
  if(old)check(old.available===available,'Conflicting shared physical capacity ceiling');else slots.set(key,{dimension,unit,account,available});
  return key;
 };
 const dbAccount=baseline.get('database').billingAccount,storageAccount=baseline.get('storage').billingAccount;
 const storageUnit=baseline.get('storage').basis==='owner_object_allocation'?'allocated_storage_object_bytes':'physical_storage_bytes';
 const dbKey=addSlot('database','physical_database_bytes',dbAccount,dbQuota),storageKey=addSlot('storage',storageUnit,storageAccount,storageQuota);
 const ledgerKey=addSlot('database','permanent_ledger_bytes',dbAccount,dbQuota),quotaKey=addSlot('database','pilot_reservation_slots',dbAccount,BigInt(s.maxReservations));
 let hostFunding=null;
 if(s.hostFunding){
  const h=s.hostFunding;obj(h,['deploymentId','operationId','billingAccount','evidenceId','ledgerBytes','databaseBytes','storageBytes','networkEgressBytes','networkEgressAvailableBytes','networkEgressMicros'],'hostFunding',['computeMicros']);
  h.deploymentId=id(h.deploymentId,'host deployment');text(h.operationId,'host funding operation');ev(h.evidenceId);
  const ledger=number(h.ledgerBytes,'host ledger',1048576n),db=number(h.databaseBytes,'host physical database',ledger),storage=number(h.storageBytes,'host physical storage',1n);
  const egress=number(h.networkEgressBytes,'host egress bytes',1n),egressMoney=number(h.networkEgressMicros,'host egress charge',1n);
  check(egressMoney>=ceilDiv(egress*50000n,1000000000n),'Unpriced Railway network egress');
  const account=text(h.billingAccount,'actual stable Railway billing account');
  const compute=number(h.computeMicros??'2800000','positive whole-host prepayment',2400000n);
  hostFunding={...h,compute,ledger,db,storage,egress,egressMoney,account};booked+=compute+egressMoney;dbClaim+=db;storageClaim+=storage;maxClaims++;
  for(const [unit,amount] of [['funded_host_wall_seconds',7200n],['funded_host_cpu_seconds',172800n],['funded_host_ram_byte_seconds',172800000000000n],['prepaid_host_operation_slots',BigInt(s.maxReservations)]]) addSlot('railway',unit,account,amount);
  addSlot('railway','network_egress_bytes',account,number(h.networkEgressAvailableBytes,'net shared Railway egress capacity',egress));
 }
 for(let index=0;index<s.profiles.length;index++){
  const p=s.profiles[index];obj(p,['feature','maxReservations','operationSeconds','ledgerBytes','databaseBytes','storageBytes','headroomMicros','shutdownEvidenceId','commands','effects','meters'],'profile',['mode','control','usePrepaidHost','cleanup','sos','exportSpool']);
  check(features.includes(p.feature),'Unknown feature');check(p.feature!=='ptt_live','SFU live needs a real provider hard bound; this compiler deliberately excludes unsupported live issuance');
  const control=p.control;
  if(control){
   obj(control,['kind','subject','maxActions','pollSeconds'],'control',['maxPhysicalStarts','workerPlan','supervisorPlan']);check(['budget_alert','chat_stage_poll','ptt_worker_poll','notification_tick','supervisor_delivery','baseline_poll','terms','report','block'].includes(control.kind),'Unsupported control kind');
   check(control.kind!=='ptt_worker_poll','SFU worker needs a real provider hard bound');text(control.subject,'control subject');integer(control.maxActions,1,1000000,'control actions');integer(control.pollSeconds,1,3600,'control cadence');
   const f=control.kind==='budget_alert'||control.kind==='notification_tick'?'push':control.kind==='chat_stage_poll'?'media_upload':'chat';check(p.feature===f,'Wrong funded control feature');
   check(control.kind!=='chat_stage_poll'||control.pollSeconds===30,'Chat stage cadence must be 30 seconds');
   check(control.kind!=='notification_tick'||control.subject==='mobile-notifications'&&control.pollSeconds<=20&&control.maxActions>=2,'Invalid finite scheduler control');
   check(control.kind!=='supervisor_delivery'||control.subject==='communication-supervisor'&&control.pollSeconds>=10&&control.pollSeconds<=30&&control.maxActions>=2&&control.maxActions<=4096,'Invalid finite supervisor delivery control');
   if(control.kind==='supervisor_delivery'){
    obj(control.supervisorPlan,['physicalStarts','maxClaimsPerProcess'],'supervisor private manifest probe plan');integer(control.supervisorPlan.physicalStarts,1,16,'supervisor physical starts');check(control.supervisorPlan.maxClaimsPerProcess===3,'Exactly three prepaid manifest claim attempts per physical start required');
   }else check(!Object.hasOwn(control,'supervisorPlan'),'Unexpected supervisor manifest probe plan');
   check(control.kind!=='baseline_poll'||control.subject==='communication-baseline'&&control.pollSeconds===60&&control.maxActions>=2&&control.maxActions<=121,'Invalid finite baseline collector control');
   if(control.kind==='baseline_poll')integer(control.maxPhysicalStarts,1,16,'fixed physical baseline receiver starts');else check(!Object.hasOwn(control,'maxPhysicalStarts'),'Unexpected baseline receiver bounds');
   if(control.kind==='chat_stage_poll'){
    obj(control.workerPlan,['physicalStarts','bootCount','maxPolls','lookupRetries'],'worker probe plan');const w=control.workerPlan;
    integer(w.physicalStarts,4,16,'fixed physical worker starts');check(w.bootCount===w.physicalStarts,'Each possible worker start needs a unique boot');integer(w.maxPolls,244,1000000,'finite worker poll cap');integer(w.lookupRetries,1,3,'funded supervisor retry');
    check(control.maxActions>=w.physicalStarts*(w.maxPolls+1),'Worker actions exclude possible prepaid boots/polls');id(control.subject,'worker subject');
   }else check(!Object.hasOwn(control,'workerPlan'),'Unexpected worker probe plan');
   check(p.maxReservations===1,'Each exact control profile funds one pool only');id(s.commissionerSessionId,'actual commissioner ERP session');
   check(sameSet(p.commands,['budget.fundControl']),'Missing exact control command coverage');
  }else{
   check(!p.mode||p.mode==='command','Unsupported profile resolution mode');
   const mode=p.mode??'feature',old=featureModes.get(p.feature);check(!old||old===mode&&mode==='command','Duplicate or mixed feature/command profile');featureModes.set(p.feature,mode);
   if(mode==='feature')check(sameSet(p.commands,commands[p.feature]),`Incomplete finite command coverage for ${p.feature}`);
   else check(Array.isArray(p.commands)&&p.commands.length>0&&new Set(p.commands).size===p.commands.length&&p.commands.every(c=>commands[p.feature].includes(c)),`Unknown or repeated exact command coverage for ${p.feature}`);
   const covered=commandCoverage.get(p.feature)??new Set();for(const c of p.commands){const resolved=commandClass(c);check(!covered.has(resolved),'Overlapping exact command profile');covered.add(resolved);}commandCoverage.set(p.feature,covered);standing.add(p.feature);
  }
  integer(p.maxReservations,1,256,'profile reservation quota');integer(p.operationSeconds,1,7200,'operation liability seconds');
  check(control||p.operationSeconds>=120,'Ordinary operation bounds must include current 120-second lifetime');ev(p.shutdownEvidenceId);
  if(control&&!p.usePrepaidHost)check(p.operationSeconds>=Math.min(7200,control.maxActions*120),'Control operation seconds must price every funded action or use protected host prepayment');
  const ledger=number(p.ledgerBytes,'ledger bytes',65536n),db=number(p.databaseBytes,'physical database bytes',1n),storage=number(p.storageBytes,'physical storage bytes',1n),margin=number(p.headroomMicros,'money safety headroom');
  check(Array.isArray(p.meters)&&p.meters.length>0&&p.meters.length<=32,'Measured provider meters required');
  const metered=new Set(),local=new Map();let cost=margin;
  const meter=(dimension,key,units,micros,evidenceId)=>{check(!local.has(key),'Repeated meter physical slot');local.set(key,{dimension,key,units,micros,evidenceId});metered.add(dimension);cost+=micros;};
  for(const m of p.meters){
   obj(m,['dimension','unit','billingAccount','upperUnits','availableUnits','upperMicros','evidenceId'],'meter',['refreshBasis']);check(['railway','database','realtime','storage','fcm'].includes(m.dimension),'Invalid/unsupported provider dimension');ev(m.evidenceId);
   const units=number(m.upperUnits,'meter physical upper units',1n),available=number(m.availableUnits,'net available capacity',units),micros=number(m.upperMicros,'provider monetary upper bound');
   if(m.dimension==='railway'&&m.unit==='network_egress_bytes')check(micros>=ceilDiv(units*50000n,1000000000n),'Unpriced Railway network egress');
   const key=addSlot(m.dimension,m.unit,m.billingAccount,available);meter(m.dimension,key,units,micros,m.evidenceId);
   if(m.refreshBasis){
    obj(m.refreshBasis,['basis','rateNumeratorMicros','rateDenominatorUnits'],'reviewed meter refresh basis');
    const b=m.refreshBasis,numerator=number(b.rateNumeratorMicros,'reviewed rate numerator'),denominator=number(b.rateDenominatorUnits,'reviewed rate denominator',1n);
    check(['protected_counter','priced_upper_bound','fcm_no_cost'].includes(b.basis),'Unsupported external refresh certificate');
    if(b.basis==='priced_upper_bound')check(['railway','storage','realtime'].includes(m.dimension)&&numerator>0n&&micros>=ceilDiv(units*numerator,denominator),'Unpriced provider quantity in refresh certificate');
    if(b.basis==='fcm_no_cost')check(m.dimension==='fcm'&&numerator===0n&&micros===0n,'Only actual FCM API fee may use zero-rate FCM certificate');
    if(b.basis==='protected_counter')check(m.dimension==='database'&&numerator===0n&&micros===0n,'Protected accounting counter must not represent an external free allowance');
    local.get(key).refreshBasis={...b,numerator,denominator};
   }
  }
  check(p.meters.some(m=>m.dimension==='railway'&&m.unit==='network_egress_bytes'&&BigInt(m.upperMicros)>0n),'Positive independent Railway network egress required for every profile');
  if(p.usePrepaidHost){
   check(hostFunding,'Missing positive host prepayment specification');
   check(p.meters.filter(m=>m.dimension==='railway').every(m=>m.billingAccount===hostFunding.account),'Prepaid host and operation require the same actual Railway account');
   meter('railway',addSlot('railway','prepaid_host_operation_slots',hostFunding.account,BigInt(s.maxReservations)),1n,0n,'@host');
  }else{
   const minimumCompute=ceilDiv(hostPerMonth*BigInt(p.operationSeconds),monthSeconds);
   check(p.meters.some(m=>m.dimension==='railway'&&m.unit==='cpu_and_ram_operation_seconds'&&BigInt(m.upperUnits)>=BigInt(p.operationSeconds)&&BigInt(m.upperMicros)>=minimumCompute),'Railway compute must have its own positive full-host time bound or use protected prepayment');
  }
  for(const dimension of ['railway','database',...dimensions[p.feature]])check(metered.has(dimension),`Missing ${dimension} operating evidence`);
  meter('database',dbKey,db,0n,s.allocation.policyEvidenceId);meter('storage',storageKey,storage,0n,s.allocation.policyEvidenceId);meter('database',ledgerKey,ledger,0n,s.allocation.policyEvidenceId);meter('database',quotaKey,1n,0n,s.allocation.policyEvidenceId);
  const profileQuota='profile_'+hash(JSON.stringify([p.feature,p.control??p.mode??'feature',p.commands])).slice(0,24)+'_reservations';
  meter('database',addSlot('database',profileQuota,dbAccount,BigInt(p.maxReservations)),1n,0n,s.allocation.policyEvidenceId);
  const effectRows=[];check(Array.isArray(p.effects),'Measured effects required');const effectSlots=new Set(),effectKeys=new Set(),effectMax=new Map();
  for(const e of p.effects){
   obj(e,['command','effect','slot','baseBytes','bytesPerItem','maxItems','evidenceId'],'effect');check(p.commands.includes(e.command)&&/^[a-z][a-z0-9_]{0,47}$/.test(e.effect),'Invalid exact command effect');integer(e.slot,1,16,'effect slot');integer(e.maxItems,1,65536,'effect item bound');
   const k=e.command+'/'+e.effect,slot=e.command+'/'+e.slot;check(!effectKeys.has(k)&&!effectSlots.has(slot),'Duplicate effect/command slot');effectKeys.add(k);effectSlots.add(slot);ev(e.evidenceId);
   const base=number(e.baseBytes,'effect rejection/receipt bytes',65536n),each=number(e.bytesPerItem,'complete effect item bytes',1n),bytes=base+each*BigInt(e.maxItems);effectRows.push({...e,base,each});
   const old=effectMax.get(e.effect);effectMax.set(e.effect,{items:BigInt(Math.max(e.maxItems,Number(old?.items??0))),bytes:bytes>(old?.bytes??0n)?bytes:old.bytes,evidenceId:e.evidenceId});
  }
  if(!control)for(const [command,classes] of Object.entries(effects[p.feature]??{}))if(p.commands.includes(command))for(const effect of classes)check(effectKeys.has(command+'/'+effect),`Missing exact effect coverage: ${command}/${effect}`);
  let effectBytes=0n;
  for(const [name,b]of effectMax){const all=allEffectBounds.get(name);effectBytes+=b.bytes;meter('database',addSlot('database','effect_'+name+'_items',dbAccount,all.items*BigInt(s.maxReservations)),b.items,0n,b.evidenceId);meter('database',addSlot('database','effect_'+name+'_bytes',dbAccount,all.bytes*BigInt(s.maxReservations)),b.bytes,0n,b.evidenceId);}
  let extra=0n;
  if(control){
   let minimum=65536n+32768n*BigInt(control.maxActions);
   if(control.kind==='supervisor_delivery'){
    const attempts=control.supervisorPlan.physicalStarts*control.supervisorPlan.maxClaimsPerProcess;minimum+=32768n*(1n+BigInt(attempts));
    for(const dimension of ['railway','database'])check(p.meters.some(m=>m.dimension===dimension&&m.unit==='funded_supervisor_manifest_probes'&&BigInt(m.upperUnits)>=BigInt(attempts)),`Missing ${dimension} private supervisor manifest probe capacity`);
   }
   if(control.kind==='baseline_poll'){
    const ticks=BigInt(control.maxActions-1),attempts=ticks*BigInt(control.maxPhysicalStarts);
    minimum+=32768n*(2n*attempts+ticks);
    const requireMeter=(dimension,unit,min)=>check(p.meters.some(m=>m.dimension===dimension&&m.unit===unit&&BigInt(m.upperUnits)>=min),`Missing prepaid baseline collector ${dimension}/${unit} capacity`);
    requireMeter('railway','funded_baseline_nonce_claim_attempts',attempts);requireMeter('database','funded_baseline_nonce_claim_attempts',attempts);
    requireMeter('database','funded_baseline_metrics_reads',ticks);requireMeter('railway','baseline_metrics_response_bytes',2097152n*ticks);
   }
   if(control.kind==='chat_stage_poll'){
    const w=control.workerPlan,lookups=w.physicalStarts*w.bootCount*(1+w.lookupRetries);
    minimum+=32768n*BigInt(lookups+2*w.bootCount);
    for(const dimension of ['railway','database'])for(const [unit,bound]of [['funded_worker_registration_probes',w.physicalStarts],['funded_worker_delivery_lookups',lookups]])
      check(p.meters.some(m=>m.dimension===dimension&&m.unit===unit&&BigInt(m.upperUnits)>=BigInt(bound)),`Missing ${dimension}/${unit} capacity for every worker start/lookup`);
   }
   check(ledger>=minimum,'Insufficient permanent control action/probe bytes');
   meter('database',addSlot('database','funded_'+control.kind+'_actions',dbAccount,controlAllowance.get(control.kind)),BigInt(control.maxActions),0n,p.shutdownEvidenceId);
  }
  if(p.feature==='media_upload'){
   check(Array.isArray(p.cleanup)&&p.cleanup.length===1,'Media upload needs prepaid partial-object cleanup');const c=p.cleanup[0];obj(c,['endpoint','maxResources','maxAttempts','evidenceId'],'cleanup');check(c.endpoint==='discard_partial_upload','Unsupported upload cleanup endpoint');integer(c.maxResources,1,1,'one outstanding partial object');integer(c.maxAttempts,3,20,'partial cleanup attempts');ev(c.evidenceId);extra+=16384n*BigInt(c.maxResources*(1+c.maxAttempts));
  }else check(!p.cleanup,'Unexpected cleanup capability');
  if(p.feature==='sos'){
   obj(p.sos,['maxRecipients','maxDevices','maxPushAttempts','maxControlReads','maxDiscoverySlots','cancellationEvidenceId'],'SOS envelope');const a=p.sos;integer(a.maxRecipients,0,4096,'SOS recipients');integer(a.maxDevices,0,4096,'SOS devices');integer(a.maxPushAttempts,1,20,'SOS attempts');integer(a.maxControlReads,2,256,'SOS reads');integer(a.maxDiscoverySlots,2,65536,'SOS discovery');ev(a.cancellationEvidenceId);
   extra+=32768n*BigInt(a.maxRecipients+a.maxDevices)*BigInt(1+a.maxPushAttempts+a.maxControlReads);const checks=2n*BigInt(a.maxRecipients*a.maxControlReads*a.maxDiscoverySlots);meter('database',addSlot('database','sos_discovery_target_checks',dbAccount,checks*BigInt(s.maxReservations)),checks||1n,0n,a.cancellationEvidenceId);
  }
  if(p.feature==='export'){
   obj(p.exportSpool,['bytesPerSlot','slotsPerVolume','maxVolumes','cleanupTailSeconds','evidenceId'],'export spool');const a=p.exportSpool;number(a.bytesPerSlot,'spool bytes',1n);integer(a.slotsPerVolume,1,16,'spool slots');integer(a.maxVolumes,1,16,'spool volumes');integer(a.cleanupTailSeconds,1,7200,'spool tail');ev(a.evidenceId);
   check(p.meters.some(m=>m.dimension==='railway'&&m.unit==='renderer_cpu_ram_seconds'&&BigInt(m.upperMicros)>0n),'Export needs independent positive renderer job/queue/cancellation evidence; ERP host prepayment does not cover Gotenberg');
   const amount=ceilDiv(BigInt(a.bytesPerSlot)*BigInt(a.slotsPerVolume*a.maxVolumes*a.cleanupTailSeconds),3600n);meter('railway',addSlot('railway','encrypted_spool_byte_hours',hostFunding?.account??s.host.limitsEvidenceId,amount*BigInt(s.maxReservations)),amount,0n,a.evidenceId);
  }
  const floor=65536n+BigInt(local.size)*18432n+extra+16384n;
  check(ledger>=floor,'Insufficient measured financial ledger bytes for proof/meter/cleanup/SOS rows');check(db>=ledger+effectBytes,'Physical database bound excludes complete ledger/effects');
  maxClaims+=p.maxReservations;booked+=cost*BigInt(p.maxReservations);dbClaim+=db*BigInt(p.maxReservations);storageClaim+=storage*BigInt(p.maxReservations);
  normalized.push({...p,index,ledger,db,storage,cost,meters:[...local.values()],effectRows});
 }
 if(hostFunding){
  const owners=normalized.filter(p=>p.control?.kind==='budget_alert'&&p.control.subject===s.approval.ownerProfileId);
  check(owners.length===1&&!owners[0].usePrepaidHost&&owners[0].control.maxActions>=16,'A positive independently funded actual-owner budget_alert pool with at least sixteen actions is required before host funding');
  const owner=owners[0];
  check(owner.meters.some(m=>m.dimension==='fcm'&&slots.get(m.key).unit==='dispatch_attempts'&&m.units>=BigInt(Math.floor(owner.control.maxActions/2))),'Owner alert pool needs independent physical FCM dispatch_attempts for its prepaid push lane');
 }
 check(maxClaims<=s.maxReservations,'Maximum permits exceed shared reservation quota');check(booked<=5000000n,'Planned conservative cost sum exceeds approved budget');
 check(dbClaim+BigInt(baseline.get('database').observedCommunicationsBytes)<=dbQuota&&storageClaim+BigInt(baseline.get('storage').observedCommunicationsBytes)<=storageQuota,'Maximum physical claims exceed allocated baseline quota');
 const plannedUnits=new Map();
 const addUnits=(key,units)=>plannedUnits.set(key,(plannedUnits.get(key)??0n)+units);
 for(const p of normalized)for(const m of p.meters)addUnits(m.key,m.units*BigInt(p.maxReservations));
 if(hostFunding){
  const h=hostFunding;
  for(const [key,units]of [[dbKey,h.db],[storageKey,h.storage],[ledgerKey,h.ledger],[quotaKey,1n]])addUnits(key,units);
  for(const [unit,units]of [['funded_host_wall_seconds',7200n],['funded_host_cpu_seconds',172800n],['funded_host_ram_byte_seconds',172800000000000n],['network_egress_bytes',h.egress]])addUnits([h.account,'railway',unit].join('/'),units);
 }
 for(const [key,units]of plannedUnits)check(units<=slots.get(key).available,'Planned aggregate physical unit claims exceed verified shared capacity quota: '+slots.get(key).unit);
 // Every shared slot is a single account/dimension/unit. Deny inconsistent ceilings
 // rather than merging evidence or fabricating capacity.
 const rows=[...slots.entries()].map(([key,value],i)=>({key,...value,name:'c'+i})),slotName=new Map(rows.map(r=>[r.key,r.name]));
 const ref=name=>q(ev(name).reference),allocationMarker=q('existing-plan:'+s.allocation.id);
 let sql=`-- Prepared offline; independent evidence review and target/history verification are mandatory.\nbegin;\nset local lock_timeout='5s';\ndo $pilot_profiles$\ndeclare ${rows.map(r=>r.name+' bigint').join(';')}; v_host uuid; v_reply jsonb; v_pool uuid;\nbegin\n`;
 sql+=`perform 1 from erp_comm_cost.authority where singleton for update;\nif not exists(select from erp_comm_cost.approval a join erp_comm_cost.authority o on o.singleton and o.owner_auth_id=a.owner_auth_id join erp_comm_cost.baseline_approval_receipt br on br.approval_id=a.id join public.user_profiles u on u.auth_user_id=a.owner_auth_id where a.id=${q(s.approval.id)}::uuid and a.owner_auth_id=${q(s.approval.ownerAuthId)}::uuid and u.id::text=${q(s.approval.ownerProfileId)} and u.status='active' and not u.must_change_password and a.scope='communications' and a.currency='USD' and a.max_micros=5000000 and a.revoked_at is null and a.ends_at=${q(PILOT_END)}::timestamptz and br.fingerprint=decode(${q(s.approval.fingerprint)},'hex') and br.fingerprint=erp_comm_cost.baseline_approval_fingerprint(a)) then raise exception 'Actual authenticated owner approval/receipt mismatch';end if;\n`;
 sql+=`if clock_timestamp()<${q(s.window.startsAt)}::timestamptz or clock_timestamp()>=${q(admitUntil)}::timestamptz then raise exception 'Pilot admission window closed';end if;\nif (select coalesce(sum(coalesce(settled_micros,reserved_micros)),0) from erp_comm_cost.reservation where approval_id=${q(s.approval.id)}::uuid)+${booked}>5000000 then raise exception 'Existing obligations plus planned conservative maximum exceed USD 5';end if;\n`;
 for(const r of rows){
  sql+=`insert into erp_comm_cost.capacity(billing_account,dimension,unit,valid_from,valid_until,available_units,enabled) values(${q(r.account)},${q(r.dimension)},${q(r.unit)},${q(s.window.startsAt)}::timestamptz,${q(until)}::timestamptz,${r.available},true) on conflict(billing_account,dimension,unit) do nothing;\nselect id into strict ${r.name} from erp_comm_cost.capacity where billing_account=${q(r.account)} and dimension=${q(r.dimension)} and unit=${q(r.unit)} and available_units=${r.available} and enabled and valid_from<=clock_timestamp() and valid_until>=${q(until)}::timestamptz;\n`;
 }
 for(const dimension of ['database','storage']){
  const b=baseline.get(dimension),e=ev(b.evidenceId),cid=slotName.get(dimension==='database'?dbKey:storageKey);
  if(b.basis==='owner_object_allocation'){
   const context=b.context,policy=ev(s.allocation.policyEvidenceId);
   sql+=`insert into erp_comm_cost.object_storage_allocation_basis(allocation_id,storage_capacity_id,approval_id,project_ref,organization_ref,billing_account,plan_name,spend_cap_observed,plan_evidence_id,plan_evidence_sha256,plan_observed_at,policy_evidence_id,policy_evidence_sha256,byte_quota,admission_ends_at,enabled) values(${q(s.allocation.id)}::uuid,${cid},${q(s.approval.id)}::uuid,${q(b.projectRef)},${q(b.organizationRef)},${q(b.billingAccount)},'Pro',true,${q(context.reference)},${q(context.sha256)},${q(context.observedAt)}::timestamptz,${q(policy.reference)},${q(policy.sha256)},${storageQuota},${q(until)}::timestamptz,true);\n`;
   continue;
  }
  sql+=`insert into erp_comm_cost.baseline_capacity_evidence(capacity_id,plan_reference,evidence_id,observed_at,valid_until,max_measurement_age,physical_limit_bytes,observed_total_bytes,observed_communications_bytes,reserved_other_bytes,safety_headroom_bytes,allocated_bytes,enabled) values(${cid},${q(b.planReference)},${q(e.reference)},${q(e.observedAt)}::timestamptz,${q(until)}::timestamptz,interval '${e.maxAgeSeconds} seconds',${b.physicalLimitBytes},${b.observedTotalBytes},${b.observedCommunicationsBytes},${b.reservedOtherBytes},${b.safetyHeadroomBytes},${b.quota},true);\n`;
 }
 sql+=`insert into erp_comm_cost.baseline_allocation(id,approval_id,database_capacity_id,storage_capacity_id,database_quota_bytes,storage_quota_bytes,valid_from,valid_until,policy_evidence,enabled) values(${q(s.allocation.id)}::uuid,${q(s.approval.id)}::uuid,${slotName.get(dbKey)},${slotName.get(storageKey)},${dbQuota},${storageQuota},${q(s.window.startsAt)}::timestamptz,${q(until)}::timestamptz,${ref(s.allocation.policyEvidenceId)},true);\n`;
 const meterSql=(op,m)=>{const e=m.evidenceId==='@host'?ev(s.hostFunding.evidenceId):ev(m.evidenceId);return `insert into erp_comm_cost.meter(operation_id,dimension,evidence_id,complete,observed_at,valid_until,covered_until,upper_micros,capacity_id,upper_units) values(${q(op)},${q(m.dimension)},${m.evidenceId==='@host'?"'prepaid-host:'||v_host::text":q(e.reference)},true,${q(e.observedAt)}::timestamptz,${q(until)}::timestamptz,${q(until)}::timestamptz,${m.micros},${slotName.get(m.key)},${m.units});\n`;};
 const proofSql=(op,p,actor=s.approval.ownerProfileId)=>`insert into erp_comm_cost.proof(operation_id,scope,actor_id,feature,liability_ends_at,operational_stop_by,valid_until,max_meter_age,retained_at_zero_cost_evidence,shutdown_evidence,headroom_micros,approval_id) values(${q(op)},'communications',${q(actor)},${q(p.feature)},null,${q(until)}::timestamptz,${q(until)}::timestamptz,interval '${Math.min(...s.evidence.map(e=>e.maxAgeSeconds))} seconds',${allocationMarker},${ref(p.shutdownEvidenceId)},${p.headroomMicros??0},${q(s.approval.id)}::uuid);\n`;
 const unrefreshedMeters=[];
 const emitProfile=p=>{
  const op='pilot:'+s.approval.id+':'+(p.control?'control:'+p.index:p.feature+(p.mode==='command'?':command:'+p.index:''));let out=proofSql(op,p);
  for(const m of p.meters)out+=meterSql(op,m);
  if(p.usePrepaidHost)out+=`insert into erp_comm_cost.host_proof_link values(${q(op)},v_host);\n`;
  for(const e of p.effectRows)out+=`insert into erp_comm_cost.effect_limit values(${q(op)},${q(e.command)},${q(e.effect)},${e.slot},${e.base},${e.each},${ref(e.evidenceId)});\n`;
  for(const c of p.cleanup??[])out+=`insert into erp_comm_cost.cleanup_limit values(${q(op)},${q(c.endpoint)},${c.maxResources},${c.maxAttempts});\n`;
  if(p.sos){const a=p.sos;out+=`insert into erp_comm_cost.sos_limit(operation_id,max_recipients,max_devices,cancellation_evidence,post_expiry_zero_cost_evidence,max_push_attempts,max_control_reads,max_discovery_slots) values(${q(op)},${a.maxRecipients},${a.maxDevices},${ref(a.cancellationEvidenceId)},${allocationMarker},${a.maxPushAttempts},${a.maxControlReads},${a.maxDiscoverySlots});\n`;}
  if(p.exportSpool){const a=p.exportSpool;out+=`insert into erp_comm_cost.export_spool_limit values(${q(op)},${a.bytesPerSlot},${a.slotsPerVolume},${a.maxVolumes},${a.cleanupTailSeconds},${ref(a.evidenceId)});\n`;}
  if(p.control){
   const c=p.control,command={op:'budget.fundControl',kind:c.kind,subject:c.subject,maxActions:c.maxActions,endEpoch:Math.round(end/1000)};
   const payload={feature:p.feature,scope:'communications',operationId:op,actorId:s.approval.ownerProfileId,upperBoundMicros:'0',liabilityEndsAt:null,binding:{actorSessionId:s.commissionerSessionId,command},...(hostFunding?{hostDeploymentId:hostFunding.deploymentId}:{})};
   out+=`v_reply:=erp_comm_cost.command('reserve',${q(JSON.stringify(payload))}::jsonb);if (v_reply->>'ok')::boolean is distinct from true then raise exception 'Control funding held: %',v_reply->>'reason';end if;v_pool:=(v_reply->>'permitId')::uuid;\ninsert into erp_comm_cost.control_pool(permit_id,kind,subject,max_actions,valid_until,continuing_zero_evidence,poll_seconds,enabled) values(v_pool,${q(c.kind)},${q(c.subject)},${c.maxActions},${q(until)}::timestamptz,${allocationMarker},${c.pollSeconds},true);\nraise notice 'Funded control %/% permit %',${q(c.kind)},${q(c.subject)},v_pool;\n`;
  }else if(p.mode==='command')for(const command of new Set(p.commands.map(commandClass)))out+=`insert into erp_comm_cost.command_envelope(scope,feature,command_op,template_id,enabled) values('communications',${q(p.feature)},${q(command)},${q(op)},true);\n`;
  else out+=`insert into erp_comm_cost.standing_envelope(scope,feature,template_id,enabled) values('communications',${q(p.feature)},${q(op)},true);\n`;
  if(!p.control){
   const isCounter=unit=>['permanent_ledger_bytes','pilot_reservation_slots','bounded_database_work','sos_discovery_target_checks','funded_ptt_receipt_episodes','funded_ptt_busy_inboxes','funded_ptt_busy_device_jobs','ptt_floor_retained_bytes'].includes(unit)||/^effect_[a-z0-9_]+_(items|bytes)$/.test(unit)||/^funded_[a-z0-9_]+_actions$/.test(unit)||/^profile_[a-f0-9]{24}_reservations$/.test(unit);
   for(const m of p.meters){
    const slot=slots.get(m.key),e=m.evidenceId==='@host'?ev(s.hostFunding.evidenceId):ev(m.evidenceId);
    const b=m.refreshBasis??(m.evidenceId==='@host'?{basis:'prepaid_host',numerator:0n,denominator:1n}:m.dimension==='database'&&isCounter(slot.unit)&&m.micros===0n?{basis:'protected_counter',numerator:0n,denominator:1n}:null);
    if(b)out+=`if to_regclass('erp_comm_cost.meter_refresh_basis') is null then raise exception 'Reviewed finite meter-refresh capability required';end if;\ninsert into erp_comm_cost.meter_refresh_basis(operation_id,capacity_id,basis,source_evidence_id,source_evidence_sha256,max_upper_units,max_upper_micros,rate_numerator_micros,rate_denominator_units,valid_until) values(${q(op)},${slotName.get(m.key)},${q(b.basis)},${q(e.reference)},${q(e.sha256)},${m.units},${m.micros},${b.numerator},${b.denominator},${q(until)}::timestamptz);\n`;
    else if(!['physical_database_bytes','physical_storage_bytes','allocated_storage_object_bytes'].includes(slot.unit))unrefreshedMeters.push({templateId:op,feature:p.feature,dimension:m.dimension,unit:slot.unit,reason:'No reviewed immutable accounting certificate; fresh external evidence remains required'});
   }
  }
  return out;
 };
 for(const p of normalized.filter(p=>p.control?.kind==='budget_alert'&&!p.usePrepaidHost))sql+=emitProfile(p);
 if(hostFunding){
  const h=hostFunding,op=h.operationId,account=h.account,e=ev(h.evidenceId);sql+=proofSql(op,{feature:'chat',shutdownEvidenceId:h.evidenceId,headroomMicros:'0'},'pilot-commissioner');
  const m=(dimension,unit,units,micros,accountId=account)=>meterSql(op,{dimension,key:[accountId,dimension,unit].join('/'),units,micros,evidenceId:h.evidenceId});
  sql+=m('railway','funded_host_wall_seconds',7200n,h.compute)+m('railway','funded_host_cpu_seconds',172800n,0n)+m('railway','funded_host_ram_byte_seconds',172800000000000n,0n)+m('railway','network_egress_bytes',h.egress,h.egressMoney);
  for(const [key,dimension,units]of [[dbKey,'database',h.db],[storageKey,'storage',h.storage],[ledgerKey,'database',h.ledger],[quotaKey,'database',1n]])sql+=meterSql(op,{dimension,key,units,micros:0n,evidenceId:h.evidenceId});
  const payload={scope:'communications',feature:'chat',actorId:'pilot-commissioner',operationId:op,upperBoundMicros:h.compute.toString(),liabilityEndsAt:null};
  sql+=`v_reply:=erp_comm_cost.command('reserve',${q(JSON.stringify(payload))}::jsonb);if (v_reply->>'ok')::boolean is distinct from true then raise exception 'Host funding held: %',v_reply->>'reason';end if;v_host:=(v_reply->>'permitId')::uuid;\ninsert into erp_comm_cost.host_window(funding_permit,approval_id,deployment_id,starts_at,admission_ends_at,ends_at,cpu_count,memory_bytes,max_operations,host_evidence,enabled) values(v_host,${q(s.approval.id)}::uuid,${q(h.deploymentId)}::uuid,${q(s.window.startsAt)}::timestamptz,${q(admitUntil)}::timestamptz,${q(until)}::timestamptz,24,24000000000,${s.maxReservations},${q(e.reference)},true);\nraise notice 'Host funding permit %',v_host;\n`;
 }
 for(const p of normalized.filter(p=>!(p.control?.kind==='budget_alert'&&!p.usePrepaidHost)))sql+=emitProfile(p);
 sql+='end $pilot_profiles$;\ncommit;\n';
 return {v:1,state:'prepared-not-applied',scope:s.scope,approvalId:s.approval.id,allocationId:s.allocation.id,startsAt:s.window.startsAt,admissionEndsAt:admitUntil,endsAt:until,profileCount:normalized.length,maximumReservations:maxClaims,maximumBookedMicros:booked.toString(),maximumDatabaseBytes:dbClaim.toString(),maximumStorageBytes:storageClaim.toString(),storageAllocationBasis:baseline.get('storage').basis??'physical',hostPrepaymentMicros:hostFunding?hostFunding.compute.toString():null,omittedFeatures:features.filter(f=>!standing.has(f)),heldCommands:Object.fromEntries([...commandCoverage].map(([f,covered])=>[f,commands[f].filter(c=>!covered.has(commandClass(c)))])),unrefreshedMeters,evidence:s.evidence.map(({id,file,sha256})=>({id,file,sha256})),contextEvidence:(s.contextEvidence??[]).map(({id,file,sha256,observedAt})=>({id,file,sha256,observedAt})),sql,sqlSha256:hash(sql)};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  check(process.argv.length===4,'Usage: node prepare-communication-pilot-profiles.mjs <reviewed-spec.json> <C-drive-output-directory>');
  const inputPath=resolve(process.argv[2]),output=resolve(process.argv[3]);check(/^C:\\/i.test(output),'Output must stay under C: development storage');
  const result=prepareProfiles(JSON.parse(readFileSync(inputPath,'utf8').replace(/^\uFEFF/,'')));mkdirSync(output,{recursive:true});
  writeFileSync(join(output,'pilot-profiles.sql'),result.sql,{flag:'wx'});const manifest={...result};delete manifest.sql;writeFileSync(join(output,'pilot-profiles-review.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  process.stdout.write(JSON.stringify({state:result.state,sqlSha256:result.sqlSha256,maximumBookedMicros:result.maximumBookedMicros,omittedFeatures:result.omittedFeatures,unrefreshedMeterCount:result.unrefreshedMeters.length})+'\n');
 }catch(error){process.stderr.write('Profile preparation held: '+String(error.message)+'\n');process.exitCode=1;}
}
