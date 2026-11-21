BEGIN;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('fleet.operations.view','Read scoped Fleet operations','fleet','operations_view','held'),
 ('fleet.operations.manage','Record Fleet trip and rental operations','fleet','operations_manage','held'),
 ('fleet.operations.approve','Authorize or reopen Fleet operations','fleet','operations_approve','held'),
 ('fleet.operations.commercial','Review Fleet commercial authorizations','fleet','operations_commercial','held');

INSERT INTO public.global_numbering_rules(rule_code,rule_name,module_code,module_name,document_type_code,document_type_name,
 document_prefix,format_template,sequence_length,reset_policy,reserve_on_draft,allow_manual_override,cancelled_number_policy,duplicate_prevention_scope)
VALUES ('FLEET_OPERATION','Fleet operation reference','fleet','Fleet','FLEET_OPERATION','Fleet operation',
 'FOP','{DOC}-{SEQ6}',6,'never',true,false,'never_reuse','global');

CREATE TABLE erp_private.fleet_operation_orders (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_no text NOT NULL UNIQUE,
 kind text NOT NULL CHECK(kind IN('trip','rental')),
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint NOT NULL REFERENCES public.branches(id),
 site_id bigint NOT NULL REFERENCES public.work_sites(id),
 customer_id bigint REFERENCES public.parties(id),
 supplier_id bigint REFERENCES public.parties(id),
 rental_mode text CHECK(rental_mode IN('wet','dry')),
 request_reference text NOT NULL,
 subject text NOT NULL,
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','authorized','active','review','completed','cancelled')),
 revision integer NOT NULL DEFAULT 1,
 raised_by bigint NOT NULL REFERENCES public.user_profiles(id),
 raised_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 authorized_by bigint REFERENCES public.user_profiles(id),
 authorization_reference text,
 authorized_at timestamptz,
 CHECK ((kind='trip' AND rental_mode IS NULL AND supplier_id IS NULL)
   OR (kind='rental' AND rental_mode IS NOT NULL AND customer_id IS NOT NULL)),
 CHECK ((authorized_by IS NULL)=(authorized_at IS NULL) AND (authorized_by IS NULL OR authorized_by<>raised_by))
);
CREATE INDEX fleet_ops_order_scope ON erp_private.fleet_operation_orders(company_id,branch_id,id DESC);

CREATE TABLE erp_private.fleet_operation_assignments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id bigint NOT NULL REFERENCES erp_private.fleet_operation_orders(id),
 slot integer NOT NULL CHECK(slot BETWEEN 1 AND 50),
 supersedes_id bigint UNIQUE REFERENCES erp_private.fleet_operation_assignments(id),
 reservation_id bigint NOT NULL UNIQUE REFERENCES erp_private.fleet_commitments(id),
 actual_commitment_id bigint UNIQUE REFERENCES erp_private.fleet_commitments(id),
 asset_id bigint NOT NULL REFERENCES erp_private.fleet_assets(id),
 worker_id bigint NOT NULL REFERENCES public.employees(id),
 employment_id bigint NOT NULL REFERENCES erp_private.t03_employment_periods(id),
 employer_company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 employer_branch_id bigint NOT NULL REFERENCES public.branches(id),
 host_company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 host_branch_id bigint NOT NULL REFERENCES public.branches(id),
 site_id bigint NOT NULL REFERENCES public.work_sites(id),
 planned_period tstzrange NOT NULL,
 state text NOT NULL DEFAULT 'planned' CHECK(state IN('planned','active','closed','replaced','cancelled')),
 inspected_at timestamptz,
 handover_approved_by bigint REFERENCES public.user_profiles(id),
 inspection_passed boolean,
 planned_by bigint NOT NULL REFERENCES public.user_profiles(id),
 reason text NOT NULL,
 CHECK ((actual_commitment_id IS NOT NULL)=(state IN('active','closed') OR (state='replaced' AND actual_commitment_id IS NOT NULL))),
 EXCLUDE USING gist(order_id WITH =,slot WITH =,planned_period WITH &&) WHERE(state IN('planned','active'))
);
CREATE INDEX fleet_ops_assignments_order ON erp_private.fleet_operation_assignments(order_id,id);

CREATE TABLE erp_private.fleet_trip_legs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id bigint NOT NULL REFERENCES erp_private.fleet_operation_orders(id),
 sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 50),
 planned_origin bigint NOT NULL REFERENCES public.work_sites(id),
 planned_destination bigint NOT NULL REFERENCES public.work_sites(id),
 planned_load text NOT NULL CHECK(planned_load IN('loaded','empty')),
 planned_cargo text,
 UNIQUE(order_id,sequence),
 CHECK(planned_origin<>planned_destination)
);

