-- Explicit dependency composition, CLI-created 2026-10-16. NOT a timestamp-order repair.
-- Apply only after immutable old110, before old120 -> old121 -> old111.
-- Original migration bytes/guards remain untouched. See DEPENDENCY_MANIFEST_20261016.json.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $lineage_preimage$
DECLARE expected record; actual record; acl text[]; relation record; signatures text[] := ARRAY['erp_private.business_principal_is_active()','erp_private.candidate_permission(bigint,text)','erp_private.document_permission(bigint,text)','erp_private.employee_permission(bigint,text)','erp_private.hr_document_evidence_allowed(bigint)','erp_private.onboarding_permission(bigint,bigint,text)','erp_private.permission_in_scope(text,bigint,bigint)','erp_private.read_documents()','erp_private.read_hr_candidates()','erp_private.readable_employee_ids()','erp_private.recruitment_document_evidence_allowed(bigint)','erp_private.recruitment_scope(bigint,bigint,text)','erp_private.session_is_valid()','public.current_user_can_view_employee_medical(bigint)','public.current_user_can_view_employee(bigint)','public.current_user_is_global_admin()','public.current_user_profile_id()'];
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Document lineage requires reviewed postgres owner'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='erp_private' AND nspowner='postgres'::regrole)
  OR has_schema_privilege('anon','erp_private','CREATE') OR has_schema_privilege('authenticated','erp_private','CREATE')
 THEN RAISE EXCEPTION 'Document lineage private schema authority drift'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['erp_private.perf_hr_document_subjects_allowed(bigint)','erp_private.perf_recruitment_document_subjects_allowed(bigint)','erp_private.read_documents_filtered(bigint[],text[])','erp_private.read_documents_filtered_v2(bigint[],text[],text[])']) signature WHERE to_regprocedure(signature) IS NOT NULL)
 THEN RAISE EXCEPTION 'Document lineage already present or partial; reconcile history'; END IF;
 FOR expected IN SELECT * FROM (VALUES
 ('erp_private.business_principal_is_active()','13bc54e6c909a2635599b2f45fc5eda6',true,false,'boolean','sql',ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[],ARRAY['search_path=""']::text[]),
 ('erp_private.candidate_permission(bigint,text)','86b6f4eedf17781f8af8cd5ed773cc22',true,false,'boolean','sql',ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[],ARRAY['search_path=""']::text[]),
 ('erp_private.document_permission(bigint,text)','2190943612f7b95620a97b76fb50fc84',true,false,'boolean','plpgsql',ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[],ARRAY['search_path=""']::text[]),
 ('erp_private.employee_permission(bigint,text)','085fd40f2b0b84e88328b3a824fd5390',true,false,'boolean','sql',ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[],ARRAY['search_path=""']::text[]),
 ('erp_private.hr_document_evidence_allowed(bigint)','892d03dde992a824f8575f11e62765b3',true,false,'boolean','sql',ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[],ARRAY['search_path=""']::text[]),
 ('erp_private.onboarding_permission(bigint,bigint,text)','76dddd0f7bbfc2690370c8d4bc203c8a',true,false,'boolean','sql',ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[],ARRAY['search_path=""']::text[]),
 ('erp_private.permission_in_scope(text,bigint,bigint)','ce520fb29b4a68564fcbf9285a4a741e',true,false,'boolean','sql',ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[],ARRAY['search_path=""']::text[]),
 ('erp_private.read_documents()','0f0eab71e21aa2f965c08bd6f5f31810',true,true,'public.dms_documents','sql',ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[],ARRAY['search_path=""']::text[]),
 ('erp_private.read_hr_candidates()','20f3b50f8cb7f24451e8dabdccb3d7ca',true,true,'public.hr_candidates','sql',ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[],ARRAY['search_path=""']::text[]),
 ('erp_private.readable_employee_ids()','bc725a99d93ad584f0397033eacbdfd1',true,true,'bigint','sql',ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[],ARRAY['search_path=""']::text[]),
 ('erp_private.recruitment_document_evidence_allowed(bigint)','dd2c040f3ebccaedc9092fc5c887d4e2',true,false,'boolean','sql',ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[],ARRAY['search_path=""']::text[]),
 ('erp_private.recruitment_scope(bigint,bigint,text)','f4df364cdbc2dc54f06fa891e985c19f',true,false,'boolean','sql',ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[],ARRAY['search_path=""']::text[]),
 ('erp_private.session_is_valid()','2f7967c0b825bdf25349226744f74d3a',true,false,'boolean','sql',ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[],ARRAY['search_path=""']::text[]),
 ('public.current_user_can_view_employee_medical(bigint)','ec518513e6b9594c908a77caf204554f',false,false,'boolean','sql',ARRAY['=X/postgres','anon=X/postgres','authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[],ARRAY['search_path=""']::text[]),
 ('public.current_user_can_view_employee(bigint)','80500374fc013e8ba0f345cfd394f2e1',false,false,'boolean','sql',ARRAY['=X/postgres','anon=X/postgres','authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[],ARRAY['search_path=""']::text[]),
 ('public.current_user_is_global_admin()','5375091be37487c37872452fa3837466',true,false,'boolean','sql',ARRAY['anon=X/postgres','authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[],ARRAY['search_path=pg_catalog, public, pg_temp']::text[]),
 ('public.current_user_profile_id()','3ae97eed6dcb16e61291a1b8a5998b21',true,false,'bigint','sql',ARRAY['anon=X/postgres','authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']::text[],ARRAY['search_path=""']::text[])
 ) v(signature,hash,definer,returns_set,return_type,language_name,acl,config) LOOP
  SELECT * INTO actual FROM pg_proc WHERE oid=to_regprocedure(expected.signature);
  SELECT array_agg(entry::text ORDER BY entry::text) INTO acl FROM unnest(actual.proacl) entry;
  IF actual.oid IS NULL OR md5(actual.prosrc) IS DISTINCT FROM expected.hash
   OR pg_get_userbyid(actual.proowner) IS DISTINCT FROM 'postgres'
   OR actual.prosecdef IS DISTINCT FROM expected.definer OR actual.proretset IS DISTINCT FROM expected.returns_set
   OR actual.prorettype IS DISTINCT FROM to_regtype(expected.return_type)
   OR actual.prolang IS DISTINCT FROM (SELECT oid FROM pg_language WHERE lanname=expected.language_name)
   OR actual.prokind<>'f' OR actual.proisstrict OR actual.proleakproof OR actual.proparallel<>'u'
   OR actual.pronargdefaults<>0 OR actual.prosqlbody IS NOT NULL OR actual.probin IS NOT NULL
   OR actual.prosupport<>0 OR actual.provariadic<>0 OR actual.provolatile<>'s'
   OR actual.proconfig IS DISTINCT FROM expected.config OR acl IS DISTINCT FROM expected.acl
  THEN RAISE EXCEPTION 'Document lineage prerequisite drift: %',expected.signature; END IF;
 END LOOP;
 -- NOT IN is equivalent to the point gate only while the relevant IDs cannot be NULL.
 FOR expected IN SELECT * FROM (VALUES ('employees','id'),('dms_document_links','entity_id'),
  ('hr_candidates','id'),('hr_candidate_documents','candidate_id'),('dms_documents','id')) v(tbl,col) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.'||expected.tbl)
   AND attname=expected.col AND attnotnull AND NOT attisdropped)
  THEN RAISE EXCEPTION 'Document lineage required non-null subject changed: %.%',expected.tbl,expected.col; END IF;
 END LOOP;
 FOR expected IN SELECT * FROM (VALUES
 ('public.dms_document_links','[{"cmd":"ALL","qual":"(erp_private.document_permission(document_id, ''dms.documents.edit''::text) OR public.current_user_has_role(''system_admin''::text))","roles":["authenticated"],"tablename":"dms_document_links","permissive":"PERMISSIVE","policyname":"dms_links_manage","schemaname":"public","with_check":null},{"cmd":"SELECT","qual":"((auth.uid() IS NOT NULL) AND erp_private.document_permission(document_id, ''dms.documents.view''::text) AND public.current_user_can_view_dms_document(document_id))","roles":["authenticated"],"tablename":"dms_document_links","permissive":"PERMISSIVE","policyname":"dms_links_select","schemaname":"public","with_check":null},{"cmd":"ALL","qual":"erp_private.document_permission(document_id, ''dms.documents.view''::text)","roles":["authenticated"],"tablename":"dms_document_links","permissive":"RESTRICTIVE","policyname":"f03_document_subject","schemaname":"public","with_check":"erp_private.document_permission(document_id, ''dms.documents.view''::text)"},{"cmd":"DELETE","qual":"((entity_type <> ''employee''::text) OR public.current_user_can_manage_employee(entity_id))","roles":["authenticated"],"tablename":"dms_document_links","permissive":"RESTRICTIVE","policyname":"f03_employee_document_link_delete","schemaname":"public","with_check":null},{"cmd":"INSERT","qual":null,"roles":["authenticated"],"tablename":"dms_document_links","permissive":"RESTRICTIVE","policyname":"f03_employee_document_link_insert","schemaname":"public","with_check":"((entity_type <> ''employee''::text) OR public.current_user_can_manage_employee(entity_id))"},{"cmd":"UPDATE","qual":"((entity_type <> ''employee''::text) OR public.current_user_can_manage_employee(entity_id))","roles":["authenticated"],"tablename":"dms_document_links","permissive":"RESTRICTIVE","policyname":"f03_employee_document_link_update","schemaname":"public","with_check":"((entity_type <> ''employee''::text) OR public.current_user_can_manage_employee(entity_id))"},{"cmd":"ALL","qual":"( SELECT erp_private.business_principal_is_active() AS business_principal_is_active)","roles":["authenticated"],"tablename":"dms_document_links","permissive":"RESTRICTIVE","policyname":"f03_principal","schemaname":"public","with_check":"( SELECT erp_private.business_principal_is_active() AS business_principal_is_active)"}]'::jsonb),
 ('public.dms_documents','[{"cmd":"DELETE","qual":"erp_private.document_permission(id, ''dms.documents.delete''::text)","roles":["authenticated"],"tablename":"dms_documents","permissive":"PERMISSIVE","policyname":"dms_documents_delete","schemaname":"public","with_check":null},{"cmd":"INSERT","qual":null,"roles":["authenticated"],"tablename":"dms_documents","permissive":"PERMISSIVE","policyname":"dms_documents_insert","schemaname":"public","with_check":"(erp_private.permission_in_scope(''dms.documents.upload''::text, owning_company_id, owning_branch_id) AND ((confidentiality_level = ANY (ARRAY[''internal''::text, ''company''::text])) OR ((confidentiality_level = ANY (ARRAY[''hr''::text, ''finance''::text, ''legal''::text, ''executive''::text])) AND erp_private.permission_in_scope((''dms.documents.view.''::text || confidentiality_level), owning_company_id, owning_branch_id))))"},{"cmd":"SELECT","qual":"((auth.uid() IS NOT NULL) AND public.current_user_can_view_dms_document(id))","roles":["public"],"tablename":"dms_documents","permissive":"PERMISSIVE","policyname":"dms_documents_select","schemaname":"public","with_check":null},{"cmd":"UPDATE","qual":"erp_private.document_permission(id, ''dms.documents.edit''::text)","roles":["authenticated"],"tablename":"dms_documents","permissive":"PERMISSIVE","policyname":"dms_documents_update","schemaname":"public","with_check":"(erp_private.permission_in_scope(''dms.documents.edit''::text, owning_company_id, owning_branch_id) AND ((confidentiality_level = ANY (ARRAY[''internal''::text, ''company''::text])) OR ((confidentiality_level = ANY (ARRAY[''hr''::text, ''finance''::text, ''legal''::text, ''executive''::text])) AND erp_private.permission_in_scope((''dms.documents.view.''::text || confidentiality_level), owning_company_id, owning_branch_id))))"},{"cmd":"ALL","qual":"( SELECT erp_private.business_principal_is_active() AS business_principal_is_active)","roles":["authenticated"],"tablename":"dms_documents","permissive":"RESTRICTIVE","policyname":"f03_principal","schemaname":"public","with_check":"( SELECT erp_private.business_principal_is_active() AS business_principal_is_active)"}]'::jsonb),
 ('public.dms_notification_queue','[{"cmd":"SELECT","qual":"((auth.uid() IS NOT NULL) AND ((recipient_user_id = public.current_user_profile_id()) OR erp_private.document_permission(document_id, ''dms.admin''::text) OR erp_private.document_permission(document_id, ''dms.notifications.admin''::text) OR erp_private.document_permission(document_id, ''dms.notifications.manage''::text) OR public.current_user_is_global_admin()))","roles":["authenticated"],"tablename":"dms_notification_queue","permissive":"PERMISSIVE","policyname":"dms_notif_select","schemaname":"public","with_check":null},{"cmd":"ALL","qual":"(erp_private.document_permission(document_id, ''dms.admin''::text) OR public.current_user_has_role(''system_admin''::text))","roles":["authenticated"],"tablename":"dms_notification_queue","permissive":"PERMISSIVE","policyname":"dms_notif_write","schemaname":"public","with_check":"(erp_private.document_permission(document_id, ''dms.admin''::text) OR public.current_user_has_role(''system_admin''::text))"},{"cmd":"ALL","qual":"erp_private.document_permission(document_id, ''dms.documents.view''::text)","roles":["authenticated"],"tablename":"dms_notification_queue","permissive":"RESTRICTIVE","policyname":"f03_document_subject","schemaname":"public","with_check":"erp_private.document_permission(document_id, ''dms.documents.view''::text)"},{"cmd":"ALL","qual":"( SELECT erp_private.business_principal_is_active() AS business_principal_is_active)","roles":["authenticated"],"tablename":"dms_notification_queue","permissive":"RESTRICTIVE","policyname":"f03_principal","schemaname":"public","with_check":"( SELECT erp_private.business_principal_is_active() AS business_principal_is_active)"}]'::jsonb),
 ('public.hr_candidate_documents','[{"cmd":"ALL","qual":"( SELECT erp_private.business_principal_is_active() AS business_principal_is_active)","roles":["authenticated"],"tablename":"hr_candidate_documents","permissive":"RESTRICTIVE","policyname":"f03_principal","schemaname":"public","with_check":"( SELECT erp_private.business_principal_is_active() AS business_principal_is_active)"},{"cmd":"DELETE","qual":"(erp_private.candidate_permission(candidate_id, ''hr.recruitment.manage''::text) AND erp_private.document_permission(dms_document_id, ''dms.documents.view''::text))","roles":["authenticated"],"tablename":"hr_candidate_documents","permissive":"PERMISSIVE","policyname":"hr_candidate_documents_delete","schemaname":"public","with_check":null},{"cmd":"INSERT","qual":null,"roles":["authenticated"],"tablename":"hr_candidate_documents","permissive":"PERMISSIVE","policyname":"hr_candidate_documents_insert","schemaname":"public","with_check":"(erp_private.candidate_permission(candidate_id, ''hr.recruitment.manage''::text) AND erp_private.document_permission(dms_document_id, ''dms.documents.view''::text))"},{"cmd":"SELECT","qual":"(erp_private.candidate_permission(candidate_id, ''hr.recruitment.view''::text) AND erp_private.document_permission(dms_document_id, ''dms.documents.view''::text))","roles":["authenticated"],"tablename":"hr_candidate_documents","permissive":"PERMISSIVE","policyname":"hr_candidate_documents_select","schemaname":"public","with_check":null},{"cmd":"UPDATE","qual":"(erp_private.candidate_permission(candidate_id, ''hr.recruitment.manage''::text) AND erp_private.document_permission(dms_document_id, ''dms.documents.view''::text))","roles":["authenticated"],"tablename":"hr_candidate_documents","permissive":"PERMISSIVE","policyname":"hr_candidate_documents_update","schemaname":"public","with_check":"(erp_private.candidate_permission(candidate_id, ''hr.recruitment.manage''::text) AND erp_private.document_permission(dms_document_id, ''dms.documents.view''::text))"}]'::jsonb)
 ) v(name,policies) LOOP
  SELECT c.relrowsecurity,pg_get_userbyid(c.relowner) owner,c.relkind INTO relation FROM pg_class c WHERE c.oid=to_regclass(expected.name);
  IF relation.relrowsecurity IS DISTINCT FROM true OR relation.owner IS DISTINCT FROM 'postgres' OR relation.relkind IS DISTINCT FROM 'r'
   OR (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p
      WHERE p.schemaname='public' AND p.tablename=split_part(expected.name,'.',2)) IS DISTINCT FROM expected.policies
  THEN RAISE EXCEPTION 'Document lineage policy/RLS prerequisite drift: %',expected.name; END IF;
 END LOOP;
 -- Remember immutable dependencies and relation/column privileges for exact same-transaction verification.
 PERFORM set_config('integration_lineage.unchanged',jsonb_build_object(
  'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN
   (SELECT to_regprocedure(s) FROM unnest(signatures) s WHERE s NOT IN('erp_private.document_permission(bigint,text)','erp_private.read_documents()'))),
  'relations',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c WHERE c.oid IN
   ('public.dms_documents'::regclass,'public.dms_document_links'::regclass,'public.hr_candidate_documents'::regclass,'public.dms_notification_queue'::regclass)),
  'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a WHERE a.attrelid IN
   ('public.dms_documents'::regclass,'public.dms_document_links'::regclass,'public.hr_candidate_documents'::regclass,'public.dms_notification_queue'::regclass)),
  'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p WHERE p.polrelid IN
   ('public.dms_documents'::regclass,'public.dms_document_links'::regclass,'public.hr_candidate_documents'::regclass,'public.dms_notification_queue'::regclass)),
  'replacedMetadata',(SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN
   ('erp_private.document_permission(bigint,text)'::regprocedure,'erp_private.read_documents()'::regprocedure))
 )::text,true);
END $lineage_preimage$;

-- Only these six reviewed bodies are adopted. Old HR/recruitment evidence wrappers stay unchanged.
-- Selected body provenance: 20261003084455_perf_linked_employee_gate.sql; MD5 1c6c7a6c40749c9bea0e28cc99e03595
CREATE OR REPLACE FUNCTION erp_private.document_permission(document_id bigint, capability text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE doc public.dms_documents; can_view boolean; can_sensitive boolean; can_action boolean;
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN RETURN false; END IF;
 SELECT * INTO doc FROM public.dms_documents WHERE id=$1 AND deleted_at IS NULL;
 IF doc.id IS NULL THEN RETURN false; END IF;
 IF public.current_user_is_global_admin() THEN RETURN true; END IF;
 -- Retain the frozen baseline's linked recruitment and HR evidence gates.
 IF NOT erp_private.recruitment_document_evidence_allowed($1) THEN RETURN false; END IF;
 IF NOT erp_private.hr_document_evidence_allowed($1) THEN RETURN false; END IF;
 IF doc.confidentiality_level NOT IN ('internal','company','hr','finance','legal','executive') THEN RETURN false; END IF;
 SELECT
   coalesce(bool_or(p.permission_code IN ('dms.documents.view','dms.admin')),false),
   coalesce(bool_or(p.permission_code='dms.documents.view.'||doc.confidentiality_level),false),
   coalesce(bool_or(p.permission_code=$2),false)
 INTO can_view,can_sensitive,can_action
 FROM public.user_profiles up
 JOIN public.user_roles ur ON ur.user_profile_id=up.id
 JOIN public.roles r ON r.id=ur.role_id
 JOIN public.role_permissions rp ON rp.role_id=r.id
 JOIN public.permissions p ON p.id=rp.permission_id
 WHERE up.auth_user_id=(SELECT auth.uid()) AND ur.is_active AND r.is_active AND p.is_active
   AND ((ur.owner_company_id IS NULL AND ur.branch_id IS NULL)
     OR (ur.owner_company_id=doc.owning_company_id AND (ur.branch_id IS NULL OR ur.branch_id=doc.owning_branch_id)));
 IF NOT can_view THEN RETURN false; END IF;
 IF doc.confidentiality_level NOT IN ('internal','company') AND NOT can_sensitive THEN RETURN false; END IF;
 IF $2<>'dms.documents.view' AND NOT can_action THEN RETURN false; END IF;
 -- Preserve all employee, medical and dependent subject requirements.
 IF EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=$1 AND l.deleted_at IS NULL AND l.entity_type='employee'
   AND l.entity_id NOT IN (SELECT erp_private.readable_employee_ids())) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.employee_medical_records m WHERE m.dms_document_id=$1 AND m.deleted_at IS NULL
   AND NOT public.current_user_can_view_employee_medical(m.employee_id)) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.employee_dependents d WHERE d.dms_document_id=$1 AND d.deleted_at IS NULL
   AND NOT (public.current_user_can_view_employee(d.employee_id) AND erp_private.employee_permission(d.employee_id,'hr.compliance.view'))) THEN RETURN false; END IF;
 RETURN true;
