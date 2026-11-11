BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.departments ADD COLUMN available_to_all_organizations boolean NOT NULL DEFAULT false;
ALTER TABLE public.work_sites ADD COLUMN available_to_all_organizations boolean NOT NULL DEFAULT false;
CREATE INDEX departments_shared_assignment_id ON public.departments (id) WHERE available_to_all_organizations AND deleted_at IS NULL;
CREATE INDEX work_sites_shared_assignment_id ON public.work_sites (id) WHERE available_to_all_organizations AND deleted_at IS NULL;

-- Availability is a separate assignment attribute. Ownership and RLS continue
-- to govern the original records, linked documents, downloads and uploads.
CREATE FUNCTION erp_private.guard_shared_assignment_availability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND OLD.available_to_all_organizations THEN
  IF NOT NEW.available_to_all_organizations OR
    ROW(NEW.owner_company_id, NEW.branch_id) IS DISTINCT FROM ROW(OLD.owner_company_id, OLD.branch_id) THEN
   RAISE EXCEPTION 'Shared assignments require retaining availability and original ownership' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.available_to_all_organizations THEN
  IF NOT erp_private.business_principal_is_active() OR NOT public.current_user_has_role('system_admin') THEN
   RAISE EXCEPTION 'Only the System Administrator can share this record' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND
    ROW(NEW.owner_company_id, NEW.branch_id) IS DISTINCT FROM ROW(OLD.owner_company_id, OLD.branch_id) THEN
   RAISE EXCEPTION 'Retain the current organization and branch when sharing a record' USING ERRCODE = '23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.guard_shared_assignment_availability() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_shared_assignment_availability BEFORE INSERT OR UPDATE ON public.departments
 FOR EACH ROW EXECUTE FUNCTION erp_private.guard_shared_assignment_availability();
CREATE TRIGGER guard_shared_assignment_availability BEFORE INSERT OR UPDATE ON public.work_sites
 FOR EACH ROW EXECUTE FUNCTION erp_private.guard_shared_assignment_availability();

-- Preserve Department operation identities, revision checks, locks and replay.
DO $$
DECLARE definition text := pg_get_functiondef('erp_private.save_department_record(uuid,bigint,bigint,jsonb)'::regprocedure);
BEGIN
 IF position('''department_name_ar'',''owner_company_id''' IN definition) = 0
   OR position('''branch_id'',saved->''branch_id''' IN definition) = 0 THEN
  RAISE EXCEPTION 'Unexpected Department save definition';
 END IF;
 EXECUTE replace(
   replace(definition, '''department_name_ar'',''owner_company_id''', '''department_name_ar'',''available_to_all_organizations'',''owner_company_id'''),
   '''branch_id'',saved->''branch_id''', '''branch_id'',saved->''branch_id'',''available_to_all_organizations'',saved->''available_to_all_organizations''');
END $$;

CREATE FUNCTION erp_private.assignment_scope_matches(shared boolean, owner_company bigint, owner_branch bigint, target_company bigint, target_branch bigint)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT target_company IS NOT NULL AND (shared OR (owner_company = target_company AND (owner_branch IS NULL OR owner_branch = target_branch))) IS TRUE;
$$;
REVOKE ALL ON FUNCTION erp_private.assignment_scope_matches(boolean,bigint,bigint,bigint,bigint) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION erp_private.assignment_scope_matches(boolean,bigint,bigint,bigint,bigint) TO authenticated;

-- A narrow catalogue for published labels in a permitted employee scope.
-- Private record details, ownership metadata, and document links stay behind RLS.
CREATE FUNCTION public.shared_employee_assignment_choices(p_kind text, p_company bigint, p_branch bigint, p_selected bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE choices jsonb; today date := (statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('departments', 'sites') OR p_company IS NULL OR p_company <= 0
    OR (p_branch IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id = p_branch AND b.owner_company_id = p_company)) THEN
  RAISE EXCEPTION 'Invalid employee assignment scope' USING ERRCODE = '22023';
 END IF;
 IF NOT erp_private.business_principal_is_active() OR NOT (
    erp_private.permission_in_scope('common_md.view', p_company, p_branch)
    OR erp_private.permission_in_scope(CASE p_kind WHEN 'departments' THEN 'common_md.departments.view' ELSE 'common_md.work_sites.view' END, p_company, p_branch)
 ) OR NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['hr.employees.create','hr.employees.update','hr.employees.view','hr.employee_profile.manage','hr.admin']) AS code
    WHERE erp_private.permission_in_scope(code, p_company, p_branch)
 ) THEN
  RETURN '[]'::jsonb;
 END IF;
 IF p_kind = 'departments' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.label,x.id), '[]') INTO choices
  FROM (SELECT d.id, d.department_name_en AS label, d.department_code AS code,
   d.is_active AND (d.effective_from IS NULL OR d.effective_from <= today)
    AND (d.effective_to IS NULL OR d.effective_to >= today) AS active
   FROM public.departments d WHERE d.available_to_all_organizations AND d.deleted_at IS NULL
    AND (d.id = p_selected OR (d.is_active AND (d.effective_from IS NULL OR d.effective_from <= today) AND (d.effective_to IS NULL OR d.effective_to >= today)))
   ORDER BY d.department_name_en,d.id LIMIT 5001) x;
 ELSE
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.label,x.id), '[]') INTO choices
  FROM (SELECT s.id, s.site_name AS label, s.site_code AS code, s.status = 'active' AS active
   FROM public.work_sites s WHERE s.available_to_all_organizations AND s.deleted_at IS NULL
    AND (s.id = p_selected OR s.status = 'active')
   ORDER BY s.site_name,s.id LIMIT 5001) x;
 END IF;
 RETURN choices;
