-- Run only against an empty local database named agent_center_controls_native.
\set ON_ERROR_STOP on
do $fixture$
begin
  if current_database() <> 'agent_center_controls_native'
    or inet_server_addr() is distinct from '127.0.0.1'::inet
    or to_regnamespace('erp_private') is not null then
    raise exception 'An empty, isolated loopback fixture database is required';
  end if;
end $fixture$;

begin;
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'erp_agent_discovery_runtime') then
    create role erp_agent_discovery_runtime nologin noinherit nobypassrls;
  end if;
end $roles$;

create schema auth;
create schema erp_private;
grant usage on schema erp_private to authenticated, service_role, erp_agent_discovery_runtime;

create table public.owner_companies (id bigint primary key, status text not null);
create table public.branches (
  id bigint primary key,
  owner_company_id bigint not null references public.owner_companies,
  status text not null
);
insert into public.owner_companies values (1, 'active'), (2, 'active'), (3, 'inactive');
insert into public.branches values (11, 1, 'active'), (12, 1, 'active'), (13, 1, 'inactive'), (21, 2, 'active');

-- Synthetic identities stand in for F03. Neither fixture stores user data.
create table erp_private.fixture_permissions (
  principal uuid not null,
  company bigint not null,
  branch bigint,
  permission text not null
);
insert into erp_private.fixture_permissions values
  ('00000000-0000-4000-8000-000000000001', 1, 11, 'dms.admin'),
  ('00000000-0000-4000-8000-000000000002', 1, 11, 'dms.documents.view'),
  ('00000000-0000-4000-8000-000000000003', 1, null, 'dms.admin'),
  ('00000000-0000-4000-8000-000000000004', 2, null, 'dms.admin'),
  ('00000000-0000-4000-8000-000000000003', 3, null, 'dms.admin');

create function auth.uid() returns uuid language sql stable set search_path = ''
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create function erp_private.business_principal_is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(current_setting('fixture.session_active', true) = 'yes', false)
    and exists (select 1 from erp_private.fixture_permissions p where p.principal = auth.uid())
$$;

create function erp_private.permission_in_scope(p_code text, p_company bigint, p_branch bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select erp_private.business_principal_is_active() and exists (
    select 1 from erp_private.fixture_permissions p
    where p.principal = auth.uid() and p.company = p_company and p.permission = p_code
      and (p.branch is null or p.branch = p_branch)
  )
$$;
commit;
