BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE TABLE erp_private.hr_photo_recovery(
 actor uuid NOT NULL,operation uuid NOT NULL,origin_scope text NOT NULL,
 company bigint NOT NULL,branch bigint,employee bigint,dependent bigint,
 kind text NOT NULL CHECK(kind IN('employee','dependent')),person_revision bigint,
 revision integer NOT NULL DEFAULT 1,payload jsonb NOT NULL,complete boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor,operation),CHECK(octet_length(payload::text)<=131072)
);
ALTER TABLE erp_private.hr_photo_recovery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.hr_photo_recovery FROM PUBLIC,anon,authenticated,service_role;
CREATE UNIQUE INDEX hr_photo_recovery_origin ON erp_private.hr_photo_recovery(actor,origin_scope) WHERE NOT complete;
CREATE UNIQUE INDEX hr_photo_recovery_subject ON erp_private.hr_photo_recovery(actor,employee,coalesce(dependent,0),kind) WHERE NOT complete AND employee IS NOT NULL AND(kind='employee' OR dependent IS NOT NULL);
CREATE TABLE erp_private.hr_photo_retired_saves(actor uuid NOT NULL,operation uuid NOT NULL,journal uuid NOT NULL,retired_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor,operation));
ALTER TABLE erp_private.hr_photo_retired_saves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.hr_photo_retired_saves FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.hr_photo_operation_open(p_operation uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN IF EXISTS(SELECT 1 FROM erp_private.hr_photo_retired_saves WHERE actor=auth.uid() AND operation=p_operation) THEN RAISE EXCEPTION 'Original photo save was retired; review the corrected request' USING ERRCODE='42501';END IF;END$$;
REVOKE ALL ON FUNCTION erp_private.hr_photo_operation_open(uuid)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.hr_photo_operation_open(uuid)TO authenticated;

CREATE FUNCTION erp_private.hr_photo_recovery_authorized(r erp_private.hr_photo_recovery) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE e record;body jsonb;
BEGIN
 IF auth.uid() IS NULL OR r.actor IS DISTINCT FROM auth.uid() OR NOT erp_private.business_principal_is_active() THEN RETURN false;END IF;
 IF r.employee IS NULL THEN
  IF r.kind<>'employee' OR NOT erp_private.permission_in_scope('hr.employees.create',r.company,r.branch) THEN RETURN false;END IF;
 ELSE
  SELECT owner_company_id,branch_id INTO e FROM public.employees WHERE id=r.employee AND deleted_at IS NULL;
  IF NOT FOUND OR(e.owner_company_id,e.branch_id)IS DISTINCT FROM(r.company,r.branch) THEN RETURN false;END IF;
  IF NOT public.current_user_can_view_employee(r.employee) THEN RETURN false;END IF;
  IF r.kind='dependent' THEN
   IF NOT erp_private.employee_permission(r.employee,'hr.compliance.view') OR NOT(erp_private.employee_permission(r.employee,'hr.compliance.manage') OR erp_private.employee_permission(r.employee,'hr.admin')) THEN RETURN false;END IF;
   IF r.dependent IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.employee_dependents d WHERE d.id=r.dependent AND d.employee_id=r.employee AND d.deleted_at IS NULL) THEN RETURN false;END IF;
  ELSIF NOT(erp_private.employee_permission(r.employee,'hr.employees.update') OR erp_private.employee_permission(r.employee,'hr.employee_profile.manage')) THEN RETURN false;
  END IF;
 END IF;
 IF NOT erp_private.permission_in_scope('dms.documents.create',r.company,r.branch) OR NOT erp_private.permission_in_scope('dms.documents.view',r.company,r.branch) OR NOT erp_private.permission_in_scope('dms.documents.preview',r.company,r.branch) THEN RETURN false;END IF;
 IF r.payload->'state'->'receipt'<>'null'::jsonb AND NOT(erp_private.document_permission((r.payload->'state'->'receipt'->>'documentId')::bigint,'dms.documents.view') AND erp_private.document_permission((r.payload->'state'->'receipt'->>'documentId')::bigint,'dms.documents.preview')) THEN RETURN false;END IF;
 -- A retained full save can contain medical fields. A later permission loss
 -- must not reveal/replay those old values, even to the original actor.
 body:=CASE WHEN r.payload->'save'->>'kind'='dependent' THEN r.payload->'save'->'input'->'values' ELSE r.payload->'save'->'input' END;
 IF EXISTS(SELECT 1 FROM jsonb_each(coalesce(body,'{}'))x WHERE x.key IN('blood_group','medical_insurance_provider','medical_insurance_policy','medical_insurance_card','medical_insurance_expiry') AND x.value NOT IN('null'::jsonb,'""'::jsonb)) AND
 NOT erp_private.permission_in_scope('hr.medical.manage',r.company,r.branch) THEN RETURN false;END IF;
 RETURN true;
