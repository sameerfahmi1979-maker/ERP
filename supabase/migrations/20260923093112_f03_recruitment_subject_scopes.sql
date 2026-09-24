BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Recruitment children inherit their actual requisition scope. A record without
-- a requisition has no safe company boundary and requires a global capability.
CREATE OR REPLACE FUNCTION erp_private.recruitment_scope(company_id bigint, branch_id bigint, capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.business_principal_is_active()
 AND ($2 IS NULL OR EXISTS(SELECT 1 FROM public.branches b WHERE b.id=$2 AND b.owner_company_id=$1))
 AND (erp_private.permission_in_scope($3,$1,$2)
   OR ($3='hr.recruitment.view' AND erp_private.permission_in_scope('hr.recruitment.manage',$1,$2)));
$$;
CREATE OR REPLACE FUNCTION erp_private.requisition_permission(requisition_id bigint, capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN $1 IS NULL THEN erp_private.recruitment_scope(NULL,NULL,$2)
 ELSE EXISTS(SELECT 1 FROM public.hr_job_requisitions r WHERE r.id=$1 AND r.deleted_at IS NULL
  AND erp_private.recruitment_scope(r.owner_company_id,r.branch_id,$2)) END;
$$;
CREATE OR REPLACE FUNCTION erp_private.candidate_permission(candidate_id bigint, capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.hr_candidates c WHERE c.id=$1 AND c.deleted_at IS NULL
  AND erp_private.requisition_permission(c.requisition_id,$2));
$$;
CREATE OR REPLACE FUNCTION erp_private.onboarding_permission(candidate_id bigint, employee_id bigint, capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.business_principal_is_active()
 AND CASE WHEN $1 IS NULL AND $2 IS NULL THEN erp_private.recruitment_scope(NULL,NULL,$3)
 ELSE ($1 IS NULL OR erp_private.candidate_permission($1,$3)) AND
 ($2 IS NULL OR EXISTS(SELECT 1 FROM public.employees e WHERE e.id=$2 AND e.deleted_at IS NULL
   AND public.current_user_can_view_employee(e.id) AND erp_private.recruitment_scope(e.owner_company_id,e.branch_id,$3))) END;
$$;
REVOKE ALL ON FUNCTION erp_private.recruitment_scope(bigint,bigint,text),erp_private.requisition_permission(bigint,text),
 erp_private.candidate_permission(bigint,text),erp_private.onboarding_permission(bigint,bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.recruitment_scope(bigint,bigint,text),erp_private.requisition_permission(bigint,text),
 erp_private.candidate_permission(bigint,text),erp_private.onboarding_permission(bigint,bigint,text) TO authenticated;

DO $$ DECLARE p record; cap text; predicate text; BEGIN
 FOR p IN SELECT * FROM pg_policies WHERE schemaname='public' AND permissive='PERMISSIVE' AND tablename IN
 ('hr_job_requisitions','hr_candidates','hr_candidate_documents','hr_interviews','hr_offers','hr_onboarding_tasks') LOOP
  IF p.cmd NOT IN ('SELECT','INSERT','UPDATE','DELETE') THEN RAISE EXCEPTION 'Unexpected recruitment policy %',p.policyname; END IF;
  cap:=CASE WHEN p.cmd='SELECT' THEN 'hr.recruitment.view' ELSE 'hr.recruitment.manage' END;
  predicate:=CASE p.tablename
   WHEN 'hr_job_requisitions' THEN format('erp_private.recruitment_scope(owner_company_id,branch_id,%L)',cap)
   WHEN 'hr_candidates' THEN format('erp_private.requisition_permission(requisition_id,%L)',cap)
   WHEN 'hr_candidate_documents' THEN format('erp_private.candidate_permission(candidate_id,%L) AND erp_private.document_permission(dms_document_id,''dms.documents.view'')',cap)
   WHEN 'hr_interviews' THEN format('erp_private.candidate_permission(candidate_id,%L) AND (requisition_id IS NULL OR erp_private.requisition_permission(requisition_id,%L))',cap,cap)
   WHEN 'hr_offers' THEN format('erp_private.candidate_permission(candidate_id,%L) AND erp_private.recruitment_scope(owner_company_id,branch_id,%L) AND (requisition_id IS NULL OR erp_private.requisition_permission(requisition_id,%L))',cap,cap,cap)
   WHEN 'hr_onboarding_tasks' THEN format('erp_private.onboarding_permission(candidate_id,employee_id,%L)',cap) END;
  EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated%s%s',p.policyname,p.tablename,p.cmd,
   CASE WHEN p.cmd='INSERT' THEN '' ELSE ' USING ('||predicate||')' END,
   CASE WHEN p.cmd IN ('INSERT','UPDATE') THEN ' WITH CHECK ('||predicate||')' ELSE '' END);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION erp_private.recruitment_document_evidence_allowed(document_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.business_principal_is_active() AND
 NOT EXISTS(SELECT 1 FROM public.hr_candidate_documents c WHERE c.dms_document_id=$1 AND c.deleted_at IS NULL
  AND NOT erp_private.candidate_permission(c.candidate_id,'hr.recruitment.view')) AND
 NOT EXISTS(SELECT 1 FROM public.hr_offers o WHERE o.offer_document_id=$1 AND o.deleted_at IS NULL AND NOT
  (erp_private.candidate_permission(o.candidate_id,'hr.recruitment.view')
   AND erp_private.recruitment_scope(o.owner_company_id,o.branch_id,'hr.recruitment.view')
   AND erp_private.permission_in_scope('hr.payroll.view',o.owner_company_id,o.branch_id))) AND
 NOT EXISTS(SELECT 1 FROM public.hr_onboarding_tasks t WHERE t.dms_document_id=$1 AND t.deleted_at IS NULL
  AND NOT erp_private.onboarding_permission(t.candidate_id,t.employee_id,'hr.recruitment.view'));
$$;
REVOKE ALL ON FUNCTION erp_private.recruitment_document_evidence_allowed(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.recruitment_document_evidence_allowed(bigint) TO authenticated;
DO $$ DECLARE definition text; anchor text:='IF public.current_user_is_global_admin() THEN RETURN true; END IF;'; BEGIN
 SELECT pg_get_functiondef('erp_private.document_permission(bigint,text)'::regprocedure) INTO definition;
 IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'Document policy changed: review required'; END IF;
 EXECUTE replace(definition,anchor,anchor||E'\n IF NOT erp_private.recruitment_document_evidence_allowed($1) THEN RETURN false; END IF;');
END $$;

-- Other recruitment links may point at confidential DMS records. Inspect both
-- old and new attachment identities; ordinary task edits do not change links.
CREATE OR REPLACE FUNCTION erp_private.protect_recruitment_document_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE new_id bigint; old_id bigint; BEGIN
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 new_id:=nullif(to_jsonb(NEW)->>TG_ARGV[0],'')::bigint;
 IF TG_OP='UPDATE' THEN old_id:=nullif(to_jsonb(OLD)->>TG_ARGV[0],'')::bigint; END IF;
 IF new_id IS NOT DISTINCT FROM old_id THEN RETURN NEW; END IF;
 IF (new_id IS NOT NULL AND NOT erp_private.document_permission(new_id,'dms.documents.view'))
 OR (old_id IS NOT NULL AND NOT erp_private.document_permission(old_id,'dms.documents.view')) THEN
  RAISE EXCEPTION 'Document access required for attachment change' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.protect_recruitment_document_link() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f03_offer_attachment BEFORE INSERT OR UPDATE ON public.hr_offers FOR EACH ROW
 EXECUTE FUNCTION erp_private.protect_recruitment_document_link('offer_document_id');
CREATE TRIGGER f03_onboarding_attachment BEFORE INSERT OR UPDATE ON public.hr_onboarding_tasks FOR EACH ROW
 EXECUTE FUNCTION erp_private.protect_recruitment_document_link('dms_document_id');
NOTIFY pgrst,'reload schema';
COMMIT;
