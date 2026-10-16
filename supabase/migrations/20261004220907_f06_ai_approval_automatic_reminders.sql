begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Restore only automatic single-file AI approval expiry defaults. Manual reminder
-- RLS is unchanged. The public finish remains invoker; the existing private
-- completion verifier proves every other fact around the fixed six-row insert.
-- Reviewed against frozen SQL71 SHA256:
-- af63a8897a38aaf02485f659d29133bdab1f7b53a13e184b2bd087de3ffae31b

create or replace function erp_private.complete_ai_approval(p_operation uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor bigint:=public.current_user_profile_id(); plan erp_private.ai_approval_plans;
 proof erp_private.ai_approval_verified_copies; d record; f record;
 receipt jsonb; expected jsonb; actual jsonb; metadata jsonb;
 source_id bigint; h text; proof_pass integer; affected integer;
begin
 perform erp_private.validate_ai_approval_request(p_request,true);
 perform erp_private.assert_ai_approval_authority(p_request);
 if p_operation is null then raise exception 'Approval identity required' using errcode='22023';end if;
 h:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');

 -- Read only the current actor's protected identity before choosing a lock.
 select * into plan from erp_private.ai_approval_plans
  where actor_id=actor and operation_id=p_operation;
 if not found or plan.request_json is distinct from p_request or plan.request_hash is distinct from h then
  raise exception 'Approval receipt unavailable' using errcode='42501';end if;
 source_id:=plan.upload_session_id;
 -- Source -> plan, including direct completion calls; never the inverse.
 perform id from public.dms_upload_sessions where id=source_id and deleted_at is null for update;
 if not found then raise exception 'Approval source unavailable' using errcode='42501';end if;
 perform erp_private.assert_ai_approval_authority(p_request);
 select * into plan from erp_private.ai_approval_plans
  where actor_id=actor and operation_id=p_operation for update;
 if not found or plan.upload_session_id is distinct from source_id
  or plan.request_json is distinct from p_request or plan.request_hash is distinct from h then
  raise exception 'Approval receipt unavailable' using errcode='42501';end if;
 perform erp_private.assert_ai_approval_authority(p_request);
 if public.current_user_profile_id() is distinct from actor then
  raise exception 'Approval principal changed' using errcode='42501';end if;
 if plan.result is not null then
  if not coalesce(public.current_user_can_view_dms_document(plan.document_id),false) then
   raise exception 'Approval document unavailable' using errcode='42501';end if;
  -- Never inspect/rebuild/default reminders on a completed replay.
  return plan.result||jsonb_build_object('replayed',true);
 end if;
 select * into proof from erp_private.ai_approval_verified_copies
  where actor_id=actor and operation_id=p_operation;
 if not found then raise exception 'Approval file proof unavailable' using errcode='42501';end if;
 perform erp_private.assert_ai_approval_copy(p_operation,p_request,proof.file_name);
 perform id from public.dms_documents where id=plan.document_id and deleted_at is null for update;
 if not found then raise exception 'Approval document facts incomplete' using errcode='PT409';end if;

 for proof_pass in 1..2 loop
  perform erp_private.assert_ai_approval_authority(p_request);
  if public.current_user_profile_id() is distinct from actor then
   raise exception 'Approval principal changed' using errcode='42501';end if;
  perform erp_private.assert_ai_approval_copy(p_operation,p_request,proof.file_name);
  -- A definer SELECT is NOT a caller-RLS read. Use the existing live subject
  -- predicate: current principal, company/branch, confidentiality and linked
  -- employee/medical/insurance/dependent evidence all remain authoritative.
  if not coalesce(public.current_user_can_view_dms_document(plan.document_id),false)
   or not coalesce(public.f03_has_document_permission(plan.document_id,'dms.documents.upload'),false)
   or not coalesce(public.f03_has_document_permission(plan.document_id,'dms.documents.edit'),false)
   or not coalesce(public.f03_has_document_permission(plan.document_id,'dms.documents.preview'),false) then
   raise exception 'Approval document unavailable' using errcode='42501';end if;

  select id,document_no,title,description,document_type_id,category_id,status,confidentiality_level,owner_user_id,owning_company_id,owning_branch_id,party_id,
   issue_date,expiry_date,created_by,current_version_id,is_archived,expiry_tracking_override into d from public.dms_documents where id=plan.document_id and deleted_at is null;
  if not found or d.is_archived or d.expiry_tracking_override is not null
   or row(d.document_no,d.title,d.description,d.document_type_id,d.category_id,d.status,d.confidentiality_level,d.owner_user_id,
    d.owning_company_id,d.owning_branch_id,d.party_id,d.issue_date,d.expiry_date,d.created_by)
   is distinct from row(plan.document_no,btrim(p_request->>'title'),nullif(p_request->>'description',''),(p_request->>'documentTypeId')::bigint,
    (p_request#>>'{prepared,type,category_id}')::bigint,'active'::text,coalesce(p_request->>'confidentialityLevel',p_request#>>'{prepared,type,default_confidentiality}'),actor,
    (p_request->>'owningCompanyId')::bigint,(p_request->>'owningBranchId')::bigint,(p_request->>'partyId')::bigint,nullif(p_request->>'issueDate','')::date,nullif(p_request->>'expiryDate','')::date,actor) then
   raise exception 'Approval document facts incomplete' using errcode='PT409';end if;
  select x.id,x.version_id into f from public.dms_document_files x join public.dms_document_versions v on v.id=x.version_id
   where x.document_id=d.id and v.document_id=d.id and v.id=d.current_version_id and v.version_number=1 and v.is_current and v.created_by=actor
    and x.file_role='original' and x.storage_bucket='dms-documents' and x.storage_path=plan.storage_path and x.file_name=proof.file_name
    and x.mime_type=p_request#>>'{prepared,source,mime_type}' and x.file_size_bytes=proof.file_size_bytes and x.sha256_hash=proof.content_sha256
    and x.created_by=actor and x.deleted_at is null;
  if not found or (select count(*) from public.dms_document_files where document_id=d.id and deleted_at is null)<>1
   or (select count(*) from public.dms_document_versions where document_id=d.id)<>1 then raise exception 'Approval file facts incomplete' using errcode='PT409';end if;
  metadata:=erp_private.ai_approval_metadata(p_request);
  select coalesce(jsonb_agg(jsonb_build_object('definition_id',m.definition_id,'value_text',m.value_text,'value_number',m.value_number,'value_date',m.value_date,
   'value_datetime',m.value_datetime,'value_boolean',m.value_boolean,'value_json',m.value_json) order by m.definition_id),'[]'::jsonb) into actual
   from public.dms_document_metadata_values m where document_id=d.id and deleted_at is null;
  if actual is distinct from metadata then raise exception 'Approval metadata incomplete' using errcode='PT409';end if;
  select coalesce(jsonb_agg(v order by v::text::bigint),'[]'::jsonb) into expected from jsonb_array_elements(p_request->'tagIds') v;
  select coalesce(jsonb_agg(tag_id order by tag_id),'[]'::jsonb) into actual from public.dms_document_tags where document_id=d.id;
  if actual is distinct from expected then raise exception 'Approval tags incomplete' using errcode='PT409';end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind',v->>'entityType','id',(v->>'entityId')::bigint,'role',coalesce(nullif(v->>'linkRole',''),'related'),'primary',coalesce((v->>'isPrimary')::boolean,false)) order by v->>'entityType',(v->>'entityId')::bigint),'[]'::jsonb)
   into expected from jsonb_array_elements(p_request->'links') v;
  select coalesce(jsonb_agg(jsonb_build_object('kind',entity_type,'id',entity_id,'role',link_role,'primary',is_primary) order by entity_type,entity_id),'[]'::jsonb)
   into actual from public.dms_document_links where document_id=d.id and deleted_at is null;
  if actual is distinct from expected then raise exception 'Approval links incomplete' using errcode='PT409';end if;

  if not exists(select 1 from public.dms_upload_sessions where id=plan.upload_session_id and document_id=d.id and status='completed' and intake_status='approved'
    and review_status='approved' and reviewed_by=actor and approve_run_id=plan.approve_run_id and approve_status='completed' and deleted_at is null)
   or not exists(select 1 from public.dms_approve_runs where id=plan.approve_run_id and upload_session_id=plan.upload_session_id and document_id=d.id
    and run_key='f06-ai:'||actor||':'||p_operation and status='completed' and started_by=actor and final_storage_path=plan.storage_path and final_storage_bucket='dms-documents')
   or (p_request#>>'{prepared,analysis_result_id}' is not null and not exists(select 1 from public.dms_ai_extraction_results
    where id=(p_request#>>'{prepared,analysis_result_id}')::bigint and upload_session_id=plan.upload_session_id and document_id=d.id and ai_status='accepted' and review_action='accepted' and reviewed_by=actor))
   or not exists(select 1 from public.global_numbering_generated_references where id=plan.reference_id and generated_by=actor and generation_status='consumed'
    and target_table_name='dms_documents' and target_record_id=d.id and generation_reason='F06 AI approval '||plan.request_hash)
   or not exists(select 1 from public.dms_document_events where document_id=d.id and performed_by=actor and event_type='document_created_from_ai_intake' and metadata_json->>'operation_id'=p_operation::text)
   or not exists(select 1 from public.dms_document_events where document_id=d.id and performed_by=actor and event_type='approve_save_db_transaction_completed' and metadata_json->>'operation_id'=p_operation::text)
   or not exists(select 1 from public.dms_document_events where document_id=d.id and performed_by=actor and event_type='file_uploaded' and metadata_json->>'operation_id'=p_operation::text and (metadata_json->>'file_id')::bigint=f.id)
   or not exists(select 1 from public.audit_logs where actor_user_profile_id=actor and entity_name='dms_documents' and entity_id=d.id and new_values->>'event'='single_file_ai_approval_completed' and new_values->>'operation_id'=p_operation::text) then
   raise exception 'Approval completion facts incomplete' using errcode='PT409';end if;

  if proof_pass=1 then
   -- Even an exact pre-existing schedule is not an instruction to overwrite,
   -- adopt, repair or reset manual rows for an unfinished operation.
   if exists(select 1 from public.dms_expiry_reminders where document_id=d.id) then
    raise exception 'Approval reminders already exist' using errcode='PT409';end if;
   perform erp_private.assert_ai_approval_authority(p_request);
   if public.current_user_profile_id() is distinct from actor then
    raise exception 'Approval principal changed' using errcode='42501';end if;
   if not coalesce(public.current_user_can_view_dms_document(d.id),false) then
    raise exception 'Approval document unavailable' using errcode='42501';end if;
   if d.expiry_date is not null then
    insert into public.dms_expiry_reminders(document_id,reminder_days_before,reminder_date,status)
     select d.id,schedule.day_offset,d.expiry_date-schedule.day_offset,'pending'
     from unnest(array[90,60,30,14,7,1]) as schedule(day_offset);
   end if;
   -- The second full proof runs after any insertion wait, before a receipt.
  else
   select coalesce(jsonb_agg(jsonb_build_object('days',n,'date',d.expiry_date-n,'status','pending') order by n),'[]'::jsonb) into expected
    from unnest(array[90,60,30,14,7,1]) n where d.expiry_date is not null;
   select coalesce(jsonb_agg(jsonb_build_object('days',reminder_days_before,'date',reminder_date,'status',status) order by reminder_days_before),'[]'::jsonb)
    into actual from public.dms_expiry_reminders where document_id=d.id;
   if actual is distinct from expected then raise exception 'Approval reminders incomplete' using errcode='PT409';end if;
  end if;
 end loop;
 receipt:=jsonb_build_object('documentId',d.id,'documentNo',d.document_no,'upload_session_id',plan.upload_session_id,'operation_id',p_operation,
  'approve_run_id',plan.approve_run_id,'file_id',f.id,'completed',true,'replayed',false);
 update erp_private.ai_approval_plans set result=receipt,completed_at=clock_timestamp()
  where actor_id=actor and operation_id=p_operation and request_hash=h and result is null;
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Approval receipt unavailable' using errcode='42501';end if;
 perform erp_private.assert_ai_approval_authority(p_request);
 if public.current_user_profile_id() is distinct from actor then
  raise exception 'Approval principal changed' using errcode='42501';end if;
 if not coalesce(public.current_user_can_view_dms_document(d.id),false) then
  raise exception 'Approval document unavailable' using errcode='42501';end if;
 return receipt;
end $$;
alter function erp_private.complete_ai_approval(uuid,jsonb) owner to postgres;
revoke all on function erp_private.complete_ai_approval(uuid,jsonb) from public,anon,service_role;
grant execute on function erp_private.complete_ai_approval(uuid,jsonb) to authenticated;

create or replace function public.finish_numbered_ai_intake(p_operation uuid,p_request jsonb,p_file_name text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare plan jsonb; actor bigint:=public.current_user_profile_id(); target bigint; session_id bigint; run bigint;
 version_id bigint; file_id bigint; affected integer; item jsonb; metadata jsonb;
begin
 -- This takes the source lock and rechecks the exact retained request/current
 -- authority. It may reserve only if called directly with a fresh valid request;
 -- a missing copy proof then raises and rolls that entire attempt back.
 plan:=public.reserve_numbered_ai_intake(p_operation,p_request);
 if (plan->>'completed')::boolean then return erp_private.complete_ai_approval(p_operation,p_request);end if;
 target:=(plan->>'documentId')::bigint;session_id:=(plan->>'upload_session_id')::bigint;run:=(plan->>'approve_run_id')::bigint;
 perform erp_private.assert_ai_approval_copy(p_operation,p_request,p_file_name);
 -- Ordinary RLS reads above precede private row locks; repeat the visible
 -- snapshot after waits. Analysis needs its existing review UPDATE authority.
 perform erp_private.lock_ai_approval_context(p_request);
 if p_request#>>'{prepared,analysis_result_id}' is not null then
  perform id from public.dms_ai_extraction_results where id=(p_request#>>'{prepared,analysis_result_id}')::bigint and upload_session_id=session_id for update;
  if not found then raise exception 'Analysis review unavailable' using errcode='42501';end if;
 end if;
 if (p_request->'prepared')-array['content_sha256','storage_year'] is distinct from erp_private.ai_approval_snapshot(p_request)-'storage_year' then
  raise exception 'Prepared approval changed' using errcode='PT409';end if;
 metadata:=erp_private.ai_approval_metadata(p_request);
 insert into public.dms_documents(id,document_no,title,description,document_type_id,category_id,status,confidentiality_level,owner_user_id,
  owning_company_id,owning_branch_id,party_id,issue_date,expiry_date,created_by,updated_by) overriding system value
 values(target,plan->>'documentNo',btrim(p_request->>'title'),nullif(p_request->>'description',''),(p_request->>'documentTypeId')::bigint,
  (p_request#>>'{prepared,type,category_id}')::bigint,'active',coalesce(p_request->>'confidentialityLevel',p_request#>>'{prepared,type,default_confidentiality}'),actor,
  (p_request->>'owningCompanyId')::bigint,(p_request->>'owningBranchId')::bigint,(p_request->>'partyId')::bigint,
  nullif(p_request->>'issueDate','')::date,nullif(p_request->>'expiryDate','')::date,actor,actor);
 -- INSERT RETURNING cannot satisfy the existing STABLE parent reread policy.
 perform id from public.dms_documents where id=target and document_no=plan->>'documentNo' and created_by=actor and deleted_at is null;
 if not found then raise exception 'Created document unavailable' using errcode='42501';end if;
 insert into public.dms_document_versions(document_id,version_number,version_label,change_notes,is_current,created_by)
  values(target,1,'v1','Created from AI intake',true,actor) returning id into version_id;
 insert into public.dms_document_files(document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,created_by)
  values(target,version_id,'original','dms-documents',plan->>'storage_path',p_file_name,p_request#>>'{prepared,source,mime_type}',
   (p_request#>>'{prepared,source,file_size_bytes}')::bigint,p_request#>>'{prepared,content_sha256}',actor) returning id into file_id;
 update public.dms_documents set current_version_id=version_id,updated_by=actor,updated_at=clock_timestamp() where id=target and current_version_id is null;
 get diagnostics affected=row_count;if affected<>1 then raise exception 'Document version update denied' using errcode='42501';end if;
 for item in select v from jsonb_array_elements(metadata) v loop
  insert into public.dms_document_metadata_values(document_id,definition_id,value_text,value_number,value_date,value_datetime,value_boolean,value_json,created_by,updated_by)
   values(target,(item->>'definition_id')::bigint,item->>'value_text',(item->>'value_number')::numeric,(item->>'value_date')::date,
    (item->>'value_datetime')::timestamptz,(item->>'value_boolean')::boolean,nullif(item->'value_json','null'::jsonb),actor,actor);
 end loop;
 for item in select v from jsonb_array_elements(p_request->'tagIds') v loop
  insert into public.dms_document_tags(document_id,tag_id,created_by) values(target,item::text::bigint,actor);
 end loop;
 for item in select v from jsonb_array_elements(p_request->'links') v loop
  insert into public.dms_document_links(document_id,entity_type,entity_id,link_role,is_primary,linked_by)
   values(target,item->>'entityType',(item->>'entityId')::bigint,coalesce(nullif(item->>'linkRole',''),'related'),coalesce((item->>'isPrimary')::boolean,false),actor);
 end loop;
 -- The proof-bound completion verifier adds only the fixed automatic
 -- expiry defaults after every other invoker completion fact exists.
 if p_request#>>'{prepared,analysis_result_id}' is not null then
  update public.dms_ai_extraction_results set ai_status='accepted',review_action='accepted',reviewed_by=actor,reviewed_at=clock_timestamp(),document_id=target
   where id=(p_request#>>'{prepared,analysis_result_id}')::bigint and upload_session_id=session_id and document_id is null and ai_status='pending_review' and review_action is null;
  get diagnostics affected=row_count;if affected<>1 then raise exception 'Analysis acceptance denied' using errcode='42501';end if;
 end if;
 update public.dms_upload_sessions set status='completed',intake_status='approved',review_status='approved',document_id=target,
  approve_run_id=run,approve_status='completed',approve_error=null,approved_at=clock_timestamp(),review_completed_at=clock_timestamp(),reviewed_by=actor,
  completed_at=clock_timestamp(),updated_at=clock_timestamp() where id=session_id and document_id is null and approve_run_id=run and approve_status='processing';
 get diagnostics affected=row_count;if affected<>1 then raise exception 'Intake completion denied' using errcode='42501';end if;
 insert into public.dms_document_events(document_id,event_type,description,performed_by,metadata_json) values
  (target,'document_created_from_ai_intake','Document created from AI intake',actor,jsonb_build_object('operation_id',p_operation,'upload_session_id',session_id,'ai_result_id',p_request#>'{prepared,analysis_result_id}','approve_run_id',run)),
  (target,'approve_save_db_transaction_completed','Approve & Save core DB transaction completed',actor,jsonb_build_object('operation_id',p_operation,'approve_run_id',run,'file_id',file_id,'version_id',version_id)),
  (target,'file_uploaded','File attached from AI intake approval',actor,jsonb_build_object('operation_id',p_operation,'file_id',file_id,'version_id',version_id,'storage_path',plan->>'storage_path'));
 if jsonb_array_length(metadata)>0 then
  insert into public.dms_document_events(document_id,event_type,description,performed_by,metadata_json)
   values(target,'metadata_updated','Metadata saved from AI intake approval',actor,jsonb_build_object('operation_id',p_operation,'metadata_count',jsonb_array_length(metadata)));
 end if;
 update public.dms_approve_runs set status='completed',stage='approve_save_completed',document_id=target,ai_result_id=(p_request#>>'{prepared,analysis_result_id}')::bigint,
  final_storage_bucket='dms-documents',final_storage_path=plan->>'storage_path',metadata_json=jsonb_build_object('operation_id',p_operation,'mode','single_file_new_document',
   'file_id',file_id,'version_id',version_id,'metadata_count',jsonb_array_length(metadata),'tag_count',jsonb_array_length(p_request->'tagIds'),'link_count',jsonb_array_length(p_request->'links')),
  error_code=null,error_message=null,completed_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=run and upload_session_id=session_id and started_by=actor and status='started' and document_id is null;
 get diagnostics affected=row_count;if affected<>1 then raise exception 'Approval run completion denied' using errcode='42501';end if;
 perform public.finish_numbering_reservation(p_operation,'consumed','dms_documents',target,null);
 insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
  values(actor,'DMS','dms_documents',target,plan->>'documentNo','create',jsonb_build_object('event','single_file_ai_approval_completed','operation_id',p_operation,
   'upload_session_id',session_id,'approve_run_id',run,'file_id',file_id,'version_id',version_id));
 -- No cached admission after the final audit wait. Both scopes and independent
 -- review/preview/upload/numbering authority must still be current.
 perform erp_private.assert_ai_approval_authority(p_request);
 perform id from public.dms_upload_sessions where id=session_id and document_id=target and deleted_at is null;
 if not found then raise exception 'Completed intake unavailable' using errcode='42501';end if;
 if p_request#>>'{prepared,analysis_result_id}' is not null then
  perform id from public.dms_ai_extraction_results where id=(p_request#>>'{prepared,analysis_result_id}')::bigint and upload_session_id=session_id and document_id=target;
  if not found then raise exception 'Completed analysis unavailable' using errcode='42501';end if;
 end if;
 return erp_private.complete_ai_approval(p_operation,p_request);
end $$;
revoke all on function public.finish_numbered_ai_intake(uuid,jsonb,text) from public,anon,service_role;
grant execute on function public.finish_numbered_ai_intake(uuid,jsonb,text) to authenticated;

notify pgrst,'reload schema';
commit;
