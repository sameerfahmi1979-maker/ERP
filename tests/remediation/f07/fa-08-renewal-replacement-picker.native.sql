\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
 IF current_database() <> 'fa08_renewal_431'
  OR (SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = current_database())
    IS DISTINCT FROM 'ERP FA-08 v431 synthetic renewals'
  OR current_setting('cron.launch_active_jobs') <> 'off' THEN
  RAISE EXCEPTION 'Marked isolated renewal database required';
 END IF;
END $$;

CREATE FUNCTION pg_temp.ok(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
 RAISE NOTICE 'PASS: %', label;
END $$;
CREATE FUNCTION pg_temp.denied(sql text, code text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE sql;
  RAISE EXCEPTION 'Operation unexpectedly succeeded';
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE <> code THEN RAISE EXCEPTION 'FAIL: % returned % %', label, SQLSTATE, SQLERRM; END IF;
 END;
 RAISE NOTICE 'PASS: %', label;
END $$;
CREATE FUNCTION pg_temp.actor(n integer) RETURNS text LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '93300000-0000-4000-8000-' || lpad(n::text, 12, '0'),
  'session_id', '93300000-0000-4000-8001-' || lpad(n::text, 12, '0'),
  'role', 'authenticated')::text, true)
$$;

INSERT INTO public.owner_companies(id, company_code, legal_name_en) VALUES
 (933001, 'QA_FA08_A', 'Synthetic FA08 A'), (933002, 'QA_FA08_B', 'Synthetic FA08 B');
INSERT INTO public.branches(id, owner_company_id, branch_code, branch_name_en) VALUES
 (933001, 933001, 'QA_FA08_A', 'Synthetic home branch'),
 (933002, 933001, 'QA_FA08_SIB', 'Synthetic sibling branch'),
 (933003, 933002, 'QA_FA08_B', 'Synthetic other branch');
