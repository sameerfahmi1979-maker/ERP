begin;

create schema if not exists erp_private;
create role erp_agent_discovery_runtime nologin noinherit nobypassrls;
grant usage on schema erp_private to erp_agent_discovery_runtime;

create table erp_private.agent_connections (
  id uuid primary key,
  runtime_login name not null,
  tenant_id uuid not null,
  client_id uuid not null,
  drive_id text not null,
  source_folder_id text not null,
  index_folder_id text not null,
  unique (tenant_id, client_id, drive_id, source_folder_id),
  check (source_folder_id <> index_folder_id)
);

create table erp_private.agent_sync_checkpoints (
  connection_id uuid primary key references erp_private.agent_connections(id),
  cursor text check (length(cursor) between 1 and 32768),
  revision bigint not null default 0 check (revision >= 0),
  paused boolean not null default true,
  updated_at timestamptz not null default now()
);

create table erp_private.agent_source_versions (
  connection_id uuid not null references erp_private.agent_connections(id),
  item_id text not null check (length(item_id) <= 256 and item_id ~ '^[A-Za-z0-9_!-]+$'),
  version text not null check (length(version) between 3 and 512),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint not null check (size_bytes >= 0),
  discovered_at timestamptz not null default now(),
  primary key (connection_id, item_id, version)
);

create table erp_private.agent_source_items (
  connection_id uuid not null,
  item_id text not null,
  version text not null,
  filename text not null check (length(filename) between 1 and 512),
  ancestor_ids text[] not null check (cardinality(ancestor_ids) between 1 and 32),
  available boolean not null default true,
  primary key (connection_id, item_id),
  foreign key (connection_id, item_id, version)
    references erp_private.agent_source_versions(connection_id, item_id, version)
);

create index agent_source_items_active_ancestry
  on erp_private.agent_source_items using gin (ancestor_ids) where available;

alter table erp_private.agent_connections enable row level security;
alter table erp_private.agent_sync_checkpoints enable row level security;
alter table erp_private.agent_source_versions enable row level security;
alter table erp_private.agent_source_items enable row level security;

revoke all on erp_private.agent_connections, erp_private.agent_sync_checkpoints,
  erp_private.agent_source_versions, erp_private.agent_source_items from public, anon, authenticated, service_role;

create policy agent_connection_scope on erp_private.agent_connections
  for select to erp_agent_discovery_runtime using (runtime_login = session_user);

create policy agent_checkpoint_scope on erp_private.agent_sync_checkpoints
  for all to erp_agent_discovery_runtime
  using (connection_id in (select id from erp_private.agent_connections));

create policy agent_source_version_scope on erp_private.agent_source_versions
  for all to erp_agent_discovery_runtime
  using (connection_id in (select id from erp_private.agent_connections));

create policy agent_source_item_scope on erp_private.agent_source_items
  for all to erp_agent_discovery_runtime
  using (connection_id in (select id from erp_private.agent_connections));

grant select on erp_private.agent_connections, erp_private.agent_sync_checkpoints,
  erp_private.agent_source_versions, erp_private.agent_source_items to erp_agent_discovery_runtime;
grant update (cursor, revision, updated_at) on erp_private.agent_sync_checkpoints to erp_agent_discovery_runtime;
grant insert on erp_private.agent_source_versions, erp_private.agent_source_items to erp_agent_discovery_runtime;
grant update (version, filename, ancestor_ids, available) on erp_private.agent_source_items to erp_agent_discovery_runtime;

create function erp_private.commit_agent_sharepoint_page(
  p_connection uuid, p_expected_revision bigint, p_cursor text, p_changes jsonb
) returns text
language plpgsql security invoker
set search_path = ''
as $function$
declare
  checkpoint erp_private.agent_sync_checkpoints%rowtype;
  connection erp_private.agent_connections%rowtype;
begin
  select * into checkpoint from erp_private.agent_sync_checkpoints
    where connection_id = p_connection for update;
  if not found then
    raise exception 'Discovery checkpoint unavailable' using errcode = '42501';
  end if;
  if checkpoint.paused then return 'paused'; end if;
  if checkpoint.revision is distinct from p_expected_revision then return 'stale'; end if;
  select * into strict connection from erp_private.agent_connections where id = p_connection;

  if p_cursor is null or length(p_cursor) not between 1 and 32768
      or jsonb_typeof(p_changes) is distinct from 'array' then
    raise exception 'Invalid discovery page' using errcode = '22023';
  end if;
  if jsonb_array_length(p_changes) > 512 or exists (
    select 1 from jsonb_to_recordset(p_changes) as row(id text, kind text, ancestors text[])
    where id is null or length(id) > 256 or id !~ '^[A-Za-z0-9_!-]+$'
      or id in (connection.source_folder_id, connection.index_folder_id)
      or kind is null or kind not in ('file', 'unavailable')
      or (kind = 'file' and (
        ancestors is null or cardinality(ancestors) not between 1 and 32
        or ancestors[cardinality(ancestors)] is distinct from connection.source_folder_id
        or connection.index_folder_id = any (ancestors) or id = any (ancestors)
        or array_position(ancestors, null) is not null
      ))
  ) then
    raise exception 'Invalid discovery change' using errcode = '22023';
  end if;

  with removed as (
    select array_agg(change->>'id') as ids
    from jsonb_array_elements(p_changes) change where change->>'kind' = 'unavailable'
  )
  update erp_private.agent_source_items item set available = false
    from removed
    where item.connection_id = p_connection and item.available
      and (item.item_id = any (removed.ids) or item.ancestor_ids && removed.ids);

  insert into erp_private.agent_source_versions (connection_id, item_id, version, mime, size_bytes)
    select p_connection, id, version, mime, size
    from jsonb_to_recordset(p_changes) as row(id text, kind text, version text, mime text, size bigint)
    where kind = 'file'
    on conflict (connection_id, item_id, version) do nothing;

  insert into erp_private.agent_source_items (connection_id, item_id, version, filename, ancestor_ids)
    select p_connection, id, version, name, ancestors
    from jsonb_to_recordset(p_changes) as row(id text, kind text, version text, name text, ancestors text[])
    where kind = 'file'
    on conflict (connection_id, item_id) do update
      set version = excluded.version, filename = excluded.filename, ancestor_ids = excluded.ancestor_ids, available = true;

  update erp_private.agent_sync_checkpoints set cursor = p_cursor, revision = revision + 1, updated_at = now()
    where connection_id = p_connection;
  return 'committed';
end
$function$;

revoke all on function erp_private.commit_agent_sharepoint_page(uuid, bigint, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function erp_private.commit_agent_sharepoint_page(uuid, bigint, text, jsonb)
  to erp_agent_discovery_runtime;

commit;
