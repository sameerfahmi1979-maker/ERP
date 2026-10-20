BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
-- Keep the existing ordinary-RLS numbered creation, immutable original payload,
-- source proofs and completion/receipt checks. Repair only the training input
-- projection to the actual table; never reinterpret an issue date as completion.
DO $repair$
DECLARE definition text;needle text;replacement text;
BEGIN
 SELECT pg_get_functiondef('erp_private.validate_document_employee_input(jsonb,jsonb)'::regprocedure) INTO STRICT definition;
 needle:='v_allowed:=v_allowed||array[''training_type_id'',''training_category_id'',''provider'',''certificate_number''];';
 replacement:='v_allowed:=array_remove(array_remove(v_allowed,''issue_date''),''renewal_status'')||array[''training_type_id'',''training_category_id'',''provider'',''certificate_number'',''completion_date''];';
 IF length(definition)-length(replace(definition,needle,''))<>length(needle) THEN RAISE EXCEPTION 'Expected training input projection required';END IF;
 definition:=replace(definition,needle,replacement);
 needle:='foreach v_key in array array[''issue_date'',''expiry_date''] loop';
 replacement:=$code$if v_kind='training_certificate' and v_child->>'completion_date' is not null and v_child->>'expiry_date' is not null and v_child->>'expiry_date'<v_child->>'completion_date' then raise exception 'Training expiry precedes reviewed completion' using errcode='23514';end if;
  foreach v_key in array array['issue_date','expiry_date','completion_date'] loop$code$;
 IF length(definition)-length(replace(definition,needle,''))<>length(needle) THEN RAISE EXCEPTION 'Expected strict date validation required';END IF;
 definition:=replace(definition,needle,replacement);
 EXECUTE definition;
END $repair$;
NOTIFY pgrst,'reload schema';
COMMIT;
