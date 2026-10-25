BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

ALTER TABLE public.employees ADD COLUMN photo_framing jsonb;
ALTER TABLE public.employee_dependents ADD COLUMN photo_framing jsonb;
GRANT SELECT(photo_framing) ON public.employees,public.employee_dependents TO authenticated;

-- Decoder attestations are private. A client-supplied width/height is not proof
-- of the original image's dimensions. Only the application decoder records it.
CREATE TABLE erp_private.hr_photo_sources(file_id bigint PRIMARY KEY REFERENCES public.dms_document_files(id),sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),width integer NOT NULL CHECK(width BETWEEN 24 AND 20000),height integer NOT NULL CHECK(height BETWEEN 28 AND 20000),CHECK(width::bigint*height<=30000000));
REVOKE ALL ON erp_private.hr_photo_sources FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.hr_attest_photo_image(p_employee bigint,p_dependent bigint,p_source jsonb,p_claims jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior text;r jsonb;f public.dms_document_files;BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted image decoder required' USING ERRCODE='42501';END IF;
 prior:=current_setting('request.jwt.claims',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_claims->>'sub','session_id',p_claims->>'session_id','role','authenticated')::text,true);
 r:=public.f12_subject_photo(p_employee,p_dependent,(p_source->>'documentId')::bigint);
 IF jsonb_array_length(r)<>1 THEN RAISE EXCEPTION 'Photo access unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO f FROM public.dms_document_files WHERE id=(r->0->>'file_id')::bigint AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND OR f.id IS DISTINCT FROM(p_source->>'fileId')::bigint OR f.version_id IS DISTINCT FROM(p_source->>'versionId')::bigint OR f.sha256_hash IS DISTINCT FROM p_source->>'sha256' THEN RAISE EXCEPTION 'Photo changed' USING ERRCODE='PT409';END IF;
 INSERT INTO erp_private.hr_photo_sources(file_id,sha256,width,height)VALUES(f.id,f.sha256_hash,(p_source->>'width')::integer,(p_source->>'height')::integer)
 ON CONFLICT(file_id)DO UPDATE SET sha256=excluded.sha256,width=excluded.width,height=excluded.height WHERE(hr_photo_sources.sha256,hr_photo_sources.width,hr_photo_sources.height)IS DISTINCT FROM(excluded.sha256,excluded.width,excluded.height);
 PERFORM set_config('request.jwt.claims',coalesce(prior,''),true);RETURN true;
END$$;
REVOKE ALL ON FUNCTION public.hr_attest_photo_image(bigint,bigint,jsonb,jsonb)FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_attest_photo_image(bigint,bigint,jsonb,jsonb)TO service_role;

CREATE FUNCTION erp_private.hr_photo_frame_valid(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE s jsonb;c jsonb;w numeric;h numeric;x numeric;y numeric;cw numeric;ch numeric;r integer;
BEGIN
 IF p IS NULL THEN RETURN true;END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR NOT(p ?& ARRAY['version','source','rotation','crop']) OR p-ARRAY['version','source','rotation','crop']<>'{}'::jsonb OR p->>'version' IS DISTINCT FROM '1' THEN RETURN false;END IF;
 s:=p->'source';c:=p->'crop';
 IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR jsonb_typeof(c) IS DISTINCT FROM 'object' OR s-ARRAY['documentId','versionId','fileId','sha256','width','height']<>'{}'::jsonb OR c-ARRAY['x','y','width','height']<>'{}'::jsonb THEN RETURN false;END IF;
 IF NOT(s ?& ARRAY['documentId','versionId','fileId','sha256','width','height']) OR NOT(c ?& ARRAY['x','y','width','height']) OR NOT(p ?& ARRAY['version','rotation']) THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(s-'sha256') e WHERE jsonb_typeof(e.value)<>'number' OR e.value::text!~'^[1-9][0-9]*$' OR e.value::text::numeric>9007199254740991) OR
 EXISTS(SELECT 1 FROM jsonb_each(c)e WHERE jsonb_typeof(e.value)<>'number') OR jsonb_typeof(p->'rotation')<>'number' OR p->>'rotation' NOT IN('0','90','180','270') OR jsonb_typeof(p->'version')<>'number' OR jsonb_typeof(s->'sha256') IS DISTINCT FROM 'string' OR s->>'sha256'!~'^[a-f0-9]{64}$' THEN RETURN false;END IF;
 r:=(p->>'rotation')::integer;w:=(s->>'width')::numeric;h:=(s->>'height')::numeric;
 IF r NOT IN(0,90,180,270) OR w>20000 OR h>20000 OR w*h>30000000 THEN RETURN false;END IF;
 IF r IN(90,270) THEN w:=(s->>'height')::numeric;h:=(s->>'width')::numeric;END IF;
 x:=(c->>'x')::numeric;y:=(c->>'y')::numeric;cw:=(c->>'width')::numeric;ch:=(c->>'height')::numeric;
 RETURN x>=0 AND y>=0 AND cw>0 AND ch>0 AND x+cw<=100.00001 AND y+ch<=100.00001 AND w*cw/100>=24 AND h*ch/100>=28 AND abs((w*cw)/(h*ch)-6.0/7)<0.005;
