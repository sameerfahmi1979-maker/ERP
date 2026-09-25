BEGIN;

-- F03 owns invitation issuance/consumption. Provider recovery/OTP expiry is unchanged.
CREATE TABLE public.erp_account_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id bigint NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL,
  recipient_email text NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  CHECK (expires_at = issued_at + interval '24 hours'),
  CHECK (recipient_email = lower(btrim(recipient_email)))
);
CREATE INDEX erp_account_invitations_profile_idx ON public.erp_account_invitations(profile_id);
CREATE UNIQUE INDEX erp_account_invitations_pending_idx ON public.erp_account_invitations(profile_id)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;
ALTER TABLE public.erp_account_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_account_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_account_invitations TO service_role;

CREATE FUNCTION public.f03_issue_invitation(p_profile_id bigint, p_auth_user_id uuid, p_email text, p_token_hash text)
RETURNS TABLE (invitation_id uuid, expires_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE issued timestamptz := clock_timestamp();
BEGIN
  -- Serialize resend with claim on the profile; never hold this lock over a network call.
  PERFORM 1 FROM public.user_profiles p WHERE p.id = p_profile_id
    AND p.auth_user_id = p_auth_user_id AND p.status = 'active' AND p.must_change_password IS TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation target unavailable'; END IF;
  UPDATE public.erp_account_invitations SET revoked_at = issued
    WHERE profile_id = p_profile_id AND revoked_at IS NULL;
  RETURN QUERY INSERT INTO public.erp_account_invitations AS i
    (profile_id, auth_user_id, recipient_email, token_hash, issued_at, expires_at)
    VALUES (p_profile_id, p_auth_user_id, lower(btrim(p_email)), p_token_hash, issued, issued + interval '24 hours')
    RETURNING i.id, i.expires_at;
END;
$$;

CREATE FUNCTION public.f03_claim_invitation(p_token_hash text)
RETURNS TABLE (invitation_id uuid, profile_id bigint, auth_user_id uuid, recipient_email text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE target_profile bigint;
BEGIN
  SELECT i.profile_id INTO target_profile FROM public.erp_account_invitations i WHERE i.token_hash = p_token_hash;
  IF target_profile IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM public.user_profiles p WHERE p.id = target_profile FOR UPDATE;
  -- Atomic one-use claim; exact expiry is denied using database time, not a client clock.
  RETURN QUERY UPDATE public.erp_account_invitations AS i SET consumed_at = clock_timestamp()
    FROM public.user_profiles p WHERE i.token_hash = p_token_hash
    AND i.consumed_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > clock_timestamp()
    AND p.id = i.profile_id AND p.auth_user_id = i.auth_user_id
    AND p.status = 'active' AND p.must_change_password IS TRUE
    RETURNING i.id, i.profile_id, i.auth_user_id, i.recipient_email;
END;
$$;
REVOKE ALL ON FUNCTION public.f03_issue_invitation(bigint,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.f03_claim_invitation(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.f03_issue_invitation(bigint,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.f03_claim_invitation(text) TO service_role;
COMMENT ON TABLE public.erp_account_invitations IS 'F03: server-only, hashed, single-use 24-hour ERP invitations. Never store clear tokens or queue their URLs.';
NOTIFY pgrst, 'reload schema';
COMMIT;
