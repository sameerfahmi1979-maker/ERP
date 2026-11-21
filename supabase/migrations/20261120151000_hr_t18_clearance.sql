
BEGIN;

CREATE TABLE erp_private.t18_clearance_fences (
 employee_id bigint PRIMARY KEY,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0)
);

CREATE TABLE erp_private.t18_clearance_origins (
 eos_id bigint NOT NULL REFERENCES public.employee_eos_cases(id),
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 employment_id bigint NOT NULL REFERENCES erp_private.t03_employment_periods(id),
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint NOT NULL REFERENCES public.branches(id),
 origin text NOT NULL CHECK(origin IN ('fleet','asset','accommodation','access')),
 source_id bigint NOT NULL,
 owner text NOT NULL,
 title text NOT NULL,
 linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 linked_by bigint REFERENCES public.user_profiles(id),
 PRIMARY KEY(eos_id,employment_id,origin,source_id)
);
CREATE INDEX t18_clearance_source ON erp_private.t18_clearance_origins(origin,source_id);
CREATE INDEX t18_clearance_fleet_scope ON erp_private.t18_clearance_origins(company_id,branch_id,eos_id) WHERE origin='fleet';

CREATE TABLE erp_private.t18_clearance_fleet_receipts (
 eos_id bigint NOT NULL REFERENCES public.employee_eos_cases(id),
 employment_id bigint NOT NULL REFERENCES erp_private.t03_employment_periods(id),
 commitment_id bigint NOT NULL REFERENCES erp_private.fleet_commitments(id),
 event_id bigint NOT NULL REFERENCES erp_private.fleet_custody_events(id),
 received_by bigint NOT NULL REFERENCES public.user_profiles(id),
 received_at timestamptz NOT NULL,
 evidence_document_id bigint REFERENCES public.dms_documents(id),
 evidence_version_id bigint REFERENCES public.dms_document_versions(id),
 evidence_file_id bigint REFERENCES public.dms_document_files(id),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(eos_id,employment_id,commitment_id)
);

ALTER TABLE erp_private.t18_clearance_fences ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t18_clearance_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t18_clearance_fleet_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t18_clearance_fences,erp_private.t18_clearance_origins,
 erp_private.t18_clearance_fleet_receipts FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.t18_keep_clearance_history()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 RAISE EXCEPTION 'Exit clearance history is retained.' USING ERRCODE='42501';
END $$;
CREATE TRIGGER t18_keep_origins BEFORE UPDATE OR DELETE ON erp_private.t18_clearance_origins
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_keep_clearance_history();
CREATE TRIGGER t18_keep_return_receipts BEFORE UPDATE OR DELETE ON erp_private.t18_clearance_fleet_receipts
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_keep_clearance_history();

-- A source writer and an exact-version decision share this fence. A conflicting
-- write retries without waiting while it already holds a Fleet or legacy row lock.
CREATE FUNCTION erp_private.t18_lock_clearance(p_employee bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_employee IS NULL THEN RETURN; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('t18-clearance:'||p_employee::text,0)) THEN
  RAISE EXCEPTION 'Exit clearance is changing. Retry the action.' USING ERRCODE='40001';
 END IF;
 INSERT INTO erp_private.t18_clearance_fences(employee_id) VALUES(p_employee)
 ON CONFLICT(employee_id) DO UPDATE SET revision=t18_clearance_fences.revision+1;
END $$;

