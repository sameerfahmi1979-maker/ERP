BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('fleet.allowance.rates.prepare','Prepare directional trip allowance rates','fleet','manage','held'),
 ('fleet.allowance.rates.approve','Independently approve directional trip allowance rates','fleet','approve','held'),
 ('fleet.allowance.submit','Submit proof of delivery exceptions and allowance corrections','fleet','manage','held'),
 ('fleet.allowance.approve','Independently decide allowance evidence and rate exceptions','fleet','approve','held'),
 ('hr.payroll.trip_allowance.review','Review verified trip allowances for payroll','hr','review','held');

CREATE TABLE erp_private.t09_rates (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 origin_id bigint NOT NULL REFERENCES public.work_sites(id),
 destination_id bigint NOT NULL REFERENCES public.work_sites(id),
 truck_type text NOT NULL CHECK(length(truck_type) BETWEEN 1 AND 120),
 effective_from date NOT NULL CHECK(isfinite(effective_from)),
 effective_until date CHECK(effective_until>effective_from AND isfinite(effective_until)),
 amount numeric(14,2) NOT NULL CHECK(amount>0),
 currency text NOT NULL CHECK(currency~'^[A-Z]{3}$'),
 prepared_by bigint NOT NULL REFERENCES public.user_profiles(id),
 prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 approved_by bigint REFERENCES public.user_profiles(id),
 approved_at timestamptz,
 reason text NOT NULL,
 approval_reason text,
 CHECK(origin_id<>destination_id),
 CHECK((approved_by IS NULL)=(approved_at IS NULL) AND approved_by IS DISTINCT FROM prepared_by)
);
CREATE UNIQUE INDEX t09_one_rate_version ON erp_private.t09_rates(company_id,origin_id,destination_id,truck_type,effective_from DESC)
 WHERE approved_at IS NOT NULL;
CREATE INDEX t09_rate_catalogue ON erp_private.t09_rates(company_id,id DESC);

CREATE TABLE erp_private.t09_assignment_rates (
 assignment_id bigint NOT NULL REFERENCES erp_private.fleet_operation_assignments(id),
 leg_id bigint NOT NULL REFERENCES erp_private.fleet_trip_legs(id),
 quote_day date NOT NULL,
 origin_id bigint NOT NULL REFERENCES public.work_sites(id),
 destination_id bigint NOT NULL REFERENCES public.work_sites(id),
 configuration_id bigint REFERENCES erp_private.fleet_asset_history(id),
 truck_type text,
 rate_id bigint REFERENCES erp_private.t09_rates(id),
 PRIMARY KEY(assignment_id,leg_id)
);

CREATE FUNCTION erp_private.t09_truck_type(p_body text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT nullif(lower(regexp_replace(btrim(p_body),'[[:space:]]+',' ','g')),'');
$$;

CREATE FUNCTION erp_private.t09_configuration(p_asset bigint,p_at timestamptz)
RETURNS TABLE(id bigint, truck_type text) LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT h.id,erp_private.t09_truck_type(h.facts->>'body') FROM erp_private.fleet_asset_history h
 JOIN erp_private.fleet_assets f ON f.id=h.asset_id AND f.category='truck'
 WHERE h.asset_id=p_asset AND h.kind='configuration' AND h.effective_on<=(p_at AT TIME ZONE 'Asia/Dubai')::date
   AND h.recorded_at<=statement_timestamp()
 ORDER BY h.effective_on DESC,h.id DESC LIMIT 1;
$$;

CREATE FUNCTION erp_private.t09_rate_at(p_company bigint,p_origin bigint,p_destination bigint,p_type text,p_day date)
RETURNS erp_private.t09_rates LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT active.* FROM (
   SELECT r.* FROM erp_private.t09_rates r WHERE r.company_id=p_company AND r.origin_id=p_origin AND r.destination_id=p_destination
    AND r.truck_type=p_type AND r.approved_at IS NOT NULL AND r.effective_from<=p_day
   ORDER BY r.effective_from DESC LIMIT 1
 ) active WHERE active.effective_until IS NULL OR active.effective_until>p_day;
$$;

CREATE FUNCTION erp_private.t09_capture_assignment_rate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE quote_day date:=(lower(NEW.planned_period) AT TIME ZONE 'Asia/Dubai')::date;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM erp_private.fleet_assets asset WHERE asset.id=NEW.asset_id AND asset.category='truck')
 THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('t09-rate-company:'||NEW.host_company_id,0));
 INSERT INTO erp_private.t09_assignment_rates(assignment_id,leg_id,quote_day,origin_id,destination_id,configuration_id,truck_type,rate_id)
 SELECT NEW.id,l.id,quote_day,l.planned_origin,l.planned_destination,conf.id,conf.truck_type,rate.id
 FROM erp_private.fleet_trip_legs l
 LEFT JOIN LATERAL erp_private.t09_configuration(NEW.asset_id,lower(NEW.planned_period)) conf ON true
 LEFT JOIN LATERAL erp_private.t09_rate_at(NEW.host_company_id,l.planned_origin,l.planned_destination,conf.truck_type,quote_day) rate ON true
 WHERE l.order_id=NEW.order_id AND l.planned_load='loaded';
 RETURN NEW;
