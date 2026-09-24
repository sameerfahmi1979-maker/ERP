BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.f03_apply_permission_batch(changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c jsonb; r public.roles; p public.permissions; output jsonb := '[]'::jsonb;
  actor bigint := public.current_user_profile_id(); expected boolean; actual boolean;
BEGIN
  IF NOT public.current_user_has_permission('roles.manage') OR NOT erp_private.business_principal_is_active() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(changes) IS DISTINCT FROM 'array' OR jsonb_array_length(changes)<1 OR jsonb_array_length(changes)>500 THEN RAISE EXCEPTION 'Invalid batch'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(changes) x GROUP BY x->>'roleId',x->>'permissionId' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate change'; END IF;
  -- Consistent lock order prevents two multi-role reviews from deadlocking.
  PERFORM id FROM public.roles WHERE id IN (SELECT (x->>'roleId')::bigint FROM jsonb_array_elements(changes) x) ORDER BY id FOR UPDATE;
  FOR c IN SELECT value FROM jsonb_array_elements(changes) LOOP
    IF c->>'action' NOT IN ('grant','revoke') OR c->>'action' IS NULL THEN RAISE EXCEPTION 'Invalid action'; END IF;
    SELECT * INTO STRICT r FROM public.roles WHERE id=(c->>'roleId')::bigint;
    SELECT * INTO STRICT p FROM public.permissions WHERE id=(c->>'permissionId')::bigint;
    IF r.is_system_role AND NOT public.current_user_is_global_admin() THEN RAISE EXCEPTION 'Global administrator required' USING ERRCODE='42501'; END IF;
    IF c ? 'expectedAssigned' AND jsonb_typeof(c->'expectedAssigned') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid review state'; END IF;
    expected := COALESCE((c->>'expectedAssigned')::boolean,c->>'action'='revoke');
    SELECT EXISTS(SELECT 1 FROM public.role_permissions WHERE role_id=r.id AND permission_id=p.id) INTO actual;
    IF expected IS DISTINCT FROM actual OR expected=(c->>'action'='grant') THEN
      -- Business conflict, not a transient serialization error to auto-retry.
      RAISE EXCEPTION 'Permission changed since review. No changes applied; reload and review again.' USING ERRCODE='P0001';
    END IF;
    IF c->>'action'='grant' THEN
      IF NOT p.is_active THEN RAISE EXCEPTION 'Inactive permission'; END IF;
      INSERT INTO public.role_permissions(role_id,permission_id) VALUES(r.id,p.id);
    ELSE
      DELETE FROM public.role_permissions WHERE role_id=r.id AND permission_id=p.id;
    END IF;
    INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
      VALUES(actor,'roles','role_permissions',r.id,r.role_code,'ROLE_PERMISSION_CHANGED',jsonb_build_object('permission_id',p.id,'permission_code',p.permission_code,'action',c->>'action','previously_assigned',actual));
    output := output || jsonb_build_array(jsonb_build_object('roleId',r.id,'permissionId',p.id,'action',c->>'action','success',true));
  END LOOP;
  RETURN output;
END $$;
REVOKE ALL ON FUNCTION public.f03_apply_permission_batch(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f03_apply_permission_batch(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
