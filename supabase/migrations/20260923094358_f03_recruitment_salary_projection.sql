BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- Keep personal expectations, offer pay and requisition budgets out of ordinary
-- recruitment reads, including WHERE/order/GraphQL predicate probes.
DO $$ DECLARE t text; sensitive text[]; cols text; visible text; salary text; BEGIN
 FOREACH t IN ARRAY ARRAY['hr_candidates','hr_job_requisitions','hr_offers'] LOOP
  sensitive:=CASE t WHEN 'hr_candidates' THEN ARRAY['expected_salary'] WHEN 'hr_job_requisitions'
   THEN ARRAY['budgeted_salary_min','budgeted_salary_max'] ELSE ARRAY['basic_salary','gross_salary'] END;
  EXECUTE format('REVOKE SELECT ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('REVOKE SELECT (%s) ON public.%I FROM PUBLIC,anon,authenticated',array_to_string(sensitive,','),t);
  SELECT string_agg(quote_ident(column_name),',' ORDER BY ordinal_position) INTO cols FROM information_schema.columns
   WHERE table_schema='public' AND table_name=t AND NOT column_name=ANY(sensitive);
  EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated',cols,t);
  visible:=CASE t WHEN 'hr_candidates' THEN 'erp_private.requisition_permission(r.requisition_id,''hr.recruitment.view'')'
   WHEN 'hr_job_requisitions' THEN 'erp_private.recruitment_scope(r.owner_company_id,r.branch_id,''hr.recruitment.view'')'
   ELSE 'erp_private.candidate_permission(r.candidate_id,''hr.recruitment.view'') AND erp_private.recruitment_scope(r.owner_company_id,r.branch_id,''hr.recruitment.view'') AND (r.requisition_id IS NULL OR erp_private.requisition_permission(r.requisition_id,''hr.recruitment.view''))' END;
  salary:=CASE t WHEN 'hr_candidates' THEN 'erp_private.requisition_permission(r.requisition_id,''hr.payroll.view'')'
   ELSE 'erp_private.permission_in_scope(''hr.payroll.view'',r.owner_company_id,r.branch_id)' END;
  EXECUTE format('CREATE FUNCTION erp_private.read_%1$I() RETURNS SETOF public.%1$I LANGUAGE sql STABLE SECURITY DEFINER SET search_path='''' AS $body$
   SELECT (jsonb_populate_record(NULL::public.%1$I,CASE WHEN %2$s THEN to_jsonb(r) ELSE to_jsonb(r)-%3$L::text[] END)).*
   FROM public.%1$I r WHERE (SELECT auth.uid()) IS NOT NULL AND (SELECT erp_private.business_principal_is_active()) AND r.deleted_at IS NULL AND %4$s;
   $body$',t,salary,sensitive::text,visible);
  EXECUTE format('CREATE FUNCTION public.f03_read_%1$I() RETURNS SETOF public.%1$I LANGUAGE sql STABLE SECURITY INVOKER SET search_path='''' AS $body$ SELECT * FROM erp_private.read_%1$I(); $body$',t);
  EXECUTE format('REVOKE ALL ON FUNCTION erp_private.read_%1$I(),public.f03_read_%1$I() FROM PUBLIC,anon,service_role',t);
  EXECUTE format('GRANT EXECUTE ON FUNCTION erp_private.read_%1$I(),public.f03_read_%1$I() TO authenticated',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION erp_private.protect_recruitment_salary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE fields text[]; new_row jsonb:=to_jsonb(NEW); old_row jsonb; field text; changed boolean:=false; new_allowed boolean; old_allowed boolean:=true;
BEGIN
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 fields:=CASE TG_TABLE_NAME WHEN 'hr_candidates' THEN ARRAY['expected_salary'] WHEN 'hr_job_requisitions'
  THEN ARRAY['budgeted_salary_min','budgeted_salary_max'] WHEN 'hr_offers' THEN ARRAY['basic_salary','gross_salary'] ELSE NULL END;
 IF fields IS NULL THEN RAISE EXCEPTION 'Unreviewed salary relation'; END IF;
 IF TG_OP='UPDATE' THEN old_row:=to_jsonb(OLD); END IF;
 FOREACH field IN ARRAY fields LOOP
  changed:=changed OR (TG_OP='INSERT' AND new_row->>field IS NOT NULL)
   OR (TG_OP='UPDATE' AND (new_row->field IS DISTINCT FROM old_row->field
    OR ((new_row->>field IS NOT NULL OR old_row->>field IS NOT NULL) AND
     ROW(new_row->>'requisition_id',new_row->>'owner_company_id',new_row->>'branch_id') IS DISTINCT FROM
     ROW(old_row->>'requisition_id',old_row->>'owner_company_id',old_row->>'branch_id'))));
 END LOOP;
 IF NOT changed THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='hr_candidates' THEN
  new_allowed:=erp_private.requisition_permission((new_row->>'requisition_id')::bigint,'hr.payroll.manage')
   AND erp_private.requisition_permission((new_row->>'requisition_id')::bigint,'hr.payroll.view');
  IF TG_OP='UPDATE' THEN old_allowed:=erp_private.requisition_permission((old_row->>'requisition_id')::bigint,'hr.payroll.manage')
   AND erp_private.requisition_permission((old_row->>'requisition_id')::bigint,'hr.payroll.view'); END IF;
 ELSE
  new_allowed:=erp_private.permission_in_scope('hr.payroll.manage',(new_row->>'owner_company_id')::bigint,(new_row->>'branch_id')::bigint)
   AND erp_private.permission_in_scope('hr.payroll.view',(new_row->>'owner_company_id')::bigint,(new_row->>'branch_id')::bigint);
  IF TG_OP='UPDATE' THEN old_allowed:=erp_private.permission_in_scope('hr.payroll.manage',(old_row->>'owner_company_id')::bigint,(old_row->>'branch_id')::bigint)
   AND erp_private.permission_in_scope('hr.payroll.view',(old_row->>'owner_company_id')::bigint,(old_row->>'branch_id')::bigint); END IF;
 END IF;
 IF NOT (new_allowed AND old_allowed) THEN RAISE EXCEPTION 'Separate scoped salary read and manage permissions required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.protect_recruitment_salary() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f03_salary_fields BEFORE INSERT OR UPDATE ON public.hr_candidates FOR EACH ROW EXECUTE FUNCTION erp_private.protect_recruitment_salary();
CREATE TRIGGER f03_salary_fields BEFORE INSERT OR UPDATE ON public.hr_job_requisitions FOR EACH ROW EXECUTE FUNCTION erp_private.protect_recruitment_salary();
CREATE TRIGGER f03_salary_fields BEFORE INSERT OR UPDATE ON public.hr_offers FOR EACH ROW EXECUTE FUNCTION erp_private.protect_recruitment_salary();
NOTIFY pgrst,'reload schema';
COMMIT;
