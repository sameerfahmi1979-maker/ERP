BEGIN;

-- Retain the original full projection for existing callers. The Fleet page needs
-- only identity, current axle geometry, current plate and the latest meter per unit.
CREATE FUNCTION public.t05_read_fleet_asset_summary(p_asset bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 a erp_private.fleet_assets;
 home_access boolean;
BEGIN
 SELECT * INTO a FROM erp_private.fleet_assets WHERE id=p_asset;
 IF a.id IS NULL OR NOT erp_private.t05_asset_readable(a.id) THEN RETURN NULL; END IF;
 home_access:=erp_private.t05_scope('fleet.assets.view',a.owner_company_id,a.home_branch_id);

 RETURN jsonb_build_object(
   'id',a.id,'asset_no',a.asset_no,'name',a.name,'category',a.category,'status',a.status,
   'vin',a.vin,'serial',a.serial,'company',a.owner_company_id,'branch',a.home_branch_id,'revision',a.revision,
   'can_manage',home_access AND erp_private.t05_scope('fleet.assets.manage',a.owner_company_id,a.home_branch_id),
   'can_link',home_access AND erp_private.t05_scope('fleet.assets.documents',a.owner_company_id,a.home_branch_id),
   'can_see_documents',home_access,
   'history',(SELECT coalesce(jsonb_agg(to_jsonb(current_config)),'[]') FROM (
     SELECT h.* FROM erp_private.fleet_asset_history h WHERE h.asset_id=a.id AND h.kind='configuration'
     ORDER BY h.effective_on DESC,h.id DESC LIMIT 1
   ) current_config),
   'plates',(SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') FROM erp_private.fleet_asset_plates p
     WHERE p.asset_id=a.id AND p.valid_until IS NULL),
   'meters',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.unit),'[]')
     FROM (VALUES ('km'::text),('hours'::text)) unit(name)
     CROSS JOIN LATERAL (
       SELECT reading.* FROM erp_private.fleet_asset_meters reading
       WHERE reading.asset_id=a.id AND reading.unit=unit.name ORDER BY reading.id DESC LIMIT 1
     ) m)
 );
END;
$$;

