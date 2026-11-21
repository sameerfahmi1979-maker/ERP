BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- No policy, worker, transport or schedule is enabled on installation.
CREATE TABLE erp_private.t19_expiry_policies (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint REFERENCES public.branches(id),
 domain text NOT NULL CHECK (domain IN ('hr','fleet')),
 active boolean NOT NULL DEFAULT false,
 expiry_day boolean NOT NULL DEFAULT false,
 escalation_days integer CHECK (escalation_days BETWEEN 1 AND 365),
 recipient_ids bigint[] NOT NULL CHECK (cardinality(recipient_ids) BETWEEN 1 AND 50),
 revision bigint NOT NULL DEFAULT 1,
 updated_by bigint NOT NULL REFERENCES public.user_profiles(id),
 updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 UNIQUE NULLS NOT DISTINCT (company_id,branch_id,domain)
);
ALTER TABLE erp_private.t19_expiry_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t19_expiry_policies FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.t19_default_expiry_days()
RETURNS integer[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT ARRAY[90,60,30,15,7,1];
$$;

CREATE FUNCTION erp_private.t19_expiry_scope_current(p_company bigint,p_branch bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.owner_companies c WHERE c.id=p_company AND c.status='active')
   AND (p_branch IS NULL OR EXISTS(SELECT 1 FROM public.branches b
     WHERE b.owner_company_id=p_company AND b.id=p_branch AND b.status='active' AND b.operating_status='active'));
$$;

-- Prospective recipients need a nominated account with current stored grants.
-- Match each domain grant to the actual company and branch under T02 validity.
CREATE FUNCTION erp_private.t19_expiry_profile_scope(p_profile bigint,p_permission text,p_company bigint,p_branch bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.user_roles assignment
   JOIN public.roles role ON role.id=assignment.role_id
   JOIN public.role_permissions grant_row ON grant_row.role_id=role.id
   JOIN public.permissions capability ON capability.id=grant_row.permission_id
   LEFT JOIN erp_private.t02_role_validity validity ON validity.assignment_id=assignment.id
   WHERE assignment.user_profile_id=p_profile AND assignment.is_active AND role.is_active AND capability.is_active
    AND capability.permission_code=p_permission
    AND role.role_code NOT IN ('system_admin','group_admin','company_admin','branch_admin')
    AND (validity.valid_until IS NULL OR validity.valid_until>statement_timestamp())
    AND ((assignment.owner_company_id=p_company AND (assignment.branch_id IS NULL OR assignment.branch_id=p_branch))
      OR (p_permission='notifications.view' AND assignment.owner_company_id IS NULL AND assignment.branch_id IS NULL))
 );
$$;

CREATE FUNCTION erp_private.t19_expiry_recipient_allowed(
 p_profile bigint,p_domain text,p_company bigint,p_branch bigint,p_source text DEFAULT NULL
) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS (SELECT 1 FROM public.user_profiles u JOIN auth.users account ON account.id=u.auth_user_id
    WHERE u.id=p_profile AND u.status='active' AND NOT u.must_change_password AND account.deleted_at IS NULL
     AND (account.banned_until IS NULL OR account.banned_until<=statement_timestamp()))
  AND erp_private.t19_expiry_scope_current(p_company,p_branch)
  AND erp_private.t19_expiry_profile_scope(p_profile,'notifications.view',p_company,p_branch)
  AND CASE p_domain
   WHEN 'fleet' THEN erp_private.t19_expiry_profile_scope(p_profile,'fleet.assets.view',p_company,p_branch)
   WHEN 'hr' THEN
     (erp_private.t19_expiry_profile_scope(p_profile,'hr.employees.view',p_company,p_branch)
       OR erp_private.t19_expiry_profile_scope(p_profile,'hr.employee_profile.view',p_company,p_branch))
     AND ((p_source IS DISTINCT FROM 'employee_medical_insurances'
       AND erp_private.t19_expiry_profile_scope(p_profile,'hr.compliance.view',p_company,p_branch))
        OR (p_source IS DISTINCT FROM 'employee_identity_documents'
       AND erp_private.t19_expiry_profile_scope(p_profile,'hr.medical.view',p_company,p_branch)))
   ELSE false
  END;
$$;

CREATE FUNCTION erp_private.t19_expiry_admin_scope(p_company bigint,p_branch bigint,p_domain text)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT public.current_user_has_permission('notifications.admin') THEN
   RAISE EXCEPTION 'Global notification administration required' USING ERRCODE='42501';
 END IF;
 IF p_domain IS NULL OR p_domain NOT IN ('hr','fleet') OR (p_domain='fleet' AND p_branch IS NULL)
    OR NOT erp_private.t19_expiry_scope_current(p_company,p_branch) THEN
   RAISE EXCEPTION 'Choose an active company and valid exact reminder scope' USING ERRCODE='22023';
 END IF;
END;
$$;

CREATE FUNCTION public.t19_read_expiry_policy(p_company bigint,p_branch bigint,p_domain text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE policy erp_private.t19_expiry_policies;
BEGIN
 PERFORM erp_private.t19_expiry_admin_scope(p_company,p_branch,p_domain);
 SELECT * INTO policy FROM erp_private.t19_expiry_policies p
  WHERE p.company_id=p_company AND p.branch_id IS NOT DISTINCT FROM p_branch AND p.domain=p_domain;
 RETURN jsonb_build_object('companyId',p_company,'branchId',p_branch,'domain',p_domain,
  'revision',coalesce(policy.revision,0),'active',coalesce(policy.active,false),
  'preExpiryDays',erp_private.t19_default_expiry_days(),'expiryDay',coalesce(policy.expiry_day,false),
  'escalationDays',policy.escalation_days,'recipientIds',coalesce(policy.recipient_ids,'{}'::bigint[]));
END;
$$;

CREATE FUNCTION public.t19_expiry_policy_catalog(
 p_company bigint DEFAULT NULL,p_branch bigint DEFAULT NULL,p_domain text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE catalog jsonb;
BEGIN
 IF p_company IS NULL AND p_branch IS NULL AND p_domain IS NULL THEN
   IF NOT public.current_user_has_permission('notifications.admin') THEN
     RAISE EXCEPTION 'Global notification administration required' USING ERRCODE='42501';
   END IF;
   SELECT coalesce(jsonb_agg(jsonb_build_object('companyId',c.id,'branchId',b.id,
     'label',c.legal_name_en||' / '||coalesce(b.branch_name_en,'Company records without a branch'))
     ORDER BY c.legal_name_en,b.branch_name_en NULLS FIRST,c.id,b.id),'[]'::jsonb) INTO catalog
   FROM public.owner_companies c
   CROSS JOIN LATERAL (SELECT NULL::bigint id,NULL::text branch_name_en UNION ALL
     SELECT b.id,b.branch_name_en FROM public.branches b
     WHERE b.owner_company_id=c.id AND b.status='active' AND b.operating_status='active') b
   WHERE c.status='active';
   RETURN catalog;
 END IF;
 PERFORM erp_private.t19_expiry_admin_scope(p_company,p_branch,p_domain);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'label',u.label) ORDER BY u.label,u.id),'[]'::jsonb) INTO catalog
 FROM (SELECT u.id,coalesce(nullif(u.display_name,''),nullif(u.full_name,''),'Recipient #'||u.id) label
   FROM public.user_profiles u
   WHERE erp_private.t19_expiry_recipient_allowed(u.id,p_domain,p_company,p_branch)
   ORDER BY label,u.id LIMIT 501) u;
 IF jsonb_array_length(catalog)>500 THEN
   RAISE EXCEPTION 'Recipient catalog exceeds reviewed capacity' USING ERRCODE='54000';
 END IF;
 RETURN jsonb_build_object('policy',public.t19_read_expiry_policy(p_company,p_branch,p_domain),'recipients',catalog);