INSERT INTO auth.users(id, email, aud, role, email_confirmed_at, raw_user_meta_data)
SELECT ('93300000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'fa08-' || n || '@example.invalid',
 'authenticated', 'authenticated', now(), '{"full_name":"Synthetic Renewal Actor"}'
FROM generate_series(1, 5) n;
INSERT INTO auth.sessions(id, user_id, created_at, not_after)
SELECT replace(id::text, '-8000-', '-8001-')::uuid, id, now(),
 CASE WHEN email = 'fa08-5@example.invalid' THEN now() - interval '1 day' ELSE now() + interval '1 day' END
FROM auth.users WHERE email LIKE 'fa08-%@example.invalid';
UPDATE public.user_profiles SET status = 'active', must_change_password = false
WHERE auth_user_id::text LIKE '93300000-0000-4000-8000-%';

INSERT INTO public.roles(id, role_code, role_name) VALUES
 (933001, 'QA_FA08_MANAGER', 'Synthetic renewal manager'),
 (933002, 'QA_FA08_NOEDIT', 'Synthetic renewal manager without edit');
INSERT INTO public.permissions(permission_code, permission_name, module_code, action_code, administrator_scope)
SELECT code, code, 'DMS', split_part(code, '.', 3), 'branch'
FROM unnest(ARRAY['dms.documents.view','dms.documents.edit','dms.renewals.view','dms.renewals.manage']) code
ON CONFLICT (permission_code) DO NOTHING;
INSERT INTO public.role_permissions(role_id, permission_id)
SELECT role, id FROM public.permissions CROSS JOIN (VALUES (933001), (933002)) r(role)
WHERE permission_code IN ('dms.documents.view', 'dms.renewals.view', 'dms.renewals.manage')
 OR (role = 933001 AND permission_code = 'dms.documents.edit');
INSERT INTO public.user_roles(user_profile_id, role_id, owner_company_id, branch_id)
SELECT p.id, CASE WHEN n = 3 THEN 933002 ELSE 933001 END, company, branch
FROM (VALUES (1, 933001, 933001), (2, 933001, 933002), (3, 933001, 933001),
 (4, 933001, 933001), (4, 933001, 933002), (4, 933002, 933003), (5, 933001, 933001)) a(n, company, branch)
JOIN public.user_profiles p ON p.auth_user_id = ('93300000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;

-- Seed historical and lifecycle variations, then restore every trigger for checks and completion.
SET LOCAL session_replication_role = replica;
INSERT INTO public.dms_document_categories(id, category_code, name_en) OVERRIDING SYSTEM VALUE
VALUES (933001, 'QA_FA08', 'Synthetic renewal evidence');
INSERT INTO public.dms_document_types(id, type_code, name_en, category_id, requires_expiry_tracking, allowed_entity_types)
OVERRIDING SYSTEM VALUE VALUES
 (933001, 'QA_FA08', 'Synthetic renewal type', 933001, true, ARRAY['fleet_asset', 'company', 'branch']),
 (933002, 'QA_FA08_OTHER', 'Synthetic different type', 933001, true, ARRAY['company', 'branch']);
INSERT INTO public.dms_document_workflows(id, workflow_code, name_en) OVERRIDING SYSTEM VALUE
VALUES (933001, 'QA_FA08', 'Synthetic active approval workflow');
INSERT INTO public.dms_workflow_document_types(workflow_id, document_type_id) VALUES (933001, 933001);
INSERT INTO public.dms_documents(id, document_no, title, document_type_id, category_id, owning_company_id, owning_branch_id,
 confidentiality_level, status, approval_status, expiry_date, created_at, deleted_at, is_archived, archived_at)
OVERRIDING SYSTEM VALUE
SELECT id, CASE WHEN id = 933003 THEN 'QA-LEGACY-ISSUE' ELSE 'QA-FA08-' || id END,
 CASE WHEN id = 933003 THEN 'Prior %_ issue' ELSE 'Synthetic replacement ' || id END,
 CASE WHEN id = 933091 THEN 933002 ELSE 933001 END, 933001,
 CASE WHEN id = 933081 THEN 933002 ELSE 933001 END,
 CASE id WHEN 933080 THEN 933002 WHEN 933081 THEN 933003 ELSE 933001 END,
 CASE WHEN id = 933084 THEN 'hr' ELSE 'internal' END,
 CASE id WHEN 933082 THEN 'draft' WHEN 933075 THEN 'approved' ELSE 'active' END,
 CASE WHEN id = 933087 THEN 'pending_approval' ELSE 'approved' END,
 CASE WHEN id <> 933088 THEN date '2028-02-29' END,
 CASE WHEN id = 933003 THEN timestamptz '2025-01-01 00:00:00Z' ELSE timestamptz '2026-01-01 00:00:00Z' END,
 CASE WHEN id = 933090 THEN now() END, id = 933089, CASE WHEN id = 933089 THEN now() END
FROM generate_series(933001, 933091) id
WHERE id IN (933001, 933003, 933004, 933005) OR id BETWEEN 933010 AND 933075 OR id BETWEEN 933080 AND 933091;
INSERT INTO public.dms_document_links(document_id, entity_type, entity_id, is_primary)
SELECT id, 'branch', 933001, id <> 933003 FROM public.dms_documents
WHERE id BETWEEN 933001 AND 933091 AND id NOT IN (933004, 933005);
INSERT INTO public.dms_document_links(document_id, entity_type, entity_id, is_primary)
SELECT id, 'company', 933001, id = 933003 FROM public.dms_documents
WHERE id BETWEEN 933001 AND 933091 AND id NOT IN (933004, 933005, 933083);
INSERT INTO public.dms_document_links(document_id, entity_type, entity_id, deleted_at)
VALUES (933003, 'company', 933002, now()), (933085, 'company', 933002, NULL);
INSERT INTO public.dms_document_versions(id, document_id, version_number, is_current) OVERRIDING SYSTEM VALUE
VALUES (933003, 933003, 1, true), (933010, 933010, 1, true);
INSERT INTO public.dms_renewal_requests(id, document_id, renewal_no, status, replacement_document_id, completed_at)
OVERRIDING SYSTEM VALUE VALUES
 (933001, 933001, 'QA-FA08-MAIN', 'requested', NULL, NULL),
 (933002, 933080, 'QA-FA08-SIB', 'requested', NULL, NULL),
 (933003, 933084, 'QA-FA08-MASKED', 'requested', NULL, NULL),
 (933004, 933004, 'QA-FA08-UNLINKED', 'waiting_for_document', NULL, NULL),
 (933005, 933010, 'QA-FA08-CLAIM', 'renewed', 933086, now());
INSERT INTO public.dms_expiry_reminders(document_id, reminder_days_before, reminder_date, status)
VALUES (933001, 90, date '2027-12-01', 'pending');
SET LOCAL session_replication_role = origin;

SELECT to_regprocedure('public.fa08_renewal_replacement_page(bigint,text,bigint,integer)') IS NOT NULL AS installed \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1) AS actor \gset
WITH first_fifty AS (
 SELECT id FROM public.f03_read_documents()
 WHERE document_type_id = 933001 AND deleted_at IS NULL AND id NOT IN (933001, 933086)
  AND id IN (SELECT document_id FROM public.dms_document_links WHERE entity_type = 'branch' AND entity_id = 933001 AND deleted_at IS NULL)
 ORDER BY created_at DESC, id DESC LIMIT 50
)
SELECT pg_temp.ok(count(*) = 50 AND NOT bool_or(id = 933003) AND bool_or(id IN (933082, 933083, 933085, 933087, 933088, 933089)),
 'legacy protected 50-row picker hides the older eligible document and offers ineligible records')
FROM first_fifty;

\if :installed
SELECT pg_temp.ok(
 NOT has_function_privilege('anon', 'public.fa08_renewal_replacement_page(bigint,text,bigint,integer)', 'EXECUTE')
 AND NOT has_function_privilege('service_role', 'public.fa08_renewal_replacement_page(bigint,text,bigint,integer)', 'EXECUTE')
 AND NOT has_function_privilege('authenticated', 'erp_private.f07_renewal_subjects(bigint)', 'EXECUTE')
 AND NOT has_function_privilege('authenticated', 'erp_private.f07_renewal_replacement_eligibility(bigint,public.dms_documents,public.dms_documents,jsonb,bigint,date)', 'EXECUTE'),
 'picker callable only through the signed-in RPC; subjects and eligibility helpers are private');
SELECT pg_temp.ok(public.fa08_renewal_replacement_page(933001, 'prior %_ ISSUE')->'rows' =
 '[{"id":933003,"document_no":"QA-LEGACY-ISSUE","title":"Prior %_ issue","expiry_date":"2028-02-29","status":"active"}]'::jsonb,
 'literal case-insensitive title search reaches a matching older document with reversed primary and an inactive extra link');
SELECT pg_temp.ok(public.fa08_renewal_replacement_page(933001, 'legacy-issue')->'rows'->0->>'id' = '933003',
 'document number search reaches older eligible document');
SELECT pg_temp.ok(public.fa08_renewal_replacement_page(933001, 'prior xx issue')->'rows' = '[]'::jsonb,
 'literal search has a successful empty state');
SELECT pg_temp.ok(public.fa08_renewal_replacement_page(933004)->'rows'->0->>'id' = '933005'
 AND jsonb_array_length(public.fa08_renewal_replacement_page(933004)->'rows') = 1,
 'unlinked original accepts only unlinked same-scope replacement');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.dms_documents WHERE id IN (933080, 933081, 933084))
 AND public.fa08_renewal_replacement_page(933001, '933084')->'rows' = '[]'::jsonb,
 'direct RLS and the picker both hide unauthorized sibling, company and sensitive data');
