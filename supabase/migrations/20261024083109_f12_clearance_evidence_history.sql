BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Additive; unknown historical evidence remains NULL and is never inferred.
ALTER TABLE public.employee_clearance_items
 ADD COLUMN evidence_document_id bigint REFERENCES public.dms_documents(id),
 ADD COLUMN evidence_version_id bigint REFERENCES public.dms_document_versions(id),
 ADD COLUMN evidence_fingerprint text,
 ADD CONSTRAINT f12_clearance_evidence_pair CHECK(
 (evidence_document_id IS NULL AND evidence_version_id IS NULL AND evidence_fingerprint IS NULL)
 OR (evidence_document_id IS NOT NULL AND evidence_version_id IS NOT NULL AND evidence_fingerprint IS NOT NULL AND evidence_fingerprint~'^[0-9a-f]{64}$'));

CREATE TABLE erp_private.f12_clearance_history(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 employee_id bigint NOT NULL,eos_case_id bigint NOT NULL,item_id bigint NOT NULL,
 revision bigint NOT NULL,actor uuid NOT NULL,actor_profile_id bigint NOT NULL,
 operation_id uuid NOT NULL,action text NOT NULL,before_state jsonb,after_state jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(actor,operation_id),UNIQUE(item_id,revision));
CREATE INDEX f12_clearance_history_subject ON erp_private.f12_clearance_history(employee_id,eos_case_id,item_id,id);
ALTER TABLE erp_private.f12_clearance_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f12_clearance_history FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.f12_clearance_history_immutable()RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN
 RAISE EXCEPTION 'Clearance history is immutable' USING ERRCODE='42501';END$$;
REVOKE ALL ON FUNCTION erp_private.f12_clearance_history_immutable()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f12_clearance_history_immutable BEFORE UPDATE OR DELETE ON erp_private.f12_clearance_history
 FOR EACH ROW EXECUTE FUNCTION erp_private.f12_clearance_history_immutable();

-- Narrow definer boundary: current HR authority plus independent DMS view and
-- preview authority, exact employee link, company/branch and verified bytes.
-- Locks prevent a simultaneous replacement/unlink from certifying old proof.
CREATE FUNCTION erp_private.f12_clearance_evidence(p_employee bigint,p_document bigint,p_version bigint)RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.employees;d public.dms_documents;v public.dms_document_versions;facts jsonb;
BEGIN
 IF NOT erp_private.f11_child_authorized('clearance',p_employee) THEN RAISE EXCEPTION 'Current clearance authority required' USING ERRCODE='42501';END IF;
 SELECT *INTO e FROM public.employees WHERE id=p_employee AND deleted_at IS NULL;
 SELECT *INTO d FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL AND NOT is_archived FOR SHARE;
 IF e.id IS NULL OR d.id IS NULL OR d.current_version_id IS DISTINCT FROM p_version
 OR d.owning_company_id IS DISTINCT FROM e.owner_company_id OR(d.owning_branch_id IS NOT NULL AND d.owning_branch_id IS DISTINCT FROM e.branch_id)
 OR NOT erp_private.document_permission(d.id,'dms.documents.view') OR NOT erp_private.document_permission(d.id,'dms.documents.preview') THEN
  RAISE EXCEPTION 'Current permitted employee-linked clearance evidence required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.dms_document_links WHERE document_id=d.id AND entity_type='employee' AND entity_id=e.id AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current permitted employee-linked clearance evidence required' USING ERRCODE='42501';END IF;
 SELECT *INTO v FROM public.dms_document_versions WHERE id=p_version AND document_id=d.id AND unlinked_at IS NULL FOR SHARE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'Current permitted employee-linked clearance evidence required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.dms_document_files WHERE document_id=d.id AND version_id=v.id AND deleted_at IS NULL AND file_role='original' FOR SHARE;
 SELECT jsonb_agg(jsonb_build_object('id',f.id,'bytes',f.file_size_bytes,'hash',f.sha256_hash,'integrity',f.integrity_status)ORDER BY f.id)INTO facts
 FROM public.dms_document_files f WHERE f.document_id=d.id AND f.version_id=v.id AND f.deleted_at IS NULL AND f.file_role='original';
 IF facts IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(facts)f WHERE f->>'integrity'IS DISTINCT FROM'verified' OR coalesce((f->>'bytes')::bigint,0)<=0 OR coalesce(f->>'hash','')!~'^[0-9a-f]{64}$') THEN
  RAISE EXCEPTION 'Verified clearance evidence bytes and version required' USING ERRCODE='23514';END IF;
 RETURN encode(sha256(convert_to(jsonb_build_array(e.id,d.id,v.id,d.updated_at,d.owning_company_id,d.owning_branch_id,facts)::text,'UTF8')),'hex');
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_clearance_evidence(bigint,bigint,bigint)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f12_clearance_evidence(bigint,bigint,bigint)TO authenticated;