CREATE TABLE erp_private.fleet_operation_evidence (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id bigint NOT NULL REFERENCES erp_private.fleet_operation_orders(id),
 assignment_id bigint REFERENCES erp_private.fleet_operation_assignments(id),
 purpose text NOT NULL CHECK(purpose IN('trip-order','pre-trip','pod','weigh','rental-handover','rental-return',
  'rental-sheet','rental-commercial','agreement')),
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 paper_reference text NOT NULL,
 document_id bigint NOT NULL REFERENCES public.dms_documents(id),
 version_id bigint NOT NULL REFERENCES public.dms_document_versions(id),
 file_id bigint NOT NULL REFERENCES public.dms_document_files(id),
 recorded_by bigint NOT NULL REFERENCES public.user_profiles(id),
 recorded_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 UNIQUE(purpose,document_id,version_id)
);
CREATE UNIQUE INDEX fleet_evidence_unique_paper ON erp_private.fleet_operation_evidence(company_id,purpose,paper_reference)
 WHERE purpose<>'rental-sheet';
CREATE TABLE erp_private.fleet_rental_sheet_references (
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 paper_reference text NOT NULL,
 order_id bigint NOT NULL REFERENCES erp_private.fleet_operation_orders(id),
 document_id bigint NOT NULL REFERENCES public.dms_documents(id),
 PRIMARY KEY(company_id,paper_reference)
);
CREATE INDEX fleet_ops_evidence_document ON erp_private.fleet_operation_evidence(document_id);

CREATE TABLE erp_private.fleet_trip_leg_actuals (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 leg_id bigint NOT NULL UNIQUE REFERENCES erp_private.fleet_trip_legs(id),
 assignment_id bigint NOT NULL REFERENCES erp_private.fleet_operation_assignments(id),
 origin bigint NOT NULL REFERENCES public.work_sites(id),
 destination bigint NOT NULL REFERENCES public.work_sites(id),
 departed_at timestamptz NOT NULL,
 arrived_at timestamptz NOT NULL CHECK(arrived_at>departed_at),
 load text NOT NULL CHECK(load IN('loaded','empty')),
 cargo text,
 gross_kg numeric(14,3),
 tare_kg numeric(14,3),
 net_kg numeric(14,3) GENERATED ALWAYS AS (gross_kg-tare_kg) STORED,
 weigh_evidence_id bigint REFERENCES erp_private.fleet_operation_evidence(id),
 discrepancies text,
 CHECK(origin<>destination AND (gross_kg IS NULL)=(tare_kg IS NULL)
   AND (gross_kg IS NULL)=(weigh_evidence_id IS NULL) AND (gross_kg IS NULL OR (tare_kg>0 AND gross_kg>=tare_kg)))
);

CREATE TABLE erp_private.fleet_trip_delivery_facts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actual_id bigint NOT NULL REFERENCES erp_private.fleet_trip_leg_actuals(id),
 state text NOT NULL CHECK(state IN('missing','accepted','partial','disputed','not-required')),
 evidence_id bigint UNIQUE REFERENCES erp_private.fleet_operation_evidence(id),
 reason text,
 recorded_by bigint NOT NULL REFERENCES public.user_profiles(id),
 recorded_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 CHECK ((state IN('accepted','partial') AND evidence_id IS NOT NULL) OR state IN('missing','disputed','not-required'))
);

CREATE TABLE erp_private.fleet_trip_paper_orders (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id bigint NOT NULL REFERENCES erp_private.fleet_operation_orders(id),
 issue_no text NOT NULL UNIQUE,
 issue_revision integer NOT NULL,
 snapshot jsonb NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 issued_by bigint NOT NULL REFERENCES public.user_profiles(id),
 pdf_bytes bytea,
 pdf_sha256 text,
 CHECK((pdf_bytes IS NULL AND pdf_sha256 IS NULL) OR
       (pdf_bytes IS NOT NULL AND pdf_sha256 IS NOT NULL AND pdf_sha256=encode(extensions.digest(pdf_bytes,'sha256'),'hex'))),
 UNIQUE(order_id,issue_revision)
);

