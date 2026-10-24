BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';
-- Internal readiness only. Returns no account, salary or identity values.
-- Same dated salary contract and current payroll+banking subject intersection.
CREATE FUNCTION public.f12_payroll_readiness_facts(p_employees bigint[],p_as_of date)
RETURNS TABLE(employee_id bigint,readiness_status text,has_wps_profile boolean,missing_iban boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$BEGIN
 IF auth.uid()IS NULL OR NOT erp_private.business_principal_is_active()THEN RAISE EXCEPTION 'Current payroll principal required' USING ERRCODE='42501';END IF;
 IF p_as_of IS NULL OR NOT isfinite(p_as_of)OR p_employees IS NULL OR cardinality(p_employees)>200
 OR EXISTS(SELECT 1 FROM unnest(p_employees)i WHERE i IS NULL OR i<1 OR i>9007199254740991)
 OR cardinality(p_employees)<>(SELECT count(DISTINCT i)FROM unnest(p_employees)i)THEN RAISE EXCEPTION 'Bounded exact payroll subjects required' USING ERRCODE='22023';END IF;
 RETURN QUERY WITH eligible AS MATERIALIZED(
 SELECT e.id,e.employee_status,e.joining_date FROM public.employees e WHERE e.id=ANY(p_employees)AND e.deleted_at IS NULL
 AND e.id IN(SELECT erp_private.payroll_subject_ids('hr.payroll.view'))AND e.id IN(SELECT erp_private.payroll_subject_ids('hr.banking.view'))),
 salary AS MATERIALIZED(SELECT f.*FROM public.f12_salary_inquiry_facts(ARRAY(SELECT e.id FROM eligible e),p_as_of)f)
 SELECT e.id,CASE WHEN w.employee_id IS NULL THEN'not_enrolled'
 WHEN w.wps_applicable IS NULL THEN'incomplete'
 WHEN NOT w.wps_applicable OR w.wps_status='exempt'THEN'exempt'
 WHEN w.wps_status='not_enrolled'THEN'not_enrolled'
 WHEN w.wps_status='hold'OR EXISTS(SELECT 1 FROM public.employee_payroll_holds h WHERE h.employee_id=e.id AND h.is_active AND h.deleted_at IS NULL)THEN'on_hold'
 WHEN coalesce(w.wps_status,'')<>'active'OR s.payroll_status IS DISTINCT FROM'active'OR NOT coalesce(s.available,false)
 OR coalesce(s.active_component_count,0)=0 OR coalesce(s.gross_salary,0)<=0
 OR e.employee_status<>ALL(ARRAY['active','probation','on_leave'])OR e.joining_date IS NULL OR e.joining_date>p_as_of
 OR coalesce(w.salary_payment_method,'')<>ALL(ARRAY['bank_transfer','exchange_house','cheque'])
 OR(w.salary_payment_method='bank_transfer'AND(w.bank_id IS NULL OR nullif(btrim(w.iban),'')IS NULL))
 OR(w.salary_payment_method='exchange_house'AND nullif(btrim(w.exchange_house),'')IS NULL)
 OR nullif(btrim(w.labour_card_number),'')IS NULL THEN'incomplete'ELSE'ready'END::text,
 w.employee_id IS NOT NULL,(w.employee_id IS NOT NULL AND nullif(btrim(w.iban),'')IS NULL)
 FROM eligible e LEFT JOIN public.employee_wps_profiles w ON w.employee_id=e.id AND w.deleted_at IS NULL
 LEFT JOIN salary s ON s.employee_id=e.id ORDER BY e.id;
END$$;
REVOKE ALL ON FUNCTION public.f12_payroll_readiness_facts(bigint[],date)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f12_payroll_readiness_facts(bigint[],date)TO authenticated;
NOTIFY pgrst,'reload schema';COMMIT;
