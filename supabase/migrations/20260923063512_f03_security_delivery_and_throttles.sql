BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE erp_private.auth_rate_buckets (
  bucket_key text PRIMARY KEY CHECK(length(bucket_key)=64), attempts integer NOT NULL, reset_at timestamptz NOT NULL
);
CREATE INDEX auth_rate_buckets_expiry ON erp_private.auth_rate_buckets(reset_at);
REVOKE ALL ON erp_private.auth_rate_buckets FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.f03_consume_auth_quota(bucket_key text, quota integer, window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF length(bucket_key)<>64 OR quota<1 OR quota>1000 OR window_seconds<60 OR window_seconds>86400 THEN RAISE EXCEPTION 'Invalid quota'; END IF;
  DELETE FROM erp_private.auth_rate_buckets b WHERE b.bucket_key IN (SELECT x.bucket_key FROM erp_private.auth_rate_buckets x WHERE x.reset_at < now()-interval '1 day' LIMIT 100);
  INSERT INTO erp_private.auth_rate_buckets AS b VALUES(bucket_key,1,now()+make_interval(secs=>window_seconds))
    ON CONFLICT ON CONSTRAINT auth_rate_buckets_pkey DO UPDATE SET
      attempts=CASE WHEN b.reset_at<=now() THEN 1 ELSE least(b.attempts+1,1001) END,
      reset_at=CASE WHEN b.reset_at<=now() THEN now()+make_interval(secs=>window_seconds) ELSE b.reset_at END
    RETURNING attempts INTO v_count;
  RETURN v_count<=quota;
END $$;
REVOKE ALL ON FUNCTION public.f03_consume_auth_quota(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f03_consume_auth_quota(text,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.f03_recovery_target(normalized_email text)
RETURNS TABLE(auth_user_id uuid,profile_id bigint,display_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT u.id,p.id,coalesce(p.display_name,p.full_name,'User') FROM auth.users u JOIN public.user_profiles p ON p.auth_user_id=u.id
    WHERE auth.role()='service_role' AND lower(u.email)=normalized_email AND p.status='active'
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<now()) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.f03_recovery_target(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f03_recovery_target(text) TO service_role;

CREATE TABLE public.erp_security_email_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id bigint REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK(kind IN ('invite','recovery','notice')),
  state text NOT NULL CHECK(state IN ('requested','provider_accepted','failed','unknown')),
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
ALTER TABLE public.erp_security_email_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_security_email_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.erp_security_email_attempts TO service_role;
CREATE INDEX erp_security_email_attempts_profile ON public.erp_security_email_attempts(profile_id,created_at DESC);
NOTIFY pgrst, 'reload schema';
COMMIT;
