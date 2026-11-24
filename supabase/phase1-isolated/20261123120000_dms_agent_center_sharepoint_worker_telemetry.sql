begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Isolated follow-up to the scoped probe. Existing enrollments are retained.
-- Only a normal discovery cycle can populate the projected worker heartbeat.
alter table erp_private.agent_center_sharepoint_worker_heartbeats
  add column worker_seen_at timestamptz,
  add column worker_cycle_id uuid,
  add column worker_cycle_start_revision bigint,
  add column worker_progress_checkpoint_revision bigint,
  add column worker_progress_control_revision bigint;

create function erp_private.record_agent_center_sharepoint_worker_cycle(
  p_connection uuid, p_company bigint, p_cycle uuid, p_revision bigint, p_caught_up boolean
) returns timestamptz language plpgsql volatile security definer set search_path = ''
as $function$
declare
  checkpoint_revision bigint;
  control_revision bigint;
  cycle_id uuid;
  cycle_start_revision bigint;
  recorded_at timestamptz;
begin
  if p_cycle is null or p_caught_up is null
     or inet_client_addr() is distinct from '127.0.0.1'::inet
     or inet_server_addr() is distinct from '127.0.0.1'::inet then
    return null;
  end if;

  select s.revision, lane.revision, h.worker_cycle_id, h.worker_cycle_start_revision
  into checkpoint_revision, control_revision, cycle_id, cycle_start_revision
  from erp_private.agent_center_sharepoint_worker_heartbeats h
  join erp_private.agent_connections c on c.id = h.connection_id and c.runtime_login = h.runtime_login
  join erp_private.agent_pdf_policy p on p.connection_id = h.connection_id
    and p.company_id = h.company_id and p.actor_id = h.actor_id
  join erp_private.agent_sync_checkpoints s on s.connection_id = h.connection_id
  join erp_private.dms_agent_center_controls lane on lane.company_id = p.company_id
  join public.owner_companies o on o.id = p.company_id
  join public.user_profiles u on u.id = p.actor_id
  where h.connection_id = p_connection and h.company_id = p_company and h.runtime_login = session_user
    and o.status = 'active' and u.status = 'active'
    and lane.branch_id is null and lane.agent_key = 'dms.intake' and lane.worker_bound
  for share of c, p, s, lane, o, u for update of h;
  if not found then return null; end if;

  if p_revision is null then
    if p_caught_up then return null; end if;
    update erp_private.agent_center_sharepoint_worker_heartbeats
    set worker_cycle_id = p_cycle, worker_cycle_start_revision = checkpoint_revision,
        worker_progress_checkpoint_revision = null, worker_progress_control_revision = null
    where connection_id = p_connection;
    return null;
  end if;

  if cycle_id is distinct from p_cycle or checkpoint_revision is distinct from p_revision
     or cycle_start_revision is null or p_revision <= cycle_start_revision then
    return null;
  end if;

  update erp_private.agent_center_sharepoint_worker_heartbeats h
  set worker_seen_at = greatest(h.worker_seen_at, clock_timestamp()),
      worker_cycle_id = null, worker_cycle_start_revision = null,
      worker_progress_checkpoint_revision = case when p_caught_up then checkpoint_revision end,
      worker_progress_control_revision = case when p_caught_up then control_revision end
  where h.connection_id = p_connection
  returning h.worker_seen_at into recorded_at;
  return recorded_at;
end $function$;

revoke all on function erp_private.record_agent_center_sharepoint_worker_cycle(uuid,bigint,uuid,bigint,boolean)
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;
grant execute on function erp_private.record_agent_center_sharepoint_worker_cycle(uuid,bigint,uuid,bigint,boolean)
  to erp_agent_discovery_runtime;

