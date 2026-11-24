begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- This isolated candidate seeds no bindings and accepts loopback worker calls only.
create table erp_private.agent_center_sharepoint_worker_heartbeats (
  connection_id uuid primary key references erp_private.agent_connections(id),
  company_id bigint not null unique references public.owner_companies(id),
  actor_id bigint not null references public.user_profiles(id),
  runtime_login name not null,
  last_seen_at timestamptz
);
alter table erp_private.agent_center_sharepoint_worker_heartbeats enable row level security;
revoke all on erp_private.agent_center_sharepoint_worker_heartbeats
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;

create function erp_private.record_agent_center_sharepoint_heartbeat(p_connection uuid, p_company bigint)
returns timestamptz language plpgsql volatile security definer set search_path = ''
as $function$
declare
  bound_connection uuid;
  recorded_at timestamptz;
begin
  if inet_client_addr() is distinct from '127.0.0.1'::inet
     or inet_server_addr() is distinct from '127.0.0.1'::inet then
    return null;
  end if;

  -- An owner enrolls one exact local probe per company. A probe can pulse while
  -- its intake lane is off or paused, since it performs no business work.
  select h.connection_id into bound_connection
  from erp_private.agent_center_sharepoint_worker_heartbeats h
  join erp_private.agent_connections c on c.id = h.connection_id and c.runtime_login = h.runtime_login
  join erp_private.agent_pdf_policy p on p.connection_id = h.connection_id
    and p.company_id = h.company_id and p.actor_id = h.actor_id
  join erp_private.dms_agent_center_controls lane on lane.company_id = p.company_id
  join public.owner_companies o on o.id = p.company_id
  join public.user_profiles u on u.id = p.actor_id
  where h.connection_id = p_connection and h.company_id = p_company and h.runtime_login = session_user
    and o.status = 'active' and u.status = 'active'
    and lane.branch_id is null and lane.agent_key = 'dms.intake' and lane.worker_bound
  for share of c, p, lane, o, u for update of h;
  if not found then return null; end if;

  update erp_private.agent_center_sharepoint_worker_heartbeats h
  set last_seen_at = greatest(h.last_seen_at, clock_timestamp()) where h.connection_id = bound_connection
  returning h.last_seen_at into recorded_at;
  return recorded_at;
end $function$;

revoke all on function erp_private.record_agent_center_sharepoint_heartbeat(uuid,bigint)
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;
grant execute on function erp_private.record_agent_center_sharepoint_heartbeat(uuid,bigint)
  to erp_agent_discovery_runtime;

-- Reuse the reviewed projection and its exact current company authorization.
do $projection$
declare
  target constant regprocedure := 'erp_private.dms_agent_center_read(bigint,bigint,text,text,uuid,integer)';
  definition text;
  checksum text;
  declaration constant text := E'  checkpoint jsonb;\n';
  checkpoint_end constant text := E'    where p.company_id = selected_company and s.revision > 0;\n';
  result_return constant text := E'  return result;\n';
begin
  select replace(pg_get_functiondef(oid), E'\r\n', E'\n'), md5(replace(prosrc, E'\r\n', E'\n'))
  into strict definition, checksum from pg_proc where oid = target;
  if checksum <> '914f1a7bf3fb7dfe2875890ba26f4f41'
    or array_length(string_to_array(definition, declaration), 1) <> 2
    or array_length(string_to_array(definition, checkpoint_end), 1) <> 2
    or array_length(string_to_array(definition, result_return), 1) <> 2 then
    raise exception 'Unexpected Agent Center heartbeat projection version';
  end if;

  definition := replace(definition, declaration, declaration || E'  worker_heartbeat_at timestamptz;\n');
  definition := replace(definition, checkpoint_end, checkpoint_end || $heartbeat$
    select h.last_seen_at into worker_heartbeat_at
    from erp_private.agent_center_sharepoint_worker_heartbeats h
    join erp_private.agent_connections c on c.id = h.connection_id and c.runtime_login = h.runtime_login
    join erp_private.agent_pdf_policy p on p.connection_id = h.connection_id
      and p.company_id = h.company_id and p.actor_id = h.actor_id
    join public.user_profiles u on u.id = h.actor_id and u.status = 'active'
    where h.company_id = selected_company and exists (
      select 1 from erp_private.dms_agent_center_controls lane where lane.company_id = selected_company
        and lane.branch_id is null and lane.agent_key = 'dms.intake' and lane.worker_bound
    );
$heartbeat$);
  -- Preserve the previous strict response contract for scopes without a pulse.
  execute replace(definition, result_return, $result$
  if worker_heartbeat_at is not null then
    return result || jsonb_build_object('workerHeartbeatAt', worker_heartbeat_at);
  end if;
  return result;
$result$);
end $projection$;

commit;
