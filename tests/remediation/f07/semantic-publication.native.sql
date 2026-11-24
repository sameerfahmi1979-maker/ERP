\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
 IF current_database() !~ '^(dms_phase_pub_sql(_[a-z]+)?|algt_dms_phase_closure)$'
  OR (SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = current_database())
     IS DISTINCT FROM 'algt-dms-phase-closure-20261124 isolated synthetic fixture'
  OR current_setting('cron.launch_active_jobs') IS DISTINCT FROM 'off' THEN
  RAISE EXCEPTION 'Marked isolated semantic publication database required';
 END IF;
 IF to_regprocedure('public.f07_semantic_index(text,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'FAIL: the service-only atomic semantic publication RPC is missing';
 END IF;
END $$;

CREATE FUNCTION pg_temp.ok(p_result boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF p_result IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', p_label; END IF;
 RAISE NOTICE 'PASS: %', p_label;
END $$;
CREATE FUNCTION pg_temp.denied(p_sql text, p_code text, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'Operation unexpectedly succeeded';
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE <> p_code THEN RAISE EXCEPTION 'FAIL: % returned % %', p_label, SQLSTATE, SQLERRM; END IF;
 END;
 RAISE NOTICE 'PASS: %', p_label;
END $$;

SELECT pg_temp.ok(NOT has_function_privilege('authenticated', 'public.f07_semantic_index(text,jsonb)', 'execute')
 AND NOT has_function_privilege('anon', 'public.f07_semantic_index(text,jsonb)', 'execute')
 AND has_function_privilege('service_role', 'public.f07_semantic_index(text,jsonb)', 'execute'), 'RPC grants are service-only');

INSERT INTO public.owner_companies(id, company_code, legal_name_en) VALUES (934701, 'QA_SEM_PUB', 'Synthetic semantic publication');
INSERT INTO public.branches(id, owner_company_id, branch_code, branch_name_en) VALUES (934701, 934701, 'QA_SEM_PUB', 'Synthetic branch');
INSERT INTO auth.users(id, email, aud, role, email_confirmed_at, raw_user_meta_data)
VALUES ('93470000-0000-4000-8000-000000000001', 'semantic-publication@example.invalid', 'authenticated', 'authenticated', now(), '{"full_name":"Synthetic Semantic Publisher"}');
INSERT INTO auth.sessions(id, user_id, created_at, not_after)
VALUES ('93470000-0000-4000-8001-000000000001', '93470000-0000-4000-8000-000000000001', now(), now() + interval '1 day');
UPDATE public.user_profiles SET status = 'active', must_change_password = false
WHERE auth_user_id = '93470000-0000-4000-8000-000000000001';
INSERT INTO public.roles(id, role_code, role_name) VALUES (934701, 'QA_SEM_PUB', 'Synthetic scoped semantic publisher');
INSERT INTO public.permissions(permission_code, permission_name, module_code, action_code, administrator_scope)
SELECT code, code, 'DMS', split_part(code, '.', 3), 'branch'
FROM unnest(ARRAY['dms.admin', 'dms.documents.edit', 'dms.documents.view', 'dms.documents.preview']) code
ON CONFLICT (permission_code) DO NOTHING;
INSERT INTO public.role_permissions(role_id, permission_id)
SELECT 934701, id FROM public.permissions WHERE permission_code IN ('dms.admin', 'dms.documents.edit', 'dms.documents.view', 'dms.documents.preview');
INSERT INTO public.user_roles(user_profile_id, role_id, owner_company_id, branch_id)
SELECT id, 934701, 934701, 934701 FROM public.user_profiles WHERE auth_user_id = '93470000-0000-4000-8000-000000000001';

SET LOCAL session_replication_role = replica;
INSERT INTO public.dms_document_categories(id, category_code, name_en) OVERRIDING SYSTEM VALUE
VALUES (934701, 'QA_SEM_PUB', 'Synthetic semantic publication');
INSERT INTO public.dms_document_types(id, type_code, name_en, category_id) OVERRIDING SYSTEM VALUE
VALUES (934701, 'QA_SEM_PUB', 'Synthetic semantic publication', 934701);
INSERT INTO public.dms_documents(id, document_no, title, document_type_id, category_id, owning_company_id, owning_branch_id, confidentiality_level, status, approval_status)
OVERRIDING SYSTEM VALUE VALUES (934701, 'QA-SEM-PUB', 'Synthetic semantic publication', 934701, 934701, 934701, 934701, 'internal', 'active', 'approved');
INSERT INTO public.dms_document_versions(id, document_id, version_number, is_current) OVERRIDING SYSTEM VALUE
VALUES (934701, 934701, 1, true), (934702, 934701, 2, false);
UPDATE public.dms_documents SET current_version_id = 934701 WHERE id = 934701;
INSERT INTO public.dms_document_files(id, document_id, version_id, file_role, storage_bucket, storage_path, file_name, mime_type, file_size_bytes, sha256_hash, ocr_status, ocr_text)
OVERRIDING SYSTEM VALUE VALUES (934701, 934701, 934701, 'original', 'dms-documents', '934701/2026/fixture/934701/v1/fixture.pdf', 'fixture.pdf', 'application/pdf', 100, repeat('c', 64), 'complete', E'  Atomic DMS publication 🧪\n');
INSERT INTO public.dms_document_content(id, document_id, content_text, content_text_sha256, is_truncated)
OVERRIDING SYSTEM VALUE VALUES (934701, 934701, E'  Atomic DMS publication 🧪\n', repeat('d', 64), false);
SET LOCAL session_replication_role = origin;

SELECT '{"role":"authenticated","sub":"93470000-0000-4000-8000-000000000001","session_id":"93470000-0000-4000-8001-000000000001"}' AS actor_claims,
 '{"x-algt-ai-job":"934701","x-algt-ai-claim":"93470000-0000-4000-8003-000000000001"}' AS headers \gset
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT erp_private.dms_question_text_hash(E'  Atomic DMS publication 🧪\n') AS raw_hash,
 erp_private.dms_question_text_hash('Atomic DMS publication 🧪') AS chunk_hash \gset
SELECT pg_temp.ok(erp_private.dms_question_record('file_ocr', '934701', 934701, 934701, :'raw_hash',
 jsonb_build_array(jsonb_build_object('fileId', 934701, 'versionId', 934701, 'sha256', repeat('c', 64))), '[]'), 'verified OCR fixture');
INSERT INTO erp_private.dms_question_inputs(id, document_id, version_id, parents, expires_at)
SELECT '93470000-0000-4000-8002-000000000001', document_id, version_id, jsonb_build_array(proof_hash), now() + interval '10 minutes'
FROM erp_private.dms_question_artifacts WHERE document_id = 934701 AND kind = 'file_ocr';
SELECT pg_temp.ok(public.dms_question_publish(jsonb_build_object('documentId', 934701, 'kind', 'content_text', 'artifactId', '934701',
 'artifactContentHash', :'raw_hash', 'inputId', '93470000-0000-4000-8002-000000000001')), 'verified raw-text fixture');

INSERT INTO public.dms_document_content_chunks(id, document_id, content_id, chunk_index, chunk_text, chunk_hash, content_hash, char_count, embedding_status, embedding)
OVERRIDING SYSTEM VALUE VALUES (934701, 934701, 934701, 0, 'Previous active chunk', repeat('a', 64), repeat('b', 64), 21,
 'complete', ('[1,' || repeat('0,', 1534) || '0]')::public.vector);
INSERT INTO public.erp_ai_feature_flags(feature_code, feature_name, is_enabled)
SELECT code, code, true FROM unnest(ARRAY['DMS_SEMANTIC_CHUNKING','DMS_SEMANTIC_EMBEDDINGS','DMS_AI_JOB_QUEUE','DMS_SEMANTIC_INDEX_QUEUE']) code
ON CONFLICT (feature_code) DO UPDATE SET is_enabled = true;
INSERT INTO public.dms_ai_job_queue(id, job_type, payload_json, related_document_id, job_status, attempt_count, locked_by, locked_at, created_by)
OVERRIDING SYSTEM VALUE SELECT 934701, 'semantic_document_index', '{"documentId":934701,"source":"manual_rebuild"}', 934701,
 'running', 1, 'qa-semantic-publication', now(), id FROM public.user_profiles WHERE auth_user_id = '93470000-0000-4000-8000-000000000001';
INSERT INTO erp_private.f07_job_claims(job_id, source_hash, actor_claims, content_hash, token, expires_at)
VALUES (934701, erp_private.f07_job_source(934701), :'actor_claims',
 :'raw_hash', '93470000-0000-4000-8003-000000000001', now() + interval '10 minutes');
SELECT jsonb_build_object('jobId', 934701, 'documentId', 934701, 'token', '93470000-0000-4000-8003-000000000001') AS request \gset
SELECT set_config('request.headers', :'headers', true);
SET LOCAL ROLE service_role;
SELECT public.f07_semantic_index('inspect', :'request'::jsonb) AS inspected \gset
SELECT pg_temp.ok(:'inspected'::jsonb @> jsonb_build_object('success', true, 'status', 'ready', 'versionId', 934701,
 'contentId', 934701, 'sourceHash', :'raw_hash', 'isTruncated', false, 'embeddingsEnabled', true)
 AND length(:'inspected'::jsonb->>'sourceProof') = 64, 'inspect returns verified UTF-8 hash, never the stored hash cache');
SELECT pg_temp.denied(format('SELECT public.f07_semantic_index(''inspect'', %L::jsonb)',
 (:'request'::jsonb || '{"token":"93470000-0000-4000-8003-000000000099"}')), '42501', 'mismatched scoped body and headers fail');
SELECT pg_temp.denied('UPDATE public.dms_document_content_chunks SET is_active = false WHERE id = 934701', '42501', 'raw update from a current claim is fenced');
SELECT set_config('algt.semantic_index_publisher', '934701/93470000-0000-4000-8003-000000000001', true);
SELECT pg_temp.denied('UPDATE public.dms_document_content_chunks SET is_active = false WHERE id = 934701', '42501', 'service role cannot use a spoofed internal setting for a raw write');
SELECT set_config('algt.semantic_index_publisher', '', true);
SELECT pg_temp.denied(format('SELECT public.f07_semantic_index(''inspect'', %L::jsonb)',
 (:'request'::jsonb || '{"forceRebuild":true}')), '42501', 'an ordinary claim cannot request a forced rebuild');

SELECT (:'request'::jsonb || (:'inspected'::jsonb - ARRAY['success', 'status']) || jsonb_build_object('chunks', jsonb_build_array(
 jsonb_build_object('chunkIndex', 0, 'chunkText', 'Atomic DMS publication 🧪', 'chunkHash', :'chunk_hash',
 'sourceKind', 'short_document', 'tokenEstimate', 7, 'charCount', 25, 'embeddingProvider', 'synthetic', 'embeddingModel', 'synthetic-1536',
 'embedding', (SELECT jsonb_agg(CASE WHEN n = 1 THEN 1 ELSE 0 END) FROM generate_series(1, 1536) n))))) AS staged \gset
SELECT pg_temp.ok(public.f07_semantic_index('publish', jsonb_set(:'staged'::jsonb, '{sourceHash}', to_jsonb(repeat('d', 64))))
 @> '{"success":false,"status":"held","reason":"source_changed"}', 'changed raw source hash is held');
SELECT pg_temp.ok(public.f07_semantic_index('publish', jsonb_set(:'staged'::jsonb, '{sourceProof}', to_jsonb(repeat('a', 64))))
 @> '{"success":false,"status":"held","reason":"source_changed"}', 'changed proof is held');
SELECT pg_temp.denied(format('SELECT public.f07_semantic_index(''publish'', %L::jsonb)',
 jsonb_set(jsonb_set(:'staged'::jsonb, '{chunks,0,chunkText}', to_jsonb('Forged DMS publication 🧪'::text)),
 '{chunks,0,chunkHash}', to_jsonb(encode(sha256(convert_to('Forged DMS publication 🧪', 'UTF8')), 'hex')))),
 '22023', 'a self-consistent fabricated chunk cannot acquire current source proof');
SELECT pg_temp.denied(format('SELECT public.f07_semantic_index(''publish'', %L::jsonb)',
 jsonb_set(:'staged'::jsonb, '{chunks,0,embedding}', '[1,2]')), '22023', 'rejected embedding keeps the prior index');
SELECT pg_temp.denied(format('SELECT public.f07_semantic_index(''publish'', %L::jsonb)',
 jsonb_set(:'staged'::jsonb, '{chunks,0,embedding,0}', '3e38')), '22023', 'NaN cosine vectors cannot reach the searchable index');
SELECT pg_temp.ok((SELECT is_active FROM public.dms_document_content_chunks WHERE id = 934701), 'prior row remains active after held publication');
RESET ROLE;

SAVEPOINT expired_claim;
UPDATE erp_private.f07_job_claims SET expires_at = clock_timestamp() - interval '1 minute' WHERE job_id = 934701;
SET LOCAL ROLE service_role;
SELECT pg_temp.denied(format('SELECT public.f07_semantic_index(''publish'', %L::jsonb)', :'staged'), 'PT409', 'expired exact claim cannot replace prior index');
ROLLBACK TO SAVEPOINT expired_claim;

SAVEPOINT revoked_authority;
DELETE FROM public.user_roles WHERE role_id = 934701;
SET LOCAL ROLE service_role;
SELECT pg_temp.denied(format('SELECT public.f07_semantic_index(''publish'', %L::jsonb)', :'staged'), '42501', 'revoked document authority cannot replace prior index');
ROLLBACK TO SAVEPOINT revoked_authority;

SAVEPOINT modified_content;
SELECT set_config('request.headers', '{}', true);
UPDATE public.dms_document_content SET content_text = 'Different actual text' WHERE document_id = 934701;
SELECT set_config('request.headers', :'headers', true);
SET LOCAL ROLE service_role;
SELECT pg_temp.denied(format('SELECT public.f07_semantic_index(''publish'', %L::jsonb)', :'staged'), 'PT409', 'actual text changed after inspection prevents publication');
ROLLBACK TO SAVEPOINT modified_content;

SAVEPOINT reconstructed_lineage;
SELECT set_config('request.headers', '{}', true);
UPDATE public.dms_document_content SET content_text_source = 'ocr' WHERE document_id = 934701;
DELETE FROM erp_private.dms_question_artifacts WHERE document_id = 934701 AND kind = 'content_text';
SELECT set_config('request.headers', :'headers', true);
SET LOCAL ROLE service_role;
SELECT pg_temp.ok(public.f07_semantic_index('inspect', :'request'::jsonb) @> jsonb_build_object('success', true, 'status', 'ready', 'sourceHash', :'raw_hash'),
 'inspection reconstructs current content lineage from exact recorded OCR text');
ROLLBACK TO SAVEPOINT reconstructed_lineage;

SAVEPOINT changed_embedding_policy;
UPDATE public.erp_ai_feature_flags SET is_enabled = false WHERE feature_code = 'DMS_SEMANTIC_EMBEDDINGS';
SET LOCAL ROLE service_role;
SELECT pg_temp.ok(public.f07_semantic_index('publish', :'staged'::jsonb)
 @> '{"success":false,"status":"held","reason":"embedding_policy_changed"}', 'embedding policy drift holds the replacement');
SELECT pg_temp.ok(public.f07_semantic_index('inspect', :'request'::jsonb)
 @> '{"success":false,"status":"held","reason":"search_index_preserved"}', 'disabled embeddings preserve the searchable prior index');
ROLLBACK TO SAVEPOINT changed_embedding_policy;

CREATE FUNCTION pg_temp.fail_semantic_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Synthetic failure after retirement and before proof' USING ERRCODE = 'XX000';
END $$;
CREATE TRIGGER qa_fail_semantic_insert AFTER INSERT ON public.dms_document_content_chunks
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_semantic_insert();
SET LOCAL ROLE service_role;
SELECT pg_temp.denied(format('SELECT public.f07_semantic_index(''publish'', %L::jsonb)', :'staged'), 'XX000', 'late insert failure rolls back the entire replacement');
SELECT pg_temp.ok((SELECT is_active FROM public.dms_document_content_chunks WHERE id = 934701), 'prior row is active after database rollback');
RESET ROLE;
DROP TRIGGER qa_fail_semantic_insert ON public.dms_document_content_chunks;

SET LOCAL ROLE service_role;
SELECT public.f07_semantic_index('publish', :'staged'::jsonb) AS published \gset
SELECT pg_temp.ok(:'published'::jsonb @> '{"success":true,"status":"published","chunksCreated":1,"chunksEmbedded":1,"pendingRemaining":0}', 'one complete index is published');
SELECT pg_temp.ok(public.f07_semantic_index('publish', :'staged'::jsonb) = :'published'::jsonb, 'replaying the exact current claim is idempotent');
RESET ROLE;
SELECT pg_temp.ok(NOT (SELECT is_active FROM public.dms_document_content_chunks WHERE id = 934701)
 AND (SELECT count(*) = 1 FROM public.dms_document_content_chunks WHERE document_id = 934701 AND is_active AND deleted_at IS NULL
      AND embedding_status = 'complete' AND embedding IS NOT NULL AND content_hash = :'raw_hash')
 AND (SELECT count(*) = 1 FROM erp_private.dms_question_artifacts WHERE document_id = 934701 AND kind = 'chunk_text'
      AND parents = jsonb_build_array(:'inspected'::jsonb->>'sourceProof') AND erp_private.dms_question_current(dms_question_artifacts)),
 'old rows retire and the visible index has current proof in the same transaction');

SELECT set_config('request.headers', '{}', true);
UPDATE erp_private.f07_job_claims SET token = '93470000-0000-4000-8003-000000000002' WHERE job_id = 934701;
SET LOCAL ROLE service_role;
SELECT pg_temp.ok(public.f07_semantic_index('receipt', :'request'::jsonb) = :'published'::jsonb, 'receipt survives replacement of the original claim');
SELECT pg_temp.ok(public.f07_semantic_index('receipt', :'request'::jsonb || '{"token":"93470000-0000-4000-8003-000000000002"}')
 @> '{"success":true,"status":"pending"}', 'new active token cannot recover previous token outcome or prove failure');
SELECT pg_temp.ok(public.f07_semantic_index('receipt', :'request'::jsonb || '{"token":"93470000-0000-4000-8003-000000000099"}')
 @> '{"success":true,"status":"missing"}', 'unrelated tokens cannot observe the active exact claim');
SELECT pg_temp.ok(public.f07_semantic_index('receipt', :'request'::jsonb || '{"documentId":934799}')
 @> '{"success":true,"status":"missing"}', 'receipt is restricted to the exact document');
SELECT pg_temp.denied(format('SELECT public.f07_semantic_index(''inspect'', %L::jsonb)', :'request'), '42501', 'inspect requires claim headers');
SELECT set_config('request.headers', '{"x-algt-ai-job":"934701","x-algt-ai-claim":"93470000-0000-4000-8003-000000000002"}', true);
SELECT pg_temp.ok(public.f07_semantic_index('inspect', :'request'::jsonb || '{"token":"93470000-0000-4000-8003-000000000002"}')
 @> '{"success":true,"status":"unchanged","chunksCreated":0,"chunksEmbedded":0,"pendingRemaining":0}', 'new exact claim recognizes the committed current index');
RESET ROLE;

SAVEPOINT recovery;
SELECT set_config('request.headers', '{}', true);
UPDATE public.dms_ai_job_queue SET max_attempts = 1 WHERE id = 934701;
UPDATE erp_private.f07_job_claims SET token = '93470000-0000-4000-8003-000000000001', expires_at = clock_timestamp() - interval '1 minute' WHERE job_id = 934701;
INSERT INTO public.dms_ai_job_queue(id, job_type, payload_json, related_document_id, job_status, attempt_count, max_attempts, locked_by, locked_at, created_by)
OVERRIDING SYSTEM VALUE SELECT 934702, job_type, payload_json, related_document_id, job_status, attempt_count, max_attempts, locked_by, locked_at, created_by
FROM public.dms_ai_job_queue WHERE id = 934701;
INSERT INTO erp_private.f07_job_claims(job_id, source_hash, actor_claims, content_hash, token, expires_at)
SELECT 934702, source_hash, actor_claims, content_hash, '93470000-0000-4000-8003-000000000003', expires_at
FROM erp_private.f07_job_claims WHERE job_id = 934701;
INSERT INTO public.dms_ai_job_attempts(job_id, attempt_number, status, worker_id)
VALUES (934701, 1, 'running', 'qa-semantic-publication'), (934702, 1, 'running', 'qa-semantic-publication');
DELETE FROM public.user_roles WHERE role_id = 934701;
SET LOCAL ROLE service_role;
SELECT pg_temp.ok(public.f07_ai_worker('recover', '{}') @> '{"success":true}', 'expired semantic jobs recover through the canonical worker');
SELECT pg_temp.ok(public.f07_ai_worker('settle', :'request'::jsonb - 'documentId' || '{"success":true}')
 @> '{"success":true,"status":"completed","jobId":934701,"attemptNumber":1}', 'committed final attempt settles after lost acknowledgments and revoked authority');
RESET ROLE;
SELECT pg_temp.ok((SELECT job_status = 'completed' AND locked_by IS NULL AND failed_at IS NULL FROM public.dms_ai_job_queue WHERE id = 934701)
 AND (SELECT status = 'completed' AND error_code IS NULL FROM public.dms_ai_job_attempts WHERE job_id = 934701)
 AND NOT EXISTS (SELECT 1 FROM public.dms_review_queue WHERE ai_job_id = 934701), 'recovery converges the queue and attempt to the proven publication');
SELECT pg_temp.ok((SELECT job_status = 'failed' FROM public.dms_ai_job_queue WHERE id = 934702)
 AND (SELECT status = 'timed_out' AND error_code = 'stale_lock' FROM public.dms_ai_job_attempts WHERE job_id = 934702),
 'an expired last attempt without its own receipt still follows normal recovery');
ROLLBACK TO SAVEPOINT recovery;

SELECT set_config('request.headers', '{}', true);
SELECT (:'staged'::jsonb->'chunks'->0->>'embedding') AS query_vector \gset
SET LOCAL ROLE service_role;
SELECT pg_temp.denied('UPDATE public.dms_document_content_chunks SET is_active = false WHERE document_id = 934701 AND is_active',
 '42501', 'an unscoped service client cannot retire governed chunks');
INSERT INTO public.dms_document_content_chunks(document_id, content_id, chunk_index, chunk_text, chunk_hash, content_hash, char_count, embedding, embedding_status)
VALUES (934701, 934701, 0, 'An inline chunk', repeat('f', 64), repeat('e', 64), 15, :'query_vector'::public.vector, 'complete')
RETURNING id AS legacy_chunk \gset
RESET ROLE;
SELECT set_config('request.jwt.claims', :'actor_claims', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((SELECT count(*) = 1 AND bool_and(chunk_id <> :'legacy_chunk'::bigint)
 FROM public.search_dms_document_chunks_by_embedding(:'query_vector'::public.vector, 50, 0.9, false, 934701)),
 'authorized same-version search prefers the last committed governed index');
SELECT pg_temp.denied('UPDATE public.dms_document_content_chunks SET f07_source_version_id = NULL WHERE document_id = 934701 AND is_active AND f07_source_version_id IS NOT NULL',
 '42501', 'raw edits cannot remove a queued chunk source version');
SELECT pg_temp.denied('UPDATE public.dms_document_content_chunks SET chunk_text = ''Changed'' WHERE document_id = 934701 AND is_active AND f07_source_version_id IS NOT NULL',
 '42501', 'raw edit rights cannot change governed chunk text');
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
UPDATE public.dms_document_versions SET is_current = false WHERE id = 934701;
UPDATE public.dms_document_versions SET is_current = true WHERE id = 934702;
UPDATE public.dms_documents SET current_version_id = 934702 WHERE id = 934701;
SELECT pg_temp.ok((SELECT count(*) = 1 FROM public.dms_document_content_chunks WHERE document_id = 934701 AND is_active AND deleted_at IS NULL AND f07_source_version_id IS NOT NULL),
 'superseded queued chunks are still stored for recovery');
SELECT set_config('request.jwt.claims', :'actor_claims', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((SELECT array_agg(chunk_id) = ARRAY[:'legacy_chunk'::bigint] FROM public.search_dms_document_chunks_by_embedding(:'query_vector'::public.vector, 50, 0.9, false, 934701)),
 'checked search excludes superseded governed chunks and preserves authorized legacy inline results');
RESET ROLE;
ROLLBACK;
