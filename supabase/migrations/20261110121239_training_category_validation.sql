-- Repair only the two verified, uncategorized induction types. Existing
-- employee certificates, document links and history are deliberately retained.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $repair$
DECLARE category_id bigint; definition text;
 old_check text := $old$IF(type_row->>'requires_certificate_number')::boolean AND nullif(btrim(p_new->>'certificate_number'),'')IS NULL OR(type_row->>'requires_provider')::boolean AND nullif(btrim(p_new->>'provider'),'')IS NULL OR p_new->>'training_category_id'IS NOT NULL AND type_row->>'training_category_id'IS DISTINCT FROM p_new->>'training_category_id'THEN RAISE EXCEPTION 'Required or compatible training facts missing' USING ERRCODE='23514';END IF;$old$;
 new_check text := $new$IF(type_row->>'requires_certificate_number')::boolean AND nullif(btrim(p_new->>'certificate_number'),'')IS NULL THEN RAISE EXCEPTION 'Certificate Number is required for the selected training type' USING ERRCODE='23514';END IF;
  IF(type_row->>'requires_provider')::boolean AND nullif(btrim(p_new->>'provider'),'')IS NULL THEN RAISE EXCEPTION 'Provider is required for the selected training type' USING ERRCODE='23514';END IF;
  IF p_new->>'training_category_id'IS NOT NULL AND type_row->>'training_category_id'IS DISTINCT FROM p_new->>'training_category_id'THEN RAISE EXCEPTION 'The training category does not match the selected training type. Reload the training choices and use the configured category' USING ERRCODE='23514';END IF;$new$;
BEGIN
 SELECT id INTO STRICT category_id FROM public.hr_training_categories
 WHERE code='HSE' AND is_active AND deleted_at IS NULL FOR SHARE;
 -- Lock targets and reject unexpected owner edits rather than overwrite them.
 PERFORM id FROM public.hr_training_types WHERE code IN('ONSHORE_INDUCTION','OFFSHORE_INDUCATION') FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.hr_training_types WHERE code IN('ONSHORE_INDUCTION','OFFSHORE_INDUCATION')
   AND (NOT is_active OR deleted_at IS NOT NULL OR training_category_id IS NOT NULL AND training_category_id<>category_id)) THEN
  RAISE EXCEPTION 'Induction training configuration changed; review before applying this repair';
 END IF;
 SELECT pg_get_functiondef('erp_private.f11_compliance_reference_facts(text,bigint,jsonb,jsonb,text)'::regprocedure) INTO definition;
 IF strpos(definition,old_check)>0 THEN
  IF (length(definition)-length(replace(definition,old_check,'')))/length(old_check)<>1 THEN
   RAISE EXCEPTION 'Unexpected training validation definition';
  END IF;
  EXECUTE replace(definition,old_check,new_check);
 ELSIF strpos(definition,new_check)=0 THEN
  RAISE EXCEPTION 'Training validation has changed; review before applying this repair';
 END IF;
 UPDATE public.hr_training_types SET training_category_id=category_id
 WHERE code IN('ONSHORE_INDUCTION','OFFSHORE_INDUCATION') AND training_category_id IS NULL;
END $repair$;
