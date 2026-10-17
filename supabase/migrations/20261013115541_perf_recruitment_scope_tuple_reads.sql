BEGIN;
SET LOCAL standard_conforming_strings=on;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='8s';
SET LOCAL transaction_timeout='30s';
-- PERF-P04: statement-local exact scope reuse plus single composite expansion.
-- Only three existing private SQL bodies change. Public wrappers, ACLs, owners,
-- RLS, helper semantics, salary masking and business mutations stay unchanged.
-- This is not a grant repair and is not safe to replay after successful apply.
DO $recruitment_preimage$
DECLARE f record; original_function pg_catalog.pg_proc; actual_acl jsonb; expected_acl jsonb; relation_name text;
BEGIN
 IF current_user<>'postgres' OR current_setting('standard_conforming_strings')<>'on' THEN RAISE EXCEPTION 'Reviewed recruitment migration role and string context required'; END IF;
 FOR f IN SELECT * FROM(VALUES ('erp_private.business_principal_is_active()','963f80184e6156909d4f2c1c0dabf6bc66e0d3acded8b87d88859fd01ce6a103',true,'pg_catalog.bool',false,ARRAY['postgres','authenticated','service_role']::text[]),
('erp_private.candidate_permission(bigint,text)','9870ed871c692b1863becfa15905f9e302d7dd729bd1962ffd02e49c04e14807',true,'pg_catalog.bool',false,ARRAY['postgres','authenticated']::text[]),
('erp_private.permission_in_scope(text,bigint,bigint)','a4ef1c996972f58ab78d7f60dc53fef960dade4c5858ca0e7699ee79d0df4fd2',true,'pg_catalog.bool',false,ARRAY['postgres','authenticated']::text[]),
('erp_private.read_hr_candidates()','27a9684bc290e7a0f8ff7f7a50e73440f215606c0b8e59cbbe42d5edb97f6940',true,'public.hr_candidates',true,ARRAY['postgres','authenticated']::text[]),
('erp_private.read_hr_job_requisitions()','83b32d829815fc232fc30be9f966ef5737e1725640dd0ef346d2c09973a9e205',true,'public.hr_job_requisitions',true,ARRAY['postgres','authenticated']::text[]),
('erp_private.read_hr_offers()','f2b947d7d86fb16c027dd3b4a151f05e61a8756102ee7314fd6bb164cd1efb23',true,'public.hr_offers',true,ARRAY['postgres','authenticated']::text[]),
('erp_private.recruitment_scope(bigint,bigint,text)','40fd0dbe8d9b171535f637bc622b5b7b691200ad70d3b1c08857088cb0271207',true,'pg_catalog.bool',false,ARRAY['postgres','authenticated']::text[]),
('erp_private.requisition_permission(bigint,text)','4b09e45a82a807df3a106ae73e35f146e88c64fc74daab5786d67011a26dfe82',true,'pg_catalog.bool',false,ARRAY['postgres','authenticated']::text[]),
('public.f03_read_hr_candidates()','f83a9911d26bd674ba6704a9860b9bceb0d30fa2df5a02c0573ab08d96f50835',false,'public.hr_candidates',true,ARRAY['postgres','authenticated']::text[]),
('public.f03_read_hr_job_requisitions()','5c60106202abc808cf3f83f31391b82ee6c8b55bec45c7650f2a46a0c12e232d',false,'public.hr_job_requisitions',true,ARRAY['postgres','authenticated']::text[]),
('public.f03_read_hr_offers()','301bd3e70dd70ca4eed167a6959f01cb60f013e32d7cec73d71921bc66b35366',false,'public.hr_offers',true,ARRAY['postgres','authenticated']::text[]))s(signature,source_sha,security_definer,return_type,returns_set,execute_roles) LOOP
  SELECT * INTO STRICT original_function FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure(f.signature);
  IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(original_function.prosrc,'UTF8')),'hex')<>f.source_sha
   OR pg_catalog.pg_get_userbyid(original_function.proowner)<>'postgres' OR original_function.prokind<>'f' OR original_function.provolatile<>'s'
   OR original_function.prosecdef<>f.security_definer OR original_function.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
   OR original_function.proretset<>f.returns_set OR original_function.prorettype<>pg_catalog.to_regtype(f.return_type)
   OR original_function.prolang<>(SELECT oid FROM pg_catalog.pg_language WHERE lanname='sql')
   OR original_function.proisstrict OR original_function.proleakproof OR original_function.proparallel<>'u' OR original_function.pronargdefaults<>0
   OR original_function.prosqlbody IS NOT NULL OR original_function.probin IS NOT NULL OR original_function.prosupport<>0 OR original_function.provariadic<>0
  THEN RAISE EXCEPTION 'Original recruitment function body signature owner or configuration changed'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_array(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee)::text END,pg_catalog.pg_get_userbyid(a.grantor)::text,a.privilege_type,a.is_grantable)ORDER BY a.grantee,a.grantor,a.privilege_type),'[]')INTO actual_acl
   FROM pg_catalog.aclexplode(coalesce(original_function.proacl,pg_catalog.acldefault('f',original_function.proowner)))a;
  SELECT jsonb_agg(jsonb_build_array(r,'postgres','EXECUTE',false)ORDER BY r::regrole::oid)INTO expected_acl FROM unnest(f.execute_roles)r;
  IF actual_acl IS DISTINCT FROM expected_acl THEN RAISE EXCEPTION 'Exact existing recruitment EXECUTE grantor and options required'; END IF;
 END LOOP;
 FOREACH relation_name IN ARRAY ARRAY['public.hr_job_requisitions','public.hr_candidates','public.hr_offers'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_attribute a ON a.attrelid=k.conrelid AND a.attname='id'
   WHERE k.conrelid=pg_catalog.to_regclass(relation_name)AND k.contype='p' AND k.convalidated AND NOT k.condeferrable AND NOT k.condeferred AND k.conkey=ARRAY[a.attnum])
  THEN RAISE EXCEPTION 'Exact nondeferrable parent ID primary key required'; END IF;
 END LOOP;
 PERFORM pg_catalog.set_config('perf_recruitment.catalog_preimage',(SELECT jsonb_agg(CASE WHEN p.oid IN('erp_private.read_hr_candidates()'::regprocedure,'erp_private.read_hr_job_requisitions()'::regprocedure,'erp_private.read_hr_offers()'::regprocedure)THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p)END ORDER BY p.oid)FROM pg_catalog.pg_proc p WHERE p.oid IN('erp_private.business_principal_is_active()'::regprocedure,'erp_private.candidate_permission(bigint,text)'::regprocedure,'erp_private.permission_in_scope(text,bigint,bigint)'::regprocedure,'erp_private.read_hr_candidates()'::regprocedure,'erp_private.read_hr_job_requisitions()'::regprocedure,'erp_private.read_hr_offers()'::regprocedure,'erp_private.recruitment_scope(bigint,bigint,text)'::regprocedure,'erp_private.requisition_permission(bigint,text)'::regprocedure,'public.f03_read_hr_candidates()'::regprocedure,'public.f03_read_hr_job_requisitions()'::regprocedure,'public.f03_read_hr_offers()'::regprocedure))::text,true);
