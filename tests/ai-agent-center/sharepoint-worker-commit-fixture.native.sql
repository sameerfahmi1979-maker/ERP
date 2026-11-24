\set ON_ERROR_STOP on
do $$
begin
  if current_database() <> 'agent_center_controls_native'
    or inet_server_addr() is distinct from '127.0.0.1'::inet
    or to_regclass('erp_private.fixture_permissions') is null then
    raise exception 'An isolated Agent Center fixture database is required';
  end if;
end $$;

-- Add the existing F07 completion inputs and downstream table keys omitted
-- by the smaller admission fixture.
alter table public.dms_upload_sessions
  alter column intake_status set default 'uploaded',
  add column temp_cleaned_at timestamptz,
  add column updated_at timestamptz not null default clock_timestamp(),
  add column ai_job_id bigint;
alter table public.dms_ai_extraction_results add column job_id bigint;
create table public.dms_ai_extraction_jobs (id bigint primary key, upload_session_id bigint);
create table erp_private.f07_intake_sources (upload_session_id bigint primary key);
create schema storage;
create table storage.objects (id uuid, version text, updated_at timestamptz, metadata jsonb, bucket_id text, name text);
create function auth.role() returns text language sql stable set search_path=''
  as $$ select current_setting('request.jwt.claim.role',true) $$;
create function auth.jwt() returns jsonb language sql stable set search_path=''
  as $$ select jsonb_build_object('role',auth.role(),'session_id',current_setting('request.jwt.claim.session_id',true)) $$;
create function erp_private.provider_actor_session_valid(p_actor bigint,p_auth_session uuid) returns boolean
  language sql stable set search_path=''
  as $$ select p_actor in (101,102) and p_auth_session = '20000000-0000-4000-8000-000000000101'::uuid $$;
grant usage on schema auth to authenticated,service_role;
grant select,update on public.dms_upload_sessions to authenticated,service_role;
grant select,insert,update on public.dms_ai_extraction_jobs,public.dms_ai_extraction_results,public.dms_review_queue to authenticated,service_role;
