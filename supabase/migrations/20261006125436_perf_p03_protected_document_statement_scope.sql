BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Stop if reviewed F03 source has changed. No policy, ACL or owner change.
DO $preimage$
BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='erp_private.read_documents()'::regprocedure)<>'2ea4362a721e786fef594900e3c62bbe'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='erp_private.document_permission(bigint,text)'::regprocedure)<>'2190943612f7b95620a97b76fb50fc84'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='erp_private.permission_in_scope(text,bigint,bigint)'::regprocedure)<>'ce520fb29b4a68564fcbf9285a4a741e'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='erp_private.hr_document_evidence_allowed(bigint)'::regprocedure)<>'892d03dde992a824f8575f11e62765b3'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='erp_private.recruitment_document_evidence_allowed(bigint)'::regprocedure)<>'dd2c040f3ebccaedc9092fc5c887d4e2'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='erp_private.candidate_permission(bigint,text)'::regprocedure)<>'86b6f4eedf17781f8af8cd5ed773cc22'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='erp_private.readable_employee_ids()'::regprocedure)<>'bc725a99d93ad584f0397033eacbdfd1'
 THEN RAISE EXCEPTION 'P03 reader preimage changed; security review required'; END IF;
END $preimage$;
-- Measured protected-read hotspot: repeated live-principal/role resolution
-- per document. Resolve the principal and scoped capabilities once per SQL
-- statement; retain every linked-subject guard and protected-field projection.
-- No persistent/session authorization cache and no policy/grant change.
CREATE OR REPLACE FUNCTION erp_private.read_documents() RETURNS SETOF public.dms_documents
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
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
 ), candidate_requisitions AS MATERIALIZED (
   SELECT DISTINCT c.requisition_id FROM public.hr_candidate_documents l
   JOIN public.hr_candidates c ON c.id=l.candidate_id AND c.deleted_at IS NULL
   WHERE l.deleted_at IS NULL
 ), requisition_decisions AS MATERIALIZED (
   SELECT r.requisition_id, erp_private.requisition_permission(r.requisition_id,'hr.recruitment.view') allowed
   FROM candidate_requisitions r
 ), blocked_candidate_documents AS MATERIALIZED (
   SELECT DISTINCT l.dms_document_id id FROM public.hr_candidate_documents l
   LEFT JOIN public.hr_candidates c ON c.id=l.candidate_id AND c.deleted_at IS NULL
   LEFT JOIN requisition_decisions r ON r.requisition_id IS NOT DISTINCT FROM c.requisition_id
   WHERE l.deleted_at IS NULL AND (c.id IS NULL OR r.allowed IS NOT TRUE)
 ), other_recruitment_documents AS MATERIALIZED (
   SELECT offer_document_id id FROM public.hr_offers WHERE deleted_at IS NULL AND offer_document_id IS NOT NULL
   UNION SELECT dms_document_id FROM public.hr_onboarding_tasks WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
 ), hr_documents AS MATERIALIZED (
   SELECT dms_document_id id FROM public.employee_access_cards WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
   UNION SELECT dms_document_id id FROM public.employee_assets WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
   UNION SELECT dms_document_id id FROM public.employee_disciplinary_records WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
   UNION SELECT dms_document_id id FROM public.employee_eos_cases WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
   UNION SELECT dms_document_id id FROM public.employee_hr_actions WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
   UNION SELECT dms_document_id id FROM public.employee_identity_documents WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
   UNION SELECT dms_document_id id FROM public.employee_medical_insurances WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
   UNION SELECT dms_document_id id FROM public.employee_medical_records WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
   UNION SELECT dms_document_id id FROM public.employee_performance_records WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
   UNION SELECT dms_document_id id FROM public.employee_ppe_issues WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
   UNION SELECT related_document_id id FROM public.employee_pro_processes WHERE deleted_at IS NULL AND related_document_id IS NOT NULL
   UNION SELECT dms_document_id id FROM public.employee_training_certificates WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
   UNION SELECT dms_document_id id FROM public.employee_dependents WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
   UNION SELECT dms_document_id id FROM public.employee_document_links WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
 )
 SELECT projected.*
 FROM principal actor CROSS JOIN public.dms_documents d
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.dms_documents,
   CASE WHEN actor.global_admin OR EXISTS (SELECT 1 FROM capability_scopes s
     WHERE s.permission_code='dms.documents.preview' AND ((s.owner_company_id IS NULL AND s.branch_id IS NULL)
       OR (s.owner_company_id=d.owning_company_id AND (s.branch_id IS NULL OR s.branch_id=d.owning_branch_id))))
   THEN to_jsonb(d) ELSE (to_jsonb(d)-ARRAY['ai_summary','content_tsv','summary_embedding','ai_summary_error','summary_embedding_error','ai_warnings_json','ai_risk_reasons_json']) || jsonb_build_object('content_tsv',to_tsvector('simple',concat_ws(' ',d.document_no,d.title,d.description,d.legacy_document_code))) END) AS projected
 WHERE actor.uid IS NOT NULL AND actor.active AND d.deleted_at IS NULL
   AND (actor.global_admin OR (
     d.confidentiality_level IN ('internal','company','hr','finance','legal','executive')
     AND EXISTS (SELECT 1 FROM capability_scopes s WHERE s.permission_code IN ('dms.documents.view','dms.admin')
       AND ((s.owner_company_id IS NULL AND s.branch_id IS NULL)
         OR (s.owner_company_id=d.owning_company_id AND (s.branch_id IS NULL OR s.branch_id=d.owning_branch_id))))
     AND (d.confidentiality_level IN ('internal','company') OR EXISTS (
       SELECT 1 FROM capability_scopes s WHERE s.permission_code='dms.documents.view.'||d.confidentiality_level
         AND ((s.owner_company_id IS NULL AND s.branch_id IS NULL)
           OR (s.owner_company_id=d.owning_company_id AND (s.branch_id IS NULL OR s.branch_id=d.owning_branch_id)))))
     -- All frozen linked-subject guards stay live. Reuse only the already
     -- verified request-local principal and role scope, not their decisions.
     AND NOT EXISTS(SELECT 1 FROM blocked_candidate_documents b WHERE b.id=d.id)
     AND CASE WHEN EXISTS(SELECT 1 FROM other_recruitment_documents r WHERE r.id=d.id)
       THEN erp_private.recruitment_document_evidence_allowed(d.id) ELSE true END
     AND CASE WHEN EXISTS(SELECT 1 FROM hr_documents h WHERE h.id=d.id)
       THEN erp_private.hr_document_evidence_allowed(d.id) ELSE true END
     AND NOT EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.deleted_at IS NULL AND l.entity_type='employee'
       AND l.entity_id NOT IN (SELECT erp_private.readable_employee_ids()))
     AND NOT EXISTS(SELECT 1 FROM public.employee_medical_records m WHERE m.dms_document_id=d.id AND m.deleted_at IS NULL
       AND NOT public.current_user_can_view_employee_medical(m.employee_id))
     AND NOT EXISTS(SELECT 1 FROM public.employee_dependents child WHERE child.dms_document_id=d.id AND child.deleted_at IS NULL
       AND NOT (public.current_user_can_view_employee(child.employee_id) AND erp_private.employee_permission(child.employee_id,'hr.compliance.view')))
   ));
$$;
-- CREATE OR REPLACE retains the existing private-function ACL and owner.
NOTIFY pgrst,'reload schema';
COMMIT;