CREATE FUNCTION erp_private.t18_clearance_candidates(
 p_employee bigint,p_employment bigint,p_company bigint,p_branch bigint
) RETURNS TABLE(origin text,source_id bigint,owner text,title text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH employment AS (
  SELECT p.work_period FROM erp_private.t03_employment_periods p
  WHERE p.id=p_employment AND p.employee_id=p_employee AND p.company_id=p_company
    AND p.branch_id=p_branch
 ), current_scope AS (
  SELECT employment.work_period FROM employment,public.employees e
  WHERE e.id=p_employee AND e.owner_company_id=p_company AND e.branch_id=p_branch
 )
 SELECT 'fleet',c.id,'fleet',btrim(concat(a.asset_no,' ',a.name))
 FROM employment,erp_private.fleet_commitments c JOIN erp_private.fleet_assets a ON a.id=c.asset_id
 WHERE c.employee_id=p_employee AND c.employment_period_id=p_employment
   AND c.company_id=p_company AND c.branch_id=p_branch AND c.status='active'
   AND c.kind IN ('custody','dispatch')
 UNION ALL
 SELECT 'asset',a.id,CASE WHEN a.asset_type IN ('phone','sim','laptop') THEN 'it' ELSE 'operations' END,
   a.asset_description
 FROM current_scope,public.employee_assets a
 WHERE a.employee_id=p_employee AND a.deleted_at IS NULL
   AND current_scope.work_period @> a.issued_date AND a.status IN ('issued','lost','damaged')
   AND NOT (a.asset_type='vehicle' AND EXISTS(
    SELECT 1 FROM erp_private.fleet_commitments c JOIN erp_private.fleet_assets fa ON fa.id=c.asset_id
    WHERE c.employee_id=p_employee AND c.employment_period_id=p_employment
      AND c.company_id=p_company AND c.branch_id=p_branch AND c.kind IN ('custody','dispatch')
      AND upper(btrim(fa.asset_no))=upper(btrim(a.asset_reference))
   ))
 UNION ALL
 SELECT 'accommodation',a.id,'camp','Company accommodation'
 FROM current_scope,public.employee_accommodation_records a
 WHERE a.employee_id=p_employee AND a.deleted_at IS NULL
   AND current_scope.work_period @> a.assigned_from AND a.status='active'
   AND a.accommodation_type IS DISTINCT FROM 'allowance'
 UNION ALL
 SELECT 'access',a.id,'hse','Access card or application'
 FROM current_scope,public.employee_access_cards a
 WHERE a.employee_id=p_employee AND a.deleted_at IS NULL
   AND current_scope.work_period @> coalesce(a.issue_date,(a.created_at AT TIME ZONE 'Asia/Dubai')::date)
   AND a.status IN ('active','suspended','pending','in_application')
$$;

-- Valid Fleet returns arrive through T06. Policy-required signed evidence is
-- retained with the exact document, version, and file on the outgoing event.
CREATE FUNCTION erp_private.t18_fleet_return_receipt(p_commitment bigint)
RETURNS TABLE(event_id bigint,received_by bigint,received_at timestamptz,
 evidence_document_id bigint,evidence_version_id bigint,evidence_file_id bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT e.id,e.actor_id,e.occurred_at,e.evidence_document_id,e.evidence_version_id,e.evidence_file_id
 FROM erp_private.fleet_commitments c
 JOIN erp_private.fleet_availability_policies p ON p.id=c.policy_id
 JOIN erp_private.fleet_custody_events e ON e.commitment_id=c.id AND e.kind IN ('return','transfer-out')
 WHERE c.id=p_commitment AND c.status='closed' AND e.occurred_at=upper(c.committed_during)
   AND (NOT p.signed_handover OR (
     e.evidence_document_id IS NOT NULL AND e.evidence_version_id IS NOT NULL AND e.evidence_file_id IS NOT NULL))
   AND (e.kind='return' OR EXISTS(
    SELECT 1 FROM erp_private.fleet_commitments next
    JOIN erp_private.fleet_availability_policies next_policy ON next_policy.id=next.policy_id
    JOIN erp_private.fleet_custody_events receipt ON receipt.commitment_id=next.id AND receipt.kind='transfer-in'
    WHERE next.predecessor_id=c.id AND next.asset_id=c.asset_id AND next.employee_id<>c.employee_id
      AND next.kind IN ('custody','dispatch') AND next.status IN ('active','closed')
      AND lower(next.committed_during)=e.occurred_at AND receipt.occurred_at=e.occurred_at
      AND (NOT next_policy.signed_handover OR (receipt.evidence_document_id IS NOT NULL
       AND receipt.evidence_version_id IS NOT NULL AND receipt.evidence_file_id IS NOT NULL))
   ))
 ORDER BY e.id
 LIMIT 1
$$;

CREATE FUNCTION erp_private.t18_record_fleet_clearance(p_commitment bigint)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO erp_private.t18_clearance_fleet_receipts(
  eos_id,employment_id,commitment_id,event_id,received_by,received_at,
  evidence_document_id,evidence_version_id,evidence_file_id)
 SELECT o.eos_id,o.employment_id,o.source_id,r.event_id,r.received_by,r.received_at,
  r.evidence_document_id,r.evidence_version_id,r.evidence_file_id
 FROM erp_private.t18_clearance_origins o
 CROSS JOIN erp_private.t18_fleet_return_receipt(p_commitment) r
 WHERE o.origin='fleet' AND o.source_id=p_commitment
 ON CONFLICT(eos_id,employment_id,commitment_id) DO NOTHING
$$;

CREATE FUNCTION erp_private.t18_sync_clearance(
 p_eos bigint,p_employee bigint,p_employment bigint,p_company bigint,p_branch bigint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.employee_eos_cases e
 JOIN erp_private.t03_employment_periods p ON p.employee_id=e.employee_id AND p.work_period @> e.last_working_date
 WHERE e.id=p_eos AND e.employee_id=p_employee AND e.deleted_at IS NULL
   AND e.case_status NOT IN ('closed','cancelled') AND p.id=p_employment
   AND p.company_id=p_company AND p.branch_id=p_branch;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'The exit clearance employment scope changed.' USING ERRCODE='PT409';
 END IF;
 PERFORM erp_private.t18_lock_clearance(p_employee);
 INSERT INTO erp_private.t18_clearance_origins(
  eos_id,employee_id,employment_id,company_id,branch_id,origin,source_id,owner,title,linked_by)
 SELECT p_eos,p_employee,p_employment,p_company,p_branch,f.origin,f.source_id,f.owner,f.title,
  public.current_user_profile_id()
 FROM erp_private.t18_clearance_candidates(p_employee,p_employment,p_company,p_branch) f
 ON CONFLICT(eos_id,employment_id,origin,source_id) DO NOTHING;
END $$;

CREATE FUNCTION erp_private.t18_source_clearance_fence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_employee bigint; new_employee bigint;
BEGIN
 IF TG_OP<>'INSERT' THEN old_employee:=OLD.employee_id; END IF;
 IF TG_OP<>'DELETE' THEN new_employee:=NEW.employee_id; END IF;
 PERFORM erp_private.t18_lock_clearance(least(old_employee,new_employee));
 IF new_employee IS DISTINCT FROM old_employee AND old_employee IS NOT NULL AND new_employee IS NOT NULL THEN
  PERFORM erp_private.t18_lock_clearance(greatest(old_employee,new_employee));
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION erp_private.t18_clearance_source_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE scope record; only_eos bigint;
BEGIN
 IF TG_TABLE_NAME='employee_eos_cases' THEN
  only_eos:=NEW.id;
 END IF;
 FOR scope IN
   SELECT e.id AS eos,p.id AS employment,p.company_id,p.branch_id
   FROM public.employee_eos_cases e
   JOIN erp_private.t03_employment_periods p ON p.employee_id=e.employee_id AND p.work_period @> e.last_working_date
   WHERE e.employee_id=NEW.employee_id AND (only_eos IS NULL OR e.id=only_eos)
    AND e.deleted_at IS NULL AND e.case_status NOT IN ('closed','cancelled') AND p.branch_id IS NOT NULL
   ORDER BY e.id
 LOOP
  PERFORM erp_private.t18_sync_clearance(scope.eos,NEW.employee_id,scope.employment,scope.company_id,scope.branch_id);
 END LOOP;
 IF TG_TABLE_NAME='fleet_commitments' THEN
  IF NEW.status='closed' THEN PERFORM erp_private.t18_record_fleet_clearance(NEW.id); END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION erp_private.t18_clearance_transfer_received()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE predecessor bigint; employee bigint;
BEGIN
 SELECT c.predecessor_id,p.employee_id INTO predecessor,employee
 FROM erp_private.fleet_commitments c
 JOIN erp_private.fleet_commitments p ON p.id=c.predecessor_id
 WHERE c.id=NEW.commitment_id;
 IF predecessor IS NOT NULL THEN
  PERFORM erp_private.t18_lock_clearance(employee);
  PERFORM erp_private.t18_record_fleet_clearance(predecessor);
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION erp_private.t18_retain_open_department_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE removing boolean;
BEGIN
 removing:=TG_OP='DELETE';
 IF TG_OP='UPDATE' THEN removing:=NEW.deleted_at IS NOT NULL; END IF;
 IF removing AND OLD.deleted_at IS NULL AND OLD.clearance_area<>'hr'
   AND (OLD.item_status NOT IN ('cleared','not_applicable') OR OLD.evidence_fingerprint IS NULL
     OR (OLD.item_status='cleared' AND (OLD.cleared_by IS NULL OR OLD.cleared_at IS NULL)))
   AND EXISTS(SELECT 1 FROM erp_private.t18_cases c WHERE c.eos_id=OLD.eos_case_id AND c.employee_id=OLD.employee_id)
 THEN
  RAISE EXCEPTION 'An open department clearance check must retain its owner review.' USING ERRCODE='PT409';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER t18_eos_clearance_fence BEFORE INSERT OR UPDATE OF employee_id,last_working_date,case_status,deleted_at OR DELETE
 ON public.employee_eos_cases FOR EACH ROW EXECUTE FUNCTION erp_private.t18_source_clearance_fence();
CREATE TRIGGER t18_eos_clearance_sources AFTER INSERT OR UPDATE OF employee_id,last_working_date,case_status
 ON public.employee_eos_cases FOR EACH ROW EXECUTE FUNCTION erp_private.t18_clearance_source_changed();
CREATE TRIGGER t18_manual_clearance_fence BEFORE INSERT OR UPDATE OR DELETE ON public.employee_clearance_items
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_source_clearance_fence();
CREATE TRIGGER t18_manual_clearance_retain BEFORE UPDATE OF deleted_at OR DELETE ON public.employee_clearance_items
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_retain_open_department_check();
CREATE TRIGGER t18_employee_asset_clearance_fence BEFORE INSERT OR UPDATE OR DELETE ON public.employee_assets
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_source_clearance_fence();
CREATE TRIGGER t18_employee_asset_clearance_sources AFTER INSERT OR UPDATE OF employee_id,issued_date,status ON public.employee_assets
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_clearance_source_changed();
CREATE TRIGGER t18_accommodation_clearance_fence BEFORE INSERT OR UPDATE OR DELETE ON public.employee_accommodation_records
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_source_clearance_fence();
CREATE TRIGGER t18_accommodation_clearance_sources AFTER INSERT OR UPDATE OF employee_id,assigned_from,accommodation_type,status
 ON public.employee_accommodation_records FOR EACH ROW EXECUTE FUNCTION erp_private.t18_clearance_source_changed();
CREATE TRIGGER t18_access_clearance_fence BEFORE INSERT OR UPDATE OR DELETE ON public.employee_access_cards
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_source_clearance_fence();
CREATE TRIGGER t18_access_clearance_sources AFTER INSERT OR UPDATE OF employee_id,issue_date,status ON public.employee_access_cards
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_clearance_source_changed();
CREATE TRIGGER t18_fleet_clearance_fence BEFORE INSERT OR UPDATE OR DELETE ON erp_private.fleet_commitments
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_source_clearance_fence();
CREATE TRIGGER t18_fleet_clearance_sources AFTER INSERT OR UPDATE OF status ON erp_private.fleet_commitments
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_clearance_source_changed();
CREATE TRIGGER t18_fleet_transfer_receipt AFTER INSERT ON erp_private.fleet_custody_events
 FOR EACH ROW WHEN(NEW.kind='transfer-in') EXECUTE FUNCTION erp_private.t18_clearance_transfer_received();

CREATE FUNCTION erp_private.t18_clearance_facts(
 p_eos bigint,p_employee bigint,p_employment bigint,p_company bigint,p_branch bigint
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH matching_case AS (
  SELECT e.id,e.case_status,e.deleted_at FROM public.employee_eos_cases e
  JOIN erp_private.t03_employment_periods p ON p.employee_id=e.employee_id
  WHERE e.id=p_eos AND e.employee_id=p_employee AND p.id=p_employment AND p.company_id=p_company AND p.branch_id=p_branch
 ), origins AS (
  SELECT o.origin,o.source_id,o.owner,o.title
  FROM matching_case e JOIN erp_private.t18_clearance_origins o ON o.eos_id=e.id
  WHERE o.employee_id=p_employee AND o.employment_id=p_employment AND o.company_id=p_company AND o.branch_id=p_branch
  UNION ALL
  SELECT f.origin,f.source_id,f.owner,f.title
  FROM matching_case e CROSS JOIN erp_private.t18_clearance_candidates(p_employee,p_employment,p_company,p_branch) f
  WHERE e.deleted_at IS NULL AND e.case_status NOT IN ('closed','cancelled') AND NOT EXISTS(
   SELECT 1 FROM erp_private.t18_clearance_origins o
   WHERE o.eos_id=e.id AND o.employment_id=p_employment AND o.origin=f.origin AND o.source_id=f.source_id
  )
 ), rows AS (
  SELECT o.origin,o.source_id,o.owner,o.title,
   CASE WHEN receipt.event_id IS NOT NULL THEN 'cleared' WHEN c.status='active' THEN 'pending' ELSE 'blocked' END AS status,
   coalesce(c.revision,1)::bigint AS revision,c.asset_id,
   receipt.received_at AS cleared_at,(receipt.evidence_document_id IS NOT NULL) AS evidence_attached
  FROM origins o
  LEFT JOIN erp_private.fleet_commitments c ON c.id=o.source_id AND o.origin='fleet'
   AND c.employee_id=p_employee AND c.employment_period_id=p_employment
   AND c.company_id=p_company AND c.branch_id=p_branch
  LEFT JOIN erp_private.t18_clearance_fleet_receipts receipt
   ON receipt.eos_id=p_eos AND receipt.employment_id=p_employment AND receipt.commitment_id=o.source_id
  WHERE o.origin='fleet'
  UNION ALL
  SELECT o.origin,o.source_id,o.owner,o.title,
   CASE WHEN a.status='returned' AND a.returned_date<=(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date AND a.updated_by IS NOT NULL THEN 'cleared'
     WHEN a.deleted_at IS NULL AND a.status='issued' THEN 'pending' ELSE 'blocked' END,
   coalesce(a.workspace_revision,1),NULL,
   CASE WHEN a.status='returned' AND a.returned_date<=(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date AND a.updated_by IS NOT NULL THEN a.updated_at END,
   coalesce(a.dms_document_id IS NOT NULL,false)
  FROM origins o LEFT JOIN public.employee_assets a ON a.id=o.source_id AND a.employee_id=p_employee
  WHERE o.origin='asset'
  UNION ALL
  SELECT o.origin,o.source_id,o.owner,o.title,
   CASE WHEN a.status='ended' AND a.assigned_to<=(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date AND a.updated_by IS NOT NULL THEN 'cleared'
     WHEN a.deleted_at IS NULL AND a.status='active' THEN 'pending' ELSE 'blocked' END,
   coalesce(a.workspace_revision,1),NULL,
   CASE WHEN a.status='ended' AND a.assigned_to<=(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date AND a.updated_by IS NOT NULL THEN a.updated_at END,false
  FROM origins o LEFT JOIN public.employee_accommodation_records a ON a.id=o.source_id AND a.employee_id=p_employee
  WHERE o.origin='accommodation'
  UNION ALL
  SELECT o.origin,o.source_id,o.owner,o.title,
   CASE WHEN (a.status='cancelled' OR (a.status='expired' AND a.expiry_date<(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date)) AND a.updated_by IS NOT NULL THEN 'cleared'
     WHEN a.deleted_at IS NULL AND a.status IN ('active','suspended','pending','in_application') THEN 'pending' ELSE 'blocked' END,
   coalesce(a.workspace_revision,1),NULL,
   CASE WHEN (a.status='cancelled' OR (a.status='expired' AND a.expiry_date<(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date)) AND a.updated_by IS NOT NULL
     THEN a.updated_at END,(a.dms_document_id IS NOT NULL)
  FROM origins o LEFT JOIN public.employee_access_cards a ON a.id=o.source_id AND a.employee_id=p_employee
  WHERE o.origin='access'
  UNION ALL
  SELECT 'manual',m.id,m.clearance_area,m.item_title,
   CASE WHEN m.item_status IN ('cleared','not_applicable') AND m.evidence_fingerprint IS NULL THEN 'blocked'
     WHEN m.item_status='cleared' AND (m.cleared_at IS NULL OR m.cleared_by IS NULL) THEN 'blocked'
     ELSE m.item_status END,
   m.workspace_revision,NULL,m.cleared_at,(m.evidence_fingerprint IS NOT NULL)
  FROM matching_case e JOIN public.employee_clearance_items m ON m.eos_case_id=e.id
  WHERE m.employee_id=p_employee AND m.deleted_at IS NULL
 )
 SELECT jsonb_build_object(
  'blocking_count',CASE WHEN EXISTS(SELECT 1 FROM matching_case) THEN count(*) FILTER(WHERE status IN ('pending','blocked')) ELSE 1 END,
  'items',coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(rows)) ORDER BY origin,source_id),'[]'::jsonb))
 FROM rows
$$;

CREATE FUNCTION public.t18_fleet_exit_tasks(p_company bigint,p_branch bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_branch IS NULL OR NOT erp_private.t02_has_scope('fleet.custody.manage',p_company,p_branch)
   OR NOT erp_private.t02_has_scope('fleet.assets.view',p_company,p_branch) THEN
  RAISE EXCEPTION 'Fleet return checks are unavailable.' USING ERRCODE='42501';
 END IF;
 RETURN coalesce((
  SELECT jsonb_agg(jsonb_build_object('eos_id',o.eos_id,'employee_id',o.employee_id,
    'commitment_id',c.id,'asset_id',c.asset_id,'asset_title',o.title,'status',c.status,
    'revision',c.revision,'planned_return',c.planned_return,
    'managed_by_operation',own.commitment_id IS NOT NULL,
    'owning_operation',CASE WHEN erp_private.t07_ops_readable(op.company_id,op.branch_id) THEN op.id END)
    ORDER BY c.planned_return,o.eos_id,c.id)
  FROM erp_private.t18_clearance_origins o
  JOIN public.employee_eos_cases e ON e.id=o.eos_id AND e.employee_id=o.employee_id
  JOIN erp_private.t03_employment_periods p ON p.id=o.employment_id AND p.work_period @> e.last_working_date
  JOIN erp_private.fleet_commitments c ON c.id=o.source_id AND c.status='active'
  LEFT JOIN erp_private.fleet_ops_owned_commitments own ON own.commitment_id=c.id
  LEFT JOIN erp_private.fleet_operation_orders op ON op.id=own.order_id
  WHERE o.origin='fleet' AND o.company_id=p_company AND o.branch_id=p_branch AND e.deleted_at IS NULL
   AND e.case_status NOT IN ('closed','cancelled') AND erp_private.t06_custody_visible(c.asset_id)
 ),'[]'::jsonb);
END $$;

CREATE FUNCTION public.t18_fleet_exit_scopes()
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('company',c.id,'branch',b.id,
  'label',concat(c.legal_name_en,' / ',b.branch_name_en)) ORDER BY c.legal_name_en,b.branch_name_en,b.id),'[]'::jsonb)
 FROM public.branches b JOIN public.owner_companies c ON c.id=b.owner_company_id
 WHERE EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_profile_id=public.current_user_profile_id()
   AND r.is_active AND r.owner_company_id=c.id AND (r.branch_id IS NULL OR r.branch_id=b.id))
  AND erp_private.t02_has_scope('fleet.custody.manage',c.id,b.id)
  AND erp_private.t02_has_scope('fleet.assets.view',c.id,b.id)
$$;

REVOKE ALL ON FUNCTION erp_private.t18_keep_clearance_history(),erp_private.t18_lock_clearance(bigint),
 erp_private.t18_clearance_candidates(bigint,bigint,bigint,bigint),
 erp_private.t18_fleet_return_receipt(bigint),erp_private.t18_record_fleet_clearance(bigint),
 erp_private.t18_sync_clearance(bigint,bigint,bigint,bigint,bigint),
 erp_private.t18_source_clearance_fence(),erp_private.t18_clearance_source_changed(),
 erp_private.t18_clearance_transfer_received(),erp_private.t18_clearance_facts(bigint,bigint,bigint,bigint,bigint)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.t18_retain_open_department_check() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.t18_fleet_exit_tasks(bigint,bigint),public.t18_fleet_exit_scopes() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.t18_fleet_exit_tasks(bigint,bigint),public.t18_fleet_exit_scopes() TO authenticated;
NOTIFY pgrst,'reload schema';

COMMIT;
