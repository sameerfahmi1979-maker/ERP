-- Non-browser native regression. Run only in the synthetic DMS clone after
-- the numbered-approval fixture has completed. All changes roll back.
BEGIN;
SET LOCAL statement_timeout = '15s';
DO $$
DECLARE field_type text; definition bigint; target bigint; rejected boolean; checks integer:=0;
BEGIN
 IF current_database() NOT LIKE 'dms_reference_%' OR
  (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
   IS DISTINCT FROM 'Synthetic DMS reference metadata recovery 20261026' THEN
  RAISE EXCEPTION 'Dedicated synthetic database required';
 END IF;
 SELECT id INTO STRICT target FROM public.dms_documents
  WHERE title='Synthetic retained approval' AND document_type_id=74001;
 FOR field_type IN SELECT unnest(ARRAY['party_ref','employee_ref','vehicle_ref','equipment_ref','project_ref','country_ref','region_ref','city_ref','area_ref']) LOOP
  IF erp_private.f07_metadata_column(field_type) IS DISTINCT FROM 'value_text' THEN RAISE EXCEPTION 'Reference column mismatch: %',field_type;END IF;
  INSERT INTO public.dms_metadata_definitions(document_type_id,field_code,field_label_en,field_type,is_required,validation_json)
   VALUES(74001,'test_'||field_type,'Synthetic reference',field_type,true,'{"max_length":40}') RETURNING id INTO definition;
  -- Exercise the actual row trigger, not just the column-selection helper.
  INSERT INTO public.dms_document_metadata_values(document_id,definition_id,value_text)
   VALUES(target,definition,'Synthetic label');
  IF NOT EXISTS(SELECT 1 FROM public.dms_document_metadata_values WHERE document_id=target AND definition_id=definition AND value_text='Synthetic label') THEN RAISE EXCEPTION 'Reference label was not preserved';END IF;
  checks:=checks+1;
  rejected:=false;
  BEGIN UPDATE public.dms_document_metadata_values SET value_text=NULL,value_number=17 WHERE document_id=target AND definition_id=definition;
  EXCEPTION WHEN SQLSTATE '22023' THEN rejected:=true;END;
  IF NOT rejected THEN RAISE EXCEPTION 'Wrong typed column accepted: %',field_type;END IF;checks:=checks+1;
  rejected:=false;
  BEGIN UPDATE public.dms_document_metadata_values SET value_text=' ' WHERE document_id=target AND definition_id=definition;
  EXCEPTION WHEN SQLSTATE '22023' THEN rejected:=true;END;
  IF NOT rejected THEN RAISE EXCEPTION 'Required empty reference accepted: %',field_type;END IF;checks:=checks+1;
  rejected:=false;
  BEGIN UPDATE public.dms_document_metadata_values SET value_text=repeat('x',41) WHERE document_id=target AND definition_id=definition;
  EXCEPTION WHEN SQLSTATE '22023' THEN rejected:=true;END;
  IF NOT rejected THEN RAISE EXCEPTION 'Reference length limit removed: %',field_type;END IF;checks:=checks+1;
  UPDATE public.dms_metadata_definitions SET is_required=false WHERE id=definition;
  UPDATE public.dms_document_metadata_values SET value_text=NULL WHERE document_id=target AND definition_id=definition;
  checks:=checks+1;
 END LOOP;
 IF erp_private.f07_metadata_column('invented_ref') IS NOT NULL THEN RAISE EXCEPTION 'Unknown type accepted';END IF;checks:=checks+1;
 IF erp_private.f07_metadata_column('currency') IS DISTINCT FROM 'value_number' OR
  erp_private.f07_metadata_column('multi_select') IS DISTINCT FROM 'value_json' OR
  erp_private.f07_metadata_column('date') IS DISTINCT FROM 'value_date' THEN RAISE EXCEPTION 'Existing typed columns changed';END IF;checks:=checks+1;
 IF EXISTS(SELECT 1 FROM public.dms_document_links WHERE document_id=target) THEN RAISE EXCEPTION 'Text reference created an unauthorized entity link';END IF;checks:=checks+1;
 RAISE NOTICE 'REFERENCE_METADATA_NATIVE_PASS:%',checks;
END $$;
ROLLBACK;