END $$;
REVOKE ALL ON FUNCTION public.shared_employee_assignment_choices(text,bigint,bigint,bigint) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.shared_employee_assignment_choices(text,bigint,bigint,bigint) TO authenticated;

-- Only attendance authority in the selected company can expose a shared
-- site's label. Branch-only authority must satisfy both grants in one branch.
CREATE FUNCTION erp_private.timesheet_shared_site_choice_allowed(company bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT (erp_private.permission_in_scope('hr.attendance.view',company,NULL)
     AND erp_private.permission_in_scope('hr.attendance.manage',company,NULL))
 OR EXISTS (
  SELECT 1 FROM public.branches b WHERE b.owner_company_id=company AND b.status='active'
   AND erp_private.permission_in_scope('hr.attendance.view',company,b.id)
   AND erp_private.permission_in_scope('hr.attendance.manage',company,b.id)
 );
$$;
REVOKE ALL ON FUNCTION erp_private.timesheet_shared_site_choice_allowed(bigint) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.timesheet_site_choices(p_company bigint,p_date date,p_search text DEFAULT '',p_after bigint DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 WITH scope AS MATERIALIZED (
  SELECT erp_private.timesheet_shared_site_choice_allowed(p_company) AS can_use_shared
 )
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM (
  SELECT s.id,concat_ws(' — ',s.site_code,s.site_name,CASE WHEN local.allowed THEN nullif(s.address_line_1,'') END) AS label
  FROM public.work_sites s CROSS JOIN scope
  CROSS JOIN LATERAL (SELECT s.owner_company_id=p_company
   AND erp_private.permission_in_scope('hr.attendance.view',s.owner_company_id,s.branch_id)
   AND erp_private.permission_in_scope('hr.attendance.manage',s.owner_company_id,s.branch_id) AS allowed) local
  WHERE erp_private.business_principal_is_active() AND p_company > 0 AND s.deleted_at IS NULL AND s.status='active'
   AND (local.allowed OR (s.available_to_all_organizations AND scope.can_use_shared))
   AND (s.opening_date IS NULL OR s.opening_date<=p_date) AND (s.closing_date IS NULL OR s.closing_date>=p_date)
   AND length(p_search)<=100 AND p_after>=0 AND s.id>p_after
   AND position(lower(p_search) IN lower(concat_ws(' ',s.site_code,s.site_name,CASE WHEN local.allowed THEN s.address_line_1 END)))>0
  ORDER BY s.id LIMIT 26
 ) x;
$$;
REVOKE ALL ON FUNCTION public.timesheet_site_choices(bigint,date,text,bigint) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.timesheet_site_choices(bigint,date,text,bigint) TO authenticated;

-- Keep a shared primary site available in the attendance roster filter.
-- The label is derived only for an employee the caller can record time for.
CREATE FUNCTION erp_private.shared_attendance_primary_site(employee bigint)
RETURNS TABLE(id bigint, label text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT s.id,s.site_name
 FROM public.employees e JOIN public.work_sites s ON s.id=e.primary_work_site_id
 WHERE e.id=employee AND e.deleted_at IS NULL AND s.deleted_at IS NULL
  AND s.available_to_all_organizations AND erp_private.f11_child_authorized('attendance-summary',e.id);
$$;
REVOKE ALL ON FUNCTION erp_private.shared_attendance_primary_site(bigint) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION erp_private.shared_attendance_primary_site(bigint) TO authenticated;

-- Only these readiness facts cross the site ownership boundary. Employee
-- evidence is still read through its original employee authorization and RLS.
CREATE FUNCTION erp_private.hr_readiness_site_facts(employee bigint, site bigint)
RETURNS TABLE(id bigint, owner_company_id bigint, branch_id bigint, updated_at timestamptz, opening_date date, closing_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT s.id,s.owner_company_id,s.branch_id,s.updated_at,s.opening_date,s.closing_date
 FROM public.employees e JOIN public.work_sites s ON s.id=site
 WHERE e.id=employee AND e.deleted_at IS NULL AND s.deleted_at IS NULL AND s.status='active'
  AND erp_private.f11_child_authorized('site-readiness',employee)
  AND erp_private.assignment_scope_matches(s.available_to_all_organizations,s.owner_company_id,s.branch_id,e.owner_company_id,e.branch_id)
  AND (
   erp_private.administrator_work_site_permission('view',s.owner_company_id,s.branch_id)
   OR (s.available_to_all_organizations AND erp_private.administrator_work_site_permission('view',e.owner_company_id,e.branch_id))
  );
$$;
REVOKE ALL ON FUNCTION erp_private.hr_readiness_site_facts(bigint,bigint) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION erp_private.hr_readiness_site_facts(bigint,bigint) TO authenticated;

CREATE FUNCTION erp_private.hr_assignment_site_choices(employee bigint, search text, after_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM (
  SELECT s.id,s.site_code||' — '||s.site_name AS label
  FROM public.employees e CROSS JOIN public.work_sites s
  WHERE e.id=employee AND e.deleted_at IS NULL AND erp_private.f11_child_authorized('assignment',employee)
   AND length(search)<=100 AND after_id>=0 AND s.id>after_id AND s.deleted_at IS NULL AND s.status='active'
   AND erp_private.assignment_scope_matches(s.available_to_all_organizations,s.owner_company_id,s.branch_id,e.owner_company_id,e.branch_id)
   AND (erp_private.administrator_work_site_permission('view',s.owner_company_id,s.branch_id)
    OR (s.available_to_all_organizations AND erp_private.administrator_work_site_permission('view',e.owner_company_id,e.branch_id)))
   AND position(lower(search) IN lower(s.site_code||' '||s.site_name))>0
  ORDER BY s.id LIMIT 26
 ) x;
$$;
REVOKE ALL ON FUNCTION erp_private.hr_assignment_site_choices(bigint,text,bigint) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION erp_private.hr_assignment_site_choices(bigint,text,bigint) TO authenticated;

-- Update existing guarded consumers in place. A changed predecessor fails
-- migration rather than silently dropping its validation or restrictions.
DO $$
DECLARE patch record; definition text;
BEGIN
 FOR patch IN SELECT * FROM (VALUES
  ('erp_private.validate_master_reference()',
   'and n->>''owner_company_id''<>target->>''owner_company_id'' then',
   'and n->>''owner_company_id''<>target->>''owner_company_id'' and not (parent_table=''departments'' and field=''department_id'' and coalesce((target->>''available_to_all_organizations'')::boolean,false)) then'),
  ('erp_private.f11_employee_relationships()',
   'd.owner_company_id=NEW.owner_company_id AND(d.branch_id IS NULL OR d.branch_id=NEW.branch_id)',
   'erp_private.assignment_scope_matches(d.available_to_all_organizations,d.owner_company_id,d.branch_id,NEW.owner_company_id,NEW.branch_id)'),
  ('erp_private.f11_employee_relationships()',
   's.owner_company_id=NEW.owner_company_id AND(s.branch_id IS NULL OR s.branch_id=NEW.branch_id)',
   'erp_private.assignment_scope_matches(s.available_to_all_organizations,s.owner_company_id,s.branch_id,NEW.owner_company_id,NEW.branch_id)'),
  ('erp_private.f12_apply_recruitment(uuid,jsonb)',
   '(d.owner_company_id IS NULL OR d.owner_company_id=company)AND(d.branch_id IS NULL OR d.branch_id=branch)',
   '(erp_private.assignment_scope_matches(d.available_to_all_organizations,d.owner_company_id,d.branch_id,company,branch))'),
  ('erp_private.f12_readiness_sources_predecessor(bigint,bigint)',
   'FROM public.work_sites WHERE id=p_site AND deleted_at IS NULL AND status=''active''',
   'FROM erp_private.hr_readiness_site_facts(p_employee,p_site)'),
  ('erp_private.f12_readiness_sources_predecessor(bigint,bigint)',
   'IF NOT FOUND OR site.owner_company_id IS DISTINCT FROM subject.owner_company_id OR(site.branch_id IS NOT NULL AND site.branch_id IS DISTINCT FROM subject.branch_id)THEN',
   'IF NOT FOUND THEN'),
  ('erp_private.f11_readiness_sources(bigint,bigint)',
   'FROM public.work_sites w WHERE w.id=p_site AND w.deleted_at IS NULL AND w.status=''active''',
   'FROM erp_private.hr_readiness_site_facts(p_employee,p_site) w WHERE true'),
  ('erp_private.f12_deployment_safety()',
   '(w.owner_company_id IS NULL OR w.owner_company_id=e.owner_company_id)AND(w.branch_id IS NULL OR w.branch_id=e.branch_id)',
   '(erp_private.assignment_scope_matches(w.available_to_all_organizations,w.owner_company_id,w.branch_id,e.owner_company_id,e.branch_id))'),
  ('erp_private.f12_deployment_safety()',
   'OR public.current_user_has_role(''system_admin''))OR NOT EXISTS(SELECT 1 FROM public.work_sites',
   'OR public.current_user_has_role(''system_admin'') OR EXISTS(SELECT 1 FROM public.work_sites s JOIN public.employees e ON e.id=NEW.employee_id WHERE s.id=NEW.work_site_id AND s.available_to_all_organizations AND erp_private.administrator_work_site_permission(''view'',e.owner_company_id,e.branch_id)))OR NOT EXISTS(SELECT 1 FROM public.work_sites'),
  ('public.f12_editor_choices(bigint,text,text,bigint,text,text,bigint)',
   'SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY id),''[]'')INTO result FROM(SELECT w.id,w.site_code||'' — ''||w.site_name label FROM public.work_sites w JOIN public.employees e ON e.id=p_employee WHERE w.id>p_after AND w.deleted_at IS NULL AND w.status=''active''AND(w.owner_company_id IS NULL OR w.owner_company_id=e.owner_company_id)AND(w.branch_id IS NULL OR w.branch_id=e.branch_id)AND position(lower(p_search)IN lower(w.site_code||'' ''||w.site_name))>0 ORDER BY w.id LIMIT 26)x;RETURN result;',
   'RETURN erp_private.hr_assignment_site_choices(p_employee,p_search,p_after);'),
  ('public.f12_attendance_choices(text,bigint,date,bigint,text,bigint)',
   'AND EXISTS(SELECT 1 FROM permitted e WHERE e.primary_work_site_id=s.id)',
   'AND EXISTS(SELECT 1 FROM permitted e WHERE e.primary_work_site_id=s.id)
  UNION SELECT s.id,s.label FROM permitted e CROSS JOIN LATERAL erp_private.shared_attendance_primary_site(e.id) s WHERE p_kind=''site'''),
  ('erp_private.timesheet_validate_site(bigint,date,jsonb,text)',
   'OR s.owner_company_id IS DISTINCT FROM e.owner_company_id
  OR s.opening_date>day OR s.closing_date<day OR NOT erp_private.permission_in_scope(''hr.attendance.manage'',s.owner_company_id,s.branch_id)',
   'OR s.opening_date>day OR s.closing_date<day OR NOT (
   (s.owner_company_id=e.owner_company_id AND erp_private.permission_in_scope(''hr.attendance.manage'',s.owner_company_id,s.branch_id))
   OR (s.available_to_all_organizations AND erp_private.permission_in_scope(''hr.attendance.manage'',e.owner_company_id,e.branch_id))
  )'),
  ('erp_private.f12_attendance_context(bigint,date)',
   'concat_ws('' — '',ws.site_code,ws.site_name,nullif(ws.address_line_1,''''))',
   'concat_ws('' — '',ws.site_code,ws.site_name,CASE WHEN erp_private.permission_in_scope(''hr.attendance.manage'',ws.owner_company_id,ws.branch_id) THEN nullif(ws.address_line_1,'''') END)'),
  ('erp_private.f12_attendance_context(bigint,date)',
   'AND erp_private.permission_in_scope(''hr.attendance.manage'',ws.owner_company_id,ws.branch_id))',
   'AND (erp_private.permission_in_scope(''hr.attendance.manage'',ws.owner_company_id,ws.branch_id) OR (ws.available_to_all_organizations AND erp_private.permission_in_scope(''hr.attendance.manage'',e.owner_company_id,e.branch_id))))')
 ) AS p(signature, before_text, after_text)
 LOOP
  definition := pg_get_functiondef(patch.signature::regprocedure);
  IF position(replace(patch.before_text,chr(13),'') IN replace(definition,chr(13),'')) = 0 THEN
   RAISE EXCEPTION 'Unexpected assignment validation in % (%).', patch.signature, left(patch.before_text,60);
  END IF;
  EXECUTE replace(replace(definition,chr(13),''), replace(patch.before_text,chr(13),''), patch.after_text);
 END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