END;
$$;
CREATE TRIGGER t09_capture_assignment_rate AFTER INSERT ON erp_private.fleet_operation_assignments
 FOR EACH ROW EXECUTE FUNCTION erp_private.t09_capture_assignment_rate();

CREATE FUNCTION public.t09_save_allowance_rate(p_operation uuid,p_company bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint:=public.current_user_profile_id(); cap text; hash text; receipt jsonb; entry erp_private.t09_rates;
 chosen bigint; decision_note text; rate numeric; truck text; unit text;
BEGIN
 cap:=CASE p_action WHEN 'prepare' THEN 'fleet.allowance.rates.prepare' WHEN 'approve' THEN 'fleet.allowance.rates.approve' END;
 IF cap IS NULL OR NOT erp_private.t05_fields(p_data,ARRAY['id','origin','destination','truck_type','from','until','amount','currency','reason'])
 THEN RAISE EXCEPTION 'Invalid rate action' USING ERRCODE='22023'; END IF;
 IF NOT erp_private.t02_has_scope(cap,p_company,NULL)
 THEN RAISE EXCEPTION 'Company-wide allowance rate authority is required' USING ERRCODE='42501'; END IF;
 decision_note:=erp_private.t07_text(p_data,'reason',500);
 hash:=erp_private.t02_digest(jsonb_build_array(p_company,p_action,p_data));
 receipt:=erp_private.t02_replay('fleet-allowance-rate',p_operation,hash);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;
 IF p_action='prepare' THEN
   rate:=(p_data->>'amount')::numeric; truck:=erp_private.t09_truck_type(p_data->>'truck_type'); unit:=upper(p_data->>'currency');
   IF rate IS NULL OR rate<=0 OR rate>999999999999.99 OR rate<>round(rate,2)
     OR NOT EXISTS(SELECT 1 FROM public.currencies c WHERE c.currency_code=unit AND c.is_active AND c.decimal_places=2)
     OR NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.owner_company_id=p_company AND b.status='active'
          AND erp_private.t06_site_allowed((p_data->>'origin')::bigint,p_company,b.id,(p_data->>'from')::date,(p_data->>'from')::date)
          AND erp_private.t06_site_allowed((p_data->>'destination')::bigint,p_company,b.id,(p_data->>'from')::date,(p_data->>'from')::date))
     OR truck IS NULL OR length(truck)>120
   THEN RAISE EXCEPTION 'Choose a valid directed route, configured two-decimal currency, truck type and positive amount' USING ERRCODE='22023'; END IF;
   INSERT INTO erp_private.t09_rates(company_id,origin_id,destination_id,truck_type,effective_from,effective_until,amount,currency,prepared_by,reason)
   VALUES(p_company,(p_data->>'origin')::bigint,(p_data->>'destination')::bigint,truck,(p_data->>'from')::date,
          (p_data->>'until')::date,rate,unit,actor,decision_note) RETURNING id INTO chosen;
 ELSE
   PERFORM pg_advisory_xact_lock(hashtextextended('t09-rate-company:'||p_company,0));
   SELECT * INTO entry FROM erp_private.t09_rates WHERE id=(p_data->>'id')::bigint AND company_id=p_company FOR UPDATE;
   IF entry.id IS NULL OR entry.prepared_by=actor OR entry.approved_at IS NOT NULL
   THEN RAISE EXCEPTION 'An independent review of the prepared rate is required' USING ERRCODE='PT409'; END IF;
   UPDATE erp_private.t09_rates SET approved_by=actor,approved_at=clock_timestamp(),approval_reason=decision_note WHERE id=entry.id;
   chosen:=entry.id;
 END IF;
 RETURN erp_private.t02_save_receipt('fleet-allowance-rate',p_operation,hash,jsonb_build_object('id',chosen,'action',p_action));
EXCEPTION WHEN unique_violation THEN
 RAISE EXCEPTION 'An approved rate already starts on this date for this direction and truck type' USING ERRCODE='PT409';
END;
$$;

ALTER TABLE erp_private.t09_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t09_assignment_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t09_rates,erp_private.t09_assignment_rates FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.t09_truck_type(text),erp_private.t09_configuration(bigint,timestamptz),erp_private.t09_rate_at(bigint,bigint,bigint,text,date),
 erp_private.t09_capture_assignment_rate(),public.t09_save_allowance_rate(uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t09_save_allowance_rate(uuid,bigint,text,jsonb) TO authenticated;
COMMIT;