CREATE FUNCTION erp_private.f12_clearance_evidence_guard()RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$DECLARE current_hash text;BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF NEW.item_status IN('cleared','not_applicable') AND(TG_OP='INSERT' OR NEW.item_status IS DISTINCT FROM OLD.item_status OR NEW.evidence_document_id IS DISTINCT FROM OLD.evidence_document_id OR NEW.evidence_version_id IS DISTINCT FROM OLD.evidence_version_id OR NEW.item_title IS DISTINCT FROM OLD.item_title)THEN
  IF NEW.evidence_document_id IS NULL OR NEW.evidence_version_id IS NULL OR NEW.evidence_fingerprint IS NULL THEN RAISE EXCEPTION 'Attach current employee-linked evidence before recording HR clearance' USING ERRCODE='23514';END IF;
  current_hash:=erp_private.f12_clearance_evidence(NEW.employee_id,NEW.evidence_document_id,NEW.evidence_version_id);
  IF current_hash IS DISTINCT FROM NEW.evidence_fingerprint THEN RAISE EXCEPTION 'Clearance evidence changed; reopen and select its current version' USING ERRCODE='P0409';END IF;
 END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_clearance_evidence_guard()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f12_clearance_evidence_guard BEFORE INSERT OR UPDATE ON public.employee_clearance_items FOR EACH ROW EXECUTE FUNCTION erp_private.f12_clearance_evidence_guard();

CREATE FUNCTION erp_private.f12_capture_clearance_history()RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE c jsonb:=nullif(current_setting('erp.f11_child_save',true),'')::jsonb;BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF c IS NULL OR NOT erp_private.f11_child_authorized('clearance',NEW.employee_id)
 OR NOT EXISTS(SELECT 1 FROM erp_private.f11_child_receipts r WHERE r.actor=auth.uid()AND r.operation_id=(c->>'operation_id')::uuid AND r.kind='clearance'AND r.record_id=NEW.id AND r.revision=NEW.workspace_revision AND r.eos_case_id=NEW.eos_case_id)THEN
 RAISE EXCEPTION 'Original clearance receipt required for history' USING ERRCODE='42501';END IF;
 INSERT INTO erp_private.f12_clearance_history(employee_id,eos_case_id,item_id,revision,actor,actor_profile_id,operation_id,action,before_state,after_state)
 VALUES(NEW.employee_id,NEW.eos_case_id,NEW.id,NEW.workspace_revision,auth.uid(),public.current_user_profile_id(),(c->>'operation_id')::uuid,c->>'action',CASE WHEN TG_OP='UPDATE'THEN to_jsonb(OLD)END,to_jsonb(NEW));
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION erp_private.f12_capture_clearance_history()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_f12_clearance_history AFTER INSERT OR UPDATE ON public.employee_clearance_items FOR EACH ROW EXECUTE FUNCTION erp_private.f12_capture_clearance_history();

