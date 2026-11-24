-- Dedicated loopback database only. This is a minimal synthetic model of the
-- already deployed F03/pilot schema, not an ERP schema bootstrap.
do $fixture$
begin
  if inet_server_addr() is not null and host(inet_server_addr()) not in ('127.0.0.1', '::1') then
    raise exception 'Projection fixtures require a dedicated loopback PostgreSQL database';
  end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end
$fixture$;

create schema erp_private;
grant usage on schema erp_private to authenticated;
create table public.owner_companies(id bigint primary key, short_name text, legal_name_en text, company_code text, status text);
create table public.branches(id bigint primary key, owner_company_id bigint, branch_name_en text, branch_code text, status text);
create table public.dms_upload_sessions(id bigint primary key, original_filename text, session_code text, uploaded_by bigint, owning_company_id bigint, owning_branch_id bigint, sha256_hash text, deleted_at timestamptz, document_id bigint, duplicate_document_id bigint, ai_job_id bigint, approve_run_id bigint, status text, intake_status text, uploaded_at timestamptz, discarded_at timestamptz, updated_at timestamptz, subject_visible boolean not null default true);
create table public.dms_documents(id bigint primary key, title text, document_no text, owning_company_id bigint, owning_branch_id bigint, deleted_at timestamptz, protected boolean not null default false);
create table public.dms_ai_extraction_jobs(id bigint primary key, upload_session_id bigint, status text, started_at timestamptz, completed_at timestamptz, updated_at timestamptz);
create table public.dms_review_queue(id bigint primary key, upload_session_id bigint, deleted_at timestamptz, status text, queued_at timestamptz, resolved_at timestamptz, updated_at timestamptz);
create table public.dms_approve_runs(id bigint primary key, upload_session_id bigint, document_id bigint, status text, completed_at timestamptz);
create table erp_private.agent_pdf_work(connection_id uuid, item_id text, version text, operation_id uuid primary key, actor_id bigint, company_id bigint, sha256 text, status text, session_id bigint, review_id bigint, matching_document_ids bigint[]);
create table erp_private.agent_source_versions(connection_id uuid,item_id text,version text,discovered_at timestamptz,primary key(connection_id,item_id,version));
create table erp_private.agent_pdf_policy(connection_id uuid primary key, company_id bigint, enabled boolean);
create table erp_private.agent_sync_checkpoints(connection_id uuid primary key, updated_at timestamptz, paused boolean, revision bigint);
create table erp_private.agent_employee_link_receipts(operation_id uuid primary key,document_id bigint,approve_run_id bigint,outcome text,created_at timestamptz);
create table erp_private.f07_single_upload_admissions(actor_id bigint,operation_id uuid,upload_session_id bigint,primary key(actor_id,operation_id));

-- Fixture auth predicates with the same interface as current F03. Covers scope
-- and revoked sessions and injects subject/document denials into both joins.
create function erp_private.business_principal_is_active() returns bool
language sql stable as 'select current_setting(''agentcenter.principal'',true) in (''company'',''branch'',''other'')';
create function erp_private.permission_in_scope(code text, company bigint, branch bigint) returns bool
language sql stable as $$
  select erp_private.business_principal_is_active() and code in ('dms.documents.view','dms.documents.review_ai') and
  ((current_setting('agentcenter.principal',true)='company' and company=1)
    or (current_setting('agentcenter.principal',true)='branch' and company=1 and branch=11)
    or (current_setting('agentcenter.principal',true)='other' and company=2))
$$;
create function erp_private.f07_upload_subject_allowed(session_id bigint) returns bool
language sql stable as $$
 select exists(select 1 from public.dms_upload_sessions s where s.id=$1 and s.subject_visible
   and erp_private.permission_in_scope('dms.documents.review_ai',s.owning_company_id,s.owning_branch_id))
$$;
create function erp_private.document_permission(document_id bigint,capability text) returns bool
language sql stable as $$
 select exists(select 1 from public.dms_documents d where d.id=$1 and not d.protected and
   erp_private.permission_in_scope(capability,d.owning_company_id,d.owning_branch_id))
$$;

insert into public.owner_companies values (1,'ALGT','Legacy ALGT','ALGT','active'),(2,'Other','Other','OTHER','active');
insert into public.branches values (11,1,'Allowed','A','active'),(12,1,'Sibling','B','active'),(21,2,'Other branch','C','active');
insert into erp_private.agent_pdf_policy values ('10000000-0000-0000-0000-000000000001',1,true);
insert into erp_private.agent_sync_checkpoints values ('10000000-0000-0000-0000-000000000001',now(),false,20);
insert into public.dms_documents values
  (1,'Verified receipt','DMS-VERIFIED',1,11,null,false),
  (2,'Confidential match','DMS-SECRET',1,11,null,true);
