begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check check(entity in
 ('departments','work_calendars','work_shifts','global_numbering_rules','erp_email_provider_configs','erp_ai_provider_configs',
  'erp_email_feature_flags','erp_ai_feature_flags','erp_report_branding_profiles','erp_app_branding_settings','erp_branding_assets','owner_company_branding'));

-- Govern the existing setup hook, not a new report generator. The company,
-- branding profile, starter templates, default links and audit commit together.
-- No existing template content, signing authority or issued output is rewritten.
create function public.initialize_company_branding(p_company bigint,p_mode text,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare company public.owner_companies; profile public.erp_report_branding_profiles; template public.erp_report_templates;
 receipt erp_private.master_lifecycle_receipts; actor bigint; h text; result jsonb; profile_existed boolean;
 report_id bigint; letter_id bigint; changed boolean:=false; target_type text; target_id bigint; code text;
 fields jsonb; patch jsonb:='{}'::jsonb; key text; assigns text; new_profile boolean:=false;
begin
 if p_company is null or p_company<1 or p_operation is null or p_mode is null or p_mode not in ('ensure','sync') then
  raise exception 'Invalid company branding request' using errcode='22023';end if;
 if not erp_private.business_principal_is_active()
  or not erp_private.permission_in_scope('organizations.manage',p_company,null)
  or not erp_private.report_branding_permission('manage',p_company) then
  raise exception 'Company and branding management authority required' using errcode='42501';end if;
 actor:=public.current_user_profile_id();
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));
 perform pg_advisory_xact_lock(hashtextextended('f06-branding-config:report',0));
 select c.* into company from public.owner_companies c where c.id=p_company for update;
 if company.id is null or company.status<>'active' then raise exception 'Active company unavailable' using errcode='42501';end if;
 h:=encode(sha256(convert_to(jsonb_build_array('company-branding',p_company,p_mode)::text,'UTF8')),'hex');
 select r.* into receipt from erp_private.master_lifecycle_receipts r where r.actor=auth.uid() and r.operation_id=p_operation;
 if found then
  if receipt.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 select p.* into profile from public.erp_report_branding_profiles p where p.owner_company_id=p_company
  and p.is_default_for_company and p.deleted_at is null for update;
 profile_existed:=profile.id is not null;
 if profile.id is not null and not profile.is_active then raise exception 'Existing branding default requires review' using errcode='PT409';end if;
 fields:=jsonb_strip_nulls(jsonb_build_object('legal_name_en',nullif(btrim(company.legal_name_en),''),
  'legal_name_ar',nullif(btrim(company.legal_name_ar),''),'trade_name_en',coalesce(nullif(btrim(company.trade_name),''),nullif(btrim(company.short_name),'')),
  'phone',nullif(btrim(company.primary_phone),''),'email',nullif(btrim(company.primary_email),''),'website',nullif(btrim(company.website),''),
  'trn',nullif(btrim(company.trn),''),'trade_license_no',nullif(btrim(company.trade_license_no),''),'po_box',nullif(btrim(company.po_box),''),
  'address_block_en',nullif(concat_ws(', ',nullif(btrim(company.address_line_1),''),nullif(btrim(company.address_line_2),''),nullif(btrim(company.city),''),nullif(btrim(company.emirate),'')),'')));
 if p_mode='ensure' and profile.id is null then
  -- A retired, non-default or wrong-company canonical identity is historical
  -- data requiring review, not permission to reactivate/merge it automatically.
  code:='COMPANY_'||p_company||'_DEFAULT';
  if exists(select 1 from public.erp_report_branding_profiles where profile_code=code) then
   raise exception 'Existing branding identity requires review' using errcode='PT409';end if;
  insert into public.erp_report_branding_profiles(profile_code,profile_name,profile_type,owner_company_id,is_default_for_company,
   legal_name_en,legal_name_ar,trade_name_en,phone,email,website,trn,trade_license_no,po_box,address_block_en,created_by,updated_by)
  values(code,left(company.legal_name_en,200),'company',p_company,true,fields->>'legal_name_en',fields->>'legal_name_ar',fields->>'trade_name_en',
   fields->>'phone',fields->>'email',fields->>'website',fields->>'trn',fields->>'trade_license_no',fields->>'po_box',fields->>'address_block_en',actor,actor)
  returning * into profile;
  changed:=true;new_profile:=true;
  insert into public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
  values(actor,p_company,'BRANDING','erp_report_branding_profiles',profile.id,profile.profile_code,'create',jsonb_build_object('operation_id',p_operation,'revision',profile.workspace_revision,'source','company_setup'));
 elsif p_mode='sync' and profile.id is not null then
  -- Legacy code overwrote manually maintained values despite claiming otherwise.
  -- Without an approved historical mapping, only fill blanks from actual company
  -- fields. Never copy old logo/stamp/signature URLs or infer signatory authority.
  for key in select jsonb_object_keys(fields) loop
   if nullif(btrim(to_jsonb(profile)->>key),'') is null then patch:=patch||jsonb_build_object(key,fields->key);end if;
  end loop;
  if patch<>'{}'::jsonb then
   select string_agg(format('%I=r.%I',k,k),',' order by k) into assigns from jsonb_object_keys(patch) k;
   execute format('update public.erp_report_branding_profiles p set %s,updated_by=$2,updated_at=clock_timestamp() from jsonb_populate_record(null::public.erp_report_branding_profiles,$1) r where p.id=$3 returning p.*',assigns)
    into profile using patch,actor,profile.id;
   changed:=true;
   insert into public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
   values(actor,p_company,'BRANDING','erp_report_branding_profiles',profile.id,profile.profile_code,'update',jsonb_build_object('operation_id',p_operation,'revision',profile.workspace_revision,'source','company_fill_blanks','fields',to_jsonb(array(select jsonb_object_keys(patch)))));
  end if;
 end if;

 if p_mode='ensure' then
  foreach target_type in array array['report','letter'] loop
   target_id:=case target_type when 'report' then company.default_report_template_id else company.default_letter_template_id end;
   code:='COMPANY_'||p_company||'_'||upper(target_type)||'_TEMPLATE';
   template:=null;
   if target_id is not null then
    select t.* into template from public.erp_report_templates t where t.id=target_id for update;
   else select t.* into template from public.erp_report_templates t where t.template_code=code for update;end if;
   if template.id is not null then
    if template.deleted_at is not null or not template.is_active or template.template_type<>target_type
     or not exists(select 1 from public.erp_report_branding_profiles p where p.id=template.branding_profile_id and p.owner_company_id=p_company and p.is_active and p.deleted_at is null) then
     raise exception 'Existing company template requires review' using errcode='PT409';end if;
   elsif target_id is not null then raise exception 'Existing company template unavailable' using errcode='PT409';
   else
    insert into public.erp_report_templates(template_code,template_name,template_type,branding_profile_id,default_orientation,page_size,
     font_family,language_mode,show_logo,show_small_logo,show_address,show_trn,show_license,show_signatory,show_stamp,show_watermark,
     requires_stamp_permission,is_default,is_active,governance_status,created_by,updated_by)
    values(code,left(company.legal_name_en,200)||case target_type when 'report' then ' — Report' else ' — Letter' end,target_type,profile.id,
     'portrait','a4','helvetica',case target_type when 'report' then 'en' else 'bilingual' end,true,target_type='letter',true,true,true,false,false,false,false,false,true,'draft',actor,actor)
    returning * into template;
    changed:=true;
    insert into public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
    values(actor,p_company,'BRANDING','erp_report_templates',template.id,template.template_code,'create',jsonb_build_object('operation_id',p_operation,'source','company_setup','governance_status','draft'));
   end if;
   if target_type='report' then report_id:=template.id;else letter_id:=template.id;end if;
  end loop;
  if company.default_report_template_id is distinct from report_id or company.default_letter_template_id is distinct from letter_id then
   update public.owner_companies set default_report_template_id=report_id,default_letter_template_id=letter_id,updated_by=actor,updated_at=clock_timestamp() where id=p_company;
   changed:=true;
   insert into public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
   values(actor,p_company,'BRANDING','owner_companies',p_company,company.company_code,'update',jsonb_build_object('operation_id',p_operation,'source','branding_setup','default_report_template_id',report_id,'default_letter_template_id',letter_id));
  end if;
 end if;
 result:=jsonb_build_object('brandingProfileId',profile.id,'reportTemplateId',report_id,'letterTemplateId',letter_id,
  'wasAlreadyPresent',profile_existed,'changed',changed,'replayed',false,'createdProfile',new_profile);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
 values(auth.uid(),p_operation,h,'owner_company_branding',p_company,result);
 return result;
end$$;
alter function public.initialize_company_branding(bigint,text,uuid) owner to postgres;
revoke all on function public.initialize_company_branding(bigint,text,uuid) from public,anon,service_role;
grant execute on function public.initialize_company_branding(bigint,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
