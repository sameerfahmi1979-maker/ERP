begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- F01 retained the correct action choices but its global capability checks
-- reject legitimate scoped intake reviewers. Keep every source/uploader/action
-- condition and existing grant; resolve each capability against this exact
-- session's pinned scope and, when bound, its document confidentiality (F03).
alter policy f01_intake_select on public.dms_intake_review_values using (public.current_user_profile_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.dms_upload_sessions s WHERE s.id = upload_session_id AND s.deleted_at IS NULL AND ((erp_private.upload_session_permission(s.id,'dms.documents.review_ai') OR erp_private.upload_session_permission(s.id,'dms.admin')) OR (s.uploaded_by = public.current_user_profile_id() AND erp_private.upload_session_permission(s.id,'dms.documents.upload')))));
alter policy f01_intake_insert on public.dms_intake_review_values with check (public.current_user_profile_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.dms_upload_sessions s WHERE s.id = upload_session_id AND s.deleted_at IS NULL AND ((erp_private.upload_session_permission(s.id,'dms.documents.review_ai') OR erp_private.upload_session_permission(s.id,'dms.admin')) OR (s.uploaded_by = public.current_user_profile_id() AND erp_private.upload_session_permission(s.id,'dms.documents.upload')))));
alter policy f01_intake_update on public.dms_intake_review_values using (public.current_user_profile_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.dms_upload_sessions s WHERE s.id = upload_session_id AND s.deleted_at IS NULL AND ((erp_private.upload_session_permission(s.id,'dms.documents.review_ai') OR erp_private.upload_session_permission(s.id,'dms.admin')) OR (s.uploaded_by = public.current_user_profile_id() AND erp_private.upload_session_permission(s.id,'dms.documents.upload'))))) with check (public.current_user_profile_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.dms_upload_sessions s WHERE s.id = upload_session_id AND s.deleted_at IS NULL AND ((erp_private.upload_session_permission(s.id,'dms.documents.review_ai') OR erp_private.upload_session_permission(s.id,'dms.admin')) OR (s.uploaded_by = public.current_user_profile_id() AND erp_private.upload_session_permission(s.id,'dms.documents.upload')))));
alter policy f01_intake_delete on public.dms_intake_review_values using (public.current_user_profile_id() IS NOT NULL AND EXISTS (SELECT 1 FROM public.dms_upload_sessions s WHERE s.id = upload_session_id AND s.deleted_at IS NULL AND ((erp_private.upload_session_permission(s.id,'dms.documents.review_ai') OR erp_private.upload_session_permission(s.id,'dms.admin')) OR (s.uploaded_by = public.current_user_profile_id() AND erp_private.upload_session_permission(s.id,'dms.documents.upload')))));

-- Normalize only the existing AI YYYY-MM-DD suggestion convention. Invalid
-- month/day input is discarded; overlong days clamp to the month's last day.
create function erp_private.batch_draft_date(value text)
returns date language plpgsql immutable security invoker set search_path='' as $$
declare y integer; m integer; d integer; last_day integer;
begin
 if value is null or value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null;end if;
 y:=split_part(value,'-',1)::integer;m:=split_part(value,'-',2)::integer;d:=split_part(value,'-',3)::integer;
 if y<1 or m not between 1 and 12 or d<1 then return null;end if;
 last_day:=extract(day from (make_date(y,m,1)+interval '1 month - 1 day'))::integer;
 return make_date(y,m,least(d,last_day));
end $$;
revoke all on function erp_private.batch_draft_date(text) from public,anon,service_role;
grant execute on function erp_private.batch_draft_date(text) to authenticated;

-- Settings RLS must not require global settings-read permission merely to use
-- batch intake. Expose only this boolean, and only for the currently authorized
-- source/session + independent numbering capability. No row or settings write.
create function erp_private.batch_draft_enabled(p_session bigint)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission(p_session,'dms.documents.upload') then return false;end if;
 return exists(select 1 from public.erp_ai_feature_flags where feature_code='DMS_BATCH_INTAKE' and is_enabled);
end $$;
alter function erp_private.batch_draft_enabled(bigint) owner to postgres;
revoke all on function erp_private.batch_draft_enabled(bigint) from public,anon,service_role;
grant execute on function erp_private.batch_draft_enabled(bigint) to authenticated;

