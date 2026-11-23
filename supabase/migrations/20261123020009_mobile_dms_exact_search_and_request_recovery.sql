BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Batch transport for one result page. Each entry still crosses the canonical
-- active-principal, permission, current-version and fingerprint checks.
CREATE FUNCTION erp_private.mobile_dms_search_sources(p_sources jsonb, p_recheck boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  item jsonb;
  binding jsonb;
  result jsonb := '[]'::jsonb;
  selected_id bigint;
  seen bigint[] := '{}'::bigint[];
BEGIN
  IF jsonb_typeof(p_sources) IS DISTINCT FROM 'array' OR p_recheck IS NULL THEN
    RAISE EXCEPTION 'Invalid search sources' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_sources) NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Invalid search page size' USING ERRCODE = '22023';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_sources) WITH ORDINALITY AS items(value, position) ORDER BY position LOOP
    PERFORM erp_private.mobile_dms_keys(item, CASE WHEN p_recheck
      THEN ARRAY['documentId','versionId','sourceHash'] ELSE ARRAY['documentId'] END);
    IF jsonb_typeof(item->'documentId') IS DISTINCT FROM 'number'
       OR (item->>'documentId') !~ '^[1-9][0-9]{0,15}$'
       OR (p_recheck AND (jsonb_typeof(item->'versionId') IS DISTINCT FROM 'number'
         OR (item->>'versionId') !~ '^[1-9][0-9]{0,15}$'
         OR jsonb_typeof(item->'sourceHash') IS DISTINCT FROM 'string'
         OR (item->>'sourceHash') !~ '^[0-9a-f]{64}$')) THEN
      RAISE EXCEPTION 'Invalid search source' USING ERRCODE = '22023';
    END IF;
    selected_id := (item->>'documentId')::bigint;
    IF selected_id = ANY(seen) OR selected_id > 9007199254740991
       OR (p_recheck AND (item->>'versionId')::bigint > 9007199254740991) THEN
      RAISE EXCEPTION 'Invalid search source identity' USING ERRCODE = '22023';
    END IF;
    seen := array_append(seen, selected_id);

    binding := erp_private.mobile_dms_read_source(item, ARRAY['dms.documents.view']);
    IF NOT p_recheck THEN
      result := result || jsonb_build_array(jsonb_build_object(
        'documentId', binding->'documentId', 'versionId', binding->'documentVersionId', 'sourceHash', binding->'sourceHash'));
    END IF;
  END LOOP;
  RETURN CASE WHEN p_recheck THEN 'true'::jsonb ELSE result END;
END $$;

CREATE FUNCTION public.mobile_dms_search_sources(p_sources jsonb, p_recheck boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT erp_private.mobile_dms_search_sources(p_sources, p_recheck)
$$;

-- Recover only one original evidence intent. The existing request projection
-- owns visibility and computes the available actions for the current actor.
CREATE FUNCTION erp_private.mobile_dms_request_evidence(p_data jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  request_row jsonb;
  kind text := p_data->>'kind';
  target_parent jsonb := p_data->'parent';
  target_request bigint;
  renewal_version bigint;
  renewal_hash text;
  field text;
BEGIN
  PERFORM erp_private.mobile_dms_actor();
  PERFORM erp_private.mobile_dms_keys(p_data, ARRAY['kind','parent','requestId','revision','documentTypeId']);
  FOREACH field IN ARRAY ARRAY['requestId','revision','documentTypeId'] LOOP
    IF jsonb_typeof(p_data->field) IS DISTINCT FROM 'number' OR (p_data->>field) !~ '^[1-9][0-9]{0,15}$'
       OR (p_data->>field)::bigint > 9007199254740991 THEN
      RAISE EXCEPTION 'Invalid evidence request' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF kind IS NULL OR kind NOT IN ('missing','renewal') THEN
    RAISE EXCEPTION 'Invalid evidence request' USING ERRCODE = '22023';
  END IF;
  PERFORM erp_private.mobile_dms_parent(target_parent);
  target_request := (p_data->>'requestId')::bigint;
  request_row := erp_private.mobile_dms_request_row(kind, target_request, target_parent);
  IF request_row IS NULL OR request_row->'revision' IS DISTINCT FROM p_data->'revision'
     OR request_row->'documentTypeId' IS DISTINCT FROM p_data->'documentTypeId'
     OR NOT coalesce(request_row->'actions' ? 'submit_document', false) THEN
    RAISE EXCEPTION 'Evidence request unavailable' USING ERRCODE = 'PT404';
  END IF;
  IF kind = 'renewal' THEN
    -- Match the canonical submission boundary. Historical renewals without
    -- retained context still need an admissible current original.
    SELECT source_version, source_hash INTO renewal_version, renewal_hash
    FROM erp_private.mobile_dms_renewal_context WHERE request_id = target_request;
    PERFORM erp_private.mobile_dms_read_source(jsonb_strip_nulls(jsonb_build_object(
      'documentId', request_row->'sourceDocumentId', 'versionId', renewal_version, 'sourceHash', renewal_hash)),
      ARRAY['dms.documents.view']);
  END IF;
  RETURN true;
END $$;

CREATE FUNCTION public.mobile_dms_request_evidence(p_data jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT erp_private.mobile_dms_request_evidence(p_data)
$$;

REVOKE ALL ON FUNCTION
  erp_private.mobile_dms_search_sources(jsonb, boolean), public.mobile_dms_search_sources(jsonb, boolean),
  erp_private.mobile_dms_request_evidence(jsonb), public.mobile_dms_request_evidence(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  erp_private.mobile_dms_search_sources(jsonb, boolean), public.mobile_dms_search_sources(jsonb, boolean),
  erp_private.mobile_dms_request_evidence(jsonb), public.mobile_dms_request_evidence(jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