insert into public.dms_upload_sessions(id,original_filename,session_code,uploaded_by,owning_company_id,owning_branch_id,sha256_hash,document_id,ai_job_id,approve_run_id,status,intake_status,uploaded_at,updated_at,subject_visible) values
  (1,'CICPA Onshore','INT-A',30,1,11,'hash-a',null,1,null,'uploaded','review_pending',now(),now(),true),
  (2,'Sibling case','INT-B',30,1,12,'hash-b',null,null,null,'uploaded','uploaded',now(),now(),true),
  (3,'Confidential lead','INT-C',30,1,11,'hash-c',null,null,null,'uploaded','uploaded',now(),now(),false),
  (4,'Private duplicate','INT-D',30,1,11,'hash-d',null,null,null,'uploaded','review_pending',now(),now(),true),
  (5,'Company-wide','INT-E',30,1,null,'hash-e',null,null,null,'uploaded','uploaded',now(),now(),true),
  (6,'Just-filed case','INT-F',30,1,11,'hash-f',1,null,6,'completed','approved',now(),now(),true),
  (7,'Known failed','INT-G',30,1,11,'hash-g',null,7,null,'uploaded','ai_failed',now(),now(),true),
  (8,'Unconfirmed terminal clock','INT-H',30,1,11,'hash-h',null,null,null,'uploaded','ai_failed',now(),now(),true),
  (9,'Other company','INT-I',31,2,21,'hash-i',null,null,null,'uploaded','uploaded',now(),now(),true),
  (10,'Old review','INT-J',30,1,11,'hash-j',null,null,null,'uploaded','review_pending',now()-interval '2 days',now()-interval '2 days',true);
insert into public.dms_ai_extraction_jobs values (1,1,'complete',now(),now(),now()), (7,7,'failed',now(),now(),now());
insert into public.dms_review_queue values (1,1,null,'assigned',now(),null,now()), (10,10,null,'assigned',now()-interval '2 days',null,now()-interval '2 days');
insert into public.dms_approve_runs values (6,6,1,'completed',now());
insert into erp_private.agent_source_versions
select '10000000-0000-0000-0000-000000000001', id::text, 'v1', now()-interval '2 days'
from generate_series(1,11) id;
insert into erp_private.agent_pdf_work
select '10000000-0000-0000-0000-000000000001', id::text,'v1', ('20000000-0000-0000-0000-'||lpad(id::text,12,'0'))::uuid,
  case when id=9 then 31 else 30 end, case when id=9 then 2 else 1 end,
  'hash-'||chr(96+id), case when id in (4,11) then 'duplicate' else 'review_pending' end,
  case when id in (1,11) then null else id end,case when id in (1,10) then id end,
  case when id=4 then array[2::bigint] end
from generate_series(1,11) id;
insert into erp_private.f07_single_upload_admissions values (30,'20000000-0000-0000-0000-000000000001',1);



alter table erp_private.agent_pdf_work add column lease_until timestamptz;

create or replace function erp_private.business_principal_is_active() returns bool
language sql stable as 'select current_setting(''agentcenter.principal'',true) in (''company'',''branch'',''other'',''viewer'',''reviewer'')';
create or replace function erp_private.permission_in_scope(code text, company bigint, branch bigint) returns bool
language sql stable as $$
  select erp_private.business_principal_is_active()
  and ((current_setting('agentcenter.principal',true) in ('company','reviewer') and company=1
      and code in ('dms.documents.view','dms.documents.review_ai'))
   or (current_setting('agentcenter.principal',true)='viewer' and company=1 and code='dms.documents.view')
   or (current_setting('agentcenter.principal',true)='branch' and company=1 and branch=11
     and code in ('dms.documents.view','dms.documents.review_ai'))
   or (current_setting('agentcenter.principal',true)='other' and company=2
     and code in ('dms.documents.view','dms.documents.review_ai')))
$$;
create or replace function erp_private.f07_upload_subject_allowed(session_id bigint) returns bool
language sql stable as $$
  select exists (select 1 from public.dms_upload_sessions s where s.id=$1 and s.subject_visible)
$$;
create function erp_private.upload_session_allowed(session_id bigint) returns bool
language sql stable as $$
 select exists(select 1 from public.dms_upload_sessions s where s.id=$1 and s.deleted_at is null
   and erp_private.permission_in_scope('dms.documents.review_ai',s.owning_company_id,s.owning_branch_id))
$$;
