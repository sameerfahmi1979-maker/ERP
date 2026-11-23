-- Fixed shared HR configuration reads. Caller RLS applies independently to the
-- parent row, each linked record, and each linked company.
DO $$
DECLARE target record;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  IF NOT EXISTS (SELECT FROM pg_proc WHERE oid = 'public.current_user_can_view_hr_settings()'::regprocedure AND provolatile = 's') THEN
    RAISE EXCEPTION 'Unexpected HR settings authority function';
  END IF;
  FOR target IN SELECT * FROM (VALUES
    ('hr_approval_workflows', 'hr_approval_workflows_select'),
    ('hr_readiness_rule_templates', 'hr_readiness_rules_select'),
    ('hr_role_requirement_matrix', 'hr_role_req_matrix_select'),
    ('hr_site_requirement_matrix', 'hr_site_req_matrix_select')
  ) owned(table_name, policy_name) LOOP
    IF NOT EXISTS (
      SELECT FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      WHERE c.relnamespace = 'public'::regnamespace AND c.relname = target.table_name
      AND c.relrowsecurity AND p.polname = target.policy_name AND p.polcmd = 'r' AND p.polpermissive
      AND p.polroles = ARRAY[0::oid] AND p.polwithcheck IS NULL
      AND pg_get_expr(p.polqual, p.polrelid) IN ('current_user_can_view_hr_settings()', 'public.current_user_can_view_hr_settings()')
    ) THEN RAISE EXCEPTION 'Unexpected HR settings SELECT policy on %', target.table_name; END IF;
    -- An uncorrelated subquery checks the same stable predicate once per
    -- statement. Applicable roles, restrictions and mutation policies stay intact.
    EXECUTE format('ALTER POLICY %I ON public.%I USING ((SELECT public.current_user_can_view_hr_settings()))',
      target.policy_name, target.table_name);
  END LOOP;
END;
$$;

