BEGIN;

ALTER TABLE erp_private.fleet_trip_legs ADD COLUMN pickup_contact text, ADD COLUMN pickup_phone text,
 ADD COLUMN delivery_contact text, ADD COLUMN delivery_phone text, ADD COLUMN instructions text;

-- Preserve the existing plan and issue functions. Bind the five paper fields
-- to the same route version and exact issued snapshot.
DO $$
DECLARE ddl text; anchor text; replacement text;
BEGIN
 ddl:=pg_get_functiondef('erp_private.t07_trip_action(uuid,bigint,text,jsonb,text)'::regprocedure);
 FOR anchor,replacement IN SELECT * FROM (VALUES
   ($a$INSERT INTO erp_private.fleet_trip_legs(order_id,sequence,planned_origin,planned_destination,planned_load,planned_cargo)
   VALUES(o.id,seq,origin_id,destination_id,load_code,cargo_name)$a$,
    $b$INSERT INTO erp_private.fleet_trip_legs(order_id,sequence,planned_origin,planned_destination,planned_load,planned_cargo,
     pickup_contact,pickup_phone,delivery_contact,delivery_phone,instructions)
   VALUES(o.id,seq,origin_id,destination_id,load_code,cargo_name,
     coalesce(nullif(left(btrim(p_data->>'pickup_contact'),100),''),(SELECT site_contact_name FROM public.work_sites WHERE id=origin_id)),
     coalesce(nullif(left(btrim(p_data->>'pickup_phone'),40),''),(SELECT site_contact_phone FROM public.work_sites WHERE id=origin_id)),
     coalesce(nullif(left(btrim(p_data->>'delivery_contact'),100),''),(SELECT site_contact_name FROM public.work_sites WHERE id=destination_id)),
     coalesce(nullif(left(btrim(p_data->>'delivery_phone'),40),''),(SELECT site_contact_phone FROM public.work_sites WHERE id=destination_id)),
     nullif(left(btrim(p_data->>'instructions'),500),''))$b$),
   ($a$'load',l.planned_load,'cargo',l.planned_cargo)$a$,
    $b$'load',l.planned_load,'cargo',l.planned_cargo,
       'pickup_contact',l.pickup_contact,'pickup_phone',l.pickup_phone,'delivery_contact',l.delivery_contact,
       'delivery_phone',l.delivery_phone,'instructions',l.instructions)$b$)
 ) patch LOOP
   IF (length(ddl)-length(replace(ddl,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Unexpected Trip Order fields'; END IF;
   ddl:=replace(ddl,anchor,replacement);
 END LOOP;
 EXECUTE ddl;

 ddl:=pg_get_functiondef('public.t07_fleet_operation(uuid,bigint,text,jsonb)'::regprocedure);
 anchor:=$a$'leg','delivery','discrepancy','gross_kg','tare_kg','weigh','pod','evidence','passed','issue','offline','lines'$a$;
 IF (length(ddl)-length(replace(ddl,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Unexpected Fleet command boundary'; END IF;
 EXECUTE replace(ddl,anchor,anchor||$a$,'pickup_contact','pickup_phone','delivery_contact','delivery_phone','instructions'$a$);
END;
$$;

CREATE OR REPLACE FUNCTION erp_private.t07_next_action(p_order bigint)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE o.status
   WHEN 'requested' THEN 'review-authorization'
   WHEN 'completed' THEN 'completed'
   WHEN 'cancelled' THEN 'cancelled'
   ELSE CASE
    WHEN EXISTS(SELECT 1 FROM erp_private.fleet_operation_assignments a JOIN erp_private.fleet_asset_holds h ON h.asset_id=a.asset_id
         WHERE a.order_id=o.id AND a.state IN('planned','active') AND h.released_at IS NULL) THEN 'resolve-hold'
    WHEN EXISTS(SELECT 1 FROM erp_private.fleet_operation_assignments a
         WHERE a.order_id=o.id AND a.state='planned' AND a.inspection_passed=false) THEN 'resolve-hold'
    WHEN o.status='review' THEN 'complete-missing-evidence'
    WHEN NOT EXISTS(SELECT 1 FROM erp_private.fleet_operation_assignments a WHERE a.order_id=o.id) THEN 'plan-resource'
    WHEN EXISTS(SELECT 1 FROM erp_private.fleet_operation_assignments a WHERE a.order_id=o.id AND a.state='active') THEN 'record-activity'
    WHEN o.kind='trip' AND EXISTS(SELECT 1 FROM erp_private.fleet_operation_assignments planned WHERE planned.order_id=o.id AND planned.state='planned'
       AND NOT EXISTS(SELECT 1 FROM erp_private.fleet_trip_paper_orders paper WHERE paper.order_id=o.id
          AND paper.pdf_sha256 IS NOT NULL
          AND paper.issue_revision=(SELECT max(latest.issue_revision) FROM erp_private.fleet_trip_paper_orders latest WHERE latest.order_id=o.id)
          AND paper.snapshot->'assignments' @> jsonb_build_array(jsonb_build_object('id',planned.id)))) THEN 'issue-trip-order'
    WHEN EXISTS(SELECT 1 FROM erp_private.fleet_operation_assignments a WHERE a.order_id=o.id AND a.state='planned') THEN 'confirm-handover'
    ELSE 'review-completion' END END
 FROM erp_private.fleet_operation_orders o WHERE o.id=p_order;
$$;

CREATE OR REPLACE FUNCTION public.t07_fleet_operations(p_query text DEFAULT '',p_kind text DEFAULT NULL,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'number',o.order_no,'kind',o.kind,'subject',o.subject,'status',o.status,
    'reference',o.request_reference,'next_action',erp_private.t07_next_action(o.id)) ORDER BY o.id DESC),'[]')
 FROM (SELECT item.* FROM erp_private.fleet_operation_orders item
   WHERE erp_private.t07_ops_readable(item.company_id,item.branch_id) AND (p_before IS NULL OR item.id<p_before)
    AND (p_kind IS NULL OR item.kind=p_kind) AND coalesce(length(p_query),0)<=160
    AND (coalesce(btrim(p_query),'')='' OR strpos(lower(item.order_no),lower(btrim(p_query)))>0
      OR strpos(lower(item.subject),lower(btrim(p_query)))>0 OR strpos(lower(item.request_reference),lower(btrim(p_query)))>0)
   ORDER BY item.id DESC LIMIT 26) o;
$$;

CREATE OR REPLACE FUNCTION public.t07_fleet_operation_choices(
 p_company bigint DEFAULT NULL,p_branch bigint DEFAULT NULL,p_query text DEFAULT '')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH scopes AS MATERIALIZED (
   SELECT b.id,b.owner_company_id AS company,b.branch_name_en,c.legal_name_en
   FROM public.branches b JOIN public.owner_companies c ON c.id=b.owner_company_id
   WHERE erp_private.t07_ops_readable(c.id,b.id) AND erp_private.t05_scope('fleet.operations.manage',c.id,b.id)
 ), picked AS MATERIALIZED (SELECT company,id FROM scopes WHERE company=p_company AND id=p_branch)
 SELECT jsonb_build_object(
  'scopes',coalesce((SELECT jsonb_agg(jsonb_build_object('company',s.company,'branch',s.id,
    'label',s.legal_name_en||' / '||s.branch_name_en) ORDER BY s.legal_name_en,s.branch_name_en,s.id) FROM scopes s),'[]'),
  'sites',coalesce((SELECT jsonb_agg(jsonb_build_object('id',w.id,'label',w.site_name) ORDER BY w.site_name,w.id)
   FROM (SELECT s.id,s.site_name FROM public.work_sites s CROSS JOIN picked p
    WHERE s.status='active' AND s.deleted_at IS NULL AND erp_private.assignment_scope_matches(
     s.available_to_all_organizations,s.owner_company_id,s.branch_id,p.company,p.id)
    ORDER BY s.site_name,s.id LIMIT 100) w),'[]'),
  'parties',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'label',x.display_name) ORDER BY x.display_name,x.id)
   FROM (SELECT u.id,u.display_name FROM public.parties u CROSS JOIN picked p
    WHERE erp_private.t07_party_allowed(u.id,p.company,p.id) AND length(btrim(p_query)) BETWEEN 2 AND 100
      AND (strpos(lower(u.display_name),lower(btrim(p_query)))>0 OR strpos(lower(u.party_code),lower(btrim(p_query)))>0)
    ORDER BY u.display_name,u.id LIMIT 50) x),'[]'),
  'assets',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'label',a.asset_no||' · '||a.name) ORDER BY a.asset_no)
   FROM (SELECT fa.id,fa.asset_no,fa.name FROM erp_private.fleet_assets fa CROSS JOIN picked p
    JOIN LATERAL erp_private.t06_operation_scope(fa.id) op ON op.company_id=p.company AND op.branch_id=p.id
    WHERE fa.status='active' AND erp_private.t06_custody_visible(fa.id) AND length(btrim(p_query)) BETWEEN 2 AND 100
      AND (strpos(lower(fa.asset_no),lower(btrim(p_query)))>0 OR strpos(lower(fa.name),lower(btrim(p_query)))>0)
    ORDER BY fa.asset_no,fa.id LIMIT 50) a),'[]'),
  'workers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'label',e.employee_code||' · '||e.full_name_en) ORDER BY e.full_name_en,e.id)
   FROM (SELECT person.id,person.employee_code,person.full_name_en FROM public.employees person
    JOIN erp_private.t03_employment_periods ep ON ep.employee_id=person.id
     AND ep.work_period @> (statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date
    JOIN picked p ON p.company=ep.company_id AND p.id=ep.branch_id
    WHERE length(btrim(p_query)) BETWEEN 2 AND 100 AND person.deleted_at IS NULL AND person.employee_status IN('active','probation')
     AND (strpos(lower(person.full_name_en),lower(btrim(p_query)))>0 OR strpos(lower(person.employee_code),lower(btrim(p_query)))>0)
    ORDER BY person.full_name_en,person.id LIMIT 50) e),'[]')
 );
