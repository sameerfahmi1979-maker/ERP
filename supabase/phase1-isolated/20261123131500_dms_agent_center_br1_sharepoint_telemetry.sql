begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- The install creates no enrollments. The protected pilot manifest is the
-- authority for the one exact branch, source, runtime and officer.
create view erp_private.dms_agent_center_br1_telemetry_enrollment with (security_invoker=true) as
  select approved.*, connection.runtime_login, policy.enabled as intake_enabled, policy.from_time,
    checkpoint.updated_at as checkpoint_updated_at, checkpoint.revision as checkpoint_revision,
    checkpoint.paused as checkpoint_paused, lane.enabled as lane_enabled,
    lane.paused as lane_paused, lane.mode as lane_mode, lane.revision as lane_revision,
    jsonb_build_array(approved.company_id, approved.branch_id, approved.actor_id, approved.officer_id,
      approved.item_id, approved.source_version, approved.sha256, extract(epoch from approved.expires_at),
      connection.runtime_login) as scope_key
  from erp_private.dms_sharepoint_br1_review_scope approved
  join erp_private.agent_connections connection on connection.id = approved.connection_id
  join erp_private.agent_pdf_policy policy on policy.connection_id = approved.connection_id
    and policy.company_id = approved.company_id and policy.actor_id = approved.actor_id
    and policy.officer_id = approved.officer_id
  join erp_private.agent_sync_checkpoints checkpoint on checkpoint.connection_id = approved.connection_id
  join erp_private.dms_agent_center_controls lane on lane.company_id = approved.company_id
    and lane.branch_id = approved.branch_id and lane.agent_key = 'dms.intake' and lane.worker_bound
  join public.owner_companies company on company.id = approved.company_id
    and company.company_code = 'ALGT' and company.status = 'active'
  join public.branches branch on branch.id = approved.branch_id and branch.owner_company_id = approved.company_id
    and branch.branch_code = 'BR1' and branch.status = 'active'
  join public.user_profiles actor on actor.id = approved.actor_id and actor.status = 'active'
  join public.user_profiles officer on officer.id = approved.officer_id and officer.status = 'active';

create table erp_private.dms_agent_center_br1_worker_cycles (
  connection_id uuid primary key references erp_private.agent_connections(id),
  scope_key jsonb not null,
  cycle_id uuid,
  cycle_start_revision bigint,
  heartbeat_at timestamptz,
  progress_checkpoint_revision bigint,
  progress_control_revision bigint
);
alter table erp_private.dms_agent_center_br1_worker_cycles enable row level security;
revoke all on erp_private.dms_agent_center_br1_telemetry_enrollment, erp_private.dms_agent_center_br1_worker_cycles
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;

create function erp_private.record_agent_center_br1_worker_cycle(
  p_connection uuid, p_company bigint, p_cycle uuid, p_revision bigint, p_caught_up boolean
) returns timestamptz language plpgsql volatile security invoker set search_path = ''
as $function$
declare
  enrollment erp_private.dms_agent_center_br1_telemetry_enrollment%rowtype;
  recorded_at timestamptz;
begin
  if p_cycle is null or p_caught_up is null then return null; end if;

  select scope.* into enrollment from erp_private.dms_agent_center_br1_telemetry_enrollment scope
  where scope.connection_id = p_connection and scope.company_id = p_company
    and scope.runtime_login = session_user
  for share;
  if not found or enrollment.expires_at <= clock_timestamp() then return null; end if;

  if p_revision is null then
    if p_caught_up then return null; end if;
    insert into erp_private.dms_agent_center_br1_worker_cycles as previous (
      connection_id, scope_key, cycle_id, cycle_start_revision
    ) values (p_connection, enrollment.scope_key, p_cycle, enrollment.checkpoint_revision)
    on conflict (connection_id) do update
      set scope_key = excluded.scope_key, cycle_id = excluded.cycle_id,
        cycle_start_revision = excluded.cycle_start_revision, progress_checkpoint_revision = null,
        progress_control_revision = null,
        heartbeat_at = case when previous.scope_key = excluded.scope_key then previous.heartbeat_at end;
    return null;
  end if;

  if p_revision is distinct from enrollment.checkpoint_revision then return null; end if;
  update erp_private.dms_agent_center_br1_worker_cycles cycle
  set heartbeat_at = greatest(cycle.heartbeat_at, clock_timestamp()),
    cycle_id = null, cycle_start_revision = null,
    progress_checkpoint_revision = case when p_caught_up then enrollment.checkpoint_revision end,
    progress_control_revision = case when p_caught_up then enrollment.lane_revision end
  where cycle.connection_id = p_connection and cycle.scope_key = enrollment.scope_key
    and cycle.cycle_id = p_cycle and p_revision > cycle.cycle_start_revision
    and enrollment.expires_at > clock_timestamp()
  returning cycle.heartbeat_at into recorded_at;
  return recorded_at;
end $function$;

