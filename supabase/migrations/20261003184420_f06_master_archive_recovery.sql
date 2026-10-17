begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Recovery catalogue only. Ordinary table RLS continues hiding archived rows.
-- The private boundary returns fixed metadata and checks each stored scope;
-- it never grants arbitrary reads or uses caller-supplied company ownership.
create function erp_private.archived_master_records(p_entity text,p_calendar_id bigint)
returns table(id bigint,name text,code text,revision text,owner_company_id bigint,company_name text,
 branch_id bigint,branch_name text,parent_id bigint,archived_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if p_entity is null or p_entity not in ('departments','work_calendars','work_shifts')
  or (p_calendar_id is not null and (p_calendar_id<=0 or p_entity<>'work_shifts')) then
  raise exception 'Invalid archive selection' using errcode='22023';
 end if;
 if auth.uid() is null or not erp_private.business_principal_is_active() then return;end if;
 if p_entity='departments' then
  return query select d.id,d.department_name_en::text,d.department_code::text,d.workspace_revision::text,
   d.owner_company_id,c.legal_name_en::text,d.branch_id,b.branch_name_en::text,null::bigint,d.deleted_at
  from public.departments d left join public.owner_companies c on c.id=d.owner_company_id
  left join public.branches b on b.id=d.branch_id
  where d.deleted_at is not null and erp_private.master_permission('departments','manage',d.owner_company_id,d.branch_id);
 elsif p_entity='work_calendars' then
  return query select c.id,c.calendar_name::text,c.calendar_code::text,c.workspace_revision::text,
   c.owner_company_id,o.legal_name_en::text,null::bigint,null::text,null::bigint,c.deleted_at
  from public.work_calendars c left join public.owner_companies o on o.id=c.owner_company_id
  where c.deleted_at is not null and erp_private.master_permission('work_calendars','manage',c.owner_company_id,null);
 else
  return query select s.id,s.shift_name::text,s.shift_code::text,s.workspace_revision::text,
   c.owner_company_id,o.legal_name_en::text,null::bigint,null::text,c.id,s.deleted_at
  from public.work_shifts s join public.work_calendars c on c.id=s.calendar_id
  left join public.owner_companies o on o.id=c.owner_company_id
  where s.deleted_at is not null and (p_calendar_id is null or s.calendar_id=p_calendar_id)
   and erp_private.master_permission('work_shifts','manage',c.owner_company_id,null);
 end if;
end $$;
alter function erp_private.archived_master_records(text,bigint) owner to postgres;
revoke all on function erp_private.archived_master_records(text,bigint) from public,anon,service_role;
grant execute on function erp_private.archived_master_records(text,bigint) to authenticated;

create function public.list_archived_master_records(p_entity text,p_calendar_id bigint default null)
returns table(id bigint,name text,code text,revision text,owner_company_id bigint,company_name text,
 branch_id bigint,branch_name text,parent_id bigint,archived_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select * from erp_private.archived_master_records(p_entity,p_calendar_id);
$$;
revoke all on function public.list_archived_master_records(text,bigint) from public,anon,service_role;
grant execute on function public.list_archived_master_records(text,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
