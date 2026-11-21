BEGIN;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('supply.setup','Configure supply catalogue and ask for pilot acceptance','inventory','setup','held'),
 ('supply.approve','Independently accept supply routing and stock adjustments','inventory','approve','held'),
 ('supply.stock','Book scoped Inventory quantities','inventory','stock','held'),
 ('supply.request','Request material against an exact Workshop job or fuel voucher','inventory','request','held'),
 ('supply.purchase','Prepare purchases and record physical receipts','procurement','purchase','held'),
 ('supply.purchase.approve','Independently approve purchase and goods decisions','procurement','approve','held'),
 ('supply.fuel','Record manual fuel evidence against a Fleet asset','fleet','fuel','held'),
 ('supply.value','Verify Inventory valuation evidence as Finance','finance','supply_value','held');

CREATE TABLE erp_private.t11_owners (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint NOT NULL REFERENCES public.branches(id),
 code text NOT NULL,
 party_id bigint REFERENCES public.parties(id),
 UNIQUE(company_id,branch_id,code)
);
CREATE TABLE erp_private.t11_units (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 code text NOT NULL,
 decimal_places integer NOT NULL CHECK(decimal_places BETWEEN 0 AND 3),
 UNIQUE(company_id,code)
);
CREATE TABLE erp_private.t11_items (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 code text NOT NULL,
 name text NOT NULL,
 unit_id bigint NOT NULL REFERENCES erp_private.t11_units(id),
 kind text NOT NULL CHECK(kind IN('part','fuel')),
 trace text NOT NULL CHECK(trace IN('none','lot','serial')),
 UNIQUE(company_id,code)
);
CREATE TABLE erp_private.t11_bins (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint NOT NULL REFERENCES public.branches(id),
 site_id bigint NOT NULL REFERENCES public.work_sites(id),
 store text NOT NULL,
 code text NOT NULL,
 kind text NOT NULL CHECK(kind IN('available','quarantine')),
 UNIQUE(site_id,store,code)
);
CREATE INDEX t11_bins_branch ON erp_private.t11_bins(company_id,branch_id,id);

CREATE TABLE erp_private.t11_policies (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint NOT NULL REFERENCES public.branches(id),
 domain text NOT NULL CHECK(domain IN('stock','purchasing')),
 owner_profile bigint NOT NULL REFERENCES public.user_profiles(id),
 proposed_by bigint NOT NULL REFERENCES public.user_profiles(id),
 reason text NOT NULL,
 decision text CHECK(decision IN('accepted','suspended')),
 decided_at timestamptz,
 decided_by bigint REFERENCES public.user_profiles(id),
 decision_reason text,
 CHECK(decided_at IS NULL OR (decided_by=owner_profile AND decided_by<>proposed_by AND decision IS NOT NULL))
);
CREATE INDEX t11_policy_scope ON erp_private.t11_policies(company_id,branch_id,domain,id DESC);

CREATE TABLE erp_private.t11_serials (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 item_id bigint NOT NULL REFERENCES erp_private.t11_items(id),
 serial text NOT NULL,
 UNIQUE(item_id,serial)
);

-- Each receipt has its own quantity layer. Transfers retain the originating valuation and
-- create a distinct destination layer so reverse movements cannot consume unrelated stock.
CREATE TABLE erp_private.t11_layers (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 item_id bigint NOT NULL REFERENCES erp_private.t11_items(id),
 owner_id bigint NOT NULL REFERENCES erp_private.t11_owners(id),
 bin_id bigint NOT NULL REFERENCES erp_private.t11_bins(id),
 lot text,
 serial_id bigint REFERENCES erp_private.t11_serials(id),
 finance_root bigint REFERENCES erp_private.t11_layers(id),
 count_root bigint REFERENCES erp_private.t11_layers(id),
 is_opening boolean NOT NULL DEFAULT false,
 on_hand numeric(16,3) NOT NULL DEFAULT 0 CHECK(on_hand>=0),
 reserved numeric(16,3) NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=on_hand),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 CHECK(serial_id IS NULL OR (on_hand IN(0,1) AND reserved IN(0,1)))
);
CREATE UNIQUE INDEX t11_serial_single_custody ON erp_private.t11_layers(serial_id) WHERE serial_id IS NOT NULL AND on_hand>0;
CREATE UNIQUE INDEX t11_opening_identity ON erp_private.t11_layers(bin_id,item_id,owner_id,coalesce(lot,''),coalesce(serial_id,0))
 WHERE is_opening;
