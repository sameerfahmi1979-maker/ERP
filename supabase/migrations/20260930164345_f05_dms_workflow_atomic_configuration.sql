-- F05 UI-02 / F07-T04: one transaction for configuration, not delete/reinsert.
-- SECURITY INVOKER intentionally retains all F03 principal and table policies.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.f05_save_dms_workflow(
  p_id bigint, p_expected_updated_at timestamptz, p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_id bigint; v_actor bigint; v_old public.dms_document_workflows;
  v_step jsonb; v_steps jsonb; v_code text; v_type bigint;
  v_step_count integer; v_initial integer; v_final integer;
BEGIN
  IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active()
     OR NOT (public.current_user_is_global_admin()
       OR public.current_user_has_permission('dms.admin')
       OR public.current_user_has_permission('dms.approvals.admin')) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;
  v_actor := public.current_user_profile_id();
  IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text) > 100000 THEN
    RAISE EXCEPTION 'Invalid workflow input' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.dms_document_workflows WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Workflow unavailable' USING ERRCODE = 'P0002'; END IF;
    IF p_expected_updated_at IS NULL OR v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'Workflow changed; refresh before saving' USING ERRCODE = 'PT409';
    END IF;
    -- A pending approval may still rely on the current definition. Do not
    -- silently change its route/role/step mapping while it is being reviewed.
    IF p_input ?| ARRAY['steps','document_type_ids','is_active'] AND EXISTS (
      SELECT 1 FROM public.dms_document_approvals WHERE workflow_id=p_id AND is_current
    ) THEN RAISE EXCEPTION 'Workflow is in use by a pending approval' USING ERRCODE='55000'; END IF;
    v_id := p_id;
  END IF;
  IF (p_input ? 'name_en' OR p_id IS NULL) AND (length(btrim(p_input->>'name_en')) NOT BETWEEN 1 AND 200 OR p_input->>'name_en' IS NULL) THEN
    RAISE EXCEPTION 'Workflow name is required' USING ERRCODE='22023';
  END IF;
  IF p_id IS NULL AND (p_input->>'workflow_code' IS NULL OR p_input->>'workflow_code' !~ '^[A-Z0-9_]{1,100}$') THEN
    RAISE EXCEPTION 'Invalid workflow code' USING ERRCODE='22023';
  END IF;
  IF length(coalesce(p_input->>'name_ar','')) > 200 OR length(coalesce(p_input->>'description','')) > 1000 THEN
    RAISE EXCEPTION 'Workflow text is too long' USING ERRCODE='22023';
  END IF;
  IF p_input ? 'steps' OR p_id IS NULL THEN
    v_steps := p_input->'steps';
    IF jsonb_typeof(v_steps) IS DISTINCT FROM 'array' OR jsonb_array_length(v_steps) NOT BETWEEN 1 AND 50 THEN
      RAISE EXCEPTION 'Provide between one and fifty active steps' USING ERRCODE='22023';
    END IF;
    SELECT count(*),count(*) FILTER(WHERE (s->>'is_initial')::boolean),count(*) FILTER(WHERE (s->>'is_final')::boolean)
      INTO v_step_count,v_initial,v_final FROM jsonb_array_elements(v_steps) s;
    IF v_initial<>1 OR v_final<>1 OR NOT coalesce((v_steps->0->>'is_initial')::boolean,false)
      OR NOT coalesce((v_steps->(v_step_count-1)->>'is_final')::boolean,false) THEN
      RAISE EXCEPTION 'First step must be initial and last step must be final' USING ERRCODE='22023';
    END IF;
    IF (SELECT count(DISTINCT lower(btrim(s->>'step_code'))) FROM jsonb_array_elements(v_steps) s) <> v_step_count THEN
      RAISE EXCEPTION 'Step codes must be unique' USING ERRCODE='23505';
    END IF;
    FOR v_step IN SELECT value FROM jsonb_array_elements(v_steps) LOOP
      IF v_step->>'step_code' IS NULL OR length(btrim(v_step->>'step_code')) NOT BETWEEN 1 AND 100
        OR v_step->>'step_name' IS NULL OR length(btrim(v_step->>'step_name')) NOT BETWEEN 1 AND 200
        OR length(coalesce(v_step->>'requires_role',''))>100 THEN
        RAISE EXCEPTION 'Invalid approval step' USING ERRCODE='22023';
      END IF;
      IF nullif(btrim(v_step->>'requires_role'),'') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.roles WHERE role_code=btrim(v_step->>'requires_role') AND is_active
      ) THEN RAISE EXCEPTION 'Required role is unavailable' USING ERRCODE='22023'; END IF;
    END LOOP;
  END IF;
  IF p_input ? 'document_type_ids' THEN
    IF jsonb_typeof(p_input->'document_type_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'document_type_ids')>200 THEN
      RAISE EXCEPTION 'Invalid document type selection' USING ERRCODE='22023';
    END IF;
    -- The type lock serializes concurrent assignments through this endpoint.
    FOR v_type IN SELECT DISTINCT value::text::bigint FROM jsonb_array_elements(p_input->'document_type_ids') ORDER BY 1 LOOP
      PERFORM id FROM public.dms_document_types WHERE id=v_type AND deleted_at IS NULL AND is_active FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Document type is unavailable' USING ERRCODE='22023'; END IF;
      IF EXISTS(SELECT 1 FROM public.dms_workflow_document_types m JOIN public.dms_document_workflows w ON w.id=m.workflow_id
        WHERE m.document_type_id=v_type AND w.id IS DISTINCT FROM p_id AND w.is_active AND w.deleted_at IS NULL)
        AND coalesce((p_input->>'is_active')::boolean,v_old.is_active,true) THEN
        RAISE EXCEPTION 'Document type already has an active workflow' USING ERRCODE='23505';
      END IF;
    END LOOP;
  ELSIF p_id IS NOT NULL AND coalesce((p_input->>'is_active')::boolean,false) THEN
    FOR v_type IN SELECT document_type_id FROM public.dms_workflow_document_types WHERE workflow_id=p_id ORDER BY document_type_id LOOP
      PERFORM id FROM public.dms_document_types WHERE id=v_type FOR UPDATE;
      IF EXISTS(SELECT 1 FROM public.dms_workflow_document_types m JOIN public.dms_document_workflows w ON w.id=m.workflow_id
        WHERE m.document_type_id=v_type AND w.id<>p_id AND w.is_active AND w.deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Document type already has an active workflow' USING ERRCODE='23505';
      END IF;
    END LOOP;
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.dms_document_workflows(workflow_code,name_en,name_ar,description,is_active,created_by,updated_by)
    VALUES(p_input->>'workflow_code',btrim(p_input->>'name_en'),nullif(p_input->>'name_ar',''),nullif(p_input->>'description',''),coalesce((p_input->>'is_active')::boolean,true),v_actor,v_actor)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.dms_document_workflows SET
      name_en=CASE WHEN p_input?'name_en' THEN btrim(p_input->>'name_en') ELSE name_en END,
      name_ar=CASE WHEN p_input?'name_ar' THEN nullif(p_input->>'name_ar','') ELSE name_ar END,
      description=CASE WHEN p_input?'description' THEN nullif(p_input->>'description','') ELSE description END,
      is_active=coalesce((p_input->>'is_active')::boolean,is_active),updated_by=v_actor,updated_at=clock_timestamp()
    WHERE id=v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Workflow unavailable' USING ERRCODE='42501'; END IF;
  END IF;
  IF p_input ? 'document_type_ids' THEN
    DELETE FROM public.dms_workflow_document_types WHERE workflow_id=v_id;
    INSERT INTO public.dms_workflow_document_types(workflow_id,document_type_id)
      SELECT v_id,value::text::bigint FROM jsonb_array_elements(p_input->'document_type_ids');
  END IF;
  IF v_steps IS NOT NULL THEN
    UPDATE public.dms_document_workflow_steps SET is_active=false WHERE workflow_id=v_id;
    FOR v_step IN SELECT value FROM jsonb_array_elements(v_steps) LOOP
      v_code:=btrim(v_step->>'step_code');
      INSERT INTO public.dms_document_workflow_steps(workflow_id,step_code,step_name,is_initial,is_final,requires_role,sort_order,is_active)
      VALUES(v_id,v_code,btrim(v_step->>'step_name'),(v_step->>'is_initial')::boolean,(v_step->>'is_final')::boolean,
        nullif(btrim(v_step->>'requires_role'),''),(SELECT ordinality-1 FROM jsonb_array_elements(v_steps) WITH ORDINALITY s WHERE s.value=v_step),true)
      ON CONFLICT(workflow_id,step_code) DO UPDATE SET step_name=excluded.step_name,is_initial=excluded.is_initial,
        is_final=excluded.is_final,requires_role=excluded.requires_role,sort_order=excluded.sort_order,is_active=true;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('id',v_id);
END $$;
REVOKE ALL ON FUNCTION public.f05_save_dms_workflow(bigint,timestamptz,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f05_save_dms_workflow(bigint,timestamptz,jsonb) TO authenticated;

-- Configuration is global: scoped company capabilities do not confer this.
DROP POLICY IF EXISTS f05_workflow_admin ON public.dms_document_workflows;
CREATE POLICY f05_workflow_admin ON public.dms_document_workflows FOR ALL TO authenticated
 USING (public.current_user_has_permission('dms.approvals.admin')) WITH CHECK (public.current_user_has_permission('dms.approvals.admin'));
DROP POLICY IF EXISTS f05_workflow_steps_admin ON public.dms_document_workflow_steps;
CREATE POLICY f05_workflow_steps_admin ON public.dms_document_workflow_steps FOR ALL TO authenticated
 USING (public.current_user_has_permission('dms.approvals.admin')) WITH CHECK (public.current_user_has_permission('dms.approvals.admin'));
NOTIFY pgrst,'reload schema';
COMMIT;
