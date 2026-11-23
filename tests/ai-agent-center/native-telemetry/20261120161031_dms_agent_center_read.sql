begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Bounded Phase 1 projection of committed pilot and DMS receipts. The private
-- ledger has no authenticated table grants and should stay that way.
create function erp_private.dms_agent_center_read(
  p_company bigint, p_branch bigint, p_search text, p_outcome text, p_case uuid, p_offset integer
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
declare
  selected_company bigint;
  company_label text;
  branch_label text := 'All authorized branches';
  authorized_choices jsonb;
  search_term text := nullif(lower(btrim(p_search)), '');
  page_offset integer := coalesce(p_offset, 0);
  checked_at timestamptz := statement_timestamp();
  today_start timestamptz := date_trunc('day', checked_at at time zone 'Asia/Dubai') at time zone 'Asia/Dubai';
  tomorrow_start timestamptz := today_start + interval '24 hours';
  checkpoint jsonb;
  result jsonb;
begin
  if erp_private.business_principal_is_active() is not true then
    raise exception 'Agent Center access denied' using errcode = '42501';
  end if;
  if coalesce(length(p_search), 0) > 200 or page_offset not between 0 and 5000
     or (p_outcome is not null and p_outcome not in ('filed', 'duplicate', 'review', 'failed')) then
    raise exception 'Invalid Agent Center filters' using errcode = '22023';
  end if;

  with allowed_branches as materialized (
    select b.id, b.owner_company_id,
      coalesce(nullif(btrim(b.branch_name_en), ''), b.branch_code, 'Branch') as label
    from public.branches b
    where b.status = 'active'
      and (erp_private.permission_in_scope('dms.documents.view', b.owner_company_id, b.id)
        or erp_private.permission_in_scope('dms.admin', b.owner_company_id, b.id))
  ), allowed_companies as materialized (
    select c.id, c.company_code,
      coalesce(nullif(btrim(c.short_name), ''), nullif(btrim(c.legal_name_en), ''), c.company_code, 'Company') as label,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', b.id, 'label', b.label) order by b.label, b.id)
        from allowed_branches b where b.owner_company_id = c.id
      ), '[]'::jsonb) as branches
    from public.owner_companies c
    where c.status = 'active'
      and (erp_private.permission_in_scope('dms.documents.view', c.id, null)
        or erp_private.permission_in_scope('dms.admin', c.id, null)
        or exists (select 1 from allowed_branches b where b.owner_company_id = c.id))
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label, 'branches', c.branches)
      order by (c.company_code = 'ALGT') desc nulls last, c.label, c.id), '[]'::jsonb),
    coalesce(p_company, (array_agg(c.id order by (c.company_code = 'ALGT') desc nulls last, c.label, c.id))[1])
  into authorized_choices, selected_company
  from allowed_companies c;

  select choice ->> 'label' into company_label
  from jsonb_array_elements(authorized_choices) choice
  where (choice ->> 'id')::bigint = selected_company;
  if company_label is null then
    raise exception 'Agent Center scope unavailable' using errcode = '42501';
  end if;
  if p_branch is not null then
    select branch ->> 'label' into branch_label
    from jsonb_array_elements(authorized_choices) choice
    cross join lateral jsonb_array_elements(choice -> 'branches') branch
    where (choice ->> 'id')::bigint = selected_company and (branch ->> 'id')::bigint = p_branch;
    if branch_label is null then
      raise exception 'Agent Center scope unavailable' using errcode = '42501';
    end if;
  end if;

  -- The pilot checkpoint is company-wide, has no business record subject, and
  -- reports actual discovery commits. It is not a heartbeat or next-run clock.
  if p_branch is null and
    (erp_private.permission_in_scope('dms.documents.review_ai', selected_company, null)
      or erp_private.permission_in_scope('dms.admin', selected_company, null)) then
    select case when count(*) = 1 then (jsonb_agg(jsonb_build_object(
        'lastCheckedAt', s.updated_at, 'policyEnabled', p.enabled, 'paused', s.paused)) -> 0) end
    into checkpoint
    from erp_private.agent_sync_checkpoints s
    join erp_private.agent_pdf_policy p using (connection_id)
    where p.company_id = selected_company and s.revision > 0;
  end if;

  with authorized as materialized (
    select w.operation_id as id,
      coalesce(nullif(d.title, ''), nullif(s.original_filename, ''), 'SharePoint PDF') as title,
      s.original_filename as filename, s.session_code as session_code,
      d.id as document_id, d.document_no as dms_number,
      w.status as worker_status, s.status as session_status, s.intake_status,
      v.discovered_at, s.uploaded_at, s.discarded_at,
      j.status as job_status, j.started_at, j.completed_at as job_completed_at,
      r.status as review_status, r.queued_at, r.resolved_at,
      a.completed_at as filed_at, hr.created_at as linked_at,
      greatest(v.discovered_at, s.updated_at, j.updated_at, r.updated_at, a.completed_at, hr.created_at) as updated_at
    from erp_private.agent_pdf_work w
    join erp_private.agent_source_versions v using (connection_id, item_id, version)
    left join erp_private.f07_single_upload_admissions admission
      on admission.actor_id = w.actor_id and admission.operation_id = w.operation_id
    -- An active item may have a committed admission before the worker stores
    -- session_id. A missing subject receipt means the item is not visible here.
    join public.dms_upload_sessions s on s.id = coalesce(w.session_id, admission.upload_session_id)
      and (w.session_id is null or admission.upload_session_id is null or w.session_id = admission.upload_session_id)
      and s.uploaded_by = w.actor_id and s.owning_company_id = w.company_id
      and s.sha256_hash = w.sha256 and s.deleted_at is null
    left join public.dms_documents d on d.id = s.document_id and d.deleted_at is null
      and d.owning_company_id = s.owning_company_id
      and d.owning_branch_id is not distinct from s.owning_branch_id
    left join public.dms_ai_extraction_jobs j on j.id = s.ai_job_id and j.upload_session_id = s.id
    left join public.dms_review_queue r on r.id = w.review_id and r.upload_session_id = s.id and r.deleted_at is null
    left join public.dms_approve_runs a on a.id = s.approve_run_id and a.upload_session_id = s.id
      and a.document_id = d.id and a.status = 'completed' and s.intake_status = 'approved'
    left join erp_private.agent_employee_link_receipts hr on hr.operation_id = w.operation_id
      and hr.document_id = d.id and hr.approve_run_id = a.id and hr.outcome in ('linked', 'already_linked')
    where w.company_id = selected_company
      and (p_branch is null or s.owning_branch_id = p_branch)
      and (s.owning_branch_id is null or exists (select 1 from public.branches b
        where b.id = s.owning_branch_id and b.owner_company_id = selected_company and b.status = 'active'))
      and (erp_private.permission_in_scope('dms.documents.view', w.company_id, s.owning_branch_id)
        or erp_private.permission_in_scope('dms.admin', w.company_id, s.owning_branch_id))
      -- Require normal intake authority independently of document viewing and
      -- apply the subject check as a separate protection for bound intakes.
      and erp_private.upload_session_allowed(s.id)
      and erp_private.f07_upload_subject_allowed(s.id)
      and (s.document_id is null or (d.id is not null and erp_private.document_permission(d.id, 'dms.documents.view')))
      and (s.duplicate_document_id is null or erp_private.document_permission(s.duplicate_document_id, 'dms.documents.view'))
      -- A duplicate signal itself can reveal the existence of restricted records.
      and not exists (select 1 from unnest(w.matching_document_ids) matched(document_id)
        where erp_private.document_permission(matched.document_id, 'dms.documents.view') is not true)
      and (w.status <> 'duplicate' or s.duplicate_document_id is not null
        or coalesce(cardinality(w.matching_document_ids), 0) > 0)
  ), states as (
    select x.*, case
      when x.filed_at is not null then 'filed'
      when x.worker_status = 'duplicate' then 'duplicate'
      when x.intake_status in ('failed', 'ocr_failed', 'ai_failed') then 'failed'
      when x.worker_status in ('held', 'reviewed') or x.intake_status in ('discarded', 'rejected', 'approved') then 'exception'
      when x.intake_status in ('review_pending', 'review_in_progress') then 'review'
      when x.intake_status in ('ocr_processing', 'ai_processing') then 'running'
      else 'queued' end as state
    from authorized x
  ), timed as (
    select x.*, case
        when x.linked_at is not null then 'linking'
        when x.state = 'running' then 'extraction'
        when x.state in ('filed', 'review', 'duplicate') or x.job_status in ('complete','completed') then 'validation'
        when x.started_at is not null then 'extraction'
        else 'intake' end as stage,
      case when x.state = 'review' and x.review_status in ('open','assigned','in_review') then x.queued_at end as waiting_since,
      case
        when x.state = 'filed' then x.filed_at
        when x.state = 'duplicate' and x.intake_status = 'discarded' and x.review_status in ('resolved','dismissed')
          then coalesce(x.resolved_at, x.discarded_at)
        when x.state = 'failed' and x.job_status = 'failed' then x.job_completed_at
        else null end as finished_at
    from states x
  ), outcome_cases as materialized (
    select x.*,
      case when x.state = 'review' then x.waiting_since >= today_start and x.waiting_since < tomorrow_start
        when x.state in ('filed', 'duplicate', 'failed') then x.finished_at >= today_start and x.finished_at < tomorrow_start
        else false end as is_today,
      jsonb_build_object(
        'id', x.id, 'title', x.title, 'sessionCode', x.session_code, 'documentId', x.document_id, 'dmsNumber', x.dms_number,
        'stage', x.stage, 'status', x.state, 'discoveredAt', x.discovered_at,
        'uploadedAt', case when x.session_status in ('uploaded', 'completed') or x.discarded_at is not null
          then x.uploaded_at end,
        'startedAt', x.started_at, 'analysisFinishedAt',
          case when x.state <> 'running' and x.job_status in ('complete', 'completed') then x.job_completed_at end,
        'waitingSince', x.waiting_since, 'finishedAt', x.finished_at, 'updatedAt', x.updated_at
      ) as payload
    from timed x
  ), window_rows as materialized (
    select x.id, x.updated_at, x.payload
    from outcome_cases x
    where (p_outcome is null or (x.state = p_outcome and x.is_today))
      and (search_term is null or strpos(lower(x.title), search_term) > 0
        or strpos(lower(coalesce(x.filename, '')), search_term) > 0
        or strpos(lower(coalesce(x.session_code, '')), search_term) > 0
        or strpos(lower(coalesce(x.dms_number, '')), search_term) > 0)
    order by x.updated_at desc, x.id
    offset page_offset limit 51
  ), page_rows as (
    select * from window_rows order by updated_at desc, id limit 50
  ), totals as (
    -- An exact-hash skip can have neither a subject receipt nor a committed
    -- disposition timestamp. Do not report a partial count as the daily total.
    select jsonb_build_object(
      'filed', count(*) filter (where x.state = 'filed' and x.is_today),
      'duplicate', null::integer,
      'review', case when count(*) filter (where x.state = 'review' and x.waiting_since is null) = 0
        then count(*) filter (where x.state = 'review' and x.is_today) end,
      'failed', case when count(*) filter (where x.state = 'failed' and x.finished_at is null) = 0
        then count(*) filter (where x.state = 'failed' and x.is_today) end
    ) as payload
    from outcome_cases x
  )
  select jsonb_build_object(
    'scope', jsonb_build_object('companyId', selected_company, 'branchId', p_branch, 'company', company_label, 'branch', branch_label),
    'choices', authorized_choices,
    'totals', totals.payload,
    'cases', coalesce((select jsonb_agg(p.payload order by p.updated_at desc, p.id) from page_rows p), '[]'::jsonb),
    'selectedCase', (select x.payload from outcome_cases x where x.id = p_case),
    'attention', (select x.payload from outcome_cases x where x.state in ('review','failed','exception')
      order by case x.state when 'review' then 0 when 'failed' then 1 else 2 end,
        coalesce(x.waiting_since, x.finished_at, x.discovered_at), x.id limit 1),
    'checkpoint', checkpoint,
    'confirmedAt', checked_at,
    'hasMore', (select count(*) > 50 from window_rows)
  ) into result
  from totals;
  return result;
end
$function$;

create function public.dms_agent_center_read(
  p_company bigint, p_branch bigint, p_search text, p_outcome text, p_case uuid, p_offset integer
) returns jsonb
language sql stable security invoker set search_path = ''
as $function$
  select erp_private.dms_agent_center_read($1, $2, $3, $4, $5, $6);
$function$;

revoke all on function erp_private.dms_agent_center_read(bigint, bigint, text, text, uuid, integer),
  public.dms_agent_center_read(bigint, bigint, text, text, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function erp_private.dms_agent_center_read(bigint, bigint, text, text, uuid, integer),
  public.dms_agent_center_read(bigint, bigint, text, text, uuid, integer)
  to authenticated;
commit;
