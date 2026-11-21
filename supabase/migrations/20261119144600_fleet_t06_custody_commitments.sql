BEGIN;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('fleet.custody.manage','Record Fleet handover and return','fleet','custody','held'),
 ('fleet.custody.approve','Approve overnight Fleet loans','fleet','loan_approval','held'),
 ('fleet.availability.plan','Manage Fleet reservations and dispatch checks','fleet','plan','held'),
 ('fleet.availability.policy','Review Fleet readiness policies','fleet','policy','held'),
 ('fleet.holds.workshop','Manage independent Workshop holds','fleet','workshop_hold','held'),
 ('fleet.holds.hse','Manage independent HSE holds','fleet','hse_hold','held');

CREATE TABLE erp_private.fleet_availability_policies (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 category text NOT NULL CHECK (category IN ('truck','trailer','equipment','light_vehicle')),
 valid_during daterange NOT NULL CHECK (NOT isempty(valid_during) AND NOT lower_inf(valid_during) AND NOT upper_inf(valid_during)),
 routine_minutes integer NOT NULL CHECK (routine_minutes BETWEEN 15 AND 1440),
 signed_handover boolean NOT NULL,
 registration_required boolean NOT NULL,
 insurance_required boolean NOT NULL,
 licence_type_id bigint REFERENCES public.hr_identity_document_types(id),
 access_type_id bigint REFERENCES public.hr_access_card_types(id),
 employee_category_id bigint REFERENCES public.hr_employee_categories(id),
 prepared_by bigint NOT NULL REFERENCES public.user_profiles(id),
 approved_by bigint REFERENCES public.user_profiles(id),
 prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 approved_at timestamptz,
 reason text NOT NULL,
 approval_reason text,
 CHECK (approved_by IS NULL OR (approved_by<>prepared_by AND approved_at IS NOT NULL)),
 EXCLUDE USING gist (company_id WITH =, category WITH =, valid_during WITH &&) WHERE (approved_at IS NOT NULL)
);

CREATE TABLE erp_private.fleet_commitments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 asset_id bigint NOT NULL REFERENCES erp_private.fleet_assets(id),
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 employment_period_id bigint NOT NULL REFERENCES erp_private.t03_employment_periods(id),
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint NOT NULL REFERENCES public.branches(id),
 site_id bigint NOT NULL REFERENCES public.work_sites(id),
 kind text NOT NULL CHECK (kind IN ('reservation','custody','dispatch')),
 status text NOT NULL CHECK (status IN ('tentative','confirmed','active','closed','cancelled')),
 committed_during tstzrange NOT NULL CHECK (NOT isempty(committed_during) AND NOT lower_inf(committed_during)
   AND lower_inc(committed_during) AND NOT upper_inc(committed_during) AND isfinite(lower(committed_during))),
 planned_return timestamptz NOT NULL CHECK (isfinite(planned_return)),
 verified_driver_id bigint REFERENCES public.employees(id),
 policy_id bigint NOT NULL REFERENCES erp_private.fleet_availability_policies(id),
 predecessor_id bigint REFERENCES erp_private.fleet_commitments(id),
 revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
 created_by bigint NOT NULL REFERENCES public.user_profiles(id),
 CHECK (
   (kind='reservation' AND status IN ('tentative','confirmed','cancelled') AND NOT upper_inf(committed_during) AND verified_driver_id IS NULL)
   OR (kind IN ('custody','dispatch') AND status IN ('active','closed') AND (upper_inf(committed_during)=(status='active'))
     AND ((kind='dispatch' AND verified_driver_id IS NOT DISTINCT FROM employee_id) OR (kind='custody' AND verified_driver_id IS NULL)))
 ),
 EXCLUDE USING gist (asset_id WITH =, committed_during WITH &&) WHERE (status IN ('confirmed','active','closed')),
 EXCLUDE USING gist (employee_id WITH =, committed_during WITH &&) WHERE (status IN ('confirmed','active','closed'))
);
CREATE INDEX fleet_commitments_asset_history ON erp_private.fleet_commitments(asset_id,id DESC);
CREATE INDEX fleet_commitments_branch ON erp_private.fleet_commitments(company_id,branch_id,asset_id);

