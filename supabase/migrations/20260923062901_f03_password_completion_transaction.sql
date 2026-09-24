BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE OR REPLACE FUNCTION public.f03_complete_password_operation(operation_id uuid, flow_hash text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE op public.erp_auth_password_operations; p public.user_profiles; v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO op FROM public.erp_auth_password_operations WHERE id=operation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF op.stage='completed' THEN RETURN true; END IF;
  IF op.stage <> 'provider_completed' OR op.provider_completed_at IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
    WHERE s.id=op.session_id AND s.user_id=op.auth_user_id AND (s.not_after IS NULL OR s.not_after>v_now)
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<v_now)) THEN RETURN false; END IF;
  SELECT * INTO p FROM public.user_profiles WHERE id=op.profile_id AND auth_user_id=op.auth_user_id FOR UPDATE;
  IF NOT FOUND OR p.status <> 'active' OR p.last_password_security_action_at IS DISTINCT FROM op.security_version THEN RETURN false; END IF;
  IF op.mode='recovery' THEN
    UPDATE public.erp_auth_flow_grants SET consumed_at=v_now WHERE token_hash=flow_hash AND auth_user_id=op.auth_user_id
      AND session_id=op.session_id AND consumed_at IS NULL AND expires_at>v_now;
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;
  UPDATE public.user_profiles SET must_change_password=false, must_change_password_reason=NULL,
    password_changed_at=op.provider_completed_at, last_password_security_action='password_change_completed',
    last_password_security_action_at=v_now, last_password_security_action_by=p.id, updated_at=v_now WHERE id=p.id;
  INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
    VALUES(p.id,p.owner_company_id,p.branch_id,'users','user_profiles',p.id,p.id::text,'USER_PASSWORD_CHANGED',
      jsonb_build_object('operation_id',op.id,'action_context',op.mode,'provider_completed',true));
  UPDATE public.erp_auth_password_operations SET stage='completed',completed_at=v_now WHERE id=op.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.f03_complete_password_operation(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f03_complete_password_operation(uuid,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
