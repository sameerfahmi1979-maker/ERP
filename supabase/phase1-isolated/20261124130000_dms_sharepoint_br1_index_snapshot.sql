begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Held local contract. There is no seed, runtime grant, public RPC or publisher.
create table erp_private.dms_sharepoint_br1_index_snapshots (
  connection_id uuid primary key references erp_private.agent_connections(id),
  revision bigint not null check (revision between 1 and 9007199254740991),
  committed_at timestamptz not null,
  projection_inputs jsonb not null
);
alter table erp_private.dms_sharepoint_br1_index_snapshots enable row level security;
revoke all on erp_private.dms_sharepoint_br1_index_snapshots
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;

create function erp_private.capture_sharepoint_br1_index_snapshot(
  p_connection uuid, p_company bigint, p_branch bigint
) returns jsonb language plpgsql volatile security invoker set search_path = ''
as $function$
declare
  scope jsonb;
  payload jsonb;
  checked_at timestamptz;
  observed_at timestamptz;
  enrollment_expires_at timestamptz;
  captured erp_private.dms_sharepoint_br1_index_snapshots%rowtype;
begin
  -- Attempt serialization precedes the single MVCC read of enrollment,
  -- discovery and filing. A late capture can't overtake a newer observation.
  perform pg_advisory_xact_lock(hashtextextended('sharepoint-br1-index:' || p_connection, 0));
  observed_at := clock_timestamp();

  with enrollment as materialized (
    select scoped.* from erp_private.dms_agent_center_br1_telemetry_enrollment scoped
    where scoped.connection_id = p_connection and scoped.company_id = p_company and scoped.branch_id = p_branch
      and scoped.expires_at > observed_at
      and scoped.intake_enabled and scoped.lane_enabled and scoped.lane_mode = 'execute'
      and not scoped.checkpoint_paused and not scoped.lane_paused
      and scoped.checkpoint_revision between 1 and 9007199254740991
      and not exists (
        select 1 from erp_private.dms_agent_center_br1_telemetry_enrollment other
        where other.company_id = p_company and other.branch_id = p_branch
          and other.connection_id <> p_connection and other.expires_at > observed_at
      )
  ), facts as (
    select enrolled.connection_id, enrolled.company_id, enrolled.branch_id,
      source.item_id, source.version, enrolled.checkpoint_updated_at,
      case when current_item.version = source.version and current_item.available
        and connection.source_folder_id = any(current_item.ancestor_ids)
        and not (connection.index_folder_id = any(current_item.ancestor_ids))
        then 'present' else 'removed' end as source_state,
      origin.operation_id is not null as has_origin, origin.sha256,
      intake.id is not null as has_intake, intake.intake_status, work.status as work_status,
      review_event.id is not null as review_confirmed, filing.document_no, filing.type_code
    from enrollment enrolled
    join erp_private.agent_connections connection on connection.id = enrolled.connection_id
    join erp_private.agent_source_versions source
      on (source.connection_id, source.item_id, source.version)
        = (enrolled.connection_id, enrolled.item_id, enrolled.source_version)
      and source.discovered_at >= enrolled.from_time and source.mime = 'application/pdf'
      and source.size_bytes between 1 and 3145728
    left join erp_private.agent_source_items current_item
      on (current_item.connection_id, current_item.item_id) = (source.connection_id, source.item_id)
    left join erp_private.agent_pdf_work work
      on (work.connection_id, work.item_id, work.version, work.company_id, work.actor_id, work.sha256)
        = (source.connection_id, source.item_id, source.version, enrolled.company_id, enrolled.actor_id, enrolled.sha256)
    left join erp_private.dms_sharepoint_intake_origins origin
      on origin.operation_id = work.operation_id and
        (origin.connection_id, origin.item_id, origin.source_version, origin.company_id, origin.branch_id,
          origin.owner_id, origin.sha256, origin.file_size_bytes)
        = (source.connection_id, source.item_id, source.version, enrolled.company_id, enrolled.branch_id,
          enrolled.actor_id, enrolled.sha256, source.size_bytes)
    left join erp_private.f07_single_upload_admissions admission
      on (admission.actor_id, admission.operation_id, admission.upload_session_id)
        = (origin.owner_id, origin.operation_id, origin.upload_session_id) and admission.acknowledged_at is not null
    left join public.dms_upload_sessions intake on intake.id = admission.upload_session_id
      and (intake.uploaded_by, intake.owning_company_id, intake.owning_branch_id, intake.original_filename,
        intake.sha256_hash, intake.file_size_bytes, intake.temp_storage_path)
        = (origin.owner_id, origin.company_id, origin.branch_id, origin.filename,
          origin.sha256, origin.file_size_bytes, origin.temp_storage_path)
      and intake.mime_type = source.mime and intake.deleted_at is null and intake.discarded_at is null
    left join erp_private.dms_sharepoint_br1_review_state review_state
      on (review_state.operation_id, review_state.upload_session_id, review_state.officer_id)
        = (origin.operation_id, intake.id, enrolled.officer_id)
      and (work.session_id, work.review_id) = (intake.id, review_state.review_id)
    left join public.dms_ai_extraction_results result on
      (result.id, result.upload_session_id, result.job_id) = (review_state.result_id, intake.id, intake.ai_job_id)
      and intake.ai_result_id = result.id
    left join public.dms_ai_extraction_jobs job on (job.id, job.upload_session_id) = (result.job_id, intake.id)
      and job.status in ('complete', 'completed')
    left join public.dms_review_queue queue on
      (queue.id, queue.upload_session_id, queue.ai_result_id, queue.assigned_to)
        = (review_state.review_id, intake.id, result.id, enrolled.officer_id)
      and queue.deleted_at is null and queue.status in ('assigned', 'in_progress') and job.id is not null
    left join erp_private.notification_events review_event on review_event.id = review_state.notification_event_id
      and review_event.source_table = 'dms_review_queue' and review_event.source_id = queue.id
      and review_event.event_type = 'dms_review_queue_assigned' and review_event.actor_id = origin.owner_id
      and review_event.source_snapshot->>'assigned_to' = enrolled.officer_id::text
    left join lateral (
      -- The numbered approval receipt, event and currently retained exact
      -- original must all read back. A worker result or duplicate is advisory.
      select document.document_no, type.type_code
      from erp_private.ai_approval_plans plan
      join public.dms_approve_runs run on (run.id, run.upload_session_id, run.document_id, run.started_by)
        = (plan.approve_run_id, intake.id, intake.document_id, plan.actor_id)
        and run.status = 'completed' and run.run_key = 'f06-ai:' || plan.actor_id || ':' || plan.operation_id
        and run.final_storage_bucket = 'dms-documents' and run.final_storage_path = plan.storage_path
      join public.dms_documents document on (document.id, document.document_no,
        document.owning_company_id, document.owning_branch_id)
        = (plan.document_id, plan.document_no, enrolled.company_id, enrolled.branch_id)
        and document.status in ('active', 'approved', 'published') and document.deleted_at is null
        and not document.is_archived and document.document_no ~ '^DMS-[0-9]{4}-[0-9]{1,32}$'
      join public.dms_document_types type on type.id = document.document_type_id
        and type.is_active and type.deleted_at is null and type.type_code ~ '^[A-Z][A-Z0-9_]{0,63}$'
      join public.dms_document_versions version on (version.id, version.document_id) = (document.current_version_id, document.id)
        and version.is_current
      join public.dms_document_files original on (original.document_id, original.version_id)
        = (document.id, version.id) and original.deleted_at is null and original.file_role = 'original'
        and (original.storage_bucket, original.storage_path, original.mime_type, original.sha256_hash, original.file_size_bytes)
          = (run.final_storage_bucket, plan.storage_path, source.mime, origin.sha256, origin.file_size_bytes)
      join erp_private.ai_approval_verified_copies proof on (proof.actor_id, proof.operation_id, proof.request_hash)
        = (plan.actor_id, plan.operation_id, plan.request_hash)
        and (proof.content_sha256, proof.file_size_bytes, proof.file_name)
          = (origin.sha256, origin.file_size_bytes, original.file_name)
      join storage.objects object on (object.id, object.bucket_id, object.name, object.version, object.updated_at)
        = (proof.object_id, original.storage_bucket, original.storage_path, proof.object_version, proof.object_updated_at)
        and object.metadata->>'size' = origin.file_size_bytes::text and object.metadata->>'mimetype' = source.mime
      where (plan.upload_session_id, plan.approve_run_id, plan.actor_id) = (intake.id, intake.approve_run_id, enrolled.officer_id)
        and intake.reviewed_by = plan.actor_id and intake.status = 'completed' and intake.intake_status = 'approved'
        and intake.review_status = 'approved' and intake.approve_status = 'completed' and intake.approved_at is not null
        and plan.completed_at is not null
        and plan.request_json @> jsonb_build_object('owningCompanyId', enrolled.company_id,
          'owningBranchId', enrolled.branch_id, 'documentTypeId', document.document_type_id)
        and plan.result @> jsonb_build_object(
          'documentId', document.id, 'documentNo', document.document_no, 'upload_session_id', intake.id,
          'operation_id', plan.operation_id, 'approve_run_id', run.id, 'file_id', original.id,
          'completed', true, 'replayed', false)
        and exists (
          select 1 from public.dms_document_events event where event.document_id = document.id
            and event.event_type = 'approve_save_db_transaction_completed' and event.performed_by = plan.actor_id
            and event.metadata_json @> jsonb_build_object('operation_id', plan.operation_id, 'approve_run_id', run.id,
              'file_id', original.id, 'version_id', version.id)
        )
    ) filing on true
  ), projected as (
    select jsonb_build_object('connection_id', connection_id, 'company_id', company_id, 'branch_id', branch_id,
      'source_item_id', item_id, 'source_version', version) as reference,
      source_state, checkpoint_updated_at, sha256, document_no, type_code,
      case
        when document_no is not null then 'complete'
        when has_origin and (not has_intake or intake_status = 'approved') then 'exception'
        when intake_status in ('review_pending', 'review_in_progress') and review_confirmed then 'awaiting_review'
        when intake_status in ('ocr_processing', 'ai_processing') then 'processing'
        when work_status in ('held', 'duplicate', 'review_pending', 'reviewed') and has_origin then 'exception'
        when work_status in ('held', 'duplicate') then 'exception'
      end as processing_status,
      case
        when document_no is not null then null
        when has_origin and not has_intake then 'intake_binding_mismatch'
        when work_status = 'duplicate' then 'duplicate_suspected'
        when intake_status in ('review_pending', 'review_in_progress') and review_confirmed then 'sharepoint_intake_ready'
        when work_status in ('held', 'review_pending', 'reviewed') and (has_origin or work_status = 'held')
          then 'manual_review_required'
      end as review_reason
    from facts
  )
  select jsonb_build_object('connection_id', enrolled.connection_id, 'company_id', enrolled.company_id, 'branch_id', enrolled.branch_id),
    enrolled.checkpoint_updated_at, enrolled.expires_at,
    jsonb_build_object('checkpoint_revision', enrolled.checkpoint_revision,
      'sources', coalesce((select jsonb_agg(reference || jsonb_build_object(
        'source_state', source_state,
        'last_checked_at', to_char(checkpoint_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) from projected), '[]'::jsonb),
      'receipts', coalesce((select jsonb_agg(reference || jsonb_build_object(
        'processing_status', processing_status, 'review_reason', review_reason, 'content_sha256', sha256,
        'outcome', case when document_no is not null then 'filed' end, 'document_read_back', document_no is not null,
        'document_type_code', type_code, 'dms_document_number', document_no))
        from projected where processing_status is not null), '[]'::jsonb))
    into scope, checked_at, enrollment_expires_at, payload from enrollment enrolled;
  if not found or enrollment_expires_at <= clock_timestamp() then
    raise exception 'SharePoint index scope unavailable' using errcode = '42501';
  end if;

  insert into erp_private.dms_sharepoint_br1_index_snapshots as previous
    (connection_id, revision, committed_at, projection_inputs)
  values (p_connection, 1, greatest(clock_timestamp(), checked_at), scope || payload)
  on conflict (connection_id) do update
    set revision = previous.revision + 1,
      committed_at = greatest(previous.committed_at, excluded.committed_at),
      projection_inputs = excluded.projection_inputs
    where previous.projection_inputs is distinct from excluded.projection_inputs;

  select * into strict captured from erp_private.dms_sharepoint_br1_index_snapshots
    where connection_id = p_connection;
  return jsonb_build_object(
    'scope', scope,
    'checkpoint', scope || jsonb_build_object('revision', payload->'checkpoint_revision'),
    'snapshot', captured.projection_inputs || jsonb_build_object(
      'revision', captured.revision,
      'committed_at', to_char(captured.committed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  );
end $function$;

revoke all on function erp_private.capture_sharepoint_br1_index_snapshot(uuid,bigint,bigint)
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;

commit;
