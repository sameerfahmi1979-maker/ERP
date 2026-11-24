\set ON_ERROR_STOP on
do $$
begin
  if current_database() <> 'agent_center_controls_native'
    or inet_server_addr() is distinct from '127.0.0.1'::inet
    or to_regclass('erp_private.fixture_permissions') is null then
    raise exception 'An isolated Agent Center fixture database is required';
  end if;
end $$;

begin;
alter table public.user_profiles
  add column auth_user_id uuid,
  add column must_change_password boolean not null default false;
update public.user_profiles set auth_user_id = ('00000000-0000-4000-8000-000000000' || id)::uuid
where id in (101,102,103);

create table auth.users (id uuid primary key, deleted_at timestamptz, banned_until timestamptz);
create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id), not_after timestamptz);
insert into auth.users(id) select auth_user_id from public.user_profiles where auth_user_id is not null;
insert into auth.sessions(id,user_id)
  select ('20000000-0000-4000-8000-000000000' || id)::uuid, auth_user_id
  from public.user_profiles where auth_user_id is not null;
create or replace function auth.jwt() returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object('role',current_setting('request.jwt.claim.role',true),
    'session_id',coalesce(nullif(current_setting('request.jwt.claim.session_id',true),''),
      '20000000-0000-4000-8000-000000000' || right(auth.uid()::text,3)));
$$;

create table public.roles (id bigint primary key, role_code text not null, is_active boolean not null);
create table public.permissions (id bigint primary key, permission_code text not null, is_active boolean not null);
create table public.role_permissions (id bigint primary key, role_id bigint not null, permission_id bigint not null);
create table public.user_roles (id bigint primary key, user_profile_id bigint not null, role_id bigint not null,
  owner_company_id bigint, branch_id bigint, is_active boolean not null);
insert into public.roles values (10,'fixture_sharepoint_operator',true);
insert into public.permissions values
  (20,'dms.documents.upload',true), (21,'dms.documents.preview',true), (22,'dms.documents.review_ai',true);
insert into public.role_permissions values (30,10,20), (31,10,21), (32,10,22);
insert into public.user_roles values (40,101,10,1,null,true), (41,102,10,2,null,true);
commit;
