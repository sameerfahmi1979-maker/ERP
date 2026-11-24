\set ON_ERROR_STOP on
begin;

do $fixture$
begin
  if current_database() <> 'dms_index_snapshot_synthetic' or inet_server_addr() is not null
    or current_setting('cron.launch_active_jobs') <> 'off'
    or exists (select 1 from public.dms_upload_sessions)
    or exists (select 1 from public.dms_documents) then
    raise exception 'An empty disconnected SharePoint index fixture is required';
  end if;
end $fixture$;

create function pg_temp.check_index(p_assertion boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_assertion is distinct from true then raise exception 'Index assertion: %', p_label; end if;
end;
$$;

create function pg_temp.expect_index_denial(p_company bigint, p_branch bigint)
returns void language plpgsql as $$
begin
  perform erp_private.capture_sharepoint_br1_index_snapshot(
    'ac000000-0000-4000-8000-000000000001', p_company, p_branch
  );
  raise exception 'Unexpected SharePoint index scope grant';
exception when insufficient_privilege then
  return;
end;
$$;

create function pg_temp.capture_index() returns jsonb language sql as $$
  select erp_private.capture_sharepoint_br1_index_snapshot(
    'ac000000-0000-4000-8000-000000000001', 993401, 993401);
$$;

select pg_temp.check_index(
  not has_function_privilege('anon','erp_private.capture_sharepoint_br1_index_snapshot(uuid,bigint,bigint)','EXECUTE')
  and not has_function_privilege('authenticated','erp_private.capture_sharepoint_br1_index_snapshot(uuid,bigint,bigint)','EXECUTE')
  and not has_function_privilege('service_role','erp_private.capture_sharepoint_br1_index_snapshot(uuid,bigint,bigint)','EXECUTE')
  and not has_function_privilege('erp_agent_discovery_runtime','erp_private.capture_sharepoint_br1_index_snapshot(uuid,bigint,bigint)','EXECUTE')
  and not has_table_privilege('erp_agent_discovery_runtime','erp_private.dms_sharepoint_br1_index_snapshots','SELECT')
  and not exists (select 1 from erp_private.dms_sharepoint_br1_index_snapshots),
  'default-off snapshot and no application or discovery grant'
);
select pg_temp.expect_index_denial(993401,993401);

-- Establish synthetic committed-state fixtures outside application command paths.
set local session_replication_role=replica;
insert into public.owner_companies(id,company_code,legal_name_en,status) overriding system value values
  (993401,'ALGT','Synthetic company','active'),(993402,'SYN-INDEX','Synthetic other company','active');
insert into public.branches(id,owner_company_id,branch_code,branch_name_en,status) overriding system value values
  (993401,993401,'BR1','Synthetic branch','active'),(993402,993401,'BR2','Synthetic sibling','active');
insert into auth.users(id,email) values
  ('ac000000-0000-4000-8000-000000000002','index-uploader@example.invalid'),
  ('ac000000-0000-4000-8000-000000000003','index-officer@example.invalid');
insert into public.user_profiles (id,auth_user_id,user_code,full_name,status,must_change_password)
overriding system value values
  (993401,'ac000000-0000-4000-8000-000000000002','SYN-IDX-UP','Private Uploader','active',false),
  (993402,'ac000000-0000-4000-8000-000000000003','SYN-IDX-OF','Private Officer','active',false);
insert into erp_private.agent_connections(id,runtime_login,tenant_id,client_id,drive_id,source_folder_id,index_folder_id)
values ('ac000000-0000-4000-8000-000000000001','index_fixture_runtime',
  'ac000000-0000-4000-8000-000000000004','ac000000-0000-4000-8000-000000000005',
  'SyntheticDrive','SyntheticSource','SyntheticIndex');
insert into erp_private.agent_sync_checkpoints(connection_id,cursor,revision,paused,updated_at)
values ('ac000000-0000-4000-8000-000000000001','SyntheticCursor',5,false,'2026-11-20 10:00:00+00');
insert into erp_private.agent_pdf_policy(connection_id,company_id,actor_id,officer_id,from_time,enabled)
values ('ac000000-0000-4000-8000-000000000001',993401,993401,993402,'2026-11-19 10:00:00+00',true);
insert into erp_private.dms_agent_center_controls(company_id,branch_id,agent_key,worker_bound,enabled,mode)
values (993401,993401,'dms.intake',true,true,'execute');
insert into erp_private.dms_sharepoint_br1_review_scope
  (connection_id,company_id,branch_id,actor_id,officer_id,item_id,source_version,sha256,expires_at)
values ('ac000000-0000-4000-8000-000000000001',993401,993401,993401,993402,
  'selected-item','c:version1',repeat('a',64),clock_timestamp() + interval '1 day');
insert into erp_private.agent_source_versions(connection_id,item_id,version,mime,size_bytes,discovered_at)
values ('ac000000-0000-4000-8000-000000000001','selected-item','c:version1','application/pdf',12,'2026-11-20 09:00:00+00'),
  ('ac000000-0000-4000-8000-000000000001','unapproved-item','c:version9','application/pdf',12,'2026-11-20 09:00:00+00');
insert into erp_private.agent_source_items(connection_id,item_id,version,filename,ancestor_ids)
values ('ac000000-0000-4000-8000-000000000001','selected-item','c:version1','Private Person Passport.pdf',array['SyntheticSource']),
  ('ac000000-0000-4000-8000-000000000001','unapproved-item','c:version9','Private Sibling Identity.pdf',array['SyntheticSource']);
set local session_replication_role=origin;

select pg_temp.expect_index_denial(993402,993401);
select pg_temp.expect_index_denial(993401,993402);
select pg_temp.expect_index_denial(993401,null);

create temporary table snapshots (step text primary key, payload jsonb);
insert into snapshots values ('discovered',pg_temp.capture_index());
select pg_temp.check_index(payload->'snapshot' @> '{"revision":1,"checkpoint_revision":5,
  "sources":[{"source_item_id":"selected-item","source_version":"c:version1","source_state":"present"}],"receipts":[]}'
  and jsonb_array_length(payload#>'{snapshot,sources}')=1 and payload=pg_temp.capture_index(),
  'one enrolled source, stable bytes on exact replay') from snapshots where step='discovered';

set local session_replication_role=replica;
insert into public.dms_document_categories(id,category_code,name_en) overriding system value
values (993401,'SYN_INDEX','Synthetic category');
insert into public.dms_document_types(id,type_code,name_en,category_id) overriding system value
values (993401,'SYN_INDEX_CARD','Synthetic document type',993401);
insert into public.dms_upload_sessions
  (id, session_code, uploaded_by, owning_company_id, owning_branch_id, original_filename, mime_type, file_size_bytes,
  sha256_hash, temp_storage_path, status, intake_status, review_status, approve_status, reviewed_by, approve_run_id,
  document_id, approved_at, expires_at)
overriding system value values
  (993401,'SYN-INDEX-SESSION',993401,993401,993401,'Private Person Passport.pdf','application/pdf',12,
  repeat('a',64),'synthetic/private/temp.pdf','completed','approved','approved','completed',993402,993401,
  993401,now(),now()+interval '1 day');
insert into erp_private.agent_pdf_work (connection_id,item_id,version,operation_id,company_id,actor_id,sha256,status,session_id)
values ('ac000000-0000-4000-8000-000000000001','selected-item','c:version1',
  'ac000000-0000-4000-8000-000000000006',993401,993401,repeat('a',64),'reviewed',993401);
insert into public.dms_documents
  (id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,status,current_version_id)
overriding system value values (993401,'DMS-1900-994031','Private Employee Passport',993401,993401,993401,993401,'active',993401);
insert into public.dms_document_versions(id,document_id,version_number,is_current) overriding system value
values (993401,993401,1,true);
insert into public.dms_document_files
  (id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash)
overriding system value values (993401,993401,993401,'original','dms-documents','synthetic/private/filed.pdf',
  'Private Filed Original.pdf','application/pdf',12,repeat('a',64));
insert into public.dms_approve_runs
  (id,run_key,upload_session_id,document_id,status,started_by,final_storage_bucket,final_storage_path)
overriding system value values (993401,'f06-ai:993402:ac000000-0000-4000-8000-000000000007',993401,993401,
  'completed',993402,'dms-documents','synthetic/private/filed.pdf');
insert into erp_private.ai_approval_plans
  (actor_id,operation_id,request_hash,request_json,upload_session_id,reference_id,document_id,document_no,approve_run_id,
  storage_path,result,completed_at)
values (993402,'ac000000-0000-4000-8000-000000000007',repeat('c',64),
  '{"owningCompanyId":993401,"owningBranchId":993401,"documentTypeId":993401}',993401,993401,993401,
  'DMS-1900-994031',993401,'synthetic/private/filed.pdf',
  '{"documentId":993401,"documentNo":"DMS-1900-994031","upload_session_id":993401,"operation_id":"ac000000-0000-4000-8000-000000000007","approve_run_id":993401,"file_id":993401,"completed":true,"replayed":false}',now());
insert into erp_private.ai_approval_verified_copies
  (actor_id,operation_id,verified_session_id,request_hash,object_id,object_version,object_updated_at,content_sha256,file_size_bytes,file_name)
values (993402,'ac000000-0000-4000-8000-000000000007','ac000000-0000-4000-8000-000000000008',repeat('c',64),
  'ac000000-0000-4000-8000-000000000009','SyntheticStorageVersion','2026-11-20 10:00:00+00',
  repeat('a',64),12,'Private Filed Original.pdf');
insert into storage.objects(id,bucket_id,name,version,updated_at,metadata)
values ('ac000000-0000-4000-8000-000000000009','dms-documents','synthetic/private/filed.pdf',
  'SyntheticStorageVersion','2026-11-20 10:00:00+00','{"size":12,"mimetype":"application/pdf"}');
insert into public.dms_document_events(document_id,event_type,description,performed_by,metadata_json)
values (993401,'approve_save_db_transaction_completed','Synthetic canonical completion',993402,
  '{"operation_id":"ac000000-0000-4000-8000-000000000007","approve_run_id":993401,"file_id":993401,"version_id":993401}');
set local session_replication_role=origin;

select pg_temp.check_index(not (pg_temp.capture_index()::text like '%DMS-1900-994031%'),
  'ordinary intake even with a completed approval cannot enter a SharePoint projection without an origin');

set local session_replication_role=replica;
update erp_private.agent_pdf_work set status='duplicate'
where operation_id='ac000000-0000-4000-8000-000000000006';
set local session_replication_role=origin;
insert into snapshots values ('duplicate_advisory',pg_temp.capture_index());
select pg_temp.check_index(payload#>'{snapshot,receipts,0}' @> '{"processing_status":"exception",
    "outcome":null,"review_reason":"duplicate_suspected","document_read_back":false}',
  'a matching duplicate search is advisory and does not skip or file the source')
