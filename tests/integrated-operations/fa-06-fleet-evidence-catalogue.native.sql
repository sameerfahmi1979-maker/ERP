\set ON_ERROR_STOP on
BEGIN READ ONLY;
DO $$
DECLARE missing text[];
BEGIN
 IF current_database()<>'fa06_evidence_429'
   OR current_setting('cron.launch_active_jobs')<>'off'
   OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
       IS DISTINCT FROM 'ERP FA-06 v429 synthetic evidence'
 THEN RAISE EXCEPTION 'Expected isolated FA-06 evidence clone'; END IF;

 SELECT array_agg(expected.code ORDER BY expected.code) INTO missing
 FROM (VALUES
  ('FLEET_CUSTODY_ACK'),('FLEET_TRIP_ORDER'),('FLEET_PRE_TRIP_INSPECTION'),
  ('FLEET_SIGNED_POD'),('FLEET_WEIGH_TICKET'),('FLEET_SIGNED_RENTAL_SHEET'),
  ('FLEET_RENTAL_NOTICE'),('FLEET_RENTAL_AGREEMENT'),('FLEET_WORKSHOP_FINDING'),
  ('FLEET_WORKSHOP_RETURN'),('FLEET_CUSTOMER_DELIVERY_CONFIRMATION'),('FLEET_DESTINATION_SITE_RECEIPT'),
  ('FLEET_FUEL_VOUCHER'),('FLEET_WORKSHOP_LABOUR'),('FLEET_WORKSHOP_OUTSIDE_HANDOVER'),
  ('FLEET_WORKSHOP_OUTSIDE_SERVICE'),('FLEET_WORKSHOP_OUTSIDE_RETURN')
 ) expected(code)
 WHERE NOT EXISTS (
  SELECT 1 FROM public.dms_document_types t JOIN public.dms_document_categories c ON c.id=t.category_id
  WHERE t.type_code=expected.code AND c.category_code='FLEET' AND c.is_active AND c.deleted_at IS NULL
    AND t.is_active AND t.deleted_at IS NULL AND t.is_system
    AND t.allowed_entity_types=ARRAY['fleet_asset']
    AND t.default_confidentiality='internal'
    AND NOT t.requires_expiry_tracking AND NOT t.requires_approval
    AND t.default_retention_days IS NULL
 );
 IF missing IS NOT NULL THEN RAISE EXCEPTION 'Canonical Fleet evidence types unavailable: %',missing; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dms_document_types t JOIN public.dms_document_categories c ON c.id=t.category_id
  WHERE t.type_code='FLEET_SIGNED_INTERNAL_SHEET' AND t.is_active AND c.category_code='FLEET_TIME_EVIDENCE')
 THEN RAISE EXCEPTION 'Existing internal Fleet timesheet definition was changed'; END IF;
END
$$;
ROLLBACK;
\echo fa-06-fleet-evidence-catalogue.native.sql PASS
