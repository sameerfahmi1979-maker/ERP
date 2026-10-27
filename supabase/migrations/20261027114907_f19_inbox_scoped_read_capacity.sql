-- H14 measured Inbox SELECT hotspot. Keep point/write authorization unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preimage$
DECLARE expected record;
BEGIN
 IF current_user<>'postgres' OR has_schema_privilege('authenticated','erp_private','CREATE') OR has_schema_privilege('anon','erp_private','CREATE') THEN
  RAISE EXCEPTION 'H14 owner/schema prerequisite changed';END IF;
 FOR expected IN SELECT * FROM(VALUES
 ('erp_private.readable_upload_session_ids()','4fc76ce2bb3b2ee1cfd0ef5b6f69466a'),
 ('erp_private.upload_row_allowed(bigint,bigint,bigint,bigint)','5effa05af90b2e11331c41762bb12ca9'),
 ('erp_private.f07_upload_subject_allowed(bigint)','1f235eb26fecc1fe29a163aee593c575'),
 ('erp_private.upload_session_allowed(bigint)','a887d0557456f91e9e46998221251b6f'),
 ('public.current_user_has_permission_any_scope(text)','4e7bd1d214481464f237f8e57cdf09c3')
 )v(signature,body_hash)LOOP
  -- The saved rehearsal retained CRLF in this one predecessor; the live body
  -- uses LF. Accept only that verified newline equivalence, never trimmed or
  -- otherwise normalized SQL. Every other prerequisite remains byte-exact.
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature)
   AND(CASE WHEN expected.signature='erp_private.readable_upload_session_ids()'THEN md5(replace(p.prosrc,E'\r\n',E'\n'))ELSE md5(p.prosrc)END)=expected.body_hash
   AND p.prosecdef AND p.provolatile='s'AND p.proowner='postgres'::regrole)THEN
   RAISE EXCEPTION 'H14 authority preimage changed: %',expected.signature;END IF;
 END LOOP;
 IF (SELECT proacl::text FROM pg_proc WHERE oid='erp_private.readable_upload_session_ids()'::regprocedure)IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.dms_upload_sessions'::regclass AND relrowsecurity AND relowner='postgres'::regrole)
 OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.dms_upload_sessions'::regclass AND polname='f03_principal'AND NOT polpermissive AND polcmd='*'AND polroles=ARRAY['authenticated'::regrole::oid]AND pg_get_expr(polqual,polrelid)='( SELECT erp_private.business_principal_is_active() AS business_principal_is_active)')
 OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.dms_upload_sessions'::regclass AND polname='f03_upload_subject_select'AND NOT polpermissive AND polcmd='r'AND polroles=ARRAY['authenticated'::regrole::oid]AND pg_get_expr(polqual,polrelid)='(id IN ( SELECT erp_private.readable_upload_session_ids() AS readable_upload_session_ids))')
 OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.dms_upload_sessions'::regclass AND polname='f07_original_upload_subject_read'AND NOT polpermissive AND polcmd='r'AND polroles=ARRAY['authenticated'::regrole::oid]AND pg_get_expr(polqual,polrelid)='erp_private.f07_upload_subject_allowed(id)')THEN
  RAISE EXCEPTION 'H14 required conjunctive SELECT policies/ACL changed';END IF;
END;$preimage$;

CREATE OR REPLACE FUNCTION erp_private.readable_upload_session_ids()
RETURNS SETOF bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE actor bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(erp_private.business_principal_is_active(),false)THEN RETURN;END IF;
 IF public.current_user_is_global_admin()THEN
  RETURN QUERY SELECT s.id FROM public.dms_upload_sessions s WHERE s.document_id IS NULL OR EXISTS(SELECT 1 FROM public.dms_documents d WHERE d.id=s.document_id AND d.deleted_at IS NULL);
  RETURN;
 END IF;
 -- If neither reviewer capability exists anywhere, the unchanged point gate
 -- can only succeed through its own-uploader + upload-capability disjunct.
 -- Do not evaluate unrelated uploaders' bound-document evidence repeatedly.
 IF NOT public.current_user_has_permission_any_scope('dms.documents.review_ai')AND NOT public.current_user_has_permission_any_scope('dms.admin')THEN
  IF NOT public.current_user_has_permission_any_scope('dms.documents.upload')THEN RETURN;END IF;
  actor:=public.current_user_profile_id();
  RETURN QUERY
  WITH scope_keys AS MATERIALIZED(SELECT DISTINCT s.uploaded_by,s.owning_company_id,s.owning_branch_id,s.document_id FROM public.dms_upload_sessions s WHERE s.uploaded_by=actor),
  allowed_keys AS MATERIALIZED(SELECT k.* FROM scope_keys k WHERE erp_private.upload_row_allowed(k.uploaded_by,k.owning_company_id,k.owning_branch_id,k.document_id))
  SELECT s.id FROM public.dms_upload_sessions s JOIN allowed_keys k ON s.uploaded_by IS NOT DISTINCT FROM k.uploaded_by AND s.owning_company_id IS NOT DISTINCT FROM k.owning_company_id AND s.owning_branch_id IS NOT DISTINCT FROM k.owning_branch_id AND s.document_id IS NOT DISTINCT FROM k.document_id;
  RETURN;
 END IF;
 -- Reviewer/admin behavior retains the full original nullable scope tuples.
 RETURN QUERY
 WITH scope_keys AS MATERIALIZED(SELECT DISTINCT s.uploaded_by,s.owning_company_id,s.owning_branch_id,s.document_id FROM public.dms_upload_sessions s),
 allowed_keys AS MATERIALIZED(SELECT k.* FROM scope_keys k WHERE erp_private.upload_row_allowed(k.uploaded_by,k.owning_company_id,k.owning_branch_id,k.document_id))
 SELECT s.id FROM public.dms_upload_sessions s JOIN allowed_keys k ON s.uploaded_by IS NOT DISTINCT FROM k.uploaded_by AND s.owning_company_id IS NOT DISTINCT FROM k.owning_company_id AND s.owning_branch_id IS NOT DISTINCT FROM k.owning_branch_id AND s.document_id IS NOT DISTINCT FROM k.document_id;
END;$function$;

-- For a generic, unbatched intake, the original F07 point gate reduces to
-- active principal + existing undeleted row + upload_row_allowed. The first
-- and last checks are already mandatory in the retained restrictive F03
-- policies. Keep the undeleted-row check here. Every non-generic/batch path
-- still uses the complete F07 point gate; write policies are untouched.
ALTER POLICY f07_original_upload_subject_read ON public.dms_upload_sessions
USING(CASE WHEN origin_entity_type IS NULL AND batch_id IS NULL THEN deleted_at IS NULL ELSE erp_private.f07_upload_subject_allowed(id)END);
COMMENT ON FUNCTION erp_private.readable_upload_session_ids()IS 'Statement-local Inbox ID set: exact global/reviewer authority; own-uploader necessary-condition filter when no reviewer capability; unchanged point gate, no persistent cache.';
COMMIT;