END $recruitment_preimage$;
CREATE OR REPLACE FUNCTION erp_private.read_hr_job_requisitions() RETURNS SETOF public.hr_job_requisitions
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
   WITH live_subjects AS MATERIALIZED (
     SELECT r.* FROM public.hr_job_requisitions r
     WHERE (SELECT auth.uid()) IS NOT NULL AND (SELECT erp_private.business_principal_is_active()) AND r.deleted_at IS NULL
   ), scope_pairs AS MATERIALIZED (
     SELECT DISTINCT r.owner_company_id, r.branch_id FROM live_subjects r
   ), checked_pairs AS MATERIALIZED (
     SELECT p.owner_company_id, p.branch_id,
       erp_private.recruitment_scope(p.owner_company_id,p.branch_id,'hr.recruitment.view') AS can_view,
       erp_private.permission_in_scope('hr.payroll.view',p.owner_company_id,p.branch_id) AS can_view_salary
     FROM scope_pairs p
   )
   SELECT projected.*
   FROM live_subjects r
   JOIN checked_pairs p ON p.owner_company_id IS NOT DISTINCT FROM r.owner_company_id
     AND p.branch_id IS NOT DISTINCT FROM r.branch_id
   CROSS JOIN LATERAL jsonb_populate_record(NULL::public.hr_job_requisitions,CASE WHEN p.can_view_salary THEN to_jsonb(r) ELSE to_jsonb(r)-'{budgeted_salary_min,budgeted_salary_max}'::text[] END) AS projected
   WHERE p.can_view;
   $$;

