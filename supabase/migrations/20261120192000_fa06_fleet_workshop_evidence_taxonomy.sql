BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- FLEET is the existing DMS category from the foundation seed. Schema-only
-- installations can lack its row. Keep existing catalogued settings intact.
INSERT INTO public.dms_document_categories(category_code,name_en,name_ar,sort_order,is_system,is_active)
VALUES ('FLEET','Fleet & Vehicles','الأسطول والمركبات',6,true,true)
ON CONFLICT (category_code) DO NOTHING;

-- The T06–T12 evidence checks already accept these exact type codes. The
-- original documents are linked only to canonical Fleet assets. Ownership
-- and branch continue to come from the asset's current home scope and the
-- existing upload/link permissions, independently of the report or work site.
INSERT INTO public.dms_document_types(
  type_code,name_en,category_id,default_confidentiality,allowed_entity_types
)
SELECT evidence.code,evidence.name,c.id,'internal',ARRAY['fleet_asset']
FROM public.dms_document_categories c
CROSS JOIN (VALUES
  ('FLEET_CUSTODY_ACK','Custody acknowledgement'),
  ('FLEET_TRIP_ORDER','Signed Trip Order'),
  ('FLEET_PRE_TRIP_INSPECTION','Pre-trip inspection'),
  ('FLEET_SIGNED_POD','Signed proof of delivery'),
  ('FLEET_WEIGH_TICKET','Weigh ticket'),
  ('FLEET_SIGNED_RENTAL_SHEET','Signed rental timesheet'),
  ('FLEET_RENTAL_NOTICE','Rental milestone notice'),
  ('FLEET_RENTAL_AGREEMENT','Signed rental agreement'),
  ('FLEET_WORKSHOP_FINDING','Workshop finding evidence'),
  ('FLEET_WORKSHOP_RETURN','Workshop return original'),
  ('FLEET_CUSTOMER_DELIVERY_CONFIRMATION','Customer delivery confirmation'),
  ('FLEET_DESTINATION_SITE_RECEIPT','Destination site receipt'),
  ('FLEET_FUEL_VOUCHER','Fuel voucher'),
  ('FLEET_WORKSHOP_LABOUR','Signed Workshop labour sheet'),
  ('FLEET_WORKSHOP_OUTSIDE_HANDOVER','External Workshop handover'),
  ('FLEET_WORKSHOP_OUTSIDE_SERVICE','External Workshop service evidence'),
  ('FLEET_WORKSHOP_OUTSIDE_RETURN','External Workshop return')
) evidence(code,name)
WHERE c.category_code='FLEET' AND c.is_active AND c.deleted_at IS NULL
ON CONFLICT (type_code) DO NOTHING;

COMMIT;