-- A projection only, never an allocation or an authoritative client capability.
-- The atomic consumer recomputes this projection after its source/reference locks.
create function erp_private.batch_draft_snapshot(p_session bigint,p_allow_unready boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s record; a record; t record; b record; party bigint; prepared jsonb;
 title text; issue date; expiry date; source jsonb; batch_source jsonb:=null;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission(p_session,'dms.documents.upload') then
  raise exception 'Batch draft permission denied' using errcode='42501';
 end if;
 if not erp_private.batch_draft_enabled(p_session) then
  raise exception 'Batch intake is unavailable' using errcode='42501';
 end if;
 select id,session_code,batch_id,document_id,intake_status,status,original_filename,ai_result_id,
  owning_company_id,owning_branch_id,uploaded_by,temp_storage_path
  into s from public.dms_upload_sessions where id=p_session and deleted_at is null;
 if not found then raise exception 'Upload unavailable' using errcode='42501';end if;
 if s.document_id is not null or s.status in ('completed','cancelled','expired')
  or s.intake_status in ('approved','discarded','cancelled','expired') then
  raise exception 'Upload already bound or closed' using errcode='PT409';
 end if;
 if s.temp_storage_path is null or s.batch_id is null then raise exception 'Upload has no batch/source binding' using errcode='22023';end if;
 if not erp_private.permission_in_scope('dms.documents.upload',s.owning_company_id,s.owning_branch_id)
  or not (erp_private.permission_in_scope('dms.documents.view',s.owning_company_id,s.owning_branch_id)
   or erp_private.permission_in_scope('dms.admin',s.owning_company_id,s.owning_branch_id)) then
  raise exception 'Draft destination unavailable' using errcode='42501';
 end if;
 if coalesce(s.intake_status,'') not in ('review_pending','review_in_progress') or s.ai_result_id is null then
  if not p_allow_unready then raise exception 'Analysis is not ready' using errcode='PT409';end if;
  return jsonb_build_object('kind','analysis_required','processing',coalesce(s.intake_status in ('ocr_processing','ai_processing'),false),
   'session_code',s.session_code,'batch_id',s.batch_id);
 end if;
 -- Hash the complete RLS-visible analysis row, not merely the projected title.
 -- Raw OCR/provider fields never leave this function; any analysis edit makes
 -- an already prepared request stale instead of silently changing its meaning.
 select r.* into a from public.dms_ai_extraction_results r where r.id=s.ai_result_id and r.upload_session_id=s.id;
 if not found then raise exception 'Analysis result unavailable' using errcode='42501';end if;
 if a.document_id is not null or a.ai_status<>'pending_review' or a.review_action is not null then
  raise exception 'Analysis no longer awaits draft review' using errcode='PT409';end if;
 select id,category_id,default_confidentiality,sort_order into t from public.dms_document_types
  where id=a.suggested_document_type_id and is_active and deleted_at is null and category_id is not null;
 if not found then
  select id,category_id,default_confidentiality,sort_order into t from public.dms_document_types
   where is_active and deleted_at is null and category_id is not null order by sort_order,id limit 1;
 end if;
 if t.id is null or not exists(select 1 from public.dms_document_categories where id=t.category_id and is_active and deleted_at is null) then
  raise exception 'Active draft taxonomy unavailable' using errcode='23503';
 end if;
 if coalesce(t.default_confidentiality,'internal') not in ('internal','company','hr','finance','legal','executive')
  or (coalesce(t.default_confidentiality,'internal') not in ('internal','company') and not
   erp_private.permission_in_scope('dms.documents.view.'||t.default_confidentiality,s.owning_company_id,s.owning_branch_id)) then
  raise exception 'Draft confidentiality unavailable' using errcode='42501';
 end if;
 if s.batch_id is not null then
  select id,entity_type,entity_id into b from public.dms_upload_batches
   where id=s.batch_id and deleted_at is null and status not in ('cancelled','completed');
  if not found then raise exception 'Batch context unavailable' using errcode='42501';end if;
  batch_source:=to_jsonb(b);
  if b.entity_type='party' then party:=b.entity_id;end if;
  if party is not null and not exists(select 1 from public.parties where id=party and is_active and not is_locked) then
   raise exception 'Batch party unavailable' using errcode='23503';
  end if;
 end if;
 title:=nullif(btrim(a.suggested_title),'');
 if title is null then
  title:=left(case when strpos(reverse(coalesce(s.original_filename,'Document')),'.')>0
    and length(coalesce(s.original_filename,'Document'))-strpos(reverse(coalesce(s.original_filename,'Document')),'.')>0
   then left(s.original_filename,length(s.original_filename)-strpos(reverse(s.original_filename),'.'))
   else coalesce(s.original_filename,'Document') end,480);
 end if;
 issue:=erp_private.batch_draft_date(a.issue_date_suggestion::text);expiry:=erp_private.batch_draft_date(a.expiry_date_suggestion::text);
 if length(title)>500 or expiry<issue then raise exception 'Invalid analyzed draft values' using errcode='22023';end if;
 source:=jsonb_build_object('session',to_jsonb(s),'analysis',to_jsonb(a),'type',to_jsonb(t),'batch',batch_source);
 prepared:=jsonb_build_object('upload_session_id',s.id,'session_code',s.session_code,'batch_id',s.batch_id,
  'analysis_result_id',a.id,'owning_company_id',s.owning_company_id,'owning_branch_id',s.owning_branch_id,'party_id',party,
  'document_type_id',t.id,'category_id',t.category_id,'title',coalesce(title,''),'description',a.suggested_description,
  'confidentiality_level',coalesce(t.default_confidentiality,'internal'),'issue_date',issue,'expiry_date',expiry,
  'confidence',a.classification_confidence,'source_fingerprint',encode(sha256(convert_to(source::text,'UTF8')),'hex'));
 return jsonb_build_object('kind','prepared','snapshot',prepared);
end $$;
revoke all on function erp_private.batch_draft_snapshot(bigint,boolean) from public,anon,service_role;
grant execute on function erp_private.batch_draft_snapshot(bigint,boolean) to authenticated;

create function public.prepare_numbered_dms_batch_draft(p_session bigint)
returns jsonb language sql security invoker set search_path='' as $$
 select erp_private.batch_draft_snapshot(p_session,true);
$$;
revoke all on function public.prepare_numbered_dms_batch_draft(bigint) from public,anon,service_role;
grant execute on function public.prepare_numbered_dms_batch_draft(bigint) to authenticated;

-- Narrow source-context row locks only. There are no business writes and no
-- returned row data. The invoker must first read the exact context through RLS.
create function erp_private.lock_batch_draft_context(p_session bigint)
returns void language plpgsql security definer set search_path='' as $$
declare batch bigint; kind text; party bigint;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission(p_session,'dms.documents.upload') then
  raise exception 'Batch draft permission denied' using errcode='42501';
 end if;
 select batch_id into batch from public.dms_upload_sessions where id=p_session and deleted_at is null;
 if batch is not null then
  select entity_type,entity_id into kind,party from public.dms_upload_batches
   where id=batch and deleted_at is null and status not in ('cancelled','completed') for share;
  if not found then raise exception 'Batch context unavailable' using errcode='23503';end if;
  if kind='party' and party is not null then
   perform 1 from public.parties where id=party and is_active and not is_locked for share;
   if not found then raise exception 'Batch party unavailable' using errcode='23503';end if;
  end if;
 end if;
 if not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission(p_session,'dms.documents.upload') then
  raise exception 'Batch draft permission denied' using errcode='42501';
 end if;
end $$;
alter function erp_private.lock_batch_draft_context(bigint) owner to postgres;
revoke all on function erp_private.lock_batch_draft_context(bigint) from public,anon,service_role;
grant execute on function erp_private.lock_batch_draft_context(bigint) to authenticated;

create function public.create_numbered_dms_batch_draft(p_operation uuid,p_request jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor bigint:=public.current_user_profile_id(); session_id bigint; s record; prepared jsonb; current_snapshot jsonb;
 allocation jsonb; reference text; draft_id bigint; title text; item record; affected integer;
begin
 if auth.uid() is null or actor is null or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate') then
  raise exception 'Batch draft permission denied' using errcode='42501';
 end if;
 if p_operation is null or p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>262144
  or not(p_request ?& array['uploadSessionId','allowDuplicate','prepared']) or p_request-array['uploadSessionId','allowDuplicate','prepared']<>'{}'::jsonb
  or jsonb_typeof(p_request->'uploadSessionId') is distinct from 'number' or p_request->>'uploadSessionId' !~ '^[1-9][0-9]*$'
  or (p_request->>'uploadSessionId')::numeric>9007199254740991
  or jsonb_typeof(p_request->'allowDuplicate') is distinct from 'boolean' or jsonb_typeof(p_request->'prepared') is distinct from 'object' then
  raise exception 'Invalid prepared draft request' using errcode='22023';
 end if;
 session_id:=(p_request->>'uploadSessionId')::bigint;prepared:=p_request->'prepared';
 if not erp_private.upload_session_permission(session_id,'dms.documents.upload') then
  raise exception 'Upload unavailable' using errcode='42501';end if;
 -- Session-first matches the existing approval transaction. UPDATE authority is
 -- intentional here: the consumer must really be allowed to bind this session.
 -- This first statement may wait for a concurrent draft to bind a newly created
 -- document. F03 STABLE policy rereads in that statement can retain its earlier
 -- snapshot. Never decide replay/admission from that possibly stale projection:
 -- require a fresh caller-RLS row-lock/read statement after the wait as well.
 perform 1 from public.dms_upload_sessions where id=session_id and deleted_at is null for update;
 select id,document_id,owning_company_id,owning_branch_id into s from public.dms_upload_sessions
  where id=session_id and deleted_at is null for update;
 if not found or not erp_private.business_principal_is_active()
  or not erp_private.upload_session_permission(session_id,'dms.documents.upload') then
  raise exception 'Upload unavailable' using errcode='42501';end if;
 allocation:=public.allocate_numbering_reference(p_operation,null,'MASTER_DMS_DOCUMENT',null,'reserved','dms_documents',null,
  'F06 batch draft creation '||encode(sha256(convert_to(p_request::text,'UTF8')),'hex'));
 reference:=allocation->>'generated_reference_number';
 if not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission(session_id,'dms.documents.upload') then
  raise exception 'Batch draft permission denied' using errcode='42501';end if;
 if allocation->>'generation_status'='consumed' then
  select id into draft_id from public.dms_documents where document_no=reference and created_by=actor and deleted_at is null;
  if draft_id is null or s.document_id is distinct from draft_id
   or not public.f03_has_document_permission(draft_id,'dms.documents.upload') then
   raise exception 'Created draft unavailable' using errcode='42501';end if;
  perform public.finish_numbering_reservation(p_operation,'consumed','dms_documents',draft_id,null);
 else
  if allocation->>'generation_status'<>'reserved' or s.document_id is not null then
   raise exception 'Upload already has a different draft request' using errcode='PT409';end if;
  current_snapshot:=erp_private.batch_draft_snapshot(session_id,false)->'snapshot';
  if prepared is distinct from current_snapshot then raise exception 'Analysis or draft context changed' using errcode='PT409';end if;
  -- The exact result is an intended UPDATE target; invoker UPDATE RLS applies.
  perform 1 from public.dms_ai_extraction_results where id=(prepared->>'analysis_result_id')::bigint
   and upload_session_id=session_id and document_id is null for update;
  if not found then raise exception 'Analysis update unavailable' using errcode='42501';end if;
  perform erp_private.lock_batch_draft_context(session_id);
  perform erp_private.lock_dms_creation_taxonomy((prepared->>'document_type_id')::bigint,(prepared->>'category_id')::bigint,
   s.owning_company_id,s.owning_branch_id,prepared->>'confidentiality_level');
  -- Recompute every field under the source/context/taxonomy locks, using the
  -- caller's ordinary RLS projection. The snapshot never grants authority.
  if prepared is distinct from erp_private.batch_draft_snapshot(session_id,false)->'snapshot' then
   raise exception 'Analysis or draft context changed' using errcode='PT409';end if;
  title:=coalesce(nullif(prepared->>'title',''),reference);
  insert into public.dms_documents(document_no,title,description,document_type_id,category_id,status,confidentiality_level,
   owner_user_id,owning_company_id,owning_branch_id,party_id,issue_date,expiry_date,created_by,updated_by)
  values(reference,title,prepared->>'description',(prepared->>'document_type_id')::bigint,(prepared->>'category_id')::bigint,
   'pending_ai_review',prepared->>'confidentiality_level',actor,s.owning_company_id,s.owning_branch_id,(prepared->>'party_id')::bigint,
   (prepared->>'issue_date')::date,(prepared->>'expiry_date')::date,actor,actor);
  -- F03 SELECT uses a STABLE row reread: use a fresh statement, not RETURNING.
  select id into draft_id from public.dms_documents where document_no=reference and created_by=actor and deleted_at is null;
  if draft_id is null then raise exception 'Created draft unavailable' using errcode='42501';end if;
  update public.dms_upload_sessions u set document_id=draft_id,updated_at=clock_timestamp()
   where u.id=session_id and u.document_id is null;
  get diagnostics affected=row_count;if affected<>1 then raise exception 'Upload binding unavailable' using errcode='42501';end if;
  update public.dms_ai_extraction_results a set document_id=draft_id
   where a.id=(prepared->>'analysis_result_id')::bigint and a.upload_session_id=session_id and a.document_id is null;
  get diagnostics affected=row_count;if affected<>1 then raise exception 'Analysis binding unavailable' using errcode='42501';end if;
  for item in select * from jsonb_each(jsonb_build_object('title',title,'document_type_id',(prepared->>'document_type_id')::bigint,
   'description',prepared->'description','issue_date',prepared->'issue_date','expiry_date',prepared->'expiry_date','confidentiality_level',prepared->'confidentiality_level')) loop
   if item.value='null'::jsonb or item.value='""'::jsonb then continue;end if;
   -- The existing review table has only an id PK, not a unique natural key.
   -- Serialize this consumer through its already locked parent upload. Keep
   -- ordinary UPDATE/INSERT RLS; do not infer write authority from a hidden row.
   update public.dms_intake_review_values v set suggested_value_json=item.value,
    reviewed_value_json=item.value,confidence_label=prepared->>'confidence',review_status='suggested',updated_at=clock_timestamp()
    where v.upload_session_id=session_id and v.field_scope='document' and v.field_code=item.key;
   get diagnostics affected=row_count;
   if affected>1 then raise exception 'Ambiguous existing document review field' using errcode='PT409';end if;
   if affected=0 then
    insert into public.dms_intake_review_values(upload_session_id,field_scope,field_code,field_type,suggested_value_json,reviewed_value_json,confidence_label,review_status,updated_at)
    values(session_id,'document',item.key,case when item.key='document_type_id' then 'number' when item.key in ('issue_date','expiry_date') then 'date' else 'text' end,
     item.value,item.value,prepared->>'confidence','suggested',clock_timestamp());
   end if;
  end loop;
  insert into public.dms_document_events(document_id,event_type,description,performed_by,performed_at,metadata_json)
  values(draft_id,'batch_draft_created','AI draft created from batch intake - session '||(prepared->>'session_code'),actor,clock_timestamp(),
   jsonb_build_object('document_no',reference,'upload_session_id',session_id,'batch_id',prepared->'batch_id','ai_result_id',prepared->'analysis_result_id'));
  perform public.finish_numbering_reservation(p_operation,'consumed','dms_documents',draft_id,null);
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
  values(actor,'DMS','dms_documents',draft_id,reference,'create',jsonb_build_object('event','dms_batch_draft_created','upload_session_id',session_id,
   'batch_id',prepared->'batch_id','ai_result_id',prepared->'analysis_result_id'));
 end if;
 if public.current_user_profile_id() is distinct from actor or not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate')
  or not erp_private.upload_session_permission(session_id,'dms.documents.upload')
  or not public.f03_has_document_permission(draft_id,'dms.documents.upload')
  or not public.f03_has_document_permission(draft_id,'dms.documents.review_ai')
  or not public.f03_has_document_permission(draft_id,'dms.documents.preview')
  or not exists(select 1 from public.dms_ai_extraction_results a
   where a.id=(prepared->>'analysis_result_id')::bigint and a.upload_session_id=session_id and a.document_id=draft_id) then
  raise exception 'Batch draft permission denied' using errcode='42501';end if;
 return jsonb_build_object('documentId',draft_id,'documentNo',reference,'status','pending_ai_review','confidence',prepared->'confidence',
  'operation_id',p_operation,'upload_session_id',session_id,'reference_id',(allocation->>'id')::bigint,'replayed',allocation->>'generation_status'='consumed');
end $$;
revoke all on function public.create_numbered_dms_batch_draft(uuid,jsonb) from public,anon,service_role;
grant execute on function public.create_numbered_dms_batch_draft(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