END$$;

CREATE FUNCTION erp_private.hr_photo_recovery_refresh(p_operation uuid) RETURNS erp_private.hr_photo_recovery
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r erp_private.hr_photo_recovery;s jsonb;receipt jsonb;target bigint;
BEGIN
 SELECT * INTO r FROM erp_private.hr_photo_recovery WHERE actor=auth.uid() AND operation=p_operation FOR UPDATE;
 IF NOT FOUND OR NOT erp_private.hr_photo_recovery_authorized(r) THEN RAISE EXCEPTION 'Photo recovery unavailable' USING ERRCODE='42501';END IF;
 s:=r.payload->'save';
 IF s IS NOT NULL AND s<>'null'::jsonb THEN
  IF s->>'kind'='dependent' THEN receipt:=public.f11_reconcile_dependent((s->'contract'->>'operationId')::uuid);
  ELSE receipt:=public.f11_reconcile_employee((s->'contract'->>'operationId')::uuid);END IF;
  IF receipt IS NOT NULL THEN
   target:=(receipt->>'id')::bigint;
   IF s->>'kind'='employee-create' THEN
    IF r.employee IS NOT NULL AND r.employee<>target THEN RAISE EXCEPTION 'Photo person changed' USING ERRCODE='22023';END IF;r.employee:=target;
   ELSIF s->>'kind'='employee-update' THEN
    IF target IS DISTINCT FROM r.employee OR target IS DISTINCT FROM(s->>'id')::bigint THEN RAISE EXCEPTION 'Photo person changed' USING ERRCODE='22023';END IF;
   ELSE
    IF(receipt->>'employee_id')::bigint IS DISTINCT FROM r.employee OR(r.dependent IS NOT NULL AND r.dependent<>target) THEN RAISE EXCEPTION 'Photo person changed' USING ERRCODE='22023';END IF;r.dependent:=target;
   END IF;
   r.person_revision:=(receipt->>'revision')::bigint;
   r.payload:=jsonb_set(r.payload,'{save}','null'::jsonb);
   IF NOT erp_private.hr_photo_recovery_authorized(r) THEN RAISE EXCEPTION 'Photo person scope changed' USING ERRCODE='42501';END IF;
   UPDATE erp_private.hr_photo_recovery SET employee=r.employee,dependent=r.dependent,person_revision=r.person_revision,payload=r.payload,revision=revision+1,updated_at=clock_timestamp() WHERE actor=r.actor AND operation=r.operation RETURNING * INTO r;
  END IF;
 END IF;RETURN r;
END$$;