DO $adoption$
DECLARE sig regprocedure;original text;definition text;changed text;expected text;
BEGIN
 FOREACH sig IN ARRAY ARRAY['public.f11_mutate_clearance(text,bigint,bigint,bigint,uuid,text,jsonb)'::regprocedure,'erp_private.f11_capture_clearance()'::regprocedure]LOOP
 SELECT prosrc,pg_get_functiondef(oid)INTO original,definition FROM pg_proc WHERE oid=sig;
 expected:=CASE sig WHEN 'erp_private.f11_capture_clearance()'::regprocedure THEN 'd61bba270136767a2aab87b6751eb82b4fd45a42e6d57d76db31fc1d646c6ab0' ELSE '4cffabe8015ad381223b924ca56619ca9ba2f3dc9ed85563f930ba329870ac7a'END;
 IF encode(sha256(convert_to(original,'UTF8')),'hex')<>expected THEN RAISE EXCEPTION 'Unreviewed clearance predecessor';END IF;
 IF sig='erp_private.f11_capture_clearance()'::regprocedure THEN
 changed:=replace(original,'''clearance_area'',''item_title'',''item_status''','''clearance_area'',''item_title'',''evidence_document_id'',''evidence_version_id'',''evidence_fingerprint'',''item_status''');
 ELSE
 changed:=replace(original,'''clearance_area'',''item_title'',''item_status''','''clearance_area'',''item_title'',''evidence_document_id'',''evidence_version_id'',''item_status''');
 changed:=replace(changed,$anchor$p_data?'item_status'OR p_data?'notes'$anchor$,$replacement$p_data?'item_status'OR p_data?'notes'OR p_data?'evidence_document_id'OR p_data?'evidence_version_id'$replacement$);
 changed:=replace(changed,$anchor$IF p_action<>'create'THEN$anchor$,$new$
 IF(p_data?'evidence_document_id')<>(p_data?'evidence_version_id') OR(p_data?'evidence_document_id'AND((jsonb_typeof(p_data->'evidence_document_id')NOT IN('number','null'))OR(jsonb_typeof(p_data->'evidence_version_id')NOT IN('number','null'))OR(p_data->>'evidence_document_id'IS NULL)<>(p_data->>'evidence_version_id'IS NULL)))THEN RAISE EXCEPTION 'Exact evidence document and version pair required' USING ERRCODE='22023';END IF;
 IF p_data->>'evidence_document_id'IS NOT NULL AND((p_data->>'evidence_document_id')!~'^[1-9][0-9]*$'OR(p_data->>'evidence_version_id')!~'^[1-9][0-9]*$'OR(p_data->>'evidence_document_id')::numeric>9007199254740991 OR(p_data->>'evidence_version_id')::numeric>9007199254740991)THEN RAISE EXCEPTION 'Invalid clearance evidence identity' USING ERRCODE='22023';END IF;
 IF p_action<>'create'THEN$new$);
 changed:=replace(changed,'item_status,notes,created_by,updated_by)VALUES','item_status,notes,evidence_document_id,evidence_version_id,evidence_fingerprint,created_by,updated_by)VALUES');
 changed:=replace(changed,$anchor$'pending',p_data->>'notes',actor,actor)$anchor$,$replacement$'pending',p_data->>'notes',(p_data->>'evidence_document_id')::bigint,(p_data->>'evidence_version_id')::bigint,CASE WHEN p_data->>'evidence_document_id'IS NOT NULL THEN erp_private.f12_clearance_evidence(p_employee,(p_data->>'evidence_document_id')::bigint,(p_data->>'evidence_version_id')::bigint)END,actor,actor)$replacement$);
 changed:=replace(changed,'SET clearance_area=','SET evidence_document_id=CASE WHEN p_data?''evidence_document_id''THEN(p_data->>''evidence_document_id'')::bigint ELSE x.evidence_document_id END,evidence_version_id=CASE WHEN p_data?''evidence_version_id''THEN(p_data->>''evidence_version_id'')::bigint ELSE x.evidence_version_id END,evidence_fingerprint=CASE WHEN NOT(p_data?''evidence_document_id'')THEN x.evidence_fingerprint WHEN p_data->>''evidence_document_id''IS NULL THEN NULL ELSE erp_private.f12_clearance_evidence(p_employee,(p_data->>''evidence_document_id'')::bigint,(p_data->>''evidence_version_id'')::bigint)END,clearance_area=');
 END IF;
 IF changed=original OR strpos(changed,'evidence_document_id')=0 THEN RAISE EXCEPTION 'Missing reviewed evidence adoption';END IF;
 EXECUTE replace(definition,original,changed);
 END LOOP;
