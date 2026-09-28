-- F01: reviewed additive containment. Apply only after release preflight/approval.
-- No business rows, job execution, secrets or history are modified.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.current_user_profile_id()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
  select id from public.user_profiles where auth_user_id = auth.uid() and status = 'active' limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.current_user_owner_company_id()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
  select owner_company_id from public.user_profiles where auth_user_id = auth.uid() and status = 'active' limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.current_user_branch_id()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
  select branch_id from public.user_profiles where auth_user_id = auth.uid() and status = 'active' limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.current_user_is_global_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.user_profiles up on up.id = ur.user_profile_id
    where up.auth_user_id = auth.uid()
      and up.status = 'active'
      and ur.is_active = true
      and r.is_active = true
      and r.role_code in ('system_admin', 'group_admin')
      and ur.owner_company_id is null
      and ur.branch_id is null
  );
$function$;

CREATE OR REPLACE FUNCTION public.current_user_has_role(role_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.user_profiles up on up.id = ur.user_profile_id
    where up.auth_user_id = auth.uid()
      and up.status = 'active'
      and ur.is_active = true
      and r.is_active = true
      and r.role_code = $1
      and ur.owner_company_id is null
      and ur.branch_id is null
  );
$function$;

CREATE OR REPLACE FUNCTION public.current_user_has_role_in_company(role_code text, target_owner_company_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
  select
    target_owner_company_id is not null
    and (
      public.current_user_is_global_admin()
      or exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        join public.user_profiles up on up.id = ur.user_profile_id
        where up.auth_user_id = auth.uid()
      and up.status = 'active'
          and ur.is_active = true
          and r.is_active = true
          and r.role_code = current_user_has_role_in_company.role_code
          and ur.owner_company_id = target_owner_company_id
          and ur.branch_id is null
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.current_user_has_role_in_branch(role_code text, target_branch_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
  select
    target_branch_id is not null
    and (
      public.current_user_is_global_admin()
      or exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        join public.user_profiles up on up.id = ur.user_profile_id
        where up.auth_user_id = auth.uid()
      and up.status = 'active'
          and ur.is_active = true
          and r.is_active = true
          and r.role_code = current_user_has_role_in_branch.role_code
          and ur.branch_id = target_branch_id
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.current_user_has_permission(permission_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
  select public.current_user_is_global_admin()
  or exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    join public.user_profiles up on up.id = ur.user_profile_id
    where up.auth_user_id = auth.uid()
      and up.status = 'active'
      and ur.is_active = true
      and r.is_active = true
      and p.is_active = true
      and p.permission_code = current_user_has_permission.permission_code
      and ur.owner_company_id is null
      and ur.branch_id is null
  );
$function$;

CREATE OR REPLACE FUNCTION public.current_user_has_permission_globally(permission_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    join public.user_profiles up on up.id = ur.user_profile_id
    where up.auth_user_id = auth.uid()
      and up.status = 'active'
      and ur.is_active = true
      and r.is_active = true
      and p.is_active = true
      and p.permission_code = current_user_has_permission_globally.permission_code
      and ur.owner_company_id is null
      and ur.branch_id is null
  );
$function$;

CREATE OR REPLACE FUNCTION public.current_user_has_permission_any_scope(permission_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
  select public.current_user_is_global_admin()
  or exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    join public.user_profiles up on up.id = ur.user_profile_id
    where up.auth_user_id = auth.uid()
      and up.status = 'active'
      and ur.is_active = true
      and r.is_active = true
      and p.is_active = true
      and p.permission_code = current_user_has_permission_any_scope.permission_code
  );
$function$;

CREATE OR REPLACE FUNCTION public.current_user_has_permission_in_company(permission_code text, target_owner_company_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
  select
    target_owner_company_id is not null
    and (
      public.current_user_has_permission($1)
      or exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        join public.role_permissions rp on rp.role_id = r.id
        join public.permissions p on p.id = rp.permission_id
        join public.user_profiles up on up.id = ur.user_profile_id
        where up.auth_user_id = auth.uid()
      and up.status = 'active'
          and ur.is_active = true
          and r.is_active = true
          and p.is_active = true
          and p.permission_code = current_user_has_permission_in_company.permission_code
          and ur.owner_company_id = target_owner_company_id
          and ur.branch_id is null
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.current_user_has_permission_in_branch(permission_code text, target_branch_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
  select
    target_branch_id is not null
    and (
      public.current_user_has_permission($1)
      or exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        join public.role_permissions rp on rp.role_id = r.id
        join public.permissions p on p.id = rp.permission_id
        join public.user_profiles up on up.id = ur.user_profile_id
        where up.auth_user_id = auth.uid()
      and up.status = 'active'
          and ur.is_active = true
          and r.is_active = true
          and p.is_active = true
          and p.permission_code = current_user_has_permission_in_branch.permission_code
          and ur.branch_id = target_branch_id
      )
      or exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        join public.role_permissions rp on rp.role_id = r.id
        join public.permissions p on p.id = rp.permission_id
        join public.user_profiles up on up.id = ur.user_profile_id
        join public.branches b on b.id = target_branch_id
        where up.auth_user_id = auth.uid()
      and up.status = 'active'
          and ur.is_active = true
          and r.is_active = true
          and p.is_active = true
          and p.permission_code = current_user_has_permission_in_branch.permission_code
          and ur.owner_company_id = b.owner_company_id
          and ur.branch_id is null
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_user_role_assignment(target_user_profile_id bigint, target_role_id bigint, target_owner_company_id bigint, target_branch_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
declare
  v_is_global_admin boolean;
  v_current_profile_id bigint;
  v_target_user_company_id bigint;
  v_target_user_branch_id bigint;
  v_target_role_code text;
  v_current_user_has_company_admin boolean;
  v_current_user_has_branch_admin boolean;
begin
  -- Get current user's profile
  v_current_profile_id := public.current_user_profile_id();
  if v_current_profile_id is null then
    return false;
  end if;

  -- Validate role and subject before any bypass; no arbitrary privilege delegation.
  if not exists(select 1 from public.roles where id = target_role_id and is_active and is_assignable)
     or not exists(select 1 from public.user_profiles where id = target_user_profile_id and status = 'active') then
    return false;
  end if;
  -- Check if current user is true global admin
  v_is_global_admin := public.current_user_is_global_admin();

  -- Global admins can manage any role assignment
  if v_is_global_admin then
    return true;
  end if;

  -- Get target role code
  select role_code into v_target_role_code
  from public.roles
  where id = target_role_id;

  if v_target_role_code is null then
    return false;
  end if;

  -- Non-global admins cannot assign system_admin or group_admin
  if v_target_role_code in ('system_admin', 'group_admin') then
    return false;
  end if;

  -- Non-global admins cannot create global-null assignments
  if target_owner_company_id is null and target_branch_id is null then
    return false;
  end if;

  -- A scoped administrator cannot delegate a capability they do not possess.
  if exists (
    select 1 from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
    where rp.role_id = target_role_id and p.is_active and (
      p.permission_code in ('erp.admin', 'roles.manage', 'permissions.manage')
      or p.permission_code like 'settings.%' or p.permission_code like 'numbering.rules.%'
      or not case when target_branch_id is not null
        then public.current_user_has_permission_in_branch(p.permission_code, target_branch_id)
        else public.current_user_has_permission_in_company(p.permission_code, target_owner_company_id) end
    )
  ) then return false; end if;

  -- Get target user's company and branch
  select owner_company_id, branch_id
  into v_target_user_company_id, v_target_user_branch_id
  from public.user_profiles
  where id = target_user_profile_id;

  if v_target_user_company_id is null then
    return false;  -- Target user must belong to a company for scoped admin management
  end if;

  -- Check if current user has company-level admin permission in target company
  v_current_user_has_company_admin := public.current_user_has_permission_in_company(
    'users.update',
    v_target_user_company_id
  );

  if v_current_user_has_company_admin then
    -- Company admin can assign roles within their company
    -- But the assignment scope must match
    if target_owner_company_id = v_target_user_company_id then
      -- If assigning branch-scoped role, branch must belong to the company
      if target_branch_id is not null then
        return exists (
          select 1
          from public.branches
          where id = target_branch_id
            and owner_company_id = target_owner_company_id
        );
      end if;
      return true;
    end if;
    return false;
  end if;

  -- Check if current user has branch-level admin permission
  if v_target_user_branch_id is not null then
    v_current_user_has_branch_admin := public.current_user_has_permission_in_branch(
      'users.update',
      v_target_user_branch_id
    );

    if v_current_user_has_branch_admin then
      -- Branch admin can only assign branch-scoped roles within their branch
      return target_owner_company_id = v_target_user_company_id
        and target_branch_id = v_target_user_branch_id;
    end if;
  end if;

  return false;
end;
$function$;

REVOKE ALL ON FUNCTION public.erp_vault_create_secret(text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_vault_create_secret(text,text,text) TO service_role;
ALTER FUNCTION public.erp_vault_create_secret(text,text,text) SET search_path TO pg_catalog, public, vault, auth, pg_temp;
REVOKE ALL ON FUNCTION public.erp_vault_get_secret(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_vault_get_secret(uuid) TO service_role;
ALTER FUNCTION public.erp_vault_get_secret(uuid) SET search_path TO pg_catalog, public, vault, auth, pg_temp;
REVOKE ALL ON FUNCTION public.erp_vault_update_secret(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_vault_update_secret(uuid,text) TO service_role;
ALTER FUNCTION public.erp_vault_update_secret(uuid,text) SET search_path TO pg_catalog, public, vault, auth, pg_temp;
REVOKE ALL ON FUNCTION public.claim_dms_ai_jobs(text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_dms_ai_jobs(text,integer) TO service_role;
ALTER FUNCTION public.claim_dms_ai_jobs(text,integer) SET search_path TO pg_catalog, public, vault, auth, pg_temp;
REVOKE ALL ON FUNCTION public.complete_dms_ai_job(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_dms_ai_job(bigint) TO service_role;
ALTER FUNCTION public.complete_dms_ai_job(bigint) SET search_path TO pg_catalog, public, vault, auth, pg_temp;
REVOKE ALL ON FUNCTION public.fail_dms_ai_job(bigint,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_dms_ai_job(bigint,text,text,boolean) TO service_role;
ALTER FUNCTION public.fail_dms_ai_job(bigint,text,text,boolean) SET search_path TO pg_catalog, public, vault, auth, pg_temp;
REVOKE ALL ON FUNCTION public.recover_stale_dms_ai_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_dms_ai_jobs(integer) TO service_role;
ALTER FUNCTION public.recover_stale_dms_ai_jobs(integer) SET search_path TO pg_catalog, public, vault, auth, pg_temp;
REVOKE ALL ON FUNCTION public.search_users_for_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_users_for_email(text) TO service_role;
ALTER FUNCTION public.search_users_for_email(text) SET search_path TO pg_catalog, public, vault, auth, pg_temp;
CREATE OR REPLACE FUNCTION public.purge_dms_document(p_id bigint)
 RETURNS TABLE(out_storage_files jsonb, out_files_found integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_doc_exists  BOOLEAN;
  v_storage     JSONB;
  v_file_count  INT;
BEGIN
  IF NOT public.current_user_has_role('system_admin') THEN
    RAISE EXCEPTION 'Global system administrator required' USING ERRCODE = '42501';
  END IF;
  SELECT EXISTS(SELECT 1 FROM dms_documents WHERE id = p_id)
    INTO v_doc_exists;

  IF NOT v_doc_exists THEN
    RAISE EXCEPTION 'dms_document % not found', p_id;
  END IF;

  SELECT
    COALESCE(
      jsonb_agg(jsonb_build_object('bucket', storage_bucket, 'path', storage_path))
        FILTER (WHERE storage_bucket IS NOT NULL AND storage_path IS NOT NULL),
      '[]'::jsonb
    ),
    COUNT(*)
  INTO v_storage, v_file_count
  FROM dms_document_files
  WHERE document_id = p_id;

  -- Pre-delete A: Remove review queue items linked via upload session
  -- (the direct document_id link is now CASCADE; this covers the indirect path)
  DELETE FROM dms_review_queue
    WHERE upload_session_id IN (
      SELECT id FROM dms_upload_sessions WHERE document_id = p_id
    );

  -- Pre-delete B: Remove upload sessions that generated this document
  DELETE FROM dms_upload_sessions WHERE document_id = p_id;

  -- Hard-delete the document (DB CASCADE removes all DMS-owned child rows)
  DELETE FROM dms_documents WHERE id = p_id;

  out_storage_files := v_storage;
  out_files_found   := v_file_count;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_dms_document(bigint) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.purge_dms_document(bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.generate_next_reference_number(p_rule_code text DEFAULT NULL::text, p_document_type_code text DEFAULT NULL::text, p_target_table_name text DEFAULT NULL::text, p_target_record_id bigint DEFAULT NULL::bigint, p_generation_reason text DEFAULT NULL::text, p_generated_by bigint DEFAULT NULL::bigint)
 RETURNS TABLE(generated_reference_number text, generated_sequence_number bigint, numbering_rule_id bigint, sequence_state_id bigint, generation_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$ declare v_rule record; v_state record; v_next_seq bigint; v_formatted_seq text; v_generated_ref text; v_state_id bigint; v_gen_id bigint; begin
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF NOT (public.current_user_has_permission('numbering.rules.generate')
    OR (p_rule_code = 'MASTER_DMS_DOCUMENT' AND (public.current_user_has_permission('dms.documents.upload') OR public.current_user_has_permission('dms.admin')))
    OR (p_rule_code = 'HR_EMPLOYEE' AND public.current_user_has_permission_any_scope('hr.employees.create'))
    OR (p_rule_code IN ('HR_CANDIDATE','HR_JOB_REQUISITION','HR_OFFER') AND public.current_user_has_permission_any_scope('hr.recruitment.manage'))) THEN RAISE EXCEPTION 'Numbering permission denied' USING ERRCODE = '42501'; END IF;
    IF p_generated_by IS NOT NULL AND p_generated_by IS DISTINCT FROM public.current_user_profile_id() THEN RAISE EXCEPTION 'Actor mismatch' USING ERRCODE = '42501'; END IF;
    p_generated_by := public.current_user_profile_id();
  END IF;
 select r.* into v_rule from public.global_numbering_rules r where ((p_rule_code is not null and r.rule_code = p_rule_code) or (p_rule_code is null and p_document_type_code is not null and r.document_type_code = p_document_type_code)) and r.is_active = true and (r.effective_from is null or r.effective_from <= now()) and (r.effective_to is null or r.effective_to >= now()) order by r.id desc limit 1 for update; if not found then raise exception 'No active numbering rule found for rule_code=% or document_type_code=%', p_rule_code, p_document_type_code; end if; select s.* into v_state from public.global_numbering_sequence_states s where s.numbering_rule_id = v_rule.id and s.reset_period_key = 'GLOBAL' for update; if not found then insert into public.global_numbering_sequence_states (numbering_rule_id, module_code, document_type_code, document_prefix, reset_period_key, last_sequence_number, next_sequence_number, created_by, updated_by) values (v_rule.id, v_rule.module_code, v_rule.document_type_code, v_rule.document_prefix, 'GLOBAL', 0, v_rule.starting_sequence_number, p_generated_by, p_generated_by) returning * into v_state; end if; v_next_seq := v_state.next_sequence_number; v_formatted_seq := lpad(v_next_seq::text, v_rule.sequence_length, v_rule.padding_character); v_generated_ref := v_rule.format_template; v_generated_ref := replace(v_generated_ref, '{DOC}', v_rule.document_prefix); v_generated_ref := replace(v_generated_ref, '{SEQ}', v_formatted_seq); v_generated_ref := replace(v_generated_ref, '{SEQ3}', lpad(v_next_seq::text, 3, v_rule.padding_character)); v_generated_ref := replace(v_generated_ref, '{SEQ4}', lpad(v_next_seq::text, 4, v_rule.padding_character)); v_generated_ref := replace(v_generated_ref, '{SEQ5}', lpad(v_next_seq::text, 5, v_rule.padding_character)); v_generated_ref := replace(v_generated_ref, '{SEQ6}', lpad(v_next_seq::text, 6, v_rule.padding_character)); v_generated_ref := replace(v_generated_ref, '{SEQ12}', lpad(v_next_seq::text, 12, v_rule.padding_character)); v_generated_ref := replace(v_generated_ref, '{YYYY}', (extract(year from now()))::int::text); v_generated_ref := replace(v_generated_ref, '{YY}', substring((extract(year from now()))::int::text from 3)); v_generated_ref := replace(v_generated_ref, '{MM}', lpad((extract(month from now()))::int::text, 2, '0')); v_generated_ref := replace(v_generated_ref, '{DD}', lpad((extract(day from now()))::int::text, 2, '0')); if exists (select 1 from public.global_numbering_generated_references g where g.generated_reference_number = v_generated_ref) then raise exception 'Duplicate reference number detected: %', v_generated_ref; end if; insert into public.global_numbering_generated_references (numbering_rule_id, sequence_state_id, generated_reference_number, generated_sequence_number, module_code, document_type_code, document_prefix, target_table_name, target_record_id, generation_status, generation_reason, consumed_at, generated_by, generated_at, created_by, updated_by) values (v_rule.id, v_state.id, v_generated_ref, v_next_seq, v_rule.module_code, v_rule.document_type_code, v_rule.document_prefix, p_target_table_name, p_target_record_id, 'consumed', p_generation_reason, now(), p_generated_by, now(), p_generated_by, p_generated_by) returning id into v_gen_id; update public.global_numbering_sequence_states set last_sequence_number = v_next_seq, next_sequence_number = v_next_seq + 1, last_generated_reference = v_generated_ref, last_generated_at = now(), updated_at = now(), updated_by = p_generated_by where id = v_state.id; update public.global_numbering_rules set current_sequence_number = v_next_seq, next_sequence_number = v_next_seq + 1, updated_at = now(), updated_by = p_generated_by where id = v_rule.id; return query select v_generated_ref, v_next_seq, v_rule.id, v_state.id, 'consumed'::text; end; $function$;

REVOKE ALL ON FUNCTION public.generate_next_reference_number(text,text,text,bigint,text,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_next_reference_number(text,text,text,bigint,text,bigint) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.preview_next_reference_number(p_rule_code text DEFAULT NULL::text, p_document_type_code text DEFAULT NULL::text, p_next_sequence_number bigint DEFAULT NULL::bigint)
 RETURNS TABLE(preview_reference_number text, document_prefix text, sequence_number bigint, format_template text, rule_id bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$ declare v_rule record; v_next_seq bigint; v_formatted_seq text; v_preview text; begin
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF NOT (public.current_user_has_permission('numbering.rules.preview')) THEN RAISE EXCEPTION 'Numbering permission denied' USING ERRCODE = '42501'; END IF;
    
  END IF;
 select r.* into v_rule from public.global_numbering_rules r where ((p_rule_code is not null and r.rule_code = p_rule_code) or (p_rule_code is null and p_document_type_code is not null and r.document_type_code = p_document_type_code)) and r.is_active = true and (r.effective_from is null or r.effective_from <= now()) and (r.effective_to is null or r.effective_to >= now()) order by r.id desc limit 1; if not found then raise exception 'No active numbering rule found'; end if; v_next_seq := coalesce(p_next_sequence_number, v_rule.next_sequence_number); v_formatted_seq := lpad(v_next_seq::text, v_rule.sequence_length, v_rule.padding_character); v_preview := v_rule.format_template; v_preview := replace(v_preview, '{DOC}', v_rule.document_prefix); v_preview := replace(v_preview, '{SEQ}', v_formatted_seq); v_preview := replace(v_preview, '{SEQ3}', lpad(v_next_seq::text, 3, v_rule.padding_character)); v_preview := replace(v_preview, '{SEQ4}', lpad(v_next_seq::text, 4, v_rule.padding_character)); v_preview := replace(v_preview, '{SEQ5}', lpad(v_next_seq::text, 5, v_rule.padding_character)); v_preview := replace(v_preview, '{SEQ6}', lpad(v_next_seq::text, 6, v_rule.padding_character)); v_preview := replace(v_preview, '{SEQ12}', lpad(v_next_seq::text, 12, v_rule.padding_character)); v_preview := replace(v_preview, '{YYYY}', (extract(year from now()))::int::text); v_preview := replace(v_preview, '{YY}', substring((extract(year from now()))::int::text from 3)); v_preview := replace(v_preview, '{MM}', lpad((extract(month from now()))::int::text, 2, '0')); v_preview := replace(v_preview, '{DD}', lpad((extract(day from now()))::int::text, 2, '0')); return query select v_preview, v_rule.document_prefix, v_next_seq, v_rule.format_template, v_rule.id; end; $function$;

REVOKE ALL ON FUNCTION public.preview_next_reference_number(text,text,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_next_reference_number(text,text,bigint) TO authenticated, service_role;

REVOKE ALL ON TABLE public.dms_party_document_migration_map, public.v_owner_companies_geography_migration_unmatched FROM PUBLIC, anon, authenticated;
ALTER TABLE public.dms_party_document_migration_map ENABLE ROW LEVEL SECURITY;
-- No browser function needs TRUNCATE, trigger creation or REFERENCES authority.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
-- Future privileged functions require deliberate grants (existing normal functions unaffected).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS erp_email_provider_configs_authenticated ON public.erp_email_provider_configs;
DROP POLICY IF EXISTS erp_email_feature_flags_authenticated ON public.erp_email_feature_flags;
CREATE POLICY f01_email_provider_select ON public.erp_email_provider_configs FOR SELECT TO authenticated USING (public.current_user_has_permission('settings.email.view') OR public.current_user_has_permission('settings.email.manage') OR public.current_user_has_permission('settings.email.test') OR public.current_user_has_permission('settings.email.secrets.manage'));
CREATE POLICY f01_email_provider_insert ON public.erp_email_provider_configs FOR INSERT TO authenticated WITH CHECK (public.current_user_has_permission('settings.email.manage'));
CREATE POLICY f01_email_provider_update ON public.erp_email_provider_configs FOR UPDATE TO authenticated USING (public.current_user_has_permission('settings.email.manage')) WITH CHECK (public.current_user_has_permission('settings.email.manage'));
CREATE POLICY f01_email_provider_delete ON public.erp_email_provider_configs FOR DELETE TO authenticated USING (public.current_user_has_permission('settings.email.manage'));
CREATE POLICY f01_email_flag_select ON public.erp_email_feature_flags FOR SELECT TO authenticated USING (public.current_user_has_permission('settings.email.view') OR public.current_user_has_permission('settings.email.manage') OR public.current_user_has_permission('settings.email.feature_flags.manage'));
CREATE POLICY f01_email_flag_insert ON public.erp_email_feature_flags FOR INSERT TO authenticated WITH CHECK (public.current_user_has_permission('settings.email.manage') OR public.current_user_has_permission('settings.email.feature_flags.manage'));
CREATE POLICY f01_email_flag_update ON public.erp_email_feature_flags FOR UPDATE TO authenticated USING (public.current_user_has_permission('settings.email.manage') OR public.current_user_has_permission('settings.email.feature_flags.manage')) WITH CHECK (public.current_user_has_permission('settings.email.manage') OR public.current_user_has_permission('settings.email.feature_flags.manage'));
CREATE POLICY f01_email_flag_delete ON public.erp_email_feature_flags FOR DELETE TO authenticated USING (public.current_user_has_permission('settings.email.manage') OR public.current_user_has_permission('settings.email.feature_flags.manage'));
DROP POLICY IF EXISTS "Allow managing numbering rules for authenticated users" ON public.global_numbering_rules;
DROP POLICY IF EXISTS "Allow viewing numbering rules for authenticated users" ON public.global_numbering_rules;
CREATE POLICY f01_numbering_select ON public.global_numbering_rules FOR SELECT TO authenticated USING (public.current_user_has_permission('numbering.rules.view') OR public.current_user_has_permission('numbering.rules.manage') OR public.current_user_has_permission('numbering.rules.lock'));
CREATE POLICY f01_numbering_insert ON public.global_numbering_rules FOR INSERT TO authenticated WITH CHECK (public.current_user_has_permission('numbering.rules.manage'));
CREATE POLICY f01_numbering_update ON public.global_numbering_rules FOR UPDATE TO authenticated USING (public.current_user_has_permission('numbering.rules.manage')) WITH CHECK (public.current_user_has_permission('numbering.rules.manage'));
CREATE POLICY f01_numbering_delete ON public.global_numbering_rules FOR DELETE TO authenticated USING (public.current_user_has_permission('numbering.rules.manage'));
DROP POLICY IF EXISTS "Allow viewing sequence states for authenticated users" ON public.global_numbering_sequence_states;
CREATE POLICY f01_numbering_metadata_read ON public.global_numbering_sequence_states FOR SELECT TO authenticated USING (public.current_user_has_permission('numbering.rules.view') OR public.current_user_has_permission('numbering.rules.manage'));
DROP POLICY IF EXISTS "Allow viewing generated references for authenticated users" ON public.global_numbering_generated_references;
CREATE POLICY f01_numbering_metadata_read ON public.global_numbering_generated_references FOR SELECT TO authenticated USING (public.current_user_has_permission('numbering.rules.view') OR public.current_user_has_permission('numbering.rules.manage'));
DROP POLICY IF EXISTS dms_upload_sessions_select ON public.dms_upload_sessions;
CREATE POLICY f01_upload_session_select ON public.dms_upload_sessions FOR SELECT TO authenticated USING (public.current_user_profile_id() IS NOT NULL AND ((public.current_user_has_permission('dms.documents.review_ai') OR public.current_user_has_permission('dms.admin')) OR (uploaded_by = public.current_user_profile_id() AND public.current_user_has_permission('dms.documents.upload'))));
DROP POLICY IF EXISTS dms_upload_sessions_insert ON public.dms_upload_sessions;
CREATE POLICY f01_upload_session_insert ON public.dms_upload_sessions FOR INSERT TO authenticated WITH CHECK (public.current_user_profile_id() IS NOT NULL AND ((public.current_user_has_permission('dms.documents.review_ai') OR public.current_user_has_permission('dms.admin')) OR (uploaded_by = public.current_user_profile_id() AND public.current_user_has_permission('dms.documents.upload'))));
DROP POLICY IF EXISTS dms_upload_sessions_update ON public.dms_upload_sessions;
CREATE POLICY f01_upload_session_update ON public.dms_upload_sessions FOR UPDATE TO authenticated USING (public.current_user_profile_id() IS NOT NULL AND ((public.current_user_has_permission('dms.documents.review_ai') OR public.current_user_has_permission('dms.admin')) OR (uploaded_by = public.current_user_profile_id() AND public.current_user_has_permission('dms.documents.upload')))) WITH CHECK (public.current_user_profile_id() IS NOT NULL AND ((public.current_user_has_permission('dms.documents.review_ai') OR public.current_user_has_permission('dms.admin')) OR (uploaded_by = public.current_user_profile_id() AND public.current_user_has_permission('dms.documents.upload'))));
DROP POLICY IF EXISTS dms_intake_review_select ON public.dms_intake_review_values;
DROP POLICY IF EXISTS dms_intake_review_write ON public.dms_intake_review_values;
CREATE POLICY f01_intake_select ON public.dms_intake_review_values FOR SELECT TO authenticated USING (public.current_user_profile_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.dms_upload_sessions s WHERE s.id = upload_session_id AND s.deleted_at IS NULL AND ((public.current_user_has_permission('dms.documents.review_ai') OR public.current_user_has_permission('dms.admin')) OR (s.uploaded_by = public.current_user_profile_id() AND public.current_user_has_permission('dms.documents.upload')))));
CREATE POLICY f01_intake_insert ON public.dms_intake_review_values FOR INSERT TO authenticated WITH CHECK (public.current_user_profile_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.dms_upload_sessions s WHERE s.id = upload_session_id AND s.deleted_at IS NULL AND ((public.current_user_has_permission('dms.documents.review_ai') OR public.current_user_has_permission('dms.admin')) OR (s.uploaded_by = public.current_user_profile_id() AND public.current_user_has_permission('dms.documents.upload')))));
CREATE POLICY f01_intake_update ON public.dms_intake_review_values FOR UPDATE TO authenticated USING (public.current_user_profile_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.dms_upload_sessions s WHERE s.id = upload_session_id AND s.deleted_at IS NULL AND ((public.current_user_has_permission('dms.documents.review_ai') OR public.current_user_has_permission('dms.admin')) OR (s.uploaded_by = public.current_user_profile_id() AND public.current_user_has_permission('dms.documents.upload'))))) WITH CHECK (public.current_user_profile_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.dms_upload_sessions s WHERE s.id = upload_session_id AND s.deleted_at IS NULL AND ((public.current_user_has_permission('dms.documents.review_ai') OR public.current_user_has_permission('dms.admin')) OR (s.uploaded_by = public.current_user_profile_id() AND public.current_user_has_permission('dms.documents.upload')))));
CREATE POLICY f01_intake_delete ON public.dms_intake_review_values FOR DELETE TO authenticated USING (public.current_user_profile_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.dms_upload_sessions s WHERE s.id = upload_session_id AND s.deleted_at IS NULL AND ((public.current_user_has_permission('dms.documents.review_ai') OR public.current_user_has_permission('dms.admin')) OR (s.uploaded_by = public.current_user_profile_id() AND public.current_user_has_permission('dms.documents.upload')))));
CREATE OR REPLACE FUNCTION public.approve_dms_ai_intake(p_payload jsonb)
 RETURNS TABLE(out_document_id bigint, out_document_no text, out_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id BIGINT;
  v_mode TEXT := COALESCE(p_payload->>'mode', 'single_file_new_document');
  v_upload_session_id BIGINT := NULLIF(p_payload->>'upload_session_id', '')::BIGINT;
  v_approve_run_id BIGINT := NULLIF(p_payload->>'approve_run_id', '')::BIGINT;
  v_ai_result_id BIGINT := NULLIF(p_payload->>'ai_result_id', '')::BIGINT;
  v_document_id BIGINT := NULLIF(p_payload->>'document_id', '')::BIGINT;
  v_document_no TEXT := NULLIF(p_payload->>'document_no', '');
  v_now TIMESTAMPTZ := now();
  v_session public.dms_upload_sessions%ROWTYPE;
  v_existing_document_no TEXT;
  v_version_id BIGINT;
  v_file_id BIGINT;
  v_item JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_actor_id := current_user_profile_id();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    current_user_has_permission('dms.documents.upload')
    OR current_user_has_permission('dms.documents.review_ai')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  ) THEN
    RAISE EXCEPTION 'Permission denied for DMS AI intake approval' USING ERRCODE = '42501';
  END IF;

  IF v_upload_session_id IS NULL THEN
    RAISE EXCEPTION 'upload_session_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_session
  FROM public.dms_upload_sessions
  WHERE id = v_upload_session_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Upload session not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.uploaded_by IS DISTINCT FROM v_actor_id AND NOT (
    public.current_user_has_permission('dms.documents.review_ai') OR public.current_user_has_permission('dms.admin')
  ) THEN RAISE EXCEPTION 'Upload session access denied' USING ERRCODE = '42501'; END IF;

  IF v_session.intake_status = 'approved' AND v_session.document_id IS NOT NULL THEN
    SELECT d.document_no
    INTO v_existing_document_no
    FROM public.dms_documents d
    WHERE d.id = v_session.document_id;

    IF v_approve_run_id IS NOT NULL THEN
      UPDATE public.dms_approve_runs
      SET status = 'already_approved',
          stage = 'approve_save_already_approved',
          document_id = v_session.document_id,
          completed_at = v_now,
          updated_at = v_now,
          metadata_json = COALESCE(metadata_json, '{}'::jsonb) || jsonb_build_object('returned_existing_document', true)
      WHERE id = v_approve_run_id;
    END IF;

    RETURN QUERY SELECT v_session.document_id, v_existing_document_no, 'already_approved'::TEXT;
    RETURN;
  END IF;

  IF v_session.intake_status IN ('discarded', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'Upload session is not eligible for approval: %', v_session.intake_status USING ERRCODE = '22023';
  END IF;

  IF v_session.approve_status = 'processing'
     AND v_session.approve_run_id IS NOT NULL
     AND (v_approve_run_id IS NULL OR v_session.approve_run_id <> v_approve_run_id) THEN
    RAISE EXCEPTION 'Approval is already in progress for this upload session' USING ERRCODE = '55P03';
  END IF;

  IF v_mode NOT IN ('single_file_new_document', 'existing_batch_draft') THEN
    RAISE EXCEPTION 'Unsupported approve mode: %', v_mode USING ERRCODE = '22023';
  END IF;

  IF v_document_no IS NULL THEN
    RAISE EXCEPTION 'document_no is required' USING ERRCODE = '22023';
  END IF;

  IF v_mode = 'single_file_new_document' THEN
    IF v_document_id IS NULL THEN
      RAISE EXCEPTION 'reserved document_id is required for single file approval' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.dms_documents (
      id,
      document_no,
      title,
      description,
      document_type_id,
      category_id,
      status,
      confidentiality_level,
      owner_user_id,
      owning_company_id,
      owning_branch_id,
      party_id,
      issue_date,
      expiry_date,
      created_by,
      created_at,
      updated_by,
      updated_at
    )
    OVERRIDING SYSTEM VALUE
    VALUES (
      v_document_id,
      v_document_no,
      p_payload->>'title',
      NULLIF(p_payload->>'description', ''),
      (p_payload->>'document_type_id')::BIGINT,
      (p_payload->>'category_id')::BIGINT,
      'active',
      COALESCE(NULLIF(p_payload->>'confidentiality_level', ''), 'internal'),
      v_actor_id,
      NULLIF(p_payload->>'owning_company_id', '')::BIGINT,
      NULLIF(p_payload->>'owning_branch_id', '')::BIGINT,
      NULLIF(p_payload->>'party_id', '')::BIGINT,
      NULLIF(p_payload->>'issue_date', '')::DATE,
      NULLIF(p_payload->>'expiry_date', '')::DATE,
      v_actor_id,
      v_now,
      v_actor_id,
      v_now
    );
  ELSE
    v_document_id := COALESCE(v_document_id, v_session.document_id);
    IF v_document_id IS NULL THEN
      RAISE EXCEPTION 'document_id is required for batch draft approval' USING ERRCODE = '22023';
    END IF;

    UPDATE public.dms_documents
    SET title = p_payload->>'title',
        description = NULLIF(p_payload->>'description', ''),
        document_type_id = (p_payload->>'document_type_id')::BIGINT,
        category_id = (p_payload->>'category_id')::BIGINT,
        status = 'active',
        confidentiality_level = COALESCE(NULLIF(p_payload->>'confidentiality_level', ''), confidentiality_level, 'internal'),
        owning_company_id = NULLIF(p_payload->>'owning_company_id', '')::BIGINT,
        owning_branch_id = NULLIF(p_payload->>'owning_branch_id', '')::BIGINT,
        party_id = NULLIF(p_payload->>'party_id', '')::BIGINT,
        issue_date = NULLIF(p_payload->>'issue_date', '')::DATE,
        expiry_date = NULLIF(p_payload->>'expiry_date', '')::DATE,
        updated_by = v_actor_id,
        updated_at = v_now
    WHERE id = v_document_id
      AND deleted_at IS NULL
      AND status = 'pending_ai_review';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch draft document is not eligible for approval' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF COALESCE((p_payload->>'create_file_version')::BOOLEAN, true) THEN
    INSERT INTO public.dms_document_versions (
      document_id,
      version_number,
      version_label,
      change_notes,
      is_current,
      created_by,
      created_at
    )
    VALUES (
      v_document_id,
      COALESCE(NULLIF(p_payload->>'version_number', '')::INT, 1),
      COALESCE(NULLIF(p_payload->>'version_label', ''), 'v1'),
      COALESCE(NULLIF(p_payload->>'change_notes', ''), 'Created from AI intake'),
      true,
      v_actor_id,
      v_now
    )
    RETURNING id INTO v_version_id;

    INSERT INTO public.dms_document_files (
      document_id,
      version_id,
      file_role,
      storage_bucket,
      storage_path,
      file_name,
      mime_type,
      file_size_bytes,
      sha256_hash,
      created_by,
      created_at
    )
    VALUES (
      v_document_id,
      v_version_id,
      'original',
      p_payload->>'final_storage_bucket',
      p_payload->>'final_storage_path',
      p_payload->>'file_name',
      p_payload->>'mime_type',
      (p_payload->>'file_size_bytes')::BIGINT,
      NULLIF(p_payload->>'sha256_hash', ''),
      v_actor_id,
      v_now
    )
    RETURNING id INTO v_file_id;

    UPDATE public.dms_documents
    SET current_version_id = v_version_id,
        updated_by = v_actor_id,
        updated_at = v_now
    WHERE id = v_document_id;
  ELSE
    v_file_id := NULLIF(p_payload->>'file_id', '')::BIGINT;
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'metadata_values', '[]'::jsonb))
  LOOP
    INSERT INTO public.dms_document_metadata_values (
      document_id,
      definition_id,
      value_text,
      value_number,
      value_date,
      value_datetime,
      value_boolean,
      value_json,
      created_by,
      created_at,
      updated_by,
      updated_at
    )
    VALUES (
      v_document_id,
      (v_item->>'definition_id')::BIGINT,
      NULLIF(v_item->>'value_text', ''),
      NULLIF(v_item->>'value_number', '')::NUMERIC,
      NULLIF(v_item->>'value_date', '')::DATE,
      NULLIF(v_item->>'value_datetime', '')::TIMESTAMPTZ,
      CASE WHEN v_item ? 'value_boolean' THEN (v_item->>'value_boolean')::BOOLEAN ELSE NULL END,
      CASE WHEN v_item ? 'value_json' THEN v_item->'value_json' ELSE NULL END,
      v_actor_id,
      v_now,
      v_actor_id,
      v_now
    )
    ON CONFLICT (document_id, definition_id)
    DO UPDATE SET
      value_text = EXCLUDED.value_text,
      value_number = EXCLUDED.value_number,
      value_date = EXCLUDED.value_date,
      value_datetime = EXCLUDED.value_datetime,
      value_boolean = EXCLUDED.value_boolean,
      value_json = EXCLUDED.value_json,
      updated_by = EXCLUDED.updated_by,
      updated_at = EXCLUDED.updated_at,
      deleted_at = NULL;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'tag_ids', '[]'::jsonb))
  LOOP
    INSERT INTO public.dms_document_tags (document_id, tag_id, created_by, created_at)
    VALUES (v_document_id, (v_item #>> '{}')::BIGINT, v_actor_id, v_now)
    ON CONFLICT (document_id, tag_id) DO NOTHING;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'links', '[]'::jsonb))
  LOOP
    INSERT INTO public.dms_document_links (
      document_id,
      entity_type,
      entity_id,
      link_role,
      is_primary,
      linked_by,
      linked_at,
      created_at,
      deleted_at
    )
    SELECT
      v_document_id,
      v_item->>'entity_type',
      (v_item->>'entity_id')::BIGINT,
      COALESCE(NULLIF(v_item->>'link_role', ''), 'related'),
      COALESCE((v_item->>'is_primary')::BOOLEAN, false),
      v_actor_id,
      v_now,
      v_now,
      NULL
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.dms_document_links l
      WHERE l.document_id = v_document_id
        AND l.entity_type = v_item->>'entity_type'
        AND l.entity_id = (v_item->>'entity_id')::BIGINT
        AND l.deleted_at IS NULL
    );
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'reminders', '[]'::jsonb))
  LOOP
    INSERT INTO public.dms_expiry_reminders (
      document_id,
      reminder_days_before,
      reminder_date,
      status,
      updated_at
    )
    VALUES (
      v_document_id,
      (v_item->>'reminder_days_before')::INT,
      (v_item->>'reminder_date')::DATE,
      COALESCE(NULLIF(v_item->>'status', ''), 'pending'),
      v_now
    )
    ON CONFLICT (document_id, reminder_days_before)
    DO UPDATE SET
      reminder_date = EXCLUDED.reminder_date,
      status = EXCLUDED.status,
      updated_at = EXCLUDED.updated_at;
  END LOOP;

  IF v_ai_result_id IS NOT NULL THEN
    UPDATE public.dms_ai_extraction_results
    SET ai_status = 'accepted',
        review_action = 'accepted',
        reviewed_by = v_actor_id,
        reviewed_at = v_now,
        document_id = v_document_id
    WHERE id = v_ai_result_id;
  END IF;

  UPDATE public.dms_upload_sessions
  SET status = 'completed',
      intake_status = 'approved',
      review_status = 'approved',
      document_id = v_document_id,
      approve_run_id = v_approve_run_id,
      approve_status = 'completed',
      approve_error = NULL,
      approved_at = v_now,
      review_completed_at = v_now,
      reviewed_by = v_actor_id,
      completed_at = v_now,
      updated_at = v_now
  WHERE id = v_upload_session_id;

  INSERT INTO public.dms_document_events (
    document_id,
    event_type,
    description,
    performed_by,
    performed_at,
    metadata_json
  )
  VALUES
    (
      v_document_id,
      CASE WHEN v_mode = 'existing_batch_draft' THEN 'batch_draft_approved' ELSE 'document_created_from_ai_intake' END,
      CASE WHEN v_mode = 'existing_batch_draft'
        THEN 'AI batch draft approved through transactional approve flow'
        ELSE 'Document created from AI intake through transactional approve flow'
      END,
      v_actor_id,
      v_now,
      jsonb_build_object('upload_session_id', v_upload_session_id, 'ai_result_id', v_ai_result_id, 'approve_run_id', v_approve_run_id)
    ),
    (
      v_document_id,
      'approve_save_db_transaction_completed',
      'Approve & Save core DB transaction completed',
      v_actor_id,
      v_now,
      jsonb_build_object('approve_run_id', v_approve_run_id, 'file_id', v_file_id, 'version_id', v_version_id)
    ),
    (
      v_document_id,
      'file_uploaded',
      'File attached from AI intake approval',
      v_actor_id,
      v_now,
      jsonb_build_object('file_id', v_file_id, 'version_id', v_version_id, 'storage_path', p_payload->>'final_storage_path')
    );

  IF COALESCE(jsonb_array_length(COALESCE(p_payload->'metadata_values', '[]'::jsonb)), 0) > 0 THEN
    INSERT INTO public.dms_document_events (
      document_id,
      event_type,
      description,
      performed_by,
      performed_at,
      metadata_json
    )
    VALUES (
      v_document_id,
      'metadata_updated',
      'Metadata saved from AI intake approval',
      v_actor_id,
      v_now,
      jsonb_build_object('metadata_count', jsonb_array_length(COALESCE(p_payload->'metadata_values', '[]'::jsonb)))
    );
  END IF;

  UPDATE public.dms_approve_runs
  SET status = 'db_committed',
      stage = 'approve_save_db_transaction_completed',
      document_id = v_document_id,
      ai_result_id = COALESCE(v_ai_result_id, ai_result_id),
      final_storage_bucket = COALESCE(NULLIF(p_payload->>'final_storage_bucket', ''), final_storage_bucket),
      final_storage_path = COALESCE(NULLIF(p_payload->>'final_storage_path', ''), final_storage_path),
      metadata_json = COALESCE(metadata_json, '{}'::jsonb)
        || jsonb_build_object(
          'mode', v_mode,
          'file_id', v_file_id,
          'version_id', v_version_id,
          'metadata_count', jsonb_array_length(COALESCE(p_payload->'metadata_values', '[]'::jsonb)),
          'tag_count', jsonb_array_length(COALESCE(p_payload->'tag_ids', '[]'::jsonb)),
          'link_count', jsonb_array_length(COALESCE(p_payload->'links', '[]'::jsonb))
        ),
      error_code = NULL,
      error_message = NULL,
      updated_at = v_now
  WHERE id = v_approve_run_id;

  RETURN QUERY SELECT v_document_id, v_document_no, 'db_committed'::TEXT;
END;
$function$;

-- Email secret administrators may update only the reference/preview via the server.
-- The server performs the permission check and service-role write; no broad client config write is granted.
NOTIFY pgrst, 'reload schema';
COMMIT;