CREATE TABLE erp_private.fleet_rental_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id bigint NOT NULL REFERENCES erp_private.fleet_operation_orders(id),
 assignment_id bigint REFERENCES erp_private.fleet_operation_assignments(id),
 kind text NOT NULL CHECK(kind IN('handover','return','off-hire','customer-start','customer-stop','supplier-start','supplier-stop',
  'technical-clearance','claim','extension')),
 occurred_at timestamptz NOT NULL CHECK(isfinite(occurred_at)),
 evidence_id bigint REFERENCES erp_private.fleet_operation_evidence(id),
 reason text NOT NULL,
 recorded_by bigint NOT NULL REFERENCES public.user_profiles(id)
);
CREATE UNIQUE INDEX fleet_rental_clock_transition ON erp_private.fleet_rental_events(order_id,kind)
 WHERE kind IN('customer-start','customer-stop','supplier-start','supplier-stop');
CREATE INDEX fleet_rental_events_order ON erp_private.fleet_rental_events(order_id,id);

CREATE TABLE erp_private.fleet_rental_usage (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id bigint NOT NULL REFERENCES erp_private.fleet_operation_orders(id),
 assignment_id bigint NOT NULL REFERENCES erp_private.fleet_operation_assignments(id),
 evidence_id bigint NOT NULL REFERENCES erp_private.fleet_operation_evidence(id),
 work_period tstzrange NOT NULL CHECK (NOT isempty(work_period) AND NOT lower_inf(work_period) AND NOT upper_inf(work_period)),
 state text NOT NULL CHECK(state IN('signed','disputed','missing')),
 reason text,
 EXCLUDE USING gist(assignment_id WITH =,work_period WITH &&)
);

CREATE TABLE erp_private.fleet_ops_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id bigint NOT NULL REFERENCES erp_private.fleet_operation_orders(id),
 action text NOT NULL,
 entity_id bigint,
 action_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 reason text NOT NULL
);

CREATE TABLE erp_private.fleet_rental_usage_resolutions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 usage_id bigint NOT NULL REFERENCES erp_private.fleet_rental_usage(id),
 evidence_id bigint NOT NULL REFERENCES erp_private.fleet_operation_evidence(id),
 reason text NOT NULL,
 resolved_by bigint NOT NULL REFERENCES public.user_profiles(id),
 resolved_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE INDEX fleet_rental_usage_resolution_latest ON erp_private.fleet_rental_usage_resolutions(usage_id,id DESC);
CREATE INDEX fleet_ops_audit_order ON erp_private.fleet_ops_audit(order_id,id DESC);

-- Only the owning order command can transition protected resources. The
-- transaction-local row is private and disappears before the command returns.
CREATE TABLE erp_private.fleet_ops_owned_commitments (
 commitment_id bigint PRIMARY KEY REFERENCES erp_private.fleet_commitments(id),
 order_id bigint NOT NULL REFERENCES erp_private.fleet_operation_orders(id)
);
CREATE TABLE erp_private.fleet_ops_transition (
 tx bigint NOT NULL,
 commitment_id bigint NOT NULL REFERENCES erp_private.fleet_commitments(id),
 PRIMARY KEY(tx,commitment_id)
);

CREATE FUNCTION erp_private.t07_guard_commitment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM erp_private.fleet_ops_owned_commitments own WHERE own.commitment_id=OLD.id)
    AND NOT EXISTS(SELECT 1 FROM erp_private.fleet_ops_transition a WHERE a.tx=txid_current() AND a.commitment_id=OLD.id)
 THEN RAISE EXCEPTION 'Use the owning Fleet operation to transition this commitment' USING ERRCODE='PT409'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER t07_guard_owned_commitment BEFORE UPDATE OR DELETE ON erp_private.fleet_commitments
 FOR EACH ROW EXECUTE FUNCTION erp_private.t07_guard_commitment();

CREATE FUNCTION erp_private.t07_rental_checkout_authorized(p_asset bigint,p_commitment bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM erp_private.fleet_ops_transition authz
   JOIN erp_private.fleet_ops_owned_commitments own USING(commitment_id)
   JOIN erp_private.fleet_operation_orders o ON o.id=own.order_id
   JOIN erp_private.fleet_operation_assignments a ON a.order_id=o.id AND a.reservation_id=own.commitment_id
   WHERE authz.tx=txid_current() AND authz.commitment_id=p_commitment AND a.asset_id=p_asset
     AND a.state='planned' AND a.handover_approved_by IS NOT NULL
     AND ROW(a.host_company_id,a.host_branch_id)=ROW(a.employer_company_id,a.employer_branch_id)
     AND o.kind='rental' AND o.authorized_at IS NOT NULL AND o.status IN('authorized','active','review'));