-- Business conflicts are HTTP 409, not retryable serialization failures.
-- PostgREST 14 retries SQLSTATE 40001; a stale user request must return once.
CREATE FUNCTION public.hr_photo_recovery(p_mode text,p_scope text,p_operation uuid DEFAULT NULL,p_expected integer DEFAULT NULL,p_payload jsonb DEFAULT NULL,p_company bigint DEFAULT NULL,p_branch bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r erp_private.hr_photo_recovery;parts text[];op uuid;prior integer;state jsonb;current_photo jsonb;sv jsonb;v_employee bigint;v_dependent bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Photo recovery unavailable' USING ERRCODE='42501';END IF;
 IF p_mode NOT IN('read','write','finish','reject') OR p_scope IS NULL OR p_scope!~'^(employee:(new|[1-9][0-9]*)|dependent:[1-9][0-9]*:(new|[1-9][0-9]*))$' THEN RAISE EXCEPTION 'Invalid photo recovery' USING ERRCODE='22023';END IF;
 parts:=string_to_array(p_scope,':');
 PERFORM pg_advisory_xact_lock(hashtextextended('hr-photo:'||auth.uid()::text||':'||p_scope,0));
 IF p_operation IS NULL THEN
  SELECT operation INTO op FROM erp_private.hr_photo_recovery WHERE actor=auth.uid() AND NOT complete AND(origin_scope=p_scope OR(kind='employee' AND p_scope='employee:'||employee::text) OR(kind='dependent' AND p_scope='dependent:'||employee::text||':'||dependent::text)) ORDER BY created_at LIMIT 1;
 ELSE op:=p_operation;END IF;
 SELECT * INTO r FROM erp_private.hr_photo_recovery WHERE actor=auth.uid() AND operation=op FOR UPDATE;
 IF NOT FOUND THEN
  IF p_mode='read' THEN RETURN NULL;END IF;
  IF p_mode<>'write' OR p_operation IS NULL OR p_expected IS NOT NULL THEN RAISE EXCEPTION 'Photo recovery changed' USING ERRCODE='PT409';END IF;
  r.actor:=auth.uid();r.operation:=p_operation;r.origin_scope:=p_scope;r.kind:=parts[1];
  IF r.kind='employee' THEN r.employee:=nullif(parts[2],'new')::bigint;
  ELSE r.employee:=parts[2]::bigint;r.dependent:=nullif(parts[3],'new')::bigint;END IF;
  IF r.employee IS NOT NULL THEN SELECT owner_company_id,branch_id INTO r.company,r.branch FROM public.employees WHERE id=r.employee AND deleted_at IS NULL;
  ELSE r.company:=p_company;r.branch:=p_branch;END IF;
  r.payload:=p_payload;r.complete:=false;
  IF r.company IS NULL OR NOT erp_private.hr_photo_recovery_authorized(r) THEN RAISE EXCEPTION 'Photo recovery unavailable' USING ERRCODE='42501';END IF;
 ELSE
  IF r.origin_scope<>p_scope AND NOT(r.kind='employee' AND p_scope='employee:'||r.employee::text) AND NOT(r.kind='dependent' AND p_scope='dependent:'||r.employee::text||':'||r.dependent::text) THEN RAISE EXCEPTION 'Photo recovery scope changed' USING ERRCODE='42501';END IF;
  prior:=r.revision;r:=erp_private.hr_photo_recovery_refresh(r.operation);
  IF p_mode='write' AND p_expected IS DISTINCT FROM prior AND p_payload IS DISTINCT FROM r.payload THEN RAISE EXCEPTION 'Photo recovery changed; refresh original request' USING ERRCODE='PT409';END IF;
 END IF;
 IF p_mode='write' AND NOT r.complete THEN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_payload-ARRAY['state','save']<>'{}'::jsonb OR NOT(p_payload ?& ARRAY['state','save']) OR octet_length(p_payload::text)>131072 OR
   jsonb_typeof(p_payload->'state') IS DISTINCT FROM 'object' OR p_payload->'state'->'request'->>'authUserId' IS DISTINCT FROM auth.uid()::text OR p_payload->'state'->'request'?'scope' THEN RAISE EXCEPTION 'Invalid photo state' USING ERRCODE='22023';END IF;
  state:=p_payload->'state';sv:=p_payload->'save';
  IF r.revision IS NOT NULL THEN
   IF((state->'request')-'context')IS DISTINCT FROM((r.payload->'state'->'request')-'context') OR(state->'request'->'context' IS DISTINCT FROM r.payload->'state'->'request'->'context' AND r.payload->'state'->'request'->'context'<>'null'::jsonb) OR
    state->'typeId' IS DISTINCT FROM r.payload->'state'->'typeId' OR state->'title' IS DISTINCT FROM r.payload->'state'->'title' OR state->'expiry' IS DISTINCT FROM r.payload->'state'->'expiry' OR state->'framing' IS DISTINCT FROM r.payload->'state'->'framing' OR
    (r.payload->'state'->'receipt'<>'null'::jsonb AND state->'receipt' IS DISTINCT FROM r.payload->'state'->'receipt') OR
    (r.payload->'state'->'creation'<>'null'::jsonb AND state->'creation'->'contract' IS DISTINCT FROM r.payload->'state'->'creation'->'contract') OR
    (r.payload->'save'<>'null'::jsonb AND sv IS DISTINCT FROM r.payload->'save') THEN RAISE EXCEPTION 'Retained photo identity changed' USING ERRCODE='22023';END IF;
  END IF;
  IF state->'request'->'context'<>'null'::jsonb AND(state->'request'->'context'->>'entityType' IS DISTINCT FROM CASE WHEN r.kind='employee' THEN 'employee' ELSE 'employee_dependent' END OR(state->'request'->'context'->>'entityId')::bigint IS DISTINCT FROM CASE WHEN r.kind='employee' THEN r.employee ELSE r.dependent END) THEN RAISE EXCEPTION 'Photo target changed' USING ERRCODE='42501';END IF;
  IF sv<>'null'::jsonb THEN
   IF sv->>'kind'='employee-create' THEN IF r.kind<>'employee' OR r.employee IS NOT NULL OR(sv->'input'->>'owner_company_id')::bigint IS DISTINCT FROM r.company OR(sv->'input'->>'branch_id')::bigint IS DISTINCT FROM r.branch THEN RAISE EXCEPTION 'Photo creation scope changed' USING ERRCODE='42501';END IF;
   ELSIF sv->>'kind'='employee-update' THEN IF r.kind<>'employee' OR(sv->>'id')::bigint IS DISTINCT FROM r.employee THEN RAISE EXCEPTION 'Photo target changed' USING ERRCODE='42501';END IF;
   ELSIF sv->>'kind'='dependent' THEN IF r.kind<>'dependent' OR(sv->'input'->>'employeeId')::bigint IS DISTINCT FROM r.employee OR(sv->'input'->>'id')::bigint IS DISTINCT FROM r.dependent OR sv->'input'->>'kind'<>'save' THEN RAISE EXCEPTION 'Photo target changed' USING ERRCODE='42501';END IF;
   ELSE RAISE EXCEPTION 'Invalid photo save kind' USING ERRCODE='22023';END IF;
  END IF;
  r.payload:=p_payload;IF NOT erp_private.hr_photo_recovery_authorized(r) THEN RAISE EXCEPTION 'Photo save unavailable' USING ERRCODE='42501';END IF;
  INSERT INTO erp_private.hr_photo_recovery(actor,operation,origin_scope,company,branch,employee,dependent,kind,payload)VALUES(r.actor,r.operation,r.origin_scope,r.company,r.branch,r.employee,r.dependent,r.kind,r.payload)
  ON CONFLICT(actor,operation)DO UPDATE SET payload=excluded.payload,revision=hr_photo_recovery.revision+1,updated_at=clock_timestamp() RETURNING * INTO r;
 ELSIF p_mode='finish' AND NOT r.complete THEN
  IF r.payload->'save'<>'null'::jsonb OR r.employee IS NULL OR(r.kind='dependent' AND r.dependent IS NULL) THEN RAISE EXCEPTION 'Photo save remains unconfirmed' USING ERRCODE='PT409';END IF;
  current_photo:=public.hr_subject_photo_state(r.employee,r.dependent);
  IF current_photo->'photo' IS NULL OR current_photo->'photo'='null'::jsonb OR current_photo->'photo'->>'file_id' IS DISTINCT FROM current_photo->'framing'->'source'->>'fileId' OR current_photo->'photo'->>'version_id' IS DISTINCT FROM current_photo->'framing'->'source'->>'versionId' OR
    (current_photo->>'documentId')::bigint IS DISTINCT FROM(r.payload->'state'->'receipt'->>'documentId')::bigint OR current_photo->'framing'->'source'->>'sha256' IS DISTINCT FROM r.payload->'state'->'request'->'metadata'->>'sha256_hash' OR
    current_photo->'framing'->'crop' IS DISTINCT FROM r.payload->'state'->'framing'->'crop' OR current_photo->'framing'->'rotation' IS DISTINCT FROM r.payload->'state'->'framing'->'rotation' THEN RAISE EXCEPTION 'Photo assignment is not confirmed' USING ERRCODE='PT409';END IF;
  UPDATE erp_private.hr_photo_recovery SET complete=true,revision=revision+1,updated_at=clock_timestamp() WHERE actor=r.actor AND operation=r.operation RETURNING * INTO r;
 ELSIF p_mode='reject' AND NOT r.complete AND r.payload->'save'<>'null'::jsonb THEN
  -- Serialize with both native HR save functions. If a delayed request already
  -- committed, reconcile it. Otherwise retire that operation before allowing
  -- corrected fields; a delayed old request can no longer create/write later.
  sv:=r.payload->'save';
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||(sv->'contract'->>'operationId'),0));
  r:=erp_private.hr_photo_recovery_refresh(r.operation);
  IF r.payload->'save'<>'null'::jsonb THEN
   INSERT INTO erp_private.hr_photo_retired_saves(actor,operation,journal)VALUES(auth.uid(),(sv->'contract'->>'operationId')::uuid,r.operation)ON CONFLICT DO NOTHING;
   UPDATE erp_private.hr_photo_recovery SET payload=jsonb_set(payload,'{save}','null'::jsonb),revision=revision+1,updated_at=clock_timestamp()WHERE actor=r.actor AND operation=r.operation RETURNING * INTO r;
  END IF;
 END IF;
 RETURN jsonb_build_object('operation',r.operation,'scope',r.origin_scope,'revision',r.revision,'employee',r.employee,'dependent',r.dependent,'personRevision',r.person_revision::text,'state',r.payload->'state','save',r.payload->'save','complete',r.complete);
