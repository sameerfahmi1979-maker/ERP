// Offline pure/source-only authoring proof. Never imports an executable/helper,
// reads ignored runtime evidence or opens Docker, DB, Auth, Storage or browsers.
import fs from 'node:fs';
import ts from 'typescript';
import {describe,expect,it} from 'vitest';
import {scopedBrowserModes,modeFor,fixtureOwner,assignmentScope,id,validatePermissions,
  permissionsSql,roleCreateSql,projectionSql,assertPreserved,stateSql,assertRole,assertActor,
  actorPrepareSql,actorRetireSql,roleRetireSql,ownerSql} from './scoped-browser-contract.mjs';

const owner={companyId:701,branchId:802,adminProfileId:903,adminRoleId:904,adminAssignmentId:905,
  adminAuthId:'11111111-1111-4111-8111-111111111111'};
const ledger=()=>({marker:'F06_LOCAL_20261001',productionRowsCopied:0,companyIds:[701,702],branchIds:[802,803,804],
  actors:{admin:{profileId:903,roleId:904,assignmentId:905,authId:owner.adminAuthId}},
  rows:[{table:'owner_companies',id:701},{table:'branches',id:802},{table:'roles',id:904},{table:'user_roles',id:905}]});
const permissionRows=(name='branch-restricted')=>modeFor(name).permissions.map((code:string,index:number)=>({id:1001+index,code,active:true}));
function fixture(name='branch-restricted'){
  const mode=modeFor(name),permissions=permissionRows(name);
  const reservation={mode:name,owner,authId:'22222222-2222-4222-8222-222222222222',roleId:1101,
    pairs:permissions.map((r:{id:number},index:number)=>({id:1201+index,role_id:1101,permission_id:r.id})),permissions};
  const prepared={profileId:1301,assignmentId:1401},scope=assignmentScope(mode,owner);
  const state={role:{id:1101,role_code:mode.roleCode,role_name:mode.fullName,notes:mode.marker,is_active:true,is_system_role:false,is_assignable:false},
    pairs:reservation.pairs,auth:{id:reservation.authId,email:mode.email,marker:mode.marker,confirmed:true,role:'authenticated',banned:false},
    profiles:[{id:1301,auth_user_id:reservation.authId,notes:mode.marker,full_name:mode.fullName,display_name:mode.fullName,
      owner_company_id:701,branch_id:scope.branchId,must_change_password:false,status:'active'}],
    assignments:[{id:1401,user_profile_id:1301,role_id:1101,owner_company_id:scope.companyId,branch_id:scope.branchId,is_active:true}],
    sessions:[{id:'33333333-3333-4333-8333-333333333333',userId:reservation.authId}],refreshIds:['4501']};
  return {mode,reservation,prepared,state};
}
const read=(name:string)=>fs.readFileSync('tests/remediation/f06/'+name,'utf8');

