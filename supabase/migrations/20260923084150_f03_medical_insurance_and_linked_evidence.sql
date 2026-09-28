BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Insurance is medical information, not an implicit general-HR capability.
DO $$ DECLARE p record; predicate text; BEGIN
 FOR p IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='employee_medical_insurances' AND permissive='PERMISSIVE' LOOP
  predicate:=CASE WHEN p.cmd='SELECT' THEN 'public.current_user_can_view_employee_medical(employee_id)'
    ELSE 'public.current_user_can_manage_employee_medical(employee_id)' END;
  IF p.cmd NOT IN ('SELECT','INSERT','UPDATE','DELETE') THEN RAISE EXCEPTION 'Unreviewed insurance policy %',p.policyname; END IF;
  EXECUTE format('DROP POLICY %I ON public.employee_medical_insurances',p.policyname);
  EXECUTE format('CREATE POLICY %I ON public.employee_medical_insurances FOR %s TO authenticated%s%s',p.policyname,p.cmd,
    CASE WHEN p.cmd='INSERT' THEN '' ELSE ' USING ('||predicate||')' END,
    CASE WHEN p.cmd IN ('INSERT','UPDATE') THEN ' WITH CHECK ('||predicate||')' ELSE '' END);
 END LOOP;
END $$;

-- Dependents mix ordinary identity information and four medical fields. Prevent
-- direct-column reads/predicate oracles; a checked projection masks those fields.
REVOKE SELECT ON public.employee_dependents FROM PUBLIC,anon,authenticated;
REVOKE SELECT (medical_insurance_provider,medical_insurance_policy,medical_insurance_card,medical_insurance_expiry)
 ON public.employee_dependents FROM PUBLIC,anon,authenticated;
DO $$ DECLARE cols text; BEGIN
 SELECT string_agg(quote_ident(column_name),',' ORDER BY ordinal_position) INTO cols FROM information_schema.columns
 WHERE table_schema='public' AND table_name='employee_dependents' AND column_name NOT IN
 ('medical_insurance_provider','medical_insurance_policy','medical_insurance_card','medical_insurance_expiry');
 EXECUTE format('GRANT SELECT (%s) ON public.employee_dependents TO authenticated',cols);
END $$;
CREATE OR REPLACE FUNCTION erp_private.read_employee_dependents()
RETURNS SETOF public.employee_dependents LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (jsonb_populate_record(NULL::public.employee_dependents,
   CASE WHEN public.current_user_can_view_employee_medical(d.employee_id) THEN to_jsonb(d)
   ELSE to_jsonb(d)-ARRAY['medical_insurance_provider','medical_insurance_policy','medical_insurance_card','medical_insurance_expiry'] END)).*
 FROM public.employee_dependents d
 WHERE (SELECT auth.uid()) IS NOT NULL AND (SELECT erp_private.business_principal_is_active())
 AND d.deleted_at IS NULL AND public.current_user_can_view_employee(d.employee_id)
 AND erp_private.employee_permission(d.employee_id,'hr.compliance.view');
$$;
CREATE OR REPLACE FUNCTION public.f03_read_employee_dependents()
RETURNS SETOF public.employee_dependents LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM erp_private.read_employee_dependents();
$$;
REVOKE ALL ON FUNCTION erp_private.read_employee_dependents(),public.f03_read_employee_dependents() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.read_employee_dependents(),public.f03_read_employee_dependents() TO authenticated;
CREATE OR REPLACE FUNCTION erp_private.protect_dependent_medical_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE changed boolean;
BEGIN
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  changed:=NEW.medical_insurance_provider IS NOT NULL OR NEW.medical_insurance_policy IS NOT NULL
   OR NEW.medical_insurance_card IS NOT NULL OR NEW.medical_insurance_expiry IS NOT NULL;
 ELSE
  changed:=ROW(NEW.medical_insurance_provider,NEW.medical_insurance_policy,NEW.medical_insurance_card,NEW.medical_insurance_expiry,NEW.employee_id)
   IS DISTINCT FROM ROW(OLD.medical_insurance_provider,OLD.medical_insurance_policy,OLD.medical_insurance_card,OLD.medical_insurance_expiry,OLD.employee_id);
 END IF;
 IF changed AND NOT public.current_user_can_manage_employee_medical(NEW.employee_id) THEN
  RAISE EXCEPTION 'Separate medical permission required' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND changed AND NOT public.current_user_can_manage_employee_medical(OLD.employee_id) THEN
  RAISE EXCEPTION 'Separate medical permission required' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.protect_dependent_medical_fields() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f03_dependent_medical_fields BEFORE INSERT OR UPDATE ON public.employee_dependents
 FOR EACH ROW EXECUTE FUNCTION erp_private.protect_dependent_medical_fields();

-- Direct HR foreign keys are evidence links too. A missing generic DMS link must
-- never turn a confidential employee attachment into an ordinary document.
CREATE OR REPLACE FUNCTION erp_private.hr_document_evidence_allowed(document_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (SELECT erp_private.business_principal_is_active()) AND NOT EXISTS (
  SELECT 1 FROM (
   SELECT employee_id,ARRAY['hr.compliance.view'] caps FROM public.employee_access_cards WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.assignments.view'] FROM public.employee_assets WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.actions.view','hr.confidential.view'] FROM public.employee_disciplinary_records WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.eos.view'] FROM public.employee_eos_cases WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.actions.view'] FROM public.employee_hr_actions WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.compliance.view'] FROM public.employee_identity_documents WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.medical.view'] FROM public.employee_medical_insurances WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.medical.view'] FROM public.employee_medical_records WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.actions.view','hr.confidential.view'] FROM public.employee_performance_records WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.assignments.view'] FROM public.employee_ppe_issues WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.actions.view'] FROM public.employee_pro_processes WHERE related_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.compliance.view'] FROM public.employee_training_certificates WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.compliance.view'] FROM public.employee_dependents WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,CASE WHEN related_record_type IN ('medical_record','medical_insurance') THEN ARRAY['hr.medical.view'] ELSE ARRAY[]::text[] END
    FROM public.employee_document_links WHERE dms_document_id=$1 AND deleted_at IS NULL
  ) linked WHERE NOT public.current_user_can_view_employee(linked.employee_id)
   OR EXISTS(SELECT 1 FROM unnest(linked.caps) c WHERE NOT erp_private.employee_permission(linked.employee_id,c))
 );
$$;
REVOKE ALL ON FUNCTION erp_private.hr_document_evidence_allowed(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.hr_document_evidence_allowed(bigint) TO authenticated;
-- Preserve the reviewed classification/action logic, inserting this additional
-- object guard at an exact, asserted anchor rather than replacing other checks.
DO $$ DECLARE definition text; anchor text:='IF public.current_user_is_global_admin() THEN RETURN true; END IF;'; BEGIN
 SELECT pg_get_functiondef('erp_private.document_permission(bigint,text)'::regprocedure) INTO definition;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Document policy changed: re-review required'; END IF;
 EXECUTE replace(definition,anchor,anchor||E'\n IF NOT erp_private.hr_document_evidence_allowed($1) THEN RETURN false; END IF;');
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
