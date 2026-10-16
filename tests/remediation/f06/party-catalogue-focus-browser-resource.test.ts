// Offline synthetic snapshots only; never import or execute the runtime observer.
// Reviewed pre-correction hashes remain historical evidence, not current passes:
// observer f55f5226988f6b5f557a04016b622ebd2913492a2da2d79a34971a8205eed78b
// source-only test 93bea8bb0a804bb08ca5936ff20fb0eb2c29c998c553143da15ee010b7aeed25
// Superseded 52-case freeze (before truthful-result/action assertions): validator
// 45549f01efef1890b7297e8e035f19efa8bece311a559a02c59c2f77d46abc90,
// test eb6a058fb00eb668e1da267525304e2675086c119414f35a94db28e71e63844a.
import fs from 'node:fs';
import {expect,it} from 'vitest';
import {focusDefinitions,focusSteps,validateFocusActor,validateFocusSnapshot} from './party-catalogue-focus-validation.mjs';

const source=fs.readFileSync('tests/remediation/f06/party-catalogue-focus-browser-resource.mjs','utf8');
type Row={id:number;is_active:boolean;is_system:boolean;sort_order:number;description:string;updated_at:string;updated_by:number;workspace_revision:number;[key:string]:unknown};
type Audit={id:number;actor_user_profile_id:number;action:string;details:{description:string}};
type Receipt={operation_id:string;actor:string;record_id:number;result:{id:number;revision:string;changed:boolean;replayed:boolean}};
type State={table:string;code:string;rows:Row[];unrelated:string;audits:Audit[];receipts:Receipt[]}[];
const clone=<T,>(value:T):T=>structuredClone(value);
const actor={marker:'F06BROWSER0512',profileId:9,authId:'00000000-0000-4000-8000-000000000512'};
function fixtures(){
 const base:State=focusDefinitions.map((d:{table:string;key:string;code:string;id:number},i:number)=>({table:d.table,code:d.code,
  rows:[{id:d.id,[d.key]:d.code,name:'Synthetic only',is_active:false,is_system:false,sort_order:0,description:'Original '+i,updated_at:'original',updated_by:8,workspace_revision:4}],unrelated:'fresh-window-'+i,
  audits:Array.from({length:4},(_,n)=>({id:i*100+n,actor_user_profile_id:8,action:'update',details:{description:'Original audit '+n}})),
  receipts:Array.from({length:5},(_,n)=>({operation_id:`old-${i}-${n}`,actor:'old-actor',record_id:d.id,result:{id:d.id,revision:String(Math.min(n+1,4)),changed:n!==4,replayed:false}})),
 }));
 const original=base.map(item=>({...clone(item),unrelated:'older-unrelated-window',audits:item.audits.map(a=>({id:a.id,actor:a.actor_user_profile_id,action:a.action})),receipts:item.receipts.map(r=>({operation:r.operation_id,actor:r.actor,recordId:r.record_id,result:clone(r.result)}))}));
 const states:State[]=[clone(base)];
 // Explicit mutations form the synthetic truth; do not repeat the validator's
 // relative-index arithmetic when constructing its expected input.
 for(let index=1;index<focusSteps.length;index++){
  const state=clone(states.at(-1)!);
  const table=index<=4?0:1;
  if([1,4,5,8].includes(index)){
   const item=state[table],row=item.rows[0];row.workspace_revision++;row.updated_at='changed-'+index;row.updated_by=9;
   row.description=[1,5].includes(index)?base[table].rows[0].description+' F06 focus verification.':base[table].rows[0].description;
   item.audits.push({id:1000+index,actor_user_profile_id:9,action:'update',details:{description:row.description}});
   item.receipts.push({operation_id:'new-'+index,actor:actor.authId,record_id:row.id,result:{id:row.id,revision:String(row.workspace_revision),changed:true,replayed:false}});
  }else if([2,6].includes(index)){
   const item=state[table],row=item.rows[0];item.receipts.push({operation_id:'new-'+index,actor:actor.authId,record_id:row.id,result:{id:row.id,revision:String(row.workspace_revision),changed:false,replayed:false}});
  }
  states.push(state);
 }
 return {base,original,states};
}
function check(index:number,state?:State,priorStates?:State[]){
 const fixture=fixtures();validateFocusSnapshot(focusSteps[index],state??fixture.states[index],fixture.original,priorStates??fixture.states.slice(0,index),actor);
}

