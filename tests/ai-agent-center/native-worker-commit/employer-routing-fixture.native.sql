-- Run after the two retained continuous runtime migrations in the isolated
-- Agent Center fixture database, before exercising the actual employer migration.
\set ON_ERROR_STOP on
DO $$
BEGIN
  IF current_database()<>'agent_center_controls_native' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
    RAISE EXCEPTION 'Disposable Agent Center database required';
  END IF;
END $$;

ALTER TABLE public.owner_companies ADD COLUMN legal_name_en text;
UPDATE public.owner_companies SET legal_name_en='Test Source L.L.C.' WHERE id=1;
UPDATE public.owner_companies SET legal_name_en='7 ORYX GENERAL TRANSPORT L.L.C.' WHERE id=2;
UPDATE public.owner_companies SET legal_name_en='Inactive Fleet L.L.C.' WHERE id=3;
CREATE TABLE auth.users (id uuid PRIMARY KEY, banned_until timestamptz, deleted_at timestamptz);
ALTER TABLE public.user_profiles ADD COLUMN auth_user_id uuid, ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
UPDATE public.user_profiles SET auth_user_id=('00000000-0000-4000-8000-' || lpad(id::text,12,'0'))::uuid;
INSERT INTO auth.users (id) SELECT auth_user_id FROM public.user_profiles;
CREATE TABLE public.roles (id bigint PRIMARY KEY, role_code text NOT NULL, is_active boolean NOT NULL);
CREATE TABLE public.permissions (id bigint PRIMARY KEY, permission_code text NOT NULL, is_active boolean NOT NULL);
CREATE TABLE public.role_permissions (role_id bigint, permission_id bigint);
CREATE TABLE public.user_roles (user_profile_id bigint, role_id bigint, owner_company_id bigint, branch_id bigint, is_active boolean);
INSERT INTO public.roles VALUES (21,'fixture_intake',true), (22,'fixture_officer',true);
INSERT INTO public.permissions VALUES (21,'dms.documents.upload',true), (22,'dms.documents.preview',true), (23,'dms.documents.review_ai',true);
INSERT INTO public.role_permissions VALUES (21,21),(21,22),(21,23),(22,22),(22,23);
INSERT INTO public.user_roles VALUES (101,21,1,NULL,true), (101,21,2,NULL,true), (103,22,2,NULL,true);

CREATE TABLE erp_private.f07_single_upload_admissions (actor_id bigint, operation_id uuid, upload_session_id bigint);
