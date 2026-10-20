BEGIN;
-- Zod trims ECMAScript whitespace, while PostgreSQL btrim(text) trims only
-- ordinary spaces. Enforce the same nonblank boundary for direct Data API
-- requests without editing previously accepted migration bytes or old rows.
CREATE FUNCTION erp_private.f11_require_child_text()RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE value text:=to_jsonb(NEW)->>TG_ARGV[0];trim_chars text:=E' \t\n\r\f\v'||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
 IF auth.uid()IS NULL THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE'AND(to_jsonb(NEW)->TG_ARGV[0])IS NOT DISTINCT FROM(to_jsonb(OLD)->TG_ARGV[0])THEN RETURN NEW;END IF;
 IF nullif(btrim(value,trim_chars),'')IS NULL OR char_length(value)>TG_ARGV[1]::integer THEN RAISE EXCEPTION 'Required child wording is blank or exceeds its limit' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER f11_note_required_text BEFORE INSERT OR UPDATE OF note_text ON public.employee_hr_notes FOR EACH ROW EXECUTE FUNCTION erp_private.f11_require_child_text('note_text','10000');
CREATE TRIGGER f11_pro_required_text BEFORE INSERT OR UPDATE OF process_title ON public.employee_pro_processes FOR EACH ROW EXECUTE FUNCTION erp_private.f11_require_child_text('process_title','500');
CREATE TRIGGER f11_action_required_text BEFORE INSERT OR UPDATE OF action_title ON public.employee_hr_actions FOR EACH ROW EXECUTE FUNCTION erp_private.f11_require_child_text('action_title','500');
CREATE TRIGGER f11_disciplinary_required_text BEFORE INSERT OR UPDATE OF subject ON public.employee_disciplinary_records FOR EACH ROW EXECUTE FUNCTION erp_private.f11_require_child_text('subject','500');
REVOKE ALL ON FUNCTION erp_private.f11_require_child_text()FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