from snapshots where step='duplicate_advisory';

set local session_replication_role=replica;
insert into erp_private.dms_sharepoint_intake_origins
  (operation_id,upload_session_id,connection_id,item_id,source_version,owner_id,company_id,branch_id,
  filename,sha256,file_size_bytes,temp_storage_path)
values ('ac000000-0000-4000-8000-000000000006',993401,'ac000000-0000-4000-8000-000000000001',
  'selected-item','c:version1',993401,993401,993401,'Private Person Passport.pdf',repeat('a',64),12,'synthetic/private/temp.pdf');
insert into erp_private.f07_single_upload_admissions
  (actor_id,operation_id,request,upload_session_id,acknowledged_at)
values (993401,'ac000000-0000-4000-8000-000000000006','{}',993401,now());
insert into public.dms_ai_extraction_jobs(id,upload_session_id,job_type,status) overriding system value
values (993401,993401,'extract','complete');
insert into public.dms_ai_extraction_results(id,upload_session_id,job_id) overriding system value
values (993401,993401,993401);
insert into public.dms_review_queue(id,upload_session_id,ai_result_id,assigned_to,status,review_type)
overriding system value values (993401,993401,993401,993402,'assigned','intake_metadata_review');
insert into erp_private.notification_events(id,event_key,source_table,source_id,event_type,actor_id,source_snapshot)
overriding system value values (993401,'synthetic-index-review','dms_review_queue',993401,
  'dms_review_queue_assigned',993401,'{"assigned_to":993401}');
