
DO $$
DECLARE
 issuer jsonb; reconciler jsonb; payment_page jsonb; scope jsonb; evidence jsonb;
 open_month date:='2026-11-01'; review uuid:=current_setting('erp.t16_review')::uuid;
BEGIN
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 issuer:=public.t16_payroll_workspace(920001,920011,open_month);
 scope:=public.t16_payroll_scopes();
 evidence:=public.t16_payroll_evidence_options(920001,920011,'synthetic');
 IF issuer->'access' IS DISTINCT FROM '{"issue":true,"reconcile":false}'::jsonb
   OR issuer->'reviews'->0->'batch'->'results' IS DISTINCT FROM '[]'::jsonb
   OR NOT (issuer->'reviews'->0->'batch'->'files'->0->>'downloadable')::boolean
   OR issuer->'reviews'->0->'batch'->'files'->0->>'currency' IS DISTINCT FROM 'AED'
   OR jsonb_array_length(scope)<>1
   OR NOT evidence @> '[{"document":998603}]' OR evidence @> '[{"document":998606}]'
   OR evidence @> '[{"document":998607}]' OR evidence @> '[{"document":998608}]' THEN
    RAISE EXCEPTION 'Issuer did not receive accurately scoped and masked payroll metadata and DMS choices';
 END IF;
 PERFORM pg_temp.t06_actor(3);
 reconciler:=public.t16_payroll_workspace(920001,920011,open_month);
 payment_page:=public.t16_payroll_workspace(920001,920011,open_month,980001,review);
 IF reconciler->'access' IS DISTINCT FROM '{"issue":false,"reconcile":true}'::jsonb
   OR (reconciler->'reviews'->0->'batch'->'files'->0->>'downloadable')::boolean
   OR reconciler->'reviews'->0->'batch'->'files'->0->>'reference' IS NOT NULL
   OR reconciler::text LIKE '%AE070331234567890123456%' OR reconciler::text LIKE '%"source"%'
   OR jsonb_array_length(reconciler->'reviews'->0->'batch'->'results')<>2
   OR jsonb_array_length(payment_page->'reviews'->0->'batch'->'results')<>1
   OR payment_page->'reviews'->0->'batch'->'results'->0->>'employee'<>'980002'
   OR jsonb_typeof(payment_page->'reviews'->0->'batch'->'results'->0->'net')<>'string' THEN
   RAISE EXCEPTION 'Reconciler could retrieve raw identifiers or failed the scoped exact cursor';
 END IF;
 PERFORM pg_temp.t06_actor(4);
 BEGIN
   PERFORM public.t16_payroll_evidence_options(920001,920011,'synthetic');
   RAISE EXCEPTION 'Finance evidence exposed without explicit DMS capability';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(6);
 BEGIN
   PERFORM public.t16_payroll_workspace(920001,920011,open_month);
   RAISE EXCEPTION 'Sibling branch read pay results';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(8);
 IF public.t16_payroll_scopes()<>'[]'::jsonb THEN RAISE EXCEPTION 'Global administrator inherited T16 business permissions'; END IF;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims','{}',true);
 RAISE NOTICE 'PASS: workspace scope, sensitive masking, verified DMS evidence, employee cursor and held permissions';
END $$;

SET LOCAL ROLE authenticated;
DO $$BEGIN PERFORM pg_temp.t06_actor(3); END $$;
SELECT jsonb_build_object('workspace',public.t16_payroll_workspace(920001,920011,'2026-11-01'),
 'scopes',public.t16_payroll_scopes(),'evidence',public.t16_payroll_evidence_options(920001,920011,'synthetic'));
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