END$adoption$;

CREATE FUNCTION public.f12_clearance_evidence_choices(p_employee bigint,p_search text DEFAULT'',p_after bigint DEFAULT 0)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$BEGIN
 IF NOT erp_private.f11_child_authorized('clearance',p_employee)THEN RAISE EXCEPTION 'Current clearance authority required' USING ERRCODE='42501';END IF;
 IF p_search IS NULL OR length(p_search)>100 OR p_after IS NULL OR p_after<0 THEN RAISE EXCEPTION 'Invalid evidence cursor' USING ERRCODE='22023';END IF;
 RETURN(SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY id),'[]')FROM(
 SELECT d.id,d.document_no||' — '||d.title label,d.current_version_id version_id FROM public.dms_documents d JOIN public.employees e ON e.id=p_employee
 WHERE d.id>p_after AND d.deleted_at IS NULL AND NOT d.is_archived AND d.current_version_id IS NOT NULL
 AND d.owning_company_id=e.owner_company_id AND(d.owning_branch_id IS NULL OR d.owning_branch_id=e.branch_id)
 AND erp_private.document_permission(d.id,'dms.documents.view')AND erp_private.document_permission(d.id,'dms.documents.preview')
 AND EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.entity_type='employee'AND l.entity_id=e.id AND l.deleted_at IS NULL)
 AND position(lower(p_search)IN lower(d.document_no||' '||d.title))>0 ORDER BY d.id LIMIT 26)x);
END$$;
CREATE FUNCTION public.f12_clearance_history(p_employee bigint,p_case bigint,p_item bigint,p_after bigint DEFAULT 0)RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF NOT erp_private.business_principal_is_active()OR NOT(erp_private.employee_permission(p_employee,'hr.eos.view')OR erp_private.employee_permission(p_employee,'hr.actions.view'))OR NOT EXISTS(SELECT 1 FROM public.employee_clearance_items WHERE id=p_item AND employee_id=p_employee AND eos_case_id=p_case)THEN RAISE EXCEPTION 'Current case history authority required' USING ERRCODE='42501';END IF;
 IF p_after IS NULL OR p_after<0 THEN RAISE EXCEPTION 'Invalid history cursor' USING ERRCODE='22023';END IF;
 RETURN(SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY id),'[]')FROM(SELECT h.id,h.revision::text,h.action,h.actor_profile_id,h.created_at,h.after_state->>'item_status'status,
 CASE WHEN erp_private.document_permission((h.after_state->>'evidence_document_id')::bigint,'dms.documents.view')THEN(h.after_state->>'evidence_document_id')::bigint END document_id,
 CASE WHEN erp_private.document_permission((h.after_state->>'evidence_document_id')::bigint,'dms.documents.view')THEN(h.after_state->>'evidence_version_id')::bigint END version_id
 FROM erp_private.f12_clearance_history h WHERE h.employee_id=p_employee AND h.eos_case_id=p_case AND h.item_id=p_item AND h.id>p_after ORDER BY h.id LIMIT 26)x);
END$$;
REVOKE ALL ON FUNCTION public.f12_clearance_evidence_choices(bigint,text,bigint),public.f12_clearance_history(bigint,bigint,bigint,bigint)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f12_clearance_evidence_choices(bigint,text,bigint),public.f12_clearance_history(bigint,bigint,bigint,bigint)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