END $function$;

-- Selected body provenance: 20261001222443_perf_document_subject_reads.sql; MD5 6d025f4b9359e7685d1085f2179b40b0
CREATE FUNCTION erp_private.perf_hr_document_subjects_allowed(document_id bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
 SELECT NOT EXISTS (
  SELECT 1 FROM (
   SELECT employee_id,ARRAY['hr.compliance.view'] caps FROM public.employee_access_cards WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.assignments.view'] FROM public.employee_assets WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.actions.view','hr.confidential.view'] FROM public.employee_disciplinary_records WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.eos.view'] FROM public.employee_eos_cases WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.actions.view'] FROM public.employee_hr_actions WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.compliance.view'] FROM public.employee_identity_documents WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.medical.view'] FROM public.employee_medical_insurances WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.medical.view'] FROM public.employee_medical_records WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.actions.view','hr.confidential.view'] FROM public.employee_performance_records WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.assignments.view'] FROM public.employee_ppe_issues WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.actions.view'] FROM public.employee_pro_processes WHERE related_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.compliance.view'] FROM public.employee_training_certificates WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.compliance.view'] FROM public.employee_dependents WHERE dms_document_id=$1 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,CASE WHEN related_record_type IN ('medical_record','medical_insurance') THEN ARRAY['hr.medical.view'] ELSE ARRAY[]::text[] END
    FROM public.employee_document_links WHERE dms_document_id=$1 AND deleted_at IS NULL
  ) linked WHERE NOT public.current_user_can_view_employee(linked.employee_id)
   OR EXISTS(SELECT 1 FROM unnest(linked.caps) c WHERE NOT erp_private.employee_permission(linked.employee_id,c))
 );