$$;

DO $$
DECLARE ddl text:=pg_get_functiondef('public.t06_fleet_command(uuid,bigint,text,jsonb)'::regprocedure);
 anchor constant text:='AND needed_approval AND loan.id IS NULL';
BEGIN
 IF (length(ddl)-length(replace(ddl,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Unexpected custody approval boundary'; END IF;
 EXECUTE replace(ddl,anchor,anchor||' AND NOT (p_action=''checkout'' AND erp_private.t07_rental_checkout_authorized(a.id,target))');
END;
$$;

CREATE FUNCTION erp_private.t07_retain_document_links() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.entity_type='fleet_asset' AND OLD.deleted_at IS NULL AND (TG_OP='DELETE' OR NEW.deleted_at IS NOT NULL)
 AND EXISTS(SELECT 1 FROM erp_private.fleet_operation_evidence ev WHERE ev.document_id=OLD.document_id)
 THEN RAISE EXCEPTION 'Retain the verified Fleet operation evidence link' USING ERRCODE='PT409'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER t07_keep_fleet_evidence BEFORE UPDATE OF deleted_at OR DELETE ON public.dms_document_links
 FOR EACH ROW EXECUTE FUNCTION erp_private.t07_retain_document_links();

CREATE FUNCTION erp_private.t07_retain_evidence_original() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='dms_document_files' THEN
   IF (TG_OP='DELETE' OR ROW(NEW.document_id,NEW.version_id,NEW.deleted_at,NEW.file_role,NEW.sha256_hash,
          NEW.file_size_bytes,NEW.storage_bucket,NEW.storage_path) IS DISTINCT FROM
        ROW(OLD.document_id,OLD.version_id,OLD.deleted_at,OLD.file_role,OLD.sha256_hash,
          OLD.file_size_bytes,OLD.storage_bucket,OLD.storage_path))
     AND EXISTS(SELECT 1 FROM erp_private.fleet_operation_evidence ev WHERE ev.file_id=OLD.id)
   THEN RAISE EXCEPTION 'Retain the exact signed Fleet original' USING ERRCODE='PT409'; END IF;
 ELSE
   IF (TG_OP='DELETE' OR ROW(NEW.document_id,NEW.unlinked_at) IS DISTINCT FROM ROW(OLD.document_id,OLD.unlinked_at))
     AND EXISTS(SELECT 1 FROM erp_private.fleet_operation_evidence ev WHERE ev.version_id=OLD.id)
   THEN RAISE EXCEPTION 'Retain the signed Fleet evidence version' USING ERRCODE='PT409'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE INDEX fleet_operation_evidence_original ON erp_private.fleet_operation_evidence(file_id);
CREATE INDEX fleet_operation_evidence_version ON erp_private.fleet_operation_evidence(version_id);
CREATE TRIGGER t07_keep_signed_fleet_original BEFORE UPDATE OF document_id,version_id,deleted_at,file_role,sha256_hash,
 file_size_bytes,storage_bucket,storage_path OR DELETE ON public.dms_document_files
 FOR EACH ROW EXECUTE FUNCTION erp_private.t07_retain_evidence_original();
CREATE TRIGGER t07_keep_signed_fleet_version BEFORE UPDATE OF document_id,unlinked_at OR DELETE ON public.dms_document_versions
 FOR EACH ROW EXECUTE FUNCTION erp_private.t07_retain_evidence_original();

DO $$
DECLARE relation regclass;
BEGIN
 FOREACH relation IN ARRAY ARRAY[
  'erp_private.fleet_operation_orders'::regclass,'erp_private.fleet_operation_assignments','erp_private.fleet_trip_legs',
  'erp_private.fleet_trip_leg_actuals','erp_private.fleet_trip_delivery_facts','erp_private.fleet_trip_paper_orders',
  'erp_private.fleet_operation_evidence','erp_private.fleet_rental_events','erp_private.fleet_rental_usage',
  'erp_private.fleet_ops_audit','erp_private.fleet_ops_owned_commitments','erp_private.fleet_ops_transition',
  'erp_private.fleet_rental_usage_resolutions','erp_private.fleet_rental_sheet_references'
 ] LOOP
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('REVOKE ALL ON %s FROM PUBLIC,anon,authenticated,service_role',relation);
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.t07_guard_commitment(),erp_private.t07_rental_checkout_authorized(bigint,bigint),
 erp_private.t07_retain_document_links(),erp_private.t07_retain_evidence_original() FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
