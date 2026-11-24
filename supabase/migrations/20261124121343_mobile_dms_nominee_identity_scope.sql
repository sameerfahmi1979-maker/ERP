-- Nomination is a named app-only link, never a document-access grant. Preserve
-- existing share/source revalidation, function signature, owner and private ACL.
begin;
set local lock_timeout='5s';
create or replace function erp_private.mobile_dms_nominees(company bigint,branch bigint)
returns table(id bigint,label text)
language sql stable security definer set search_path=''as $$
 select p.id,case
   when nullif(btrim(p.full_name),'')is null then coalesce(nullif(btrim(p.display_name),''),'ERP user #'||p.id::text)
   when nullif(btrim(p.display_name),'')is null or lower(btrim(p.full_name))=lower(btrim(p.display_name))then btrim(p.full_name)
   else btrim(p.full_name)||' ('||btrim(p.display_name)||')'end
 from public.user_profiles p
 where(company is null or company>0)and(branch is null or(branch>0 and company is not null))
   and p.status='active'and not p.must_change_password and p.auth_user_id is not null and p.id<>public.current_user_profile_id()
   and exists(select from public.user_roles ur join public.roles r on r.id=ur.role_id
     where ur.user_profile_id=p.id and ur.is_active and r.is_active
       and erp_private.administrator_assignment_shape(r.role_code,ur.owner_company_id,ur.branch_id)
       and((ur.owner_company_id is null and ur.branch_id is null)
         or(company is not null and ur.owner_company_id=company and(ur.branch_id is null or ur.branch_id=branch))));
$$;
-- CREATE OR REPLACE on the same TABLE(id bigint,label text) function retains its
-- existing revoked public/API execution ACL. No role/grant/business rows change.
commit;
