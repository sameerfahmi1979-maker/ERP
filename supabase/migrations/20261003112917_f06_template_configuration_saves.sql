begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

alter table public.erp_report_templates add column workspace_revision bigint not null default 1;
create trigger f06_template_revision before insert or update on public.erp_report_templates
 for each row execute function erp_private.workspace_revision();
create table erp_private.template_configuration_history(
 template_id bigint not null references public.erp_report_templates(id),revision bigint not null,
 snapshot jsonb not null,recorded_at timestamptz not null default clock_timestamp(),
 primary key(template_id,revision)
);
alter table erp_private.template_configuration_history owner to postgres;
alter table erp_private.template_configuration_history enable row level security;
revoke all on erp_private.template_configuration_history from public,anon,authenticated,service_role;

create function erp_private.template_configuration_identity() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_company bigint;new_company bigint;
begin
 if tg_op='UPDATE' then
  if new.template_code is distinct from old.template_code then raise exception 'Template code is immutable' using errcode='22023';end if;
  if new.branding_profile_id is distinct from old.branding_profile_id then
   select owner_company_id into old_company from public.erp_report_branding_profiles where id=old.branding_profile_id;
   select owner_company_id into new_company from public.erp_report_branding_profiles where id=new.branding_profile_id;
   if old_company is distinct from new_company then raise exception 'Template company is immutable' using errcode='22023';end if;
  end if;
  insert into erp_private.template_configuration_history(template_id,revision,snapshot)
   values(old.id,old.workspace_revision,to_jsonb(old)) on conflict do nothing;
 end if;
 insert into erp_private.template_configuration_history(template_id,revision,snapshot)
  values(new.id,new.workspace_revision,to_jsonb(new));
 return new;
end$$;
alter function erp_private.template_configuration_identity() owner to postgres;
revoke all on function erp_private.template_configuration_identity() from public,anon,authenticated,service_role;
create trigger f06_template_configuration_history after insert or update on public.erp_report_templates
 for each row execute function erp_private.template_configuration_identity();

alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check check(entity in (
 'departments','work_calendars','work_shifts','global_numbering_rules','erp_email_provider_configs','erp_ai_provider_configs',
 'erp_email_feature_flags','erp_ai_feature_flags','erp_report_branding_profiles','erp_app_branding_settings',
 'erp_branding_assets','owner_company_branding','currencies','erp_report_templates'));

