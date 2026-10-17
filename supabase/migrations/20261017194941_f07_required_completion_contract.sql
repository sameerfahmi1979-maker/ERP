-- New completion boundaries only: no historical scan, inferred values or backfill.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Definitions are shared form configuration, not company records. The legacy
-- global-only reader hid every required definition from a scoped DMS viewer.
-- Enable configuration reads for that existing capability; do not widen any
-- document/value row policy or configuration-management authority.
ALTER POLICY dms_metadata_def_select ON public.dms_metadata_definitions TO authenticated
 USING (erp_private.business_principal_is_active() AND
  (public.current_user_has_permission_any_scope('dms.documents.view') OR public.current_user_has_permission_any_scope('dms.admin')));

CREATE FUNCTION erp_private.f07_assert_document_completion(p_document bigint) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.dms_documents; t public.dms_document_types; m public.dms_metadata_definitions; v jsonb;
BEGIN
 SELECT * INTO d FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR d.is_archived OR d.status IN ('draft','pending_ai_review','rejected','archived','superseded','deleted')
  AND coalesce(d.approval_status,'') NOT IN ('pending_approval','approved') THEN RETURN; END IF;
 SELECT * INTO t FROM public.dms_document_types WHERE id=d.document_type_id AND is_active AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'An active document type is required before completion' USING ERRCODE='22023';END IF;
 IF t.requires_expiry_tracking AND d.expiry_date IS NULL THEN
  RAISE EXCEPTION 'Expiry date is required before activation or approval; retain the document as a draft' USING ERRCODE='22023';END IF;
 IF d.issue_date IS NOT NULL AND d.expiry_date<d.issue_date THEN
  RAISE EXCEPTION 'Expiry date must be on or after issue date' USING ERRCODE='22023';END IF;
 FOR m IN SELECT * FROM public.dms_metadata_definitions WHERE document_type_id=d.document_type_id
  AND is_active AND deleted_at IS NULL ORDER BY id FOR SHARE LOOP
  SELECT jsonb_build_object('value_text',x.value_text,'value_number',x.value_number,'value_date',x.value_date,
   'value_datetime',x.value_datetime,'value_boolean',x.value_boolean,'value_json',x.value_json)
   INTO v FROM public.dms_document_metadata_values x WHERE document_id=d.id AND definition_id=m.id AND deleted_at IS NULL;
  IF m.is_required OR v IS NOT NULL THEN PERFORM erp_private.f07_validate_metadata_value(m.id,coalesce(v,'{}'));END IF;
 END LOOP;
END $$;

-- Deferral lets an atomic AI transaction insert the document and its reviewed
-- values together. Direct table callers cannot commit a falsely complete record.
CREATE FUNCTION erp_private.f07_completion_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='dms_documents' THEN PERFORM erp_private.f07_assert_document_completion(NEW.id);
 ELSIF TG_OP='DELETE' THEN PERFORM erp_private.f07_assert_document_completion(OLD.document_id);
 ELSE PERFORM erp_private.f07_assert_document_completion(NEW.document_id);END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER f07_document_completion_insert AFTER INSERT ON public.dms_documents
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.f07_completion_guard();
CREATE CONSTRAINT TRIGGER f07_document_completion_update AFTER UPDATE ON public.dms_documents
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (
  ROW(OLD.status,OLD.approval_status,OLD.document_type_id,OLD.issue_date,OLD.expiry_date) IS DISTINCT FROM
  ROW(NEW.status,NEW.approval_status,NEW.document_type_id,NEW.issue_date,NEW.expiry_date))
 EXECUTE FUNCTION erp_private.f07_completion_guard();
CREATE CONSTRAINT TRIGGER f07_metadata_completion AFTER INSERT OR UPDATE OR DELETE ON public.dms_document_metadata_values
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.f07_completion_guard();

