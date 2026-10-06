BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- P03 already computes the F03 visible document set once per statement.
-- Reuse it for renewal SELECT only. Do not cache authority across requests,
-- introduce a privileged API, or change action capabilities or write checks.
DO $preimage$
BEGIN
 IF (SELECT md5(replace(prosrc,E'\r','')) FROM pg_proc WHERE oid='erp_private.read_documents()'::regprocedure)
      IS DISTINCT FROM '0f0eab71e21aa2f965c08bd6f5f31810'
 OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='erp_private.document_permission(bigint,text)'::regprocedure)
      IS DISTINCT FROM '2190943612f7b95620a97b76fb50fc84'
 OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='dms_renewal_requests') <> 6
 OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dms_renewal_requests'
      AND policyname='f03_document_subject' AND permissive='RESTRICTIVE' AND cmd='ALL' AND roles=ARRAY['authenticated']::name[]
      AND qual=$expression$erp_private.document_permission(document_id, 'dms.documents.view'::text)$expression$
      AND with_check=qual)
 OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dms_renewal_requests'
      AND policyname='dms_renewals_select' AND permissive='PERMISSIVE' AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[]
      AND qual=$expression$((auth.uid() IS NOT NULL) AND (erp_private.document_permission(document_id, 'dms.documents.view'::text) OR erp_private.document_permission(document_id, 'dms.admin'::text) OR current_user_has_role('system_admin'::text)))$expression$
      AND with_check IS NULL)
 OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dms_renewal_requests'
      AND policyname='f03_principal' AND permissive='RESTRICTIVE' AND cmd='ALL' AND roles=ARRAY['authenticated']::name[]
      AND qual=$expression$( SELECT erp_private.business_principal_is_active() AS business_principal_is_active)$expression$
      AND with_check=qual)
 THEN RAISE EXCEPTION 'P04 renewal security preimage changed; review required'; END IF;
END $preimage$;

-- Split the restrictive ALL policy so INSERT/UPDATE/DELETE retain its exact
-- tuple-level predicate. This is necessary: adding a SELECT policy would not
-- remove the old per-row restrictive ALL check from reads.
DROP POLICY f03_document_subject ON public.dms_renewal_requests;
CREATE POLICY f03_document_subject_insert ON public.dms_renewal_requests
 AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (erp_private.document_permission(document_id,'dms.documents.view'));
CREATE POLICY f03_document_subject_update ON public.dms_renewal_requests
 AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (erp_private.document_permission(document_id,'dms.documents.view'))
 WITH CHECK (erp_private.document_permission(document_id,'dms.documents.view'));
CREATE POLICY f03_document_subject_delete ON public.dms_renewal_requests
 AS RESTRICTIVE FOR DELETE TO authenticated
 USING (erp_private.document_permission(document_id,'dms.documents.view'));
CREATE POLICY f03_document_subject_select ON public.dms_renewal_requests
 AS RESTRICTIVE FOR SELECT TO authenticated
 USING (document_id IN (SELECT d.id FROM erp_private.read_documents() d));

-- Algebra under the mandatory view predicate V:
-- V AND uid AND (V OR admin OR legacy-role) = V AND uid.
-- The mandatory live-principal policy and all permissive write policies stay.
ALTER POLICY dms_renewals_select ON public.dms_renewal_requests
 USING ((SELECT auth.uid()) IS NOT NULL);
NOTIFY pgrst, 'reload schema';
COMMIT;