EXCEPTION WHEN OTHERS THEN RETURN false;
END$$;
REVOKE ALL ON FUNCTION erp_private.hr_photo_frame_valid(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.hr_photo_frame_valid(jsonb) TO authenticated;
ALTER TABLE public.employees ADD CONSTRAINT employee_photo_framing_valid CHECK(erp_private.hr_photo_frame_valid(photo_framing));
ALTER TABLE public.employee_dependents ADD CONSTRAINT dependent_photo_framing_valid CHECK(erp_private.hr_photo_frame_valid(photo_framing));

CREATE FUNCTION erp_private.hr_photo_framing_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e bigint;dep bigint;f public.dms_document_files;matched jsonb;
BEGIN
 IF NEW.photo_dms_document_id IS NULL THEN NEW.photo_framing:=NULL;RETURN NEW;END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.photo_dms_document_id IS DISTINCT FROM OLD.photo_dms_document_id AND NEW.photo_framing IS NOT DISTINCT FROM OLD.photo_framing THEN NEW.photo_framing:=NULL;END IF;
  IF NEW.photo_dms_document_id IS NOT DISTINCT FROM OLD.photo_dms_document_id AND NEW.photo_framing IS NOT DISTINCT FROM OLD.photo_framing THEN RETURN NEW;END IF;
 END IF;
 IF NEW.photo_framing IS NULL THEN RETURN NEW;END IF;
 IF NOT erp_private.hr_photo_frame_valid(NEW.photo_framing) THEN RAISE EXCEPTION 'Invalid photo framing' USING ERRCODE='22023';END IF;
 IF TG_TABLE_NAME='employees' THEN e:=NEW.id;dep:=NULL;ELSE e:=NEW.employee_id;dep:=NEW.id;END IF;
 matched:=public.f12_subject_photo(e,dep,NEW.photo_dms_document_id);
 IF jsonb_array_length(matched)<>1 THEN RAISE EXCEPTION 'Exact current photo access required' USING ERRCODE='42501';END IF;
 SELECT * INTO f FROM public.dms_document_files WHERE id=(matched->0->>'file_id')::bigint AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND OR (NEW.photo_framing->'source'->>'documentId')::bigint<>NEW.photo_dms_document_id OR
 (NEW.photo_framing->'source'->>'versionId')::bigint<>f.version_id OR (NEW.photo_framing->'source'->>'fileId')::bigint<>f.id OR
 NEW.photo_framing->'source'->>'sha256' IS DISTINCT FROM f.sha256_hash THEN RAISE EXCEPTION 'Photo changed; adjust its current framing' USING ERRCODE='PT409';END IF;
 PERFORM 1 FROM public.dms_documents d WHERE d.id=f.document_id AND d.current_version_id=f.version_id AND NOT d.is_archived AND d.deleted_at IS NULL
 AND(TG_TABLE_NAME<>'employees' OR(d.owning_company_id=(to_jsonb(NEW)->>'owner_company_id')::bigint AND(d.owning_branch_id IS NULL OR d.owning_branch_id=(to_jsonb(NEW)->>'branch_id')::bigint)))FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current photo and employment scope must match' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM erp_private.hr_photo_sources a WHERE a.file_id=f.id AND a.sha256=f.sha256_hash AND a.width=(NEW.photo_framing->'source'->>'width')::integer AND a.height=(NEW.photo_framing->'source'->>'height')::integer)THEN RAISE EXCEPTION 'Original image decoding required' USING ERRCODE='PT409';END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION erp_private.hr_photo_framing_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER hr_photo_framing_guard BEFORE INSERT OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION erp_private.hr_photo_framing_guard();
CREATE TRIGGER hr_photo_framing_guard BEFORE INSERT OR UPDATE ON public.employee_dependents FOR EACH ROW EXECUTE FUNCTION erp_private.hr_photo_framing_guard();

-- Extend the existing guarded writes rather than creating a second save path.
DO $$ DECLARE d text;n text; BEGIN
 d:=pg_get_functiondef('public.save_workspace_record(text,uuid,bigint,bigint,jsonb)'::regprocedure);
 n:='''photo_dms_document_id'',''owner_company_id''';
 IF position(n IN d)=0 THEN RAISE EXCEPTION 'Unknown employee whitelist';END IF;
 EXECUTE replace(d,n,'''photo_dms_document_id'',''photo_framing'',''owner_company_id''');
 d:=pg_get_functiondef('public.f11_save_dependent(uuid,bigint,bigint,bigint,text,jsonb,bigint[],bigint[])'::regprocedure);
 n:='''photo_dms_document_id'',''notes''';
 IF position(n IN d)=0 THEN RAISE EXCEPTION 'Unknown dependent whitelist';END IF;
 EXECUTE replace(d,n,'''photo_dms_document_id'',''photo_framing'',''notes''');
END$$;

CREATE FUNCTION public.hr_subject_photo_state(p_employee bigint,p_dependent bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE doc bigint;frame jsonb;r jsonb;
BEGIN
 -- The existing read checks current HR subject and dependent authority even when no photo is selected.
 PERFORM public.f12_subject_photo(p_employee,p_dependent,NULL);
 IF p_dependent IS NULL THEN SELECT photo_dms_document_id,photo_framing INTO doc,frame FROM public.employees WHERE id=p_employee AND deleted_at IS NULL;
 ELSE SELECT photo_dms_document_id,photo_framing INTO doc,frame FROM public.employee_dependents WHERE id=p_dependent AND employee_id=p_employee AND deleted_at IS NULL;END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Person unavailable' USING ERRCODE='42501';END IF;
 r:=CASE WHEN doc IS NULL THEN '[]'::jsonb ELSE public.f12_subject_photo(p_employee,p_dependent,doc) END;
 RETURN jsonb_build_object('documentId',doc,'framing',frame,'photo',r->0,'canDownload',doc IS NOT NULL AND jsonb_array_length(r)=1 AND (erp_private.document_permission(doc,'dms.documents.download') OR erp_private.document_permission(doc,'dms.admin')));
END$$;
REVOKE ALL ON FUNCTION public.hr_subject_photo_state(bigint,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.hr_subject_photo_state(bigint,bigint) TO authenticated;

-- Original bytes and rendered bytes have separate identities. Only the trusted
-- server may attest output; current original session and exact subject are rechecked.
CREATE FUNCTION erp_private.hr_record_photo_response(p_employee bigint,p_dependent bigint,p_binding jsonb,p_frame jsonb,p_claims jsonb,p_action text,p_output_sha text,p_output_bytes bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE claims text;s jsonb;f public.dms_document_files;actor bigint;eid bigint;required text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted photo delivery required' USING ERRCODE='42501';END IF;
 claims:=current_setting('request.jwt.claims',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_claims->>'sub','session_id',p_claims->>'session_id','role','authenticated')::text,true);
 IF p_action IS NULL OR p_action NOT IN('preview','download','original') OR p_output_sha IS NULL OR p_output_sha!~'^[a-f0-9]{64}$' OR p_output_bytes IS NULL OR p_output_bytes<1 OR p_output_bytes>10485760 THEN RAISE EXCEPTION 'Invalid output receipt' USING ERRCODE='22023';END IF;
 IF NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Current person access required' USING ERRCODE='42501';END IF;
 IF p_dependent IS NULL THEN PERFORM 1 FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR SHARE;
 ELSE PERFORM 1 FROM public.employee_dependents WHERE id=p_dependent AND employee_id=p_employee AND deleted_at IS NULL FOR SHARE;END IF;
 s:=public.hr_subject_photo_state(p_employee,p_dependent);
 IF s->'photo' IS NULL OR s->'photo'='null'::jsonb OR s->'framing' IS DISTINCT FROM coalesce(p_frame,'null'::jsonb) THEN RAISE EXCEPTION 'Saved photo changed' USING ERRCODE='PT409';END IF;
 SELECT * INTO f FROM public.dms_document_files WHERE id=(s->'photo'->>'file_id')::bigint AND deleted_at IS NULL FOR SHARE;
 required:=CASE WHEN p_action='preview' THEN 'dms.documents.preview' ELSE 'dms.documents.download' END;
 IF NOT FOUND OR NOT(erp_private.document_permission(f.document_id,required) OR erp_private.document_permission(f.document_id,'dms.admin')) THEN RAISE EXCEPTION 'Photo unavailable' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.dms_documents WHERE id=f.document_id AND current_version_id=f.version_id AND NOT is_archived AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND OR p_binding IS DISTINCT FROM jsonb_build_object('id',f.id,'document_id',f.document_id,'version_id',f.version_id,'storage_bucket',f.storage_bucket,'storage_path',f.storage_path,'file_name',f.file_name,'mime_type',f.mime_type,'file_size_bytes',f.file_size_bytes,'sha256_hash',f.sha256_hash) THEN RAISE EXCEPTION 'Photo source changed' USING ERRCODE='PT409';END IF;
 IF p_frame IS NOT NULL AND ((p_frame->'source'->>'fileId')::bigint<>f.id OR (p_frame->'source'->>'versionId')::bigint<>f.version_id OR p_frame->'source'->>'sha256' IS DISTINCT FROM f.sha256_hash) THEN RAISE EXCEPTION 'Photo framing source changed' USING ERRCODE='PT409';END IF;
 actor:=public.current_user_profile_id();
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json)
 VALUES(f.document_id,'subject_photo_response_prepared','Private photo response prepared; client receipt is not confirmed.',actor,
 jsonb_build_object('employee_id',p_employee,'dependent_id',p_dependent,'file_id',f.id,'version_id',f.version_id,'source_sha256',f.sha256_hash,'framing',p_frame,'action',p_action,'output_sha256',p_output_sha,'output_bytes',p_output_bytes)) RETURNING id INTO eid;
 PERFORM set_config('request.jwt.claims',coalesce(claims,''),true);RETURN eid;
END$$;
REVOKE ALL ON FUNCTION erp_private.hr_record_photo_response(bigint,bigint,jsonb,jsonb,jsonb,text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp_private.hr_record_photo_response(bigint,bigint,jsonb,jsonb,jsonb,text,text,bigint) TO service_role;
CREATE FUNCTION public.hr_record_photo_response(p_employee bigint,p_dependent bigint,p_binding jsonb,p_frame jsonb,p_claims jsonb,p_action text,p_output_sha text,p_output_bytes bigint) RETURNS bigint
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.hr_record_photo_response($1,$2,$3,$4,$5,$6,$7,$8)$$;
REVOKE ALL ON FUNCTION public.hr_record_photo_response(bigint,bigint,jsonb,jsonb,jsonb,text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_record_photo_response(bigint,bigint,jsonb,jsonb,jsonb,text,text,bigint) TO service_role;
COMMIT;
