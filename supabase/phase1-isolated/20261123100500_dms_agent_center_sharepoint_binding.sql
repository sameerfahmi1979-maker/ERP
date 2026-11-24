begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Isolated acceptance only. No lane is bound by this migration. The lease-aware
-- RPC returns an admission receipt only. Storage, completion and AI boundaries
-- still require their own fences before end-to-end activation.
create function erp_private.dms_agent_center_sharepoint_intake_allowed(p_company bigint)
returns boolean language plpgsql volatile security invoker set search_path = ''
as $function$
begin
  -- Preserve the existing pilot policy for scopes without a reviewed binding.
  if not exists (select 1 from erp_private.dms_agent_center_controls c
    where c.company_id = p_company and c.branch_id is null and c.agent_key = 'dms.intake' and c.worker_bound) then
    return true;
  end if;
  return erp_private.dms_agent_center_lock_for_write(p_company, null, 'dms.intake');
end $function$;

create function erp_private.dms_agent_center_check_sharepoint_admission(
  p_actor bigint, p_operation uuid, p_company bigint, p_branch bigint, p_request jsonb, p_lease uuid
) returns void language plpgsql volatile security invoker set search_path = ''
as $function$
declare
  work erp_private.agent_pdf_work%rowtype;
  metadata jsonb := p_request->'metadata';
begin
  select w.* into work from erp_private.agent_pdf_work w where w.operation_id = p_operation;
  if not found or not exists (select 1 from erp_private.dms_agent_center_controls c
    where c.company_id = work.company_id and c.branch_id is null and c.agent_key = 'dms.intake' and c.worker_bound) then
    if p_lease is not null then
      raise exception 'SharePoint admission binding unavailable' using errcode = '42501';
    end if;
    return;
  end if;

  if p_lease is null or p_actor is distinct from work.actor_id or p_company is distinct from work.company_id
    or p_branch is not null or not (p_request ? 'scope') or p_request->'context' is distinct from 'null'::jsonb then
    raise exception 'SharePoint admission binding unavailable' using errcode = '42501';
  end if;
  perform 1 from erp_private.agent_pdf_policy p
  join erp_private.agent_sync_checkpoints s using (connection_id)
  where p.connection_id = work.connection_id and p.company_id = work.company_id and p.actor_id = work.actor_id
    and p.enabled and not s.paused for share of p, s;
  if not found then
    raise exception 'SharePoint intake policy unavailable' using errcode = '55000';
  end if;
  if erp_private.dms_agent_center_sharepoint_intake_allowed(work.company_id) is not true then
    raise exception 'SharePoint intake is paused or off' using errcode = '55000';
  end if;

  -- Hold the exact operation, current source, policy and control through F07.
  perform 1 from erp_private.agent_pdf_work w
  join erp_private.agent_source_items i using (connection_id, item_id, version)
  join erp_private.agent_source_versions v using (connection_id, item_id, version)
  where w.operation_id = p_operation and w.connection_id = work.connection_id
    and w.company_id = work.company_id and w.actor_id = work.actor_id and w.status = 'retry'
    and w.lease_token = p_lease and w.lease_until > clock_timestamp()
    and w.sha256 = metadata->>'sha256_hash' and i.available and i.filename = metadata->>'original_filename'
    and v.mime = 'application/pdf' and v.mime = metadata->>'mime_type'
    and v.size_bytes between 1 and 3145728 and v.size_bytes = (metadata->>'file_size_bytes')::bigint
  for share of w, i, v;
  if not found then
    raise exception 'SharePoint admission source unavailable' using errcode = '42501';
  end if;
end $function$;

revoke all on function erp_private.dms_agent_center_sharepoint_intake_allowed(bigint),
  erp_private.dms_agent_center_check_sharepoint_admission(bigint,uuid,bigint,bigint,jsonb,uuid)
  from public, anon, authenticated, service_role, erp_agent_discovery_runtime;

-- Extend the reviewed versions in place and retain their existing grants.
-- The gate stays inside each function's existing data transaction.
do $patch$
declare
  target record;
  definition text;
  body_checksum text;