SELECT pg_temp.denied('SELECT public.fa08_renewal_replacement_page(933002)', '42501', 'sibling renewal denied');
SELECT pg_temp.denied('SELECT public.fa08_renewal_replacement_page(933003)', '42501', 'masked renewal denied');
SELECT pg_temp.denied('SELECT public.fa08_renewal_replacement_page(939999)', '42501', 'missing renewal has the same denial class');
SELECT pg_temp.denied('SELECT public.fa08_renewal_replacement_page(933001, repeat(''a'',101))', '22023', 'search length bounded');
SELECT pg_temp.denied('SELECT public.fa08_renewal_replacement_page(933001, '''', 0, 25)', '22023', 'cursor is positive');
SELECT pg_temp.denied('SELECT public.fa08_renewal_replacement_page(933001, '''', NULL, 51)', '22023', 'page size bounded');

DO $$
DECLARE page jsonb; before_id bigint; ids bigint[] := ARRAY[]::bigint[]; steps integer := 0;
BEGIN
 LOOP
  page := public.fa08_renewal_replacement_page(933001, '', before_id, 25);
  ids := ids || ARRAY(SELECT (row ->> 'id')::bigint FROM jsonb_array_elements(page -> 'rows') row);
  before_id := (page ->> 'nextBefore')::bigint;
  steps := steps + 1;
  PERFORM pg_temp.ok(jsonb_array_length(page -> 'rows') = CASE WHEN steps < 3 THEN 25 ELSE 17 END,
   'eligible page size at page ' || steps);
  IF before_id IS NULL THEN EXIT; END IF;
  PERFORM pg_temp.ok(before_id = ids[array_length(ids, 1)], 'cursor follows last visible eligible record');
 END LOOP;
 PERFORM pg_temp.ok(ids = (ARRAY(SELECT generate_series(933075, 933010, -1))::bigint[] || 933003::bigint) AND steps = 3,
  'exact 67 eligible results in descending order with no duplicate, gap, missing older result or ineligible row');
