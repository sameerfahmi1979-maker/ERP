begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Future-write rules only. No historical company mapping or hierarchy is inferred.
-- Serialize infrequent catalogue relationship mutations BEFORE row locks; readers
-- are unaffected. Both relationship endpoints participate, avoiding write skew.
create function erp_private.lock_finance_relationships() returns trigger
language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('f06-finance-relationships',0));
 return null;
end$$;
revoke all on function erp_private.lock_finance_relationships() from public,anon,authenticated,service_role;
do $$declare t text;begin
 foreach t in array array['cost_centers','profit_centers','branches','owner_companies'] loop
  execute format('create trigger f06_a_finance_relationship_lock before insert or update or delete on public.%I for each statement execute function erp_private.lock_finance_relationships()',t);
 end loop;
end$$;

-- Definer is confined to trigger-only reference inspection: the caller's existing
-- RLS still authorizes the initiating write. No read/write privilege is widened.
create function erp_private.validate_finance_center() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb;o jsonb;prefix text;parent_field text;code_field text;name_field text;
 company bigint;branch bigint;parent_id bigint;parent jsonb;target_branch public.branches%rowtype;
 rel_changed boolean;reactivating boolean;violation boolean;company_status text;branch_field text;
begin
 if TG_TABLE_NAME not in ('cost_centers','profit_centers') then raise exception 'Unsupported finance centre' using errcode='22023';end if;
 if TG_OP='DELETE' then raise exception 'Retire finance centres; retain their history' using errcode='23514';end if;
 n:=to_jsonb(new);o:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 prefix:=case TG_TABLE_NAME when 'cost_centers' then 'cost' else 'profit' end;
 parent_field:='parent_'||prefix||'_center_id';code_field:=prefix||'_center_code';name_field:=prefix||'_center_name_en';branch_field:=prefix||'_center_id';
 if TG_OP='UPDATE' and (n->code_field is distinct from o->code_field or n->'is_system' is distinct from o->'is_system') then
  raise exception 'Finance centre identifier and system flag are immutable' using errcode='22023';
 end if;
 if TG_OP='INSERT' or n->name_field is distinct from o->name_field then
  n:=jsonb_set(n,array[name_field],to_jsonb(btrim(n->>name_field)));
  if coalesce(length(n->>name_field),0) not between 2 and 255 then raise exception 'Invalid finance centre name' using errcode='23514',detail=name_field;end if;
 end if;
 if TG_OP='INSERT' and (coalesce(length(n->>code_field),0) not between 2 and 50 or n->>code_field !~ '^[A-Z0-9_-]+$') then
  raise exception 'Invalid finance centre identifier' using errcode='23514',detail=code_field;
 end if;
 if (TG_OP='INSERT' or n->'sort_order' is distinct from o->'sort_order') and (n->>'sort_order')::integer<0 then
  raise exception 'Invalid finance centre sort order' using errcode='23514',detail='sort_order';
 end if;
 company:=(n->>'owner_company_id')::bigint;branch:=(n->>'branch_id')::bigint;parent_id:=(n->>parent_field)::bigint;
 reactivating:=TG_OP='UPDATE' and n->>'is_active'='true' and o->>'is_active'='false';
 rel_changed:=TG_OP='INSERT' or reactivating or n->'owner_company_id' is distinct from o->'owner_company_id'
  or n->'branch_id' is distinct from o->'branch_id' or n->parent_field is distinct from o->parent_field;
 if rel_changed then
  if company is not null then
   select status into company_status from public.owner_companies where id=company for share;
   if company_status is distinct from 'active' then raise exception 'Choose an active company' using errcode='23503',detail='owner_company_id';end if;
  end if;
  if branch is not null then
   select * into target_branch from public.branches where id=branch for share;
   if target_branch.id is null or company is null or target_branch.owner_company_id is distinct from company then
    raise exception 'Branch must belong to the selected company' using errcode='23514',detail='branch_id';
   end if;
   if target_branch.status is distinct from 'active' then raise exception 'Choose an active branch' using errcode='23503',detail='branch_id';end if;
  end if;
  if parent_id is not null then
   execute format('select to_jsonb(p) from public.%I p where id=$1 for share',TG_TABLE_NAME) into parent using parent_id;
   if parent is null or parent->>'is_active' is distinct from 'true' then raise exception 'Choose an active parent centre' using errcode='23503',detail=parent_field;end if;
   if (parent->>'owner_company_id' is not null and (parent->>'owner_company_id')::bigint is distinct from company)
    or (parent->>'branch_id' is not null and (parent->>'branch_id')::bigint is distinct from branch) then
    raise exception 'Parent centre must cover the same company and branch' using errcode='23514',detail=parent_field;
   end if;
   execute format('with recursive ancestors as (select id,%1$I from public.%2$I where id=$1 union select p.id,p.%1$I from public.%2$I p join ancestors a on p.id=a.%1$I) select exists(select 1 from ancestors where id=$2)',parent_field,TG_TABLE_NAME) into violation using parent_id,new.id;
   if violation then raise exception 'Finance centre hierarchy cannot contain a cycle' using errcode='23514',detail=parent_field;end if;
  end if;
 end if;
 if TG_OP='UPDATE' and (n->'owner_company_id' is distinct from o->'owner_company_id' or n->'branch_id' is distinct from o->'branch_id') then
  execute format('select exists(select 1 from public.%I where %I=$1 and (($2 is not null and owner_company_id is distinct from $2) or ($3 is not null and branch_id is distinct from $3)))',TG_TABLE_NAME,parent_field)
   into violation using new.id,company,branch;
  if violation then raise exception 'Centre scope change would contradict its children' using errcode='23514';end if;
  execute format('select exists(select 1 from public.branches where %I=$1 and (($2 is not null and owner_company_id is distinct from $2) or ($3 is not null and id is distinct from $3)))',branch_field)
   into violation using new.id,company,branch;
  if violation then raise exception 'Centre scope change would contradict a branch reference' using errcode='23514';end if;
 end if;
 if TG_OP='UPDATE' and not new.is_active and old.is_active then
  execute format('select exists(select 1 from public.%I where %I=$1 and is_active)',TG_TABLE_NAME,parent_field) into violation using new.id;
  if violation then raise exception 'Retire active child centres first' using errcode='23514';end if;
  execute format('select exists(select 1 from public.branches where %I=$1 and status=''active'')',branch_field) into violation using new.id;
  if violation then raise exception 'An active branch still uses this centre' using errcode='23514';end if;
 end if;
 new:=jsonb_populate_record(new,n);return new;
