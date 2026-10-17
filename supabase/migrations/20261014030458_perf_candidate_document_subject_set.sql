BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='8s';
-- Reuse the reviewed statement-local candidate and document visibility sets.
-- Their intersection retains both independent authorization requirements.
-- Confidential evidence helpers, live-principal gate, grants and writes stay.
DO $preimage$
DECLARE expected record; actual record; acl text[];
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed migration owner required'; END IF;
 FOR expected IN SELECT * FROM (VALUES
  ('erp_private.candidate_permission(bigint,text)','86b6f4eedf17781f8af8cd5ed773cc22',false,'boolean','sql'),
  ('erp_private.read_hr_candidates()','20f3b50f8cb7f24451e8dabdccb3d7ca',true,'public.hr_candidates','sql'),
  ('erp_private.document_permission(bigint,text)','1c6c7a6c40749c9bea0e28cc99e03595',false,'boolean','plpgsql'),
  ('erp_private.perf_recruitment_document_subjects_allowed(bigint)','68539a4aa725e86fa64e50e60b114f90',false,'boolean','sql'),
  ('erp_private.read_documents()','6bc7814a408d77990df6e20bb2c58033',true,'public.dms_documents','sql'),
  ('erp_private.read_documents_filtered(bigint[],text[])','c95a1a5ba0facbcb902b429be8a29a12',true,'public.dms_documents','sql'),
  ('erp_private.read_documents_filtered_v2(bigint[],text[],text[])','0740033a5d712f7e883dbff80680e2cb',true,'public.dms_documents','sql'))
  t(signature,source_hash,returns_set,return_type,language_name) LOOP
  SELECT * INTO STRICT actual FROM pg_proc WHERE oid=to_regprocedure(expected.signature);
  SELECT array_agg(entry::text ORDER BY entry::text) INTO acl FROM unnest(actual.proacl) entry;
  IF NOT actual.prosecdef OR actual.proretset<>expected.returns_set OR actual.prorettype<>to_regtype(expected.return_type)
   OR actual.prolang<>(SELECT oid FROM pg_language WHERE lanname=expected.language_name) OR actual.prokind<>'f'
   OR actual.proisstrict OR actual.proleakproof OR actual.proparallel<>'u' OR actual.pronargdefaults<>0
   OR actual.prosqlbody IS NOT NULL OR actual.probin IS NOT NULL OR actual.prosupport<>0 OR actual.provariadic<>0
   OR acl IS DISTINCT FROM (CASE WHEN expected.signature='erp_private.perf_recruitment_document_subjects_allowed(bigint)'
     THEN ARRAY['postgres=X/postgres'] ELSE ARRAY['authenticated=X/postgres','postgres=X/postgres'] END)::text[]
   OR md5(actual.prosrc)<>expected.source_hash OR pg_get_userbyid(actual.proowner)<>'postgres'
   OR actual.provolatile<>'s' OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
  THEN RAISE EXCEPTION 'Candidate document authority prerequisite drift'; END IF;
 END LOOP;
 SELECT * INTO STRICT actual FROM pg_policies WHERE schemaname='public' AND tablename='hr_candidate_documents' AND policyname='hr_candidate_documents_select';
 IF actual.qual IS DISTINCT FROM '(erp_private.candidate_permission(candidate_id, ''hr.recruitment.view''::text) AND erp_private.document_permission(dms_document_id, ''dms.documents.view''::text))'
  OR actual.permissive<>'PERMISSIVE' OR actual.cmd<>'SELECT' OR actual.roles<>ARRAY['authenticated']::name[] OR actual.with_check IS NOT NULL
  OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='hr_candidate_documents')<>5
  OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.hr_candidate_documents'::regclass AND relrowsecurity)
  OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hr_candidate_documents' AND policyname='f03_principal'
   AND permissive='RESTRICTIVE' AND cmd='ALL' AND roles=ARRAY['authenticated']::name[]
   AND qual='( SELECT erp_private.business_principal_is_active() AS business_principal_is_active)' AND with_check=qual)
 THEN RAISE EXCEPTION 'Candidate document SELECT policy or principal gate drift'; END IF;
END $preimage$;
-- The protected document projection checks recruitment evidence for every
-- document. Repeated attachments to one candidate must not repeat that same
-- candidate's role/scope traversal thousands of times. Expand the frozen
-- evidence predicate at its existing call site so PostgreSQL can hash the
-- uncorrelated candidate ID set once. Offer payroll and onboarding checks
-- remain exactly the original predicates. No document metadata is exposed.
DO $document_projection$
DECLARE definition text; expanded text;
BEGIN
 definition:=pg_get_functiondef('erp_private.read_documents_filtered_v2(bigint[],text[],text[])'::regprocedure);
 expanded:=replace(definition,'AND erp_private.perf_recruitment_document_subjects_allowed(d.id)',
 $predicate$AND NOT EXISTS(SELECT 1 FROM public.hr_candidate_documents c
       WHERE c.dms_document_id=d.id AND c.deleted_at IS NULL
        AND c.candidate_id NOT IN (SELECT id FROM visible_candidates))
     AND NOT EXISTS(SELECT 1 FROM public.hr_offers o WHERE o.offer_document_id IS NOT NULL AND o.offer_document_id=d.id AND o.deleted_at IS NULL AND NOT
       (erp_private.candidate_permission(o.candidate_id,'hr.recruitment.view')
        AND erp_private.recruitment_scope(o.owner_company_id,o.branch_id,'hr.recruitment.view')
        AND erp_private.permission_in_scope('hr.payroll.view',o.owner_company_id,o.branch_id)))
     AND NOT EXISTS(SELECT 1 FROM public.hr_onboarding_tasks t WHERE t.dms_document_id IS NOT NULL AND t.dms_document_id=d.id AND t.deleted_at IS NULL
       AND NOT erp_private.onboarding_permission(t.candidate_id,t.employee_id,'hr.recruitment.view'))$predicate$);
 IF expanded=definition THEN RAISE EXCEPTION 'Reviewed recruitment evidence call site missing'; END IF;
 -- The set must be materialized in the outer statement. A function scan
 -- nested inside a correlated evidence subquery can be rescanned per document.
 IF position('WITH principal AS MATERIALIZED (' IN expanded)=0 THEN RAISE EXCEPTION 'Reviewed principal CTE missing'; END IF;
 expanded:=replace(expanded,'WITH principal AS MATERIALIZED (',
  'WITH visible_candidates AS MATERIALIZED (SELECT id FROM erp_private.read_hr_candidates()), principal AS MATERIALIZED (');
 EXECUTE expanded;
END $document_projection$;
ALTER POLICY hr_candidate_documents_select ON public.hr_candidate_documents USING (
 candidate_id IN (SELECT id FROM erp_private.read_hr_candidates())
 AND dms_document_id IN (SELECT id FROM erp_private.read_documents())
);
COMMIT;
