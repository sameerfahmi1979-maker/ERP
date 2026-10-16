// Pure contracts only: importing this module never reads files or invokes runtime.
import assert from 'node:assert/strict';

const define = (marker, scope, permissions) => Object.freeze({marker, scope,
  email: marker.toLowerCase() + '@example.invalid', roleCode: marker.toLowerCase(),
  fullName: 'F06 synthetic browser ' + marker, permissions:Object.freeze(permissions)});
export const scopedBrowserModes = Object.freeze({
  'branch-restricted': define('F06SCOPED0513_BRANCH', 'branch', [
    'hr.settings.view','hr.settings.manage','common_md.work_calendars.view',
    'common_md.work_calendars.manage','settings.email.view','settings.ai.view']),
  'company-branding': define('F06SCOPED0514_COMPANY', 'company', [
    'common_md.work_calendars.view','common_md.work_calendars.manage',
    'reports.view','reports.manage','organizations.view']),
  'global-reader': define('F06SCOPED0515_READER', 'global', [
    'settings.email.view','settings.ai.view','branding.app.view']),
});
export const commands = Object.freeze(['role-prepare','prepare','observe','retire','role-retire']);
export const id = value => {assert.ok(Number.isSafeInteger(value) && value > 0, 'INVALID_ID');return value;};
export const uuid = value => {assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);return value;};
export const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
export function modeFor(name) {assert.ok(Object.hasOwn(scopedBrowserModes,name),'UNKNOWN_MODE');return scopedBrowserModes[name];}
export function fixtureOwner(ledger) {
  // These exact keys/order are authored in fixtures.mjs; no numeric IDs guessed.
  assert.equal(ledger.marker,'F06_LOCAL_20261001');assert.equal(ledger.productionRowsCopied,0);
  const owner={companyId:id(ledger.companyIds[0]),branchId:id(ledger.branchIds[0]),
    adminProfileId:id(ledger.actors.admin.profileId),adminRoleId:id(ledger.actors.admin.roleId),
    adminAssignmentId:id(ledger.actors.admin.assignmentId),adminAuthId:ledger.actors.admin.authId};
  assert.match(owner.adminAuthId,/^[0-9a-f-]{36}$/i);
  for(const [table,value] of [['owner_companies',owner.companyId],['branches',owner.branchId],
    ['roles',owner.adminRoleId],['user_roles',owner.adminAssignmentId]])
    assert.ok(ledger.rows.some(row=>row.table===table&&row.id===value),'UNOWNED_FIXTURE');
  return owner;
}
export function assignmentScope(mode,owner) {
  return {companyId:mode.scope==='global'?null:id(owner.companyId),branchId:mode.scope==='branch'?id(owner.branchId):null};
}
const literalId = value => value===null?'null':String(id(value));
export function validatePermissions(mode,rows) {
  assert.equal(rows.length,mode.permissions.length,'PERMISSION_SET_MISMATCH');
  assert.deepEqual(rows.map(r=>r.code).sort(),[...mode.permissions].sort(),'PERMISSION_SET_MISMATCH');
  for(const row of rows){id(row.id);assert.equal(row.active,true,'CANONICAL_PERMISSION_INACTIVE');}
  assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
  return rows;
}
export function permissionsSql(mode) {
  return `select coalesce(jsonb_agg(jsonb_build_object('id',id,'code',permission_code,'active',is_active) order by permission_code),'[]') from public.permissions where permission_code in (${mode.permissions.map(quote).join(',')});`;
}
export function ownerSql(owner) {
  return `select json_build_object(
    'company',exists(select 1 from public.owner_companies where id=${id(owner.companyId)} and company_code='F06_A' and legal_name_en='F06 synthetic company A' and status='active'),
    'branch',exists(select 1 from public.branches where id=${id(owner.branchId)} and owner_company_id=${owner.companyId} and branch_code='F06_A1' and branch_name_en='F06 synthetic branch A1' and status='active'),
    'admin',exists(select 1 from public.user_roles a join public.roles r on r.id=a.role_id join public.user_profiles p on p.id=a.user_profile_id
      where a.id=${id(owner.adminAssignmentId)} and p.id=${id(owner.adminProfileId)} and p.auth_user_id=${quote(owner.adminAuthId)}::uuid
      and r.id=${id(owner.adminRoleId)} and r.role_code='system_admin' and r.role_name='F06 synthetic admin' and r.is_active and r.is_system_role
      and a.is_active and a.owner_company_id is null and a.branch_id is null and p.status='active'));`;
}
export function roleCreateSql(mode,permissions) {
  validatePermissions(mode,permissions);
  const pairs=permissions.map(r=>`(${id(r.id)},${quote(r.code)})`).join(',');
  return `lock table public.permissions in share mode;
    do $guard$ begin if exists(select 1 from public.roles where role_code=${quote(mode.roleCode)} or notes=${quote(mode.marker)})
      or (select count(*) from public.permissions p join (values ${pairs}) e(id,code) on p.id=e.id and p.permission_code=e.code where p.is_active)<>${permissions.length}
      then raise exception 'ROLE_OR_PERMISSION_CHANGED';end if;end $guard$;
    with r as (insert into public.roles(role_code,role_name,notes,is_system_role,is_active,is_assignable)
      values(${quote(mode.roleCode)},${quote(mode.fullName)},${quote(mode.marker)},false,true,false) returning id),
    rp as (insert into public.role_permissions(role_id,permission_id) select r.id,p.id from r cross join public.permissions p where p.id in (${permissions.map(r=>id(r.id)).join(',')}) returning id,role_id,permission_id)
    select json_build_object('roleId',(select id from r),'pairs',(select jsonb_agg(to_jsonb(rp) order by permission_id) from rp));`;
}
export function projectionSql(authId,excludedRoleId=null) {
  uuid(authId);const roleFilter=excludedRoleId===null?'true':`r.id<>${id(excludedRoleId)}`;
  const pairFilter=excludedRoleId===null?'true':`r.role_id<>${id(excludedRoleId)}`;
  return `select json_build_object(
    'profiles',(select coalesce(jsonb_object_agg(id::text,md5(to_jsonb(p)::text)),'{}') from public.user_profiles p where auth_user_id is distinct from ${quote(authId)}::uuid),
    'assignments',(select coalesce(jsonb_object_agg(id::text,md5(to_jsonb(r)::text)),'{}') from public.user_roles r where user_profile_id not in(select id from public.user_profiles where auth_user_id=${quote(authId)}::uuid)),
    'roles',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by id),'[]')::text) from public.roles r where ${roleFilter}),
    'permissions',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by id),'[]')::text) from public.permissions p),
    'rolePermissions',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by role_id,permission_id),'[]')::text) from public.role_permissions r where ${pairFilter}),
    'authIdentities',(select coalesce(jsonb_object_agg(id::text,md5(jsonb_build_array(email,role,banned_until,deleted_at)::text)),'{}') from auth.users where id<>${quote(authId)}::uuid),
    'authProviderIdentities',(select coalesce(jsonb_object_agg(id::text,md5(jsonb_build_array(user_id,provider)::text)),'{}') from auth.identities where user_id<>${quote(authId)}::uuid),
    'sessions',(select coalesce(jsonb_object_agg(id::text,user_id::text),'{}') from auth.sessions where user_id<>${quote(authId)}::uuid),
    'refreshIdentities',(select coalesce(jsonb_object_agg(id::text,jsonb_build_array(user_id,session_id)),'{}') from auth.refresh_tokens where user_id<>${quote(authId)}));`;
}
export function assertPreserved(before,after,allowAdditionalSessions=false) {
  for(const key of ['profiles','assignments','roles','permissions','rolePermissions','authIdentities','authProviderIdentities'])assert.deepEqual(after[key],before[key],key);
  for(const key of ['sessions','refreshIdentities']) {
    if(allowAdditionalSessions)for(const [keyId,value] of Object.entries(before[key]))assert.deepEqual(after[key][keyId],value,key);
    else assert.deepEqual(after[key],before[key],key);
  }
}
export function stateSql(reservation) {
  const {authId,roleId}=reservation;uuid(authId);id(roleId);
  return `select json_build_object(
    'role',(select to_jsonb(r) from public.roles r where id=${roleId}),
    'pairs',(select coalesce(jsonb_agg(to_jsonb(r) order by permission_id),'[]') from public.role_permissions r where role_id=${roleId}),
    'auth',(select json_build_object('id',id,'email',email,'confirmed',email_confirmed_at is not null,'banned',banned_until>now(),'marker',raw_app_meta_data->>'f06_marker','role',role) from auth.users where id=${quote(authId)}::uuid),
    'profiles',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.user_profiles p where auth_user_id=${quote(authId)}::uuid),
    'assignments',(select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]') from public.user_roles a where role_id=${roleId} or user_profile_id in(select id from public.user_profiles where auth_user_id=${quote(authId)}::uuid)),
    'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'userId',user_id) order by id),'[]') from auth.sessions where user_id=${quote(authId)}::uuid),
    'refreshIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from auth.refresh_tokens where user_id=${quote(authId)}));`;
}
export function assertRole(state,reservation,active=true) {
  const mode=modeFor(reservation.mode);id(reservation.roleId);
  assert.equal(state.role?.id,reservation.roleId);assert.equal(state.role.role_code,mode.roleCode);
  assert.equal(state.role.role_name,mode.fullName);assert.equal(state.role.notes,mode.marker);
  assert.equal(state.role.is_system_role,false);assert.equal(state.role.is_assignable,false);assert.equal(state.role.is_active,active);
  assert.deepEqual(state.pairs.map(p=>({id:p.id,role_id:p.role_id,permission_id:p.permission_id})),reservation.pairs);
}
export function assertActor(state,reservation,prepared,inactive=false) {
  const mode=modeFor(reservation.mode),scope=assignmentScope(mode,reservation.owner);
  assert.equal(state.auth?.id,reservation.authId);assert.equal(state.auth.email,mode.email);assert.equal(state.auth.marker,mode.marker);
  assert.equal(state.auth.confirmed,true);assert.equal(state.auth.role,'authenticated');
  if(inactive)assert.equal(state.auth.banned,true);
  assert.equal(state.profiles.length,1);const p=state.profiles[0];
  assert.equal(p.id,id(prepared.profileId));assert.equal(p.auth_user_id,reservation.authId);assert.equal(p.notes,mode.marker);
  assert.equal(p.full_name,mode.fullName);assert.equal(p.display_name,mode.fullName);assert.equal(p.owner_company_id,reservation.owner.companyId);
  assert.equal(p.branch_id,scope.branchId);assert.equal(p.must_change_password,false);assert.equal(p.status,inactive?'inactive':'active');
  assert.equal(state.assignments.length,1);const a=state.assignments[0];
  assert.equal(a.id,id(prepared.assignmentId));assert.equal(a.user_profile_id,p.id);assert.equal(a.role_id,reservation.roleId);
  assert.equal(a.owner_company_id,scope.companyId);assert.equal(a.branch_id,scope.branchId);assert.equal(a.is_active,!inactive);
  if(inactive){assert.deepEqual(state.sessions,[]);assert.deepEqual(state.refreshIds,[]);}
}
export function actorPrepareSql(reservation,profileId) {
  const mode=modeFor(reservation.mode),scope=assignmentScope(mode,reservation.owner);id(profileId);uuid(reservation.authId);id(reservation.roleId);
  return `do $guard$ begin if (select count(*) from public.user_profiles where id=${profileId} and auth_user_id=${quote(reservation.authId)}::uuid and full_name=${quote(mode.fullName)})<>1
    or exists(select 1 from public.user_roles where user_profile_id=${profileId} or role_id=${reservation.roleId})
    then raise exception 'OWNERSHIP_CHANGED';end if;end $guard$;
    update public.user_profiles set full_name=${quote(mode.fullName)},display_name=${quote(mode.fullName)},notes=${quote(mode.marker)},status='active',must_change_password=false,
      owner_company_id=${id(reservation.owner.companyId)},branch_id=${literalId(scope.branchId)} where id=${profileId} and auth_user_id=${quote(reservation.authId)}::uuid;
    with a as (insert into public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
      values(${profileId},${reservation.roleId},${literalId(scope.companyId)},${literalId(scope.branchId)},true) returning id)
    select json_build_object('profileId',${profileId},'assignmentId',(select id from a));`;
}
export function actorRetireSql(reservation,prepared,state) {
  assertActor(state,reservation,prepared);assert.equal(state.auth.banned,true);
  const mode=modeFor(reservation.mode),scope=assignmentScope(mode,reservation.owner);
  const sid=state.sessions.map(s=>{assert.equal(s.userId,reservation.authId);assert.match(s.id,/^[0-9a-f-]{36}$/i);return quote(s.id);});
  const rid=state.refreshIds.map(value=>{assert.match(value,/^[0-9]+$/);return quote(value);});
  return `do $guard$ begin if (select count(*) from public.user_profiles where id=${prepared.profileId} and auth_user_id=${quote(reservation.authId)}::uuid and notes=${quote(mode.marker)} and full_name=${quote(mode.fullName)})<>1
    or (select count(*) from public.user_roles where id=${prepared.assignmentId} and user_profile_id=${prepared.profileId} and role_id=${reservation.roleId}
      and owner_company_id is not distinct from ${literalId(scope.companyId)} and branch_id is not distinct from ${literalId(scope.branchId)})<>1
    then raise exception 'OWNERSHIP_CHANGED';end if;end $guard$;
    update public.user_roles set is_active=false where id=${prepared.assignmentId} and user_profile_id=${prepared.profileId} and role_id=${reservation.roleId};
    update public.user_profiles set status='inactive' where id=${prepared.profileId} and auth_user_id=${quote(reservation.authId)}::uuid and notes=${quote(mode.marker)};
    with rt as (delete from auth.refresh_tokens where user_id=${quote(reservation.authId)} and id in (${rid.join(',')||'null'}) returning id),
    ss as (delete from auth.sessions where user_id=${quote(reservation.authId)}::uuid and id in (${sid.join(',')||'null'}) and (select count(*) from rt)>=0 returning id)
    select json_build_object('removedRefreshIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from rt),
      'removedSessionIds',(select coalesce(jsonb_agg(id::text order by id),'[]') from ss));`;
}
export function roleRetireSql(reservation,prepared) {
  const mode=modeFor(reservation.mode);id(reservation.roleId);id(prepared.profileId);id(prepared.assignmentId);uuid(reservation.authId);
  return `do $guard$ begin if (select count(*) from public.roles where id=${reservation.roleId} and role_code=${quote(mode.roleCode)} and notes=${quote(mode.marker)} and not is_system_role and is_active)<>1
    or (select count(*) from public.user_roles where role_id=${reservation.roleId})<>1
    or not exists(select 1 from public.user_roles a join public.user_profiles p on p.id=a.user_profile_id join auth.users u on u.id=p.auth_user_id
      where a.id=${prepared.assignmentId} and a.role_id=${reservation.roleId} and not a.is_active and p.id=${prepared.profileId} and p.status='inactive'
      and p.auth_user_id=${quote(reservation.authId)}::uuid and u.banned_until>now())
    or exists(select 1 from auth.sessions where user_id=${quote(reservation.authId)}::uuid)
    or exists(select 1 from auth.refresh_tokens where user_id=${quote(reservation.authId)})
    then raise exception 'ACTOR_NOT_RETIRED';end if;end $guard$;
    update public.roles set is_active=false where id=${reservation.roleId} and role_code=${quote(mode.roleCode)} and notes=${quote(mode.marker)} returning id;`;
}
