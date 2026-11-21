
DO $$
DECLARE found jsonb; scoped jsonb; first_original bigint:=current_setting('erp.t17_employee_a')::bigint;
BEGIN
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(4);
 found:=public.t17_payslip_workspace(920001,920011,'2026-11-01','t06-a1',NULL);
 IF jsonb_array_length(found->'rows')<>1 OR found->'rows'->0->'slip'->>'id'<>first_original::text
   OR found->'access' IS DISTINCT FROM '{"view":true,"issue":false,"deliver":false}'::jsonb
   OR found::text LIKE '%AE07033%' OR found::text LIKE '%storage_path%' OR found::text LIKE '%@example%' THEN
   RAISE EXCEPTION 'Historical exact-code lookup or private payroll masking failed';
 END IF;
 IF public.t17_payslip_workspace(920001,920011,'2026-11-01','T06-A',NULL)->'rows' <> '[]'::jsonb
  OR public.t17_payslip_workspace(920001,920011,'2026-10-01','T06-A1',NULL)->'rows' <> '[]'::jsonb
  OR public.t17_payslip_workspace(920001,920011,'2026-11-01',NULL,980001)->'rows'->0->>'employee'<>'980002' THEN
   RAISE EXCEPTION 'Historical lookup accepted a fuzzy code, wrong month or wrong cursor';
 END IF;
 scoped:=public.t17_payslip_scopes();
 IF jsonb_array_length(scoped)<>1 OR scoped->0->>'branch_id'<>'920011' THEN RAISE EXCEPTION 'Scope selector leaked payroll scopes'; END IF;
 PERFORM pg_temp.t06_actor(7);
 found:=public.t17_payslip_workspace(920001,920011,'2026-11-01','980001');
 IF found->'access' IS DISTINCT FROM '{"view":true,"issue":false,"deliver":true}'::jsonb
 OR found->'rows'->0->'slip'->'delivery'->'actions' <> '["initial","print"]'::jsonb THEN
   RAISE EXCEPTION 'The authorized deliverer sees an invalid original or delivery actions';
 END IF;
 PERFORM pg_temp.t06_actor(6);
 BEGIN
   PERFORM public.t17_payslip_workspace(920001,920011,'2026-11-01');
   RAISE EXCEPTION 'Sibling obtained payslip history'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(8);
 IF public.t17_payslip_scopes()<>'[]'::jsonb THEN RAISE EXCEPTION 'Global System inherited a held payslip capability'; END IF;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims','{}',true);
 RAISE NOTICE 'PASS: historical original by exact month or code, insensitive scope selector, cursor and separate delivery capabilities';
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN PERFORM pg_temp.t06_actor(7); END $$;
SELECT jsonb_build_object('payslip_workspace',public.t17_payslip_workspace(920001,920011,'2026-11-01'));
RESET ROLE;