describe('closed scoped browser admission contracts',()=>{
  it('has exactly three finite modes, no admin or arbitrary permission input',()=>{
    expect(Object.keys(scopedBrowserModes)).toEqual(['branch-restricted','company-branding','global-reader']);
    for(const mode of Object.values(scopedBrowserModes)){
      expect(mode.roleCode).not.toMatch(/^(system_admin|group_admin)$/);expect(mode.email).toMatch(/@example\.invalid$/);
      expect(Object.isFrozen(mode.permissions)).toBe(true);
      expect(mode.permissions).not.toContain('reports.sign');expect(mode.permissions).not.toContain('branding.assets.upload');
    }
    expect(()=>modeFor('system_admin')).toThrow();expect(()=>modeFor('__proto__')).toThrow();
  });
  it('matches the reviewed least-capability sets exactly',()=>{
    expect(modeFor('branch-restricted').permissions).toEqual(['hr.settings.view','hr.settings.manage','common_md.work_calendars.view','common_md.work_calendars.manage','settings.email.view','settings.ai.view']);
    expect(modeFor('company-branding').permissions).toEqual(['common_md.work_calendars.view','common_md.work_calendars.manage','reports.view','reports.manage','organizations.view']);
    expect(modeFor('global-reader').permissions).toEqual(['settings.email.view','settings.ai.view','branding.app.view']);
  });
  it('resolves source ledger keys without assuming historical numeric IDs',()=>{
    expect(fixtureOwner(ledger())).toEqual(owner);const source=read('fixtures.mjs');
    expect(source).toContain("for(const name of ['A','B'])ledger.companyIds.push");
    expect(source).toContain("for(const name of ['A1','A2','B1'])ledger.branchIds.push");
  });
  it('rejects unowned ledger rows and a non-synthetic baseline',()=>{
    const l=ledger();l.rows=[];expect(()=>fixtureOwner(l)).toThrow('UNOWNED_FIXTURE');
    const p=ledger();p.productionRowsCopied=1;expect(()=>fixtureOwner(p)).toThrow();
  });
  it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1,'1',null])('rejects unsafe identity %s',value=>expect(()=>id(value)).toThrow());
  it.each(['branch-restricted','company-branding','global-reader'])('uses one assignment-bound scope for %s',name=>{
    const scope=assignmentScope(modeFor(name),owner);
    expect(scope).toEqual(name==='branch-restricted'?{companyId:701,branchId:802}:name==='company-branding'?{companyId:701,branchId:null}:{companyId:null,branchId:null});
    const f=fixture(name);expect(()=>assertRole(f.state,f.reservation)).not.toThrow();expect(()=>assertActor(f.state,f.reservation,f.prepared)).not.toThrow();
    const sql=actorPrepareSql(f.reservation,f.prepared.profileId);
    expect(sql).toContain(`values(1301,1101,${scope.companyId??'null'},${scope.branchId??'null'},true)`);
  });
  it('rejects inactive, missing, extra or duplicate canonical permission definitions',()=>{
    const mode=modeFor('branch-restricted');expect(()=>validatePermissions(mode,permissionRows())).not.toThrow();
    const inactive=permissionRows();inactive[0].active=false;expect(()=>validatePermissions(mode,inactive)).toThrow();
    expect(()=>validatePermissions(mode,permissionRows().slice(1))).toThrow();
    expect(()=>validatePermissions(mode,[...permissionRows(),{id:1999,code:'hr.admin',active:true}])).toThrow();
    const duplicate=permissionRows();duplicate[1].id=duplicate[0].id;expect(()=>validatePermissions(mode,duplicate)).toThrow();
  });
  it('role creation locks and checks canonical permissions without editing them',()=>{
    const mode=modeFor('branch-restricted'),sql=roleCreateSql(mode,permissionRows());
    expect(sql).toContain('lock table public.permissions in share mode');expect(sql).toContain('p.permission_code=e.code where p.is_active');
    expect(sql).toContain('insert into public.roles');expect(sql).toContain('insert into public.role_permissions');
    expect(sql).not.toMatch(/(?:insert into|update|delete from) public\.permissions\b/i);
    expect(permissionsSql(mode)).toMatch(/^select /);expect(permissionsSql(mode)).not.toContain('system_admin');
  });
  it('verifies exact company/branch provenance before creating actors',()=>{
    const sql=ownerSql(owner);expect(sql).toContain("branch_code='F06_A1'");expect(sql).toContain('owner_company_id=701');
    expect(sql).toContain("company_code='F06_A'");expect(sql).toContain("p.status='active'");
  });
  it('fails exact actor checks for sibling scope or any extra role assignment',()=>{
    const f=fixture();f.state.assignments[0].branch_id=803;expect(()=>assertActor(f.state,f.reservation,f.prepared)).toThrow();
    const g=fixture();g.state.assignments.push({...g.state.assignments[0],id:1402});expect(()=>assertActor(g.state,g.reservation,g.prepared)).toThrow();
  });
});

