-- CUTOVER ONLY: deploy with the matching application. The former two-column
-- PostgREST upsert cannot target the new cycle key. Do not apply independently.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
ALTER TABLE public.dms_expiry_reminders ADD COLUMN expiry_cycle_date date GENERATED ALWAYS AS(reminder_date+reminder_days_before) STORED;
ALTER TABLE public.dms_expiry_reminders ADD CONSTRAINT ai_mod04_reminder_cycle_uq UNIQUE(document_id,expiry_cycle_date,reminder_days_before);
ALTER TABLE public.dms_expiry_reminders DROP CONSTRAINT dms_expiry_reminders_doc_days_uq;
DROP INDEX public.dms_expiry_reminders_doc_days_idx;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_reconcile_reminders(p_document bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.dms_documents;t public.dms_document_types;policy jsonb;day_value integer;due date;created_count integer:=0;added integer;cancelled_count integer:=0;skipped_count integer:=0;
BEGIN
 IF NOT erp_private.business_principal_is_active() OR NOT(erp_private.document_permission(p_document,'dms.documents.edit') OR erp_private.document_permission(p_document,'dms.expiry.manage') OR erp_private.document_permission(p_document,'dms.admin')) THEN RAISE EXCEPTION 'Reminder authority unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL FOR UPDATE;
 SELECT * INTO t FROM public.dms_document_types WHERE id=d.document_type_id;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Document unavailable' USING ERRCODE='42501'; END IF;
 IF d.expiry_date IS NULL OR d.expiry_tracking_override='ignored' OR d.is_archived OR d.status IN('archived','superseded','deleted') OR NOT t.requires_expiry_tracking OR t.type_code IN('EMPLOYEE_PHOTO','DEPENDENT_PHOTO') THEN RETURN jsonb_build_object('state','not_applicable','created',0,'skipped',0,'cancelled',0); END IF;
 IF d.reminder_policy_id IS NOT NULL THEN RETURN jsonb_build_object('state','held_document_override_requires_review','created',0,'skipped',0,'cancelled',0); END IF;
 IF NOT erp_private.ai_mod04_profile_current(t.id) THEN RETURN jsonb_build_object('state','held_profile_schema','created',0,'skipped',0,'cancelled',0); END IF;
 SELECT p INTO policy FROM jsonb_array_elements(coalesce(erp_private.ai_mod04_profile(t.id,true)->'reminders'->'policies','[]'::jsonb))p WHERE (p->>'companyId' IS NULL OR (p->>'companyId')::bigint=d.owning_company_id) AND (p->>'branchId' IS NULL OR (p->>'branchId')::bigint=d.owning_branch_id) ORDER BY CASE WHEN p->>'branchId' IS NOT NULL THEN 0 WHEN p->>'companyId' IS NOT NULL THEN 1 ELSE 2 END LIMIT 1;
 IF erp_private.ai_mod04_profile(t.id,true)->>'status' IS DISTINCT FROM 'active' OR policy IS NULL THEN RETURN jsonb_build_object('state','held_policy_approval_or_scope','created',0,'skipped',0,'cancelled',0); END IF;
 UPDATE public.dms_expiry_reminders r SET status='cancelled',updated_at=clock_timestamp() WHERE r.document_id=d.id AND r.status='pending' AND r.notification_status IS DISTINCT FROM 'sent' AND (r.expiry_cycle_date IS DISTINCT FROM d.expiry_date OR NOT (policy->'days' @> jsonb_build_array(r.reminder_days_before)));
 GET DIAGNOSTICS cancelled_count=ROW_COUNT;
 FOR day_value IN SELECT DISTINCT value::integer FROM jsonb_array_elements_text(policy->'days') ORDER BY 1 DESC LOOP
  due:=d.expiry_date-day_value;
  IF due<(clock_timestamp() AT TIME ZONE 'Asia/Dubai')::date THEN skipped_count:=skipped_count+1;CONTINUE;END IF;
  INSERT INTO public.dms_expiry_reminders(document_id,reminder_days_before,reminder_date,status) VALUES(d.id,day_value,due,'pending') ON CONFLICT(document_id,expiry_cycle_date,reminder_days_before) DO NOTHING;
  GET DIAGNOSTICS added=ROW_COUNT;created_count:=created_count+added;skipped_count:=skipped_count+1-added;
 END LOOP;
 RETURN jsonb_build_object('state','reconciled','created',created_count,'skipped',skipped_count,'cancelled',cancelled_count,'policyRevision',erp_private.ai_mod04_profile(t.id,true)->'revision','expiryCycle',d.expiry_date);
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_reconcile_reminders(bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.ai_mod04_schedule_reminders(p_document bigint,p_days integer[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.dms_documents;days integer[]:=coalesce(p_days,ARRAY[90,60,30,14,7,3,1,0]);day_value integer;created_count integer:=0;skipped_count integer:=0;cancelled_count integer:=0;added integer;result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR NOT(erp_private.document_permission(p_document,'dms.expiry.manage') OR erp_private.document_permission(p_document,'dms.admin')) THEN RAISE EXCEPTION 'Scoped expiry management permission required' USING ERRCODE='42501';END IF;
 PERFORM erp_private.ai_mod04_lock_profile_authority(public.current_user_profile_id());
 SELECT * INTO d FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR d.expiry_date IS NULL OR d.expiry_tracking_override='ignored' OR d.is_archived OR d.status IN('archived','superseded','deleted') THEN RAISE EXCEPTION 'Current expiry scheduling unavailable' USING ERRCODE='22023';END IF;
 IF erp_private.ai_mod04_profile(d.document_type_id,true) IS NOT NULL THEN result:=erp_private.ai_mod04_reconcile_reminders(d.id);
 ELSE
  IF cardinality(days) NOT BETWEEN 1 AND 50 OR array_position(days,NULL) IS NOT NULL OR cardinality(days)<>(SELECT count(DISTINCT x) FROM unnest(days)x) OR EXISTS(SELECT 1 FROM unnest(days)x WHERE x<0 OR x>365) THEN RAISE EXCEPTION 'Invalid existing reminder schedule' USING ERRCODE='22023';END IF;
  UPDATE public.dms_expiry_reminders SET status='cancelled',updated_at=clock_timestamp() WHERE document_id=d.id AND status='pending' AND notification_status IS DISTINCT FROM 'sent' AND expiry_cycle_date IS DISTINCT FROM d.expiry_date;GET DIAGNOSTICS cancelled_count=ROW_COUNT;
  FOREACH day_value IN ARRAY days LOOP
   IF d.expiry_date-day_value<(clock_timestamp() AT TIME ZONE 'Asia/Dubai')::date THEN skipped_count:=skipped_count+1;CONTINUE;END IF;
   INSERT INTO public.dms_expiry_reminders(document_id,reminder_days_before,reminder_date,status) VALUES(d.id,day_value,d.expiry_date-day_value,'pending') ON CONFLICT(document_id,expiry_cycle_date,reminder_days_before) DO NOTHING;GET DIAGNOSTICS added=ROW_COUNT;created_count:=created_count+added;skipped_count:=skipped_count+1-added;
  END LOOP;
  result:=jsonb_build_object('state','reconciled','created',created_count,'skipped',skipped_count,'cancelled',cancelled_count,'expiryCycle',d.expiry_date);
 END IF;
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json) VALUES(d.id,'expiry_schedule_reconciled','Current expiry cycle reconciled without reusing historical reminder identities.',public.current_user_profile_id(),result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.ai_mod04_schedule_reminders(bigint,integer[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ai_mod04_schedule_reminders(bigint,integer[]) TO authenticated;

-- Fence a renewal that commits between the scheduler's read and queue insert.
-- Preserve the existing authorization and per-recipient retry identity.
DO $patch$
DECLARE definition text := pg_get_functiondef('erp_private.f09_fence_dms_reminder()'::regprocedure);
 anchor text := ' PERFORM pg_advisory_xact_lock(hashtextextended(''f09-dms-reminder:''';
BEGIN
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 THEN
  RAISE EXCEPTION 'Unexpected DMS reminder intent fence';
 END IF;
 EXECUTE replace(definition,anchor,$guard$
 -- Lock document before reminder, matching the expiry reconciliation order.
 PERFORM 1 FROM public.dms_documents d WHERE d.id=NEW.document_id FOR SHARE;
 PERFORM 1 FROM public.dms_expiry_reminders r JOIN public.dms_documents d ON d.id=r.document_id
 WHERE r.id=NEW.reminder_id AND r.document_id=NEW.document_id AND r.status='pending'
  AND d.deleted_at IS NULL AND NOT d.is_archived AND d.status NOT IN ('archived','superseded','deleted')
  AND d.expiry_tracking_override IS DISTINCT FROM 'ignored' AND r.expiry_cycle_date=d.expiry_date
  AND (NEW.metadata_json->>'expiry_date' IS NULL OR NEW.metadata_json->>'expiry_date'=d.expiry_date::text)
 FOR SHARE OF r;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reminder expiry cycle is no longer current' USING ERRCODE='22023'; END IF;
$guard$ || anchor);
END $patch$;

NOTIFY pgrst, 'reload schema';
COMMIT;