CREATE OR REPLACE FUNCTION erp_private.read_hr_candidates() RETURNS SETOF public.hr_candidates
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
   WITH live_subjects AS MATERIALIZED (
     SELECT r.* FROM public.hr_candidates r
     WHERE (SELECT auth.uid()) IS NOT NULL AND (SELECT erp_private.business_principal_is_active()) AND r.deleted_at IS NULL
   ), resolved_subjects AS MATERIALIZED (
     SELECT r.id, q.owner_company_id AS permission_company_id, q.branch_id AS permission_branch_id
     FROM live_subjects r
     LEFT JOIN public.hr_job_requisitions q ON q.id=r.requisition_id AND q.deleted_at IS NULL
     -- A true NULL requisition maps to recruitment_scope(NULL,NULL,...).
     -- A non-NULL missing/deleted requisition is false, never that NULL case.
     WHERE r.requisition_id IS NULL OR q.id IS NOT NULL
   ), scope_pairs AS MATERIALIZED (
     SELECT DISTINCT s.permission_company_id, s.permission_branch_id FROM resolved_subjects s
   ), checked_pairs AS MATERIALIZED (
     SELECT p.permission_company_id, p.permission_branch_id,
       erp_private.recruitment_scope(p.permission_company_id,p.permission_branch_id,'hr.recruitment.view') AS can_view,
       erp_private.recruitment_scope(p.permission_company_id,p.permission_branch_id,'hr.payroll.view') AS can_view_salary
     FROM scope_pairs p
   )
   SELECT projected.*
   FROM live_subjects r
   JOIN resolved_subjects s ON s.id=r.id
   JOIN checked_pairs p ON p.permission_company_id IS NOT DISTINCT FROM s.permission_company_id
     AND p.permission_branch_id IS NOT DISTINCT FROM s.permission_branch_id
   CROSS JOIN LATERAL jsonb_populate_record(NULL::public.hr_candidates,CASE WHEN p.can_view_salary THEN to_jsonb(r) ELSE to_jsonb(r)-'{expected_salary}'::text[] END) AS projected
   WHERE p.can_view;
   $$;