describe('retention and preservation SQL contracts',()=>{
  it('retirement requires a ban and deletes only captured own sessions/tokens',()=>{
    const f=fixture();expect(()=>actorRetireSql(f.reservation,f.prepared,f.state)).toThrow();f.state.auth.banned=true;
    const sql=actorRetireSql(f.reservation,f.prepared,f.state);
    expect(sql).toContain("set status='inactive'");expect(sql).toContain('set is_active=false');
    expect(sql).toContain("id in ('4501')");expect(sql).toContain("id in ('33333333-3333-4333-8333-333333333333')");
    expect(sql).toContain(`user_id='${f.reservation.authId}'`);
    expect(sql).not.toMatch(/delete from public\./);expect(sql).not.toContain('delete from auth.users');
    expect(sql).not.toContain('delete from auth.identities');
  });
  it('refuses session ownership substitution',()=>{
    const f=fixture();f.state.auth.banned=true;f.state.sessions[0].userId=owner.adminAuthId;
    expect(()=>actorRetireSql(f.reservation,f.prepared,f.state)).toThrow();
  });
  it('retires the own role only after exact inactive actor and zero sessions',()=>{
    const f=fixture(),sql=roleRetireSql(f.reservation,f.prepared);
    expect(sql).toContain('where role_id=1101)<>1');expect(sql).toContain("p.status='inactive'");expect(sql).toContain('u.banned_until>now()');
    expect(sql).toContain('from auth.sessions');expect(sql).toContain('from auth.refresh_tokens');
    expect(sql).toContain('update public.roles set is_active=false where id=1101');expect(sql).not.toMatch(/delete|update public.permissions/i);
  });
  it('projection preserves null-auth profiles, all canonical permissions and full actor-window roles',()=>{
    const f=fixture(),all=projectionSql(f.reservation.authId),closed=projectionSql(f.reservation.authId,1101);
    expect(all).toContain('auth_user_id is distinct from');expect(all).toContain('from public.roles r where true');
    expect(closed).toContain('from public.roles r where r.id<>1101');expect(closed).toContain('r.role_id<>1101');
    expect(closed).not.toContain('role_code like');expect(closed).not.toContain('permission_code like');
    expect(closed).toContain("from public.permissions p)");
  });
  it('detects permission and unrelated identity drift, never a broad synthetic waiver',()=>{
    const before={profiles:{a:'one'},assignments:{b:'two'},roles:'roles',permissions:'permissions',rolePermissions:'pairs',authIdentities:{},authProviderIdentities:{},sessions:{s:'u'},refreshIdentities:{r:['u','s']}};
    expect(()=>assertPreserved(before,structuredClone(before))).not.toThrow();
    for(const key of ['profiles','assignments','roles','permissions','rolePermissions','authIdentities','authProviderIdentities']){
      const changed={...before,[key]:'changed'};expect(()=>assertPreserved(before,changed,true)).toThrow();
    }
    const additional={...before,sessions:{...before.sessions,newSession:'other'}};
    expect(()=>assertPreserved(before,additional)).toThrow();expect(()=>assertPreserved(before,additional,true)).not.toThrow();
    expect(()=>assertPreserved(before,{...before,sessions:{}},true)).toThrow();
  });
  it('state checks include all assignments to owned role, including foreign principals',()=>{
    expect(stateSql(fixture().reservation)).toContain('where role_id=1101 or user_profile_id in');
  });
});

