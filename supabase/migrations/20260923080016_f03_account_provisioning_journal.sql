BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE public.erp_account_provisioning_operations (
 id uuid PRIMARY KEY,
 actor_profile_id bigint REFERENCES public.user_profiles(id) ON DELETE SET NULL,
 target_email_hash text NOT NULL CHECK(target_email_hash ~ '^[a-f0-9]{64}$'),
 auth_user_id uuid,
 profile_id bigint,
 state text NOT NULL DEFAULT 'started' CHECK(state IN ('started','identity_created','profile_created','completed','partial','failed','compensated','needs_reconciliation')),
 stages jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX f03_provisioning_pending_email ON public.erp_account_provisioning_operations(target_email_hash)
 WHERE state IN ('started','identity_created','profile_created','needs_reconciliation');
ALTER TABLE public.erp_account_provisioning_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_account_provisioning_operations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.erp_account_provisioning_operations TO service_role;
COMMENT ON TABLE public.erp_account_provisioning_operations IS 'Server-only account creation receipts. No passwords, email contents, links, tokens or provider secrets.';
NOTIFY pgrst,'reload schema';
COMMIT;
