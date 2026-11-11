BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Project only explicit DMS renewal pairs. Discover historical completions on
-- demand so enabling the workflow never changes an employee's records.
CREATE FUNCTION erp_private.hr_compliance_renewal_authorized(p_employee bigint, p_kind text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_kind IN ('identity-document','medical-insurance','access-card','training-certificate','medical-record','dependent')
    AND erp_private.f12_review_authorized(p_kind, p_employee)
    AND erp_private.f12_review_visible(p_kind, p_employee);
$$;

CREATE TABLE erp_private.hr_compliance_renewal_confirmations (
  employee_id bigint NOT NULL REFERENCES public.employees(id),
  kind text NOT NULL CHECK (kind IN ('identity-document','medical-insurance','access-card','training-certificate','medical-record','dependent')),
  category text NOT NULL,
  source_id bigint NOT NULL,
  renewal_id bigint NOT NULL REFERENCES public.dms_renewal_requests(id),
  replacement_document_id bigint NOT NULL REFERENCES public.dms_documents(id),
  replacement_version_id bigint NOT NULL REFERENCES public.dms_document_versions(id),
  current_record_id bigint NOT NULL,
  actor uuid NOT NULL,
  operation_id uuid NOT NULL,
  request_hash text NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (employee_id, kind, source_id, renewal_id),
  UNIQUE (actor, operation_id)
);
ALTER TABLE erp_private.hr_compliance_renewal_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.hr_compliance_renewal_confirmations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON erp_private.hr_compliance_renewal_confirmations TO authenticated;
CREATE POLICY hr_compliance_renewal_confirmation_read ON erp_private.hr_compliance_renewal_confirmations
  FOR SELECT TO authenticated USING (erp_private.hr_compliance_renewal_authorized(employee_id, kind)
    AND (category <> 'dependent-insurance' OR erp_private.hr_compliance_renewal_authorized(employee_id, 'medical-insurance')));
CREATE POLICY hr_compliance_renewal_confirmation_insert ON erp_private.hr_compliance_renewal_confirmations
  FOR INSERT TO authenticated WITH CHECK (actor = auth.uid() AND erp_private.hr_compliance_renewal_authorized(employee_id, kind)
    AND (category <> 'dependent-insurance' OR erp_private.hr_compliance_renewal_authorized(employee_id, 'medical-insurance')));

CREATE FUNCTION erp_private.hr_compliance_renewal_dependent_category(p_code text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT CASE
    WHEN p_code IN ('PASSPORT','PASSPORT_COPY','EMP_PASSPORT') THEN 'dependent-passport'
    WHEN p_code IN ('EMIRATES_ID','EMP_EMIRATES_ID','EID') THEN 'dependent-eid'
    WHEN p_code IN ('VISA','RESIDENCE_VISA','EMP_VISA') THEN 'dependent-visa'
    WHEN p_code IN ('MEDICAL_INSURANCE','HEALTH_INSURANCE') THEN 'dependent-insurance'
    ELSE 'dependent'
  END;
$$;

CREATE FUNCTION erp_private.hr_compliance_renewal_fields(p_kind text)
RETURNS text[] LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT CASE p_kind
    WHEN 'identity-document' THEN ARRAY['document_number','issuing_authority','issue_date','expiry_date']
    WHEN 'medical-insurance' THEN ARRAY['insurance_provider','policy_number','insurance_card_number','tpa','network_class','issue_date','expiry_date','employee_covered','dependent_coverage_included','dependent_count_covered']
    WHEN 'access-card' THEN ARRAY['card_number','client_authority','application_reference','issue_date','expiry_date']
    WHEN 'training-certificate' THEN ARRAY['certificate_number','provider','approval_body','completion_date','expiry_date']
    WHEN 'medical-record' THEN ARRAY['report_number','medical_center','examination_date','next_examination_date']
    WHEN 'dependent-passport' THEN ARRAY['passport_number','passport_expiry']
    WHEN 'dependent-eid' THEN ARRAY['emirates_id_number','emirates_id_expiry']
    WHEN 'dependent-visa' THEN ARRAY['residence_visa_number','residence_visa_expiry']
    WHEN 'dependent-insurance' THEN ARRAY['medical_insurance_provider','medical_insurance_policy','medical_insurance_card','medical_insurance_expiry']
  END;
$$;

CREATE FUNCTION erp_private.hr_compliance_renewal_openings(p_employee bigint, p_kind text, p_source bigint DEFAULT NULL, p_renewal bigint DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  source_sql text;
  candidate record;
  category text;
  metadata jsonb;
  fields jsonb;
  snapshot jsonb;
  held text;
  employee_scope record;
  dependent_expiry date;
  evidence jsonb;
  required_fields text[];
  type_policy jsonb;
  returned integer := 0;
BEGIN
  IF NOT coalesce(erp_private.hr_compliance_renewal_authorized(p_employee, p_kind), false) THEN RETURN; END IF;
  SELECT owner_company_id, branch_id INTO employee_scope FROM public.employees WHERE id = p_employee AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_kind = 'dependent' THEN
    source_sql := $q$
      SELECT DISTINCT d.id, d.workspace_revision, l.document_id, d.dms_document_id AS primary_document, d.dependent_name_en AS subject_name
      FROM public.employee_dependents d
      JOIN public.dms_document_links l ON l.entity_type = 'employee_dependent' AND l.entity_id = d.id AND l.deleted_at IS NULL
      WHERE d.employee_id = $1 AND d.deleted_at IS NULL AND d.is_active
    $q$;
  ELSE
    source_sql := format('SELECT id, workspace_revision, dms_document_id AS document_id, dms_document_id AS primary_document, NULL::text AS subject_name
      FROM public.%I WHERE employee_id = $1 AND deleted_at IS NULL AND dms_document_id IS NOT NULL',
      erp_private.f11_compliance_table(p_kind));
  END IF;

  FOR candidate IN EXECUTE format($q$
    WITH sources AS (%s), matches AS (
    SELECT s.*, r.id AS renewal_id, o.id AS original_id, o.document_no AS original_no, o.expiry_date AS original_expiry,
      n.id AS replacement_id, n.document_no AS replacement_no, n.title AS replacement_title,
      n.issue_date, n.expiry_date, n.updated_at AS replacement_updated, n.current_version_id AS version_id,
      n.status AS replacement_status, n.is_archived AS replacement_archived, t.type_code, t.requires_expiry_tracking,
      r.replacement_version_id AS renewed_version, r.new_expiry_date AS renewed_expiry,
      count(*) OVER (PARTITION BY r.id) AS source_count,
      count(*) OVER (PARTITION BY s.id, erp_private.hr_compliance_renewal_dependent_category(t.type_code)) AS dependent_category_count,
      EXISTS (SELECT 1 FROM sources other WHERE other.id <> s.id AND other.document_id = n.id) AS already_used
    FROM sources s
    JOIN public.dms_renewal_requests r ON r.document_id = s.document_id AND r.status = 'renewed' AND r.completed_at IS NOT NULL AND r.deleted_at IS NULL
    JOIN public.dms_documents o ON o.id = r.document_id AND o.status = 'superseded' AND o.is_archived
      AND o.deleted_at IS NULL AND o.superseded_by_document_id = r.replacement_document_id
    JOIN public.dms_documents n ON n.id = r.replacement_document_id AND n.deleted_at IS NULL
      AND n.document_type_id = o.document_type_id AND n.owning_company_id = o.owning_company_id
      AND n.owning_branch_id IS NOT DISTINCT FROM o.owning_branch_id
    JOIN public.dms_document_types t ON t.id = n.document_type_id
    WHERE n.owning_company_id = $3 AND (n.owning_branch_id IS NULL OR n.owning_branch_id = $4)
      AND erp_private.document_permission(o.id, 'dms.documents.view')
      AND erp_private.document_permission(n.id, 'dms.documents.view')
      AND erp_private.document_permission(n.id, 'dms.documents.preview')
      AND EXISTS (SELECT 1 FROM public.dms_document_links l WHERE l.document_id = o.id
        AND l.entity_type = CASE WHEN $2 = 'dependent' THEN 'employee_dependent' ELSE 'employee' END
        AND l.entity_id = CASE WHEN $2 = 'dependent' THEN s.id ELSE $1 END AND l.deleted_at IS NULL)
      AND EXISTS (SELECT 1 FROM public.dms_document_links l WHERE l.document_id = n.id
        AND l.entity_type = CASE WHEN $2 = 'dependent' THEN 'employee_dependent' ELSE 'employee' END
        AND l.entity_id = CASE WHEN $2 = 'dependent' THEN s.id ELSE $1 END AND l.deleted_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM erp_private.hr_compliance_renewal_confirmations c
        WHERE c.employee_id = $1 AND c.kind = $2 AND c.source_id = s.id AND c.renewal_id = r.id)
    )
    SELECT * FROM matches WHERE ($5 IS NULL OR id = $5) AND ($6 IS NULL OR renewal_id = $6)
    ORDER BY renewal_id DESC, id
  $q$, source_sql) USING p_employee, p_kind, employee_scope.owner_company_id, employee_scope.branch_id, p_source, p_renewal
  LOOP
    category := p_kind;
    IF p_kind = 'dependent' THEN
      category := erp_private.hr_compliance_renewal_dependent_category(candidate.type_code);
      IF category = 'dependent-insurance' AND NOT erp_private.hr_compliance_renewal_authorized(p_employee, 'medical-insurance') THEN CONTINUE; END IF;
    END IF;
    held := CASE
      WHEN candidate.source_count <> 1 OR candidate.already_used THEN 'The renewal matches multiple records or the replacement is already used.'
      WHEN category = 'dependent' THEN 'This dependent document type has no verified field mapping.'
      WHEN p_kind = 'dependent' AND candidate.dependent_category_count <> 1 THEN 'Multiple renewals match this dependent credential. Review the DMS history first.'
      WHEN candidate.replacement_archived OR candidate.replacement_status NOT IN ('active','approved')
        THEN 'The replacement is no longer current in DMS.'
      WHEN candidate.version_id IS NULL OR (candidate.renewed_version IS NOT NULL AND candidate.renewed_version <> candidate.version_id)
        OR candidate.renewed_expiry IS DISTINCT FROM candidate.expiry_date THEN 'The replacement evidence changed. Review the DMS renewal before applying it.'
      WHEN NOT public.current_user_can_manage_employee(p_employee) THEN 'Current employee update permission is required to confirm this renewal.'
      WHEN NOT (erp_private.document_permission(candidate.replacement_id, 'dms.documents.edit')
        OR erp_private.document_permission(candidate.replacement_id, 'dms.admin')) THEN 'Current DMS edit permission is required to attach this evidence.'
    END;
    required_fields := ARRAY[]::text[];
    type_policy := '{}'::jsonb;
    IF p_kind = 'access-card' THEN
      SELECT jsonb_build_object('authority',t.requires_client_authority,'site',t.requires_work_site,'siteId',c.work_site_id)
        INTO type_policy FROM public.employee_access_cards c JOIN public.hr_access_card_types t ON t.id = c.access_type_id
        WHERE c.id = candidate.id AND t.is_active AND t.deleted_at IS NULL;
      IF (type_policy->>'authority')::boolean THEN required_fields := array_append(required_fields,'client_authority'); END IF;
      IF held IS NULL AND (type_policy->>'site')::boolean AND type_policy->>'siteId' IS NULL THEN
        held := 'Set the required work site on the existing HR pass before confirming this renewal.';
      END IF;
    ELSIF p_kind = 'identity-document' THEN
      SELECT jsonb_build_object('issue',t.requires_issue_date,'expiry',t.requires_expiry_date)
        INTO type_policy FROM public.employee_identity_documents c JOIN public.hr_identity_document_types t ON t.id = c.document_type_id
        WHERE c.id = candidate.id AND t.is_active AND t.deleted_at IS NULL;
      IF (type_policy->>'issue')::boolean THEN required_fields := array_append(required_fields,'issue_date'); END IF;
      IF (type_policy->>'expiry')::boolean THEN required_fields := array_append(required_fields,'expiry_date'); END IF;
    ELSIF p_kind = 'training-certificate' THEN
      SELECT jsonb_build_object('number',t.requires_certificate_number,'provider',t.requires_provider,'categoryId',t.training_category_id)
        INTO type_policy FROM public.employee_training_certificates c JOIN public.hr_training_types t ON t.id = c.training_type_id
        WHERE c.id = candidate.id AND t.is_active AND t.deleted_at IS NULL;
      IF (type_policy->>'number')::boolean THEN required_fields := array_append(required_fields,'certificate_number'); END IF;
      IF (type_policy->>'provider')::boolean THEN required_fields := array_append(required_fields,'provider'); END IF;
    END IF;
    IF held IS NULL AND type_policy IS NULL THEN held := 'The configured HR type is unavailable. Review it in HR settings.'; END IF;
    IF p_kind = 'dependent' AND category <> 'dependent' THEN
      IF category = 'dependent-insurance' THEN
        dependent_expiry := (public.f11_dependent_medical(p_employee, candidate.id, candidate.workspace_revision)->>'medical_insurance_expiry')::date;
      ELSE
        EXECUTE format('SELECT %I FROM public.employee_dependents WHERE id = $1 AND employee_id = $2',
          (erp_private.hr_compliance_renewal_fields(category))[2])
        INTO dependent_expiry USING candidate.id, p_employee;
      END IF;
      IF held IS NULL AND (dependent_expiry IS DISTINCT FROM candidate.original_expiry
        OR (candidate.original_expiry IS NULL AND candidate.primary_document IS DISTINCT FROM candidate.original_id)) THEN
        held := 'The original does not match the current expiry for this dependent credential.';
      END IF;
    END IF;
    SELECT jsonb_agg(jsonb_build_array(f.id, f.sha256_hash, f.file_size_bytes) ORDER BY f.id) INTO evidence
    FROM public.dms_document_versions v JOIN public.dms_document_files f ON f.version_id = v.id AND f.document_id = v.document_id
    WHERE v.id = candidate.version_id AND v.document_id = candidate.replacement_id AND v.unlinked_at IS NULL
      AND f.deleted_at IS NULL AND f.file_role = 'original' AND f.file_size_bytes > 0;
    IF held IS NULL AND evidence IS NULL THEN held := 'The replacement has no available original file on its current version.'; END IF;

    SELECT coalesce(jsonb_object_agg(field_code, field_value), '{}'::jsonb) INTO metadata
    FROM (
      SELECT def.field_code, min(coalesce(v.value_text, v.value_date::text, v.value_number::text, v.value_boolean::text)) AS field_value
      FROM public.dms_document_metadata_values v
      JOIN public.dms_metadata_definitions def ON def.id = v.definition_id
      WHERE v.document_id = candidate.replacement_id AND v.deleted_at IS NULL AND def.deleted_at IS NULL
      GROUP BY def.field_code
      HAVING count(*) = 1
    ) saved;
    fields := CASE category
      WHEN 'identity-document' THEN jsonb_build_object('document_number',coalesce(metadata->>'document_number',metadata->>'passport_number',metadata->>'emirates_id_number',metadata->>'visa_number',metadata->>'license_number'),
        'issuing_authority',coalesce(metadata->>'issuing_authority',metadata->>'issuer'),'issue_date',candidate.issue_date,'expiry_date',candidate.expiry_date)
      WHEN 'access-card' THEN jsonb_build_object('card_number',coalesce(metadata->>'pass_number',metadata->>'card_number',metadata->>'badge_number'),
        'client_authority',coalesce(metadata->>'client_authority',metadata->>'issuing_authority',metadata->>'issuer'),'application_reference',metadata->>'application_reference',
        'issue_date',candidate.issue_date,'expiry_date',candidate.expiry_date)
      WHEN 'training-certificate' THEN jsonb_build_object('certificate_number',metadata->>'certificate_number','provider',coalesce(metadata->>'training_provider',metadata->>'provider'),
        'approval_body',metadata->>'approval_body','completion_date',metadata->>'completion_date','expiry_date',candidate.expiry_date)
      WHEN 'medical-insurance' THEN jsonb_build_object('insurance_provider',coalesce(metadata->>'insurance_provider',metadata->>'insurer'),'policy_number',metadata->>'policy_number',
        'insurance_card_number',metadata->>'insurance_card_number','tpa',metadata->>'tpa','network_class',metadata->>'network_class','issue_date',candidate.issue_date,'expiry_date',candidate.expiry_date)
      WHEN 'medical-record' THEN jsonb_build_object('report_number',metadata->>'report_number','medical_center',metadata->>'medical_center',
        'examination_date',metadata->>'examination_date','next_examination_date',metadata->>'next_examination_date')
      WHEN 'dependent-passport' THEN jsonb_build_object('passport_number',coalesce(metadata->>'passport_number',metadata->>'document_number'),'passport_expiry',candidate.expiry_date)
      WHEN 'dependent-eid' THEN jsonb_build_object('emirates_id_number',coalesce(metadata->>'emirates_id_number',metadata->>'id_number',metadata->>'document_number'),'emirates_id_expiry',candidate.expiry_date)
      WHEN 'dependent-visa' THEN jsonb_build_object('residence_visa_number',coalesce(metadata->>'residence_visa_number',metadata->>'visa_number',metadata->>'document_number'),'residence_visa_expiry',candidate.expiry_date)
      WHEN 'dependent-insurance' THEN jsonb_build_object('medical_insurance_provider',coalesce(metadata->>'insurance_provider',metadata->>'insurer'),
        'medical_insurance_policy',metadata->>'policy_number','medical_insurance_card',metadata->>'insurance_card_number','medical_insurance_expiry',candidate.expiry_date)
      ELSE '{}'::jsonb
    END;
    snapshot := jsonb_build_object('kind',p_kind,'category',category,'sourceId',candidate.id,'revision',candidate.workspace_revision::text,
      'renewalId',candidate.renewal_id,'originalId',candidate.original_id,'originalNo',candidate.original_no,'originalExpiry',candidate.original_expiry,
      'replacementId',candidate.replacement_id,'replacementNo',candidate.replacement_no,'replacementTitle',candidate.replacement_title,
      'replacementExpiry',candidate.expiry_date,'versionId',candidate.version_id,'documentUpdated',candidate.replacement_updated,
      'requiresExpiry',candidate.requires_expiry_tracking,'requiredFields',required_fields,'subjectName',candidate.subject_name,
      'fields',jsonb_strip_nulls(fields),'hold',held,'evidence',evidence,'typePolicy',type_policy);
    returned := returned + 1;
    IF returned > 100 THEN RAISE EXCEPTION 'Too many open renewals for this category' USING ERRCODE = 'PT413'; END IF;
    RETURN NEXT (snapshot - ARRAY['documentUpdated','evidence']) || jsonb_build_object('fingerprint', encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'));
  END LOOP;
END;
$$;

CREATE FUNCTION public.hr_compliance_renewal_reviews(p_employee bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(opening - 'typePolicy' ORDER BY (opening->>'renewalId')::bigint DESC, opening->>'kind', (opening->>'sourceId')::bigint), '[]'::jsonb)
  FROM unnest(ARRAY['identity-document','medical-insurance','access-card','training-certificate','medical-record','dependent']) kind
  CROSS JOIN LATERAL erp_private.hr_compliance_renewal_openings(p_employee, kind) opening;
$$;

CREATE FUNCTION public.hr_confirm_compliance_renewal(
  p_employee bigint, p_kind text, p_source bigint, p_renewal bigint, p_operation uuid,
  p_fingerprint text, p_fields jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  opening jsonb;
  prior erp_private.hr_compliance_renewal_confirmations;
  digest text;
  category text;
  old_record jsonb;
  payload jsonb;
  receipt jsonb;
  replacement bigint;
  version_id bigint;
  active_status text;
  from_date date;
  to_date date;
  expiry_key text;
  today date := (now() AT TIME ZONE 'Asia/Dubai')::date;
BEGIN
  IF NOT coalesce(erp_private.hr_compliance_renewal_authorized(p_employee, p_kind), false) THEN
    RAISE EXCEPTION 'Current HR compliance authority is required' USING ERRCODE = '42501';
  END IF;
  IF p_source IS NULL OR p_source < 1 OR p_renewal IS NULL OR p_renewal < 1 OR p_operation IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(p_fields) IS DISTINCT FROM 'object' OR octet_length(p_fields::text) > 12000 THEN
    RAISE EXCEPTION 'Invalid original review request' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.employees WHERE id = p_employee AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE = '42501'; END IF;
  digest := encode(sha256(convert_to(jsonb_build_array(p_employee,p_kind,p_source,p_renewal,p_fingerprint,p_fields)::text,'UTF8')),'hex');
  SELECT * INTO prior FROM erp_private.hr_compliance_renewal_confirmations
  WHERE employee_id = p_employee AND kind = p_kind AND source_id = p_source AND renewal_id = p_renewal;
  IF FOUND THEN
    IF prior.actor <> auth.uid() OR prior.operation_id <> p_operation OR prior.request_hash <> digest THEN
      RAISE EXCEPTION 'This renewal is already confirmed' USING ERRCODE = 'PT409';
    END IF;
    IF NOT erp_private.document_permission(prior.replacement_document_id, 'dms.documents.preview') THEN
      RAISE EXCEPTION 'Current evidence access is unavailable' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('employeeId',p_employee,'renewalId',p_renewal,'sourceId',p_source,'operationId',p_operation,'replayed',true);
  END IF;

  SELECT review INTO opening FROM erp_private.hr_compliance_renewal_openings(p_employee, p_kind, p_source, p_renewal) review;
  IF opening IS NULL OR opening->>'fingerprint' IS DISTINCT FROM p_fingerprint OR opening->>'hold' IS NOT NULL THEN
    RAISE EXCEPTION 'The original review changed or is held' USING ERRCODE = 'PT409';
  END IF;
  replacement := (opening->>'replacementId')::bigint;
  version_id := (opening->>'versionId')::bigint;
  PERFORM 1 FROM public.dms_documents WHERE id = replacement AND current_version_id = version_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM erp_private.hr_compliance_renewal_openings(p_employee, p_kind, p_source, p_renewal) review
    WHERE review->>'fingerprint' = p_fingerprint) THEN
    RAISE EXCEPTION 'The replacement changed after opening' USING ERRCODE = 'PT409';
  END IF;

  category := opening->>'category';
  IF erp_private.hr_compliance_renewal_fields(category) IS NULL
    OR EXISTS (SELECT 1 FROM jsonb_each(p_fields) f WHERE NOT f.key = ANY(erp_private.hr_compliance_renewal_fields(category))
      OR jsonb_typeof(f.value) NOT IN ('string','null','number','boolean')
      OR (jsonb_typeof(f.value) = 'string' AND length(f.value #>> '{}') > 500)) THEN
    RAISE EXCEPTION 'Unsupported renewal fields' USING ERRCODE = '22023';
  END IF;
  expiry_key := CASE category WHEN 'medical-record' THEN 'next_examination_date'
    WHEN 'dependent-passport' THEN 'passport_expiry' WHEN 'dependent-eid' THEN 'emirates_id_expiry'
    WHEN 'dependent-visa' THEN 'residence_visa_expiry' WHEN 'dependent-insurance' THEN 'medical_insurance_expiry' ELSE 'expiry_date' END;
  IF EXISTS (SELECT 1 FROM jsonb_each_text(p_fields) f
    WHERE f.key = ANY(ARRAY['issue_date','completion_date','examination_date',expiry_key])
      AND f.value IS NOT NULL AND f.value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN
    RAISE EXCEPTION 'Use calendar dates in YYYY-MM-DD format' USING ERRCODE = '23514';
  END IF;
  from_date := nullif(coalesce(p_fields->>'issue_date',p_fields->>'completion_date',p_fields->>'examination_date'),'')::date;
  to_date := nullif(p_fields->>expiry_key,'')::date;
  IF category <> 'medical-record' AND opening->>'replacementExpiry' IS NOT NULL
    AND to_date IS DISTINCT FROM (opening->>'replacementExpiry')::date THEN
    RAISE EXCEPTION 'Review the same expiry recorded on the DMS replacement' USING ERRCODE = '23514';
  END IF;
  IF (category <> 'medical-record' AND ((opening->>'requiresExpiry')::boolean OR p_kind = 'dependent') AND to_date IS NULL)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(opening->'requiredFields') AS f(key)
      WHERE jsonb_typeof(p_fields->f.key) IS DISTINCT FROM 'string' OR nullif(btrim(p_fields->>f.key),'') IS NULL)
    OR (to_date IS NOT NULL AND from_date IS NOT NULL AND to_date < from_date)
    OR (p_kind = 'medical-insurance' AND (to_date IS NULL OR nullif(btrim(p_fields->>'insurance_provider'),'') IS NULL
      OR nullif(btrim(p_fields->>'policy_number'),'') IS NULL OR jsonb_typeof(p_fields->'employee_covered') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(p_fields->'dependent_coverage_included') IS DISTINCT FROM 'boolean'))
    OR (p_kind = 'identity-document' AND nullif(btrim(p_fields->>'document_number'),'') IS NULL)
    OR (p_kind = 'medical-record' AND from_date IS NULL)
    OR (category = 'dependent-passport' AND nullif(btrim(p_fields->>'passport_number'),'') IS NULL)
    OR (category = 'dependent-eid' AND nullif(btrim(p_fields->>'emirates_id_number'),'') IS NULL)
    OR (category = 'dependent-visa' AND nullif(btrim(p_fields->>'residence_visa_number'),'') IS NULL)
    OR (category = 'dependent-insurance' AND (nullif(btrim(p_fields->>'medical_insurance_provider'),'') IS NULL
      OR nullif(btrim(p_fields->>'medical_insurance_policy'),'') IS NULL)) THEN
    RAISE EXCEPTION 'Complete the required renewal fields and date order' USING ERRCODE = '23514';
  END IF;
  active_status := CASE WHEN to_date < today THEN 'expired' WHEN from_date > today THEN 'pending' ELSE 'active' END;

  IF p_kind = 'dependent' THEN
    -- Each dependent is a person record. Apply only the mapped credential
    -- fields to that person and preserve every other document and attribute.
    IF EXISTS (SELECT 1 FROM jsonb_each(p_fields) f WHERE jsonb_typeof(f.value) NOT IN ('string','null')) THEN
      RAISE EXCEPTION 'Invalid dependent renewal fields' USING ERRCODE = '22023';
    END IF;
    IF category = 'dependent-insurance' AND NOT erp_private.hr_compliance_renewal_authorized(p_employee, 'medical-insurance') THEN
      RAISE EXCEPTION 'Current medical authority is required' USING ERRCODE = '42501';
    END IF;
    SELECT to_jsonb(d.dms_document_id) INTO old_record FROM public.employee_dependents d
    WHERE d.id = p_source AND d.employee_id = p_employee AND d.deleted_at IS NULL;
    payload := p_fields || CASE WHEN (old_record #>> '{}')::bigint = (opening->>'originalId')::bigint
      THEN jsonb_build_object('dms_document_id',replacement) ELSE '{}'::jsonb END;
    receipt := public.f11_save_dependent(p_operation,p_employee,p_source,(opening->>'revision')::bigint,'save',payload,'{}','{}');
  ELSE
    -- Only policy selections carry forward. Evidence-specific values come
    -- from this review. The existing verification operation remains separate.
    EXECUTE format('SELECT to_jsonb(r) FROM public.%I r WHERE id=$1 AND employee_id=$2 AND deleted_at IS NULL',
      erp_private.f11_compliance_table(p_kind)) INTO old_record USING p_source,p_employee;
    IF old_record IS NULL THEN RAISE EXCEPTION 'Compliance source unavailable' USING ERRCODE = '42501'; END IF;
    payload := p_fields || jsonb_build_object('dms_document_id',replacement) || CASE p_kind
      WHEN 'identity-document' THEN jsonb_build_object('document_type_id',old_record->'document_type_id','status',active_status,'verification_status','unverified','renewal_status','not_required')
      WHEN 'medical-insurance' THEN jsonb_build_object('status',active_status,'verification_status','unverified','renewal_status','not_required')
      WHEN 'access-card' THEN jsonb_build_object('access_type_id',old_record->'access_type_id','work_site_id',old_record->'work_site_id','status',active_status,'renewal_status','not_required')
      WHEN 'training-certificate' THEN jsonb_build_object('training_type_id',old_record->'training_type_id','training_category_id',opening->'typePolicy'->'categoryId',
        'required_for_designation',old_record->'required_for_designation','required_for_site',old_record->'required_for_site',
        'status',CASE WHEN active_status='active' THEN 'valid' ELSE active_status END,'verification_status','unverified')
      WHEN 'medical-record' THEN jsonb_build_object('medical_record_type_id',old_record->'medical_record_type_id',
        'required_for_visa',old_record->'required_for_visa','required_for_site',old_record->'required_for_site','required_for_noc',old_record->'required_for_noc',
        'result','under_review','fit_for_work',false,'work_restrictions',coalesce(old_record->'work_restrictions','false'::jsonb),'restriction_details',old_record->'restriction_details')
    END;
    PERFORM public.f11_mutate_compliance_child(p_kind,p_employee,p_source,(opening->>'revision')::bigint,
      md5(p_operation::text || ':archive')::uuid,'archive','{}');
    receipt := public.f11_mutate_compliance_child(p_kind,p_employee,NULL,NULL,p_operation,'create',payload);
  END IF;
  INSERT INTO erp_private.hr_compliance_renewal_confirmations
    (employee_id,kind,category,source_id,renewal_id,replacement_document_id,replacement_version_id,current_record_id,actor,operation_id,request_hash)
  VALUES (p_employee,p_kind,category,p_source,p_renewal,replacement,version_id,(receipt->>'id')::bigint,auth.uid(),p_operation,digest);
  RETURN jsonb_build_object('employeeId',p_employee,'renewalId',p_renewal,'sourceId',p_source,'operationId',p_operation,'replayed',false);
END;
$$;

REVOKE ALL ON FUNCTION erp_private.hr_compliance_renewal_authorized(bigint,text),
  erp_private.hr_compliance_renewal_dependent_category(text),
  erp_private.hr_compliance_renewal_fields(text), erp_private.hr_compliance_renewal_openings(bigint,text,bigint,bigint),
  public.hr_compliance_renewal_reviews(bigint), public.hr_confirm_compliance_renewal(bigint,text,bigint,bigint,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.hr_compliance_renewal_authorized(bigint,text),
  erp_private.hr_compliance_renewal_dependent_category(text),
  erp_private.hr_compliance_renewal_fields(text), erp_private.hr_compliance_renewal_openings(bigint,text,bigint,bigint),
  public.hr_compliance_renewal_reviews(bigint), public.hr_confirm_compliance_renewal(bigint,text,bigint,bigint,uuid,text,jsonb)
  TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
