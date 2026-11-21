BEGIN;

-- Keep table and function names distinct inside PL/pgSQL statements that read
-- the current evidence, plate or meter event.
DO $$
DECLARE ddl text:=pg_get_functiondef('public.t05_write_fleet_asset(uuid,bigint,text,jsonb)'::regprocedure);
 anchor text; replacement text;
BEGIN
 FOR anchor,replacement IN SELECT * FROM (VALUES
  ('close_reason=reason WHERE id=plate.id','close_reason=btrim(p_data->>''reason'') WHERE id=plate.id'),
  ('m.unit=unit ORDER BY','m.unit=p_data->>''unit'' ORDER BY'),
  ('e.kind=kind','e.kind=p_data->>''kind'''),
  ('p.document_id=document_id AND p.asset_id=a.id','p.document_id=(p_data->>''document'')::bigint AND p.asset_id=a.id'),
  ('WHERE v.id=version_id','WHERE v.id=(p_data->>''version'')::bigint'),
  ('erp_private.permission_in_scope(''parties.view'',a.owner_company_id,a.home_branch_id)', '(erp_private.permission_in_scope(''master_data.parties.view'',a.owner_company_id,a.home_branch_id) OR erp_private.permission_in_scope(''master_data.party_master.view'',a.owner_company_id,a.home_branch_id))'),
  ($a$((s.owner_company_id=company AND (s.branch_id IS NULL OR s.branch_id=branch))
              OR (s.available_to_all_organizations AND s.owner_company_id IS NULL AND s.branch_id IS NULL))$a$,
   $b$erp_private.assignment_scope_matches(s.available_to_all_organizations,s.owner_company_id,s.branch_id,company,branch)$b$)
 ) patches LOOP
  IF strpos(ddl,replacement)>0 THEN CONTINUE; END IF;
  IF (length(ddl)-length(replace(ddl,anchor,'')))/length(anchor)<>1 THEN
    RAISE EXCEPTION 'Unexpected Fleet event extension point: %',anchor;
  END IF;
  ddl:=replace(ddl,anchor,replacement);
 END LOOP;
 EXECUTE ddl;
END;
$$;


DO $$
DECLARE ddl text:=pg_get_functiondef('public.t05_fleet_asset_choices(bigint,bigint)'::regprocedure);
 anchor constant text:=$a$((s.owner_company_id=p_company AND (s.branch_id IS NULL OR s.branch_id=p_branch))
       OR (s.available_to_all_organizations AND s.owner_company_id IS NULL AND s.branch_id IS NULL))$a$;
 replacement constant text:='erp_private.assignment_scope_matches(s.available_to_all_organizations,s.owner_company_id,s.branch_id,p_company,p_branch)';
BEGIN
 IF strpos(ddl,replacement)>0 THEN RETURN; END IF;
 IF (length(ddl)-length(replace(ddl,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Unexpected Fleet site lookup'; END IF;
 EXECUTE replace(ddl,anchor,replacement);
END;
$$;

CREATE OR REPLACE FUNCTION public.t05_search_fleet_parties(p_company bigint,p_branch bigint,p_query text)
RETURNS TABLE(id bigint,label text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.id,concat_ws(' · ',nullif(p.party_code,''),coalesce(p.display_name,p.legal_name_en))
 FROM public.parties p
 WHERE p.is_active AND length(btrim(p_query)) BETWEEN 2 AND 100
   AND erp_private.t05_scope('fleet.assets.manage',p_company,p_branch)
   AND (erp_private.permission_in_scope('master_data.parties.view',p_company,p_branch)
      OR erp_private.permission_in_scope('master_data.party_master.view',p_company,p_branch))
   AND (strpos(lower(p.display_name),lower(btrim(p_query)))>0
     OR strpos(lower(p.legal_name_en),lower(btrim(p_query)))>0
     OR strpos(lower(p.party_code),lower(btrim(p_query)))>0)
 ORDER BY p.display_name,p.id LIMIT 50;
$$;
REVOKE ALL ON FUNCTION public.t05_search_fleet_parties(bigint,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t05_search_fleet_parties(bigint,bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION erp_private.t05_guard_fleet_document_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF ROW(NEW.owning_company_id,NEW.owning_branch_id) IS DISTINCT FROM ROW(OLD.owning_company_id,OLD.owning_branch_id)
   AND EXISTS(SELECT 1 FROM erp_private.fleet_document_parents parent JOIN erp_private.fleet_assets a ON a.id=parent.asset_id
     WHERE parent.document_id=OLD.id
       AND ROW(NEW.owning_company_id,NEW.owning_branch_id) IS DISTINCT FROM ROW(a.owner_company_id,a.home_branch_id))
 THEN RAISE EXCEPTION 'Fleet evidence must retain its asset home scope' USING ERRCODE='PT409'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.t05_guard_fleet_document_scope() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS t05_fleet_document_scope ON public.dms_documents;
CREATE TRIGGER t05_fleet_document_scope BEFORE UPDATE OF owning_company_id,owning_branch_id ON public.dms_documents
 FOR EACH ROW EXECUTE FUNCTION erp_private.t05_guard_fleet_document_scope();

DO $$
DECLARE ddl text:=pg_get_functiondef('public.t05_read_fleet_asset(bigint)'::regprocedure);
 anchor constant text:='to_jsonb(e) ORDER BY e.kind,e.effective_on DESC,e.id DESC';
 replacement constant text:='to_jsonb(e)||jsonb_build_object(''source_current'',EXISTS(
       SELECT 1 FROM public.dms_documents source JOIN public.dms_document_versions v ON v.id=e.version_id AND v.document_id=source.id
       JOIN public.dms_document_files f ON f.id=e.file_id AND f.document_id=source.id AND f.version_id=v.id
       WHERE source.id=e.document_id AND source.current_version_id=v.id AND source.status=''active''
         AND v.is_current AND v.unlinked_at IS NULL AND NOT source.is_archived AND source.deleted_at IS NULL
         AND f.file_role=''original'' AND f.integrity_status=''verified'' AND f.deleted_at IS NULL
         AND source.issue_date=e.effective_on AND source.expiry_date=e.expires_on))
       ORDER BY e.kind,e.effective_on DESC,e.id DESC';
 old_choice constant text:='AND f.file_role=''original'' AND f.deleted_at IS NULL';
 guarded_choice constant text:='AND f.file_role=''original'' AND f.deleted_at IS NULL AND f.integrity_status=''verified''';
BEGIN
 IF strpos(ddl,replacement)>0 AND strpos(ddl,guarded_choice)>0 THEN RETURN; END IF;
 IF (length(ddl)-length(replace(ddl,anchor,'')))/length(anchor)<>1
    OR (length(ddl)-length(replace(ddl,old_choice,'')))/length(old_choice)<>1
 THEN RAISE EXCEPTION 'Unexpected Fleet evidence projection'; END IF;
 EXECUTE replace(replace(ddl,anchor,replacement),old_choice,guarded_choice);
END;
$$;

COMMIT;
