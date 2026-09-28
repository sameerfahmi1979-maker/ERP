BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION erp_private.document_permission(document_id bigint, capability text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE doc public.dms_documents;
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN RETURN false; END IF;
 SELECT * INTO doc FROM public.dms_documents WHERE id=$1 AND deleted_at IS NULL;
 IF doc.id IS NULL THEN RETURN false; END IF;
 IF public.current_user_is_global_admin() THEN RETURN true; END IF;
 IF NOT (erp_private.permission_in_scope('dms.documents.view',doc.owning_company_id,doc.owning_branch_id)
   OR erp_private.permission_in_scope('dms.admin',doc.owning_company_id,doc.owning_branch_id)) THEN RETURN false; END IF;
 IF doc.confidentiality_level NOT IN ('internal','company','hr','finance','legal','executive') THEN RETURN false; END IF;
 IF doc.confidentiality_level NOT IN ('internal','company') AND NOT erp_private.permission_in_scope('dms.documents.view.'||doc.confidentiality_level,doc.owning_company_id,doc.owning_branch_id) THEN RETURN false; END IF;
 IF $2<>'dms.documents.view' AND NOT erp_private.permission_in_scope($2,doc.owning_company_id,doc.owning_branch_id) THEN RETURN false; END IF;
 -- Owning/creating a document is not an exception to company, branch or sensitive-data rules.
 IF EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=$1 AND l.deleted_at IS NULL AND l.entity_type='employee'
   AND NOT public.current_user_can_view_employee(l.entity_id)) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.employee_medical_records m WHERE m.dms_document_id=$1 AND m.deleted_at IS NULL
   AND NOT public.current_user_can_view_employee_medical(m.employee_id)) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.employee_dependents d WHERE d.dms_document_id=$1 AND d.deleted_at IS NULL
   AND NOT (public.current_user_can_view_employee(d.employee_id) AND erp_private.employee_permission(d.employee_id,'hr.compliance.view'))) THEN RETURN false; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION erp_private.document_permission(bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_private.document_permission(bigint,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.current_user_can_view_dms_document(p_document_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT erp_private.document_permission($1,'dms.documents.view');
$$;
CREATE OR REPLACE FUNCTION public.f03_has_document_permission(document_id bigint, permission_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT erp_private.document_permission($1,$2);
$$;
REVOKE ALL ON FUNCTION public.f03_has_document_permission(bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f03_has_document_permission(bigint,text) TO authenticated;

-- Every child table with a document_id is bounded by the parent. Existing action
-- policies are retained and their capability predicates become subject-scoped.
DO $$
DECLARE t record; pol record; u text; c text; cap text;
BEGIN
 FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'dms_%' AND column_name='document_id' LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t.table_name AND c.relkind='r' AND c.relrowsecurity) THEN RAISE EXCEPTION 'Unreviewed DMS relation %',t.table_name; END IF;
   cap:=CASE WHEN t.table_name IN ('dms_document_content','dms_document_content_chunks','dms_ai_extraction_results') THEN 'dms.documents.preview' ELSE 'dms.documents.view' END;
   EXECUTE format('CREATE POLICY f03_document_subject ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (erp_private.document_permission(document_id,%L)) WITH CHECK (erp_private.document_permission(document_id,%L))',t.table_name,cap,cap);
   FOR pol IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename=t.table_name AND permissive='PERMISSIVE' LOOP
     u:=regexp_replace(pol.qual,'current_user_has_permission\(''([^'']+)''::text\)','erp_private.document_permission(document_id,''\1'')','g');
     c:=regexp_replace(pol.with_check,'current_user_has_permission\(''([^'']+)''::text\)','erp_private.document_permission(document_id,''\1'')','g');
     IF pol.cmd='UPDATE' AND c IS NULL THEN c:=u; END IF;
     EXECUTE format('DROP POLICY %I ON public.%I',pol.policyname,t.table_name);
     EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated%s%s',pol.policyname,t.table_name,pol.cmd,
       CASE WHEN u IS NULL OR pol.cmd='INSERT' THEN '' ELSE ' USING ('||u||')' END,
       CASE WHEN c IS NULL OR pol.cmd IN ('SELECT','DELETE') THEN '' ELSE ' WITH CHECK ('||c||')' END);
   END LOOP;
 END LOOP;
 -- The parent uses its actual NEW tuple for writes, preventing scope reassignment.
 FOR pol IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='dms_documents' AND permissive='PERMISSIVE' LOOP
   IF pol.cmd='SELECT' THEN CONTINUE; END IF;
   cap:=CASE pol.cmd WHEN 'INSERT' THEN 'dms.documents.upload' WHEN 'UPDATE' THEN 'dms.documents.edit' WHEN 'DELETE' THEN 'dms.documents.delete' ELSE NULL END;
   IF cap IS NULL THEN RAISE EXCEPTION 'Unreviewed parent policy %',pol.policyname; END IF;
   u:=format('erp_private.document_permission(id,%L)',cap);
   c:=format('erp_private.permission_in_scope(%L,owning_company_id,owning_branch_id) AND (confidentiality_level IN (''internal'',''company'') OR (confidentiality_level IN (''hr'',''finance'',''legal'',''executive'') AND erp_private.permission_in_scope(''dms.documents.view.''||confidentiality_level,owning_company_id,owning_branch_id)))',cap);
   EXECUTE format('DROP POLICY %I ON public.dms_documents',pol.policyname);
   EXECUTE format('CREATE POLICY %I ON public.dms_documents FOR %s TO authenticated%s%s',pol.policyname,pol.cmd,
     CASE WHEN pol.cmd='INSERT' THEN '' ELSE ' USING ('||u||')' END,
     CASE WHEN pol.cmd='DELETE' THEN '' ELSE ' WITH CHECK ('||c||')' END);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION erp_private.protect_document_classification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.current_user_is_global_admin() AND
   (NEW.confidentiality_level IS DISTINCT FROM OLD.confidentiality_level OR NEW.owning_company_id IS DISTINCT FROM OLD.owning_company_id OR NEW.owning_branch_id IS DISTINCT FROM OLD.owning_branch_id)
   AND NOT (erp_private.permission_in_scope('dms.documents.manage_security',OLD.owning_company_id,OLD.owning_branch_id)
     AND erp_private.permission_in_scope('dms.documents.manage_security',NEW.owning_company_id,NEW.owning_branch_id)) THEN
     RAISE EXCEPTION 'Classification and scope changes require document security permission' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.protect_document_classification() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f03_document_classification BEFORE UPDATE ON public.dms_documents FOR EACH ROW EXECUTE FUNCTION erp_private.protect_document_classification();
NOTIFY pgrst,'reload schema';
COMMIT;
