-- Apply existing subject permissions to matching rows under caller RLS.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
BEGIN
  IF current_user<>'postgres'
  THEN RAISE EXCEPTION 'Reviewed subject resolver owner required'; END IF;
  IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid='public.ai_mod02_resolve_subject(text)'::regprocedure
    AND proowner='postgres'::regrole AND NOT prosecdef AND NOT proisstrict AND proretset
    AND provolatile='s' AND prorettype='record'::regtype
    AND prolang=(SELECT oid FROM pg_language WHERE lanname='sql')
    AND proconfig=ARRAY['search_path=""']
    AND proargnames=ARRAY['search_name','entity_type','entity_id','label','code']
    AND proallargtypes=ARRAY['text'::regtype,'text'::regtype,'bigint'::regtype,'text'::regtype,'text'::regtype]::oid[]
    AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)
      =ARRAY['authenticated=X/postgres','postgres=X/postgres']
    AND md5(replace(prosrc,E'\r\n',E'\n'))='dc13c07c43721339a8406ff7463df1eb')
  THEN RAISE EXCEPTION 'Reviewed subject resolver preimage changed'; END IF;
  PERFORM set_config('qa.subject_text_first.metadata',(SELECT (to_jsonb(p)-'prosrc')::text
    FROM pg_proc p WHERE p.oid='public.ai_mod02_resolve_subject(text)'::regprocedure),true);
END $guard$;

CREATE OR REPLACE FUNCTION public.ai_mod02_resolve_subject(search_name text)
RETURNS TABLE(entity_type text,entity_id bigint,label text,code text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $resolver$
 WITH candidates AS (
 SELECT 'employee'::text kind,e.id,e.full_name_en name,e.employee_code business_code,e.full_name_ar alternate,e.id employee_authority_id
 FROM public.employees e WHERE e.deleted_at IS NULL
   AND public.current_user_has_permission_any_scope('hr.employees.view')
 UNION ALL SELECT 'employee_dependent',d.id,d.dependent_name_en,NULL::text,d.dependent_name_ar,d.employee_id
 FROM public.employee_dependents d WHERE d.deleted_at IS NULL
   AND public.current_user_has_permission_any_scope('hr.employees.view')
 UNION ALL SELECT 'company',c.id,c.trade_name,c.company_code,NULL::text,NULL::bigint FROM public.owner_companies c
 WHERE public.current_user_has_permission_any_scope('organizations.view')
 UNION ALL SELECT 'branch',b.id,b.branch_name_en,b.branch_code,NULL::text,NULL::bigint FROM public.branches b
 WHERE public.current_user_has_permission_any_scope('branches.view')
 UNION ALL SELECT 'party',p.id,p.display_name,p.party_code,NULL::text,NULL::bigint FROM public.parties p
 WHERE p.is_active AND (public.current_user_has_permission_any_scope('master_data.parties.view') OR public.current_user_has_permission_any_scope('master_data.party_master.view'))
 UNION ALL SELECT 'site',s.id,s.site_name,s.site_code,NULL::text,NULL::bigint FROM public.work_sites s
 WHERE s.deleted_at IS NULL AND (public.current_user_has_permission_any_scope('common_md.view') OR public.current_user_has_permission_any_scope('common_md.work_sites.view'))
 ), wanted AS (SELECT public.ai_mod02_identity_text(search_name) q),
 matched AS MATERIALIZED (
 SELECT c.kind,c.id,CASE WHEN public.ai_mod02_identity_text(c.name)=w.q OR public.ai_mod02_identity_text(c.business_code)=w.q
   OR left(public.ai_mod02_identity_text(c.name),char_length(w.q)+1)=w.q||' ' THEN c.name ELSE c.alternate END AS matched_label,c.business_code,c.employee_authority_id
 FROM candidates c CROSS JOIN wanted w
 WHERE public.f03_current_session_valid() AND char_length(w.q) BETWEEN 2 AND 200
   AND (public.ai_mod02_identity_text(c.name)=w.q OR public.ai_mod02_identity_text(c.business_code)=w.q
     OR left(public.ai_mod02_identity_text(c.name),char_length(w.q)+1)=w.q||' '
     OR (coalesce(c.alternate,'')<>'' AND (public.ai_mod02_identity_text(c.alternate)=w.q OR left(public.ai_mod02_identity_text(c.alternate),char_length(w.q)+1)=w.q||' ')))
 )
 SELECT m.kind,m.id,m.matched_label,m.business_code FROM matched m
 WHERE m.kind NOT IN ('employee','employee_dependent')
   OR public.f03_has_employee_permission(m.employee_authority_id,'hr.employees.view')
 ORDER BY m.kind,m.id LIMIT 21;
$resolver$;

DO $verify$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid='public.ai_mod02_resolve_subject(text)'::regprocedure
    AND (to_jsonb(p)-'prosrc')::text=current_setting('qa.subject_text_first.metadata')
    AND md5(replace(prosrc,E'\r\n',E'\n'))='eaa3fd61e67642bde5348179c9cc123d')
  THEN RAISE EXCEPTION 'Subject resolver metadata or postimage changed'; END IF;
END $verify$;
COMMIT;
