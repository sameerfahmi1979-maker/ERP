BEGIN;
SET LOCAL lock_timeout='5s';

-- Existing history retains its original requisition. A candidate without
-- retained requisition-owned evidence can still be moved by the existing
-- source/destination authorization rules.
CREATE FUNCTION erp_private.guard_recruitment_parent_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE parent bigint;
BEGIN
  IF TG_TABLE_NAME='hr_candidates' THEN
    IF NEW.requisition_id IS DISTINCT FROM OLD.requisition_id AND (
      EXISTS(SELECT 1 FROM public.hr_interviews WHERE candidate_id=OLD.id)
      OR EXISTS(SELECT 1 FROM public.hr_offers WHERE candidate_id=OLD.id)
      OR EXISTS(SELECT 1 FROM public.employee_recruitment_links WHERE candidate_id=OLD.id)
      OR EXISTS(SELECT 1 FROM public.hr_onboarding_tasks WHERE candidate_id=OLD.id)
    ) THEN
      RAISE EXCEPTION 'Keep the requisition attached to its retained candidate history' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.candidate_id IS NULL THEN RETURN NEW; END IF;
  -- This conflicts with the parent update's row lock and proves the same
  -- relationship whichever concurrent command wins.
  SELECT c.requisition_id INTO parent FROM public.hr_candidates c WHERE c.id=NEW.candidate_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate unavailable' USING ERRCODE='23503'; END IF;
  IF TG_TABLE_NAME IN ('hr_interviews','hr_offers') AND to_jsonb(NEW)->'requisition_id' IS DISTINCT FROM coalesce(to_jsonb(parent),'null'::jsonb) THEN
    RAISE EXCEPTION 'Candidate requisition mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.guard_recruitment_parent_change() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER phase2_recruitment_parent_guard BEFORE UPDATE OF requisition_id ON public.hr_candidates
  FOR EACH ROW EXECUTE FUNCTION erp_private.guard_recruitment_parent_change();
CREATE TRIGGER phase2_recruitment_parent_guard BEFORE INSERT OR UPDATE OF candidate_id,requisition_id ON public.hr_interviews
  FOR EACH ROW EXECUTE FUNCTION erp_private.guard_recruitment_parent_change();
CREATE TRIGGER phase2_recruitment_parent_guard BEFORE INSERT OR UPDATE OF candidate_id,requisition_id ON public.hr_offers
  FOR EACH ROW EXECUTE FUNCTION erp_private.guard_recruitment_parent_change();
CREATE TRIGGER phase2_recruitment_parent_guard BEFORE INSERT OR UPDATE OF candidate_id ON public.hr_onboarding_tasks
  FOR EACH ROW EXECUTE FUNCTION erp_private.guard_recruitment_parent_change();
COMMIT;
