-- Existing reference metadata is stored as reviewed text, not as a foreign-key
-- grant or an automatic link. Keep the same representation on approval retry:
-- changing it would invalidate the retained request's context fingerprint.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION erp_private.f07_metadata_column(p_type text)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT CASE p_type
  WHEN 'number' THEN 'value_number' WHEN 'currency' THEN 'value_number'
  WHEN 'boolean' THEN 'value_boolean' WHEN 'date' THEN 'value_date'
  WHEN 'datetime' THEN 'value_datetime'
  WHEN 'json' THEN 'value_json' WHEN 'multiselect' THEN 'value_json'
  WHEN 'multi_select' THEN 'value_json'
  WHEN 'text' THEN 'value_text' WHEN 'textarea' THEN 'value_text'
  WHEN 'select' THEN 'value_text' WHEN 'email' THEN 'value_text'
  WHEN 'url' THEN 'value_text' WHEN 'phone' THEN 'value_text'
  WHEN 'party_ref' THEN 'value_text' WHEN 'employee_ref' THEN 'value_text'
  WHEN 'vehicle_ref' THEN 'value_text' WHEN 'equipment_ref' THEN 'value_text'
  WHEN 'project_ref' THEN 'value_text' WHEN 'country_ref' THEN 'value_text'
  WHEN 'region_ref' THEN 'value_text' WHEN 'city_ref' THEN 'value_text'
  WHEN 'area_ref' THEN 'value_text'
 END
$$;

-- CREATE OR REPLACE retains the existing owner and ACL. Do not grant access,
-- change RLS, rewrite metadata, or replay a retained business operation here.
COMMIT;
