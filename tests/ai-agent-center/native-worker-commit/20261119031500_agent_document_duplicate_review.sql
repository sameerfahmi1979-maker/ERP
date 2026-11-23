begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table erp_private.agent_pdf_work
  add column matching_document_ids bigint[] not null default '{}'::bigint[],
  add constraint agent_pdf_matching_documents_bound check (cardinality(matching_document_ids)<=8);

create function erp_private.agent_normalized_document_value(p_field text,p_value text) returns text
language sql immutable strict set search_path='' as $$
  select case
    when length(btrim(p_value)) not between 1 and 256 then null
    when p_field='expiry_date' then
      case when btrim(p_value) ~ '^[0-9]{4}[-/][0-9]{2}[-/][0-9]{2}$'
       then replace(btrim(p_value),'/','-') end
    else case when n.value in ('','na','none','null','unknown','notavailable','notapplicable') then null
      when length(n.value)>=2 then n.value end
    end
  from (select regexp_replace(lower(translate(btrim(p_value),
    '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789')),'[^[:alnum:]]','','g') as value)n;
$$;

-- An advisory requires the complete registered identifier and the same validity
-- period. Unsupported types and incomplete or conflicting evidence yield no match.
-- This helper is private to the already-scoped continuous-intake transaction.
create function erp_private.agent_find_matching_documents(
  p_company bigint,p_branch bigint,p_type bigint,p_fields jsonb
) returns bigint[] language sql stable set search_path='' as $$
  with rules(type_code,fields) as (values
    ('MEDICAL_INSURANCE',array['insurance_card_number','policy_number','expiry_date']),
    ('EMIRATES_ID',array['emirates_id_number','expiry_date']),
    ('PASSPORT_COPY',array['passport_number','issuing_country','expiry_date']),
    ('DRIVING_LICENSE',array['license_number','emirates_id_number','expiry_date']),
    ('CICPA_PASS',array['pass_number','company_name','expiry_date']),
    ('LABOUR_CARD',array['work_permit_number','emirates_id_number','expiry_date']),
    ('TRADE_LICENSE',array['license_number','issuing_authority','expiry_date']),
    ('VISA',array['visa_number','passport_number','expiry_date']),
    ('VEHICLE_REGISTRATION',array['chassis_number','plate_number','expiry_date'])
  ), required as (
    select k.code,erp_private.agent_normalized_document_value(k.code,
      case when jsonb_typeof(p_fields->k.code)='object' then p_fields->k.code->>'value' else p_fields->>k.code end
    ) as value
    from public.dms_document_types t join rules r using(type_code)
    cross join lateral unnest(r.fields) k(code)
    where t.id=p_type and t.is_active and t.deleted_at is null
  ), matching as (
    select d.id from public.dms_documents d
    where d.owning_company_id=p_company and (p_branch is null or d.owning_branch_id=p_branch)
      and d.document_type_id=p_type and d.deleted_at is null and not coalesce(d.is_archived,false)
      and d.status in ('active','approved','published')
      and exists(select 1 from required)
      and not exists (
        select 1 from required k
        left join lateral (
          select bool_or(v.normalized=k.value) as matches,bool_or(v.normalized<>k.value) as conflicts
          from public.dms_document_metadata_values m
          join public.dms_metadata_definitions def on def.id=m.definition_id
          cross join lateral (values(erp_private.agent_normalized_document_value(k.code,
            coalesce(nullif(btrim(m.value_text),''),m.value_date::text,m.value_number::text,
              case when jsonb_typeof(m.value_json)='object' then m.value_json->>'value'
                else m.value_json#>>'{}' end)))) v(normalized)
          where m.document_id=d.id and m.deleted_at is null and def.document_type_id=d.document_type_id
            and def.field_code=k.code and def.is_active and def.deleted_at is null
        ) found on true
        where k.value is null or coalesce(found.conflicts,false)
          or (k.code='expiry_date' and d.expiry_date is not null and d.expiry_date::text<>k.value)
          or not (coalesce(found.matches,false) or
            coalesce(k.code='expiry_date' and d.expiry_date::text=k.value,false))
      )
    order by d.id limit 8
  )
  select coalesce(array_agg(id order by id),'{}'::bigint[]) from matching;
$$;

revoke all on function erp_private.agent_normalized_document_value(text,text),
  erp_private.agent_find_matching_documents(bigint,bigint,bigint,jsonb)
  from public,anon,authenticated,service_role,erp_agent_discovery_runtime;

-- Preserve the exact deployed claim, scope, pause, and notification transaction.
do $patch$
declare body text; checksum text;
begin
  select pg_get_functiondef(oid),md5(replace(prosrc,E'\r\n',E'\n')) into strict body,checksum
  from pg_proc where oid='erp_private.advance_agent_pdf(uuid,uuid,uuid,text,text)'::regprocedure;
  if checksum<>'bd11f3934d7f1dbf7b5379a1a21ec265' then
    raise exception 'Unexpected continuous intake function version';
  end if;
  body:=replace(body,'  new_review_id bigint;',E'  new_review_id bigint;\n  duplicate_matches bigint[] := ARRAY[]::bigint[];');
  body:=replace(body,$old$      -- Use the ERP review assignment trigger and existing notification delivery.$old$,$new$
      -- Compare only a verified result for the exact scoped intake.
      select erp_private.agent_find_matching_documents(work.company_id,intake.owning_branch_id,
        r.suggested_document_type_id,r.extracted_fields_json)
      into duplicate_matches
      from public.dms_ai_extraction_results r
      join erp_private.f07_intake_analyses p on p.result_id=r.id and p.upload_session_id=intake.id
      where r.id=intake.ai_result_id and r.upload_session_id=intake.id
        and p.source_sha256=lower(work.sha256)
        and coalesce(r.raw_response_json#>>'{preparation,bundle}','single')='single';
      duplicate_matches:=coalesce(duplicate_matches,'{}'::bigint[]);
      if cardinality(duplicate_matches)>0 then detail:='possible_document_duplicate'; end if;
      -- Use the ERP review assignment trigger and existing notification delivery.
$new$);
  body:=replace(body,$old$        'intake',intake.id::text,'sharepoint-agent:'||intake.id,'sharepoint_intake_ready',
        'A SharePoint PDF completed AI Fill and is ready for officer review.',work.actor_id)$old$,$new$        'intake',intake.id::text,'sharepoint-agent:'||intake.id,
        case when cardinality(duplicate_matches)>0 then 'sharepoint_possible_duplicate' else 'sharepoint_intake_ready' end,
        case when cardinality(duplicate_matches)>0
          then 'Possible duplicate: existing DMS record matches document identifiers and validity. Compare before approval.'
          else 'A SharePoint PDF completed AI Fill and is ready for officer review.' end,work.actor_id)$new$);
  body:=replace(body,$old$    review_id=new_review_id,lease_token=null,lease_until=null where operation_id=p_operation;$old$,$new$    review_id=new_review_id,matching_document_ids=duplicate_matches,lease_token=null,lease_until=null
    where operation_id=p_operation;$new$);
  if position('erp_private.agent_find_matching_documents' in body)=0
    or position('sharepoint_possible_duplicate' in body)=0
    or position('matching_document_ids=duplicate_matches' in body)=0 then
    raise exception 'Expected continuous intake patch was incomplete';
  end if;
  execute body;
end $patch$;

commit;
