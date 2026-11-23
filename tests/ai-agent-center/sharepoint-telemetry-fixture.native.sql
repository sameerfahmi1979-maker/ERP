-- Extends the existing projection and scoped probe fixtures. Use only the
-- disposable agent_center_heartbeat_native PostgreSQL database.
do $fixture$
begin
  if current_database() <> 'agent_center_heartbeat_native'
    or inet_server_addr() is distinct from '127.0.0.1'::inet then
    raise exception 'An isolated Agent Center telemetry fixture is required';
  end if;
end $fixture$;

alter table erp_private.agent_connections
  add tenant_id uuid not null default '20000000-0000-0000-0000-000000000001',
  add client_id uuid not null default '20000000-0000-0000-0000-000000000002',
  add drive_id text not null default 'FixtureDrive',
  add source_folder_id text not null default 'FixtureSource',
  add index_folder_id text not null default 'FixtureIndex';
alter table erp_private.agent_sync_checkpoints add cursor text;
alter table erp_private.agent_pdf_policy add from_time timestamptz not null default '2000-01-01 UTC';
alter table erp_private.agent_source_versions alter column discovered_at set default now();
alter table erp_private.agent_source_versions add mime text not null default 'application/pdf',
  add size_bytes bigint not null default 1024;
create table erp_private.agent_source_items (
  connection_id uuid not null, item_id text not null, version text not null, filename text not null,
  ancestor_ids text[] not null, available boolean not null default true, primary key (connection_id,item_id)
);
grant select on erp_private.agent_connections, erp_private.agent_sync_checkpoints,
  erp_private.agent_source_items, erp_private.agent_source_versions to erp_agent_discovery_runtime;
grant update(cursor,revision,updated_at) on erp_private.agent_sync_checkpoints to erp_agent_discovery_runtime;
grant update(version,filename,ancestor_ids,available) on erp_private.agent_source_items to erp_agent_discovery_runtime;
grant insert on erp_private.agent_source_versions, erp_private.agent_source_items to erp_agent_discovery_runtime;

insert into erp_private.agent_source_versions(connection_id,item_id,version,discovered_at,mime,size_bytes)
values ('10000000-0000-0000-0000-000000000001','a','v1',now(),'application/pdf',1024),
       ('10000000-0000-0000-0000-000000000001','b','v1',now(),'application/pdf',1024),
       ('10000000-0000-0000-0000-000000000001','c','v1',now(),'application/pdf',1024),
       ('10000000-0000-0000-0000-000000000001','d','v1',now(),'application/pdf',1024),
       ('10000000-0000-0000-0000-000000000001','e','v1',now(),'application/pdf',1024),
       ('10000000-0000-0000-0000-000000000001','f','v1',now(),'application/pdf',1024),
       ('10000000-0000-0000-0000-000000000001','g','v1',now(),'image/png',1024),
       ('10000000-0000-0000-0000-000000000001','h','v1',now(),'application/pdf',3145729),
       ('10000000-0000-0000-0000-000000000001','i','v1','1999-01-01 UTC','application/pdf',1024),
       ('10000000-0000-0000-0000-000000000003','a','v1',now(),'application/pdf',1024);
insert into erp_private.agent_source_items(connection_id,item_id,version,filename,ancestor_ids,available)
select connection_id,item_id,version,item_id || '.pdf',array['FixtureSource'],item_id <> 'f'
from erp_private.agent_source_versions where item_id between 'a' and 'i';
insert into erp_private.agent_pdf_work(connection_id,item_id,version,operation_id,company_id,actor_id,status)
values ('10000000-0000-0000-0000-000000000001','a','v1',gen_random_uuid(),1,101,'duplicate'),
       ('10000000-0000-0000-0000-000000000001','b','v1',gen_random_uuid(),1,101,'review_pending'),
       ('10000000-0000-0000-0000-000000000001','d','v1',gen_random_uuid(),1,101,'held'),
       ('10000000-0000-0000-0000-000000000001','e','v1',gen_random_uuid(),1,102,'reviewed'),
       ('10000000-0000-0000-0000-000000000001','f','v1',gen_random_uuid(),1,101,'reviewed'),
       ('10000000-0000-0000-0000-000000000003','a','v1',gen_random_uuid(),1,101,'reviewed');
update erp_private.dms_agent_center_controls set enabled = true, mode = 'execute' where company_id = 1;

-- Track dispatch, with synthetic state for the existing link policy boundary.
create table erp_private.agent_center_fixture_hr_link_calls (connection_id uuid);
create function erp_private.claim_agent_pdf(p_connection uuid) returns jsonb
language sql as 'select null::jsonb';
create function erp_private.link_agent_approved_employee_document(p_connection uuid) returns text
language plpgsql security definer set search_path = '' as $fixture$
begin
  insert into erp_private.agent_center_fixture_hr_link_calls values (p_connection);
  if not exists (
    select 1 from erp_private.agent_connections c
    join erp_private.agent_pdf_policy p on p.connection_id = c.id
    where c.id = p_connection and c.runtime_login = session_user
      and p.company_id = 1 and p.enabled
  ) then return 'disabled'; end if;
  return 'no_eligible_approval';
end $fixture$;
revoke all on function erp_private.claim_agent_pdf(uuid),
  erp_private.link_agent_approved_employee_document(uuid) from public;
grant execute on function erp_private.claim_agent_pdf(uuid),
  erp_private.link_agent_approved_employee_document(uuid) to erp_agent_discovery_runtime;