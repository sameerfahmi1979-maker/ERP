-- Master-data requirement only. Never rewrite employee certificates or history.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.hr_training_types
 ADD CONSTRAINT hr_training_types_active_category_required
 CHECK (NOT is_active OR deleted_at IS NOT NULL OR training_category_id IS NOT NULL) NOT VALID;
ALTER TABLE public.hr_training_types VALIDATE CONSTRAINT hr_training_types_active_category_required;

-- Also cover activation with an unchanged, previously retired category. Parent
-- locking serializes this check against category retirement; existing authority
-- and dependency triggers remain unchanged.
CREATE FUNCTION erp_private.validate_active_training_category() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF NEW.is_active AND NEW.deleted_at IS NULL AND NEW.training_category_id IS NOT NULL THEN
  PERFORM id FROM public.hr_training_categories
   WHERE id=NEW.training_category_id AND is_active AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'Choose an active training category before saving this training type' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.validate_active_training_category() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER training_type_active_category
 BEFORE INSERT OR UPDATE ON public.hr_training_types
 FOR EACH ROW EXECUTE FUNCTION erp_private.validate_active_training_category();
