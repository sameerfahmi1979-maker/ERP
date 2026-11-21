BEGIN;

CREATE FUNCTION public.t05_fleet_document_context(p_asset bigint)
RETURNS TABLE(company bigint,branch bigint,can_link boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT a.owner_company_id,a.home_branch_id,a.status<>'retired'
     AND erp_private.t05_scope('fleet.assets.documents',a.owner_company_id,a.home_branch_id)
 FROM erp_private.fleet_assets a
 WHERE a.id=p_asset AND erp_private.t05_scope('fleet.assets.view',a.owner_company_id,a.home_branch_id);
$$;
REVOKE ALL ON FUNCTION public.t05_fleet_document_context(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t05_fleet_document_context(bigint) TO authenticated;

-- Perform the additional set-read checks only against documents that have a
-- Fleet binding or a legacy canonical link awaiting owner reconciliation.
DO $$
DECLARE sig text; ddl text;
 anchor constant text:='AND erp_private.t05_document_allowed(d.id)';
 replacement constant text:='AND NOT EXISTS (SELECT 1 FROM fleet_blocked fb WHERE fb.id=d.id)';
 start_anchor constant text:='WITH ';
 start_replacement constant text:='WITH fleet_blocked AS MATERIALIZED (
    SELECT parent.document_id AS id FROM erp_private.fleet_document_parents parent
    JOIN erp_private.fleet_assets a ON a.id=parent.asset_id
    JOIN public.dms_documents doc ON doc.id=parent.document_id
    WHERE ROW(doc.owning_company_id,doc.owning_branch_id) IS DISTINCT FROM ROW(a.owner_company_id,a.home_branch_id)
      OR NOT erp_private.t05_scope(''fleet.assets.view'',a.owner_company_id,a.home_branch_id)
    UNION
    SELECT l.document_id FROM public.dms_document_links l
    WHERE l.entity_type=''fleet_asset'' AND l.deleted_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM erp_private.fleet_document_parents p WHERE p.document_id=l.document_id AND p.asset_id=l.entity_id)
  ), ';
 start_position integer;
BEGIN
 FOREACH sig IN ARRAY ARRAY['erp_private.read_documents_matching(bigint[],text[],text[],bigint[],text,tsquery)',
                            'erp_private.visible_dms_association_document_ids(text)'] LOOP
   ddl:=pg_get_functiondef(sig::regprocedure);
   start_position:=strpos(ddl,start_anchor);
   IF start_position=0 OR (length(ddl)-length(replace(ddl,anchor,'')))/length(anchor)<>1 THEN
     RAISE EXCEPTION 'Unexpected Fleet DMS set reader for %',sig;
   END IF;
   EXECUTE replace(overlay(ddl PLACING start_replacement FROM start_position FOR length(start_anchor)),anchor,replacement);
 END LOOP;
END;
$$;

-- Keep group-wide reservations for corrected identity values. Only the current
-- value changes; the original identifier and correction reason remain in history.
CREATE TABLE erp_private.fleet_asset_identifiers (
 asset_id bigint NOT NULL REFERENCES erp_private.fleet_assets(id),
 kind text NOT NULL CHECK (kind IN ('vin','serial')),
 value text NOT NULL,
 PRIMARY KEY(kind,value)
);
INSERT INTO erp_private.fleet_asset_identifiers(asset_id,kind,value)
SELECT id,'vin',vin FROM erp_private.fleet_assets WHERE vin IS NOT NULL
UNION ALL SELECT id,'serial',serial FROM erp_private.fleet_assets WHERE serial IS NOT NULL;
CREATE INDEX fleet_asset_identifier_history ON erp_private.fleet_asset_identifiers(asset_id,kind,value);
REVOKE ALL ON erp_private.fleet_asset_identifiers FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.t05_reserve_asset_identifiers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE reserved_asset bigint; identifier text; identifier_kind text;
BEGIN
 FOR identifier_kind,identifier IN SELECT * FROM (VALUES ('vin',NEW.vin),('serial',NEW.serial)) fields LOOP
   IF identifier IS NULL THEN CONTINUE; END IF;
   INSERT INTO erp_private.fleet_asset_identifiers(asset_id,kind,value) VALUES(NEW.id,identifier_kind,identifier)
      ON CONFLICT(kind,value) DO NOTHING;
   SELECT asset_id INTO reserved_asset FROM erp_private.fleet_asset_identifiers WHERE kind=identifier_kind AND value=identifier;
   IF reserved_asset IS DISTINCT FROM NEW.id THEN
     RAISE EXCEPTION 'Fleet identifier is already recorded' USING ERRCODE='23505';
   END IF;
 END LOOP;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.t05_reserve_asset_identifiers() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER t05_reserve_asset_identifiers AFTER INSERT OR UPDATE OF vin,serial ON erp_private.fleet_assets
 FOR EACH ROW EXECUTE FUNCTION erp_private.t05_reserve_asset_identifiers();