END $$;

SELECT pg_temp.actor(2) AS actor \gset
SELECT pg_temp.denied('SELECT public.fa08_renewal_replacement_page(933001)', '42501', 'same company with sibling-only assignment denied');
SELECT pg_temp.actor(3) AS actor \gset
SELECT pg_temp.denied('SELECT public.fa08_renewal_replacement_page(933001)', '42501', 'manager who cannot edit source denied');
SELECT pg_temp.actor(4) AS actor \gset
SELECT pg_temp.ok((SELECT count(*) FROM public.dms_documents WHERE id IN (933080, 933081)) = 2
 AND public.fa08_renewal_replacement_page(933001, '933080')->'rows' = '[]'::jsonb
 AND public.fa08_renewal_replacement_page(933001, '933081')->'rows' = '[]'::jsonb,
 'actor admitted to all three branches only sees replacements from the source company and branch');
SELECT pg_temp.actor(5) AS actor \gset
SELECT pg_temp.denied('SELECT public.fa08_renewal_replacement_page(933001)', '42501', 'expired session denied');
SELECT pg_temp.actor(1) AS actor \gset

SELECT pg_temp.denied('SELECT public.f07_complete_document_renewal(933001,933083)', '42501', 'completion still denies incomplete subject set');
SELECT pg_temp.denied('SELECT public.f07_complete_document_renewal(933001,933086)', 'PT409', 'completion still rejects competing claim');
SELECT pg_temp.denied('SELECT public.f07_complete_document_renewal(933001,933087)', '22023', 'completion still requires approval');
SELECT pg_temp.denied('SELECT public.f07_complete_document_renewal(933001,933088)', '22023', 'completion still requires recorded expiry');
SELECT pg_temp.denied('SELECT public.f07_complete_document_renewal(933001,933003,933010)', '22023', 'completion still checks version ownership');
SELECT pg_temp.denied($q$SELECT public.f07_complete_document_renewal(933001,933003,933003,'2029-02-28')$q$, 'PT409', 'completion still denies changed expiry');
SELECT pg_temp.denied($q$UPDATE public.dms_renewal_requests SET status='renewed' WHERE id=933001$q$, '42501', 'direct write cannot bypass checked completion');
SELECT pg_temp.ok(
 public.f07_complete_document_renewal(933001, 933003, 933003, '2028-02-29', 'Synthetic checked receipt') =
 '{"status":"renewed","renewalId":933001,"documentId":933001,"replacementDocumentId":933003,"replayed":false,"reminderIntent":"schedule_created"}'::jsonb,
 'picked original completes through the existing atomic transition');
SELECT pg_temp.ok(
 (public.f07_complete_document_renewal(933001, 933003, 933003, '2028-02-29', 'Synthetic checked receipt')->>'replayed')::boolean,
 'same replacement, version, expiry and notes replay the durable completion receipt');
SELECT pg_temp.denied('SELECT public.fa08_renewal_replacement_page(933001)', '42501', 'completed request no longer has a picker');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*) FROM erp_private.f07_renewal_receipts WHERE request_id = 933001) = 1
 AND (SELECT count(*) FROM public.dms_document_events WHERE document_id = 933001 AND event_type = 'document_renewed') = 1
 AND (SELECT count(*) FROM public.dms_expiry_reminders WHERE document_id = 933003 AND status = 'pending') = 6
 AND (SELECT count(*) FROM public.dms_expiry_reminders WHERE document_id = 933001 AND status = 'dismissed') = 1,
 'one receipt and renewal event; the same original reminder dismissal and replacement schedule are retained');
\else
\echo 'LEGACY REPRODUCED. Checked replacement RPC is absent in this predecessor.'
\endif

ROLLBACK;
