BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SET LOCAL statement_timeout='15s';
WITH required(signature) AS (VALUES
 ('erp_private.session_is_valid()'),('erp_private.business_principal_is_active()'),
 ('public.current_user_is_global_admin()'),('public.current_user_profile_id()'),
 ('public.current_user_can_view_employee(bigint)'),('public.current_user_can_view_employee_medical(bigint)'),
 ('erp_private.employee_permission(bigint,text)'),('erp_private.readable_employee_ids()'),
 ('erp_private.hr_document_evidence_allowed(bigint)'),('erp_private.recruitment_document_evidence_allowed(bigint)'),
 ('erp_private.candidate_permission(bigint,text)'),('erp_private.recruitment_scope(bigint,bigint,text)'),
 ('erp_private.permission_in_scope(text,bigint,bigint)'),('erp_private.onboarding_permission(bigint,bigint,text)'),
 ('erp_private.document_permission(bigint,text)'),('erp_private.read_documents()'),('erp_private.read_hr_candidates()')
)
SELECT jsonb_build_object('signature',r.signature,'present',p.oid IS NOT NULL,'hash',md5(p.prosrc),
 'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'returnsSet',p.proretset,
 'returnType',format_type(p.prorettype,NULL),'language',l.lanname,'kind',p.prokind,
 'strict',p.proisstrict,'leakproof',p.proleakproof,'parallel',p.proparallel,
 'defaults',p.pronargdefaults,'noSqlBody',p.prosqlbody IS NULL,'noBinary',p.probin IS NULL,
 'support',p.prosupport::oid,'variadic',p.provariadic,'volatility',p.provolatile,'config',p.proconfig,
 'acl',(SELECT array_agg(a::text ORDER BY a::text) FROM unnest(p.proacl) a))
FROM required r LEFT JOIN pg_proc p ON p.oid=to_regprocedure(r.signature)
LEFT JOIN pg_language l ON l.oid=p.prolang ORDER BY r.signature;
SELECT jsonb_build_object('relation',c.oid::regclass::text,'owner',pg_get_userbyid(c.relowner),
 'rls',c.relrowsecurity,'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname)
  FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname))
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('dms_documents','dms_document_links','hr_candidate_documents','dms_notification_queue');
ROLLBACK;