CREATE INDEX t11_layers_count_root ON erp_private.t11_layers(count_root,id) WHERE count_root IS NOT NULL;
CREATE INDEX t11_layers_bin ON erp_private.t11_layers(bin_id,id DESC);

CREATE TABLE erp_private.t11_values (
 layer_id bigint PRIMARY KEY REFERENCES erp_private.t11_layers(id),
 unit_cost numeric(16,4) NOT NULL CHECK(unit_cost>=0),
 currency text NOT NULL,
 finance_ref text NOT NULL,
 verified_by bigint NOT NULL REFERENCES public.user_profiles(id),
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE erp_private.t11_fuel_vouchers (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 asset_id bigint NOT NULL REFERENCES erp_private.fleet_assets(id),
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint NOT NULL REFERENCES public.branches(id),
 source_kind text NOT NULL CHECK(source_kind IN('station','card','tank','tanker')),
 supplier_id bigint REFERENCES public.parties(id),
 source_ref text NOT NULL,
 source_bin bigint REFERENCES erp_private.t11_bins(id),
 source_item bigint REFERENCES erp_private.t11_items(id),
 source_owner bigint REFERENCES erp_private.t11_owners(id),
 reference text NOT NULL,
 occurred_at timestamptz NOT NULL,
 litres numeric(16,3) NOT NULL CHECK(litres>0),
 meter_unit text NOT NULL CHECK(meter_unit IN('km','hours')),
 meter_value numeric(16,3) NOT NULL CHECK(meter_value>=0),
 document_id bigint NOT NULL UNIQUE REFERENCES public.dms_documents(id),
 version_id bigint NOT NULL REFERENCES public.dms_document_versions(id),
 file_id bigint NOT NULL REFERENCES public.dms_document_files(id),
 reported_by bigint NOT NULL REFERENCES public.user_profiles(id),
 accepted_by bigint REFERENCES public.user_profiles(id),
 accepted_at timestamptz,
 reason text NOT NULL,
 UNIQUE(company_id,source_kind,reference),
 CHECK(CASE WHEN source_kind IN('tank','tanker') THEN num_nonnulls(source_bin,source_item,source_owner)=3
       ELSE num_nonnulls(source_bin,source_item,source_owner)=0 END),
 CHECK(accepted_at IS NULL OR accepted_by<>reported_by)
);
CREATE INDEX t11_fuel_asset ON erp_private.t11_fuel_vouchers(asset_id,id DESC);
CREATE INDEX t11_fuel_file ON erp_private.t11_fuel_vouchers(file_id);
CREATE INDEX t11_fuel_version ON erp_private.t11_fuel_vouchers(version_id);

CREATE FUNCTION erp_private.t11_scope(p_cap text,p_company bigint,p_branch bigint) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF p_company IS NULL OR p_branch IS NULL OR NOT erp_private.t02_has_scope(p_cap,p_company,p_branch) THEN
  RAISE EXCEPTION 'Supply action unavailable in this scope' USING ERRCODE='42501';
 END IF;
END $$;

CREATE FUNCTION erp_private.t11_pilot(p_company bigint,p_branch bigint,p_domain text) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE rule erp_private.t11_policies;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('supply-setup:'||p_company,0));
 SELECT * INTO rule FROM erp_private.t11_policies p WHERE p.company_id=p_company AND p.branch_id=p_branch
  AND p.domain=p_domain AND p.decided_at IS NOT NULL ORDER BY p.id DESC LIMIT 1 FOR SHARE;
 IF rule.decision IS DISTINCT FROM 'accepted' THEN
  RAISE EXCEPTION 'Record the named owner and approval route before booking %',p_domain USING ERRCODE='PT409';
 END IF;
 PERFORM 1 FROM public.user_profiles p WHERE p.id=rule.owner_profile AND p.status='active' AND NOT p.must_change_password FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Confirm an active owner for %',p_domain USING ERRCODE='PT409'; END IF;
END $$;

CREATE FUNCTION erp_private.t11_key(p_data jsonb,p_key text,p_length integer DEFAULT 100) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT upper(erp_private.t10_text(p_data,p_key,p_length));
$$;

