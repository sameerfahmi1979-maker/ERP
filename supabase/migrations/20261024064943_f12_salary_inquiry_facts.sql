BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- One statement, grouped salary facts; no per-employee RPC loop, privileged
-- fallback, new write authority or inference that readiness means payment.
CREATE FUNCTION public.f12_salary_inquiry_facts(p_employees bigint[], p_as_of date)
RETURNS TABLE(employee_id bigint, gross_salary numeric, basic_salary numeric,
  deductions numeric, net_salary numeric, currency text,
  active_component_count bigint, payroll_status text, available boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $facts$
 WITH eligible AS MATERIALIZED (
   SELECT e.id FROM public.employees e
   WHERE e.id = ANY(p_employees) AND e.deleted_at IS NULL AND p_as_of IS NOT NULL
     AND (SELECT auth.uid()) IS NOT NULL
     AND (SELECT erp_private.business_principal_is_active())
     AND e.id IN (SELECT erp_private.payroll_subject_ids('hr.payroll.view'))
 ), raw AS MATERIALIZED (
   SELECT c.*, t.component_kind, t.is_basic,
     (c.effective_from <= p_as_of AND (c.effective_to IS NULL OR c.effective_to >= p_as_of)
       AND (c.is_active OR c.effective_to IS NOT NULL)) AS applies
   FROM public.employee_salary_components c JOIN eligible e ON e.id = c.employee_id
   LEFT JOIN public.hr_salary_component_types t ON t.id = c.component_type_id
   WHERE c.deleted_at IS NULL
 ), typed AS (
   SELECT r.*, count(*) FILTER (WHERE r.applies) OVER (PARTITION BY r.employee_id,r.component_type_id) AS type_count
   FROM raw r
 ), amounts AS MATERIALIZED (
   SELECT r.employee_id,
     coalesce(sum(r.amount) FILTER (WHERE r.applies AND r.component_kind = 'earning'),0) AS gross,
     coalesce(sum(r.amount) FILTER (WHERE r.applies AND r.is_basic),0) AS basic,
     coalesce(sum(r.amount) FILTER (WHERE r.applies AND r.component_kind = 'deduction'),0) AS deduction,
     count(*) FILTER (WHERE r.applies) AS component_count,
     bool_or(r.effective_to < r.effective_from OR r.applies AND (
       NOT r.is_active OR r.type_count > 1 OR r.amount IS NULL OR r.amount < 0
       OR r.amount::text IN ('NaN','Infinity','-Infinity')
       OR r.component_kind IS NULL OR r.component_kind NOT IN ('earning','deduction')
       OR r.is_basic IS NULL OR r.is_basic AND r.component_kind <> 'earning')) AS invalid
   FROM typed r GROUP BY r.employee_id
 ), latest AS MATERIALIZED (
   SELECT DISTINCT ON (r.employee_id) r.employee_id, r.new_basic, r.currency
   FROM public.employee_salary_revision_effects r JOIN eligible e ON e.id = r.employee_id
   WHERE r.effective_date <= p_as_of ORDER BY r.employee_id,r.effective_date DESC,r.id DESC
 ), composed AS (
   SELECT e.id, p.currency, p.payroll_status,
     coalesce(a.gross,0) - CASE WHEN l.employee_id IS NULL THEN 0 ELSE coalesce(a.basic,0) END
       + coalesce(l.new_basic,0) AS gross,
     coalesce(l.new_basic,a.basic,0) AS basic, coalesce(a.deduction,0) AS deduction,
     CASE WHEN l.employee_id IS NOT NULL AND coalesce(a.component_count,0)=0 THEN 1 ELSE coalesce(a.component_count,0) END AS component_count,
     (p.employee_id IS NOT NULL AND p.effective_date <= p_as_of AND p.currency ~ '^[A-Z]{3}$'
       AND NOT coalesce(a.invalid,false)
       AND (l.employee_id IS NULL OR l.currency = p.currency)) AS valid
   FROM eligible e LEFT JOIN public.employee_payroll_profiles p ON p.employee_id=e.id AND p.deleted_at IS NULL
   LEFT JOIN amounts a ON a.employee_id=e.id LEFT JOIN latest l ON l.employee_id=e.id
 ), checked AS (
   SELECT c.*, (c.valid AND c.deduction <= c.gross AND c.gross::text NOT IN ('NaN','Infinity','-Infinity')) AS usable
   FROM composed c
 )
 SELECT c.id, CASE WHEN c.usable THEN c.gross END, CASE WHEN c.usable THEN c.basic END,
   CASE WHEN c.usable THEN c.deduction END, CASE WHEN c.usable THEN c.gross-c.deduction END,
   c.currency::text, c.component_count, c.payroll_status::text, coalesce(c.usable,false)
 FROM checked c;
$facts$;
REVOKE ALL ON FUNCTION public.f12_salary_inquiry_facts(bigint[], date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.f12_salary_inquiry_facts(bigint[], date) TO authenticated;

DO $adoption$
DECLARE definition text; original text; occurrence integer := 0; start_at integer; end_at integer;
  replacement text := $replacement$component_totals AS MATERIALIZED (
      SELECT f.employee_id, f.gross_salary, false AS invalid_amount,
        f.active_component_count
      FROM public.f12_salary_inquiry_facts(ARRAY(SELECT id FROM eligible),
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dubai')::date) f
    ),$replacement$;
BEGIN
 SELECT prosrc, pg_get_functiondef(oid) INTO original, definition
 FROM pg_proc WHERE oid = 'public.perf_hr_payroll_inquiry(text,integer,integer,text,text,bigint,bigint,text,boolean,jsonb,jsonb)'::regprocedure;
 IF encode(sha256(convert_to(original,'UTF8')),'hex') <> '9013a51cb03b2cd599732be98d37deff50c22c6a92eaf00c765e8ece171a2b1e'
   THEN RAISE EXCEPTION 'Unreviewed payroll inquiry predecessor'; END IF;
 -- Replace only the two calculation CTEs; retain all authorization, predicates,
 -- literal search, counted paging, deterministic sorting and private projections.
 LOOP
   start_at := strpos(definition, 'component_totals AS MATERIALIZED (');
   EXIT WHEN start_at = 0;
   -- Mark the replacement differently so a second iteration cannot find it.
   end_at := strpos(substr(definition,start_at), E'\n    ),');
   IF end_at = 0 THEN RAISE EXCEPTION 'Unreviewed salary CTE boundary'; END IF;
   definition := substr(definition,1,start_at-1) || replace(replacement,'component_totals AS MATERIALIZED (','component_totals AS /* F12 dated */ MATERIALIZED (')
     || substr(definition,start_at+end_at+6);
   occurrence := occurrence+1;
 END LOOP;
 IF occurrence <> 2 THEN RAISE EXCEPTION 'Expected two reviewed calculation CTEs'; END IF;
 definition := replace(definition,'COALESCE(c.gross_salary,0::numeric) AS gross_salary','c.gross_salary AS gross_salary');
 definition := replace(definition,'ON p.employee_id = e.id','ON p.employee_id = e.id AND p.deleted_at IS NULL');
 definition := replace(definition,E'JOIN eligible AS e ON e.id = w.employee_id\n',E'JOIN eligible AS e ON e.id = w.employee_id AND w.deleted_at IS NULL\n');
 definition := replace(definition,E'          WHEN (\n            (w.salary_payment_method',
   E'          WHEN (\n            NOT EXISTS (SELECT 1 FROM public.employee_payroll_profiles cp WHERE cp.employee_id=e.id AND cp.deleted_at IS NULL AND cp.payroll_status=''active'' AND cp.effective_date <= (CURRENT_TIMESTAMP AT TIME ZONE ''Asia/Dubai'')::date)\n            OR NOT EXISTS (SELECT 1 FROM public.employees employment WHERE employment.id=e.id AND employment.employee_status IN (''active'',''on_leave'',''probation'') AND employment.joining_date <= (CURRENT_TIMESTAMP AT TIME ZONE ''Asia/Dubai'')::date)\n            OR (w.salary_payment_method');
 EXECUTE definition;
END;
$adoption$;
NOTIFY pgrst, 'reload schema';
COMMIT;