CREATE TABLE erp_private.fleet_loan_approvals (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 asset_id bigint NOT NULL REFERENCES erp_private.fleet_assets(id),
 source_commitment_id bigint REFERENCES erp_private.fleet_commitments(id),
 source_revision integer,
 source_company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 source_branch_id bigint NOT NULL REFERENCES public.branches(id),
 destination_company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 destination_branch_id bigint NOT NULL REFERENCES public.branches(id),
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 site_id bigint NOT NULL REFERENCES public.work_sites(id),
 planned_start timestamptz NOT NULL CHECK(isfinite(planned_start)),
 planned_return timestamptz NOT NULL CHECK(isfinite(planned_return) AND planned_return>planned_start),
 reason text NOT NULL,
 requested_by bigint NOT NULL REFERENCES public.user_profiles(id),
 approved_by bigint REFERENCES public.user_profiles(id),
 approved_at timestamptz,
 approval_reason text,
 used_by_commitment bigint UNIQUE REFERENCES erp_private.fleet_commitments(id),
 CHECK(source_commitment_id IS NULL OR source_revision IS NOT NULL),
 CHECK(approved_by IS NULL OR (approved_at IS NOT NULL AND (source_company_id=destination_company_id OR approved_by<>requested_by))),
 CHECK(used_by_commitment IS NULL OR approved_at IS NOT NULL)
);
CREATE INDEX fleet_loan_approval_asset ON erp_private.fleet_loan_approvals(asset_id,id DESC);

CREATE TABLE erp_private.fleet_asset_holds (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 asset_id bigint NOT NULL REFERENCES erp_private.fleet_assets(id),
 kind text NOT NULL CHECK (kind IN ('workshop','hse')),
 placed_at timestamptz NOT NULL,
 placed_by bigint NOT NULL REFERENCES public.user_profiles(id),
 reason text NOT NULL,
 source_commitment_id bigint REFERENCES erp_private.fleet_commitments(id),
 released_at timestamptz,
 released_by bigint REFERENCES public.user_profiles(id),
 release_reason text,
 CHECK ((released_at IS NULL)=(released_by IS NULL)),
 CHECK (released_at IS NULL OR released_at>=placed_at)
);
CREATE INDEX fleet_active_holds ON erp_private.fleet_asset_holds(asset_id,kind) WHERE released_at IS NULL;

CREATE TABLE erp_private.fleet_custody_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 commitment_id bigint NOT NULL REFERENCES erp_private.fleet_commitments(id),
 kind text NOT NULL CHECK (kind IN ('tentative','reserve','confirm','cancel','checkout','dispatch','return','transfer-out','transfer-in')),
 occurred_at timestamptz NOT NULL,
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 reason text NOT NULL,
 meter numeric(14,3) CHECK(meter>=0),
 meter_unit text CHECK(meter_unit IN ('km','hours')),
 condition text CHECK(condition IN ('good','fair','damaged','unknown')),
 discrepancy boolean NOT NULL DEFAULT false,
 evidence_document_id bigint REFERENCES public.dms_documents(id),
 evidence_version_id bigint REFERENCES public.dms_document_versions(id),
 evidence_file_id bigint REFERENCES public.dms_document_files(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(commitment_id,kind),
 CHECK ((meter IS NULL)=(meter_unit IS NULL)),
 CHECK ((evidence_document_id IS NULL)=(evidence_version_id IS NULL) AND (evidence_document_id IS NULL)=(evidence_file_id IS NULL))
);
CREATE INDEX fleet_custody_events_proof ON erp_private.fleet_custody_events(evidence_document_id) WHERE evidence_document_id IS NOT NULL;

ALTER TABLE erp_private.fleet_availability_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.fleet_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.fleet_loan_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.fleet_asset_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.fleet_custody_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.fleet_availability_policies,erp_private.fleet_commitments,erp_private.fleet_loan_approvals,
 erp_private.fleet_asset_holds,erp_private.fleet_custody_events FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.t06_operation_scope(p_asset bigint)
RETURNS TABLE(company_id bigint,branch_id bigint) LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT c.company_id,c.branch_id FROM erp_private.fleet_commitments c
 WHERE c.asset_id=p_asset AND c.status='active'
 UNION ALL
 SELECT coalesce(h.company_id,a.owner_company_id),coalesce(h.branch_id,a.home_branch_id)
 FROM erp_private.fleet_assets a
 LEFT JOIN LATERAL(SELECT e.company_id,e.branch_id FROM erp_private.fleet_asset_history e
   WHERE e.asset_id=a.id AND e.kind='operation' ORDER BY e.effective_on DESC,e.id DESC LIMIT 1) h ON true
 WHERE a.id=p_asset AND NOT EXISTS(SELECT 1 FROM erp_private.fleet_commitments c WHERE c.asset_id=a.id AND c.status='active');
$$;

