BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- PostgreSQL can enforce SELECT visibility on the new row of an UPDATE.
-- Preserve the original guarded archive workflow without making deleted rows readable.
CREATE FUNCTION erp_private.t01_archive_wps_profile(p_employee bigint, p_id bigint, p_revision bigint, p_operation uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  context jsonb := nullif(current_setting('erp.f11_child_save',true),'')::jsonb;
  actor bigint;
  new_revision bigint;
BEGIN
  IF NOT erp_private.f11_child_authorized('wps-profile',p_employee) OR p_operation IS NULL
     OR context->>'kind' IS DISTINCT FROM 'wps-profile' OR context->>'action' IS DISTINCT FROM 'archive'
     OR (context->>'employee_id')::bigint IS DISTINCT FROM p_employee OR (context->>'id')::bigint IS DISTINCT FROM p_id
     OR (context->>'revision')::bigint IS DISTINCT FROM p_revision OR (context->>'operation_id')::uuid IS DISTINCT FROM p_operation
     OR context->>'hash' IS DISTINCT FROM encode(sha256(convert_to(jsonb_build_array('wps-profile',p_employee,p_id,p_revision,'archive','{}'::jsonb)::text,'UTF8')),'hex') THEN
    RAISE EXCEPTION 'Current admitted WPS archive required' USING ERRCODE='42501';
  END IF;
  actor := public.current_user_profile_id();
  IF actor IS NULL THEN RAISE EXCEPTION 'Current payroll actor required' USING ERRCODE='42501'; END IF;
  UPDATE public.employee_wps_profiles
     SET deleted_at=clock_timestamp(), deleted_by=actor, updated_by=actor
   WHERE id=p_id AND employee_id=p_employee AND workspace_revision=p_revision AND deleted_at IS NULL
  RETURNING workspace_revision INTO new_revision;
  IF new_revision IS NULL THEN RAISE EXCEPTION 'Original WPS profile changed' USING ERRCODE='P0409'; END IF;
  RETURN new_revision;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.t01_archive_wps_profile(bigint,bigint,bigint,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.t01_archive_wps_profile(bigint,bigint,bigint,uuid) TO authenticated;

DO $$
DECLARE
  def text := pg_get_functiondef('public.f11_mutate_payroll_child(text,bigint,bigint,bigint,uuid,text,jsonb)'::regprocedure);
  patched text;
BEGIN
  patched := replace(def,
$old$    UPDATE public.employee_wps_profiles SET deleted_at=clock_timestamp(),deleted_by=actor,updated_by=actor WHERE id=p_id;
    IF FOUND THEN target:=p_id;revision:=p_revision+1;END IF;$old$,
$new$    revision:=erp_private.t01_archive_wps_profile(p_employee,p_id,p_revision,p_operation);
    target:=p_id;$new$);
  IF def = patched THEN RAISE EXCEPTION 'Unexpected WPS archive implementation'; END IF;
  EXECUTE patched;
END;
$$;
COMMIT;

