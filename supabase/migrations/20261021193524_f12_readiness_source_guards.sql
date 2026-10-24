BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
-- Keep existing F11 opening/fingerprint/receipt and separate medical capability.
-- A source error propagates; it is never an empty healthy source.
ALTER FUNCTION erp_private.f11_readiness_sources(bigint,bigint)RENAME TO f12_readiness_sources_predecessor;
CREATE FUNCTION erp_private.f12_readiness_evidence(p_employee bigint,p_document bigint)RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT p_document IS NOT NULL AND EXISTS(SELECT 1 FROM public.dms_documents d JOIN public.employees e ON e.id=p_employee WHERE d.id=p_document AND d.deleted_at IS NULL AND NOT d.is_archived AND d.current_version_id IS NOT NULL AND d.owning_company_id=e.owner_company_id AND(d.owning_branch_id IS NULL OR d.owning_branch_id=e.branch_id)AND erp_private.document_permission(d.id,'dms.documents.view')AND erp_private.document_permission(d.id,'dms.documents.preview')AND EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.entity_type='employee'AND l.entity_id=e.id AND l.deleted_at IS NULL));
$$;
REVOKE ALL ON FUNCTION erp_private.f12_readiness_evidence(bigint,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f12_readiness_evidence(bigint,bigint)TO authenticated;
CREATE FUNCTION erp_private.f11_readiness_sources(p_employee bigint,p_site bigint)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$DECLARE s jsonb;BEGIN
 s:=erp_private.f12_readiness_sources_predecessor(p_employee,p_site);
 RETURN s||jsonb_build_object('day',(now()AT TIME ZONE'Asia/Dubai')::date,'f12_source_version',1,
 'identity_current',erp_private.f12_readiness_evidence(p_employee,(s#>>'{identity,dms_document_id}')::bigint),
 'medical_current',erp_private.f12_readiness_evidence(p_employee,(s#>>'{medical,dms_document_id}')::bigint),
 'access_current',erp_private.f12_readiness_evidence(p_employee,(s#>>'{access,dms_document_id}')::bigint),
 'training',coalesce((SELECT jsonb_agg(to_jsonb(t)||jsonb_build_object('evidence_current',erp_private.f12_readiness_evidence(p_employee,t.dms_document_id))ORDER BY t.id)FROM public.employee_training_certificates t WHERE t.employee_id=p_employee AND t.deleted_at IS NULL),'[]'),
 'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'current_version_id',d.current_version_id,'updated_at',d.updated_at,'archived',d.is_archived)ORDER BY d.id)FROM public.dms_documents d WHERE d.id IN(SELECT l.document_id FROM public.dms_document_links l WHERE l.entity_type='employee'AND l.entity_id=p_employee AND l.deleted_at IS NULL)),'[]'));
END$$;
REVOKE ALL ON FUNCTION erp_private.f11_readiness_sources(bigint,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f11_readiness_sources(bigint,bigint)TO authenticated;
ALTER FUNCTION erp_private.f11_calculate_readiness(jsonb)RENAME TO f12_calculate_readiness_predecessor;
CREATE FUNCTION erp_private.f11_calculate_readiness(s jsonb)RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE corrected jsonb:=s;r jsonb;missing jsonb;item jsonb;day date:=(s->>'day')::date;BEGIN
 -- Actual schema: next_examination_date and access_type_id, not guessed fields.
 IF s->'medical'<>'null'::jsonb THEN corrected:=jsonb_set(corrected,'{medical}',(s->'medical')||jsonb_build_object('expiry_date',s#>'{medical,next_examination_date}'));END IF;
 IF s->'access'<>'null'::jsonb THEN corrected:=jsonb_set(corrected,'{access}',(s->'access')||jsonb_build_object('access_card_type_id',s#>'{access,access_type_id}'));END IF;
 r:=erp_private.f12_calculate_readiness_predecessor(corrected);IF r->>'status'='blocked'THEN RETURN r;END IF;missing:=r->'missing';
 IF s->>'f12_source_version'IS DISTINCT FROM'1'THEN missing:=missing||jsonb_build_object('code','SOURCE_UNAVAILABLE','label','Verified current evidence sources unavailable','category','other','severity','critical');END IF;
 IF NOT coalesce((s->>'identity_current')::boolean,false)OR s#>>'{identity,verification_status}'IS DISTINCT FROM'verified'OR s#>>'{identity,issue_date}'IS NULL OR(s#>>'{identity,issue_date}')::date>day OR s#>>'{identity,expiry_date}'IS NULL THEN missing:=missing||jsonb_build_object('code','IDENTITY_REVIEW','label','Identity source/version/verification or validity needs review','category','document','severity','critical');END IF;
 IF NOT coalesce((s->>'medical_current')::boolean,false)OR s#>>'{medical,next_examination_date}'IS NULL OR(s#>>'{medical,examination_date}')::date>day THEN missing:=missing||jsonb_build_object('code','MEDICAL_REVIEW','label','Medical source/version or validity needs authorized review','category','medical','severity','warning');END IF;
 IF s#>>'{readiness,required_access_card_type_id}'IS NOT NULL AND NOT coalesce((s->>'access_current')::boolean,false)THEN missing:=missing||jsonb_build_object('code','ACCESS_SOURCE_REVIEW','label','Required access evidence needs review','category','access_card','severity','critical');END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(coalesce(s->'requirements','[]'))LOOP
  IF coalesce((item->>'is_required')::boolean,false)AND(item->>'status'IN('waived','not_required')OR item->>'status'='met'AND(item->>'met_record_id'IS NULL OR item->>'met_record_type'IS NULL))THEN missing:=missing||jsonb_build_object('code','REQUIREMENT_REVIEW','label','Required evidence/applicability or dated waiver is unresolved','category','other','severity','critical');END IF;
 END LOOP;
 RETURN jsonb_build_object('status',CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(missing)m WHERE m->>'severity'='critical')THEN CASE WHEN r->>'status'='expired'THEN'expired'ELSE'not_ready'END WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(missing)m WHERE m->>'severity'='warning')THEN'needs_review'ELSE'ready'END,'missing',missing);
END$$;
REVOKE ALL ON FUNCTION erp_private.f11_calculate_readiness(jsonb)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION erp_private.f11_calculate_readiness(jsonb)TO authenticated;

CREATE FUNCTION erp_private.f12_assignment_safety()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE e public.employees;snapshot jsonb;computed jsonb;BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE'AND ROW(NEW.assignment_status,NEW.effective_from,NEW.effective_to,NEW.work_site_id,NEW.assignment_type)IS NOT DISTINCT FROM ROW(OLD.assignment_status,OLD.effective_from,OLD.effective_to,OLD.work_site_id,OLD.assignment_type)THEN RETURN NEW;END IF;
 IF NOT erp_private.f11_child_authorized('assignment',NEW.employee_id)THEN RAISE EXCEPTION 'Current assignment authority required' USING ERRCODE='42501';END IF;
 SELECT *INTO e FROM public.employees WHERE id=NEW.employee_id FOR UPDATE;
 IF NEW.effective_to<NEW.effective_from OR NEW.effective_from<e.joining_date THEN RAISE EXCEPTION 'Assignment chronology conflicts with employment' USING ERRCODE='23514';END IF;
 IF NEW.assignment_status='active'THEN
  -- Match attendance/readiness current-employment semantics. An inactive
  -- legacy status without a known cessation date is unresolved, not current.
  IF NEW.effective_from>(now()AT TIME ZONE'Asia/Dubai')::date OR NOT coalesce(e.joining_date<=(now()AT TIME ZONE'Asia/Dubai')::date AND(e.inactive_date IS NULL OR e.inactive_date>(now()AT TIME ZONE'Asia/Dubai')::date)AND(e.employee_status IN('active','probation','on_leave')OR e.inactive_date>(now()AT TIME ZONE'Asia/Dubai')::date),false)THEN RAISE EXCEPTION 'Future/planned or inactive employment cannot be effective now' USING ERRCODE='23514';END IF;
  IF NEW.assignment_type='primary'AND EXISTS(SELECT 1 FROM public.employee_assignments a WHERE a.employee_id=NEW.employee_id AND a.id<>NEW.id AND a.deleted_at IS NULL AND a.assignment_status='active'AND a.assignment_type='primary'AND daterange(a.effective_from,a.effective_to,'[]')&&daterange(NEW.effective_from,NEW.effective_to,'[]'))THEN RAISE EXCEPTION 'Conflicting effective primary assignment' USING ERRCODE='23514';END IF;
  IF NEW.work_site_id IS NOT NULL THEN
   IF NOT erp_private.f11_child_authorized('site-readiness',NEW.employee_id)THEN RAISE EXCEPTION 'Complete authorized site-readiness review is required' USING ERRCODE='42501';END IF;
   snapshot:=erp_private.f11_readiness_sources(NEW.employee_id,NEW.work_site_id);computed:=erp_private.f11_calculate_readiness(snapshot);IF computed->>'status'<>'ready'THEN RAISE EXCEPTION 'Current site evidence is not Ready; cached readiness is not authority' USING ERRCODE='23514';END IF;
  END IF;
 END IF;RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_assignment_safety()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f12_assignment_safety BEFORE INSERT OR UPDATE ON public.employee_assignments FOR EACH ROW EXECUTE FUNCTION erp_private.f12_assignment_safety();
-- Existing custody returns/quantities remain F11-owned. Serialised reference
-- conflicts are an HR custody guard, not a second inventory/stock ledger.
CREATE FUNCTION erp_private.f12_custody_safety()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE company bigint;BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF NOT erp_private.f11_child_authorized('asset',NEW.employee_id)THEN RAISE EXCEPTION 'Current resource authority required' USING ERRCODE='42501';END IF;
 IF NEW.returned_date<NEW.issued_date THEN RAISE EXCEPTION 'Return cannot precede issue' USING ERRCODE='23514';END IF;
 IF NEW.asset_reference IS NOT NULL AND btrim(NEW.asset_reference)<>''AND NEW.returned_date IS NULL AND NEW.deleted_at IS NULL THEN
  SELECT owner_company_id INTO company FROM public.employees WHERE id=NEW.employee_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('f12-custody:'||company||':'||NEW.asset_type||':'||lower(btrim(NEW.asset_reference)),0));
  IF EXISTS(SELECT 1 FROM public.employee_assets a JOIN public.employees e ON e.id=a.employee_id WHERE a.id<>NEW.id AND a.asset_type=NEW.asset_type AND lower(btrim(a.asset_reference))=lower(btrim(NEW.asset_reference))AND a.deleted_at IS NULL AND a.returned_date IS NULL AND e.owner_company_id=company)THEN RAISE EXCEPTION 'An outstanding custody issue already exists; verify original return' USING ERRCODE='23514';END IF;
 END IF;RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_custody_safety()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f12_custody_safety BEFORE INSERT OR UPDATE ON public.employee_assets FOR EACH ROW EXECUTE FUNCTION erp_private.f12_custody_safety();
NOTIFY pgrst,'reload schema';COMMIT;