ALTER TABLE erp_private.fleet_asset_history DROP CONSTRAINT fleet_asset_history_kind_check,
 ADD CONSTRAINT fleet_asset_history_kind_check CHECK (kind IN ('ownership','operation','location','configuration','lifecycle','identity'));

DO $$
DECLARE ddl text:=pg_get_functiondef('public.t05_write_fleet_asset(uuid,bigint,text,jsonb)'::regprocedure);
 anchor text; replacement text;
BEGIN
 FOR anchor,replacement IN SELECT * FROM (VALUES
  ($a$'create','ownership','operation','location','configuration','lifecycle','plate','meter','verify-document'$a$,
   $b$'create','ownership','operation','location','configuration','lifecycle','identity','plate','meter','verify-document'$b$),
  ($a$WHEN 'configuration' THEN ARRAY['date','reason','revision','facts']$a$,
   $b$WHEN 'configuration' THEN ARRAY['date','reason','revision','facts']
  WHEN 'identity' THEN ARRAY['date','reason','revision','vin','serial']$b$),
  ($a$p_action IN ('ownership','operation','location','configuration','lifecycle')$a$,
   $b$p_action IN ('ownership','operation','location','configuration','lifecycle','identity')$b$),
  ($a$     ELSE
       current_status:=p_data->>'status';$a$,
   $b$     ELSIF p_action='identity' THEN
       IF (p_data ? 'vin' AND coalesce(erp_private.t05_identifier(p_data->>'vin'),'')!~'^[A-HJ-NPR-Z0-9]{17}$')
         OR (p_data ? 'serial' AND coalesce(erp_private.t05_identifier(p_data->>'serial'),'')!~'^[A-Z0-9]{3,80}$')
         OR NOT (p_data ? 'vin' OR p_data ? 'serial')
       THEN RAISE EXCEPTION 'Enter a corrected VIN or serial' USING ERRCODE='22023'; END IF;
       facts:=jsonb_build_object('previous_vin',a.vin,'previous_serial',a.serial,'vin',
           coalesce(erp_private.t05_identifier(p_data->>'vin'),a.vin),'serial',coalesce(erp_private.t05_identifier(p_data->>'serial'),a.serial));
       IF ROW(a.vin,a.serial) IS NOT DISTINCT FROM ROW(facts->>'vin',facts->>'serial') THEN
         RAISE EXCEPTION 'No Fleet identifier changed' USING ERRCODE='22023';
       END IF;
       UPDATE erp_private.fleet_assets SET vin=facts->>'vin',serial=facts->>'serial' WHERE id=a.id;
     ELSE
       current_status:=p_data->>'status';$b$),
  ($a$AND f.id=file_id AND f.file_role='original' AND f.deleted_at IS NULL FOR SHARE OF v,f$a$,
   $b$AND f.id=file_id AND f.file_role='original' AND f.deleted_at IS NULL AND f.integrity_status='verified' FOR SHARE OF v,f$b$)
 ) patches LOOP
  IF (length(ddl)-length(replace(ddl,anchor,'')))/length(anchor)<>1 THEN
    RAISE EXCEPTION 'Unexpected Fleet write extension point: %',anchor;
  END IF;
  ddl:=replace(ddl,anchor,replacement);
 END LOOP;
 EXECUTE ddl;
 ddl:=pg_get_functiondef('public.t05_search_fleet_assets(text,integer,integer,boolean,bigint)'::regprocedure);
 anchor:='OR strpos(a.vin,erp_private.t05_identifier(p_query))>0 OR strpos(a.serial,erp_private.t05_identifier(p_query))>0';
 IF (length(ddl)-length(replace(ddl,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Unexpected Fleet search extension point'; END IF;
 EXECUTE replace(ddl,anchor,'OR EXISTS(SELECT 1 FROM erp_private.fleet_asset_identifiers identifier
      WHERE identifier.asset_id=a.id AND strpos(identifier.value,erp_private.t05_identifier(p_query))>0)');
END;
$$;

-- Stock DMS users receive no automatic Fleet expiry mail. Settlement and
-- delivery decisions for a Fleet recipient require a future recipient policy.
CREATE FUNCTION public.t05_has_fleet_document_subject(p_document bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (SELECT 1 FROM erp_private.fleet_document_parents p WHERE p.document_id=p_document)
   OR EXISTS (SELECT 1 FROM public.dms_document_links l WHERE l.document_id=p_document AND l.entity_type='fleet_asset' AND l.deleted_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public.t05_has_fleet_document_subject(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t05_has_fleet_document_subject(bigint) TO service_role;

COMMIT;