$$;

CREATE OR REPLACE FUNCTION public.t07_fleet_operation_detail(p_order bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o erp_private.fleet_operation_orders; commercial boolean;
BEGIN
 SELECT * INTO o FROM erp_private.fleet_operation_orders WHERE id=p_order;
 IF o.id IS NULL OR NOT erp_private.t07_ops_readable(o.company_id,o.branch_id) THEN RETURN NULL; END IF;
 commercial:=erp_private.t05_scope('fleet.operations.commercial',o.company_id,o.branch_id);
 RETURN jsonb_build_object(
   'id',o.id,'number',o.order_no,'subject',o.subject,'kind',o.kind,'status',o.status,'revision',o.revision,'company',o.company_id,'branch',o.branch_id,'site',o.site_id,
   'reference',o.request_reference,'authorization',o.authorization_reference,'rental_mode',o.rental_mode,
   'customer',(SELECT display_name FROM public.parties WHERE id=o.customer_id),
   'supplier',(SELECT display_name FROM public.parties WHERE id=o.supplier_id),
   'next_action',erp_private.t07_next_action(o.id),
   'can_manage',erp_private.t05_scope('fleet.operations.manage',o.company_id,o.branch_id),
   'can_approve',erp_private.t05_scope('fleet.operations.approve',o.company_id,o.branch_id),'can_commercial',commercial,
   'can_approve_handover',erp_private.t05_scope('fleet.operations.approve',o.company_id,o.branch_id)
     AND erp_private.t05_scope('fleet.custody.approve',o.company_id,o.branch_id),
   'assignments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'slot',a.slot,'state',a.state,'supersedes',a.supersedes_id,
     'asset_id',a.asset_id,'asset',fa.asset_no||' · '||fa.name,'worker',e.full_name_en,'worker_id',a.worker_id,'employer',em.trade_name,
     'from',lower(a.planned_period),'until',upper(a.planned_period),'handover',lower(c.committed_during),
     'return',upper(c.committed_during),'planned_return',c.planned_return,'inspected',a.inspection_passed,
     'handover_approved',a.handover_approved_by IS NOT NULL) ORDER BY a.slot,a.id),'[]')
    FROM erp_private.fleet_operation_assignments a JOIN erp_private.fleet_assets fa ON fa.id=a.asset_id
     JOIN public.employees e ON e.id=a.worker_id JOIN public.owner_companies em ON em.id=a.employer_company_id
     LEFT JOIN erp_private.fleet_commitments c ON c.id=a.actual_commitment_id WHERE a.order_id=o.id),
   'legs',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'sequence',l.sequence,'origin',lo.site_name,'destination',ld.site_name,
     'origin_id',l.planned_origin,'destination_id',l.planned_destination,'load',l.planned_load,'cargo',l.planned_cargo,
     'pickup_contact',l.pickup_contact,'pickup_phone',l.pickup_phone,'delivery_contact',l.delivery_contact,
     'delivery_phone',l.delivery_phone,'instructions',l.instructions,'actual_origin',ao.site_name, 'actual_destination',ad.site_name,
     'departed',f.departed_at,'arrived',f.arrived_at,'actual_load',f.load,'net_kg',f.net_kg,
     'discrepancy',f.discrepancies,'delivery',d.state,
     'pod_current',coalesce(d.state='accepted' AND erp_private.t07_evidence_is_current(d.evidence_id),false)) ORDER BY l.sequence),'[]')
    FROM erp_private.fleet_trip_legs l JOIN public.work_sites lo ON lo.id=l.planned_origin
     JOIN public.work_sites ld ON ld.id=l.planned_destination
     LEFT JOIN erp_private.fleet_trip_leg_actuals f ON f.leg_id=l.id
     LEFT JOIN public.work_sites ao ON ao.id=f.origin LEFT JOIN public.work_sites ad ON ad.id=f.destination
     LEFT JOIN LATERAL(SELECT x.state,x.evidence_id FROM erp_private.fleet_trip_delivery_facts x WHERE x.actual_id=f.id ORDER BY id DESC LIMIT 1) d ON true
    WHERE l.order_id=o.id),
   'papers',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',pa.id,'label',pa.issue_no,'issued',pa.issued_at,
       'ready',pa.pdf_sha256 IS NOT NULL,'can_finalize',pa.pdf_sha256 IS NULL AND pa.issued_by=public.current_user_profile_id()
          AND pa.issue_revision=o.revision AND erp_private.t05_scope('fleet.operations.manage',o.company_id,o.branch_id)) ORDER BY pa.id DESC),'[]')
    FROM erp_private.fleet_trip_paper_orders pa WHERE pa.order_id=o.id),
   'rental_events',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',ev.id,'kind',ev.kind,'at',ev.occurred_at,
     'reason',CASE WHEN NOT commercial AND ev.kind IN('customer-start','customer-stop','supplier-start','supplier-stop','claim')
       THEN 'Recorded by Commercial' ELSE ev.reason END,
     'assignment',ev.assignment_id) ORDER BY ev.occurred_at,ev.id),'[]') FROM erp_private.fleet_rental_events ev WHERE ev.order_id=o.id),
   'usage',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'assignment',u.assignment_id,'from',lower(u.work_period),
     'until',upper(u.work_period),'state',u.state,'reason',u.reason,
     'evidence_current',erp_private.t07_evidence_is_current(u.evidence_id),
     'document',CASE WHEN erp_private.document_permission(ev.document_id,'dms.documents.preview') THEN ev.document_id END)
     ORDER BY lower(u.work_period),u.id),'[]')
    FROM erp_private.t07_effective_rental_usage u JOIN erp_private.fleet_operation_evidence ev ON ev.id=u.evidence_id WHERE u.order_id=o.id),
   'terms',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'quote',t.quote_reference,'lpo',t.lpo_reference,'unit',t.unit,
     'rate',t.unit_rate,'ceiling',t.ceiling,'currency',cc.currency_code,'from',lower(t.valid_during),'until',upper(t.valid_during)-1,
     'approved',t.approved_at IS NOT NULL,
     'document',CASE WHEN access.allowed THEN ev.document_id END,
     'version',CASE WHEN access.allowed THEN ev.version_id END,'file',CASE WHEN access.allowed THEN ev.file_id END)
     ORDER BY t.id DESC),'[]') FROM erp_private.fleet_rental_terms t
     JOIN public.currencies cc ON cc.id=t.currency_id JOIN erp_private.fleet_operation_evidence ev ON ev.id=t.agreement_evidence_id
     CROSS JOIN LATERAL (SELECT erp_private.document_permission(ev.document_id,'dms.documents.preview') AS allowed) access
     WHERE commercial AND t.order_id=o.id),
   'statements',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',st.id,'terms',st.terms_id,'quantity',st.quantity,'amount',st.amount,
     'approved',st.approved_at IS NOT NULL,'supersedes',st.supersedes_id,
     'usage',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.usage_id,
        'document',CASE WHEN access.allowed THEN ep.document_id END,'version',CASE WHEN access.allowed THEN ep.version_id END,
        'file',CASE WHEN access.allowed THEN ep.file_id END,'reference',CASE WHEN access.allowed THEN ep.paper_reference END)
        ORDER BY x.usage_id),'[]') FROM erp_private.fleet_statement_usage x
        JOIN erp_private.fleet_operation_evidence ep ON ep.id=x.evidence_id
        CROSS JOIN LATERAL (SELECT erp_private.document_permission(ep.document_id,'dms.documents.preview') AS allowed) access
        WHERE x.statement_id=st.id))
     ORDER BY st.id DESC),'[]')
    FROM erp_private.fleet_rental_statements st WHERE commercial AND st.order_id=o.id),
   'currencies',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',cc.id,'label',cc.currency_code) ORDER BY cc.currency_code),'[]')
    FROM public.currencies cc WHERE commercial AND cc.is_active AND cc.decimal_places=2),
   'proofs',(SELECT coalesce(jsonb_agg(jsonb_build_object('document',row.document,'version',row.version,'file',row.file,
       'asset',row.asset,'type',row.type,'label',row.label) ORDER BY row.document DESC,row.file),'[]')
    FROM (SELECT d.id AS document,v.id AS version,f.id AS file,binding.asset_id AS asset,t.type_code AS type,d.document_no||' · '||d.title AS label
      FROM erp_private.fleet_document_parents binding JOIN public.dms_documents d ON d.id=binding.document_id
      JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.deleted_at IS NULL
      JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
      JOIN public.dms_document_files f ON f.document_id=d.id AND f.version_id=v.id AND f.file_role='original' AND f.deleted_at IS NULL
       AND f.integrity_status='verified' AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$'
      WHERE binding.asset_id IN(SELECT a.asset_id FROM erp_private.fleet_operation_assignments a WHERE a.order_id=o.id)
        AND t.type_code IN('FLEET_TRIP_ORDER','FLEET_PRE_TRIP_INSPECTION','FLEET_SIGNED_POD','FLEET_WEIGH_TICKET',
          'FLEET_CUSTODY_ACK','FLEET_SIGNED_RENTAL_SHEET','FLEET_RENTAL_NOTICE','FLEET_RENTAL_AGREEMENT')
        AND (commercial OR t.type_code<>'FLEET_RENTAL_AGREEMENT')
        AND EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.entity_type='fleet_asset'
          AND l.entity_id=binding.asset_id AND l.deleted_at IS NULL)
        AND d.status='active' AND d.deleted_at IS NULL AND NOT d.is_archived AND erp_private.document_permission(d.id,'dms.documents.preview')
      ORDER BY d.id DESC,f.id LIMIT 100) row),
   'history',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'action',h.action,'at',h.action_at,'reason',h.reason) ORDER BY h.id DESC),'[]')
    FROM (SELECT x.* FROM erp_private.fleet_ops_audit x WHERE x.order_id=o.id
        AND (commercial OR x.action NOT IN('prepare-terms','approve-terms','prepare-statement','approve-statement',
          'rental-event')) ORDER BY x.id DESC LIMIT 50) h)
 );
