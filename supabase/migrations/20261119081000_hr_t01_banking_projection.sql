BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION erp_private.t01_mask_banking(p_value text, p_prefix integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN length(value) <= p_prefix + 4 THEN repeat('*', length(value))
              ELSE left(value, p_prefix) || repeat('*', length(value) - p_prefix - 4) || right(value, 4) END
  FROM (SELECT regexp_replace(coalesce(p_value, ''), '[[:space:]]', '', 'g') AS value) cleaned;
$$;
REVOKE ALL ON FUNCTION erp_private.t01_mask_banking(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION erp_private.t01_mask_banking(text, integer) TO authenticated, service_role;

ALTER TABLE public.employee_wps_profiles
  ADD COLUMN iban_masked text GENERATED ALWAYS AS (erp_private.t01_mask_banking(iban, 2)) STORED,
  ADD COLUMN account_number_masked text GENERATED ALWAYS AS (erp_private.t01_mask_banking(account_number, 0)) STORED,
  ADD COLUMN iban_state text GENERATED ALWAYS AS (
    CASE WHEN nullif(regexp_replace(coalesce(iban, ''), '[[:space:]]', '', 'g'), '') IS NULL THEN 'missing'
         WHEN erp_private.valid_uae_iban(iban) THEN 'valid' ELSE 'invalid' END
  ) STORED;

REVOKE SELECT ON public.employee_wps_profiles FROM PUBLIC, anon, authenticated;
REVOKE SELECT (iban, account_number) ON public.employee_wps_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, employee_id, wps_applicable, wps_status, bank_id, account_holder_name, exchange_house,
  salary_payment_method, labour_card_number, mohre_person_code, mohre_establishment_id, salary_effective_date,
  created_at, updated_at, created_by, updated_by, deleted_at, deleted_by, workspace_revision,
  iban_masked, account_number_masked, iban_state) ON public.employee_wps_profiles TO authenticated;

ALTER POLICY emp_wps_profile_select ON public.employee_wps_profiles USING (
  deleted_at IS NULL
  AND employee_id IN (SELECT erp_private.readable_employee_ids())
  AND employee_id IN (SELECT erp_private.payroll_subject_ids('hr.payroll.view'))
  AND employee_id IN (SELECT erp_private.payroll_subject_ids('hr.banking.view'))
);

-- Update only the existing guarded read/write paths that used the raw columns.
DO $$
DECLARE
  def text;
  patched text;
BEGIN
  def := pg_get_functiondef('public.f12_payroll_readiness_facts(bigint[],date)'::regprocedure);
  patched := replace(def, 'NOT erp_private.valid_uae_iban(w.iban)', 'w.iban_state <> ''valid''');
  IF def = patched OR patched ~ 'w\.iban\W' THEN RAISE EXCEPTION 'Unexpected readiness definition'; END IF;
  EXECUTE patched;

  def := pg_get_functiondef('public.perf_hr_payroll_inquiry(text,integer,integer,text,text,bigint,bigint,text,boolean,jsonb,jsonb)'::regprocedure);
  patched := replace(def, 'COALESCE(pg_catalog.btrim(w.iban,v_trim_chars) <> '''',false) AS has_iban', 'w.iban_state = ''valid'' AS has_iban');
  IF def = patched OR patched ~ 'w\.iban\W' THEN RAISE EXCEPTION 'Unexpected WPS inquiry definition'; END IF;
  EXECUTE patched;

  def := pg_get_functiondef('public.f11_mutate_payroll_child(text,bigint,bigint,bigint,uuid,text,jsonb)'::regprocedure);
  patched := replace(def, $old$  EXECUTE format('SELECT to_jsonb(r)FROM public.%I r WHERE id=$1 AND employee_id=$2 AND deleted_at IS NULL FOR UPDATE',table_name)INTO existing USING p_id,p_employee;$old$,
$new$  IF p_kind='wps-profile' THEN
    SELECT jsonb_build_object('workspace_revision', w.workspace_revision, 'created_by', w.created_by, 'mohre_establishment_id', w.mohre_establishment_id)
      INTO existing FROM public.employee_wps_profiles w WHERE w.id=p_id AND w.employee_id=p_employee AND w.deleted_at IS NULL FOR UPDATE;
  ELSE
    EXECUTE format('SELECT to_jsonb(r)FROM public.%I r WHERE id=$1 AND employee_id=$2 AND deleted_at IS NULL FOR UPDATE',table_name)INTO existing USING p_id,p_employee;
  END IF;$new$);
  IF def = patched THEN RAISE EXCEPTION 'Unexpected payroll mutation opening'; END IF;
  def := patched;
  patched := replace(def, $old$  EXECUTE format('SELECT to_jsonb(r)FROM public.%I r WHERE employee_id=$1',table_name)INTO existing USING p_employee;$old$,
$new$  IF p_kind='wps-profile' THEN
    SELECT jsonb_build_object('id',w.id) INTO existing FROM public.employee_wps_profiles w WHERE w.employee_id=p_employee AND w.deleted_at IS NULL;
  ELSE
    EXECUTE format('SELECT to_jsonb(r)FROM public.%I r WHERE employee_id=$1',table_name)INTO existing USING p_employee;
  END IF;$new$);
  IF def = patched THEN RAISE EXCEPTION 'Unexpected payroll profile existence check'; END IF;
  def := patched;
  patched := replace(def, ' columns:=erp_private.f11_payroll_columns(p_kind);typed:=',
$new$ columns:=erp_private.f11_payroll_columns(p_kind);
 IF p_kind='wps-profile' AND p_action='update' THEN
   SELECT array_agg(c ORDER BY position) INTO columns FROM unnest(columns) WITH ORDINALITY c(c,position)
   WHERE c NOT IN ('iban','account_number') OR p_data ? c;
 END IF;
 typed:=$new$);
  IF def = patched THEN RAISE EXCEPTION 'Unexpected payroll field assignment'; END IF;
  def := patched;
  patched := replace(def, $old$  IF p_action='archive'THEN EXECUTE format('UPDATE public.%I SET deleted_at=clock_timestamp(),deleted_by=$1,updated_by=$1 WHERE id=$2 RETURNING id,workspace_revision',table_name)INTO target,revision USING actor,p_id;$old$,
$new$  IF p_action='archive' AND p_kind='wps-profile' THEN
    UPDATE public.employee_wps_profiles SET deleted_at=clock_timestamp(),deleted_by=actor,updated_by=actor WHERE id=p_id;
    IF FOUND THEN target:=p_id;revision:=p_revision+1;END IF;
  ELSIF p_action='archive'THEN EXECUTE format('UPDATE public.%I SET deleted_at=clock_timestamp(),deleted_by=$1,updated_by=$1 WHERE id=$2 RETURNING id,workspace_revision',table_name)INTO target,revision USING actor,p_id;$new$);
  IF def = patched THEN RAISE EXCEPTION 'Unexpected payroll archive path'; END IF;
  EXECUTE patched;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;

