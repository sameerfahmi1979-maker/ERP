\set ON_ERROR_STOP on
do $$
begin
  if current_database() <> 'agent_center_heartbeat_native'
    or inet_server_addr() is distinct from '127.0.0.1'::inet
    or to_regprocedure('public.dms_agent_center_read(bigint,bigint,text,text,uuid,integer)') is null then
    raise exception 'An isolated Agent Center projection fixture is required';
  end if;
end $$;

begin;
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'erp_agent_discovery_runtime') then
    create role erp_agent_discovery_runtime nologin noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'agent_heartbeat_fixture_a') then
    create role agent_heartbeat_fixture_a login nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'agent_heartbeat_fixture_b') then
    create role agent_heartbeat_fixture_b login nobypassrls;
  end if;
end $roles$;
grant erp_agent_discovery_runtime to agent_heartbeat_fixture_a, agent_heartbeat_fixture_b;
grant usage on schema erp_private to erp_agent_discovery_runtime;

create table erp_private.agent_connections (id uuid primary key, runtime_login name not null);
create table public.user_profiles (id bigint primary key, status text not null, owner_company_id bigint);
alter table erp_private.agent_pdf_policy add column actor_id bigint references public.user_profiles;

insert into public.user_profiles values (101, 'active', 1), (102, 'active', 2);
insert into erp_private.agent_connections values
  ('10000000-0000-0000-0000-000000000001', 'agent_heartbeat_fixture_a'),
  ('10000000-0000-0000-0000-000000000002', 'agent_heartbeat_fixture_b'),
  ('10000000-0000-0000-0000-000000000003', 'agent_heartbeat_fixture_b');
update erp_private.agent_pdf_policy set actor_id = 101 where company_id = 1;
insert into erp_private.agent_pdf_policy values ('10000000-0000-0000-0000-000000000002', 2, true, 102);
insert into erp_private.agent_pdf_policy values ('10000000-0000-0000-0000-000000000003', 1, true, 101);
insert into erp_private.agent_sync_checkpoints values ('10000000-0000-0000-0000-000000000002', now(), false, 0);

insert into erp_private.dms_agent_center_controls(company_id, branch_id, agent_key, worker_bound)
values (1, null, 'dms.intake', true), (2, null, 'dms.intake', false);
commit;