CREATE FUNCTION erp_private.t11_quantity(p_data jsonb,p_key text,p_places integer,p_zero boolean DEFAULT false) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE qty numeric:=(p_data->>p_key)::numeric;
BEGIN
 IF jsonb_typeof(p_data->p_key) IS DISTINCT FROM 'number' OR qty<0 OR (NOT p_zero AND qty=0)
  OR qty>=1e12 OR qty<>round(qty,p_places) THEN
  RAISE EXCEPTION 'Enter a valid % to % decimal places',p_key,p_places USING ERRCODE='22023';
 END IF;
 RETURN qty;
END $$;

CREATE FUNCTION erp_private.t11_party(p_party bigint,p_company bigint,p_branch bigint) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p_party IS NOT NULL AND erp_private.t07_party_allowed(p_party,p_company,p_branch);
$$;

CREATE FUNCTION erp_private.t11_new_layer(p_item bigint,p_owner bigint,p_bin bigint,p_lot text,p_serial text,p_opening boolean)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item erp_private.t11_items; serial_key bigint; layer bigint;
BEGIN
 SELECT * INTO item FROM erp_private.t11_items WHERE id=p_item;
 IF item.id IS NULL OR coalesce(length(p_lot),0)>150 OR coalesce(length(p_serial),0)>150 OR (item.trace='lot')<>(p_lot IS NOT NULL) OR (item.trace='serial')<>(p_serial IS NOT NULL) THEN
  RAISE EXCEPTION 'Supply the lot or serial specified by the item catalogue' USING ERRCODE='22023';
 END IF;
 IF p_serial IS NOT NULL THEN
  INSERT INTO erp_private.t11_serials(item_id,serial) VALUES(item.id,p_serial) ON CONFLICT DO NOTHING RETURNING id INTO serial_key;
  IF serial_key IS NULL THEN RAISE EXCEPTION 'This serial already has a retained stock identity' USING ERRCODE='PT409'; END IF;
 END IF;
 INSERT INTO erp_private.t11_layers(item_id,owner_id,bin_id,lot,serial_id,is_opening)
 VALUES(p_item,p_owner,p_bin,p_lot,serial_key,p_opening) RETURNING id INTO layer;
 RETURN layer;
END $$;

