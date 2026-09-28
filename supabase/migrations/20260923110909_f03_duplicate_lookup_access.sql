BEGIN;

-- Duplicate hints must expose no more than the caller can read normally.
-- Retain the existing matching contract; apply caller RLS to both the party
-- and its tax/licence/banking evidence, including the active ERP-principal guard.
ALTER FUNCTION public.detect_possible_party_duplicates(text,text,text,text,text,text,text,text,text,bigint)
  SECURITY INVOKER;
ALTER FUNCTION public.detect_possible_party_duplicates(text,text,text,text,text,text,text,text,text,bigint)
  SET search_path TO pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.detect_possible_party_duplicates(text,text,text,text,text,text,text,text,text,bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detect_possible_party_duplicates(text,text,text,text,text,text,text,text,text,bigint)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
