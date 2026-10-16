begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

create table erp_private.template_governance_operations(
 actor_id bigint not null references public.user_profiles(id),operation_id uuid not null,
 template_id bigint not null references public.erp_report_templates(id),request_hash text not null,
 result jsonb not null,created_at timestamptz not null default clock_timestamp(),
 primary key(actor_id,operation_id)
);
alter table erp_private.template_governance_operations owner to postgres;
alter table erp_private.template_governance_operations enable row level security;
revoke all on erp_private.template_governance_operations from public,anon,authenticated,service_role;

-- One transaction owns the row, immutable snapshot trigger, event and audit.
create function erp_private.record_template_transition(p_template public.erp_report_templates,p_actor bigint,p_company bigint,p_operation uuid,p_event text,p_note text,p_extra jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.erp_report_template_events(template_id,event_type,actor_user_profile_id,notes,payload_json)
 values(p_template.id,p_event,p_actor,p_note,jsonb_build_object('operation_id',p_operation,'revision',p_template.workspace_revision)||coalesce(p_extra,'{}'::jsonb));
 insert into public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
 values(p_actor,p_company,'reports','erp_report_templates',p_template.id,p_template.template_code,
  case when p_event='template_new_version_created' then 'create' else 'update' end,
  jsonb_build_object('operation_id',p_operation,'revision',p_template.workspace_revision,'event',p_event,'governance_status',p_template.governance_status));
end$$;
alter function erp_private.record_template_transition(public.erp_report_templates,bigint,bigint,uuid,text,text,jsonb) owner to postgres;
revoke all on function erp_private.record_template_transition(public.erp_report_templates,bigint,bigint,uuid,text,text,jsonb) from public,anon,authenticated,service_role;

-- Service-only because review findings must come from the server's deterministic
-- scanner, never an authenticated browser's assertion that its content is safe.
-- The server-derived actor AND live session are checked for the actual company
-- again here. No global fallback, arbitrary SQL or arbitrary fields are accepted.
create function public.transition_report_template(p_actor bigint,p_session uuid,p_operation uuid,p_id bigint,p_revision bigint,
 p_action text,p_note text default null,p_review jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 prior public.erp_report_templates;saved public.erp_report_templates;parent public.erp_report_templates;
 profile public.erp_report_branding_profiles;company bigint;parent_company bigint;root_id bigint;cursor_id bigint;seen bigint[]='{}';
 family bigint[];next_version integer;new_code text;root_code text;
 receipt erp_private.template_governance_operations;h text;result jsonb;event text;notes text;
 permitted boolean;review_passed boolean;changed boolean=true;review_needed boolean;now_at timestamptz=clock_timestamp();
begin
 if p_actor is null or p_session is null or p_operation is null or p_id is null or p_id<1 or p_revision is null or p_revision<1
  or p_action is null or p_action not in ('submit','approve','reject','publish','archive','new_version','review')
  or coalesce(length(p_note),0)>2000 or p_action='reject' and length(btrim(coalesce(p_note,'')))<5 then
  raise exception 'Invalid governance contract' using errcode='22023';end if;
 if not erp_private.provider_actor_session_valid(p_actor,p_session) then raise exception 'Session unavailable' using errcode='42501';end if;
 h:=encode(sha256(convert_to(jsonb_build_array(p_id,p_revision,p_action,p_note)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('f06-governance-operation:'||p_actor||':'||p_operation,0));
 select * into receipt from erp_private.template_governance_operations o where o.actor_id=p_actor and o.operation_id=p_operation;
 if receipt.operation_id is not null and receipt.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
 select * into prior from public.erp_report_templates where id=p_id and deleted_at is null;
 if not found then raise exception 'Template unavailable' using errcode='PT404';end if;
 if prior.branding_profile_id is not null then
  select * into profile from public.erp_report_branding_profiles where id=prior.branding_profile_id and deleted_at is null for share;
  if not found then raise exception 'Branding unavailable' using errcode='42501';end if;
  company:=profile.owner_company_id;
 end if;
 permitted:=case p_action
  when 'submit' then erp_private.branding_actor_permission(p_actor,p_session,'reports.manage',company)
  when 'new_version' then erp_private.branding_actor_permission(p_actor,p_session,'reports.manage',company)
  when 'approve' then erp_private.branding_actor_permission(p_actor,p_session,'reports.template.approve',company)
  when 'reject' then erp_private.branding_actor_permission(p_actor,p_session,'reports.template.approve',company)
  when 'publish' then erp_private.branding_actor_permission(p_actor,p_session,'reports.publish',company) or erp_private.branding_actor_permission(p_actor,p_session,'reports.template.approve',company)
  else erp_private.branding_actor_permission(p_actor,p_session,'reports.manage',company) or erp_private.branding_actor_permission(p_actor,p_session,'reports.template.approve',company) end;
 if not permitted then raise exception 'Company governance authority required' using errcode='42501';end if;
 if p_action='new_version' and (prior.show_stamp or prior.show_signatory)
  and not erp_private.branding_actor_permission(p_actor,p_session,'reports.sign',company) then
  raise exception 'Company signing authority required' using errcode='42501';end if;
 if p_action in ('approve','publish') and
  (position('restricted_field_elevated_approval_required' in coalesce(prior.security_review_notes,''))>0
   or position('sensitive_fields_require_elevated_approval' in coalesce(prior.security_review_notes,''))>0)
  and not erp_private.branding_actor_permission(p_actor,p_session,'reports.sensitive_fields.approve',company) then
  raise exception 'Company sensitive-field approval required' using errcode='42501';end if;
 if receipt.operation_id is not null then return receipt.result||jsonb_build_object('replayed',true);end if;
 if p_action<>'archive' and (profile.id is not null and not profile.is_active or company is not null and not exists(select 1 from public.owner_companies where id=company and status='active')) then
  raise exception 'Issuing company or branding unavailable' using errcode='42501';end if;
 -- Serialize transitions and new revisions across the complete lineage. This
 -- never merges or rewrites ambiguous historical parent/company relationships.
 cursor_id:=prior.id;
 while cursor_id is not null loop
  if cursor_id=any(seen) or cardinality(seen)>=256 then raise exception 'Invalid template lineage' using errcode='22023';end if;
  seen:=array_append(seen,cursor_id);root_id:=cursor_id;
  select * into parent from public.erp_report_templates where id=cursor_id and deleted_at is null;
  if not found then raise exception 'Template lineage unavailable' using errcode='22023';end if;
  parent_company:=null;
  if parent.branding_profile_id is not null then
   select owner_company_id into parent_company from public.erp_report_branding_profiles where id=parent.branding_profile_id and deleted_at is null;
   if not found then raise exception 'Lineage branding unavailable' using errcode='22023';end if;
  end if;
  if parent_company is distinct from company then raise exception 'Template lineage company mismatch' using errcode='42501';end if;
  cursor_id:=parent.parent_template_id;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('f06-template-lineage:'||root_id,0));
 select * into prior from public.erp_report_templates where id=p_id and deleted_at is null for update;
 if not found then raise exception 'Template unavailable' using errcode='PT404';end if;
 if prior.workspace_revision<>p_revision then raise exception 'Template changed; review current version' using errcode='PT409';end if;
 with recursive lineage(id) as (select root_id union select t.id from public.erp_report_templates t join lineage l on t.parent_template_id=l.id)
 select array_agg(id) into family from lineage;
 review_needed:=p_action in ('submit','review');
 if review_needed then
  if jsonb_typeof(p_review) is distinct from 'object' or jsonb_typeof(p_review->'passed') is distinct from 'boolean'
   or p_review->>'severity' not in ('none','warning','block') or jsonb_typeof(p_review->'findings') is distinct from 'array'
   or octet_length(p_review::text)>250000 then raise exception 'Trusted security review required' using errcode='22023';end if;
  review_passed:=(p_review->>'passed')::boolean;
  if review_passed is distinct from (p_review->>'severity'<>'block') then raise exception 'Inconsistent security review' using errcode='22023';end if;
  select string_agg('['||upper(f->>'severity')||'] '||(f->>'field')||': '||(f->>'rule')||' — "'||(f->>'excerpt')||'"',E'\n')
   into notes from jsonb_array_elements(p_review->'findings') f;
 elsif p_review is not null then raise exception 'Unexpected security review' using errcode='22023';end if;
 if p_action in ('approve','publish') then
  if prior.security_review_status<>'passed' then raise exception 'A passed security review is required' using errcode='22023';end if;
 end if;
 if p_action='new_version' then
  if prior.governance_status in ('archived','rejected') or not prior.is_active then raise exception 'Template cannot be copied in this state' using errcode='22023';end if;
  if exists(select 1 from public.erp_report_templates where parent_template_id=prior.id and deleted_at is null and governance_status<>'archived') then
   raise exception 'A draft or successor already exists; review that version' using errcode='PT409';end if;
  select coalesce(max(version_no),0)+1 into next_version from public.erp_report_templates where id=any(family);
  select template_code into root_code from public.erp_report_templates where id=root_id;
  new_code:=root_code||'_V'||next_version;
  if length(new_code)>100 then raise exception 'Template version code exceeds its supported length' using errcode='22023';end if;
  insert into public.erp_report_templates(template_code,template_name,template_type,branding_profile_id,default_orientation,page_size,font_family,language_mode,
   show_logo,show_small_logo,show_address,show_trn,show_license,show_signatory,show_stamp,show_watermark,requires_stamp_permission,watermark_text,
   body_html_en,body_html_ar,custom_css,header_layout_json,body_layout_json,footer_layout_json,style_json,visual_editor_engine,visual_layout_schema_version,
   body_schema_json,studio_schema_version,version_no,parent_template_id,governance_status,security_review_status,is_default,is_active,created_by,updated_by)
  values(new_code,left(prior.template_name,180)||' (v'||next_version||')',prior.template_type,prior.branding_profile_id,prior.default_orientation,prior.page_size,prior.font_family,prior.language_mode,
   prior.show_logo,prior.show_small_logo,prior.show_address,prior.show_trn,prior.show_license,prior.show_signatory,prior.show_stamp,prior.show_watermark,prior.requires_stamp_permission,prior.watermark_text,
   prior.body_html_en,prior.body_html_ar,prior.custom_css,prior.header_layout_json,prior.body_layout_json,prior.footer_layout_json,prior.style_json,prior.visual_editor_engine,prior.visual_layout_schema_version,
   prior.body_schema_json,prior.studio_schema_version,next_version,prior.id,'draft','pending',false,true,p_actor,p_actor) returning * into saved;
  event:='template_new_version_created';
 elsif p_action='archive' and prior.governance_status='archived' then saved:=prior;changed:=false;
 else
  if p_action='submit' and prior.governance_status not in ('draft','rejected')
   or p_action in ('approve','reject') and prior.governance_status<>'in_review'
   or p_action='publish' and prior.governance_status<>'approved'
   or p_action='review' and prior.governance_status not in ('draft','rejected','in_review') then
   raise exception 'Governance transition unavailable for current state' using errcode='22023';end if;
  if p_action<>'archive' and not prior.is_active then raise exception 'Inactive template cannot advance' using errcode='22023';end if;
  if p_action='publish' then
   if exists(select 1 from public.erp_report_templates where id=any(family) and id<>prior.id and id is distinct from prior.parent_template_id and deleted_at is null and governance_status='published') then
    raise exception 'Another published revision exists in this lineage' using errcode='PT409';end if;
   if prior.parent_template_id is not null then
    select * into parent from public.erp_report_templates where id=prior.parent_template_id and deleted_at is null for update;
    if parent.governance_status<>'archived' then
     update public.erp_report_templates set governance_status='archived',is_active=false,archived_at=now_at,archived_by=p_actor,
      archive_reason='Superseded by template revision '||prior.version_no,updated_by=p_actor,updated_at=now_at where id=parent.id returning * into parent;
     perform erp_private.record_template_transition(parent,p_actor,company,p_operation,'template_archived',parent.archive_reason,jsonb_build_object('superseded_by_template_id',prior.id));
    end if;
   end if;
  end if;
  update public.erp_report_templates set
   governance_status=case p_action when 'submit' then case when review_passed then 'in_review' else prior.governance_status end
    when 'approve' then 'approved' when 'reject' then 'rejected' when 'publish' then 'published' when 'archive' then 'archived' else prior.governance_status end,
   is_active=case when p_action='archive' then false else prior.is_active end,
   submitted_at=case when p_action='submit' and review_passed then now_at else prior.submitted_at end,submitted_by=case when p_action='submit' and review_passed then p_actor else prior.submitted_by end,
   approved_at=case when p_action='approve' then now_at else prior.approved_at end,approved_by=case when p_action='approve' then p_actor else prior.approved_by end,
   approval_notes=case when p_action='approve' then p_note else prior.approval_notes end,
   rejected_at=case when p_action='reject' then now_at else prior.rejected_at end,rejected_by=case when p_action='reject' then p_actor else prior.rejected_by end,
   rejection_reason=case when p_action='reject' then p_note else prior.rejection_reason end,
   published_at=case when p_action='publish' then now_at else prior.published_at end,published_by=case when p_action='publish' then p_actor else prior.published_by end,
   archived_at=case when p_action='archive' then now_at else prior.archived_at end,archived_by=case when p_action='archive' then p_actor else prior.archived_by end,
   archive_reason=case when p_action='archive' then p_note else prior.archive_reason end,
   security_review_status=case when review_needed then case when review_passed then 'passed' else 'failed' end else prior.security_review_status end,
   security_review_notes=case when review_needed then notes else prior.security_review_notes end,
   security_review_at=case when review_needed then now_at else prior.security_review_at end,security_review_by=case when review_needed then p_actor else prior.security_review_by end,
   updated_by=p_actor,updated_at=now_at where id=prior.id returning * into saved;
  event:=case p_action when 'submit' then case when review_passed then 'template_submitted_for_review' else 'template_security_review_failed' end
   when 'approve' then 'template_approved' when 'reject' then 'template_rejected' when 'publish' then 'template_published' when 'archive' then 'template_archived'
   else case when review_passed then 'template_security_review_passed' else 'template_security_review_failed' end end;
 end if;
 if changed then perform erp_private.record_template_transition(saved,p_actor,company,p_operation,event,p_note,
  case when p_action='new_version' then jsonb_build_object('parent_template_id',prior.id,'version_no',saved.version_no) else '{}'::jsonb end);end if;
 result:=jsonb_build_object('id',saved.id,'source_id',prior.id,'revision',saved.workspace_revision::text,'governance_status',saved.governance_status,
  'security_review_status',saved.security_review_status,'changed',changed,'replayed',false,'owner_company_id',company,'review',p_review);
 insert into erp_private.template_governance_operations(actor_id,operation_id,template_id,request_hash,result) values(p_actor,p_operation,prior.id,h,result);
 return result;
end$$;
alter function public.transition_report_template(bigint,uuid,uuid,bigint,bigint,text,text,jsonb) owner to postgres;
revoke all on function public.transition_report_template(bigint,uuid,uuid,bigint,bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.transition_report_template(bigint,uuid,uuid,bigint,bigint,text,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