CREATE OR REPLACE FUNCTION erp_private.read_hr_offers() RETURNS SETOF public.hr_offers
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
   WITH live_subjects AS MATERIALIZED (
     SELECT r.* FROM public.hr_offers r
     WHERE (SELECT auth.uid()) IS NOT NULL AND (SELECT erp_private.business_principal_is_active()) AND r.deleted_at IS NULL
   ), resolved_subjects AS MATERIALIZED (
     SELECT r.id,
       cq.owner_company_id AS candidate_company_id, cq.branch_id AS candidate_branch_id,
       oq.owner_company_id AS requisition_company_id, oq.branch_id AS requisition_branch_id,
       r.requisition_id IS NOT NULL AS has_offer_requisition
     FROM live_subjects r
     JOIN public.hr_candidates c ON c.id=r.candidate_id AND c.deleted_at IS NULL
     LEFT JOIN public.hr_job_requisitions cq ON cq.id=c.requisition_id AND cq.deleted_at IS NULL
     LEFT JOIN public.hr_job_requisitions oq ON oq.id=r.requisition_id AND oq.deleted_at IS NULL
     WHERE (c.requisition_id IS NULL OR cq.id IS NOT NULL)
       AND (r.requisition_id IS NULL OR oq.id IS NOT NULL)
   ), own_scope_pairs AS MATERIALIZED (
     SELECT DISTINCT r.owner_company_id, r.branch_id
     FROM live_subjects r JOIN resolved_subjects s ON s.id=r.id
   ), view_scope_pairs AS MATERIALIZED (
     SELECT p.owner_company_id, p.branch_id FROM own_scope_pairs p
     UNION
     SELECT s.candidate_company_id, s.candidate_branch_id FROM resolved_subjects s
     UNION
     SELECT s.requisition_company_id, s.requisition_branch_id FROM resolved_subjects s WHERE s.has_offer_requisition
   ), checked_view_scopes AS MATERIALIZED (
     SELECT p.owner_company_id, p.branch_id,
       erp_private.recruitment_scope(p.owner_company_id,p.branch_id,'hr.recruitment.view') AS can_view
     FROM view_scope_pairs p
   ), checked_salary_scopes AS MATERIALIZED (
     SELECT p.owner_company_id, p.branch_id,
       erp_private.permission_in_scope('hr.payroll.view',p.owner_company_id,p.branch_id) AS can_view_salary
     FROM own_scope_pairs p
   )
   SELECT projected.*
   FROM live_subjects r
   JOIN resolved_subjects s ON s.id=r.id
   JOIN checked_view_scopes own_scope ON own_scope.owner_company_id IS NOT DISTINCT FROM r.owner_company_id
     AND own_scope.branch_id IS NOT DISTINCT FROM r.branch_id
   JOIN checked_view_scopes candidate_scope ON candidate_scope.owner_company_id IS NOT DISTINCT FROM s.candidate_company_id
     AND candidate_scope.branch_id IS NOT DISTINCT FROM s.candidate_branch_id
   LEFT JOIN checked_view_scopes requisition_scope ON s.has_offer_requisition
     AND requisition_scope.owner_company_id IS NOT DISTINCT FROM s.requisition_company_id
     AND requisition_scope.branch_id IS NOT DISTINCT FROM s.requisition_branch_id
   JOIN checked_salary_scopes salary_scope ON salary_scope.owner_company_id IS NOT DISTINCT FROM r.owner_company_id
     AND salary_scope.branch_id IS NOT DISTINCT FROM r.branch_id
   CROSS JOIN LATERAL jsonb_populate_record(NULL::public.hr_offers,CASE WHEN salary_scope.can_view_salary THEN to_jsonb(r) ELSE to_jsonb(r)-'{basic_salary,gross_salary}'::text[] END) AS projected
   WHERE own_scope.can_view AND candidate_scope.can_view
     AND (NOT s.has_offer_requisition OR requisition_scope.can_view);
   $$;
DO $recruitment_postimage$
BEGIN
 IF (SELECT jsonb_agg(CASE WHEN p.oid IN('erp_private.read_hr_candidates()'::regprocedure,'erp_private.read_hr_job_requisitions()'::regprocedure,'erp_private.read_hr_offers()'::regprocedure)THEN to_jsonb(p)-'prosrc' ELSE to_jsonb(p)END ORDER BY p.oid)FROM pg_catalog.pg_proc p WHERE p.oid IN('erp_private.business_principal_is_active()'::regprocedure,'erp_private.candidate_permission(bigint,text)'::regprocedure,'erp_private.permission_in_scope(text,bigint,bigint)'::regprocedure,'erp_private.read_hr_candidates()'::regprocedure,'erp_private.read_hr_job_requisitions()'::regprocedure,'erp_private.read_hr_offers()'::regprocedure,'erp_private.recruitment_scope(bigint,bigint,text)'::regprocedure,'erp_private.requisition_permission(bigint,text)'::regprocedure,'public.f03_read_hr_candidates()'::regprocedure,'public.f03_read_hr_job_requisitions()'::regprocedure,'public.f03_read_hr_offers()'::regprocedure)) IS DISTINCT FROM current_setting('perf_recruitment.catalog_preimage')::jsonb
 THEN RAISE EXCEPTION 'Recruitment catalog changed beyond three exact bodies'; END IF;
 IF EXISTS(SELECT 1 FROM(VALUES ('erp_private.read_hr_candidates()','d9f959fb6de1b396952b7cda25378686b5ce9f91c6b1d27d65c82fba93aeca43'),('erp_private.read_hr_job_requisitions()','b346dc9ca5e6feffd3a5992666050772758d87e5d831d062086a49a4d76fd266'),('erp_private.read_hr_offers()','71d9b8f93a18acd3b0def0947d3799631b90302a430e59c38f83c8b95d0ef1ad'))s(signature,body_sha)LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(s.signature)
  WHERE p.oid IS NULL OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM s.body_sha)
 THEN RAISE EXCEPTION 'Exact reviewed recruitment postimage required'; END IF;
END $recruitment_postimage$;
COMMIT;
