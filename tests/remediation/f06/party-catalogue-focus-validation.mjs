// Pure snapshot validation only. No filesystem, process, network or database access.
import assert from 'node:assert/strict';

export const focusSteps=Object.freeze(['reserve','category-edited','category-noop','category-cancelled','category-restored','relationship-edited','relationship-noop','relationship-cancelled','relationship-restored','final']);
export const focusDefinitions=Object.freeze([
 Object.freeze({table:'party_service_categories_master',key:'category_code',code:'F06BROWSER0511_SC',id:105}),
 Object.freeze({table:'party_relationship_types',key:'relationship_code',code:'F06BROWSER0511_RT',id:43}),
]);

export function validateFocusActor(actor){
 assert.equal(actor?.marker,'F06BROWSER0512','Only the reviewed fresh browser actor is allowed.');
 assert.ok(Number.isSafeInteger(actor.profileId)&&actor.profileId>0,'Exact fresh actor profile ID is required.');
 assert.match(actor.authId??'',/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,'Exact fresh actor Auth UUID is required.');
}

function identity(state){
 assert.equal(state.length,focusDefinitions.length);
 for(let i=0;i<state.length;i++){
  const item=state[i],definition=focusDefinitions[i];
  assert.equal(item.table,definition.table);assert.equal(item.code,definition.code);
  assert.equal(item.rows.length,1);assert.equal(item.rows[0].id,definition.id);
  assert.equal(item.rows[0][definition.key],definition.code);
  for(const field of ['is_active','is_system'])assert.equal(item.rows[0][field],false);
  assert.equal(item.rows[0].sort_order,0);
 }
}

function preserveHistory(current,prior){
 for(const audit of prior.audits)
  assert.deepEqual(current.audits.find(row=>row.id===audit.id),audit,'Previously observed audit history changed.');
 for(const receipt of prior.receipts)
  assert.deepEqual(current.receipts.find(row=>row.operation_id===receipt.operation_id&&row.actor===receipt.actor),receipt,'Previously observed operation history changed.');
}

/** Compare the old compact receipt only at its actually recorded resolution;
 * all subsequent observations preserve full rows, including newly added history.
 * priorStates contains every successful stage, in order, beginning with reserve. */
export function validateFocusSnapshot(step,state,originalState,priorStates,actor){
 validateFocusActor(actor);
 const index=focusSteps.indexOf(step);assert.ok(index>=0,'Unknown focus stage.');
 assert.equal(priorStates.length,index,'Every prior stage must be available.');
 identity(state);identity(originalState);
 if(index===0){
  for(let i=0;i<state.length;i++){
   const item=state[i],original=originalState[i];
   assert.deepEqual(item.rows,original.rows,'Original retained fixture changed; review before reuse.');
   assert.deepEqual(item.audits.map(row=>({id:row.id,actor:row.actor_user_profile_id,action:row.action})),original.audits,'Original recorded audit history changed.');
   assert.deepEqual(item.receipts.map(row=>({operation:row.operation_id,actor:row.actor,recordId:row.record_id,result:row.result})),original.receipts,'Original recorded operation history changed.');
  }
  return;
 }
 const baseline=priorStates[0],previous=priorStates.at(-1);
 validateFocusSnapshot('reserve',baseline,originalState,[],actor);
 for(const prior of priorStates)identity(prior);
 for(let i=0;i<state.length;i++){
  const item=state[i],base=baseline[i];
  assert.equal(item.unrelated,base.unrelated,'Unrelated catalogue rows changed.');
  for(const prior of priorStates)preserveHistory(item,prior[i]);
  for(const audit of item.audits.filter(row=>!base.audits.some(old=>old.id===row.id))){
   assert.equal(audit.actor_user_profile_id,actor.profileId,'New audit must belong to the reserved fresh actor.');
   assert.equal(audit.action,'update','New window audit must be an update.');
  }
  for(const receipt of item.receipts.filter(row=>!base.receipts.some(old=>old.operation_id===row.operation_id&&old.actor===row.actor)))
   assert.equal(receipt.actor,actor.authId,'New operation receipt must belong to the reserved fresh actor.');
  const start=i===0?1:5,relative=index-start;
  const changes=relative<0?0:relative<3?1:2;
  const noops=relative>=1?1:0;
  const mutatesRow=index===start||index===start+3;
  const noopsNow=index===start+1;
  const newReceipts=item.receipts.filter(row=>!previous[i].receipts.some(old=>old.operation_id===row.operation_id&&old.actor===row.actor));
  assert.equal(newReceipts.length,mutatesRow||noopsNow?1:0,'Unexpected new stage receipt count.');
  for(const receipt of newReceipts){
   assert.equal(receipt.record_id,item.rows[0].id,'New stage receipt record_id must match the exact target.');
   assert.deepEqual(receipt.result,{id:item.rows[0].id,revision:String(item.rows[0].workspace_revision),changed:mutatesRow,replayed:false},'New stage receipt must truthfully report the saved result.');
  }
  if(mutatesRow){
   assert.equal(item.rows[0].updated_by,actor.profileId,'Description update must belong to the reserved fresh actor.');
   const expectedRow={...base.rows[0]},currentRow={...item.rows[0]};
   // Only an actual edit/restoration can change write metadata. No-op, discard,
   // final and the other table's stages must preserve the complete saved row.
   for(const field of ['description','updated_at','updated_by','workspace_revision']){delete expectedRow[field];delete currentRow[field];}
   assert.deepEqual(currentRow,expectedRow,'Only the reserved description edit is allowed.');
  }else assert.deepEqual(item.rows,previous[i].rows,'This stage must not change the saved row or its write metadata.');
  assert.equal(Number(item.rows[0].workspace_revision),Number(base.rows[0].workspace_revision)+changes);
  assert.equal(item.audits.length,base.audits.length+changes);
  assert.equal(item.receipts.length,base.receipts.length+changes+noops);
  assert.equal(typeof base.rows[0].description,'string');
  const edited=relative>=0&&relative<3;
  assert.equal(item.rows[0].description,edited?base.rows[0].description+' F06 focus verification.':base.rows[0].description);
 }
}
