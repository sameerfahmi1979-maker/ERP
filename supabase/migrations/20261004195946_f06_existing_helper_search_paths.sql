begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Preserve existing business decisions and function identities/ACLs. These
-- inherited helpers previously resolved application calls through the caller's
-- search path. No role, policy, table ownership or co-hosted table is changed.
create or replace function public.current_user_can_view_hr_recruitment()
returns boolean language sql stable security definer set search_path='' as $$
 select public.current_user_has_permission('hr.recruitment.view')
  or public.current_user_has_permission('hr.recruitment.manage')
  or public.current_user_has_permission('hr.employees.view');
$$;
create or replace function public.current_user_can_manage_hr_recruitment()
returns boolean language sql stable security definer set search_path='' as $$
 select public.current_user_has_permission('hr.recruitment.manage');
$$;
alter function public.set_updated_at() set search_path='';
alter function public.update_updated_at_column() set search_path='';
alter function public.set_updated_at_output_public_links() set search_path='';
alter function public.validate_lookup_value_parent() set search_path='';
alter function public.prevent_checksum_update() set search_path='';

-- Fixed text-search configuration instead of a caller-resolved regconfig.
-- Preserve the original A/B weighting and intentional exclusion of raw OCR.
create or replace function public.update_dms_document_content_tsv()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.content_tsv:=
  pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.simple'::pg_catalog.regconfig,coalesce(new.document_no,'')),'A') ||
  pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.simple'::pg_catalog.regconfig,coalesce(new.title,'')),'A') ||
  pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.simple'::pg_catalog.regconfig,coalesce(new.description,'')),'B') ||
  pg_catalog.setweight(pg_catalog.to_tsvector('pg_catalog.simple'::pg_catalog.regconfig,coalesce(new.ai_summary,'')),'B');
 return new;
end;
$$;
notify pgrst,'reload schema';
commit;
