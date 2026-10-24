BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
-- Optional private portraits reuse DMS authority and the original F04/F11 save.
-- No public bucket, profile/account mapping or image-provider integration.
ALTER TABLE public.employee_dependents ADD COLUMN photo_dms_document_id bigint REFERENCES public.dms_documents(id)ON DELETE SET NULL;
GRANT SELECT(photo_dms_document_id)ON public.employee_dependents TO authenticated;
CREATE FUNCTION public.f12_subject_photo(p_employee bigint,p_dependent bigint DEFAULT NULL,p_document bigint DEFAULT NULL,p_search text DEFAULT'',p_after bigint DEFAULT 0)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 IF NOT erp_private.business_principal_is_active()OR NOT public.current_user_can_view_employee(p_employee)OR p_dependent IS NOT NULL AND(NOT erp_private.employee_permission(p_employee,'hr.compliance.view')OR NOT EXISTS(SELECT 1 FROM public.employee_dependents x WHERE x.id=p_dependent AND x.employee_id=p_employee AND x.deleted_at IS NULL))THEN RAISE EXCEPTION 'Current exact subject access required' USING ERRCODE='42501';END IF;
 IF p_search IS NULL OR length(p_search)>100 OR p_after IS NULL OR p_after<0 THEN RAISE EXCEPTION 'Invalid photo cursor' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY document_id),'[]')INTO result FROM(
 SELECT d.id document_id,d.document_no label,d.current_version_id version_id,min(f.id)file_id
 FROM public.dms_documents d JOIN public.employees e ON e.id=p_employee
 JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id AND v.unlinked_at IS NULL
 JOIN public.dms_document_files f ON f.document_id=d.id AND f.version_id=v.id AND f.deleted_at IS NULL AND f.file_role='original'
 WHERE d.deleted_at IS NULL AND NOT d.is_archived AND d.id>p_after AND(p_document IS NULL OR d.id=p_document)
 AND d.owning_company_id=e.owner_company_id AND(d.owning_branch_id IS NULL OR d.owning_branch_id=e.branch_id)
 AND erp_private.document_permission(d.id,'dms.documents.view')AND erp_private.document_permission(d.id,'dms.documents.preview')
 AND EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.deleted_at IS NULL AND CASE WHEN p_dependent IS NULL THEN l.entity_type='employee'AND l.entity_id=p_employee ELSE l.entity_type='employee_dependent'AND l.entity_id=p_dependent END)
 AND position(lower(p_search)IN lower(d.document_no))>0
 GROUP BY d.id,d.document_no,d.current_version_id
 HAVING count(*)=1 AND bool_and(f.mime_type IN('image/jpeg','image/png','image/webp')AND f.integrity_status='verified'AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$')
 ORDER BY d.id LIMIT 26)x;
 RETURN result;
END$$;
REVOKE ALL ON FUNCTION public.f12_subject_photo(bigint,bigint,bigint,text,bigint)FROM PUBLIC,anon,service_role;GRANT EXECUTE ON FUNCTION public.f12_subject_photo(bigint,bigint,bigint,text,bigint)TO authenticated;
CREATE FUNCTION erp_private.f12_photo_subject_guard()RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE employee bigint;dependent bigint;BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE'AND NEW.photo_dms_document_id IS NOT DISTINCT FROM OLD.photo_dms_document_id THEN RETURN NEW;END IF;
 IF NEW.photo_dms_document_id IS NULL THEN RETURN NEW;END IF;
 IF TG_TABLE_NAME='employees'THEN employee:=NEW.id;dependent:=NULL;ELSE employee:=NEW.employee_id;dependent:=NEW.id;END IF;
 IF jsonb_array_length(public.f12_subject_photo(employee,dependent,NEW.photo_dms_document_id))<>1 THEN RAISE EXCEPTION 'Choose one currently permitted image linked to this exact person; no public or cross-person photo' USING ERRCODE='23514';END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_photo_subject_guard()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f12_photo_subject_guard BEFORE INSERT OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION erp_private.f12_photo_subject_guard();
CREATE TRIGGER f12_photo_subject_guard BEFORE INSERT OR UPDATE ON public.employee_dependents FOR EACH ROW EXECUTE FUNCTION erp_private.f12_photo_subject_guard();
DO $$DECLARE d text;n text;BEGIN
 d:=pg_get_functiondef('public.f11_save_dependent(uuid,bigint,bigint,bigint,text,jsonb,bigint[],bigint[])'::regprocedure);n:='''dms_document_id'',''notes''';IF position(n IN d)=0 THEN RAISE EXCEPTION 'Unknown dependent field contract';END IF;
 d:=replace(d,n,'''dms_document_id'',''photo_dms_document_id'',''notes''');
 n:='payload:=p_data||jsonb_build_object(''updated_by'',actor);';IF position(n IN d)=0 THEN RAISE EXCEPTION 'Unknown dependent save payload boundary';END IF;
 EXECUTE replace(d,n,'IF EXISTS(SELECT 1 FROM public.employee_dependents x WHERE x.id=p_id AND x.employee_id=p_employee AND(CASE WHEN p_data?''photo_dms_document_id''THEN(p_data->>''photo_dms_document_id'')::bigint ELSE x.photo_dms_document_id END)=ANY(p_remove))THEN RAISE EXCEPTION ''Clear the recorded photo before unlinking its document'' USING ERRCODE=''23514'';END IF;'||n);
