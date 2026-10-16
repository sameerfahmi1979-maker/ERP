begin;

-- Ordinary caller RLS and the hidden-seal discriminator remain in the same
-- statement. Parameterize each seal lookup by its independently anchored source
-- so unrelated historical preparations never become join candidates. OFFSET 0
-- prevents flattening this security-sensitive point lookup into a broad join.
-- Preserve every origin, confidentiality and after-wait authority check; no
-- permission, policy, SECURITY DEFINER, identity or historical row is changed.
create or replace function public.read_dms_batch_draft_recovery(p_admission_operation uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare receipt jsonb; graph jsonb; entry jsonb; sealed jsonb; expected jsonb; member jsonb;
 members jsonb:='[]'::jsonb; anchors jsonb; operations uuid[]:='{}'::uuid[];
 n integer:=0; governed integer:=0; historical integer:=0; source_id bigint;
begin
 if current_setting('transaction_isolation')<>'read committed' or auth.uid() is null
  or not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.generate') then
  raise exception 'Batch recovery unavailable' using errcode='42501';end if;
 receipt:=public.read_dms_upload_batch_admission(p_admission_operation);
 if jsonb_array_length(receipt->'members') not between 1 and 10 then raise exception 'Invalid recovery graph' using errcode='PT409';end if;
 -- STABLE discriminator and ordinary RLS payload share this exact statement's
 -- snapshot. A hidden seal leaves its independently anchored source in graph.
 select jsonb_agg(jsonb_build_object('id',s.id,'code',s.session_code,'position',s.admission_position,
  'marker',s.batch_draft_operation_id,
  'has_seal',case when s.batch_draft_operation_id is null then null else erp_private.batch_draft_preparation_exists(s.id) end,
  'seal',to_jsonb(p)) order by s.admission_position,s.id)
 into graph from public.dms_upload_sessions s
 left join lateral (
  select prepared.* from erp_private.dms_batch_draft_preparations prepared
  where prepared.upload_session_id=s.id offset 0
 ) p on true
 where s.batch_id=(receipt->>'batch_id')::bigint and s.deleted_at is null;
 if graph is null or jsonb_array_length(graph)<>jsonb_array_length(receipt->'members') then
  raise exception 'Batch recovery unavailable' using errcode='42501';end if;
 anchors:=jsonb_build_object('version',1,'admission_operation_id',receipt->'operation_id',
  'admission_fingerprint',receipt->'fingerprint','auth_user_id',receipt->'auth_user_id','profile_id',receipt->'profile_id',
  'batch_id',receipt->'batch_id','owning_company_id',receipt->'company_id','owning_branch_id',receipt->'branch_id');
 for entry in select value from jsonb_array_elements(graph) loop
  expected:=receipt->'members'->n;source_id:=(entry->>'id')::bigint;
  if entry->'position' is distinct from to_jsonb(n) or entry->'position' is distinct from expected->'position'
   or entry->'id' is distinct from expected->'id' or entry->'code' is distinct from expected->'code'
   or not erp_private.upload_session_permission(source_id,'dms.documents.upload') then
   raise exception 'Batch recovery unavailable' using errcode='42501';end if;
  member:=jsonb_build_object('position',n,'upload_session_id',entry->'id','session_code',entry->'code','draft_operation_id',entry->'marker');
  sealed:=entry->'seal';
  if entry->'marker'='null'::jsonb then
   if sealed is distinct from 'null'::jsonb then raise exception 'Invalid historical recovery' using errcode='PT409';end if;
   historical:=historical+1;member:=member||jsonb_build_object('kind','historical');
  else
   governed:=governed+1;
   if (entry->>'marker')::uuid=any(operations) then raise exception 'Duplicate draft operation' using errcode='PT409';end if;
   operations:=array_append(operations,(entry->>'marker')::uuid);
   if entry->'has_seal'='true'::jsonb then
    if sealed is null or sealed='null'::jsonb then raise exception 'Batch preparation unavailable' using errcode='42501';end if;
    if sealed->'upload_session_id' is distinct from entry->'id' or sealed->'draft_operation_id' is distinct from entry->'marker'
     or sealed->'auth_user_id' is distinct from receipt->'auth_user_id' or sealed->'profile_id' is distinct from receipt->'profile_id'
     or sealed->'batch_id' is distinct from receipt->'batch_id' or sealed->'admission_operation_id' is distinct from receipt->'operation_id'
     or sealed->'admission_fingerprint' is distinct from receipt->'fingerprint' or sealed->'admission_position' is distinct from entry->'position'
     or sealed#>'{request_json,uploadSessionId}' is distinct from entry->'id'
     or sealed#>'{request_json,allowDuplicate}' is distinct from 'false'::jsonb
     or sealed#>'{request_json,prepared,session_code}' is distinct from entry->'code'
     or sealed#>'{request_json,prepared,owning_company_id}' is distinct from receipt->'company_id'
     or sealed#>'{request_json,prepared,owning_branch_id}' is distinct from receipt->'branch_id'
     or sealed#>'{request_json,prepared,party_id}' is distinct from coalesce(receipt#>'{manifest,context,id}','null'::jsonb) then
     raise exception 'Invalid retained preparation' using errcode='PT409';end if;
    member:=member||jsonb_build_object('kind','prepared','request',sealed->'request_json');
   elsif entry->'has_seal'='false'::jsonb and sealed='null'::jsonb then
    member:=member||jsonb_build_object('kind','unprepared','request',jsonb_build_object('uploadSessionId',source_id,'allowDuplicate',false));
   else raise exception 'Invalid preparation visibility' using errcode='PT409';
   end if;
  end if;
  members:=members||jsonb_build_array(member);n:=n+1;
 end loop;
 if historical>0 and governed>0 then raise exception 'Mixed batch recovery history' using errcode='PT409';end if;
 if not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.generate')
  or receipt is distinct from public.read_dms_upload_batch_admission(p_admission_operation) then
  raise exception 'Batch recovery unavailable' using errcode='42501';end if;
 return anchors||jsonb_build_object('members',members);
end $$;

commit;