$_$;

-- Selected body provenance: 20261001222443_perf_document_subject_reads.sql; MD5 68539a4aa725e86fa64e50e60b114f90
CREATE FUNCTION erp_private.perf_recruitment_document_subjects_allowed(document_id bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
 SELECT NOT EXISTS(SELECT 1 FROM public.hr_candidate_documents c WHERE c.dms_document_id=$1 AND c.deleted_at IS NULL
  AND NOT erp_private.candidate_permission(c.candidate_id,'hr.recruitment.view')) AND
 NOT EXISTS(SELECT 1 FROM public.hr_offers o WHERE o.offer_document_id=$1 AND o.deleted_at IS NULL AND NOT
  (erp_private.candidate_permission(o.candidate_id,'hr.recruitment.view')
   AND erp_private.recruitment_scope(o.owner_company_id,o.branch_id,'hr.recruitment.view')
   AND erp_private.permission_in_scope('hr.payroll.view',o.owner_company_id,o.branch_id))) AND
 NOT EXISTS(SELECT 1 FROM public.hr_onboarding_tasks t WHERE t.dms_document_id=$1 AND t.deleted_at IS NULL
  AND NOT erp_private.onboarding_permission(t.candidate_id,t.employee_id,'hr.recruitment.view'));
$_$;

-- Selected body provenance: 20261003084455_perf_linked_employee_gate.sql; MD5 0740033a5d712f7e883dbff80680e2cb
CREATE OR REPLACE FUNCTION erp_private.read_documents_filtered_v2(document_ids bigint[], document_statuses text[], excluded_statuses text[])
 RETURNS SETOF public.dms_documents
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 WITH principal AS MATERIALIZED (
   SELECT auth.uid() uid, erp_private.business_principal_is_active() active,
     public.current_user_is_global_admin() global_admin, public.current_user_profile_id() profile_id
 ), capability_scopes AS MATERIALIZED (
   SELECT DISTINCT ur.owner_company_id, ur.branch_id, p.permission_code
   FROM principal actor JOIN public.user_roles ur ON ur.user_profile_id=actor.profile_id
   JOIN public.roles r ON r.id=ur.role_id JOIN public.role_permissions rp ON rp.role_id=r.id
   JOIN public.permissions p ON p.id=rp.permission_id
   WHERE actor.uid IS NOT NULL AND actor.active AND ur.is_active AND r.is_active AND p.is_active
     AND p.permission_code IN ('dms.documents.view','dms.admin','dms.documents.preview',
       'dms.documents.view.hr','dms.documents.view.finance','dms.documents.view.legal','dms.documents.view.executive')
 )
 SELECT projected.*
 FROM principal actor CROSS JOIN public.dms_documents d
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.dms_documents,
   CASE WHEN actor.global_admin OR EXISTS (SELECT 1 FROM capability_scopes s
     WHERE s.permission_code='dms.documents.preview' AND ((s.owner_company_id IS NULL AND s.branch_id IS NULL)
       OR (s.owner_company_id=d.owning_company_id AND (s.branch_id IS NULL OR s.branch_id=d.owning_branch_id))))
   THEN to_jsonb(d) ELSE (to_jsonb(d)-ARRAY['ai_summary','content_tsv','summary_embedding','ai_summary_error','summary_embedding_error','ai_warnings_json','ai_risk_reasons_json']) || jsonb_build_object('content_tsv',to_tsvector('simple',concat_ws(' ',d.document_no,d.title,d.description,d.legacy_document_code))) END) AS projected
 WHERE actor.uid IS NOT NULL AND actor.active AND d.deleted_at IS NULL
   AND (document_ids IS NULL OR d.id=ANY(document_ids))
   AND (document_statuses IS NULL OR d.status=ANY(document_statuses))
   AND (excluded_statuses IS NULL OR d.status<>ALL(excluded_statuses))
   AND (actor.global_admin OR (
     d.confidentiality_level IN ('internal','company','hr','finance','legal','executive')
     AND EXISTS (SELECT 1 FROM capability_scopes s WHERE s.permission_code IN ('dms.documents.view','dms.admin')
       AND ((s.owner_company_id IS NULL AND s.branch_id IS NULL)
         OR (s.owner_company_id=d.owning_company_id AND (s.branch_id IS NULL OR s.branch_id=d.owning_branch_id))))
     AND (d.confidentiality_level IN ('internal','company') OR EXISTS (
       SELECT 1 FROM capability_scopes s WHERE s.permission_code='dms.documents.view.'||d.confidentiality_level
         AND ((s.owner_company_id IS NULL AND s.branch_id IS NULL)
           OR (s.owner_company_id=d.owning_company_id AND (s.branch_id IS NULL OR s.branch_id=d.owning_branch_id)))))
     AND erp_private.perf_recruitment_document_subjects_allowed(d.id)
     AND erp_private.perf_hr_document_subjects_allowed(d.id)
     AND NOT EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.deleted_at IS NULL AND l.entity_type='employee'
       AND l.entity_id NOT IN (SELECT erp_private.readable_employee_ids()))
     AND NOT EXISTS(SELECT 1 FROM public.employee_medical_records m WHERE m.dms_document_id=d.id AND m.deleted_at IS NULL
       AND NOT public.current_user_can_view_employee_medical(m.employee_id))
     AND NOT EXISTS(SELECT 1 FROM public.employee_dependents child WHERE child.dms_document_id=d.id AND child.deleted_at IS NULL
       AND NOT (public.current_user_can_view_employee(child.employee_id) AND erp_private.employee_permission(child.employee_id,'hr.compliance.view')))
   ));
