BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- The existing F03 view rule is stable within a statement and reads the
-- issuance's source type/ID, owner and output code (or legacy template key).
-- Resolve it once per exact document authority group. Return each document's
-- own lifecycle, class, retention and metadata; there is no result reuse
-- across requests or mutation access inferred from this decision.
CREATE FUNCTION erp_private.speed_output_ops_admitted(p_input jsonb,p_search text)
RETURNS TABLE(document public.erp_generated_pdf_documents,source_branch_id bigint)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH candidates AS MATERIALIZED (
    SELECT d AS document,d.owner_company_id,e.branch_id AS source_branch_id,e.id IS NOT NULL AS has_subject,
      min(d.id) OVER (PARTITION BY d.owner_company_id,d.source_record_type,d.source_record_id,d.output_code,d.template_key,d.document_class) AS representative
    FROM public.erp_generated_pdf_documents AS d
    LEFT JOIN public.employees AS e
      ON d.source_record_type = 'employee'
     AND e.id = d.source_record_id
     AND e.owner_company_id = d.owner_company_id
     AND e.deleted_at IS NULL
    WHERE (p_input->>'id' IS NULL OR d.id = (p_input->>'id')::bigint)
      AND (nullif(p_input->>'lifecycleState','') IS NULL OR d.lifecycle_state = p_input->>'lifecycleState')
      AND (nullif(p_input->>'documentClass','') IS NULL OR d.document_class = p_input->>'documentClass')
      AND (nullif(p_input->>'outputCode','') IS NULL OR d.output_code = p_input->>'outputCode')
      AND (p_input->>'ownerCompanyId' IS NULL OR d.owner_company_id = (p_input->>'ownerCompanyId')::bigint)
      AND (nullif(p_input->>'renderer','') IS NULL OR d.renderer = p_input->>'renderer')
      AND (p_input->>'generatedBy' IS NULL OR d.generated_by = (p_input->>'generatedBy')::bigint)
      AND (nullif(p_input->>'dateFrom','') IS NULL OR d.generated_at >= nullif(p_input->>'dateFrom','')::timestamptz)
      AND (nullif(p_input->>'dateTo','') IS NULL OR d.generated_at <= nullif(p_input->>'dateTo','')::timestamptz)
      AND (p_search IS NULL OR d.serial_no ILIKE '%'||p_search||'%' OR
        d.file_name ILIKE '%'||p_search||'%' OR d.output_code ILIKE '%'||p_search||'%')
  ), authority_groups AS MATERIALIZED (
    SELECT DISTINCT representative,has_subject,owner_company_id,source_branch_id FROM candidates
  ), qualified AS MATERIALIZED (
    SELECT representative
    FROM authority_groups
    WHERE CASE WHEN (SELECT public.current_user_is_global_admin()) OR (
        has_subject AND erp_private.permission_in_scope('outputs.ops.view',owner_company_id,source_branch_id))
      THEN erp_private.generated_pdf_permission(representative,'view')
      ELSE false END
  )
  SELECT c.document,c.source_branch_id FROM candidates c JOIN qualified q USING (representative)
