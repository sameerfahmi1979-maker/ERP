BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE FUNCTION erp_private.t04_guard_legacy_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF (TG_OP='INSERT' OR ROW(NEW.entitled_days,NEW.used_days,NEW.carry_forward,NEW.period_start,NEW.period_end)
    IS DISTINCT FROM ROW(OLD.entitled_days,OLD.used_days,OLD.carry_forward,OLD.period_start,OLD.period_end))
   AND EXISTS(SELECT 1 FROM erp_private.t04_periods p JOIN public.hr_leave_types t ON t.id=NEW.leave_type_id
    WHERE p.employee_id=NEW.employee_id AND t.code IN('ANNUAL','SICK')
     AND ((NEW.period_start IS NOT NULL AND NEW.period_start<upper(p.coverage) AND NEW.period_end>=lower(p.coverage))
        OR (NEW.period_start IS NULL AND NEW.leave_year BETWEEN extract(year FROM lower(p.coverage)) AND extract(year FROM upper(p.coverage)-1)))) THEN
  RAISE EXCEPTION 'This period is managed by the reviewed leave ledger' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER t04_guard_legacy_balance BEFORE INSERT OR UPDATE ON public.employee_leave_balances
 FOR EACH ROW EXECUTE FUNCTION erp_private.t04_guard_legacy_balance();
REVOKE ALL ON FUNCTION erp_private.t04_guard_legacy_balance() FROM PUBLIC,anon,authenticated,service_role;

DO $$
DECLARE original text;
DECLARE revised text;
BEGIN
 original:=pg_get_functiondef('public.t04_pay_leave(bigint,date,date)'::regprocedure);
 revised:=replace(original,$old$ SELECT coalesce(jsonb_agg(jsonb_build_object('request_id'$old$,
  $new$ IF EXISTS(SELECT 1 FROM erp_private.t04_cases x JOIN erp_private.t04_days d ON d.case_id=x.id
    WHERE x.employee_id=p_employee AND d.state='posted' AND d.day BETWEEN p_from AND p_to
     AND NOT EXISTS(SELECT 1 FROM erp_private.t03_employment_periods p WHERE p.id=x.employment_id AND p.work_period @> d.day)) THEN
  RAISE EXCEPTION 'Approved leave needs review after the effective employment scope changed' USING ERRCODE='23514';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('request_id'$new$);
 IF revised=original THEN RAISE EXCEPTION 'Unknown T04 payroll employment predecessor'; END IF;
 EXECUTE revised;

 original:=pg_get_functiondef('public.t04_read_leave_request(bigint,bigint)'::regprocedure);
 revised:=replace(original,$old$    WHEN erp_private.t04_current_evidence(request.id,p_employee) THEN 'verified'$old$,
  $new$    WHEN request.approved_by IS NOT NULL AND EXISTS(SELECT 1 FROM erp_private.t04_sick_evidence e
        WHERE e.case_id=request.id AND e.covered_dates=request.dates) THEN 'verified'
    WHEN erp_private.t04_current_evidence(request.id,p_employee) THEN 'verified'$new$);
 IF revised=original THEN RAISE EXCEPTION 'Unknown approved sick evidence predecessor'; END IF;
 EXECUTE revised;
END;
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