CREATE FUNCTION erp_private.t06_custody_visible(p_asset bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_private.t05_asset_readable(p_asset) OR EXISTS (
   SELECT 1 FROM erp_private.fleet_commitments c WHERE c.asset_id=p_asset
     AND erp_private.t05_scope('fleet.assets.view',c.company_id,c.branch_id)
     AND erp_private.t05_scope('fleet.custody.manage',c.company_id,c.branch_id)
 );
$$;

CREATE FUNCTION erp_private.t06_work_period(p_employee bigint,p_start timestamptz,p_end timestamptz)
RETURNS erp_private.t03_employment_periods LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p.* FROM erp_private.t03_employment_periods p JOIN public.employees e ON e.id=p.employee_id
 WHERE p.employee_id=p_employee AND e.deleted_at IS NULL AND e.employee_status IN ('active','probation')
   AND p.work_period @> (p_start AT TIME ZONE 'Asia/Dubai')::date
   AND p.work_period @> ((p_end-interval '1 microsecond') AT TIME ZONE 'Asia/Dubai')::date;
$$;

CREATE FUNCTION erp_private.t06_site_allowed(p_site bigint,p_company bigint,p_branch bigint,p_from date,p_until date)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS (SELECT 1 FROM public.work_sites s WHERE s.id=p_site AND s.deleted_at IS NULL AND s.status='active'
   AND erp_private.assignment_scope_matches(s.available_to_all_organizations,s.owner_company_id,s.branch_id,p_company,p_branch)
   AND (s.opening_date IS NULL OR s.opening_date<=p_from) AND (s.closing_date IS NULL OR s.closing_date>=p_until));
$$;

CREATE FUNCTION erp_private.t06_credential_current(p_kind text,p_employee bigint,p_type bigint,p_site bigint,p_from date,p_until date)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 WITH credential AS (
  SELECT s.id,to_jsonb(s) AS facts,s.dms_document_id,s.issue_date,s.expiry_date,s.status
  FROM public.employee_identity_documents s JOIN public.hr_identity_document_types typ ON typ.id=s.document_type_id
  WHERE p_kind='identity-document' AND s.employee_id=p_employee AND typ.is_active AND typ.deleted_at IS NULL
    AND s.document_type_id=p_type AND s.deleted_at IS NULL AND s.verification_status='verified'
  UNION ALL
  SELECT s.id,to_jsonb(s),s.dms_document_id,s.issue_date,s.expiry_date,s.status
  FROM public.employee_access_cards s JOIN public.hr_access_card_types card ON card.id=s.access_type_id
  WHERE p_kind='access-card' AND s.employee_id=p_employee
    AND s.access_type_id=p_type AND s.deleted_at IS NULL
    AND card.is_active AND card.deleted_at IS NULL
    AND (s.work_site_id=p_site OR (s.work_site_id IS NULL AND NOT card.requires_work_site AND card.scope_type='global'))
 )
 SELECT EXISTS (
  SELECT 1 FROM credential k
  JOIN public.employees e ON e.id=p_employee
  JOIN public.dms_documents d ON d.id=k.dms_document_id AND d.deleted_at IS NULL AND NOT d.is_archived AND d.status='active'
  JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
  JOIN LATERAL (SELECT review.* FROM erp_private.f12_evidence_verifications review
    WHERE review.employee_id=e.id AND review.source_kind=p_kind AND review.source_id=k.id ORDER BY review.id DESC LIMIT 1) ev
    ON ev.document_id=d.id AND ev.version_id=v.id
  CROSS JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('id',f.id,'version_id',f.version_id,'bytes',f.file_size_bytes,
      'hash',f.sha256_hash,'integrity',f.integrity_status) ORDER BY f.id) AS originals,
      bool_or(f.integrity_status='verified' AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$') AS verified
    FROM public.dms_document_files f WHERE f.document_id=d.id AND f.version_id=v.id AND f.deleted_at IS NULL AND f.file_role='original'
  ) files
  WHERE k.status='active' AND k.issue_date<=p_from AND k.expiry_date>=p_until AND files.verified
    AND d.owning_company_id=e.owner_company_id AND (d.owning_branch_id IS NULL OR d.owning_branch_id=e.branch_id)
    AND EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.entity_type='employee'
       AND l.entity_id=e.id AND l.deleted_at IS NULL)
    AND ev.source_hash=erp_private.t02_digest(jsonb_build_object(
      'employee_id',e.id,'source_kind',p_kind,'source_id',k.id,'revision',k.facts->>'workspace_revision',
      'document_id',d.id,'version_id',v.id,'rule',NULL,'source',k.facts,'configuration',NULL,
      'employee_revision',e.workspace_revision,'joining_date',e.joining_date,'document_updated',d.updated_at,
      'document_expiry',d.expiry_date,'document_issue',d.issue_date,'evidence_files',files.originals))
 );