insert into erp_private.dms_sharepoint_br1_review_state
  (operation_id,upload_session_id,officer_id,object_id,object_version,object_updated_at,result_id,review_id,
  notification_event_id,output_sha256)
values ('ac000000-0000-4000-8000-000000000006',993401,993402,
  'ac000000-0000-4000-8000-000000000010','SyntheticTempVersion',now(),993401,993401,993401,repeat('d',64));
update erp_private.agent_pdf_work set status='review_pending',review_id=993401
where operation_id='ac000000-0000-4000-8000-000000000006';
update public.dms_upload_sessions set status='uploaded',intake_status='review_pending',review_status='pending',
  ai_job_id=993401,ai_result_id=993401 where id=993401;
set local session_replication_role=origin;
select pg_temp.check_index(pg_temp.capture_index()#>>'{snapshot,receipts,0,processing_status}' = 'exception',
  'an assigned queue without the matching notification receipt does not qualify as awaiting review');

set local session_replication_role=replica;
update erp_private.notification_events set source_snapshot='{"assigned_to":993402}' where id=993401;
set local session_replication_role=origin;
insert into snapshots values ('awaiting_review',pg_temp.capture_index());
select pg_temp.check_index(payload#>'{snapshot,receipts,0}' @> '{"processing_status":"awaiting_review",
    "outcome":null,"review_reason":"sharepoint_intake_ready","document_read_back":false}',
  'exact review, job, result and notification produce awaiting review')