end$$;
alter function erp_private.validate_finance_center() owner to postgres;
revoke all on function erp_private.validate_finance_center() from public,anon,authenticated,service_role;
create trigger f06_validate_cost_center before insert or update or delete on public.cost_centers for each row execute function erp_private.validate_finance_center();
create trigger f06_validate_profit_center before insert or update or delete on public.profit_centers for each row execute function erp_private.validate_finance_center();

create function erp_private.validate_finance_branch_references() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 t text;field text;target jsonb;changed boolean;reactivating boolean;violation boolean;company_status text;
begin
 reactivating:=TG_OP='UPDATE' and new.status='active' and old.status is distinct from 'active';
 changed:=TG_OP='INSERT' or reactivating or new.owner_company_id is distinct from old.owner_company_id;
 if changed then
  select status into company_status from public.owner_companies where id=new.owner_company_id for share;
  if company_status is distinct from 'active' then raise exception 'Choose an active company' using errcode='23503',detail='owner_company_id';end if;
 end if;
 foreach t in array array['cost_centers','profit_centers'] loop
  field:=case t when 'cost_centers' then 'cost_center_id' else 'profit_center_id' end;
  if n->>field is not null and (changed or n->field is distinct from o->field) then
   execute format('select to_jsonb(c) from public.%I c where id=$1 for share',t) into target using (n->>field)::bigint;
   if target is null or target->>'is_active' is distinct from 'true' then raise exception 'Choose an active finance centre' using errcode='23503',detail=field;end if;
   if (target->>'owner_company_id' is not null and (target->>'owner_company_id')::bigint is distinct from new.owner_company_id)
    or (target->>'branch_id' is not null and (target->>'branch_id')::bigint is distinct from new.id) then
    raise exception 'Finance centre must match the branch company and scope' using errcode='23514',detail=field;
   end if;
  end if;
  if TG_OP='UPDATE' and new.owner_company_id is distinct from old.owner_company_id then
   execute format('select exists(select 1 from public.%I where branch_id=$1 and owner_company_id is distinct from $2)',t) into violation using new.id,new.owner_company_id;
   if violation then raise exception 'Branch transfer would contradict existing finance centres' using errcode='23514';end if;
  end if;
  if TG_OP='UPDATE' and new.status is distinct from 'active' and old.status='active' then
   execute format('select exists(select 1 from public.%I where branch_id=$1 and is_active)',t) into violation using new.id;
   if violation then raise exception 'Retire active branch finance centres first' using errcode='23514';end if;
  end if;
 end loop;
 return new;
end$$;
alter function erp_private.validate_finance_branch_references() owner to postgres;
revoke all on function erp_private.validate_finance_branch_references() from public,anon,authenticated,service_role;
create trigger f06_validate_finance_branch before insert or update on public.branches for each row execute function erp_private.validate_finance_branch_references();

create function erp_private.validate_finance_company_retirement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from 'active' and old.status='active' and (
  exists(select 1 from public.cost_centers where owner_company_id=new.id and is_active)
  or exists(select 1 from public.profit_centers where owner_company_id=new.id and is_active)
  or exists(select 1 from public.branches where owner_company_id=new.id and status='active')) then
  raise exception 'Retire active company branches and finance centres first' using errcode='23514';
 end if;
 return new;
end$$;
alter function erp_private.validate_finance_company_retirement() owner to postgres;
revoke all on function erp_private.validate_finance_company_retirement() from public,anon,authenticated,service_role;
create trigger f06_validate_finance_company_retirement before update on public.owner_companies for each row execute function erp_private.validate_finance_company_retirement();
notify pgrst,'reload schema';
commit;