$$;

CREATE FUNCTION erp_private.t06_asset_proof_current(p_asset bigint,p_kind text,p_from date,p_until date)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS (
   SELECT 1 FROM erp_private.fleet_asset_evidence e
   JOIN public.dms_documents d ON d.id=e.document_id AND d.current_version_id=e.version_id AND d.status='active'
     AND NOT d.is_archived AND d.deleted_at IS NULL AND d.issue_date=e.effective_on AND d.expiry_date=e.expires_on
   JOIN public.dms_document_versions v ON v.id=e.version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
   JOIN public.dms_document_files f ON f.id=e.file_id AND f.document_id=d.id AND f.version_id=v.id
     AND f.file_role='original' AND f.deleted_at IS NULL AND f.integrity_status='verified'
   JOIN erp_private.fleet_document_parents parent ON parent.document_id=d.id AND parent.asset_id=e.asset_id
   WHERE e.asset_id=p_asset AND e.kind=p_kind AND e.effective_on<=p_from AND e.expires_on>=p_until
     AND NOT EXISTS(SELECT 1 FROM erp_private.fleet_asset_evidence newer WHERE newer.replaces_id=e.id AND newer.effective_on<=p_until)
     AND EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.entity_type='fleet_asset'
       AND l.entity_id=e.asset_id AND l.deleted_at IS NULL)
 );
$$;

-- Project decisions and public-safe categories only. The licence and evidence
-- checks keep employee numbers, file identifiers, medical content and case notes private.
CREATE FUNCTION erp_private.t06_check_availability(
 p_asset bigint,p_employee bigint,p_site bigint,p_from timestamptz,p_to timestamptz,
 p_company bigint,p_branch bigint,p_skip bigint,p_physical boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE a erp_private.fleet_assets; employee erp_private.t03_employment_periods; policy erp_private.fleet_availability_policies;
 day_from date; day_until date; requested_span tstzrange; blockers text[]:='{}';
BEGIN
 IF p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to)
   OR p_from>=p_to OR p_to-p_from>interval '366 days'
 THEN RAISE EXCEPTION 'Enter a valid availability window' USING ERRCODE='22023'; END IF;
 day_from:=(p_from AT TIME ZONE 'Asia/Dubai')::date;
 day_until:=((p_to-interval '1 microsecond') AT TIME ZONE 'Asia/Dubai')::date;
 requested_span:=tstzrange(p_from,CASE WHEN p_physical THEN NULL ELSE p_to END,'[)');
 SELECT * INTO a FROM erp_private.fleet_assets WHERE id=p_asset;
 SELECT * INTO employee FROM erp_private.t06_work_period(p_employee,p_from,p_to);
 SELECT * INTO policy FROM erp_private.fleet_availability_policies cp WHERE cp.company_id=a.owner_company_id AND cp.category=a.category
   AND cp.approved_at IS NOT NULL AND cp.valid_during @> day_from AND cp.valid_during @> day_until;
 IF a.status IS DISTINCT FROM 'active' OR NOT EXISTS(
   SELECT 1 FROM erp_private.fleet_asset_history h WHERE h.asset_id=a.id AND h.kind='lifecycle'
     AND h.facts->>'status'='active' AND h.effective_on<=day_from
 ) THEN blockers:=array_append(blockers,'asset-unverified'); END IF;
 IF policy.id IS NULL THEN blockers:=array_append(blockers,'policy-missing'); END IF;
 IF employee.id IS NULL OR ROW(employee.company_id,employee.branch_id) IS DISTINCT FROM ROW(p_company,p_branch)
 THEN RETURN jsonb_build_object('available',false,'blockers',ARRAY['employee-scope'],'policy_id',policy.id,
   'employment_period_id',NULL,'as_of',statement_timestamp()); END IF;
 IF policy.employee_category_id IS NOT NULL AND policy.employee_category_id IS DISTINCT FROM employee.employee_category_id
 THEN blockers:=array_append(blockers,'worker-compatibility'); END IF;
 IF NOT erp_private.t06_site_allowed(p_site,p_company,p_branch,day_from,day_until)
 THEN blockers:=array_append(blockers,'site-scope'); END IF;
 IF EXISTS(SELECT 1 FROM erp_private.fleet_asset_holds h WHERE h.asset_id=p_asset AND h.kind='workshop' AND h.released_at IS NULL)
 THEN blockers:=array_append(blockers,'workshop-hold'); END IF;
 IF EXISTS(SELECT 1 FROM erp_private.fleet_asset_holds h WHERE h.asset_id=p_asset AND h.kind='hse' AND h.released_at IS NULL)
 THEN blockers:=array_append(blockers,'hse-hold'); END IF;
 IF EXISTS(SELECT 1 FROM public.employee_operational_blocks b WHERE b.employee_id=p_employee AND b.deleted_at IS NULL
   AND b.block_status='active' AND b.effective_from<=day_until AND (b.effective_to IS NULL OR b.effective_to>=day_from))
 THEN blockers:=array_append(blockers,'hr-operational-hold'); END IF;
 IF EXISTS(SELECT 1 FROM erp_private.t04_days d JOIN erp_private.t04_cases r ON r.id=d.case_id
   WHERE d.employee_id=p_employee AND d.day BETWEEN day_from AND day_until AND d.state='posted'
     AND r.status='approved' AND r.employment_id=employee.id)
 THEN blockers:=array_append(blockers,'employee-on-leave'); END IF;
 IF policy.licence_type_id IS NOT NULL AND NOT erp_private.t06_credential_current('identity-document',p_employee,policy.licence_type_id,p_site,day_from,day_until)
 THEN blockers:=array_append(blockers,'licence-required'); END IF;
 IF policy.access_type_id IS NOT NULL AND NOT erp_private.t06_credential_current('access-card',p_employee,policy.access_type_id,p_site,day_from,day_until)
 THEN blockers:=array_append(blockers,'site-credential-required'); END IF;
 IF policy.access_type_id IS NULL AND EXISTS(SELECT 1 FROM public.work_sites s WHERE s.id=p_site
     AND (s.is_restricted_area OR s.cicpa_required OR s.adnoc_required))
 THEN blockers:=array_append(blockers,'site-policy-required'); END IF;
 IF policy.registration_required AND NOT erp_private.t06_asset_proof_current(p_asset,'registration',day_from,day_until)
 THEN blockers:=array_append(blockers,'registration-required'); END IF;
 IF policy.insurance_required AND NOT erp_private.t06_asset_proof_current(p_asset,'insurance',day_from,day_until)
 THEN blockers:=array_append(blockers,'insurance-required'); END IF;
 IF EXISTS(SELECT 1 FROM erp_private.fleet_commitments c WHERE c.asset_id=p_asset AND c.id IS DISTINCT FROM p_skip
    AND c.status IN ('confirmed','active','closed') AND c.committed_during && requested_span)
 THEN blockers:=array_append(blockers,'asset-committed'); END IF;
 IF EXISTS(SELECT 1 FROM erp_private.fleet_commitments c WHERE c.employee_id=p_employee AND c.id IS DISTINCT FROM p_skip
    AND c.status IN ('confirmed','active','closed') AND c.committed_during && requested_span)
 THEN blockers:=array_append(blockers,'employee-committed'); END IF;
 RETURN jsonb_build_object('available',cardinality(blockers)=0,'blockers',blockers,'policy_id',policy.id,
   'employment_period_id',employee.id,'as_of',statement_timestamp());