create function erp_private.save_template_configuration(p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 prior public.erp_report_templates;candidate public.erp_report_templates;saved public.erp_report_templates;
 profile public.erp_report_branding_profiles;previous_company bigint;company bigint;actor bigint;
 receipt erp_private.master_lifecycle_receipts;h text;payload jsonb;changed boolean;result jsonb;k text;
 allowed text[]=array['template_code','template_name','template_type','branding_profile_id','default_orientation','page_size','font_family',
  'language_mode','show_logo','show_small_logo','show_address','show_trn','show_license','show_signatory','show_stamp','show_watermark',
  'watermark_text','body_html_en','body_html_ar','custom_css','is_default','is_active'];
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then raise exception 'Permission denied' using errcode='42501';end if;
 actor:=public.current_user_profile_id();
 if p_operation is null or jsonb_typeof(p_data) is distinct from 'object' or p_data='{}'::jsonb or octet_length(p_data::text)>2100000
  or (p_id is null and p_revision is not null) or (p_id is not null and (p_id<1 or p_revision is null or p_revision<1))
  or exists(select 1 from jsonb_object_keys(p_data) x where not x=any(allowed)) then
  raise exception 'Invalid template save contract' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(p_data) e where
  (e.key=any(array['show_logo','show_small_logo','show_address','show_trn','show_license','show_signatory','show_stamp','show_watermark','is_default','is_active']) and jsonb_typeof(e.value)<>'boolean') or
  (e.key='branding_profile_id' and jsonb_typeof(e.value)<>'null' and (jsonb_typeof(e.value)<>'number' or e.value::text !~ '^[1-9][0-9]*$')) or
  (e.key=any(array['template_code','template_name','template_type','default_orientation','page_size','font_family','language_mode']) and jsonb_typeof(e.value)<>'string') or
  (e.key=any(array['watermark_text','body_html_en','body_html_ar','custom_css']) and jsonb_typeof(e.value) not in ('string','null'))) then
  raise exception 'Use typed template fields' using errcode='22023';end if;
 h:=encode(sha256(convert_to(jsonb_build_array(p_id,p_revision,p_data)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('f06-template:'||auth.uid()||':'||p_operation,0));
 select m.* into receipt from erp_private.master_lifecycle_receipts m where m.actor=auth.uid() and m.operation_id=p_operation;
 if receipt.operation_id is not null and receipt.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
 if p_id is not null or receipt.operation_id is not null then
  select * into prior from public.erp_report_templates where id=coalesce(p_id,receipt.record_id) and deleted_at is null for update;
  if not found then raise exception 'Template unavailable' using errcode='PT404';end if;
  select owner_company_id into previous_company from public.erp_report_branding_profiles where id=prior.branding_profile_id;
  if not erp_private.permission_in_scope('reports.manage',previous_company,null) then raise exception 'Template authority required' using errcode='42501';end if;
 end if;
 payload:=p_data;
 foreach k in array array['template_code','template_name','font_family','watermark_text'] loop
  if payload?k and jsonb_typeof(payload->k)='string' then payload:=jsonb_set(payload,array[k],to_jsonb(btrim(payload->>k)));end if;
 end loop;
 if prior.id is null then
  payload:=jsonb_build_object('default_orientation','portrait','page_size','a4','font_family','Inter','language_mode','en',
   'show_logo',true,'show_small_logo',false,'show_address',true,'show_trn',true,'show_license',true,'show_signatory',false,
   'show_stamp',false,'show_watermark',false,'is_default',false,'is_active',true)||payload;
 end if;
 candidate:=jsonb_populate_record(prior,payload);
 if candidate.branding_profile_id is not null then
  select * into profile from public.erp_report_branding_profiles where id=candidate.branding_profile_id and deleted_at is null for share;
  if not found or not profile.is_active then raise exception 'Branding profile unavailable' using errcode='42501';end if;
  company:=profile.owner_company_id;
  if company is not null and not exists(select 1 from public.owner_companies c where c.id=company and c.status='active') then
   raise exception 'Issuing company unavailable' using errcode='42501';end if;
 end if;
 if not erp_private.permission_in_scope('reports.manage',company,null) then raise exception 'Template authority required' using errcode='42501';end if;
 if prior.id is not null and (prior.template_code is distinct from candidate.template_code or previous_company is distinct from company) then
  raise exception 'Template identity is immutable' using errcode='22023';end if;
 if (candidate.show_stamp and (prior.id is null or not prior.show_stamp) or candidate.show_signatory and (prior.id is null or not prior.show_signatory))
  and not erp_private.permission_in_scope('reports.sign',company,null) then raise exception 'Company signing authority required' using errcode='42501';end if;
 if receipt.operation_id is not null then return receipt.result||jsonb_build_object('replayed',true);end if;
 if prior.id is not null and prior.workspace_revision<>p_revision then raise exception 'Template changed' using errcode='PT409';end if;
 if prior.id is not null and prior.governance_status not in ('draft','rejected') then
  raise exception 'Only drafts or rejected templates may be edited' using errcode='22023';end if;
 if candidate.template_code is null or candidate.template_code !~ '^[A-Z0-9_]{2,100}$'
  or candidate.template_name is null or length(candidate.template_name) not between 2 and 200
  or candidate.template_type is null or candidate.template_type not in ('report','letter','certificate','form','checklist','badge','external_submission','group_summary')
  or candidate.default_orientation not in ('portrait','landscape') or candidate.page_size not in ('a4','letter','legal')
  or candidate.language_mode not in ('en','ar','bilingual') or length(candidate.font_family) not between 1 and 100
  or coalesce(length(candidate.watermark_text),0)>100 or coalesce(length(candidate.body_html_en),0)>1000000
  or coalesce(length(candidate.body_html_ar),0)>1000000 or coalesce(length(candidate.custom_css),0)>50000 then
  raise exception 'Invalid template values' using errcode='22023';end if;
 changed:=prior.id is null or exists(select 1 from jsonb_object_keys(payload) x where to_jsonb(prior)->x is distinct from to_jsonb(candidate)->x);
 if changed then
  if prior.id is null then
   insert into public.erp_report_templates(template_code,template_name,template_type,branding_profile_id,default_orientation,page_size,font_family,language_mode,
    show_logo,show_small_logo,show_address,show_trn,show_license,show_signatory,show_stamp,show_watermark,watermark_text,body_html_en,body_html_ar,custom_css,is_default,is_active,created_by,updated_by)
   values(candidate.template_code,candidate.template_name,candidate.template_type,candidate.branding_profile_id,candidate.default_orientation,candidate.page_size,candidate.font_family,candidate.language_mode,
    candidate.show_logo,candidate.show_small_logo,candidate.show_address,candidate.show_trn,candidate.show_license,candidate.show_signatory,candidate.show_stamp,candidate.show_watermark,candidate.watermark_text,candidate.body_html_en,candidate.body_html_ar,candidate.custom_css,candidate.is_default,candidate.is_active,actor,actor)
   returning * into saved;
  else
   update public.erp_report_templates set template_name=candidate.template_name,template_type=candidate.template_type,branding_profile_id=candidate.branding_profile_id,
    default_orientation=candidate.default_orientation,page_size=candidate.page_size,font_family=candidate.font_family,language_mode=candidate.language_mode,
    show_logo=candidate.show_logo,show_small_logo=candidate.show_small_logo,show_address=candidate.show_address,show_trn=candidate.show_trn,show_license=candidate.show_license,
    show_signatory=candidate.show_signatory,show_stamp=candidate.show_stamp,show_watermark=candidate.show_watermark,watermark_text=candidate.watermark_text,
    body_html_en=candidate.body_html_en,body_html_ar=candidate.body_html_ar,custom_css=candidate.custom_css,is_default=candidate.is_default,is_active=candidate.is_active,
    security_review_status='pending',security_review_notes=null,security_review_at=null,security_review_by=null,updated_by=actor
    where id=prior.id returning * into saved;
  end if;
  insert into public.erp_report_template_events(template_id,event_type,actor_user_profile_id,payload_json)
   values(saved.id,case when prior.id is null then 'template_created' else 'template_updated' end,actor,jsonb_build_object('operation_id',p_operation,'revision',saved.workspace_revision));
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,old_values,new_values)
   values(actor,'reports','erp_report_templates',saved.id,saved.template_code,case when prior.id is null then 'create' else 'update' end,
    case when prior.id is null then null else jsonb_build_object('revision',prior.workspace_revision) end,
    jsonb_build_object('operation_id',p_operation,'revision',saved.workspace_revision,'owner_company_id',company));
 else saved:=prior;end if;
 result:=jsonb_build_object('id',saved.id,'revision',saved.workspace_revision::text,'changed',changed,'replayed',false,'owner_company_id',company);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
  values(auth.uid(),p_operation,h,'erp_report_templates',saved.id,result);
 return result;
end$$;
alter function erp_private.save_template_configuration(uuid,bigint,bigint,jsonb) owner to postgres;
revoke all on function erp_private.save_template_configuration(uuid,bigint,bigint,jsonb) from public,anon;
grant execute on function erp_private.save_template_configuration(uuid,bigint,bigint,jsonb) to authenticated;
create function public.save_template_configuration(p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select erp_private.save_template_configuration(p_operation,p_id,p_revision,p_data);
$$;
alter function public.save_template_configuration(uuid,bigint,bigint,jsonb) owner to postgres;
revoke all on function public.save_template_configuration(uuid,bigint,bigint,jsonb) from public,anon;
grant execute on function public.save_template_configuration(uuid,bigint,bigint,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
