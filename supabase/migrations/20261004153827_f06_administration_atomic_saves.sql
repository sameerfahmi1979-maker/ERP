begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- F04 save identities, current scoped authority and the audit are one transaction.
-- Historical values are preserved; this migration performs no data repair.
do $$declare t text;existing text;begin
 foreach t in array array['owner_companies','branches'] loop
  execute format('alter table public.%I add column workspace_revision bigint not null default 1',t);
  execute format('create trigger f06_administration_revision before insert or update on public.%I for each row execute function erp_private.workspace_revision()',t);
 end loop;
 select pg_get_expr(conbin,conrelid) into existing from pg_constraint
  where conrelid='erp_private.master_lifecycle_receipts'::regclass and conname='master_lifecycle_receipts_entity_check';
 if existing is null then raise exception 'Missing receipt entity boundary';end if;
 alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
 execute format('alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check check ((%s) or entity in (''owner_companies'',''branches''))',existing);
end$$;

create function erp_private.save_administration_record(p_entity text,p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior jsonb;saved jsonb;payload jsonb;receipt erp_private.master_lifecycle_receipts%rowtype;
 fields text[];columns_sql text;values_sql text;updates_sql text;k text;h text;result jsonb;changed boolean;
 actor bigint;company_id bigint;branch_id bigint;permission text;code_field text;name_field text;target bigint;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() then raise exception 'Permission denied' using errcode='42501';end if;
 if p_entity is null or p_entity not in ('owner_companies','branches') or p_operation is null
  or jsonb_typeof(p_data) is distinct from 'object' or p_data='{}'::jsonb or octet_length(p_data::text)>32000
  or (p_id is null and p_revision is not null) or (p_id is not null and (p_id<1 or p_revision is null or p_revision<1)) then
  raise exception 'Invalid administration save contract' using errcode='22023';end if;
 fields:=array['status','emirate','city','area','address_line_1','address_line_2','po_box','makani_number','notes','emirate_id','city_id','area_zone_id'];
 if p_entity='branches' then
  fields:=fields||array['owner_company_id','branch_code','branch_name_en','branch_name_ar','branch_type','is_main_branch','operating_status',
   'latitude','longitude','phone','email','contact_person_name','contact_phone','contact_email','has_workshop','has_warehouse','has_yard','has_weighbridge',
   'opening_date','closing_date','legal_branch_name','trade_license_branch_ref'];
  permission:='branches.manage';code_field:='branch_code';name_field:='branch_name_en';
 else
  fields:=fields||array['company_code','legal_name_en','legal_name_ar','short_name','legal_form','country','country_id','primary_email','primary_phone','website',
   'default_currency','trade_license_no','trade_license_issue_date','trade_license_expiry_date','licensing_authority','chamber_membership_no','chamber_membership_expiry_date',
   'trn','vat_registered','corporate_tax_no','corporate_tax_registered','icv_certificate_no','icv_score','icv_issue_date','icv_expiry_date','adnoc_supplier_no',
   'logo_url','trade_name','main_activity','established_date','compliance_status','office_address_line_1','office_address_line_2','office_emirate_id','office_city_id'];
  permission:='organizations.manage';code_field:='company_code';name_field:='legal_name_en';
 end if;
 if exists(select 1 from jsonb_object_keys(p_data) x where not x=any(fields)) then
  raise exception 'Protected administration fields' using errcode='22023';end if;
 for k in select jsonb_object_keys(p_data) loop
  if k=any(array['is_main_branch','has_workshop','has_warehouse','has_yard','has_weighbridge','vat_registered','corporate_tax_registered']) then
   if jsonb_typeof(p_data->k)<>'boolean' then raise exception 'Invalid administration value' using errcode='22023',detail=k;end if;
  elsif right(k,3)='_id' then
   if p_data->k<>'null'::jsonb and (jsonb_typeof(p_data->k)<>'number' or (p_data->>k)::numeric<>trunc((p_data->>k)::numeric)
    or (p_data->>k)::numeric<1 or (p_data->>k)::numeric>9007199254740991) then
    raise exception 'Invalid administration value' using errcode='22023',detail=k;end if;
  elsif k=any(array['latitude','longitude','icv_score']) then
   if jsonb_typeof(p_data->k) not in ('number','null') then raise exception 'Invalid administration value' using errcode='22023',detail=k;end if;
  elsif jsonb_typeof(p_data->k) not in ('string','null') then
   raise exception 'Invalid administration value' using errcode='22023',detail=k;
  end if;
  if right(k,5)='_date' and p_data->k<>'null'::jsonb and
   (p_data->>k !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or left(p_data->>k,4)='0000') then
   raise exception 'Invalid administration value' using errcode='22023',detail=k;end if;
 end loop;
 h:=encode(sha256(convert_to(jsonb_build_array(p_entity,p_id,p_revision,p_data)::text,'UTF8')),'hex');
 -- Match existing geography -> finance -> row lock order for all entry points.
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-finance-relationships',0));
 select m.* into receipt from erp_private.master_lifecycle_receipts m where m.actor=auth.uid() and m.operation_id=p_operation;
 if found then
  if receipt.entity<>p_entity or receipt.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
  target:=receipt.record_id;
 else target:=p_id;end if;
 if target is not null then
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',p_entity) into prior using target;
  if prior is null then raise exception 'Administration record unavailable' using errcode='PT404';end if;
 end if;
 company_id:=case when p_entity='owner_companies' then target else coalesce((prior->>'owner_company_id')::bigint,(p_data->>'owner_company_id')::bigint) end;
 branch_id:=case when p_entity='branches' then target else null end;
 -- New companies require global authority. New branches require company authority;
 -- a grant for one existing branch cannot create another branch in that company.
 if not erp_private.permission_in_scope(permission,company_id,branch_id) then raise exception 'Permission denied' using errcode='42501';end if;
 if receipt.operation_id is not null then return receipt.result||jsonb_build_object('replayed',true);end if;
 if p_id is not null and (prior->>'workspace_revision')::bigint<>p_revision then raise exception 'Administration record changed' using errcode='PT409';end if;
 payload:=p_data;
 for k in select jsonb_object_keys(payload) loop
  if jsonb_typeof(payload->k)='string' then
   payload:=jsonb_set(payload,array[k],coalesce(to_jsonb(nullif(btrim(payload->>k),'')),'null'::jsonb));
  end if;
 end loop;
 if p_id is null and (payload->>code_field is null or payload->>name_field is null) then raise exception 'Invalid administration value' using errcode='22023';end if;
 if payload?'status' and (payload->>'status' is null or payload->>'status' not in ('active','inactive','suspended')) then raise exception 'Invalid administration value' using errcode='22023',detail='status';end if;
 if payload?'operating_status' and (payload->>'operating_status' is null or payload->>'operating_status' not in ('active','maintenance','suspended','closed')) then raise exception 'Invalid administration value' using errcode='22023',detail='operating_status';end if;
 changed:=p_id is null or exists(select 1 from jsonb_object_keys(payload) x where coalesce(prior->x,'null'::jsonb) is distinct from payload->x);
 actor:=public.current_user_profile_id();
 if changed then
  payload:=payload||jsonb_build_object('updated_by',actor);
  if p_id is null then
   payload:=payload||jsonb_build_object('created_by',actor);
   select string_agg(format('%I',f),','),string_agg(format('v.%I',f),',') into columns_sql,values_sql from jsonb_object_keys(payload) f;
   execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) v returning to_jsonb(%I.*)',
    p_entity,columns_sql,values_sql,p_entity,p_entity) into saved using payload;
  else
   select string_agg(format('%I=v.%I',f,f),',') into updates_sql from jsonb_object_keys(payload) f;
   execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) v where t.id=$2 returning to_jsonb(t.*)',
    p_entity,updates_sql,p_entity) into saved using payload,p_id;
  end if;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,owner_company_id,branch_id,action,old_values,new_values)
   values(actor,case when p_entity='branches' then 'branches' else 'organizations' end,p_entity,(saved->>'id')::bigint,saved->>code_field,
    case when p_entity='branches' then (saved->>'owner_company_id')::bigint else (saved->>'id')::bigint end,
    case when p_entity='branches' then (saved->>'id')::bigint else null end,
    case when p_id is null then 'create' when prior->'status' is distinct from saved->'status' then 'status_change' else 'update' end,
    prior-array['created_at','updated_at'],(saved-array['created_at','updated_at'])||jsonb_build_object('operation_id',p_operation));
 else saved:=prior;end if;
 result:=jsonb_build_object('id',(saved->>'id')::bigint,'revision',saved->>'workspace_revision','changed',changed,'replayed',false);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
  values(auth.uid(),p_operation,h,p_entity,(saved->>'id')::bigint,result);
 return result;
