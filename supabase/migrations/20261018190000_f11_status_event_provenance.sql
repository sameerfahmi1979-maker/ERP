BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
ALTER TABLE public.employee_employment_events ADD COLUMN transaction_id xid8 NOT NULL DEFAULT pg_current_xact_id();
ALTER TABLE public.employee_status_events ADD COLUMN employment_event_id bigint UNIQUE REFERENCES public.employee_employment_events(id);
REVOKE UPDATE,DELETE ON public.employee_status_events FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.f11_prove_status_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE fact public.employee_employment_events;
BEGIN
 SELECT * INTO fact FROM public.employee_employment_events h WHERE h.employee_id=NEW.employee_id
  AND h.transaction_id=pg_current_xact_id() AND h.new_values->>'employee_status'=NEW.new_status
  AND h.old_values->>'employee_status' IS NOT DISTINCT FROM NEW.old_status
  AND (h.old_values IS NULL OR h.old_values->>'employee_status' IS DISTINCT FROM h.new_values->>'employee_status')
 ORDER BY h.id DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Status history requires an actual same-transaction employment transition' USING ERRCODE='23514';END IF;
 IF NEW.employment_event_id IS NOT NULL AND NEW.employment_event_id<>fact.id THEN RAISE EXCEPTION 'Status history source mismatch' USING ERRCODE='23514';END IF;
 NEW.employment_event_id:=fact.id;
 NEW.created_by:=fact.created_by;
 NEW.reason:=fact.reason;NEW.effective_date:=fact.effective_date;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f11_prove_status_event() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f11_status_event_source BEFORE INSERT ON public.employee_status_events FOR EACH ROW EXECUTE FUNCTION erp_private.f11_prove_status_event();
NOTIFY pgrst,'reload schema';
COMMIT;