$$;
REVOKE ALL ON FUNCTION erp_private.speed_output_ops_admitted(jsonb,text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION erp_private.speed_output_ops_snapshot(p_value jsonb,p_keys text[])
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN jsonb_typeof(p_value) = 'object' THEN coalesce(jsonb_object_agg(key,value),'{}'::jsonb) END FROM jsonb_each(
    CASE WHEN jsonb_typeof(p_value) = 'object' THEN p_value ELSE '{}'::jsonb END
  ) WHERE key = ANY(p_keys) AND jsonb_typeof(value) IN ('string','number','boolean','null')
$$;
REVOKE ALL ON FUNCTION erp_private.speed_output_ops_snapshot(jsonb,text[]) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION erp_private.speed_output_ops_list_row(p_doc public.erp_generated_pdf_documents,p_branch bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', (p_doc).id, 'output_code', (p_doc).output_code, 'template_key', (p_doc).template_key,
    'document_class', (p_doc).document_class, 'lifecycle_state', (p_doc).lifecycle_state,
    'serial_no', (p_doc).serial_no, 'serial_status', (p_doc).serial_status,
    'owner_company_id', (p_doc).owner_company_id, 'source_record_type', (p_doc).source_record_type,
    'source_record_id', (p_doc).source_record_id, 'file_name', (p_doc).file_name, 'file_size_bytes', (p_doc).file_size_bytes,
    'renderer', (p_doc).renderer, 'renderer_version', (p_doc).renderer_version, 'generated_by', (p_doc).generated_by,
    'generated_at', (p_doc).generated_at, 'issued_at', (p_doc).issued_at, 'failed_at', (p_doc).failed_at,
    'cancelled_at', (p_doc).cancelled_at, 'revoked_at', (p_doc).revoked_at, 'superseded_by_id', (p_doc).superseded_by_id,
    'failure_reason', (p_doc).failure_reason,
    'total_duration_ms', floor(extract(epoch FROM (p_doc).issued_at)*1000)-floor(extract(epoch FROM (p_doc).generated_at)*1000),
    'canRetry', erp_private.permission_in_scope('outputs.ops.retry',(p_doc).owner_company_id,p_branch),
    'canRevoke', erp_private.permission_in_scope('outputs.ops.revoke',(p_doc).owner_company_id,p_branch)
  )
$$;
REVOKE ALL ON FUNCTION erp_private.speed_output_ops_list_row(public.erp_generated_pdf_documents,bigint) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION erp_private.speed_output_ops_read(p_mode text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  result jsonb;
  page_limit integer;
  page_offset bigint;
  search_term text;
  recent_cutoff timestamptz := statement_timestamp()-interval '24 hours';
  stuck_cutoff timestamptz := statement_timestamp()-interval '15 minutes';
BEGIN
  IF NOT erp_private.business_principal_is_active()
     OR NOT public.current_user_has_permission_any_scope('outputs.ops.view') THEN
    RAISE EXCEPTION 'Output operations access denied' USING ERRCODE = '42501';
  END IF;

  IF p_mode = 'list' THEN
    page_limit := coalesce((p_input->>'pageSize')::int,25);
    IF page_limit NOT BETWEEN 1 AND 100 OR coalesce((p_input->>'page')::bigint,0) NOT BETWEEN 0 AND 9007199254740991 THEN
      RAISE EXCEPTION 'Invalid output operations page' USING ERRCODE = '22023';
    END IF;
    page_offset := coalesce((p_input->>'page')::bigint,0)*page_limit;
    search_term := nullif(btrim(regexp_replace(left(p_input->>'search',120),'[%,()]','','g')),'');

    WITH matching AS MATERIALIZED (
      SELECT document,source_branch_id FROM erp_private.speed_output_ops_admitted(p_input,search_term)
    ), page AS (
      SELECT document,source_branch_id FROM matching ORDER BY (document).generated_at DESC,(document).id DESC
      LIMIT page_limit OFFSET page_offset
    )
    SELECT jsonb_build_object(
      'rows',coalesce((SELECT jsonb_agg(erp_private.speed_output_ops_list_row(document,source_branch_id)
                                ORDER BY (document).generated_at DESC,(document).id DESC) FROM page),'[]'::jsonb),
      'total',(SELECT count(*) FROM matching)
    ) INTO result;

  ELSIF p_mode = 'detail' THEN
    SELECT erp_private.speed_output_ops_list_row(document,source_branch_id) || jsonb_build_object(
      'request_key', (document).request_key, 'content_fingerprint', (document).content_fingerprint,
      'checksum', (document).checksum, 'checksum_algorithm', (document).checksum_algorithm,
      'chromium_version', (document).chromium_version, 'template_id', (document).template_id,
      'template_version', (document).template_version, 'locale', (document).locale, 'direction', (document).direction,
      'page_count', (document).page_count, 'rendering_started_at', (document).rendering_started_at,
      'uploaded_at', (document).uploaded_at, 'reconciled_at', (document).reconciled_at,
      'revoke_reason', (document).revoke_reason, 'serial_void_reason', (document).serial_void_reason,
      'supersedes_issuance_id', (document).supersedes_issuance_id, 'expires_at', (document).expires_at,
      'policy_snapshot_json', erp_private.speed_output_ops_snapshot((document).policy_snapshot_json,
        ARRAY['documentClass','qrPolicy','qrValidityDays','approvalRequired','allowQuickPrint','publicDisclosure','requiresSerial','official']),
      'branding_snapshot_json', erp_private.speed_output_ops_snapshot((document).branding_snapshot_json,
        ARRAY['schemaVersion','templateId','templateRevision','templateVersion','brandingProfileId','brandingRevision','ownerCompanyId','companyNameEn','companyNameAr'])
        || coalesce((SELECT jsonb_build_object('assets',jsonb_agg(erp_private.speed_output_ops_snapshot(asset,ARRAY['id','type','version','revision']) ORDER BY ordinal))
                    FROM jsonb_array_elements(CASE WHEN jsonb_typeof((document).branding_snapshot_json->'assets') = 'array'
                         THEN (document).branding_snapshot_json->'assets' ELSE '[]'::jsonb END) WITH ORDINALITY AS asset_rows(asset,ordinal)
                    WHERE jsonb_typeof(asset) = 'object'
                    HAVING count(*) > 0),'{}'::jsonb),
      'data_snapshot_json', CASE WHEN content.allowed THEN (document).data_snapshot_json ELSE NULL END,
      'data_snapshot_hidden', NOT content.allowed AND (document).data_snapshot_json IS NOT NULL
    ) INTO result
    FROM erp_private.speed_output_ops_admitted(jsonb_build_object('id',p_input->>'id'),NULL)
    CROSS JOIN LATERAL (
      SELECT erp_private.permission_in_scope('reports.view',(document).owner_company_id,source_branch_id)
        OR erp_private.permission_in_scope('reports.manage',(document).owner_company_id,source_branch_id) AS allowed
    ) AS content
    WHERE (document).id = (p_input->>'id')::bigint;

  ELSIF p_mode = 'metrics' THEN
    WITH admitted AS MATERIALIZED (
      SELECT (document).id,(document).output_code,(document).lifecycle_state,(document).generated_at,
        (document).serial_status,(document).rendering_started_at,(document).uploaded_at,(document).failure_reason
      FROM erp_private.speed_output_ops_admitted('{}',NULL)
    ), stuck AS (
      SELECT id,output_code,lifecycle_state,generated_at FROM admitted
      WHERE lifecycle_state IN ('pending','rendering','uploaded') AND generated_at < stuck_cutoff
    ), recon AS (
      SELECT id,output_code,failure_reason,generated_at FROM admitted WHERE lifecycle_state = 'reconciliation_required'
    )
    SELECT jsonb_build_object(
      'stateCounts', (SELECT coalesce(jsonb_object_agg(state,n),'{}'::jsonb)
        FROM (SELECT coalesce(lifecycle_state,'unknown') AS state,count(*) AS n FROM admitted GROUP BY 1) AS breakdown),
      'issuedLast24h', count(*) FILTER (WHERE lifecycle_state = 'issued' AND generated_at >= recent_cutoff),
      'failedLast24h', count(*) FILTER (WHERE lifecycle_state IN ('failed_retryable','failed_terminal') AND generated_at >= recent_cutoff),
      'avgRenderMsLast24h', floor(avg(floor(extract(epoch FROM uploaded_at)*1000)-floor(extract(epoch FROM rendering_started_at)*1000))
        FILTER (WHERE lifecycle_state = 'issued' AND generated_at >= recent_cutoff)+0.5),
      'voidedSerials', count(*) FILTER (WHERE serial_status = 'voided'),
      'stuckCount', (SELECT count(*) FROM stuck),
      'stuckInFlight', (SELECT coalesce(jsonb_agg(to_jsonb(sample) ORDER BY generated_at DESC,id DESC),'[]'::jsonb)
        FROM (SELECT * FROM stuck ORDER BY generated_at DESC,id DESC LIMIT 20) AS sample),
      'reconciliationCount', (SELECT count(*) FROM recon),
      'reconciliationRequired', (SELECT coalesce(jsonb_agg(to_jsonb(sample) ORDER BY generated_at DESC,id DESC),'[]'::jsonb)
        FROM (SELECT * FROM recon ORDER BY generated_at DESC,id DESC LIMIT 20) AS sample),
      'scheduleRuns', NULL::jsonb
    ) INTO result FROM admitted;
  ELSE
    RAISE EXCEPTION 'Invalid output operations read' USING ERRCODE = '22023';
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.speed_output_ops_read(text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.speed_output_ops_read(text,jsonb) TO authenticated;

-- The existing QR table policy also applies to the Console. Enrich only the
-- admitted metadata in the caller-role wrapper, after the definer read returns.
CREATE FUNCTION public.speed_output_ops_read(p_mode text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  result jsonb := erp_private.speed_output_ops_read(p_mode,p_input);
  links jsonb;
BEGIN
  IF p_mode = 'list' THEN
    SELECT jsonb_set(result,'{rows}',coalesce(jsonb_agg(
      row_data || jsonb_build_object('qr_status',(
        SELECT link.status FROM public.erp_output_public_links AS link
        WHERE link.generated_pdf_document_id = (row_data->>'id')::bigint AND link.deleted_at IS NULL
        ORDER BY link.id DESC LIMIT 1
      )) ORDER BY ordinal),'[]'::jsonb))
    INTO result
    FROM jsonb_array_elements(result->'rows') WITH ORDINALITY AS page(row_data,ordinal);
  ELSIF p_mode = 'detail' AND result IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(to_jsonb(projected) ORDER BY projected.id),'[]'::jsonb)
    INTO links
    FROM (
      SELECT id,status,issued_at,expires_at,cancelled_at,cancel_reason,view_count
      FROM public.erp_output_public_links
      WHERE generated_pdf_document_id = (result->>'id')::bigint AND deleted_at IS NULL
    ) AS projected;
    result := result || jsonb_build_object('qr_links',links,'qr_status',links->0->'status');
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.speed_output_ops_read(text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.speed_output_ops_read(text,jsonb) TO authenticated;
COMMIT;
