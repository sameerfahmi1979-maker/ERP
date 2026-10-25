-- Native-only acceptance. The runner supplies a task-owned populated synthetic
-- database, a temporary fixture (profile, claims), and the pre-change helper as
-- pg_temp.photo_original_upload_ids(). Every fixture modification rolls back.
BEGIN;
SET LOCAL statement_timeout='8s';
DO $$ BEGIN
  IF current_database() NOT LIKE 'algt_hr_photos_transport_%'
    OR to_regclass('pg_temp.photo_authority_fixture') IS NULL
    OR to_regprocedure('pg_temp.photo_original_upload_ids()') IS NULL THEN
    RAISE EXCEPTION 'Owned synthetic photo fixture required';
  END IF;
END $$;
CREATE FUNCTION pg_temp.photo_assert_authority(label text, empty_expected boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE before_ids bigint[]; after_ids bigint[];
BEGIN
  SELECT coalesce(array_agg(id ORDER BY id),ARRAY[]::bigint[]) INTO before_ids
    FROM pg_temp.photo_original_upload_ids() id;
  SELECT coalesce(array_agg(id ORDER BY id),ARRAY[]::bigint[]) INTO after_ids
    FROM erp_private.readable_upload_session_ids() id;
  IF before_ids IS DISTINCT FROM after_ids OR
    (empty_expected AND cardinality(after_ids)<>0) THEN
    RAISE EXCEPTION 'Authority regression: %',label;
  END IF;
  RETURN jsonb_build_object('case',label,'state','PASS','count',cardinality(after_ids));
END $$;
-- Fixture administration runs as the local database owner, with a separate
-- synthetic administrator retained so real last-admin guards remain enabled.
SELECT set_config('request.jwt.claims',(SELECT (claims-'role')::text FROM photo_authority_fixture),true);
INSERT INTO public.user_roles(user_profile_id,role_id)
 SELECT p.id,r.id FROM public.user_profiles p CROSS JOIN public.roles r
 WHERE p.id<>(SELECT profile FROM photo_authority_fixture) AND r.role_code='system_admin' LIMIT 1;
SELECT pg_temp.photo_assert_authority('active global administrator');
SAVEPOINT altered;
UPDATE public.dms_documents SET deleted_at=now() WHERE title LIKE 'Synthetic populated document %' AND id%7=0;
SELECT pg_temp.photo_assert_authority('bound soft-deleted documents remain excluded');
ROLLBACK TO altered;
UPDATE public.dms_upload_sessions SET deleted_at=now() WHERE session_code LIKE 'SYN-UNBOUND-%' AND id%7=0;
SELECT pg_temp.photo_assert_authority('soft-deleted upload membership unchanged');
ROLLBACK TO altered;
UPDATE public.user_roles SET is_active=false WHERE user_profile_id=(SELECT profile FROM photo_authority_fixture)
  AND role_id IN(SELECT id FROM public.roles WHERE role_code='system_admin');
SELECT pg_temp.photo_assert_authority('global role revoked; company authority retained');
UPDATE public.user_roles SET is_active=false WHERE user_profile_id=(SELECT profile FROM photo_authority_fixture);
SELECT pg_temp.photo_assert_authority('all assignments revoked',true);
ROLLBACK TO altered;
DO $$ BEGIN
  BEGIN
    UPDATE public.roles SET is_active=false WHERE role_code='system_admin';
    RAISE EXCEPTION 'System-role protection unexpectedly allowed disabling';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT pg_temp.photo_assert_authority('protected system role cannot be disabled');
ROLLBACK TO altered;
UPDATE public.user_roles SET owner_company_id=(SELECT owning_company_id FROM public.dms_documents WHERE title LIKE 'Synthetic populated document %' LIMIT 1)
  WHERE user_profile_id=(SELECT profile FROM photo_authority_fixture) AND role_id IN(SELECT id FROM public.roles WHERE role_code='system_admin');
SELECT pg_temp.photo_assert_authority('scoped system-admin assignment is not global');
ROLLBACK TO altered;
UPDATE public.user_profiles SET must_change_password=true WHERE id=(SELECT profile FROM photo_authority_fixture);
SELECT pg_temp.photo_assert_authority('password change required',true);
ROLLBACK TO altered;
UPDATE public.user_profiles SET status='inactive' WHERE id=(SELECT profile FROM photo_authority_fixture);
SELECT pg_temp.photo_assert_authority('inactive account',true);
ROLLBACK TO altered;
DELETE FROM auth.sessions WHERE id=((SELECT claims->>'session_id' FROM photo_authority_fixture))::uuid;
SELECT pg_temp.photo_assert_authority('revoked session',true);
ROLLBACK TO altered;
SELECT set_config('request.jwt.claims','{}',true);
SELECT pg_temp.photo_assert_authority('anonymous identity',true);
ROLLBACK;