it('pins both exact retained identities and the finite stage order',()=>{
 expect(focusDefinitions.map((d:{table:string;code:string;id:number})=>[d.table,d.code,d.id])).toEqual([
  ['party_service_categories_master','F06BROWSER0511_SC',105],['party_relationship_types','F06BROWSER0511_RT',43],
 ]);
 expect(focusSteps).toEqual(['reserve','category-edited','category-noop','category-cancelled','category-restored','relationship-edited','relationship-noop','relationship-cancelled','relationship-restored','final']);
});
it.each(focusSteps.map((step:string,index:number)=>[step,index] as const))('accepts the exact %s stage with all prior snapshots',(_step,index)=>{check(index);});
it('ends with both descriptions restored and exactly revision6/audits6/receipts8',()=>{
 const {states,base}=fixtures();check(9,states[9]);
 for(let i=0;i<2;i++){expect(states[9][i].rows[0]).toMatchObject({description:base[i].rows[0].description,workspace_revision:6,is_active:false,is_system:false,sort_order:0});expect(states[9][i].audits).toHaveLength(6);expect(states[9][i].receipts).toHaveLength(8);}
});
it.each(['audit actor','audit deletion','receipt result','receipt replacement'] as const)('rejects changed original %s before reserving a new baseline',change=>{
 const {base,original}=fixtures();
 if(change==='audit actor')base[0].audits[0].actor_user_profile_id=999;
 if(change==='audit deletion')base[0].audits.pop();
 if(change==='receipt result')base[1].receipts[0].result.changed=false;
 if(change==='receipt replacement')base[1].receipts[0].operation_id='replacement';
 expect(()=>validateFocusSnapshot('reserve',base,original,[],actor)).toThrow(/Original recorded/);
});
it.each(['audit payload','audit replacement','receipt payload','receipt replacement','receipt actor'] as const)('preserves newly added full history: %s',change=>{
 const {states}=fixtures(),state=clone(states[2]);
 if(change==='audit payload')state[0].audits.at(-1)!.details.description='tampered';
 if(change==='audit replacement')state[0].audits.at(-1)!.id=9999;
 if(change==='receipt payload')state[0].receipts.find(r=>r.operation_id==='new-1')!.result.changed=false;
 if(change==='receipt replacement')state[0].receipts.find(r=>r.operation_id==='new-1')!.operation_id='replacement';
 if(change==='receipt actor')state[0].receipts.find(r=>r.operation_id==='new-1')!.actor='other-actor';
 expect(()=>check(2,state)).toThrow(/Previously observed/);
});
it('checks every prior stage even if a later snapshot also lost the earlier new audit',()=>{
 const {states}=fixtures(),priors=clone(states.slice(0,3)),state=clone(states[3]);
 priors[2][0].audits.at(-1)!.id=9999;state[0].audits.at(-1)!.id=9999;
 expect(()=>check(3,state,priors)).toThrow(/Previously observed audit/);
});
it.each([2,3,6,7,9])('rejects a no-op/cancel/final timestamp write at stage %i',index=>{
 const {states}=fixtures(),state=clone(states[index]);state[index<5?0:1].rows[0].updated_at='unexpected-write';
 expect(()=>check(index,state)).toThrow(/must not change the saved row/);
});
it.each([1,4,5,8])('rejects an untouched-table metadata write at stage %i',index=>{
 const {states}=fixtures(),state=clone(states[index]);state[index<5?1:0].rows[0].updated_by=999;
 expect(()=>check(index,state)).toThrow(/must not change the saved row/);
});
it.each(['revision','audit','receipt','description'] as const)('rejects an incorrect expected edit delta: %s',field=>{
 const {states}=fixtures(),state=clone(states[1]);
 if(field==='revision')state[0].rows[0].workspace_revision++;
 if(field==='audit')state[0].audits.push({...clone(state[0].audits[0]),id:9999});
 if(field==='receipt')state[0].receipts.push({...clone(state[0].receipts[0]),operation_id:'extra'});
 if(field==='description')state[0].rows[0].description='Not the reserved edit';
 expect(()=>check(1,state)).toThrow();
});
it.each(['identity','active','system','order','name','unrelated'] as const)('rejects writes outside the description window: %s',field=>{
 const {states}=fixtures(),state=clone(states[1]),row=state[0].rows[0];
 if(field==='identity')row.id=106;
 if(field==='active')row.is_active=true;
 if(field==='system')row.is_system=true;
 if(field==='order')row.sort_order=1;
 if(field==='name')row.name='Changed name';
 if(field==='unrelated')state[0].unrelated='changed';
 expect(()=>check(1,state)).toThrow();
});
it('requires every prior snapshot, and rejects an unknown stage',()=>{
 const {states,original}=fixtures();expect(()=>check(3,states[3],states.slice(0,2))).toThrow(/Every prior stage/);
 expect(()=>validateFocusSnapshot('unknown',states[0],original,[],actor)).toThrow(/Unknown focus stage/);
});
it.each(['audit','receipt','updated_by'] as const)('attributes new %s to the reserved fresh actor',field=>{
 const {states}=fixtures(),state=clone(states[1]);
 if(field==='audit')state[0].audits.at(-1)!.actor_user_profile_id=8;
 if(field==='receipt')state[0].receipts.at(-1)!.actor='00000000-0000-4000-8000-000000000511';
 if(field==='updated_by')state[0].rows[0].updated_by=8;
 expect(()=>check(1,state)).toThrow(/reserved fresh actor/);
});
it('also attributes the new no-op receipt to the fresh actor, not the historical actor',()=>{
 const {states}=fixtures(),state=clone(states[2]);state[0].receipts.at(-1)!.actor='00000000-0000-4000-8000-000000000511';
 expect(()=>check(2,state)).toThrow(/reserved fresh actor/);
});
it.each([1,2,4,5,6,8].flatMap(index=>['record_id','result.id','revision','changed','replayed'].map(field=>[index,field] as const)))('rejects an untruthful new receipt at stage %i: %s',(index,field)=>{
 const {states}=fixtures(),state=clone(states[index]),receipt=state[index<5?0:1].receipts.at(-1)!;
 if(field==='record_id')receipt.record_id++;
 if(field==='result.id')receipt.result.id++;
 if(field==='revision')receipt.result.revision='999';
 if(field==='changed')receipt.result.changed=!receipt.result.changed;
 if(field==='replayed')receipt.result.replayed=true;
 expect(()=>check(index,state)).toThrow(/New stage receipt/);
});
it.each([1,4,5,8])('rejects a non-update new audit at stage %i',index=>{
 const {states}=fixtures(),state=clone(states[index]);state[index<5?0:1].audits.at(-1)!.action='insert';
 expect(()=>check(index,state)).toThrow(/New window audit must be an update/);
});
it.each([3,7,9])('rejects any new receipt at cancel/final stage %i',index=>{
 const {states}=fixtures(),state=clone(states[index]),item=state[index<5?0:1];
 item.receipts.push({...clone(item.receipts.at(-1)!),operation_id:'unexpected-cancel-or-final'});
 expect(()=>check(index,state)).toThrow(/Unexpected new stage receipt count/);
});
it.each([{...actor,marker:'F06BROWSER0511'},{...actor,profileId:0},{...actor,profileId:1.5},{...actor,authId:'unverified'}])('rejects an invalid expected actor %j',input=>{expect(()=>validateFocusActor(input)).toThrow();});
it('keeps the executable observer read-only, write-once, chained, and validation-before-receipt',()=>{
 expect(source).toContain('begin transaction read only;');expect(source).toContain('rollback;');
 expect(source).not.toMatch(/(?:insert into|delete from|update public|alter table|create table|grant |revoke )/i);
 expect(source).toContain("{flag:'wx',mode:0o600}");expect(source).toContain('previousSha256=sha(previousBytes)');expect(source).toContain('previous.previousSha256,previousSha256');
 expect(source).toContain('originalSha256:sha(originalBytes)');expect(source).toContain('casePassClaim:false');
 expect(source).toContain('previous.expectedActor,expectedActor');
 expect(source.indexOf('validateFocusSnapshot(step,state,original.state,priorStates,expectedActor)')).toBeLessThan(source.indexOf('fs.writeFileSync(output(step)'));
 expect(source).not.toMatch(/unlinkSync|rmSync|renameSync|keys-private|credentials-private|\blike\b|startsWith\(/i);
});
it('the imported validator has no executable observer or runtime dependencies',()=>{
 const pure=fs.readFileSync('tests/remediation/f06/party-catalogue-focus-validation.mjs','utf8');
 expect(pure).not.toMatch(/local-db|node:fs|node:child_process|process\.|readFile|writeFile|fetch\(/);
});