END;
$$;

CREATE FUNCTION public.t19_save_expiry_policy(
 p_company bigint,p_branch bigint,p_domain text,p_revision bigint,
 p_recipients bigint[],p_expiry_day boolean,p_escalation_days integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE policy_id bigint; profile bigint; actor bigint:=public.current_user_profile_id();
BEGIN
 PERFORM erp_private.t19_expiry_admin_scope(p_company,p_branch,p_domain);
 PERFORM erp_private.ai_mod04_lock_profile_authority(actor);
 PERFORM erp_private.t19_expiry_admin_scope(p_company,p_branch,p_domain);
 IF p_revision IS NULL OR p_revision<0 OR p_recipients IS NULL OR cardinality(p_recipients) NOT BETWEEN 1 AND 50
   OR array_position(p_recipients,NULL) IS NOT NULL OR p_expiry_day IS NULL
   OR (p_escalation_days IS NOT NULL AND p_escalation_days NOT BETWEEN 1 AND 365)
   OR cardinality(p_recipients)<>(SELECT count(DISTINCT id) FROM unnest(p_recipients) id)
 THEN RAISE EXCEPTION 'Invalid renewal policy' USING ERRCODE='22023'; END IF;
 FOR profile IN SELECT id FROM unnest(p_recipients) id ORDER BY id LOOP
   PERFORM erp_private.ai_mod04_lock_profile_authority(profile);
   IF NOT erp_private.t19_expiry_recipient_allowed(profile,p_domain,p_company,p_branch) THEN
     RAISE EXCEPTION 'Choose active authorised recipients in the exact policy scope' USING ERRCODE='42501';
   END IF;
 END LOOP;
 IF p_revision=0 THEN
   INSERT INTO erp_private.t19_expiry_policies(company_id,branch_id,domain,recipient_ids,expiry_day,escalation_days,updated_by)
    VALUES(p_company,p_branch,p_domain,p_recipients,p_expiry_day,p_escalation_days,actor)
    ON CONFLICT(company_id,branch_id,domain) DO NOTHING RETURNING id INTO policy_id;
 ELSE
   UPDATE erp_private.t19_expiry_policies p SET recipient_ids=p_recipients,expiry_day=p_expiry_day,
    escalation_days=p_escalation_days,updated_by=actor,updated_at=statement_timestamp(),revision=revision+1
   WHERE p.company_id=p_company AND p.branch_id IS NOT DISTINCT FROM p_branch AND p.domain=p_domain
     AND p.revision=p_revision RETURNING p.id INTO policy_id;
 END IF;
 IF policy_id IS NULL THEN RAISE EXCEPTION 'Renewal policy changed. Reload the current revision.' USING ERRCODE='PT409'; END IF;
 RETURN public.t19_read_expiry_policy(p_company,p_branch,p_domain);
END;
$$;

CREATE FUNCTION public.t19_set_expiry_policy_active(
 p_company bigint,p_branch bigint,p_domain text,p_revision bigint,p_active boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE policy erp_private.t19_expiry_policies; profile bigint;
BEGIN
 PERFORM erp_private.t19_expiry_admin_scope(p_company,p_branch,p_domain);
 PERFORM erp_private.ai_mod04_lock_profile_authority(public.current_user_profile_id());
 PERFORM erp_private.t19_expiry_admin_scope(p_company,p_branch,p_domain);
 IF p_active IS NULL THEN RAISE EXCEPTION 'Select an explicit activation state' USING ERRCODE='22023'; END IF;
 SELECT * INTO policy FROM erp_private.t19_expiry_policies p WHERE p.company_id=p_company
   AND p.branch_id IS NOT DISTINCT FROM p_branch AND p.domain=p_domain AND p.revision=p_revision FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Renewal policy changed. Reload the current revision.' USING ERRCODE='PT409'; END IF;
 IF p_active THEN
  FOR profile IN SELECT id FROM unnest(policy.recipient_ids) id ORDER BY id LOOP
   PERFORM erp_private.ai_mod04_lock_profile_authority(profile);
   IF NOT erp_private.t19_expiry_recipient_allowed(profile,p_domain,p_company,p_branch) THEN
    RAISE EXCEPTION 'Recipient authority changed before activation' USING ERRCODE='42501';
   END IF;
  END LOOP;
 END IF;
 IF policy.active IS DISTINCT FROM p_active THEN
  UPDATE erp_private.t19_expiry_policies SET active=p_active,revision=revision+1,
    updated_by=public.current_user_profile_id(),updated_at=statement_timestamp() WHERE id=policy.id;
 END IF;
 RETURN public.t19_read_expiry_policy(p_company,p_branch,p_domain);
END;
$$;

-- The sources are owned by HR and Fleet. T19 stores routing facts only.
CREATE FUNCTION erp_private.t19_expiry_sources(
 p_day date,p_source text DEFAULT NULL,p_source_id bigint DEFAULT NULL
) RETURNS TABLE (source_table text,source_id bigint,subject_id bigint,domain text,
  company_id bigint,branch_id bigint,expiry_date date,evidence_id bigint,evidence_version bigint)
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT 'employee_identity_documents',d.id,e.id,'hr',e.owner_company_id,e.branch_id,d.expiry_date,d.dms_document_id,NULL::bigint
 FROM public.employee_identity_documents d
 JOIN public.employees e ON e.id=d.employee_id AND e.deleted_at IS NULL AND e.employee_status='active'
 JOIN public.hr_identity_document_types typ ON typ.id=d.document_type_id AND typ.is_active AND typ.deleted_at IS NULL
 WHERE (p_source IS NULL OR p_source='employee_identity_documents') AND (p_source_id IS NULL OR p_source_id=d.id)
   AND d.deleted_at IS NULL AND d.status IN ('active','expired') AND d.expiry_date IS NOT NULL
   AND (d.issue_date IS NULL OR d.issue_date<=p_day)
 UNION ALL
 SELECT 'employee_medical_insurances',d.id,e.id,'hr',e.owner_company_id,e.branch_id,d.expiry_date,d.dms_document_id,NULL::bigint
 FROM public.employee_medical_insurances d
 JOIN public.employees e ON e.id=d.employee_id AND e.deleted_at IS NULL AND e.employee_status='active'
 WHERE (p_source IS NULL OR p_source='employee_medical_insurances') AND (p_source_id IS NULL OR p_source_id=d.id)
   AND d.deleted_at IS NULL AND d.status IN ('active','expired') AND d.expiry_date IS NOT NULL
   AND (d.issue_date IS NULL OR d.issue_date<=p_day)
 UNION ALL
 SELECT 'fleet_asset_evidence',proof.id,a.id,'fleet',a.owner_company_id,a.home_branch_id,proof.expires_on,proof.document_id,proof.version_id
 FROM erp_private.fleet_asset_evidence proof
 JOIN erp_private.fleet_assets a ON a.id=proof.asset_id AND a.status='active'
 JOIN public.dms_documents d ON d.id=proof.document_id AND d.current_version_id=proof.version_id
   AND d.owning_company_id=a.owner_company_id AND d.owning_branch_id=a.home_branch_id
   AND d.deleted_at IS NULL AND NOT d.is_archived AND d.status IN ('active','expired')
   AND d.expiry_tracking_override IS DISTINCT FROM 'ignored'
   AND d.issue_date=proof.effective_on AND d.expiry_date=proof.expires_on
 JOIN erp_private.fleet_document_parents parent ON parent.document_id=d.id AND parent.asset_id=a.id
 JOIN public.dms_document_versions v ON v.id=proof.version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
 JOIN public.dms_document_files file ON file.id=proof.file_id AND file.document_id=d.id AND file.version_id=v.id
   AND file.file_role='original' AND file.deleted_at IS NULL AND file.integrity_status='verified'
 WHERE (p_source IS NULL OR p_source='fleet_asset_evidence') AND (p_source_id IS NULL OR p_source_id=proof.id)
   AND proof.effective_on<=p_day
   AND NOT EXISTS(SELECT 1 FROM erp_private.fleet_asset_evidence newer WHERE newer.replaces_id=proof.id AND newer.effective_on<=p_day)
   AND EXISTS(SELECT 1 FROM public.dms_document_links link
     WHERE link.document_id=d.id AND link.entity_type='fleet_asset' AND link.entity_id=a.id AND link.deleted_at IS NULL);
$$;

CREATE FUNCTION erp_private.t19_expiry_offset_allowed(p_remaining integer,p_expiry_day boolean,p_escalation_days integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT p_remaining=ANY(erp_private.t19_default_expiry_days()) OR (p_remaining=0 AND p_expiry_day)
   OR coalesce(p_remaining=-p_escalation_days,false);
$$;

-- The existing worker invokes the real Dubai date. The private date parameter
-- lets native tests exercise every boundary without a server clock override.
CREATE FUNCTION erp_private.t19_collect_expiry_events(p_day date,p_limit integer,p_domain text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE inserted bigint;
BEGIN
 IF p_day IS NULL OR NOT isfinite(p_day) OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500
   OR (p_domain IS NOT NULL AND p_domain NOT IN ('hr','fleet')) THEN
  RAISE EXCEPTION 'Invalid expiry collection date or batch' USING ERRCODE='22023';
 END IF;
 WITH due AS (
  SELECT s.*,p.id policy_id,p.recipient_ids,s.expiry_date-p_day AS remaining,
   s.source_table||':'||s.source_id||':expiry:'||s.expiry_date||':'||
   CASE WHEN s.expiry_date=p_day THEN 'before:0'
     WHEN s.expiry_date<p_day THEN 'escalation:'||(p_day-s.expiry_date)
     ELSE 'before:'||(s.expiry_date-p_day) END AS event_key
  FROM erp_private.t19_expiry_sources(p_day) s
  JOIN erp_private.t19_expiry_policies p ON p.active AND p.domain=s.domain AND p.company_id=s.company_id
    AND p.branch_id IS NOT DISTINCT FROM s.branch_id
  WHERE (p_domain IS NULL OR s.domain=p_domain)
    AND s.expiry_date BETWEEN p_day-365 AND p_day+90
    AND erp_private.t19_expiry_scope_current(s.company_id,s.branch_id)
    AND erp_private.t19_expiry_offset_allowed(s.expiry_date-p_day,p.expiry_day,p.escalation_days)
 ), pending AS (
  SELECT d.* FROM due d
  WHERE NOT EXISTS(SELECT 1 FROM erp_private.notification_events e WHERE e.event_key=d.event_key)
  ORDER BY d.expiry_date,d.source_table,d.source_id LIMIT p_limit
 ), saved AS (
  INSERT INTO erp_private.notification_events(event_key,source_table,source_id,event_type,source_snapshot)
  SELECT n.event_key,n.source_table,n.source_id,
   CASE WHEN n.remaining<0 THEN 'compliance_expiry_escalation'
     WHEN n.remaining=0 THEN 'compliance_expiry_day' ELSE 'compliance_expiry_reminder' END,
   jsonb_build_object('t19_policy_id',n.policy_id,'recipient_ids',n.recipient_ids,'subject_id',n.subject_id,
      'employee_id',CASE WHEN n.domain='hr' THEN n.subject_id END,
      'expiry_date',n.expiry_date,'days_remaining',n.remaining,'evidence_id',n.evidence_id,'evidence_version',n.evidence_version)
  FROM pending n ON CONFLICT(event_key) DO NOTHING RETURNING id
 ) SELECT count(*) INTO inserted FROM saved;
 RETURN inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.f10_collect_hr_expiry_events(batch_limit integer DEFAULT 200) RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.t19_collect_expiry_events((statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date,batch_limit,'hr');
$$;

CREATE FUNCTION public.t19_collect_fleet_expiry_events(batch_limit integer DEFAULT 200) RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.t19_collect_expiry_events((statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date,batch_limit,'fleet');
$$;
REVOKE ALL ON FUNCTION public.t19_collect_fleet_expiry_events(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t19_collect_fleet_expiry_events(integer) TO service_role;

CREATE FUNCTION erp_private.t19_current_expiry_recipient(p_event erp_private.notification_events,p_profile bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS (
   SELECT 1 FROM erp_private.t19_expiry_policies p
   JOIN erp_private.t19_expiry_sources((statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date,
     p_event.source_table,p_event.source_id) s
     ON s.company_id=p.company_id AND s.branch_id IS NOT DISTINCT FROM p.branch_id AND s.domain=p.domain
   WHERE p.id=(p_event.source_snapshot->>'t19_policy_id')::bigint AND p.active
     AND p_profile=ANY(p.recipient_ids) AND p_event.source_snapshot->'recipient_ids' @> jsonb_build_array(p_profile)
     AND s.subject_id=(p_event.source_snapshot->>'subject_id')::bigint
     AND s.expiry_date=(p_event.source_snapshot->>'expiry_date')::date
     AND s.evidence_id IS NOT DISTINCT FROM (p_event.source_snapshot->>'evidence_id')::bigint
     AND s.evidence_version IS NOT DISTINCT FROM (p_event.source_snapshot->>'evidence_version')::bigint
     AND erp_private.t19_expiry_offset_allowed((p_event.source_snapshot->>'days_remaining')::integer,p.expiry_day,p.escalation_days)
     AND erp_private.t19_expiry_recipient_allowed(p_profile,s.domain,s.company_id,s.branch_id,s.source_table)
 );
$$;

CREATE FUNCTION public.t19_expiry_recipients(p_event bigint,p_lease uuid,p_candidate bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE e erp_private.notification_events;
BEGIN
 SELECT * INTO e FROM erp_private.notification_events WHERE id=p_event AND state='processing' AND lease_token=p_lease
  AND lease_expires_at>statement_timestamp() AND source_snapshot ? 't19_policy_id';
 IF NOT FOUND THEN RAISE EXCEPTION 'Current reminder lease unavailable' USING ERRCODE='PT409'; END IF;
 IF p_candidate IS NULL THEN RETURN e.source_snapshot->'recipient_ids'; END IF;
 IF erp_private.t19_current_expiry_recipient(e,p_candidate) THEN RETURN jsonb_build_array(p_candidate); END IF;
 RETURN '[]'::jsonb;
END;
$$;

-- Lock the independently changing source and receiving authority before the
-- existing F10 recorder commits. A conflicting update is retryable.
CREATE FUNCTION erp_private.t19_lock_expiry_recipient(p_event erp_private.notification_events,p_profile bigint)
RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
DECLARE policy erp_private.t19_expiry_policies; subject_id bigint:=(p_event.source_snapshot->>'subject_id')::bigint;
 evidence_id bigint:=(p_event.source_snapshot->>'evidence_id')::bigint;
BEGIN
 SELECT * INTO policy FROM erp_private.t19_expiry_policies WHERE id=(p_event.source_snapshot->>'t19_policy_id')::bigint
  AND active FOR SHARE NOWAIT;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.owner_companies WHERE id=policy.company_id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.branches WHERE id=policy.branch_id FOR SHARE NOWAIT;
 PERFORM erp_private.ai_mod04_lock_profile_authority(p_profile);
 IF p_event.source_table='fleet_asset_evidence' THEN
   PERFORM 1 FROM erp_private.fleet_assets WHERE id=subject_id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.dms_documents WHERE id=evidence_id FOR SHARE NOWAIT;
   PERFORM 1 FROM erp_private.fleet_asset_evidence WHERE id=p_event.source_id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.dms_document_versions WHERE id=(p_event.source_snapshot->>'evidence_version')::bigint FOR SHARE NOWAIT;
   PERFORM f.id FROM public.dms_document_files f JOIN erp_private.fleet_asset_evidence proof ON proof.file_id=f.id
    WHERE proof.id=p_event.source_id FOR SHARE OF f NOWAIT;
 ELSIF p_event.source_table='employee_identity_documents' THEN
   PERFORM 1 FROM public.employees WHERE id=subject_id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.employee_identity_documents WHERE id=p_event.source_id FOR SHARE NOWAIT;
 ELSIF p_event.source_table='employee_medical_insurances' THEN
   PERFORM 1 FROM public.employees WHERE id=subject_id FOR SHARE NOWAIT;
   PERFORM 1 FROM public.employee_medical_insurances WHERE id=p_event.source_id FOR SHARE NOWAIT;
 END IF;
 RETURN erp_private.t19_current_expiry_recipient(p_event,p_profile);
END;
$$;

CREATE FUNCTION erp_private.t19_fleet_notice_target(p_asset bigint)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT '/modules/fleet/'||a.id FROM erp_private.fleet_assets a WHERE a.id=p_asset
  AND erp_private.t05_scope('fleet.assets.view',a.owner_company_id,a.home_branch_id);
$$;

CREATE FUNCTION erp_private.t19_notice_visible(p_event text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM erp_private.notification_events e
  WHERE e.id=CASE WHEN pg_input_is_valid(p_event,'bigint') THEN p_event::bigint END
  AND e.source_snapshot ? 't19_policy_id' AND erp_private.business_principal_is_active()
  AND erp_private.t19_current_expiry_recipient(e,public.current_user_profile_id()));
$$;

-- Integrate through the existing F10 receipt and canonical destination path.
DO $$
DECLARE ddl text; anchor text; target text;
BEGIN
 FOR target,anchor IN SELECT * FROM (VALUES
  ('public.f10_record_notification_recipient(bigint,uuid,bigint,boolean)','IF $4 IS DISTINCT FROM true OR NOT EXISTS'),
  ('public.f10_record_notification_recipient(bigint,uuid,bigint,boolean)','ELSIF e.source_table=''dms_document_events'' THEN'),
  ('public.f10_record_notification_recipient(bigint,uuid,bigint,boolean)',$needle$e.event_type,'info','ERP task updated',
  'A task may need your attention. Open the ERP to review its current state and permitted actions.',$needle$),
  ('public.f10_record_notification_recipient(bigint,uuid,bigint,boolean)',$needle$jsonb_build_object('f10_event_id',e.id),e.actor_id$needle$),
  ('public.f10_prepare_notification_open(bigint)',$needle$IF path IS NULL THEN RAISE EXCEPTION$needle$),
  ('public.f10_complete_notification_open(uuid,text)',$needle$IF path IS NULL OR path IS DISTINCT FROM ticket.target_path THEN RETURN false; END IF;$needle$),
  ('public.f10_notification_target(text,bigint)','IF $1=''dms_documents'' THEN')
 ) AS patches(signature,needle)
 LOOP
  ddl:=pg_get_functiondef(target::regprocedure);
  IF (length(ddl)-length(replace(ddl,anchor,'')))/length(anchor)<>1 THEN
    RAISE EXCEPTION 'Unexpected notification extension point %',target;
  END IF;
  EXECUTE replace(ddl,anchor,CASE anchor
  WHEN 'IF $4 IS DISTINCT FROM true OR NOT EXISTS' THEN $patch$
   IF $4 IS DISTINCT FROM true
    OR (e.source_snapshot ? 't19_policy_id' AND NOT erp_private.t19_lock_expiry_recipient(e,$3))
    -- Keep retained legacy expiry receipts without resuming unfenced notices.
    OR (NOT (e.source_snapshot ? 't19_policy_id')
     AND e.source_table IN ('employee_identity_documents','employee_medical_insurances')
     AND e.event_type IN ('compliance_expiry_reminder','compliance_expired'))
    OR NOT EXISTS$patch$
  WHEN 'ELSIF e.source_table=''dms_document_events'' THEN' THEN $patch$
   ELSIF e.source_table='fleet_asset_evidence' AND e.source_snapshot ? 't19_policy_id' THEN
    source_type:='fleet_assets';source_id:=(e.source_snapshot->>'subject_id')::bigint;
    module:='FLEET';path:='/modules/fleet/'||source_id;
   ELSIF e.source_table='dms_document_events' THEN$patch$
  WHEN $needle$e.event_type,'info','ERP task updated',
  'A task may need your attention. Open the ERP to review its current state and permitted actions.',$needle$ THEN $patch$
   e.event_type,'info',CASE WHEN e.source_snapshot ? 't19_policy_id' THEN
    CASE e.event_type WHEN 'compliance_expiry_day' THEN 'Renewal due date'
      WHEN 'compliance_expiry_escalation' THEN 'Renewal escalation' ELSE 'Renewal reminder' END
    ELSE 'ERP task updated' END,
   CASE WHEN e.source_snapshot ? 't19_policy_id' THEN 'Review the renewal due on '||(e.source_snapshot->>'expiry_date')||'.'
    ELSE 'A task may need your attention. Open the ERP to review its current state and permitted actions.' END,$patch$
  WHEN $needle$jsonb_build_object('f10_event_id',e.id),e.actor_id$needle$ THEN $patch$
   jsonb_build_object('f10_event_id',e.id)||
     CASE WHEN e.source_snapshot ? 't19_policy_id' THEN jsonb_build_object('t19_expiry',true) ELSE '{}'::jsonb END,e.actor_id$patch$
  WHEN $needle$IF path IS NULL THEN RAISE EXCEPTION$needle$ THEN $patch$
   IF path IS NULL OR (n.metadata_json @> '{"t19_expiry":true}' AND NOT erp_private.t19_notice_visible(n.metadata_json->>'f10_event_id')) THEN RAISE EXCEPTION$patch$
  WHEN $needle$IF path IS NULL OR path IS DISTINCT FROM ticket.target_path THEN RETURN false; END IF;$needle$ THEN $patch$
   IF path IS NULL OR path IS DISTINCT FROM ticket.target_path
    OR (n.metadata_json @> '{"t19_expiry":true}' AND NOT erp_private.t19_notice_visible(n.metadata_json->>'f10_event_id'))
   THEN RETURN false; END IF;$patch$
  ELSE $patch$
   IF $1='fleet_assets' THEN RETURN erp_private.t19_fleet_notice_target($2);
   ELSIF $1='dms_documents' THEN$patch$
  END);
 END LOOP;
END;
$$;

CREATE POLICY t19_current_fleet_notice_scope ON public.erp_notifications AS RESTRICTIVE
 FOR SELECT TO authenticated USING (
  source_entity_type IS DISTINCT FROM 'fleet_assets' OR public.f10_notification_target(source_entity_type,source_entity_id) IS NOT NULL
 );
CREATE POLICY t19_current_expiry_notice_recipient ON public.erp_notifications AS RESTRICTIVE
 FOR SELECT TO authenticated USING (
  recipient_user_id IS DISTINCT FROM public.current_user_profile_id()
  OR NOT coalesce(metadata_json @> '{"t19_expiry":true}',false)
  OR erp_private.t19_notice_visible(metadata_json->>'f10_event_id')
 );

REVOKE ALL ON FUNCTION erp_private.t19_default_expiry_days(),erp_private.t19_expiry_scope_current(bigint,bigint),
 erp_private.t19_expiry_profile_scope(bigint,text,bigint,bigint),
 erp_private.t19_expiry_recipient_allowed(bigint,text,bigint,bigint,text),
 erp_private.t19_expiry_admin_scope(bigint,bigint,text),erp_private.t19_expiry_sources(date,text,bigint),
 erp_private.t19_expiry_offset_allowed(integer,boolean,integer),erp_private.t19_collect_expiry_events(date,integer,text),
 erp_private.t19_current_expiry_recipient(erp_private.notification_events,bigint),
 erp_private.t19_lock_expiry_recipient(erp_private.notification_events,bigint),
 erp_private.t19_fleet_notice_target(bigint),erp_private.t19_notice_visible(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.t19_fleet_notice_target(bigint),erp_private.t19_notice_visible(text) TO authenticated;

REVOKE ALL ON FUNCTION public.t19_read_expiry_policy(bigint,bigint,text),
 public.t19_expiry_policy_catalog(bigint,bigint,text),
 public.t19_save_expiry_policy(bigint,bigint,text,bigint,bigint[],boolean,integer),
 public.t19_set_expiry_policy_active(bigint,bigint,text,bigint,boolean),
 public.t19_expiry_recipients(bigint,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t19_read_expiry_policy(bigint,bigint,text),
 public.t19_expiry_policy_catalog(bigint,bigint,text),
 public.t19_save_expiry_policy(bigint,bigint,text,bigint,bigint[],boolean,integer),
 public.t19_set_expiry_policy_active(bigint,bigint,text,bigint,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.t19_expiry_recipients(bigint,uuid,bigint) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