END$$;
REVOKE ALL ON FUNCTION erp_private.hr_photo_recovery_authorized(erp_private.hr_photo_recovery),erp_private.hr_photo_recovery_refresh(uuid),public.hr_photo_recovery(text,text,uuid,integer,jsonb,bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.hr_photo_recovery(text,text,uuid,integer,jsonb,bigint,bigint)TO authenticated;
DO $$DECLARE signature text;d text;n text;pos integer;BEGIN
 FOREACH signature IN ARRAY ARRAY['public.save_workspace_record(text,uuid,bigint,bigint,jsonb)','public.f11_save_dependent(uuid,bigint,bigint,bigint,text,jsonb,bigint[],bigint[])'] LOOP
  d:=pg_get_functiondef(signature::regprocedure);n:='perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'':''||p_operation::text,0));';pos:=position(n IN lower(d));
  IF pos=0 OR position('hr_photo_operation_open' IN d)>0 THEN RAISE EXCEPTION 'Unknown native HR operation lock';END IF;
  EXECUTE substr(d,1,pos+length(n)-1)||E'\n PERFORM erp_private.hr_photo_operation_open(p_operation);\n'||substr(d,pos+length(n));
 END LOOP;
END$$;
-- Required details are a native assignment gate, not a trusted client flag.
-- Existing unchanged historical selections remain intact on unrelated saves.
CREATE FUNCTION erp_private.hr_photo_required_metadata() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE def public.dms_metadata_definitions;actual jsonb;
BEGIN
 IF NEW.photo_dms_document_id IS NULL THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' THEN IF NEW.photo_dms_document_id IS NOT DISTINCT FROM OLD.photo_dms_document_id AND NEW.photo_framing IS NOT DISTINCT FROM OLD.photo_framing THEN RETURN NEW;END IF;END IF;
 FOR def IN SELECT m.* FROM public.dms_metadata_definitions m JOIN public.dms_documents d ON d.document_type_id=m.document_type_id WHERE d.id=NEW.photo_dms_document_id AND m.is_active AND m.deleted_at IS NULL AND m.is_required ORDER BY m.id FOR SHARE OF m LOOP
  SELECT to_jsonb(v)-ARRAY['id','document_id','definition_id','created_by','updated_by','created_at','updated_at','deleted_at'] INTO actual FROM public.dms_document_metadata_values v WHERE document_id=NEW.photo_dms_document_id AND definition_id=def.id AND deleted_at IS NULL;
  PERFORM erp_private.f07_validate_metadata_value(def.id,coalesce(actual,'{}'));
 END LOOP;RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION erp_private.hr_photo_required_metadata()FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER hr_photo_metadata_guard BEFORE INSERT OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION erp_private.hr_photo_required_metadata();
CREATE TRIGGER hr_photo_metadata_guard BEFORE INSERT OR UPDATE ON public.employee_dependents FOR EACH ROW EXECUTE FUNCTION erp_private.hr_photo_required_metadata();
NOTIFY pgrst,'reload schema';
COMMIT;