-- Called only inside the existing exact-company reviewer/admin projection.
create function erp_private.dms_agent_center_sharepoint_worker_telemetry(p_company bigint, p_checked_at timestamptz)
returns table (heartbeat_at timestamptz, progress jsonb)
language sql stable security invoker set search_path = ''
as $function$
  select h.worker_seen_at,
    case when queue.total_units > 0 then jsonb_build_object(
      'completedUnits', queue.completed_units, 'totalUnits', queue.total_units
    ) end
  from erp_private.agent_center_sharepoint_worker_heartbeats h
  join erp_private.agent_connections c on c.id = h.connection_id and c.runtime_login = h.runtime_login
  join erp_private.agent_pdf_policy p on p.connection_id = h.connection_id
    and p.company_id = h.company_id and p.actor_id = h.actor_id
  join erp_private.agent_sync_checkpoints s on s.connection_id = h.connection_id
  join erp_private.dms_agent_center_controls lane on lane.company_id = p.company_id
    and lane.branch_id is null and lane.agent_key = 'dms.intake' and lane.worker_bound
  join public.user_profiles u on u.id = h.actor_id and u.status = 'active'
  left join lateral (
    -- One row for each current, available, supported PDF in this policy's
    -- discovered intake cohort. Only a matching ledger disposition counts.
    select count(*) filter (where w.status in ('duplicate', 'review_pending', 'reviewed')) as completed_units,
      count(*) as total_units
    from erp_private.agent_source_versions v
    join erp_private.agent_source_items i using (connection_id, item_id, version)
    left join erp_private.agent_pdf_work w on (w.connection_id, w.item_id, w.version) = (v.connection_id, v.item_id, v.version)
      and w.company_id = h.company_id and w.actor_id = h.actor_id
    where h.worker_cycle_id is null
      and h.worker_progress_checkpoint_revision = s.revision
      and h.worker_progress_control_revision = lane.revision
      and h.worker_seen_at > p_checked_at - interval '20 minutes'
      and p.enabled and not s.paused and lane.enabled and not lane.paused and lane.mode = 'execute'
      and not exists (
        select 1 from erp_private.agent_pdf_work pending
        left join erp_private.f07_single_upload_admissions admission
          on admission.actor_id = pending.actor_id and admission.operation_id = pending.operation_id
        left join public.dms_upload_sessions intake on intake.id = admission.upload_session_id
          and intake.uploaded_by = pending.actor_id and intake.owning_company_id = pending.company_id
          and intake.owning_branch_id is null and intake.sha256_hash = pending.sha256 and intake.deleted_at is null
        where pending.connection_id = h.connection_id and pending.company_id = h.company_id
          and pending.actor_id = h.actor_id and pending.status = 'retry'
          and (pending.lease_until > p_checked_at or intake.intake_status in ('ocr_processing', 'ai_processing'))
      )
      and v.connection_id = h.connection_id and v.discovered_at >= p.from_time
      and v.mime = 'application/pdf' and v.size_bytes between 1 and 3145728 and i.available
  ) queue on true
  where h.company_id = p_company and h.worker_seen_at is not null;
$function$;

revoke all on function erp_private.dms_agent_center_sharepoint_worker_telemetry(bigint,timestamptz)
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;

do $projection$
declare
  target constant regprocedure := 'erp_private.dms_agent_center_read(bigint,bigint,text,text,uuid,integer)';
  definition text;
  checksum text;
  declaration constant text := E'  worker_heartbeat_at timestamptz;\n';
  probe constant text := $probe$
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
$probe$;
  unmeasured constant text := E'    -- Pilot checkpoints and lease counts do not establish a measured total.\n    ''intakeProgress'', null::jsonb,\n';
begin
  select replace(pg_get_functiondef(oid), E'\r\n', E'\n'), md5(replace(prosrc, E'\r\n', E'\n'))
  into strict definition, checksum from pg_proc where oid = target;
  if checksum <> '205e33f1ac7bcfa7a16e8b7ad56b880f'
    or array_length(string_to_array(definition, declaration), 1) <> 2
    or array_length(string_to_array(definition, probe), 1) <> 2
    or array_length(string_to_array(definition, unmeasured), 1) <> 2 then
    raise exception 'Unexpected Agent Center worker telemetry projection version';
  end if;

  definition := replace(definition, declaration, declaration || E'  worker_progress jsonb;\n');
  definition := replace(definition, probe, $telemetry$
    select heartbeat_at, progress into worker_heartbeat_at, worker_progress
    from erp_private.dms_agent_center_sharepoint_worker_telemetry(selected_company, checked_at);
$telemetry$);
  execute replace(definition, unmeasured, E'    ''intakeProgress'', worker_progress,\n');
end $projection$;

commit;