CREATE FUNCTION public.t11_supply_setup(p_operation uuid,p_branch bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE branch public.branches; rule erp_private.t11_policies; unit erp_private.t11_units;
 actor bigint:=public.current_user_profile_id(); identity bigint; party bigint; code text; label text; domain_name text;
 keys text[]; digest text; saved jsonb; location bigint; note text;
BEGIN
 keys:=CASE p_action WHEN 'owner' THEN ARRAY['code','party']
 WHEN 'unit' THEN ARRAY['code','decimals'] WHEN 'item' THEN ARRAY['code','name','unit','kind','trace']
 WHEN 'bin' THEN ARRAY['code','site','store','kind'] WHEN 'propose' THEN ARRAY['domain','owner']
 WHEN 'decide' THEN ARRAY['policy','decision'] END;
 IF keys IS NULL OR NOT erp_private.t05_fields(p_data,keys||ARRAY['reason']) THEN
  RAISE EXCEPTION 'Choose a valid supply setup action' USING ERRCODE='22023'; END IF;
 SELECT * INTO branch FROM public.branches WHERE id=p_branch;
 PERFORM erp_private.t11_scope(CASE WHEN p_action='decide' THEN 'supply.approve' ELSE 'supply.setup' END,branch.owner_company_id,branch.id);
 -- Company-wide catalogue identity. A branch setup grant governs its sites, policy and stock-owner group only.
 IF p_action IN('unit','item') AND NOT erp_private.t02_has_scope('supply.setup',branch.owner_company_id,NULL) THEN
  RAISE EXCEPTION 'Company catalogue authority is required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('supply-setup:'||branch.owner_company_id,0));
 note:=erp_private.t10_text(p_data,'reason',1000);
 digest:=erp_private.t02_digest(jsonb_build_array(branch.id,p_action,p_data));
 saved:=erp_private.t02_replay('t11-setup',p_operation,digest);
 IF saved IS NOT NULL THEN RETURN saved; END IF;
 IF p_action IN('owner','unit','item','bin') THEN code:=erp_private.t11_key(p_data,'code',50); END IF;
 IF p_action='owner' THEN
  party:=(p_data->>'party')::bigint;
  IF party IS NOT NULL AND NOT erp_private.t11_party(party,branch.owner_company_id,branch.id) THEN
   RAISE EXCEPTION 'Third-party stock owner is unavailable' USING ERRCODE='42501'; END IF;
  INSERT INTO erp_private.t11_owners(company_id,branch_id,code,party_id)
  VALUES(branch.owner_company_id,branch.id,code,party) RETURNING id INTO identity;
 ELSIF p_action='unit' THEN
  INSERT INTO erp_private.t11_units(company_id,code,decimal_places)
  VALUES(branch.owner_company_id,code,erp_private.t11_quantity(p_data,'decimals',0,true)) RETURNING id INTO identity;
 ELSIF p_action='item' THEN
  SELECT * INTO unit FROM erp_private.t11_units WHERE id=(p_data->>'unit')::bigint AND company_id=branch.owner_company_id;
  IF unit.id IS NULL OR (p_data->>'kind'='fuel' AND (unit.code<>'L' OR p_data->>'trace'='serial'))
   OR (p_data->>'trace'='serial' AND unit.decimal_places<>0) THEN
   RAISE EXCEPTION 'Use the company unit, litres for fuel, or a whole unit for serialised stock' USING ERRCODE='22023'; END IF;
  label:=erp_private.t10_text(p_data,'name',160);
  INSERT INTO erp_private.t11_items(company_id,code,name,unit_id,kind,trace)
  VALUES(branch.owner_company_id,code,label,unit.id,p_data->>'kind',p_data->>'trace') RETURNING id INTO identity;
 ELSIF p_action='bin' THEN
  location:=(p_data->>'site')::bigint;
  IF NOT erp_private.t06_site_allowed(location,branch.owner_company_id,branch.id,current_date,current_date) THEN
   RAISE EXCEPTION 'Choose a site available in the receiving branch' USING ERRCODE='42501'; END IF;
  INSERT INTO erp_private.t11_bins(company_id,branch_id,site_id,store,code,kind)
  VALUES(branch.owner_company_id,branch.id,location,erp_private.t11_key(p_data,'store',50),code,p_data->>'kind') RETURNING id INTO identity;
 ELSIF p_action='propose' THEN
  domain_name:=p_data->>'domain';
  IF NOT EXISTS(SELECT 1 FROM public.user_profiles o WHERE o.id=(p_data->>'owner')::bigint AND o.status='active' AND o.id<>actor) THEN
   RAISE EXCEPTION 'Name a different active business owner' USING ERRCODE='PT409'; END IF;
  INSERT INTO erp_private.t11_policies(company_id,branch_id,domain,owner_profile,proposed_by,reason)
  VALUES(branch.owner_company_id,branch.id,domain_name,(p_data->>'owner')::bigint,actor,note) RETURNING id INTO identity;
 ELSE
  SELECT * INTO rule FROM erp_private.t11_policies WHERE id=(p_data->>'policy')::bigint AND branch_id=branch.id FOR UPDATE;
  IF rule.id IS NULL OR rule.owner_profile<>actor OR rule.proposed_by=actor OR rule.decided_at IS NOT NULL
    OR coalesce(p_data->>'decision','') NOT IN('accepted','suspended')
    OR EXISTS(SELECT 1 FROM erp_private.t11_policies newer WHERE newer.branch_id=rule.branch_id AND newer.domain=rule.domain
      AND newer.decided_at IS NOT NULL AND newer.id>rule.id) THEN
   RAISE EXCEPTION 'Only the named independent owner can decide the current proposal' USING ERRCODE='PT409'; END IF;
  UPDATE erp_private.t11_policies SET decision=p_data->>'decision',decided_at=clock_timestamp(),decided_by=actor,decision_reason=note
  WHERE id=rule.id RETURNING id INTO identity;
 END IF;
 RETURN erp_private.t02_save_receipt('t11-setup',p_operation,digest,jsonb_build_object('id',identity));
END $$;

DO $$
DECLARE table_name text;
BEGIN
 FOR table_name IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='erp_private' AND c.relkind='r' AND c.relname LIKE 't11_%' LOOP
  EXECUTE format('ALTER TABLE erp_private.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON erp_private.%I FROM PUBLIC,anon,authenticated,service_role',table_name);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION erp_private.t11_scope(text,bigint,bigint),erp_private.t11_pilot(bigint,bigint,text),
 erp_private.t11_key(jsonb,text,integer),erp_private.t11_quantity(jsonb,text,integer,boolean),erp_private.t11_party(bigint,bigint,bigint),
 erp_private.t11_new_layer(bigint,bigint,bigint,text,text,boolean),public.t11_supply_setup(uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t11_supply_setup(uuid,bigint,text,jsonb) TO authenticated;
COMMIT;