end$$;
alter function erp_private.save_administration_record(text,uuid,bigint,bigint,jsonb) owner to postgres;
revoke all on function erp_private.save_administration_record(text,uuid,bigint,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function erp_private.save_administration_record(text,uuid,bigint,bigint,jsonb) to authenticated;
create function public.save_administration_record(p_entity text,p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select erp_private.save_administration_record(p_entity,p_operation,p_id,p_revision,p_data);
$$;
alter function public.save_administration_record(text,uuid,bigint,bigint,jsonb) owner to postgres;
revoke all on function public.save_administration_record(text,uuid,bigint,bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_administration_record(text,uuid,bigint,bigint,jsonb) to authenticated;
-- Direct writer cutover is a separate mandatory gate, after alternate AI/DMS
-- writer adapters are reconciled. Existing RLS/trigger safeguards remain intact.

-- Validate direct callers as well as the typed application adapter. Only new or
-- changed values are evaluated; no historical formatting is guessed or repaired.
create function erp_private.validate_administration_input() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 k text;pair text[];label text;expected text;
 limits jsonb:='{"legal_name_en":255,"legal_name_ar":255,"branch_name_en":255,"branch_name_ar":255,"short_name":100,"legal_form":100,"country":100,"emirate":100,"city":100,"area":100,"address_line_1":500,"address_line_2":500,"po_box":50,"makani_number":50,"primary_email":255,"primary_phone":50,"website":255,"default_currency":10,"trade_license_no":100,"licensing_authority":255,"chamber_membership_no":100,"trn":100,"corporate_tax_no":100,"icv_certificate_no":100,"adnoc_supplier_no":100,"logo_url":500,"branch_type":100,"phone":50,"email":255,"contact_person_name":255,"contact_phone":50,"contact_email":255}';
begin
 for k in select jsonb_object_keys(limits) loop
  if (TG_OP='INSERT' or n->k is distinct from o->k) and length(n->>k)>(limits->>k)::integer then
   raise exception 'Invalid administration value' using errcode='23514',detail=k;end if;
 end loop;
 foreach k in array array['opening_date','closing_date','established_date','trade_license_issue_date','trade_license_expiry_date','chamber_membership_expiry_date','icv_issue_date','icv_expiry_date'] loop
  if (TG_OP='INSERT' or n->k is distinct from o->k) and n->>k is not null and
   (n->>k !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or left(n->>k,4)='0000' or not isfinite((n->>k)::date)) then
   raise exception 'Invalid administration value' using errcode='23514',detail=k;end if;
 end loop;
 foreach k in array array['primary_email','email','contact_email'] loop
  if (TG_OP='INSERT' or n->k is distinct from o->k) and nullif(btrim(n->>k),'') is not null and n->>k !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
   raise exception 'Invalid administration value' using errcode='23514',detail=k;end if;
 end loop;
 foreach k in array array['website','logo_url'] loop
  if (TG_OP='INSERT' or n->k is distinct from o->k) and nullif(btrim(n->>k),'') is not null and n->>k !~ '^[A-Za-z][A-Za-z0-9+.-]*:[^[:space:]]+$' then
   raise exception 'Invalid administration value' using errcode='23514',detail=k;end if;
 end loop;
 if (TG_OP='INSERT' or n->'icv_score' is distinct from o->'icv_score') and (n->>'icv_score')::numeric not between 0 and 100 then
  raise exception 'Invalid administration value' using errcode='23514',detail='icv_score';end if;
 -- An unchanged ID may retain its historical label. Editing the label cannot
 -- contradict that ID; clearing/changing the ID is handled by the ancestry guard.
 if TG_OP='UPDATE' then
  foreach pair slice 1 in array array[['country_id','country','countries'],['emirate_id','emirate','emirates'],['city_id','city','cities'],['area_zone_id','area','areas_zones']] loop
   k:=pair[1];label:=pair[2];
   if n->>k is not null and n->k is not distinct from o->k and n->label is distinct from o->label then
    execute format('select name_en from public.%I where id=$1',pair[3]) into expected using (n->>k)::bigint;
    if n->>label is distinct from expected then raise exception 'Invalid administration geography' using errcode='23514',detail=label;end if;
   end if;
  end loop;
 end if;
 return new;
end$$;
alter function erp_private.validate_administration_input() owner to postgres;
revoke all on function erp_private.validate_administration_input() from public,anon,authenticated,service_role;
create trigger f06_administration_input before insert or update on public.owner_companies for each row execute function erp_private.validate_administration_input();
create trigger f06_administration_input before insert or update on public.branches for each row execute function erp_private.validate_administration_input();

-- Branding has its own audit/revision domain. Linking system-created defaults
-- must not invalidate a just-returned business-form save receipt. Every other
-- company column remains part of concurrency detection, including lifecycle.
create function erp_private.company_workspace_revision() returns trigger
language plpgsql set search_path='' as $$
declare ignored text[]:=array['workspace_revision','updated_at','updated_by','default_report_template_id','default_letter_template_id'];
begin
 if TG_OP='INSERT' then new.workspace_revision:=1;
 elsif (to_jsonb(new)-ignored) is distinct from (to_jsonb(old)-ignored) then new.workspace_revision:=old.workspace_revision+1;
 else new.workspace_revision:=old.workspace_revision;end if;
 return new;
end$$;
alter function erp_private.company_workspace_revision() owner to postgres;
revoke all on function erp_private.company_workspace_revision() from public,anon,authenticated,service_role;
drop trigger f06_administration_revision on public.owner_companies;
create trigger f06_z_company_revision before insert or update on public.owner_companies for each row execute function erp_private.company_workspace_revision();
create function erp_private.initialize_company_branding(p_company bigint,p_mode text,p_operation uuid)
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
 perform pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 perform pg_advisory_xact_lock(hashtextextended('f06-finance-relationships',0));
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
alter function erp_private.initialize_company_branding(bigint,text,uuid) owner to postgres;
revoke all on function erp_private.initialize_company_branding(bigint,text,uuid) from public,anon,authenticated,service_role;
grant execute on function erp_private.initialize_company_branding(bigint,text,uuid) to authenticated;
create or replace function public.initialize_company_branding(p_company bigint,p_mode text,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select erp_private.initialize_company_branding(p_company,p_mode,p_operation);
$$;
revoke all on function public.initialize_company_branding(bigint,text,uuid) from public,anon,service_role;
grant execute on function public.initialize_company_branding(bigint,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
