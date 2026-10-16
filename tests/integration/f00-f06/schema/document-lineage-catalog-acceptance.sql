-- Final dependency129 catalog assertion only; not functional/native parity acceptance.
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
DO $acceptance$
DECLARE expected record; actual record; acl text[];
BEGIN
 FOR expected IN SELECT * FROM(VALUES
  ('erp_private.document_permission(bigint,text)','1c6c7a6c40749c9bea0e28cc99e03595',false),
  ('erp_private.read_documents()','6bc7814a408d77990df6e20bb2c58033',false),
  ('erp_private.read_documents_filtered(bigint[],text[])','c95a1a5ba0facbcb902b429be8a29a12',false),
  ('erp_private.read_documents_filtered_v2(bigint[],text[],text[])','0c4be0e6b69b7fa8bb2ba0c446d3aae5',false),
  ('erp_private.perf_hr_document_subjects_allowed(bigint)','6d025f4b9359e7685d1085f2179b40b0',true),
  ('erp_private.perf_recruitment_document_subjects_allowed(bigint)','68539a4aa725e86fa64e50e60b114f90',true),
  ('erp_private.hr_document_evidence_allowed(bigint)','892d03dde992a824f8575f11e62765b3',false),
  ('erp_private.recruitment_document_evidence_allowed(bigint)','dd2c040f3ebccaedc9092fc5c887d4e2',false)
 )v(signature,hash,owner_only) LOOP
  SELECT * INTO STRICT actual FROM pg_proc WHERE oid=to_regprocedure(expected.signature);
  SELECT array_agg(a::text ORDER BY a::text) INTO acl FROM unnest(actual.proacl)a;
  IF md5(actual.prosrc)<>expected.hash OR pg_get_userbyid(actual.proowner)<>'postgres'
   OR NOT actual.prosecdef OR actual.provolatile<>'s' OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
   OR acl IS DISTINCT FROM CASE WHEN expected.owner_only THEN ARRAY['postgres=X/postgres'] ELSE ARRAY['authenticated=X/postgres','postgres=X/postgres'] END::text[]
  THEN RAISE EXCEPTION 'Final document lineage catalog mismatch: %',expected.signature;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.hr_candidate_documents'::regclass AND relrowsecurity)
  OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='hr_candidate_documents')<>5
  OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hr_candidate_documents'
   AND policyname='hr_candidate_documents_select' AND md5(qual)='283b1c18b03113eba8630bba7de22140')
  OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.perf_hr_candidate_document_reads'::regclass AND reloptions @> ARRAY['security_invoker=true'])
  OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.dms_notification_queue'::regclass AND relrowsecurity)
  OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='dms_notification_queue')<>9
  OR to_regprocedure('erp_private.perf_notification_document_ids(text)') IS NULL
 THEN RAISE EXCEPTION 'Final candidate/notification composition is incomplete';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dms_notification_queue'
   AND policyname='f03_principal' AND permissive='RESTRICTIVE' AND cmd='ALL'
   AND qual='( SELECT erp_private.business_principal_is_active() AS business_principal_is_active)' AND with_check=qual)
 THEN RAISE EXCEPTION 'Final live-principal protection changed';END IF;
END $acceptance$;
SELECT 'PASS: document lineage catalog (not functional acceptance)' AS result;
ROLLBACK;