END;
$$;

CREATE FUNCTION public.t06_fleet_availability(
 p_asset bigint,p_employee bigint,p_site bigint,p_from timestamptz,p_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE scope record; result jsonb;
BEGIN
 SELECT * INTO scope FROM erp_private.t06_operation_scope(p_asset);
 IF scope.company_id IS NULL OR NOT erp_private.t06_custody_visible(p_asset)
   OR NOT (erp_private.t05_scope('fleet.custody.manage',scope.company_id,scope.branch_id)
       OR erp_private.t05_scope('fleet.availability.plan',scope.company_id,scope.branch_id))
 THEN RAISE EXCEPTION 'Fleet availability unavailable' USING ERRCODE='42501'; END IF;
 result:=erp_private.t06_check_availability(p_asset,p_employee,p_site,p_from,p_to,scope.company_id,scope.branch_id,NULL,false);
 RETURN result-'employment_period_id';
END;
$$;

REVOKE ALL ON FUNCTION erp_private.t06_operation_scope(bigint),erp_private.t06_custody_visible(bigint),
 erp_private.t06_work_period(bigint,timestamptz,timestamptz),
 erp_private.t06_site_allowed(bigint,bigint,bigint,date,date),
 erp_private.t06_credential_current(text,bigint,bigint,bigint,date,date),
 erp_private.t06_asset_proof_current(bigint,text,date,date),
 erp_private.t06_check_availability(bigint,bigint,bigint,timestamptz,timestamptz,bigint,bigint,bigint,boolean),
 public.t06_fleet_availability(bigint,bigint,bigint,timestamptz,timestamptz)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t06_fleet_availability(bigint,bigint,bigint,timestamptz,timestamptz) TO authenticated;

COMMIT;