$function$;

-- Selected body provenance: 20261001213535_perf_expiry_document_reads.sql; MD5 c95a1a5ba0facbcb902b429be8a29a12
CREATE OR REPLACE FUNCTION erp_private.read_documents_filtered(document_ids bigint[], document_statuses text[])
RETURNS SETOF public.dms_documents LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT * FROM erp_private.read_documents_filtered_v2(document_ids,document_statuses,NULL);
$$;

-- Selected body provenance: 20261001202515_perf_filtered_document_reads.sql; MD5 6bc7814a408d77990df6e20bb2c58033
CREATE OR REPLACE FUNCTION erp_private.read_documents() RETURNS SETOF public.dms_documents
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT * FROM erp_private.read_documents_filtered(NULL,NULL);
$$;

-- Existing replaced-function ACLs are retained by CREATE OR REPLACE. Four new private helpers only.
REVOKE ALL ON FUNCTION erp_private.perf_hr_document_subjects_allowed(bigint),
 erp_private.perf_recruitment_document_subjects_allowed(bigint),
 erp_private.read_documents_filtered(bigint[],text[]),
 erp_private.read_documents_filtered_v2(bigint[],text[],text[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.read_documents_filtered(bigint[],text[]),
 erp_private.read_documents_filtered_v2(bigint[],text[],text[]) TO authenticated;

DO $lineage_postimage$
DECLARE expected record; v_actual_proc record; acl text[]; unchanged jsonb; signatures text[] := ARRAY['erp_private.business_principal_is_active()','erp_private.candidate_permission(bigint,text)','erp_private.employee_permission(bigint,text)','erp_private.hr_document_evidence_allowed(bigint)','erp_private.onboarding_permission(bigint,bigint,text)','erp_private.permission_in_scope(text,bigint,bigint)','erp_private.read_hr_candidates()','erp_private.readable_employee_ids()','erp_private.recruitment_document_evidence_allowed(bigint)','erp_private.recruitment_scope(bigint,bigint,text)','erp_private.session_is_valid()','public.current_user_can_view_employee_medical(bigint)','public.current_user_can_view_employee(bigint)','public.current_user_is_global_admin()','public.current_user_profile_id()'];
BEGIN
 FOR expected IN SELECT * FROM(VALUES
  ('erp_private.document_permission(bigint,text)','1c6c7a6c40749c9bea0e28cc99e03595',false,'boolean','plpgsql',false),
  ('erp_private.read_documents()','6bc7814a408d77990df6e20bb2c58033',true,'public.dms_documents','sql',false),
  ('erp_private.read_documents_filtered(bigint[],text[])','c95a1a5ba0facbcb902b429be8a29a12',true,'public.dms_documents','sql',false),
  ('erp_private.read_documents_filtered_v2(bigint[],text[],text[])','0740033a5d712f7e883dbff80680e2cb',true,'public.dms_documents','sql',false),
  ('erp_private.perf_hr_document_subjects_allowed(bigint)','6d025f4b9359e7685d1085f2179b40b0',false,'boolean','sql',true),
  ('erp_private.perf_recruitment_document_subjects_allowed(bigint)','68539a4aa725e86fa64e50e60b114f90',false,'boolean','sql',true)
 )v(signature,hash,returns_set,return_type,language_name,owner_only) LOOP
  SELECT * INTO STRICT v_actual_proc FROM pg_proc WHERE oid=to_regprocedure(expected.signature);
  SELECT array_agg(entry::text ORDER BY entry::text) INTO acl FROM unnest(v_actual_proc.proacl) entry;
  IF md5(v_actual_proc.prosrc)<>expected.hash OR NOT v_actual_proc.prosecdef OR v_actual_proc.proretset<>expected.returns_set
   OR v_actual_proc.prorettype<>to_regtype(expected.return_type) OR v_actual_proc.prolang<>(SELECT oid FROM pg_language WHERE lanname=expected.language_name)
   OR v_actual_proc.prokind<>'f' OR v_actual_proc.proisstrict OR v_actual_proc.proleakproof OR v_actual_proc.proparallel<>'u' OR v_actual_proc.pronargdefaults<>0
   OR v_actual_proc.prosqlbody IS NOT NULL OR v_actual_proc.probin IS NOT NULL OR v_actual_proc.prosupport<>0 OR v_actual_proc.provariadic<>0
   OR pg_get_userbyid(v_actual_proc.proowner)<>'postgres' OR v_actual_proc.provolatile<>'s' OR v_actual_proc.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
   OR acl IS DISTINCT FROM (CASE WHEN expected.owner_only THEN ARRAY['postgres=X/postgres'] ELSE ARRAY['authenticated=X/postgres','postgres=X/postgres'] END)::text[]
  THEN RAISE EXCEPTION 'Document lineage postimage/ACL mismatch: %',expected.signature; END IF;
 END LOOP;
 unchanged:=jsonb_build_object(
  'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN(SELECT to_regprocedure(s) FROM unnest(signatures) s)),
  'relations',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c WHERE c.oid IN
   ('public.dms_documents'::regclass,'public.dms_document_links'::regclass,'public.hr_candidate_documents'::regclass,'public.dms_notification_queue'::regclass)),
  'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a WHERE a.attrelid IN
   ('public.dms_documents'::regclass,'public.dms_document_links'::regclass,'public.hr_candidate_documents'::regclass,'public.dms_notification_queue'::regclass)),
  'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p WHERE p.polrelid IN
   ('public.dms_documents'::regclass,'public.dms_document_links'::regclass,'public.hr_candidate_documents'::regclass,'public.dms_notification_queue'::regclass)),
  'replacedMetadata',(SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN
   ('erp_private.document_permission(bigint,text)'::regprocedure,'erp_private.read_documents()'::regprocedure))
 );
 IF unchanged IS DISTINCT FROM current_setting('integration_lineage.unchanged')::jsonb
 THEN RAISE EXCEPTION 'Document lineage modified immutable authority, policy, schema or privileges'; END IF;
END $lineage_postimage$;
COMMIT;