-- Keep the original scope and order for every panel. A 26th authorized row
-- determines whether the user can continue from the 25 visible rows.
CREATE FUNCTION public.t05_read_fleet_asset_page(p_asset bigint,p_section text,p_page integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 a erp_private.fleet_assets;
 home_access boolean;
 page_offset integer;
 rows jsonb:='[]';
 has_more boolean;
BEGIN
 IF p_section IS NULL OR p_section NOT IN ('history','plates','meters','evidence','proof')
    OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 85899345 THEN
   RAISE EXCEPTION 'Invalid Fleet asset page' USING ERRCODE='22023';
 END IF;

 SELECT * INTO a FROM erp_private.fleet_assets WHERE id=p_asset;
 IF a.id IS NULL OR NOT erp_private.t05_asset_readable(a.id) THEN RETURN NULL; END IF;
 home_access:=erp_private.t05_scope('fleet.assets.view',a.owner_company_id,a.home_branch_id);
 page_offset:=(p_page-1)*25;

 CASE p_section
 WHEN 'history' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.effective_on DESC,h.id DESC),'[]') INTO rows
   FROM (
     SELECT history.* FROM erp_private.fleet_asset_history history
     WHERE history.asset_id=a.id AND (home_access OR history.kind IN ('configuration','lifecycle')
       OR (history.kind IN ('operation','location')
         AND erp_private.t05_scope('fleet.assets.view',history.company_id,history.branch_id)))
     ORDER BY history.effective_on DESC,history.id DESC LIMIT 26 OFFSET page_offset
   ) h;
 WHEN 'plates' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.valid_from DESC,p.id DESC),'[]') INTO rows
   FROM (
     SELECT plate.* FROM erp_private.fleet_asset_plates plate WHERE plate.asset_id=a.id
     ORDER BY plate.valid_from DESC,plate.id DESC LIMIT 26 OFFSET page_offset
   ) p;
 WHEN 'meters' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.unit,m.id DESC),'[]') INTO rows
   FROM (
     SELECT meter.* FROM erp_private.fleet_asset_meters meter WHERE meter.asset_id=a.id
     ORDER BY meter.unit,meter.id DESC LIMIT 26 OFFSET page_offset
   ) m;
 WHEN 'evidence' THEN
   IF home_access THEN
     SELECT coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('source_current',EXISTS(
       SELECT 1 FROM public.dms_documents source JOIN public.dms_document_versions v ON v.id=e.version_id AND v.document_id=source.id
       JOIN public.dms_document_files f ON f.id=e.file_id AND f.document_id=source.id AND f.version_id=v.id
       WHERE source.id=e.document_id AND source.current_version_id=v.id AND source.status='active'
         AND v.is_current AND v.unlinked_at IS NULL AND NOT source.is_archived AND source.deleted_at IS NULL
         AND f.file_role='original' AND f.integrity_status='verified' AND f.deleted_at IS NULL
         AND source.issue_date=e.effective_on AND source.expiry_date=e.expires_on))
       ORDER BY e.kind,e.effective_on DESC,e.id DESC),'[]') INTO rows
     FROM (
       SELECT evidence.* FROM erp_private.fleet_asset_evidence evidence
       WHERE evidence.asset_id=a.id AND erp_private.document_permission(evidence.document_id,'dms.documents.preview')
       ORDER BY evidence.kind,evidence.effective_on DESC,evidence.id DESC LIMIT 26 OFFSET page_offset
     ) e;
   END IF;
 WHEN 'proof' THEN
   IF home_access AND a.status<>'retired'
      AND erp_private.t05_scope('fleet.assets.documents',a.owner_company_id,a.home_branch_id) THEN
     -- Resolve eligible originals for this asset before running the expensive
     -- permission predicate. Check permission before counting or paging.
     WITH eligible AS MATERIALIZED (
       SELECT d.id document_id,v.id version_id,f.id file_id,d.document_no||' · '||d.title label,
         d.issue_date,d.expiry_date,
         CASE WHEN t.type_code IN ('VEHICLE_INSURANCE','INSURANCE_POLICY') THEN 'insurance' ELSE 'registration' END kind
       FROM public.dms_document_links l JOIN public.dms_documents d ON d.id=l.document_id
       JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.deleted_at IS NULL
       JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
       JOIN public.dms_document_files f ON f.document_id=d.id AND f.version_id=v.id AND f.file_role='original'
         AND f.deleted_at IS NULL AND f.integrity_status='verified'
       WHERE l.entity_type='fleet_asset' AND l.entity_id=a.id AND l.deleted_at IS NULL
         AND d.status='active' AND d.deleted_at IS NULL AND NOT d.is_archived
         AND d.issue_date IS NOT NULL AND d.expiry_date>=d.issue_date
         AND t.type_code IN ('VEHICLE_REGISTRATION','MULKIYA','EQUIPMENT_REGISTRATION','VEHICLE_INSURANCE','INSURANCE_POLICY')
     ), proof AS (
       SELECT e.* FROM eligible e
       WHERE erp_private.document_permission(e.document_id,'dms.documents.preview')
       ORDER BY e.issue_date DESC,e.document_id,e.file_id LIMIT 26 OFFSET page_offset
     )
     SELECT coalesce(jsonb_agg(jsonb_build_object('document',proof.document_id,'version',proof.version_id,
       'file',proof.file_id,'label',proof.label,'date',proof.issue_date,'expires',proof.expiry_date,'kind',proof.kind)
       ORDER BY proof.issue_date DESC,proof.document_id,proof.file_id),'[]') INTO rows FROM proof;
   END IF;
 END CASE;

 has_more:=jsonb_array_length(rows)>25;
 IF has_more THEN rows:=rows-25; END IF;
 RETURN jsonb_build_object('section',p_section,'rows',rows,'has_more',has_more);
END;
$$;

REVOKE ALL ON FUNCTION public.t05_read_fleet_asset_summary(bigint),public.t05_read_fleet_asset_page(bigint,text,integer)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t05_read_fleet_asset_summary(bigint),public.t05_read_fleet_asset_page(bigint,text,integer)
 TO authenticated;

COMMIT;
