BEGIN;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('fleet.assets.view','Read Fleet assets','fleet','view','held'),
 ('fleet.assets.manage','Maintain Fleet assets','fleet','manage','held'),
 ('fleet.assets.documents','Link and verify Fleet documents','fleet','documents','held');

INSERT INTO public.global_numbering_rules(rule_code,rule_name,module_code,module_name,document_type_code,document_type_name,
 document_prefix,format_template,sequence_length,reset_policy,reserve_on_draft,allow_manual_override,cancelled_number_policy,duplicate_prevention_scope)
VALUES ('FLEET_ASSET_LIFETIME','Fleet asset lifetime number','fleet','Fleet','FLEET_ASSET','Fleet asset',
 'FLT','{DOC}-{SEQ6}',6,'never',true,false,'never_reuse','global');

CREATE TABLE erp_private.fleet_assets (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 asset_no text NOT NULL UNIQUE,
 owner_company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 home_branch_id bigint NOT NULL REFERENCES public.branches(id),
 category text NOT NULL CHECK (category IN ('truck','trailer','equipment','light_vehicle')),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
 vin text UNIQUE CHECK (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
 serial text UNIQUE CHECK (serial ~ '^[A-Z0-9]{3,80}$'),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
 revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by bigint NOT NULL REFERENCES public.user_profiles(id)
);
CREATE INDEX fleet_assets_home_scope ON erp_private.fleet_assets(owner_company_id,home_branch_id,id);

-- One timeline per relationship. Its latest dated fact is current. Custody has its own later workflow.
CREATE TABLE erp_private.fleet_asset_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 asset_id bigint NOT NULL REFERENCES erp_private.fleet_assets(id),
 kind text NOT NULL CHECK (kind IN ('ownership','operation','location','configuration','lifecycle')),
 effective_on date NOT NULL,
 company_id bigint REFERENCES public.owner_companies(id),
 branch_id bigint REFERENCES public.branches(id),
 site_id bigint REFERENCES public.work_sites(id),
 role_id bigint REFERENCES public.roles(id),
 party_id bigint REFERENCES public.parties(id),
 facts jsonb NOT NULL CHECK (jsonb_typeof(facts)='object'),
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 recorded_by bigint NOT NULL REFERENCES public.user_profiles(id)
);
CREATE INDEX fleet_asset_history_timeline ON erp_private.fleet_asset_history(asset_id,kind,effective_on DESC,id DESC);

CREATE TABLE erp_private.fleet_asset_plates (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 asset_id bigint NOT NULL REFERENCES erp_private.fleet_assets(id),
 jurisdiction text NOT NULL CHECK (jurisdiction ~ '^[A-Z0-9]{2,24}$'),
 plate_class text NOT NULL CHECK (plate_class ~ '^[A-Z0-9]{1,24}$'),
 plate_number text NOT NULL CHECK (plate_number ~ '^[A-Z0-9]{1,32}$'),
 valid_from date NOT NULL,
 valid_until date CHECK (valid_until>valid_from),
 reason text NOT NULL,
 recorded_by bigint NOT NULL REFERENCES public.user_profiles(id),
 closed_by bigint REFERENCES public.user_profiles(id),
 close_reason text,
 EXCLUDE USING gist (jurisdiction WITH =, plate_class WITH =, plate_number WITH =,
   daterange(valid_from,valid_until,'[)') WITH &&),
 EXCLUDE USING gist (asset_id WITH =,daterange(valid_from,valid_until,'[)') WITH &&)
);
CREATE INDEX fleet_asset_plate_search ON erp_private.fleet_asset_plates(asset_id,valid_from DESC);

CREATE TABLE erp_private.fleet_asset_meters (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 asset_id bigint NOT NULL REFERENCES erp_private.fleet_assets(id),
 unit text NOT NULL CHECK (unit IN ('km','hours')),
 observed_on date NOT NULL,
 value numeric(14,3) NOT NULL CHECK (value>=0),
 kind text NOT NULL CHECK (kind IN ('opening','correction')),
 replaces_id bigint UNIQUE REFERENCES erp_private.fleet_asset_meters(id),
 source_reference text NOT NULL CHECK (length(btrim(source_reference)) BETWEEN 1 AND 200),
 reason text NOT NULL,
 verified_by bigint NOT NULL REFERENCES public.user_profiles(id),
 verified_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((kind='opening')=(replaces_id IS NULL))
);
CREATE UNIQUE INDEX fleet_meter_one_opening ON erp_private.fleet_asset_meters(asset_id,unit) WHERE kind='opening';
CREATE INDEX fleet_meter_history ON erp_private.fleet_asset_meters(asset_id,unit,id DESC);