-- Leave the existing company projection and writer behavior intact for all
-- companies and connections without an enrolled BR1 pilot.
create function erp_private.dms_agent_center_br1_worker_telemetry(
  p_company bigint, p_branch bigint, p_checked_at timestamptz
) returns table (checkpoint jsonb, heartbeat_at timestamptz, progress jsonb)
language sql stable security invoker set search_path = ''
as $function$
  select case when scope.checkpoint_revision > 0 then jsonb_build_object(
      'lastCheckedAt', scope.checkpoint_updated_at,
      'policyEnabled', scope.intake_enabled and scope.lane_enabled and scope.lane_mode = 'execute',
      'paused', scope.checkpoint_paused or scope.lane_paused
    ) end,
    cycle.heartbeat_at,
    case when version.connection_id is not null and item.available
      and scope.intake_enabled and scope.lane_enabled and scope.lane_mode = 'execute'
      and not scope.checkpoint_paused and not scope.lane_paused
      and cycle.cycle_id is null and cycle.heartbeat_at > p_checked_at - interval '20 minutes'
      and cycle.progress_checkpoint_revision = scope.checkpoint_revision
      and cycle.progress_control_revision = scope.lane_revision
      and not coalesce(work.lease_until > p_checked_at, false)
      and not coalesce(intake.intake_status in ('ocr_processing', 'ai_processing'), false)
      and (admission.upload_session_id is null or (intake.id is not null
        and erp_private.upload_session_allowed(intake.id)
        and erp_private.f07_upload_subject_allowed(intake.id)))
      then jsonb_build_object('completedUnits', case when work.status in ('review_pending', 'reviewed')
        and work.sha256 = scope.sha256 and commit_state.notification_event_id is not null and job.id is not null
        and result.id is not null and review.id is not null then 1 else 0 end, 'totalUnits', 1)
    end
  from (
    select enrollment.*, count(*) over () as active_scope_count
    from erp_private.dms_agent_center_br1_telemetry_enrollment enrollment
    where enrollment.company_id = p_company and enrollment.branch_id = p_branch and enrollment.expires_at > p_checked_at
  ) scope
  left join erp_private.dms_agent_center_br1_worker_cycles cycle
    on cycle.connection_id = scope.connection_id and cycle.scope_key = scope.scope_key
  left join erp_private.agent_source_versions version on version.connection_id = scope.connection_id
    and version.item_id = scope.item_id and version.version = scope.source_version
    and version.discovered_at >= scope.from_time and version.mime = 'application/pdf'
    and version.size_bytes between 1 and 3145728
  left join erp_private.agent_source_items item on (item.connection_id, item.item_id, item.version)
    = (version.connection_id, version.item_id, version.version)
  left join erp_private.agent_pdf_work work on (work.connection_id, work.item_id, work.version)
    = (scope.connection_id, scope.item_id, scope.source_version)
    and work.actor_id = scope.actor_id and work.company_id = scope.company_id
  left join erp_private.f07_single_upload_admissions admission
    on admission.actor_id = work.actor_id and admission.operation_id = work.operation_id
  left join public.dms_upload_sessions intake on intake.id = admission.upload_session_id
    and (intake.uploaded_by, intake.owning_company_id, intake.owning_branch_id, intake.sha256_hash)
      = (scope.actor_id, scope.company_id, scope.branch_id, scope.sha256)
    and intake.deleted_at is null
  left join erp_private.dms_sharepoint_br1_review_state commit_state on commit_state.operation_id = work.operation_id
    and commit_state.officer_id = scope.officer_id and commit_state.upload_session_id = intake.id
    and work.session_id = intake.id and work.review_id = commit_state.review_id
  left join public.dms_ai_extraction_results result on (result.id, result.upload_session_id, result.job_id)
    = (commit_state.result_id, intake.id, intake.ai_job_id) and intake.ai_result_id = result.id
  left join public.dms_ai_extraction_jobs job on job.id = result.job_id and job.upload_session_id = intake.id
    and job.status in ('complete', 'completed')
  left join public.dms_review_queue review on (review.id, review.upload_session_id, review.ai_result_id, review.assigned_to)
    = (commit_state.review_id, intake.id, result.id, scope.officer_id) and review.deleted_at is null
  where scope.active_scope_count = 1;
$function$;

revoke all on function erp_private.record_agent_center_br1_worker_cycle(uuid,bigint,uuid,bigint,boolean),
  erp_private.dms_agent_center_br1_worker_telemetry(bigint,bigint,timestamptz)
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;

-- The exact existing APIs keep their signatures, permissions and unrelated lanes.
do $patch$
declare
  target record;
  definition text;
  checksum text;
begin
  for target in select * from (values
    ('erp_private.record_agent_center_sharepoint_worker_cycle(uuid,bigint,uuid,bigint,boolean)'::regprocedure,
      '0a528456a17a20fc42c1b882edec7a7c',
      E'begin\n  if p_cycle is null',
      $write$begin
  if exists (select 1 from erp_private.dms_sharepoint_br1_review_scope scope where scope.connection_id = p_connection) then
    return erp_private.record_agent_center_br1_worker_cycle(p_connection, p_company, p_cycle, p_revision, p_caught_up);
  end if;
  if p_cycle is null$write$),
    ('erp_private.dms_agent_center_read(bigint,bigint,text,text,uuid,integer)'::regprocedure,
      '172fffb2c45569529b54cf643ae053fc',
      E'  with authorized as materialized (',
      $read$  if p_branch is not null and
    (erp_private.permission_in_scope('dms.documents.review_ai', selected_company, p_branch)
      or erp_private.permission_in_scope('dms.admin', selected_company, p_branch)) then
    select state.checkpoint, state.heartbeat_at, state.progress into checkpoint, worker_heartbeat_at, worker_progress
    from erp_private.dms_agent_center_br1_worker_telemetry(selected_company, p_branch, checked_at) state;
  end if;

  with authorized as materialized ($read$)
  ) as patches(signature, checksum, anchor, replacement)
  loop
    select replace(pg_get_functiondef(oid), E'\r\n', E'\n'), md5(replace(prosrc, E'\r\n', E'\n'))
      into strict definition, checksum from pg_proc where oid = target.signature;
    if checksum <> target.checksum or array_length(string_to_array(definition, target.anchor), 1) <> 2 then
      raise exception 'Unexpected Agent Center branch telemetry target version: %', target.signature;
    end if;
    execute replace(definition, target.anchor, target.replacement);
  end loop;
end $patch$;

commit;