END$$;
-- Capture future committed facts only. Existing F10 fan-out owns frozen
-- recipients, leases/retries and current authority; HR remains in-app only.
CREATE FUNCTION erp_private.f12_capture_workforce_event()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n jsonb:=to_jsonb(NEW);o jsonb;facts jsonb;keys text[];BEGIN
 IF NEW.deleted_at IS NOT NULL THEN RETURN NEW;END IF;
 keys:=CASE TG_TABLE_NAME WHEN'employee_pro_processes'THEN ARRAY['process_status','assigned_to','target_date','f12_source_kind','f12_source_id','f12_source_version','f12_source_expiry','f12_replacement_id']WHEN'employee_assignments'THEN ARRAY['assignment_status','work_site_id','effective_from','effective_to']END;
 IF keys IS NULL THEN RAISE EXCEPTION 'Unsupported workforce event source' USING ERRCODE='22023';END IF;
 IF TG_OP='UPDATE'THEN o:=to_jsonb(OLD);IF NOT EXISTS(SELECT 1 FROM unnest(keys)k WHERE n->k IS DISTINCT FROM o->k)THEN RETURN NEW;END IF;END IF;
 SELECT jsonb_object_agg(k,n->k)INTO facts FROM unnest(keys)k;
 INSERT INTO erp_private.notification_events(event_key,source_table,source_id,event_type,actor_id,source_snapshot)
 VALUES('f12-workforce:'||TG_TABLE_NAME||':'||NEW.id||':'||NEW.workspace_revision,TG_TABLE_NAME,NEW.id,CASE TG_TABLE_NAME WHEN'employee_pro_processes'THEN'pro_process_changed'ELSE'deployment_changed'END,coalesce(NEW.updated_by,NEW.created_by),facts||jsonb_build_object('employee_id',NEW.employee_id,'workspace_revision',NEW.workspace_revision))ON CONFLICT(event_key)DO NOTHING;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_capture_workforce_event()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f12_workforce_event AFTER INSERT OR UPDATE ON public.employee_pro_processes FOR EACH ROW EXECUTE FUNCTION erp_private.f12_capture_workforce_event();
CREATE TRIGGER f12_workforce_event AFTER INSERT OR UPDATE ON public.employee_assignments FOR EACH ROW EXECUTE FUNCTION erp_private.f12_capture_workforce_event();
DO $$DECLARE d text;n text;BEGIN
 d:=pg_get_functiondef('public.f10_notification_target(text,bigint)'::regprocedure);
 n:='WHEN ''employees'' THEN employee_id:=$2;';IF position(n IN d)=0 THEN RAISE EXCEPTION 'Unknown HR notification parent adapter';END IF;
 d:=replace(d,n,n||' WHEN ''employee_pro_processes'' THEN SELECT p.employee_id INTO employee_id FROM public.employee_pro_processes p WHERE p.id=$2 AND p.deleted_at IS NULL; WHEN ''employee_assignments'' THEN SELECT a.employee_id INTO employee_id FROM public.employee_assignments a WHERE a.id=$2 AND a.deleted_at IS NULL;');
 n:='IF $1=''employee_identity_documents''';IF position(n IN d)=0 THEN RAISE EXCEPTION 'Unknown HR notification capability adapter';END IF;
 d:=replace(d,n,'IF $1=''employee_pro_processes''AND NOT erp_private.employee_permission(employee_id,''hr.actions.view'')THEN RETURN NULL;END IF;IF $1=''employee_assignments''AND NOT erp_private.employee_permission(employee_id,''hr.assignments.view'')THEN RETURN NULL;END IF;'||n);
 n:='WHEN ''employee_leave_requests'' THEN ''?task=leave&task_id=''||$2';IF position(n IN d)=0 THEN RAISE EXCEPTION 'Unknown HR notification leaf adapter';END IF;
 EXECUTE replace(d,n,n||' WHEN ''employee_pro_processes'' THEN ''?task=pro&task_id=''||$2 WHEN ''employee_assignments'' THEN ''?task=deployment&task_id=''||$2');
 d:=pg_get_functiondef('public.f10_record_notification_recipient(bigint,uuid,bigint,boolean)'::regprocedure);n:='''hr_interviews'',''hr_offers'',''hr_onboarding_tasks'',''hr_candidates''';
 IF position(n IN d)=0 THEN RAISE EXCEPTION 'Unknown F12/F10 in-app recording adapter';END IF;EXECUTE replace(d,n,n||',''employee_pro_processes'',''employee_assignments''');
END$$;
NOTIFY pgrst,'reload schema';COMMIT;
