-- Apply after controls-fixture.native.sql in its disposable database.
\set ON_ERROR_STOP on
do $$
begin
  if current_database() <> 'agent_center_controls_native'
    or inet_server_addr() is distinct from '127.0.0.1'::inet
    or to_regclass('erp_private.fixture_permissions') is null then
    raise exception 'An isolated Agent Center fixture database is required';
  end if;
end $$;

begin;
create table public.user_profiles (id bigint primary key, status text not null, owner_company_id bigint, branch_id bigint);
create table public.dms_upload_sessions (
  id bigint generated always as identity primary key, session_code text, status text, intake_status text default 'uploading',
  original_filename text, mime_type text, file_size_bytes bigint, sha256_hash text, temp_storage_path text,
  uploaded_by bigint, owning_company_id bigint, owning_branch_id bigint, origin_entity_type text, origin_entity_id bigint,
  uploaded_at timestamptz, expires_at timestamptz, deleted_at timestamptz, document_id bigint, ai_result_id bigint
);
create table public.dms_review_queue (id bigint generated always as identity primary key,
  upload_session_id bigint, ai_result_id bigint, assigned_to bigint, assigned_at timestamptz,
  status text, priority text, review_type text, source_type text, source_id text,
  idempotency_key text unique, reason_code text, reason_message text, created_by bigint);
create table public.erp_ai_feature_flags (feature_code text, is_enabled boolean);
insert into public.erp_ai_feature_flags values ('DMS_AI_REVIEW', true);
create table public.dms_documents (id bigint, owning_company_id bigint, owning_branch_id bigint,
  document_type_id bigint, status text, deleted_at timestamptz, is_archived boolean, expiry_date date);
create table public.dms_document_files (document_id bigint, sha256_hash text, file_role text, deleted_at timestamptz);
create table public.dms_document_types (id bigint, type_code text, is_active boolean, deleted_at timestamptz);
create table public.dms_document_metadata_values (document_id bigint, definition_id bigint, deleted_at timestamptz,
  value_text text, value_date date, value_number numeric, value_json jsonb);
create table public.dms_metadata_definitions (id bigint, document_type_id bigint, field_code text,
  is_active boolean, deleted_at timestamptz);
create table public.dms_ai_extraction_results (id bigint, upload_session_id bigint, ai_status text,
  suggested_document_type_id bigint, extracted_fields_json jsonb, raw_response_json jsonb);
create table erp_private.f07_intake_analyses (result_id bigint, upload_session_id bigint, source_sha256 text);
create table public.audit_logs (actor_user_profile_id bigint, owner_company_id bigint, branch_id bigint,
  module_code text, entity_name text, entity_id bigint, entity_reference text, action text, new_values jsonb);
create table erp_private.f07_intake_discard_receipts (upload_session_id bigint, actor_id bigint, document_id bigint);
create table erp_private.agent_connections (id uuid primary key, runtime_login name not null);
create table erp_private.agent_sync_checkpoints (
  connection_id uuid primary key references erp_private.agent_connections(id), paused boolean not null
);
create table erp_private.agent_source_versions (
  connection_id uuid, item_id text, version text, mime text, size_bytes bigint, discovered_at timestamptz default now(),
  primary key (connection_id, item_id, version)
);
create table erp_private.agent_source_items (
  connection_id uuid, item_id text, version text, filename text, available boolean,
  primary key (connection_id, item_id)
);

insert into public.user_profiles values (101, 'active', 1, null), (102, 'active', 2, null), (103, 'active', 1, null);
insert into erp_private.fixture_permissions values
  ('00000000-0000-4000-8000-000000000101', 1, null, 'dms.documents.upload'),
  ('00000000-0000-4000-8000-000000000102', 2, null, 'dms.documents.upload');
create function public.current_user_profile_id() returns bigint language sql stable set search_path = '' as $$
  select case auth.uid()::text
    when '00000000-0000-4000-8000-000000000101' then 101
    when '00000000-0000-4000-8000-000000000102' then 102 end::bigint
$$;
create function erp_private.batch_integer(p_value jsonb, p_min bigint, p_max bigint)
returns boolean language sql immutable set search_path = '' as $$
  select case when p_value::text ~ '^[0-9]+$' then p_value::text::numeric between p_min and p_max else false end
$$;
create function erp_private.upload_session_permission(p_session bigint, p_permission text)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.dms_upload_sessions s where s.id=p_session
    and erp_private.permission_in_scope(p_permission, s.owning_company_id, s.owning_branch_id))
$$;

insert into erp_private.agent_connections values
  ('10000000-0000-4000-8000-000000000001', 'erp_agent_discovery_runtime'),
  ('10000000-0000-4000-8000-000000000002', 'erp_agent_discovery_runtime');
insert into erp_private.agent_sync_checkpoints select id, false from erp_private.agent_connections;
insert into erp_private.agent_source_versions (connection_id,item_id,version,mime,size_bytes)
  select id, 'synthetic', 'version-1', 'application/pdf', 12 from erp_private.agent_connections;
insert into erp_private.agent_source_items
  select id, 'synthetic', 'version-1', 'synthetic.pdf', true from erp_private.agent_connections;
commit;