END;
$$;

CREATE OR REPLACE FUNCTION public.t07_fleet_trip_order(p_order bigint,p_issue bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('issue',pa.issue_no,'issued',pa.issued_at,'snapshot',pa.snapshot,'ready',pa.pdf_sha256 IS NOT NULL,
    'can_finalize',pa.pdf_sha256 IS NULL AND pa.issued_by=public.current_user_profile_id() AND pa.issue_revision=o.revision
      AND erp_private.t05_scope('fleet.operations.manage',o.company_id,o.branch_id))
 FROM erp_private.fleet_trip_paper_orders pa JOIN erp_private.fleet_operation_orders o ON o.id=pa.order_id
 WHERE o.id=p_order AND pa.id=p_issue AND erp_private.t07_ops_readable(o.company_id,o.branch_id);
$$;

CREATE FUNCTION public.t07_publish_trip_order(p_order bigint,p_issue bigint,p_claims jsonb,p_pdf text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE paper erp_private.fleet_trip_paper_orders; o erp_private.fleet_operation_orders; bytes bytea; prior text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted PDF renderer required' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM erp_private.fleet_operation_orders WHERE id=p_order FOR UPDATE;
 SELECT * INTO paper FROM erp_private.fleet_trip_paper_orders WHERE id=p_issue AND order_id=o.id FOR UPDATE;
 IF paper.id IS NULL THEN RETURN false; END IF;
 prior:=current_setting('request.jwt.claims',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_claims->>'sub','session_id',p_claims->>'session_id',
   'role','authenticated')::text,true);
 IF paper.issued_by IS DISTINCT FROM public.current_user_profile_id()
    OR NOT erp_private.t02_has_scope('fleet.operations.view',o.company_id,o.branch_id)
    OR NOT erp_private.t02_has_scope('fleet.operations.manage',o.company_id,o.branch_id)
 THEN
    PERFORM set_config('request.jwt.claims',coalesce(prior,''),true);
    RETURN false;
 END IF;
 PERFORM set_config('request.jwt.claims',coalesce(prior,''),true);
 IF paper.pdf_sha256 IS NOT NULL THEN RETURN true; END IF;
 IF paper.issue_revision<>o.revision OR length(p_pdf)>2000000 THEN RETURN false; END IF;
 bytes:=decode(p_pdf,'base64');
 IF bytes IS NULL OR length(bytes)<100 OR substring(bytes FROM 1 FOR 5)<>convert_to('%PDF-','UTF8')
    OR position(convert_to('%%EOF','UTF8') IN substring(bytes FROM greatest(length(bytes)-128,1)))=0 THEN RETURN false; END IF;
 UPDATE erp_private.fleet_trip_paper_orders SET pdf_bytes=bytes,pdf_sha256=encode(extensions.digest(bytes,'sha256'),'hex') WHERE id=paper.id;
 RETURN true;
END;
$$;

CREATE FUNCTION public.t07_fleet_trip_order_pdf(p_order bigint,p_issue bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('issue',p.issue_no,'pdf',encode(p.pdf_bytes,'base64'),'sha256',p.pdf_sha256)
 FROM erp_private.fleet_trip_paper_orders p JOIN erp_private.fleet_operation_orders o ON o.id=p.order_id
 WHERE o.id=p_order AND p.id=p_issue AND p.pdf_sha256 IS NOT NULL AND erp_private.t07_ops_readable(o.company_id,o.branch_id);
$$;

DO $$
DECLARE ddl text:=pg_get_functiondef('public.t06_fleet_custody_workspace(bigint,bigint)'::regprocedure);
 anchor constant text:=$a$'assigned_driver',c.verified_driver_id,$a$;
 extension constant text:=$b$'assigned_driver',c.verified_driver_id,
    'managed_by_operation',EXISTS(SELECT 1 FROM erp_private.fleet_ops_owned_commitments own WHERE own.commitment_id=c.id),
    'owning_operation',(SELECT o.id FROM erp_private.fleet_ops_owned_commitments own
      JOIN erp_private.fleet_operation_orders o ON o.id=own.order_id
      WHERE own.commitment_id=c.id AND erp_private.t07_ops_readable(o.company_id,o.branch_id)),$b$;
BEGIN
 IF (length(ddl)-length(replace(ddl,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Unexpected T06 custody projection'; END IF;
 EXECUTE replace(ddl,anchor,extension);
END;
$$;

REVOKE ALL ON FUNCTION erp_private.t07_next_action(bigint),public.t07_fleet_operations(text,text,bigint),
 public.t07_fleet_operation_choices(bigint,bigint,text),public.t07_fleet_operation_detail(bigint),public.t07_fleet_trip_order(bigint,bigint),
 public.t07_publish_trip_order(bigint,bigint,jsonb,text),public.t07_fleet_trip_order_pdf(bigint,bigint)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t07_fleet_operations(text,text,bigint),public.t07_fleet_operation_choices(bigint,bigint,text),
 public.t07_fleet_operation_detail(bigint),public.t07_fleet_trip_order(bigint,bigint),public.t07_fleet_trip_order_pdf(bigint,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.t07_publish_trip_order(bigint,bigint,jsonb,text) TO service_role;
COMMIT;
