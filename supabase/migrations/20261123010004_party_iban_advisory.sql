BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Use a stored digest so equality can use the index under caller RLS. Applying
-- translate directly to the row in the indexed lookup leaves the RLS scan unbounded.
ALTER TABLE public.party_bank_details ADD COLUMN iban_advisory_key bytea
  GENERATED ALWAYS AS (
    extensions.digest(pg_catalog.translate(iban, E'abcdefghijklmnopqrstuvwxyz \t\n\013\f\r', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'sha256')
  ) STORED;

CREATE INDEX perf_party_bank_iban_active_key
  ON public.party_bank_details (iban_advisory_key)
  WHERE is_active AND iban_advisory_key IS NOT NULL;

-- A BEFORE trigger sees the generated column before PostgreSQL computes it.
-- Keep workspace revision decisions tied to business data on unchanged saves.
CREATE OR REPLACE FUNCTION erp_private.party_record_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.workspace_revision := 1;
  ELSIF (to_jsonb(NEW) - ARRAY['workspace_revision','updated_at','updated_by','iban_advisory_key'])
    IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['workspace_revision','updated_at','updated_by','iban_advisory_key']) THEN
    NEW.workspace_revision := OLD.workspace_revision + 1;
  ELSE
    NEW.workspace_revision := OLD.workspace_revision;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.perf_party_iban_advisory(p_iban text, p_exclude_bank_detail bigint)
RETURNS TABLE(party_code text, display_name text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT party.party_code, party.display_name
  FROM public.party_bank_details AS bank
  JOIN public.parties AS party ON party.id = bank.party_id
  WHERE (SELECT erp_private.permission_in_scope('master_data.parties.manage_bank_details', NULL, NULL))
    AND p_iban COLLATE "C" ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'
    AND bank.is_active AND bank.iban_advisory_key IS NOT NULL
    AND bank.iban_advisory_key = extensions.digest(p_iban, 'sha256')
    -- An exact comparison prevents even a digest collision from producing a match.
    AND pg_catalog.translate(bank.iban, E'abcdefghijklmnopqrstuvwxyz \t\n\013\f\r', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') = p_iban
    AND (p_exclude_bank_detail IS NULL OR bank.id <> p_exclude_bank_detail)
  ORDER BY bank.id;
$$;

REVOKE ALL ON FUNCTION public.perf_party_iban_advisory(text, bigint) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.perf_party_iban_advisory(text, bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