-- The single numbered consumer compares this same canonical shape at prepare,
-- reserve and receipt replay. Reject malformed values before reserving a number;
-- the row/commit guards independently enforce types/options/required values.
CREATE OR REPLACE FUNCTION erp_private.ai_approval_metadata(p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item jsonb; d record; raw text; v jsonb; output jsonb:='[]';
BEGIN
 FOR item IN SELECT x FROM jsonb_array_elements(p_request->'metadataValues') x ORDER BY (x->>'definitionId')::bigint LOOP
  SELECT id,field_type INTO d FROM public.dms_metadata_definitions WHERE id=(item->>'definitionId')::bigint
   AND document_type_id=(p_request->>'documentTypeId')::bigint AND is_active AND deleted_at IS NULL;
  IF NOT FOUND OR d.field_type IS DISTINCT FROM item->>'fieldType' THEN RAISE EXCEPTION 'Metadata definition unavailable or changed' USING ERRCODE='23503';END IF;
  raw:=item->>'rawValue';IF raw IS NULL OR btrim(raw)='' THEN CONTINUE;END IF;
  v:=jsonb_build_object('definition_id',d.id,'value_text',null,'value_number',null,'value_date',null,'value_datetime',null,'value_boolean',null,'value_json',null);
  CASE d.field_type
   WHEN 'number','decimal','currency' THEN
    IF raw !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' THEN RAISE EXCEPTION 'Invalid metadata number' USING ERRCODE='22023';END IF;
    v:=v||jsonb_build_object('value_number',raw::numeric);
   WHEN 'date' THEN
    IF raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Invalid metadata date' USING ERRCODE='22023';END IF;
    v:=v||jsonb_build_object('value_date',raw::date);
   WHEN 'datetime' THEN
    IF raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*(Z|[+-][0-9]{2}:[0-9]{2})$' THEN RAISE EXCEPTION 'Metadata datetime needs a timezone' USING ERRCODE='22023';END IF;
    v:=v||jsonb_build_object('value_datetime',raw::timestamptz);
   WHEN 'boolean' THEN
    IF raw NOT IN ('true','false','1','0') THEN RAISE EXCEPTION 'Invalid metadata boolean' USING ERRCODE='22023';END IF;
    v:=v||jsonb_build_object('value_boolean',raw IN ('true','1'));
   WHEN 'json','multiselect','multi_select' THEN v:=v||jsonb_build_object('value_json',raw::jsonb);
   ELSE v:=v||jsonb_build_object('value_text',raw);
  END CASE;
  output:=output||jsonb_build_array(v);
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.dms_metadata_definitions m WHERE m.document_type_id=(p_request->>'documentTypeId')::bigint
  AND m.is_active AND m.deleted_at IS NULL AND m.is_required AND NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(output) x WHERE (x->>'definition_id')::bigint=m.id
    AND x->erp_private.f07_metadata_column(m.field_type) IS NOT NULL
    AND x->erp_private.f07_metadata_column(m.field_type) NOT IN ('null'::jsonb,'[]'::jsonb,'""'::jsonb))) THEN
  RAISE EXCEPTION 'Complete the required metadata before approval' USING ERRCODE='22023';END IF;
 RETURN output;
END $$;
-- Pure field-name mapping has no data access; no validation definer is exposed.
GRANT EXECUTE ON FUNCTION erp_private.f07_metadata_column(text) TO authenticated;

-- Preserve the original F06 allocator, source identity, receipt and recovery
-- contract. Only the initial status is adapted: missing required metadata/expiry
-- is an editable draft, never a doomed reservation or a falsely active document.
DO $patch$
DECLARE original text; updated text; needle text := '(prepared#>>''{type,category_id}'')::bigint,''active'',prepared#>>''{type,default_confidentiality}'',actor,';
BEGIN
 SELECT pg_get_functiondef('erp_private.numbered_upload_plan(uuid,jsonb,boolean)'::regprocedure) INTO original;
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN
  RAISE EXCEPTION 'Numbered upload status adoption requires source reconciliation';END IF;
 updated:=replace(original,needle,$replacement$(prepared#>>'{type,category_id}')::bigint,
   CASE WHEN EXISTS(SELECT 1 FROM public.dms_metadata_definitions required WHERE required.document_type_id=(prepared#>>'{type,id}')::bigint
      AND required.is_active AND required.deleted_at IS NULL AND required.is_required)
     OR coalesce((prepared#>>'{type,requires_expiry_tracking}')::boolean,false) AND nullif(p_request->>'expiry_date','') IS NULL
    THEN 'draft' ELSE 'active' END,prepared#>>'{type,default_confidentiality}',actor,$replacement$);
 EXECUTE updated;
END $patch$;
REVOKE ALL ON FUNCTION erp_private.f07_assert_document_completion(bigint),erp_private.f07_completion_guard()
 FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
