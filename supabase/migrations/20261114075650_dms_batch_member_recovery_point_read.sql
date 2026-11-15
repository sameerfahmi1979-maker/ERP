BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';

-- Keep the complete admission and current-scope checks. Read the selected
-- member's immutable seal under caller RLS instead of reading sibling seals.
CREATE FUNCTION erp_private.read_dms_batch_draft_member(p_admission_operation uuid, p_session bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  receipt jsonb;
  expected jsonb;
  source record;
  sealed jsonb;
  member jsonb;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed'
    OR auth.uid() IS NULL OR NOT erp_private.business_principal_is_active()
    OR NOT public.current_user_has_permission('numbering.rules.generate')
    OR NOT erp_private.upload_session_permission(p_session, 'dms.documents.upload') THEN
    RAISE EXCEPTION 'Batch recovery unavailable' USING ERRCODE = '42501';
  END IF;

  receipt := public.read_dms_upload_batch_admission(p_admission_operation);
  SELECT s.id, s.session_code, s.admission_position, s.batch_draft_operation_id,
    to_jsonb(p) AS preparation,
    CASE WHEN p.upload_session_id IS NULL THEN erp_private.batch_draft_preparation_exists(s.id)
      ELSE true END AS has_seal
  INTO source
  FROM public.dms_upload_sessions s
  LEFT JOIN LATERAL (
    SELECT prepared.* FROM erp_private.dms_batch_draft_preparations prepared
    WHERE prepared.upload_session_id = s.id OFFSET 0
  ) p ON true
  WHERE s.id = p_session AND s.batch_id = (receipt->>'batch_id')::bigint
    AND s.deleted_at IS NULL AND s.batch_draft_operation_id IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch recovery unavailable' USING ERRCODE = '42501';
  END IF;
  expected := receipt->'members'->source.admission_position;
  IF expected->'position' IS DISTINCT FROM to_jsonb(source.admission_position)
    OR expected->'id' IS DISTINCT FROM to_jsonb(source.id)
    OR expected->'code' IS DISTINCT FROM to_jsonb(source.session_code) THEN
    RAISE EXCEPTION 'Invalid recovery source' USING ERRCODE = 'PT409';
  END IF;

  member := jsonb_build_object('position',source.admission_position,'upload_session_id',source.id,
    'session_code',source.session_code,'draft_operation_id',source.batch_draft_operation_id);
  sealed := source.preparation;
  IF source.has_seal THEN
    IF sealed IS NULL THEN
      RAISE EXCEPTION 'Batch preparation unavailable' USING ERRCODE = '42501';
    END IF;
    IF sealed->'upload_session_id' IS DISTINCT FROM expected->'id'
      OR sealed->'draft_operation_id' IS DISTINCT FROM to_jsonb(source.batch_draft_operation_id)
      OR sealed->'auth_user_id' IS DISTINCT FROM receipt->'auth_user_id'
      OR sealed->'profile_id' IS DISTINCT FROM receipt->'profile_id'
      OR sealed->'batch_id' IS DISTINCT FROM receipt->'batch_id'
      OR sealed->'admission_operation_id' IS DISTINCT FROM receipt->'operation_id'
      OR sealed->'admission_fingerprint' IS DISTINCT FROM receipt->'fingerprint'
      OR sealed->'admission_position' IS DISTINCT FROM expected->'position'
      OR sealed#>'{request_json,uploadSessionId}' IS DISTINCT FROM expected->'id'
      OR sealed#>'{request_json,allowDuplicate}' IS DISTINCT FROM 'false'::jsonb
      OR sealed#>'{request_json,prepared,session_code}' IS DISTINCT FROM expected->'code'
      OR sealed#>'{request_json,prepared,owning_company_id}' IS DISTINCT FROM receipt->'company_id'
      OR sealed#>'{request_json,prepared,owning_branch_id}' IS DISTINCT FROM receipt->'branch_id'
      OR sealed#>'{request_json,prepared,party_id}' IS DISTINCT FROM
        (CASE WHEN receipt#>>'{manifest,context,type}' = 'party'
          THEN coalesce(receipt#>'{manifest,context,id}', 'null'::jsonb) ELSE 'null'::jsonb END) THEN
      RAISE EXCEPTION 'Invalid retained preparation' USING ERRCODE = 'PT409';
    END IF;
    member := member || jsonb_build_object('kind','prepared','request',sealed->'request_json');
  ELSE
    member := member || jsonb_build_object('kind','unprepared','request',
      jsonb_build_object('uploadSessionId',source.id,'allowDuplicate',false));
  END IF;

  IF NOT erp_private.business_principal_is_active()
    OR NOT public.current_user_has_permission('numbering.rules.generate')
    OR receipt IS DISTINCT FROM public.read_dms_upload_batch_admission(p_admission_operation) THEN
    RAISE EXCEPTION 'Batch recovery unavailable' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('version',1,'admission_operation_id',receipt->'operation_id',
    'admission_fingerprint',receipt->'fingerprint','auth_user_id',receipt->'auth_user_id',
    'profile_id',receipt->'profile_id','batch_id',receipt->'batch_id',
    'owning_company_id',receipt->'company_id','owning_branch_id',receipt->'branch_id','member',member);
END
$$;

REVOKE ALL ON FUNCTION erp_private.read_dms_batch_draft_member(uuid,bigint) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION erp_private.read_dms_batch_draft_member(uuid,bigint) TO authenticated;

-- Preserve the existing authorization fences, transaction order, locks, and
-- reconciliation checks. Change the selector at each guarded call site.
DO $guard$
DECLARE routine record; definition text; matched integer;
BEGIN
  FOR routine IN SELECT * FROM (VALUES
    ('public.prepare_recoverable_dms_batch_draft(bigint)', '0f5d432436cde4b5f4b835b0e1b0167b', 's.admission_operation_id', 'p_session', 2),
    ('erp_private.batch_draft_preparation_guard()', 'd32e967ab3db59a72c6b876da8f6781f', 's.admission_operation_id', 'new.upload_session_id', 1),
    ('public.create_numbered_dms_batch_draft(uuid,jsonb)', '78890da94c53e72c0b2cd04afb8ac117', 'admission_op', 'session_id', 4)
  ) AS routines(signature, body_hash, operation, session_selector, site_count) LOOP
    SELECT pg_get_functiondef(oid) INTO STRICT definition
    FROM pg_proc WHERE oid = to_regprocedure(routine.signature)
      AND md5(replace(prosrc, E'\r\n', E'\n')) = routine.body_hash
      AND NOT prosecdef AND proowner = 'postgres'::regrole
      AND proconfig = ARRAY['search_path=""'];
    SELECT count(*) INTO matched FROM regexp_matches(definition, 'recovery:=public.read_dms_batch_draft_recovery\(', 'g');
    IF matched <> routine.site_count THEN
      RAISE EXCEPTION 'Unexpected batch member read: %', routine.signature;
    END IF;
    definition := replace(definition,
      format('recovery:=public.read_dms_batch_draft_recovery(%s);',routine.operation),
      format('recovery:=erp_private.read_dms_batch_draft_member(%s,%s);',routine.operation,routine.session_selector));
    definition := replace(definition,
      format('select value into member from jsonb_array_elements(recovery->''members'') where (value->>''upload_session_id'')::bigint=%s;',routine.session_selector),
      'member:=recovery->''member'';');
    definition := replace(definition, '(recovery-''members'')', '(recovery-''member'')');
    IF strpos(definition, 'jsonb_array_elements(recovery->''members'')') <> 0 THEN
      RAISE EXCEPTION 'Unexpected batch member projection: %', routine.signature;
    END IF;
    EXECUTE definition;
  END LOOP;
END;
$guard$;

COMMIT;
