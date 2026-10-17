'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {validateFixture,assertActorAuthority,authorityInspectionSql,verifyActorSessions,actorNames,nativeRead,assertNativeFirstPage} = require('../../../../tooling/integration/f00-f06/schema/native-fixture.cjs');
const jwt = (sub,session_id,role='authenticated') => `${Buffer.from('{"alg":"TEST_ONLY"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub,session_id,role})).toString('base64url')}.synthetic-test-signature-not-valid`;
function fixture() {
  const ids=Array.from({length:1105},(_,i)=>10000+i);
  const result={version:1,labProjectId:'algt-integration-20261016',apiOrigin:'http://127.0.0.1:16921',appOrigin:'http://127.0.0.1:16941',prefix:'F00F06_TEMPLATE_UNIT',workersDisabled:true,providersDisabled:true,anonKey:'synthetic-public-key-not-valid',companyId:9001,foreignCompanyId:9002,actors:{},ids:{tailId:11104,inactiveId:12001,draftId:12002,deletedId:12003,foreignId:12004,unbrandedId:12005,globalBrandingId:12006,inactiveBrandingId:12007,deletedBrandingId:12008}};
  actorNames.forEach((name,index)=>{
    const suffix=String(index+1).padStart(12,'0'),authUserId=`10000000-0000-4000-8000-${suffix}`,sessionId=`20000000-0000-4000-8000-${suffix}`;
    const assignment={roleId:index+1,roleCode:`synthetic_${name}`,ownerCompanyId:name==='global'?null:9001,branchId:name==='branchOnly'?9011:null,permissionCodes:['reports.view']};
    result.actors[name]={authUserId,sessionId,profileId:index+100,bearer:jwt(authUserId,sessionId),cookie:`synthetic-independent-${name}-cookie-not-valid`,
      expectedAssignments:name==='noRole'?[]:[assignment],reportCenterIds:['noRole','branchOnly'].includes(name)?[]:[...ids],employeeLetterIds:['noRole','branchOnly'].includes(name)?[]:[...ids]};
  });
  result.actors.combined.expectedAssignments.push({roleId:99,roleCode:'synthetic_unrelated_global',ownerCompanyId:null,branchId:null,permissionCodes:['roles.view']});
  return result;
}
const live = value => actorNames.map(name=>({...value.actors[name],status:'active',mustChangePassword:false,sessionValid:true,assignments:structuredClone(value.actors[name].expectedAssignments)}));
test('first-page native partial/full/empty responses require actual status and exact range',()=>{
  for(const total of [0,1,25,26,1109]){
    const expected=Array.from({length:total},(_,i)=>i+1),body=expected.slice(0,25).map(id=>({id}));
    assertNativeFirstPage({status:total>25?206:200,body,count:total,contentRange:total?`0-${body.length-1}/${total}`:'*/0'},expected);
  }
});
test('first-page native status cannot conceal inconsistent counts, rows or ranges',()=>{
  const expected=Array.from({length:1109},(_,i)=>i+1),page={status:206,body:expected.slice(0,25).map(id=>({id})),count:1109,contentRange:'0-24/1109'};
  for(const changed of [{status:200},{status:503},{contentRange:null},{contentRange:'0-23/1109'},{contentRange:'1-25/1109'},{contentRange:'0-24/1110'},{contentRange:'0-24/*'},{contentRange:'0-24/9007199254740993'},{contentRange:'00-24/1109'},{contentRange:'0-024/1109'},{contentRange:'0-24/-1'},{contentRange:' 0-24/1109'},{count:1108},{body:page.body.slice(1)},{body:[...page.body].reverse()}])assert.throws(()=>assertNativeFirstPage({...page,...changed},expected));
  for(const changed of [{status:206,contentRange:'*/0'},{status:200,contentRange:'0-0/0'},{status:200,contentRange:'*/1'}])assert.throws(()=>assertNativeFirstPage({body:[],count:0,...changed},[]));
  assert.throws(()=>assertNativeFirstPage({status:206,body:[{id:1}],count:1,contentRange:'0-0/1'},[1]));
});
test('native read preserves the real partial status and raw range without normalization',async()=>{
  const value=fixture(),original=global.fetch,expected=Array.from({length:1109},(_,i)=>i+1),body=expected.slice(0,25).map(id=>({id}));
  try{
    global.fetch=async(url,options)=>{assert.equal(options.headers.Prefer,'count=exact');assert.equal(new URL(url).searchParams.get('limit'),'25');return{status:206,headers:new Headers({'content-range':'0-24/1109'}),json:async()=>body};};
    const response=await nativeRead(value,value.actors.global,{limit:'25',offset:'0'});
    assert.equal(response.status,206);assert.equal(response.contentRange,'0-24/1109');assertNativeFirstPage(response,expected);
  }finally{global.fetch=original;}
});
test('complete synthetic fixture and independently matching SQL authority pass admission',()=>{
  const value=fixture();assert.equal(validateFixture(value),value);assert.doesNotThrow(()=>assertActorAuthority(value,live(value)));
  assert.match(authorityInspectionSql(value),/^BEGIN READ ONLY;/);assert.match(authorityInspectionSql(value),/auth\.sessions/);
});
for(const field of ['authUserId','sessionId','profileId','bearer','cookie'])test(`reused ${field} cannot masquerade as independent actors`,()=>{
  const value=fixture();value.actors.combined[field]=value.actors.scoped[field];assert.throws(()=>validateFixture(value),/independent/);
});
for(const name of ['branchOnly','noRole'])for(const kind of ['reportCenterIds','employeeLetterIds'])test(`${name} cannot bless unauthorized ${kind}`,()=>{
  const value=fixture();value.actors[name][kind]=[10000];assert.throws(()=>validateFixture(value),/never expect/);
});
for(const name of ['branchOnly','noRole','combined'])test(`${name} actual privilege drift cannot be hidden by editing expected claims`,()=>{
  const value=fixture();
  value.actors[name].expectedAssignments=[{roleId:1,roleCode:'synthetic_widened',ownerCompanyId:null,branchId:null,permissionCodes:['reports.view']}];
  assert.throws(()=>assertActorAuthority(value,live(value)));
});
test('active sessions and full live tuple equality are mandatory',()=>{
  const value=fixture(),rows=live(value);rows[1].assignments[0].ownerCompanyId=9002;
  assert.throws(()=>assertActorAuthority(value,rows),/actual roles\/scopes differ/);
  const fresh=live(value);fresh[0].sessionValid=false;assert.throws(()=>assertActorAuthority(value,fresh));
});
test('foreign target and injectable UUID are refused before SQL/network',()=>{
  const value=fixture();value.apiOrigin='https://example.invalid';assert.throws(()=>validateFixture(value));
  const value2=fixture();value2.actors.scoped.authUserId="00000000';select1";assert.throws(()=>authorityInspectionSql(value2));
});
test('bearer and app cookie must independently resolve the same pinned actor',async()=>{
  const value=fixture(),original=global.fetch;let sqlCalled=false;
  try{
    global.fetch=async url=>({status:200,json:async()=>String(url).endsWith('/auth/v1/user')?{id:value.actors.global.authUserId}:{authUserId:value.actors.scoped.authUserId,active:true,requiredChange:false}});
    await assert.rejects(()=>verifyActorSessions(value,async()=>{sqlCalled=true;return live(value);}));
    assert.equal(sqlCalled,false);
  }finally{global.fetch=original;}
});
test('valid server identities still require fresh independent SQL roles rather than JWT claims',async()=>{
  const value=fixture(),original=global.fetch;let actorIndex=0,sqlCalled=false;
  try{
    global.fetch=async url=>{const actor=value.actors[actorNames[actorIndex]];const api=String(url).endsWith('/auth/v1/user');if(!api)actorIndex++;return{status:200,json:async()=>api?{id:actor.authUserId}:{authUserId:actor.authUserId,active:true,requiredChange:false}};};
    await verifyActorSessions(value,async query=>{sqlCalled=true;assert.match(query,/BEGIN READ ONLY/);return live(value);});
    assert.equal(sqlCalled,true);
  }finally{global.fetch=original;}
});
for(const role of ['service_role','postgres','supabase_admin','anon',null])test(`bearer role ${role} cannot masquerade as caller-RLS evidence`,async()=>{
  const value=fixture(),original=global.fetch;let networkCalled=false,sqlCalled=false;
  value.actors.global.bearer=jwt(value.actors.global.authUserId,value.actors.global.sessionId,role);
  try{
    global.fetch=async()=>{networkCalled=true;throw Error('Must stop before network');};
    await assert.rejects(()=>verifyActorSessions(value,async()=>{sqlCalled=true;return live(value);}),/ordinary authenticated caller-RLS authority/);
    assert.equal(networkCalled,false);assert.equal(sqlCalled,false);
  }finally{global.fetch=original;}
});
test('bearer without an auth role cannot count as ordinary caller-RLS evidence',async()=>{
  const value=fixture(),actor=value.actors.global,parts=actor.bearer.split('.');
  parts[1]=Buffer.from(JSON.stringify({sub:actor.authUserId,session_id:actor.sessionId})).toString('base64url');actor.bearer=parts.join('.');
  await assert.rejects(()=>verifyActorSessions(value,async()=>live(value)),/ordinary authenticated caller-RLS authority/);
});