begin
  for target in select * from (values
    ('erp_private.claim_agent_pdf(uuid)'::regprocedure, 'bd0ed98de98e4191188d3d5c7b0ee4b1',
      E'  if not found then return null; end if;\n  if exists',
      E'  if not found then return null; end if;\n  if erp_private.dms_agent_center_sharepoint_intake_allowed(policy.company_id) is not true then return null; end if;\n  if exists'),
    ('erp_private.advance_agent_pdf(uuid,uuid,uuid,text,text)'::regprocedure, '76f5920175f84e8ee94d3f2785a81ee1',
      E'  if not found then return ''paused''; end if;\n  select * into work',
      E'  if not found then return ''paused''; end if;\n  if erp_private.dms_agent_center_sharepoint_intake_allowed(policy.company_id) is not true then return ''paused''; end if;\n  select * into work')
  ) as patches(signature, checksum, anchor, replacement)
  loop
    select replace(pg_get_functiondef(oid), E'\r\n', E'\n'), md5(replace(prosrc, E'\r\n', E'\n'))
      into strict definition, body_checksum from pg_proc where oid = target.signature;
    if body_checksum <> target.checksum or array_length(string_to_array(definition, target.anchor), 1) <> 2 then
      raise exception 'Unexpected Agent Center binding target version: %', target.signature;
    end if;
    execute replace(definition, target.anchor, target.replacement);
  end loop;
end $patch$;

-- Reuse one canonical F07 implementation. Only the control fence consumes the
-- separate lease; the request, idempotency locks and stored receipt stay intact.
do $admission$
declare
  definition text;
  body_checksum text;
  signature constant text := 'erp_private.f07_admit_single_upload(p_request jsonb)';
  anchor constant text := E' IF NOT pg_catalog.pg_try_advisory_xact_lock';
begin
  select replace(pg_get_functiondef(oid), E'\r\n', E'\n'), md5(replace(prosrc, E'\r\n', E'\n'))
    into strict definition, body_checksum from pg_proc where oid = 'erp_private.f07_admit_single_upload(jsonb)'::regprocedure;
  if body_checksum <> '2587766bf482d588b5184ee78bfb21e2'
    or array_length(string_to_array(definition, signature), 1) <> 2
    or array_length(string_to_array(definition, anchor), 1) <> 2 then
    raise exception 'Unexpected Agent Center F07 admission version';
  end if;
  definition := replace(definition, signature, 'erp_private.f07_admit_single_upload_fenced(p_request jsonb, p_lease uuid)');
  execute replace(definition, anchor,
    E' PERFORM erp_private.dms_agent_center_check_sharepoint_admission(actor,operation,company,branch,p_request,p_lease);\n' || anchor);
end $admission$;

create or replace function erp_private.f07_admit_single_upload(p_request jsonb)
returns jsonb language sql security invoker set search_path = '' as $function$
  select erp_private.f07_admit_single_upload_fenced(p_request, null);
$function$;

create function public.f07_admit_sharepoint_upload(p_request jsonb, p_lease uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  receipt jsonb;
begin
  if p_lease is null then
    raise exception 'SharePoint admission binding unavailable' using errcode = '42501';
  end if;
  receipt := erp_private.f07_admit_single_upload_fenced(p_request, p_lease);
  if receipt->'session'->'id' is null then
    raise exception 'Original SharePoint admission unavailable' using errcode = '42501';
  end if;
  return jsonb_build_object('id', receipt->'session'->'id',
    'operationId', receipt->'operationId', 'replayed', receipt->'replayed');
end $function$;

revoke all on function erp_private.f07_admit_single_upload_fenced(jsonb,uuid),
  public.f07_admit_sharepoint_upload(jsonb,uuid) from public, anon, authenticated, service_role, erp_agent_discovery_runtime;
grant execute on function erp_private.f07_admit_single_upload_fenced(jsonb,uuid),
  public.f07_admit_sharepoint_upload(jsonb,uuid) to authenticated;
notify pgrst, 'reload schema';

commit;
