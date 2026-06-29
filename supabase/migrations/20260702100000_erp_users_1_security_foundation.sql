-- =============================================================================
-- ERP USERS.1 — Security Foundation and Source-of-Truth Alignment
-- Migration: 20260702100000_erp_users_1_security_foundation.sql
-- =============================================================================
-- Applies:
--   1. FORCE ROW LEVEL SECURITY on 8 approved Users/RBAC/admin tables.
--   2. Replaces audit_logs_insert policy with an actor-self insert policy.
-- =============================================================================
-- Safety: idempotent (IF EXISTS / IF NOT EXISTS used where possible).
-- No table drops, no column drops, no data updates, no unrelated tables touched.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 1 — FORCE ROW LEVEL SECURITY
-- Ensures that even the table owner (postgres superuser session running via
-- Supabase SQL triggers) cannot bypass RLS when accessing these tables.
-- -----------------------------------------------------------------------------

ALTER TABLE public.user_profiles    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.roles            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.permissions      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.owner_companies  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.branches         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs       FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- SECTION 2 — FIX AUDIT LOGS INSERT POLICY
-- The previous policy required the caller to hold the "audit.view" permission
-- to INSERT a row. This was wrong: any authenticated user performing an
-- audited action must be able to insert their own audit record, regardless of
-- whether they can *view* the audit log.
-- The replacement policy allows any authenticated user to insert a row only
-- when actor_user_profile_id matches their own profile id (actor-self check).
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;

CREATE POLICY audit_logs_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_profile_id = public.current_user_profile_id()
  );

-- Verify: run the following query to confirm the policy exists:
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'audit_logs';

-- Verify FORCE RLS:
-- SELECT relname, relforcerowsecurity FROM pg_class
--   WHERE relname IN (
--     'user_profiles','roles','permissions','role_permissions',
--     'user_roles','owner_companies','branches','audit_logs'
--   )
--   ORDER BY relname;