describe('source-only executable safety review',()=>{
  const runtime=read('scoped-browser-runtime.mjs'),actor=read('scoped-browser-acceptance-actor.mjs'),checker=read('scoped-browser-resource-check.mjs');
  it('runtime work is inside factories; entry points are direct-execution guarded',()=>{
    for(const source of [actor,checker])expect(source).toContain('pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url');
    expect(runtime.indexOf('fs.realpathSync')).toBeGreaterThan(runtime.indexOf('export function openScopedRuntime'));
    expect(runtime).toContain("await import('@supabase/supabase-js')");
    expect(runtime).not.toMatch(/^import .*supabase/m);expect(actor).not.toContain("from './local-db.mjs'");
  });
  it('pins review bytes, exact local container, cwd, loopback, private path and local-only API',()=>{
    for(const term of ['c:/dev/agt-erp-f06','68ba17ecef10f3f77ae563b68d68bd146331bf844eeb735a3dae0d7831fd1d0c','127.0.0.1','16621','16622','REVIEWED_SOURCE_HASH_REQUIRED','protected-local-parent','isSymbolicLink','project-ref'])expect(runtime).toContain(term);
    expect(runtime).toContain("redirect:'error'");expect(runtime).toContain('AbortSignal.timeout(15000)');
    expect(runtime).toContain("assert.equal(readOnly,false);uuid(reservation.authId);guard()");
  });
  it('protects a whole sequential role/actor lifetime and retains failures without retries',()=>{
    expect(runtime).toContain("fs.openSync(lifetimeLock,'wx',0o600)");expect(runtime).toContain("if(command==='role-retire')");
    expect(runtime).toContain('ANOTHER_BROWSER_ACTOR_ACTIVE');expect(runtime).toContain('FAILED_OUTCOME_REQUIRES_MAIN_RECONCILIATION');
    expect(runtime).toContain("command+'-attempt-private.json'");expect(runtime).toContain("event==='failure-retained'");
    expect(actor).not.toContain('setTimeout');expect(actor).not.toContain('retry(');
    expect(actor).toContain("rt.completed('retire')");
  });
  it('checker cannot write database or construct Auth client and asserts exact retained IDs',()=>{
    expect(checker).toContain('openScopedRuntime(modeName,{readOnly:true})');expect(runtime).toContain("assert.ok(!readOnly||!write,'CHECKER_IS_READ_ONLY')");
    expect(checker).not.toContain('.authAdmin(');expect(checker).not.toContain('.sql(');
    expect(checker).toContain('OWNED_PERMISSION_PAIRS_CHANGED');expect(checker).toContain('RETIRED_ASSIGNMENT_CHANGED');
    expect(checker).toContain('PRESERVE_ORIGINAL_CHECK');expect(checker).toContain('browserPassClaim:false');expect(checker).toContain('repairs:0');
    expect(checker).toContain('FAILED_CHECK_REQUIRES_MAIN_RECONCILIATION');
  });
  it('only credential receipt receives password and all reported failures are redacted',()=>{
    expect(actor).toContain("rt.receipt('credentials-private.json'");
    expect(actor).not.toMatch(/rt\.append\([^\n]*password/);expect(actor).not.toMatch(/process\.(?:stdout|stderr)[^\n]*password/);
    expect(runtime).toContain("throw Error('BOUNDED_LOCAL_PROCESS_FAILED')");expect(actor).toContain('redacted:true');
  });
  it('schema fields are real generated types; profiles use status not is_active',()=>{
    const database=fs.readFileSync('src/types/database.ts','utf8');
    function columns(table:string){return database.split('      '+table+': {')[1].split('        Row: {')[1].split('        Insert: {')[0];}
    for(const key of ['role_code','role_name','notes','is_system_role','is_active','is_assignable'])expect(columns('roles')).toContain('          '+key+':');
    for(const key of ['status','branch_id','owner_company_id','notes','full_name','display_name','must_change_password'])expect(columns('user_profiles')).toContain('          '+key+':');
    expect(columns('user_profiles')).not.toContain('          is_active:');expect(columns('branches')).toContain('          status:');
  });
  it.each(['scoped-browser-contract.mjs','scoped-browser-runtime.mjs','scoped-browser-acceptance-actor.mjs','scoped-browser-resource-check.mjs'])('parses %s without importing executable',name=>{
    const parsed=ts.createSourceFile(name,read(name),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    expect((parsed as unknown as {parseDiagnostics:unknown[]}).parseDiagnostics).toEqual([]);
  });
});