CREATE FUNCTION erp_private.hr_rule_reference_label(p_id bigint, p_name text, p_company text, p_empty text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT CASE
    WHEN p_name ~ '[^[:space:]]' THEN p_name || coalesce(' — ' || nullif(p_company, ''), '')
    WHEN p_id IS NULL THEN p_empty
    ELSE 'Saved selection (details unavailable)'
  END;
$$;

-- Match numeric runs in mixed names/codes while sorting their text case-insensitively.
CREATE FUNCTION erp_private.hr_rule_text_sort(p_value text)
RETURNS text[] LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(array_agg(
    CASE WHEN part[1] ~ '^[0-9]' THEN
      '1' || lpad(length(ltrim(part[1], '0'))::text, 6, '0') || ltrim(part[1], '0')
    ELSE '0' || part[1] END ORDER BY n
  ), ARRAY[]::text[])
  FROM regexp_matches(lower(p_value), '[0-9]+|[^0-9]+', 'g') WITH ORDINALITY AS parts(part, n);
$$;

CREATE FUNCTION public.hr_rule_settings_page(
  p_entity text, p_page integer, p_size integer, p_search text, p_filters jsonb, p_sort jsonb
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  fields text[];
  numbers text[];
  default_order text;
  default_display_order text;
  final_order text;
  joins text;
  labels text;
  projected text;
  row_data constant text := $project$
    (SELECT jsonb_object_agg(item.key, item.value)
     FROM jsonb_each(raw) item WHERE item.key = ANY($1))
    || jsonb_build_object('id', id, 'workspace_revision', revision, 'reference_labels', labels)
  $project$;
  sort_fields text[] := ARRAY[]::text[];
  filter_entry record;
  sort_entry jsonb;
  field text;
  skipped bigint;
  result jsonb;
BEGIN
  IF NOT public.f03_current_session_valid() OR NOT (
    public.current_user_has_permission_any_scope('hr.settings.view')
    OR public.current_user_has_permission_any_scope('hr.settings.manage')
    OR public.current_user_has_permission_any_scope('hr.admin')
  ) OR NOT public.current_user_can_view_hr_settings() THEN
    RAISE EXCEPTION 'HR configuration unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_page IS NULL OR p_page < 1 OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 200
    OR p_search IS NULL OR length(p_search) > 2000
    OR jsonb_typeof(p_filters) IS DISTINCT FROM 'object' OR jsonb_typeof(p_sort) IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'Invalid HR configuration criteria' USING ERRCODE = '22023'; END IF;
  skipped := (p_page::bigint - 1) * p_size;

  CASE p_entity
  WHEN 'hr_readiness_rule_templates' THEN
    fields := ARRAY['rule_code','rule_name_en','rule_name_ar','readiness_dimension','requirement_type',
      'required_document_type_id','required_training_type_id','required_access_card_type_id','required_medical_record_type_id',
      'applies_to_category_id','applies_to_designation_id','applies_to_work_site_id','expiry_buffer_days','sort_order','is_critical','waiver_allowed','is_active'];
    numbers := ARRAY['expiry_buffer_days','sort_order'];
    default_order := 'sort_order, rule_name_en, id';
    joins := $joins$
      LEFT JOIN public.hr_identity_document_types doc ON doc.id = r.required_document_type_id
      LEFT JOIN public.hr_training_types training ON training.id = r.required_training_type_id
      LEFT JOIN public.hr_access_card_types card ON card.id = r.required_access_card_type_id
      LEFT JOIN public.hr_medical_record_types medical ON medical.id = r.required_medical_record_type_id
      LEFT JOIN public.hr_employee_categories category ON category.id = r.applies_to_category_id
      LEFT JOIN public.designations designation ON designation.id = r.applies_to_designation_id
      LEFT JOIN public.owner_companies designation_owner ON designation_owner.id = designation.owner_company_id
      LEFT JOIN public.work_sites site ON site.id = r.applies_to_work_site_id
      LEFT JOIN public.owner_companies site_owner ON site_owner.id = site.owner_company_id
    $joins$;
    labels := $labels$
      jsonb_build_object(
        'required_document_type_id', erp_private.hr_rule_reference_label(r.required_document_type_id, doc.name_en, NULL, 'Not assigned'),
        'required_training_type_id', erp_private.hr_rule_reference_label(r.required_training_type_id, training.name_en, NULL, 'Not assigned'),
        'required_access_card_type_id', erp_private.hr_rule_reference_label(r.required_access_card_type_id, card.name_en, NULL, 'Not assigned'),
        'required_medical_record_type_id', erp_private.hr_rule_reference_label(r.required_medical_record_type_id, medical.name_en, NULL, 'Not assigned'),
        'applies_to_category_id', erp_private.hr_rule_reference_label(r.applies_to_category_id, category.name_en, NULL, 'No category selected'),
        'applies_to_designation_id', erp_private.hr_rule_reference_label(r.applies_to_designation_id, designation.designation_name_en, designation_owner.legal_name_en, 'No designation selected'),
        'applies_to_work_site_id', erp_private.hr_rule_reference_label(r.applies_to_work_site_id, site.site_name, site_owner.legal_name_en, 'No work site selected'))
    $labels$;
  WHEN 'hr_role_requirement_matrix' THEN
    fields := ARRAY['readiness_rule_template_id','employee_category_id','designation_id','is_required','is_active','notes'];
    numbers := ARRAY[]::text[];
    default_order := 'id DESC';
    joins := $joins$
      LEFT JOIN public.hr_readiness_rule_templates rule ON rule.id = r.readiness_rule_template_id
      LEFT JOIN public.hr_employee_categories category ON category.id = r.employee_category_id
      LEFT JOIN public.designations designation ON designation.id = r.designation_id
      LEFT JOIN public.owner_companies designation_owner ON designation_owner.id = designation.owner_company_id
    $joins$;
    labels := $labels$
      jsonb_build_object(
        'readiness_rule_template_id', erp_private.hr_rule_reference_label(r.readiness_rule_template_id, rule.rule_name_en, NULL, 'Not assigned'),
        'employee_category_id', erp_private.hr_rule_reference_label(r.employee_category_id, category.name_en, NULL, 'No category selected'),
        'designation_id', erp_private.hr_rule_reference_label(r.designation_id, designation.designation_name_en, designation_owner.legal_name_en, 'No designation selected'))
    $labels$;
  WHEN 'hr_site_requirement_matrix' THEN
    fields := ARRAY['work_site_id','readiness_rule_template_id','access_card_type_id','training_type_id','medical_record_type_id','is_required','is_active','notes'];
    numbers := ARRAY[]::text[];
    default_order := 'id DESC';
    joins := $joins$
      LEFT JOIN public.work_sites site ON site.id = r.work_site_id
      LEFT JOIN public.owner_companies site_owner ON site_owner.id = site.owner_company_id
      LEFT JOIN public.hr_readiness_rule_templates rule ON rule.id = r.readiness_rule_template_id
      LEFT JOIN public.hr_access_card_types card ON card.id = r.access_card_type_id
      LEFT JOIN public.hr_training_types training ON training.id = r.training_type_id
      LEFT JOIN public.hr_medical_record_types medical ON medical.id = r.medical_record_type_id
    $joins$;
    labels := $labels$
      jsonb_build_object(
        'work_site_id', erp_private.hr_rule_reference_label(r.work_site_id, site.site_name, site_owner.legal_name_en, 'No work site selected'),
        'readiness_rule_template_id', erp_private.hr_rule_reference_label(r.readiness_rule_template_id, rule.rule_name_en, NULL, 'Not assigned'),
        'access_card_type_id', erp_private.hr_rule_reference_label(r.access_card_type_id, card.name_en, NULL, 'Not assigned'),
        'training_type_id', erp_private.hr_rule_reference_label(r.training_type_id, training.name_en, NULL, 'Not assigned'),
        'medical_record_type_id', erp_private.hr_rule_reference_label(r.medical_record_type_id, medical.name_en, NULL, 'Not assigned'))
    $labels$;
  WHEN 'hr_approval_workflows' THEN
    fields := ARRAY['workflow_code','workflow_name_en','workflow_name_ar','workflow_type','approval_step',
      'approval_role_id','escalation_role_id','sla_hours','is_required','is_active'];
    numbers := ARRAY['approval_step','sla_hours'];
    default_order := 'workflow_code, approval_step, id';
    joins := $joins$
      LEFT JOIN public.approval_roles approver ON approver.id = r.approval_role_id
      LEFT JOIN public.owner_companies approver_owner ON approver_owner.id = approver.owner_company_id
      LEFT JOIN public.approval_roles escalation ON escalation.id = r.escalation_role_id
      LEFT JOIN public.owner_companies escalation_owner ON escalation_owner.id = escalation.owner_company_id
    $joins$;
    labels := $labels$
      jsonb_build_object(
        'approval_role_id', erp_private.hr_rule_reference_label(r.approval_role_id, approver.role_name, approver_owner.legal_name_en, 'Not assigned'),
        'escalation_role_id', erp_private.hr_rule_reference_label(r.escalation_role_id, escalation.role_name, escalation_owner.legal_name_en, 'Not assigned'))
    $labels$;
  ELSE
    RAISE EXCEPTION 'Invalid HR configuration worklist' USING ERRCODE = '22023';
  END CASE;

  FOR filter_entry IN SELECT * FROM jsonb_each(p_filters) LOOP
    IF NOT filter_entry.key = ANY(fields) OR jsonb_typeof(filter_entry.value) <> 'string'
      OR length(filter_entry.value #>> '{}') > 2000
      OR (filter_entry.key = ANY(numbers) AND (filter_entry.value #>> '{}') !~* '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)(e[+-]?[0-9]{1,3})?$')
    THEN RAISE EXCEPTION 'Invalid HR configuration filter' USING ERRCODE = '22023'; END IF;
  END LOOP;

  FOR sort_entry IN SELECT value FROM jsonb_array_elements(p_sort) LOOP
    field := sort_entry->>'id';
    IF jsonb_typeof(sort_entry) <> 'object' OR jsonb_typeof(sort_entry->'desc') IS DISTINCT FROM 'boolean'
      OR field IS NULL OR NOT field = ANY(fields) OR field = ANY(sort_fields)
    THEN RAISE EXCEPTION 'Invalid HR configuration sort' USING ERRCODE = '22023'; END IF;
    sort_fields := array_append(sort_fields, field);
    final_order := concat_ws(', ', final_order, format(
      CASE WHEN field = ANY(numbers) THEN $order$
        (CASE WHEN modes->>%1$L = 'text' THEN lower(criteria->>%1$L) END) COLLATE "C" %2$s,
        (CASE WHEN modes->>%1$L IS DISTINCT FROM 'text' THEN coalesce(nullif(criteria->>%1$L, ''), '0')::numeric END) %2$s
      $order$ ELSE $order$
        (CASE WHEN modes->>%1$L = 'natural' THEN erp_private.hr_rule_text_sort(criteria->>%1$L) END) COLLATE "C" %2$s,
        (CASE coalesce(modes->>%1$L, 'basic') WHEN 'text' THEN lower(criteria->>%1$L)
          WHEN 'basic' THEN criteria->>%1$L END) COLLATE "C" %2$s
      $order$ END, field, CASE WHEN (sort_entry->>'desc')::boolean THEN 'DESC' ELSE 'ASC' END));
  END LOOP;

  projected := format(
    'SELECT r.id, r.workspace_revision::text AS revision, to_jsonb(r) AS raw, %s AS labels FROM source r %s', labels, joins);

  -- On the default page no joined label can affect membership or order.
  -- Count parent rows and resolve labels only after the limit, in one snapshot.
  IF p_search = '' AND p_filters = '{}'::jsonb AND p_sort = '[]'::jsonb THEN
    EXECUTE format($query$
      WITH page AS (
        SELECT *, row_number() OVER (ORDER BY %2$s) AS position
        FROM public.%1$I WHERE deleted_at IS NULL ORDER BY %2$s LIMIT $2 OFFSET $3
      ),
      source AS (SELECT * FROM page),
      projected AS (%3$s)
      SELECT jsonb_build_object(
        'data', coalesce((SELECT jsonb_agg(%4$s ORDER BY (raw->>'position')::bigint) FROM projected), '[]'::jsonb),
        'total', (SELECT count(*) FROM public.%1$I WHERE deleted_at IS NULL))
    $query$, p_entity, default_order, projected, row_data)
    INTO result USING fields, p_size, skipped;
    RETURN result;
  END IF;

  -- The same authorized display values drive columns, search, and filtering.
  -- Qualify the full set before paging, with native default order as the tie-break.
  default_display_order := CASE p_entity
    WHEN 'hr_readiness_rule_templates' THEN '(raw->>''sort_order'')::int, raw->>''rule_name_en'', id'
    WHEN 'hr_approval_workflows' THEN 'raw->>''workflow_code'', (raw->>''approval_step'')::int, id'
    ELSE 'id DESC'
  END;
  final_order := concat_ws(', ', final_order, default_display_order);
  EXECUTE format($query$
    WITH source AS (SELECT * FROM public.%1$I WHERE deleted_at IS NULL),
    projected AS (%2$s),
    displayed AS (
      SELECT *, (SELECT jsonb_object_agg(item.key,
        CASE jsonb_typeof(item.value)
          WHEN 'boolean' THEN to_jsonb(CASE WHEN item.value = 'true'::jsonb THEN 'Yes' ELSE 'No' END)
          WHEN 'null' THEN to_jsonb(''::text)
          ELSE item.value END)
        FROM jsonb_each(raw) item WHERE item.key = ANY($1)) || labels AS criteria
      FROM projected
    ),
    matched AS MATERIALIZED (
      SELECT * FROM displayed d
      WHERE ($2 = '' OR EXISTS (SELECT FROM jsonb_each_text(d.criteria) item WHERE strpos(lower(item.value), lower($2)) > 0))
      AND NOT EXISTS (
        SELECT FROM jsonb_each_text($3) f
        WHERE NOT CASE WHEN f.key = ANY($4)
          THEN coalesce(nullif(d.criteria->>f.key, ''), '0')::numeric = f.value::numeric
          ELSE strpos(lower(d.criteria->>f.key), lower(f.value)) > 0 END)
    ),
    -- TanStack chooses its automatic comparator from the filtered sequence
    -- after the first ten rows. Preserve that mode over the full matched set,
    -- including text fallback for a numeric column with an empty cell.
    sort_sample AS (
      SELECT criteria FROM matched WHERE cardinality($7) > 0 ORDER BY %5$s OFFSET 10
    ),
    sort_modes AS (
      SELECT jsonb_object_agg(key, mode) AS modes FROM (
        SELECT item.key, CASE
          WHEN bool_or(jsonb_typeof(item.value) = 'string' AND (item.value #>> '{}') ~ '[0-9]') THEN 'natural'
          WHEN bool_or(jsonb_typeof(item.value) = 'string') THEN 'text'
          ELSE 'basic' END AS mode
        FROM sort_sample, jsonb_each(criteria) item WHERE item.key = ANY($7) GROUP BY item.key
      ) known
    ),
    page AS (SELECT matched.*, sort_modes.modes FROM matched CROSS JOIN sort_modes ORDER BY %3$s LIMIT $5 OFFSET $6)
    SELECT jsonb_build_object(
      'data', coalesce((SELECT jsonb_agg(%4$s ORDER BY %3$s) FROM page), '[]'::jsonb),
      'total', (SELECT count(*) FROM matched))
  $query$, p_entity, projected, final_order, row_data, default_display_order)
  INTO result USING fields, p_search, p_filters, numbers, p_size, skipped, sort_fields;
  RETURN result;
END;
$$;

CREATE FUNCTION public.hr_rule_settings_choices(
  p_entity text, p_field text, p_parent bigint, p_page integer, p_search text
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  source text;
  name_column text := 'name_en';
  code_column text := 'code';
  choice_condition text := 'q.is_active IS TRUE';
  company_join text := '';
  company_label text := '''''';
  selected bigint;
  parent_found boolean;
  skipped bigint;
  result jsonb;
BEGIN
  IF NOT public.f03_current_session_valid() OR NOT public.current_user_can_manage_hr_settings() THEN
    RAISE EXCEPTION 'HR configuration choices unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_page IS NULL OR p_page < 1 OR p_search IS NULL OR length(p_search) > 200
    OR (p_parent IS NOT NULL AND p_parent < 1)
  THEN RAISE EXCEPTION 'Invalid HR configuration choice criteria' USING ERRCODE = '22023'; END IF;
  skipped := (p_page::bigint - 1) * 25;

  -- Allowlist the owning form and the specific foreign key together.
  source := CASE
    WHEN p_entity = 'hr_readiness_rule_templates' AND p_field = 'required_document_type_id' THEN 'hr_identity_document_types'
    WHEN p_entity = 'hr_readiness_rule_templates' AND p_field = 'required_training_type_id'
      OR p_entity = 'hr_site_requirement_matrix' AND p_field = 'training_type_id' THEN 'hr_training_types'
    WHEN p_entity = 'hr_readiness_rule_templates' AND p_field = 'required_access_card_type_id'
      OR p_entity = 'hr_site_requirement_matrix' AND p_field = 'access_card_type_id' THEN 'hr_access_card_types'
    WHEN p_entity = 'hr_readiness_rule_templates' AND p_field = 'required_medical_record_type_id'
      OR p_entity = 'hr_site_requirement_matrix' AND p_field = 'medical_record_type_id' THEN 'hr_medical_record_types'
    WHEN p_entity = 'hr_readiness_rule_templates' AND p_field = 'applies_to_category_id'
      OR p_entity = 'hr_role_requirement_matrix' AND p_field = 'employee_category_id' THEN 'hr_employee_categories'
    WHEN p_entity = 'hr_readiness_rule_templates' AND p_field = 'applies_to_designation_id'
      OR p_entity = 'hr_role_requirement_matrix' AND p_field = 'designation_id' THEN 'designations'
    WHEN p_entity = 'hr_readiness_rule_templates' AND p_field = 'applies_to_work_site_id'
      OR p_entity = 'hr_site_requirement_matrix' AND p_field = 'work_site_id' THEN 'work_sites'
    WHEN p_entity IN ('hr_role_requirement_matrix', 'hr_site_requirement_matrix') AND p_field = 'readiness_rule_template_id' THEN 'hr_readiness_rule_templates'
    WHEN p_entity = 'hr_approval_workflows' AND p_field IN ('approval_role_id', 'escalation_role_id') THEN 'approval_roles'
  END;
  IF source IS NULL THEN RAISE EXCEPTION 'Invalid HR configuration reference' USING ERRCODE = '22023'; END IF;

  IF p_parent IS NOT NULL THEN
    EXECUTE format('SELECT true, %I FROM public.%I WHERE id = $1 AND deleted_at IS NULL', p_field, p_entity)
    INTO parent_found, selected USING p_parent;
    IF parent_found IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'HR configuration parent unavailable' USING ERRCODE = '42501';
    END IF;
  END IF;
  CASE source
    WHEN 'designations' THEN name_column := 'designation_name_en'; code_column := 'designation_code';
    WHEN 'work_sites' THEN name_column := 'site_name'; code_column := 'site_code'; choice_condition := 'q.status = ''active''';
    WHEN 'hr_readiness_rule_templates' THEN name_column := 'rule_name_en'; code_column := 'rule_code';
    WHEN 'approval_roles' THEN name_column := 'role_name'; code_column := 'role_code';
    ELSE NULL;
  END CASE;
  IF source IN ('designations', 'work_sites', 'approval_roles') THEN
    company_join := 'LEFT JOIN public.owner_companies company ON company.id = q.owner_company_id';
    company_label := $label$
      ' — ' || coalesce(company.legal_name_en,
        CASE WHEN q.owner_company_id IS NULL THEN 'Shared across companies' ELSE 'Company details unavailable' END)
    $label$;
  END IF;

  IF p_search = '' THEN
    EXECUTE format($query$
      WITH available AS NOT MATERIALIZED (SELECT q.* FROM public.%1$I q WHERE q.deleted_at IS NULL AND (%5$s)),
      page AS (
        SELECT q.id, q.%2$I || coalesce(' · ' || nullif(q.%3$I, ''), '') || (%4$s) AS label
        FROM (SELECT * FROM available ORDER BY id LIMIT 25 OFFSET $2) q %6$s
      ),
      retained AS (
        SELECT q.id, q.%2$I || coalesce(' · ' || nullif(q.%3$I, ''), '') || (%4$s) AS label,
          (q.deleted_at IS NULL AND (%5$s)) AS eligible
        FROM public.%1$I q %6$s WHERE q.id = $1
      )
      SELECT jsonb_build_object(
        'data', coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY id) FROM page), '[]'::jsonb),
        'total', (SELECT count(*) FROM available),
        'retained', (SELECT to_jsonb(retained) FROM retained))
    $query$, source, name_column, code_column, company_label, choice_condition, company_join)
    INTO result USING selected, skipped;
    RETURN result;
  END IF;

  EXECUTE format($query$
    WITH source AS MATERIALIZED (
      SELECT q.id, q.%2$I || coalesce(' · ' || nullif(q.%3$I, ''), '') || (%4$s) AS label,
        (q.deleted_at IS NULL AND (%5$s)) AS eligible
      FROM public.%1$I q %6$s
      WHERE (q.deleted_at IS NULL AND (%5$s)) OR q.id = $1
    ),
    matched AS MATERIALIZED (SELECT id, label FROM source WHERE eligible AND strpos(lower(label), lower($2)) > 0),
    page AS (SELECT id, label FROM matched ORDER BY id LIMIT 25 OFFSET $3)
    SELECT jsonb_build_object(
      'data', coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY id) FROM page), '[]'::jsonb),
      'total', (SELECT count(*) FROM matched),
      'retained', (SELECT to_jsonb(source) FROM source WHERE id = $1))
  $query$, source, name_column, code_column, company_label, choice_condition, company_join)
  INTO result USING selected, p_search, skipped;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION erp_private.hr_rule_reference_label(bigint,text,text,text),
  erp_private.hr_rule_text_sort(text), public.hr_rule_settings_page(text,integer,integer,text,jsonb,jsonb),
  public.hr_rule_settings_choices(text,text,bigint,integer,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.hr_rule_reference_label(bigint,text,text,text),
  erp_private.hr_rule_text_sort(text), public.hr_rule_settings_page(text,integer,integer,text,jsonb,jsonb),
  public.hr_rule_settings_choices(text,text,bigint,integer,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