from snapshots where step='awaiting_review';

set local session_replication_role=replica;
update erp_private.agent_pdf_work set status='reviewed'
where operation_id='ac000000-0000-4000-8000-000000000006';
update public.dms_upload_sessions set status='completed',intake_status='approved',review_status='approved' where id=993401;
set local session_replication_role=origin;

insert into snapshots values ('filed',pg_temp.capture_index());
select pg_temp.check_index(
  (payload#>>'{snapshot,revision}')::bigint > (prior.discovered#>>'{snapshot,revision}')::bigint
  and payload#>>'{checkpoint,revision}' = prior.discovered#>>'{checkpoint,revision}'
  and payload#>'{snapshot,receipts,0}' @> '{"document_read_back":true,"outcome":"filed",
    "processing_status":"complete","dms_document_number":"DMS-1900-994031","document_type_code":"SYN_INDEX_CARD"}'
  and payload=pg_temp.capture_index()
  and payload::text !~* 'private|synthetic/(temp|filed)|employee_number|raw_ocr|passport|syntheticcursor|operation_id|upload_session_id',
  'committed filing advances processing without discovery and contains only allowlisted operational data')
from snapshots cross join (select s.payload as discovered from snapshots s where step='discovered') prior
where step='filed';

set local session_replication_role=replica;
update public.dms_documents set owning_branch_id=993402 where id=993401;
set local session_replication_role=origin;
insert into snapshots values ('wrong_branch',pg_temp.capture_index());
select pg_temp.check_index(payload#>'{snapshot,receipts,0}' @> '{"processing_status":"exception","outcome":null,"document_read_back":false}'
  and payload::text not like '%DMS-1900-994031%', 'sibling-branch filing must never leak into the manifest')
from snapshots where step='wrong_branch';

set local session_replication_role=replica;
update public.dms_documents set owning_branch_id=993401 where id=993401;
update storage.objects set version='AnotherStorageVersion' where id='ac000000-0000-4000-8000-000000000009';
set local session_replication_role=origin;
select pg_temp.check_index(pg_temp.capture_index()#>>'{snapshot,receipts,0,outcome}' is null,
  'replacement bytes at a previously verified object path lack filing proof');

set local session_replication_role=replica;
update storage.objects set version='SyntheticStorageVersion' where id='ac000000-0000-4000-8000-000000000009';
set local session_replication_role=origin;
select pg_temp.check_index(pg_temp.capture_index()#>>'{snapshot,receipts,0,outcome}' = 'filed',
  'original exact storage identity restores qualifying filing');
update erp_private.agent_source_items set available=false
  where connection_id='ac000000-0000-4000-8000-000000000001' and item_id='selected-item';
update erp_private.agent_sync_checkpoints set revision=revision+1,updated_at=clock_timestamp()
  where connection_id='ac000000-0000-4000-8000-000000000001';
insert into snapshots values ('removed',pg_temp.capture_index());
select pg_temp.check_index(payload#>>'{snapshot,sources,0,source_state}'='removed'
  and payload#>>'{snapshot,receipts,0,outcome}'='filed', 'source removal preserves independently confirmed historical filing')
from snapshots where step='removed';

update erp_private.dms_sharepoint_br1_review_scope set expires_at=clock_timestamp()-interval '1 second'
  where connection_id='ac000000-0000-4000-8000-000000000001';
select pg_temp.expect_index_denial(993401,993401);
select jsonb_build_object('step',step,'projectionInput',payload) from snapshots order by step;
rollback;