-- A detached administrative link must not remove the document's original Fleet access boundary.
-- A verified evidence link is retained for audit and for DMS renewals.
CREATE TABLE erp_private.fleet_document_parents (
 document_id bigint PRIMARY KEY REFERENCES public.dms_documents(id) ON DELETE CASCADE,
 asset_id bigint NOT NULL REFERENCES erp_private.fleet_assets(id),
 bound_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fleet_document_parents_asset ON erp_private.fleet_document_parents(asset_id);

CREATE TABLE erp_private.fleet_asset_evidence (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 asset_id bigint NOT NULL REFERENCES erp_private.fleet_assets(id),
 kind text NOT NULL CHECK (kind IN ('registration','insurance')),
 document_id bigint NOT NULL REFERENCES public.dms_documents(id),
 version_id bigint NOT NULL REFERENCES public.dms_document_versions(id),
 file_id bigint NOT NULL REFERENCES public.dms_document_files(id),
 effective_on date NOT NULL,
 expires_on date NOT NULL CHECK (expires_on>=effective_on),
 facts jsonb NOT NULL CHECK (jsonb_typeof(facts)='object'),
 replaces_id bigint UNIQUE REFERENCES erp_private.fleet_asset_evidence(id),
 verified_by bigint NOT NULL REFERENCES public.user_profiles(id),
 verified_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (asset_id,kind,version_id)
);
CREATE INDEX fleet_asset_evidence_history ON erp_private.fleet_asset_evidence(asset_id,kind,effective_on DESC,id DESC);
CREATE INDEX fleet_asset_evidence_document ON erp_private.fleet_asset_evidence(document_id);

REVOKE ALL ON erp_private.fleet_assets,erp_private.fleet_asset_history,erp_private.fleet_asset_plates,
 erp_private.fleet_asset_meters,erp_private.fleet_document_parents,erp_private.fleet_asset_evidence FROM PUBLIC,anon,authenticated,service_role;

-- Read-only equivalent of the T02 ordinary assignment checks. RLS and GET RPCs
-- need a stable predicate. Mutations use T02's locking check.
CREATE FUNCTION erp_private.t05_scope(p_capability text,p_company bigint,p_branch bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.business_principal_is_active() AND EXISTS (
   SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
   JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions p ON p.id=rp.permission_id
   JOIN public.owner_companies c ON c.id=ur.owner_company_id AND c.status='active'
   JOIN public.branches b ON b.id=p_branch AND b.owner_company_id=c.id
     AND b.status='active' AND b.operating_status='active'
   LEFT JOIN erp_private.t02_role_validity validity ON validity.assignment_id=ur.id
   WHERE ur.user_profile_id=public.current_user_profile_id() AND ur.is_active AND r.is_active AND p.is_active
     AND ur.owner_company_id=p_company AND (ur.branch_id IS NULL OR ur.branch_id=p_branch)
     AND r.role_code NOT IN ('system_admin','group_admin','company_admin','branch_admin')
     AND p.permission_code=p_capability AND (validity.valid_until IS NULL OR validity.valid_until>statement_timestamp())
 );
$$;

CREATE FUNCTION erp_private.t05_asset_readable(p_asset bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(
   SELECT 1 FROM erp_private.fleet_assets a
   LEFT JOIN LATERAL (
     SELECT h.company_id,h.branch_id FROM erp_private.fleet_asset_history h WHERE h.asset_id=a.id AND h.kind='operation'
     ORDER BY h.effective_on DESC,h.id DESC LIMIT 1
   ) op ON true
   WHERE a.id=p_asset AND (erp_private.t05_scope('fleet.assets.view',a.owner_company_id,a.home_branch_id)
       OR (a.status='active' AND erp_private.t05_scope('fleet.assets.view',op.company_id,op.branch_id)))
 );
$$;

CREATE FUNCTION erp_private.t05_document_allowed(p_document bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT EXISTS (
   SELECT 1 FROM erp_private.fleet_document_parents parent
   JOIN erp_private.fleet_assets a ON a.id=parent.asset_id
   JOIN public.dms_documents d ON d.id=parent.document_id
   WHERE parent.document_id=p_document
     AND (NOT erp_private.t05_scope('fleet.assets.view',a.owner_company_id,a.home_branch_id)
          OR ROW(d.owning_company_id,d.owning_branch_id) IS DISTINCT FROM ROW(a.owner_company_id,a.home_branch_id))
 ) AND NOT EXISTS (
   SELECT 1 FROM public.dms_document_links l WHERE l.document_id=p_document AND l.deleted_at IS NULL AND l.entity_type='fleet_asset'
     AND NOT EXISTS (SELECT 1 FROM erp_private.fleet_document_parents parent
         WHERE parent.document_id=l.document_id AND parent.asset_id=l.entity_id)
 );
$$;
CREATE INDEX fleet_canonical_link_document ON public.dms_document_links(document_id,entity_id)
 WHERE entity_type='fleet_asset' AND deleted_at IS NULL;

-- Apply the same parent rule to point reads and the two existing set readers used
-- by All Documents, search, files, tags, link counts and the notification projection.
-- Exact anchors make a changed baseline fail the migration without losing prior gates.
DO $$
DECLARE sig text; anchor text; replacement text; ddl text;
BEGIN
 FOR sig,anchor,replacement IN SELECT * FROM (VALUES
   ('erp_private.document_permission(bigint,text)',
    'IF doc.id IS NULL THEN RETURN false; END IF;',
    'IF doc.id IS NULL OR NOT erp_private.t05_document_allowed(doc.id) THEN RETURN false; END IF;'),
   ('erp_private.read_documents_matching(bigint[],text[],text[],bigint[],text,tsquery)',
    'WHERE actor.uid IS NOT NULL AND actor.active AND d.deleted_at IS NULL',
    'WHERE actor.uid IS NOT NULL AND actor.active AND d.deleted_at IS NULL AND erp_private.t05_document_allowed(d.id)'),
   ('erp_private.visible_dms_association_document_ids(text)',
    'WHERE actor.uid IS NOT NULL AND actor.active AND d.deleted_at IS NULL',
    'WHERE actor.uid IS NOT NULL AND actor.active AND d.deleted_at IS NULL AND erp_private.t05_document_allowed(d.id)')
 ) parts
 LOOP
  ddl:=pg_get_functiondef(sig::regprocedure);
  IF (length(ddl)-length(replace(ddl,anchor,'')))/length(anchor)<>1 THEN
   RAISE EXCEPTION 'Unexpected DMS parent extension point for %',sig;
  END IF;
  EXECUTE replace(ddl,anchor,replacement);
 END LOOP;
END;
$$;

-- Serialize link changes with the existing DMS parent lock. The durable parent
-- table is written only after checking the exact parent, DMS scope and capability.
CREATE FUNCTION erp_private.t05_guard_fleet_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a erp_private.fleet_assets; d public.dms_documents; target bigint; doc_id bigint;
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.entity_type IN ('vehicle','equipment') THEN
     RAISE EXCEPTION 'Select the canonical Fleet asset' USING ERRCODE='22023';
   END IF;
   IF NEW.entity_type<>'fleet_asset' THEN RETURN NEW; END IF;
 ELSIF TG_OP='UPDATE' THEN
   IF NEW.entity_type IN ('vehicle','equipment')
      AND ROW(NEW.entity_type,NEW.entity_id,NEW.document_id) IS DISTINCT FROM ROW(OLD.entity_type,OLD.entity_id,OLD.document_id)
   THEN RAISE EXCEPTION 'Select the canonical Fleet asset' USING ERRCODE='22023'; END IF;
   IF OLD.entity_type<>'fleet_asset' AND NEW.entity_type<>'fleet_asset' THEN RETURN NEW; END IF;
   IF ROW(NEW.entity_type,NEW.entity_id,NEW.document_id) IS DISTINCT FROM ROW(OLD.entity_type,OLD.entity_id,OLD.document_id) THEN
     RAISE EXCEPTION 'Fleet link identity is immutable' USING ERRCODE='22023';
   END IF;
 ELSE
   IF OLD.entity_type<>'fleet_asset' THEN RETURN OLD; END IF;
   RAISE EXCEPTION 'Retain Fleet link history and detach through DMS' USING ERRCODE='42501';
 END IF;

 target:=NEW.entity_id;
 doc_id:=NEW.document_id;
 SELECT * INTO a FROM erp_private.fleet_assets WHERE id=target;
 SELECT * INTO d FROM public.dms_documents WHERE id=doc_id AND deleted_at IS NULL;
 IF a.id IS NULL OR d.id IS NULL OR ROW(a.owner_company_id,a.home_branch_id) IS DISTINCT FROM ROW(d.owning_company_id,d.owning_branch_id)
   OR NOT erp_private.t02_has_scope('fleet.assets.view',a.owner_company_id,a.home_branch_id)
   OR NOT erp_private.t02_has_scope('fleet.assets.documents',a.owner_company_id,a.home_branch_id)
   OR NOT erp_private.document_permission(d.id,'dms.documents.edit') THEN
   RAISE EXCEPTION 'Fleet document or asset unavailable' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND NEW.deleted_at IS NOT NULL AND EXISTS(
     SELECT 1 FROM erp_private.fleet_asset_evidence e WHERE e.document_id=doc_id AND e.asset_id=target
   ) THEN RAISE EXCEPTION 'The verified Fleet evidence link must be retained' USING ERRCODE='PT409'; END IF;
 IF TG_OP='INSERT' AND (a.status='retired' OR NEW.deleted_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Link an active Fleet draft or asset' USING ERRCODE='22023';
 END IF;
 INSERT INTO erp_private.fleet_document_parents(document_id,asset_id) VALUES(doc_id,target) ON CONFLICT(document_id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM erp_private.fleet_document_parents p WHERE p.document_id=doc_id AND p.asset_id=target) THEN
   RAISE EXCEPTION 'Document has a different Fleet parent' USING ERRCODE='PT409';
 END IF;
 NEW.linked_by:=public.current_user_profile_id();
 RETURN NEW;
END;
$$;
CREATE TRIGGER t05_fleet_document_parent BEFORE INSERT OR UPDATE OR DELETE ON public.dms_document_links
 FOR EACH ROW EXECUTE FUNCTION erp_private.t05_guard_fleet_link();

CREATE FUNCTION erp_private.t05_fields(p_data jsonb,p_keys text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_typeof(p_data)='object' AND octet_length(p_data::text)<=32768
   AND p_data-p_keys='{}'::jsonb,false);
$$;

CREATE FUNCTION erp_private.t05_identifier(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$
 SELECT nullif(regexp_replace(upper(btrim(p_text)),'[[:space:]-]','','g'),'');
$$;

CREATE FUNCTION erp_private.t05_coordinates(p_data jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN NOT (p_data ? 'latitude' OR p_data ? 'longitude') THEN true
   WHEN jsonb_typeof(p_data->'latitude')='number' AND jsonb_typeof(p_data->'longitude')='number'
   THEN (p_data->>'latitude')::numeric BETWEEN -90 AND 90 AND (p_data->>'longitude')::numeric BETWEEN -180 AND 180
   ELSE false END;
$$;

CREATE FUNCTION erp_private.t05_configuration(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE axle jsonb; axles jsonb; slots jsonb:='[]'; keys text[]:='{}'; side text; side_count int;
 axle_key text; wheel_ends int:=0; driven_ends int:=0; spare int; position int;
BEGIN
 IF NOT erp_private.t05_fields(p_data,ARRAY['make','model','year','colour','body','fuel','engine_number',
  'gross_kg','tare_kg','payload_kg','length_mm','width_mm','height_mm','capacity','capacity_unit','axles','spares'] )
  OR EXISTS (SELECT 1 FROM jsonb_each(p_data) f WHERE f.key NOT IN ('axles','spares','year','gross_kg','tare_kg','payload_kg',
   'length_mm','width_mm','height_mm','capacity') AND (jsonb_typeof(f.value)<>'string' OR length(f.value#>>'{}')>160))
 THEN RAISE EXCEPTION 'Invalid Fleet specification fields' USING ERRCODE='22023'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_each(p_data) f WHERE f.key IN ('year','gross_kg','tare_kg','payload_kg','length_mm','width_mm','height_mm','capacity')
    AND CASE WHEN jsonb_typeof(f.value)='number' THEN (f.value#>>'{}')::numeric<=0 ELSE true END)
   OR (p_data ? 'year' AND (p_data->>'year' !~ '^[0-9]{4}$' OR (p_data->>'year')::int NOT BETWEEN 1900 AND 2200))
   OR (p_data ? 'capacity') <> (p_data ? 'capacity_unit')
   OR (p_data->>'tare_kg')::numeric>(p_data->>'gross_kg')::numeric
 THEN RAISE EXCEPTION 'Invalid Fleet specification measurements' USING ERRCODE='22023'; END IF;
 axles:=coalesce(p_data->'axles','[]'::jsonb);
 IF jsonb_typeof(axles)<>'array' OR jsonb_array_length(axles)>20
   OR (p_data ? 'spares' AND (jsonb_typeof(p_data->'spares')<>'number' OR p_data->>'spares' !~ '^[0-8]$'))
 THEN RAISE EXCEPTION 'Invalid Fleet axle layout' USING ERRCODE='22023'; END IF;
 spare:=coalesce((p_data->>'spares')::int,0);
 FOR axle IN SELECT value FROM jsonb_array_elements(axles) LOOP
   axle_key:=axle->>'key';
   IF NOT erp_private.t05_fields(axle,ARRAY['key','label','role','steering','driven','liftable','left','right'])
     OR axle_key IS NULL OR axle_key!~'^[a-z][a-z0-9_]{0,31}$' OR axle_key='spare' OR axle_key=ANY(keys)
     OR coalesce(length(btrim(axle->>'label')),0) NOT BETWEEN 1 AND 80
     OR coalesce(axle->>'role','') NOT IN ('steer','drive','tag','lift','trailer','other')
     OR jsonb_typeof(axle->'steering') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(axle->'driven') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(axle->'liftable') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(axle->'left') IS DISTINCT FROM 'number' OR coalesce(axle->>'left','')!~'^[0-2]$'
     OR jsonb_typeof(axle->'right') IS DISTINCT FROM 'number' OR coalesce(axle->>'right','')!~'^[0-2]$'
     OR ((axle->>'left')::int=0 AND (axle->>'right')::int=0)
   THEN RAISE EXCEPTION 'Each axle needs a unique key and valid wheel-end positions' USING ERRCODE='22023'; END IF;
   keys:=array_append(keys,axle_key);
   FOREACH side IN ARRAY ARRAY['left','right'] LOOP
     side_count:=(axle->>side)::int;
     IF side_count>0 THEN
      wheel_ends:=wheel_ends+1;
      IF (axle->>'driven')::boolean THEN driven_ends:=driven_ends+1; END IF;
     END IF;
     FOR position IN 1..side_count LOOP
       slots:=slots||jsonb_build_array(axle_key||':'||side||':'||CASE WHEN position=1 THEN 'outer' ELSE 'inner' END);
     END LOOP;
   END LOOP;
 END LOOP;
 FOR position IN 1..spare LOOP
   slots:=slots||jsonb_build_array('spare:'||position);
 END LOOP;
 RETURN p_data||jsonb_build_object('wheel_ends',wheel_ends,'driven_ends',driven_ends,'tyre_positions',jsonb_array_length(slots),'slots',slots);
END;
$$;

CREATE FUNCTION public.t05_write_fleet_asset(p_operation uuid,p_asset bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a erp_private.fleet_assets; previous erp_private.fleet_asset_history; plate erp_private.fleet_asset_plates;
 meter erp_private.fleet_asset_meters; evidence erp_private.fleet_asset_evidence; d public.dms_documents;
 result jsonb; facts jsonb; hash text; allocation jsonb; actor bigint:=public.current_user_profile_id();
 today date:=(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date;
 effective date; expiry date; company bigint; branch bigint; site bigint; accountable_role bigint; party bigint;
 row_id bigint; version_id bigint; file_id bigint; document_id bigint; kind text; reason text; mode text; type_code text;
 unit text; current_status text; key_list text[];
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('create','ownership','operation','location','configuration','lifecycle','plate','meter','verify-document')
   OR NOT erp_private.t05_fields(p_data,ARRAY['company','branch','site','role','party','name','category','vin','serial',
     'date','reason','facts','mode','revision','status','jurisdiction','plate_class','plate','unit','value','source','replaces',
     'kind','document','version','file','expires'])
 THEN RAISE EXCEPTION 'Invalid Fleet command' USING ERRCODE='22023'; END IF;
 key_list:=CASE p_action
  WHEN 'create' THEN ARRAY['company','branch','name','category','vin','serial']
  WHEN 'ownership' THEN ARRAY['date','reason','revision','company','party','mode']
  WHEN 'operation' THEN ARRAY['date','reason','revision','company','branch','role']
  WHEN 'location' THEN ARRAY['date','reason','revision','company','branch','site','facts']
  WHEN 'configuration' THEN ARRAY['date','reason','revision','facts']
  WHEN 'lifecycle' THEN ARRAY['date','reason','revision','status']
  WHEN 'plate' THEN ARRAY['date','reason','revision','jurisdiction','plate_class','plate']
  WHEN 'meter' THEN ARRAY['date','reason','revision','unit','value','source','replaces']
  ELSE ARRAY['date','reason','revision','kind','document','version','file','expires','facts'] END;
 IF NOT erp_private.t05_fields(p_data,key_list) THEN RAISE EXCEPTION 'Unexpected Fleet command field' USING ERRCODE='22023'; END IF;
 company:=(p_data->>'company')::bigint;
 branch:=(p_data->>'branch')::bigint;
 IF p_action='create' THEN
   IF p_asset IS NOT NULL OR branch IS NULL
     OR NOT erp_private.t02_has_scope('fleet.assets.view',company,branch)
     OR NOT erp_private.t02_has_scope('fleet.assets.manage',company,branch)
   THEN RAISE EXCEPTION 'Fleet asset unavailable' USING ERRCODE='42501'; END IF;
 ELSE
   SELECT * INTO a FROM erp_private.fleet_assets WHERE id=p_asset FOR UPDATE;
   IF a.id IS NULL OR NOT erp_private.t02_has_scope('fleet.assets.view',a.owner_company_id,a.home_branch_id)
     OR NOT erp_private.t02_has_scope(CASE WHEN p_action='verify-document' THEN 'fleet.assets.documents'
       ELSE 'fleet.assets.manage' END,a.owner_company_id,a.home_branch_id)
   THEN RAISE EXCEPTION 'Fleet asset unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 -- Scope all referenced operations before admitting or replaying a change.
 IF p_action IN ('operation','location') AND (branch IS NULL OR NOT erp_private.t02_has_scope('fleet.assets.manage',company,branch))
 THEN RAISE EXCEPTION 'Operating scope unavailable' USING ERRCODE='42501'; END IF;
 IF p_action='ownership' AND company IS NOT NULL AND NOT erp_private.t02_has_scope('fleet.assets.manage',company,
    CASE WHEN company=a.owner_company_id THEN a.home_branch_id ELSE NULL END)
 THEN RAISE EXCEPTION 'Legal owner scope unavailable' USING ERRCODE='42501'; END IF;

 IF p_action='verify-document' THEN
   document_id:=(p_data->>'document')::bigint;
   IF document_id IS NULL OR NOT erp_private.document_permission(document_id,'dms.documents.preview')
     OR NOT EXISTS(SELECT 1 FROM erp_private.fleet_document_parents p WHERE p.document_id=document_id AND p.asset_id=a.id)
   THEN RAISE EXCEPTION 'Fleet evidence unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 hash:=encode(sha256(convert_to(jsonb_build_array(p_asset,p_action,p_data)::text,'UTF8')),'hex');
 result:=erp_private.t02_replay('fleet-asset',p_operation,hash);
 IF result IS NOT NULL THEN
   IF p_action='create' AND NOT erp_private.t05_asset_readable((result->>'id')::bigint)
   THEN RAISE EXCEPTION 'Fleet asset unavailable' USING ERRCODE='42501'; END IF;
   RETURN result;
 END IF;
 IF p_action='create' THEN
   IF coalesce(length(btrim(p_data->>'name')),0) NOT BETWEEN 1 AND 160
     OR coalesce(p_data->>'category','') NOT IN ('truck','trailer','equipment','light_vehicle')
     OR (p_data ? 'vin' AND coalesce(erp_private.t05_identifier(p_data->>'vin'),'')!~'^[A-HJ-NPR-Z0-9]{17}$')
     OR (p_data ? 'serial' AND coalesce(erp_private.t05_identifier(p_data->>'serial'),'')!~'^[A-Z0-9]{3,80}$')
   THEN RAISE EXCEPTION 'Enter a valid Fleet name, class, VIN or serial' USING ERRCODE='22023'; END IF;
   row_id:=nextval(pg_get_serial_sequence('erp_private.fleet_assets','id')::regclass);
   allocation:=erp_private.numbering_allocate(NULL,'FLEET_ASSET_LIFETIME',NULL,p_operation,actor,'consumed','fleet_assets',row_id,
      'T05 Fleet asset '||hash,now());
   INSERT INTO erp_private.fleet_assets(id,asset_no,owner_company_id,home_branch_id,category,name,vin,serial,created_by)
     OVERRIDING SYSTEM VALUE VALUES(row_id,allocation->>'generated_reference_number',company,branch,p_data->>'category',
       btrim(p_data->>'name'),erp_private.t05_identifier(p_data->>'vin'),erp_private.t05_identifier(p_data->>'serial'),actor)
     RETURNING * INTO a;
 ELSE
   IF (p_data->>'revision')::int IS DISTINCT FROM a.revision THEN
     RAISE EXCEPTION 'Fleet record changed; refresh before saving' USING ERRCODE='PT409';
   END IF;
   IF a.status='retired' AND NOT (p_action='plate' AND NOT (p_data ? 'plate')) THEN
     RAISE EXCEPTION 'Retired asset history is retained' USING ERRCODE='PT409';
   END IF;
   effective:=(p_data->>'date')::date;
   reason:=btrim(p_data->>'reason');
   IF effective IS NULL OR effective<'1900-01-01' OR (p_action<>'verify-document' AND effective>today)
       OR coalesce(length(reason),0) NOT BETWEEN 1 AND 500
   THEN RAISE EXCEPTION 'A valid effective date and reason are required' USING ERRCODE='22023'; END IF;
   facts:=coalesce(p_data->'facts','{}'::jsonb);
   IF p_action IN ('ownership','operation','location','configuration','lifecycle') THEN
     SELECT * INTO previous FROM erp_private.fleet_asset_history h WHERE h.asset_id=a.id AND h.kind=p_action
       ORDER BY effective_on DESC,id DESC LIMIT 1;
     IF effective<previous.effective_on THEN RAISE EXCEPTION 'A later dated fact already exists' USING ERRCODE='PT409'; END IF;
     IF p_action='ownership' THEN
       mode:=p_data->>'mode'; party:=(p_data->>'party')::bigint;
       IF coalesce(mode,'') NOT IN ('owned','third_party','rental','unknown')
         OR (mode='owned' AND (company IS NULL OR party IS NOT NULL))
         OR (mode IN ('third_party','rental') AND (company IS NOT NULL OR party IS NULL))
         OR (mode='unknown' AND (company IS NOT NULL OR party IS NOT NULL OR a.status='active'))
         OR (party IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.parties p WHERE p.id=party AND p.is_active
             AND erp_private.permission_in_scope('parties.view',a.owner_company_id,a.home_branch_id)))
       THEN RAISE EXCEPTION 'Select one verified legal owner or record unknown ownership in draft' USING ERRCODE='22023'; END IF;
       facts:=jsonb_build_object('mode',mode);
     ELSIF p_action='operation' THEN
       accountable_role:=(p_data->>'role')::bigint;
       IF NOT EXISTS(SELECT 1 FROM public.roles r JOIN public.user_roles ur ON ur.role_id=r.id
         LEFT JOIN erp_private.t02_role_validity validity ON validity.assignment_id=ur.id
         WHERE r.id=accountable_role AND r.is_active AND ur.is_active AND ur.owner_company_id=company
           AND (ur.branch_id IS NULL OR ur.branch_id=branch)
           AND (validity.valid_until IS NULL OR validity.valid_until>statement_timestamp())
           AND r.role_code NOT IN ('system_admin','group_admin','company_admin','branch_admin'))
       THEN RAISE EXCEPTION 'Select an assigned operating role' USING ERRCODE='22023'; END IF;
     ELSIF p_action='location' THEN
       site:=(p_data->>'site')::bigint;
       IF NOT erp_private.t05_fields(facts,ARRAY['latitude','longitude','label']) OR NOT erp_private.t05_coordinates(facts)
         OR coalesce(length(facts->>'label'),0)>160
         OR (site IS NULL AND coalesce(length(btrim(facts->>'label')),0)=0)
         OR (site IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.work_sites s
           WHERE s.id=site AND s.deleted_at IS NULL AND s.status='active'
             AND ((s.owner_company_id=company AND (s.branch_id IS NULL OR s.branch_id=branch))
              OR (s.available_to_all_organizations AND s.owner_company_id IS NULL AND s.branch_id IS NULL))))
       THEN RAISE EXCEPTION 'Select a valid site or enter a reported location' USING ERRCODE='22023'; END IF;
     ELSIF p_action='configuration' THEN
       facts:=erp_private.t05_configuration(facts);
     ELSE
       current_status:=p_data->>'status';
       IF coalesce(current_status,'') NOT IN ('active','retired') OR a.status=current_status
        OR (current_status='active' AND (coalesce(a.vin,a.serial) IS NULL OR NOT EXISTS(
          SELECT 1 FROM (SELECT h.facts,h.effective_on FROM erp_private.fleet_asset_history h WHERE h.asset_id=a.id AND h.kind='ownership'
            ORDER BY effective_on DESC,id DESC LIMIT 1) owner WHERE owner.facts->>'mode'<>'unknown' AND owner.effective_on<=effective)))
       THEN RAISE EXCEPTION 'Activation requires verified asset identity and legal ownership' USING ERRCODE='22023'; END IF;
       facts:=jsonb_build_object('status',current_status);
       UPDATE erp_private.fleet_assets SET status=current_status WHERE id=a.id;
     END IF;
     INSERT INTO erp_private.fleet_asset_history(asset_id,kind,effective_on,company_id,branch_id,site_id,role_id,party_id,facts,reason,recorded_by)
      VALUES(a.id,p_action,effective,company,branch,site,accountable_role,party,facts,reason,actor) RETURNING id INTO row_id;
   ELSIF p_action='plate' THEN
     SELECT * INTO plate FROM erp_private.fleet_asset_plates WHERE asset_id=a.id AND valid_until IS NULL;
     IF plate.id IS NOT NULL THEN
       IF effective<=plate.valid_from THEN RAISE EXCEPTION 'Plate release must follow its recorded start' USING ERRCODE='PT409'; END IF;
       UPDATE erp_private.fleet_asset_plates SET valid_until=effective,closed_by=actor,close_reason=reason WHERE id=plate.id;
       row_id:=plate.id;
     END IF;
     IF p_data ? 'plate' THEN
       INSERT INTO erp_private.fleet_asset_plates(asset_id,jurisdiction,plate_class,plate_number,valid_from,reason,recorded_by)
       VALUES(a.id,erp_private.t05_identifier(p_data->>'jurisdiction'),erp_private.t05_identifier(p_data->>'plate_class'),
         erp_private.t05_identifier(p_data->>'plate'),effective,reason,actor) RETURNING id INTO row_id;
     ELSIF row_id IS NULL THEN RAISE EXCEPTION 'There is no plate to release' USING ERRCODE='22023'; END IF;
   ELSIF p_action='meter' THEN
     unit:=p_data->>'unit';
     IF jsonb_typeof(p_data->'value') IS DISTINCT FROM 'number' OR coalesce(length(btrim(p_data->>'source')),0) NOT BETWEEN 1 AND 200
       OR (p_data->>'value')::numeric<>round((p_data->>'value')::numeric,3)
     THEN RAISE EXCEPTION 'Enter a verified meter reading and source' USING ERRCODE='22023'; END IF;
     SELECT * INTO meter FROM erp_private.fleet_asset_meters m WHERE m.asset_id=a.id AND m.unit=unit ORDER BY id DESC LIMIT 1;
     IF (p_data->>'replaces')::bigint IS DISTINCT FROM meter.id OR (meter.id IS NOT NULL AND effective<>meter.observed_on) THEN
       RAISE EXCEPTION 'A correction must identify the latest opening reading and its observation date' USING ERRCODE='PT409';
     END IF;
     INSERT INTO erp_private.fleet_asset_meters(asset_id,unit,observed_on,value,kind,replaces_id,source_reference,reason,verified_by)
       VALUES (a.id,unit,effective,(p_data->>'value')::numeric,CASE WHEN meter.id IS NULL THEN 'opening' ELSE 'correction' END,
         meter.id,btrim(p_data->>'source'),reason,actor) RETURNING id INTO row_id;
   ELSE
     version_id:=(p_data->>'version')::bigint; file_id:=(p_data->>'file')::bigint;
     expiry:=(p_data->>'expires')::date; kind:=p_data->>'kind';
     SELECT * INTO d FROM public.dms_documents WHERE id=document_id AND deleted_at IS NULL FOR SHARE;
     SELECT t.type_code INTO type_code FROM public.dms_document_types t WHERE t.id=d.document_type_id AND t.deleted_at IS NULL;
     IF d.id IS NULL OR d.is_archived OR d.status<>'active' OR d.current_version_id IS DISTINCT FROM version_id
        OR d.issue_date IS DISTINCT FROM effective OR d.expiry_date IS DISTINCT FROM expiry
        OR NOT erp_private.document_permission(d.id,'dms.documents.preview')
        OR NOT EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.entity_type='fleet_asset'
          AND l.entity_id=a.id AND l.deleted_at IS NULL FOR SHARE)
        OR NOT EXISTS(SELECT 1 FROM public.dms_document_versions v JOIN public.dms_document_files f ON f.version_id=v.id
          AND f.document_id=v.document_id WHERE v.id=version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
          AND f.id=file_id AND f.file_role='original' AND f.deleted_at IS NULL FOR SHARE OF v,f)
     THEN RAISE EXCEPTION 'Select the exact active DMS proof, original file and verified dates' USING ERRCODE='PT409'; END IF;
     IF NOT erp_private.t05_fields(facts,CASE kind
       WHEN 'registration' THEN ARRAY['jurisdiction','plate_class','plate','traffic_code','registered_owner','owner_nationality',
          'authority','issued_at','authority_reference','barcode','vehicle_category']
       WHEN 'insurance' THEN ARRAY['insurer','policy_number','coverage','insured_party'] ELSE ARRAY[]::text[] END)
       OR EXISTS (SELECT 1 FROM jsonb_each(facts) f WHERE jsonb_typeof(f.value)<>'string' OR length(f.value#>>'{}') NOT BETWEEN 1 AND 200)
       OR NOT coalesce(CASE kind WHEN 'registration' THEN type_code IN ('VEHICLE_REGISTRATION','MULKIYA','EQUIPMENT_REGISTRATION')
                  WHEN 'insurance' THEN type_code IN ('VEHICLE_INSURANCE','INSURANCE_POLICY') END,false)
     THEN RAISE EXCEPTION 'The document type does not match the verified Fleet facts' USING ERRCODE='22023'; END IF;
     SELECT * INTO evidence FROM erp_private.fleet_asset_evidence e WHERE e.asset_id=a.id AND e.kind=kind
       ORDER BY e.effective_on DESC,e.id DESC LIMIT 1;
     IF evidence.id IS NOT NULL AND effective<evidence.effective_on THEN
       RAISE EXCEPTION 'Renewed evidence cannot predate the current evidence' USING ERRCODE='PT409';
     END IF;
     INSERT INTO erp_private.fleet_asset_evidence(asset_id,kind,document_id,version_id,file_id,effective_on,expires_on,facts,replaces_id,verified_by)
       VALUES (a.id,kind,d.id,version_id,file_id,effective,expiry,facts,evidence.id,actor) RETURNING id INTO row_id;
   END IF;
   UPDATE erp_private.fleet_assets SET revision=revision+1 WHERE id=a.id RETURNING * INTO a;
 END IF;
 RETURN erp_private.t02_save_receipt('fleet-asset',p_operation,hash,jsonb_build_object('id',a.id,'asset_no',a.asset_no,
   'revision',a.revision,'status',a.status,'event_id',row_id));
END;
$$;

REVOKE ALL ON FUNCTION erp_private.t05_scope(text,bigint,bigint),erp_private.t05_asset_readable(bigint),
 erp_private.t05_document_allowed(bigint),erp_private.t05_guard_fleet_link(),erp_private.t05_fields(jsonb,text[]),
 erp_private.t05_identifier(text),erp_private.t05_coordinates(jsonb),erp_private.t05_configuration(jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.t05_write_fleet_asset(uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t05_write_fleet_asset(uuid,bigint,text,jsonb) TO authenticated;

-- Scope choices are built from currently valid company/branch assignments.
CREATE FUNCTION public.t05_fleet_asset_choices(p_company bigint DEFAULT NULL,p_branch bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH writable AS MATERIALIZED (
   SELECT b.id,b.owner_company_id,b.branch_name_en,c.legal_name_en
   FROM public.branches b JOIN public.owner_companies c ON c.id=b.owner_company_id
   WHERE erp_private.t05_scope('fleet.assets.view',c.id,b.id)
     AND erp_private.t05_scope('fleet.assets.manage',c.id,b.id)
 )
 SELECT jsonb_build_object(
   'scopes',coalesce((SELECT jsonb_agg(jsonb_build_object('company',w.owner_company_id,'branch',w.id,
     'label',concat(w.legal_name_en,' / ',w.branch_name_en)) ORDER BY w.legal_name_en,w.branch_name_en,w.id) FROM writable w),'[]'),
   'sites',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'label',s.site_name) ORDER BY s.site_name,s.id)
     FROM public.work_sites s
     WHERE s.deleted_at IS NULL AND s.status='active' AND EXISTS(
       SELECT 1 FROM writable w WHERE w.id=p_branch AND w.owner_company_id=p_company)
     AND ((s.owner_company_id=p_company AND (s.branch_id IS NULL OR s.branch_id=p_branch))
       OR (s.available_to_all_organizations AND s.owner_company_id IS NULL AND s.branch_id IS NULL))),'[]'),
   'roles',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'label',r.role_name) ORDER BY r.role_name,r.id)
     FROM public.roles r WHERE r.is_active AND r.role_code NOT IN ('system_admin','group_admin','company_admin','branch_admin')
     AND EXISTS(SELECT 1 FROM writable w WHERE w.id=p_branch AND w.owner_company_id=p_company)
     AND EXISTS(SELECT 1 FROM public.user_roles ur LEFT JOIN erp_private.t02_role_validity v ON v.assignment_id=ur.id
       WHERE ur.role_id=r.id AND ur.is_active AND ur.owner_company_id=p_company
       AND (ur.branch_id IS NULL OR ur.branch_id=p_branch) AND (v.valid_until IS NULL OR v.valid_until>statement_timestamp()))),'[]')
 );
$$;

CREATE FUNCTION public.t05_search_fleet_assets(p_query text DEFAULT NULL,p_limit integer DEFAULT 50,
 p_offset integer DEFAULT 0,p_link_picker boolean DEFAULT false,p_asset bigint DEFAULT NULL)
RETURNS TABLE(id bigint,asset_no text,name text,category text,status text,plate text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT a.id,a.asset_no,a.name,a.category,a.status,current_plate.plate_number
 FROM erp_private.fleet_assets a
 LEFT JOIN LATERAL (SELECT p.plate_number FROM erp_private.fleet_asset_plates p WHERE p.asset_id=a.id AND p.valid_until IS NULL) current_plate ON true
 WHERE (p_asset IS NULL OR a.id=p_asset)
   AND coalesce(length(p_query),0)<=200
   AND CASE WHEN p_link_picker THEN a.status<>'retired'
      AND erp_private.t05_scope('fleet.assets.view',a.owner_company_id,a.home_branch_id)
      AND erp_private.t05_scope('fleet.assets.documents',a.owner_company_id,a.home_branch_id)
    ELSE erp_private.t05_asset_readable(a.id) END
   AND (nullif(btrim(p_query),'') IS NULL OR strpos(lower(a.name),lower(btrim(p_query)))>0
     OR strpos(erp_private.t05_identifier(a.asset_no),erp_private.t05_identifier(p_query))>0
     OR strpos(a.vin,erp_private.t05_identifier(p_query))>0 OR strpos(a.serial,erp_private.t05_identifier(p_query))>0
     OR EXISTS(SELECT 1 FROM erp_private.fleet_asset_plates p WHERE p.asset_id=a.id
       AND strpos(p.plate_number,erp_private.t05_identifier(p_query))>0))
 ORDER BY a.asset_no,a.id
 LIMIT greatest(1,least(p_limit,51)) OFFSET greatest(p_offset,0);
$$;

CREATE FUNCTION public.t05_read_fleet_asset(p_asset bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a erp_private.fleet_assets; home_access boolean; can_link boolean;
BEGIN
 SELECT * INTO a FROM erp_private.fleet_assets WHERE id=p_asset;
 IF a.id IS NULL OR NOT erp_private.t05_asset_readable(a.id) THEN RETURN NULL; END IF;
 home_access:=erp_private.t05_scope('fleet.assets.view',a.owner_company_id,a.home_branch_id);
 can_link:=home_access AND erp_private.t05_scope('fleet.assets.documents',a.owner_company_id,a.home_branch_id);
 RETURN jsonb_build_object('id',a.id,'asset_no',a.asset_no,'name',a.name,'category',a.category,'status',a.status,
   'vin',a.vin,'serial',a.serial,'company',a.owner_company_id,'branch',a.home_branch_id,'revision',a.revision,
   'can_manage',home_access AND erp_private.t05_scope('fleet.assets.manage',a.owner_company_id,a.home_branch_id),
   'can_link',can_link,'can_see_documents',home_access,
   'history',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.effective_on DESC,h.id DESC),'[]')
     FROM erp_private.fleet_asset_history h WHERE h.asset_id=a.id AND (home_access OR h.kind IN ('configuration','lifecycle')
       OR (h.kind IN ('operation','location') AND erp_private.t05_scope('fleet.assets.view',h.company_id,h.branch_id)))),
   'plates',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.valid_from DESC,p.id DESC),'[]')
     FROM erp_private.fleet_asset_plates p WHERE p.asset_id=a.id),
   'meters',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.unit,m.id DESC),'[]')
     FROM erp_private.fleet_asset_meters m WHERE m.asset_id=a.id),
   'evidence',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.kind,e.effective_on DESC,e.id DESC),'[]')
     FROM erp_private.fleet_asset_evidence e WHERE e.asset_id=a.id AND home_access
       AND erp_private.document_permission(e.document_id,'dms.documents.preview')),
   'proof_choices',(SELECT coalesce(jsonb_agg(jsonb_build_object('document',d.id,'version',v.id,'file',f.id,'label',d.document_no||' · '||d.title,
       'date',d.issue_date,'expires',d.expiry_date,'kind',CASE WHEN t.type_code IN ('VEHICLE_INSURANCE','INSURANCE_POLICY') THEN 'insurance' ELSE 'registration' END)
       ORDER BY d.issue_date DESC,d.id,f.id),'[]')
     FROM public.dms_document_links l JOIN public.dms_documents d ON d.id=l.document_id
     JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.deleted_at IS NULL
     JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
     JOIN public.dms_document_files f ON f.document_id=d.id AND f.version_id=v.id AND f.file_role='original' AND f.deleted_at IS NULL
     WHERE l.entity_type='fleet_asset' AND l.entity_id=a.id AND l.deleted_at IS NULL
       AND can_link AND a.status<>'retired' AND d.status='active' AND d.deleted_at IS NULL AND NOT d.is_archived
       AND d.issue_date IS NOT NULL AND d.expiry_date>=d.issue_date
       AND t.type_code IN ('VEHICLE_REGISTRATION','MULKIYA','EQUIPMENT_REGISTRATION','VEHICLE_INSURANCE','INSURANCE_POLICY')
       AND erp_private.document_permission(d.id,'dms.documents.preview'))
 );
END;
$$;

REVOKE ALL ON FUNCTION public.t05_fleet_asset_choices(bigint,bigint),public.t05_search_fleet_assets(text,integer,integer,boolean,bigint),
 public.t05_read_fleet_asset(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t05_fleet_asset_choices(bigint,bigint),public.t05_search_fleet_assets(text,integer,integer,boolean,bigint),
 public.t05_read_fleet_asset(bigint) TO authenticated;

COMMIT;
