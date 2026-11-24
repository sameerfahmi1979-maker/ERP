\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='30s';
DO $$
BEGIN
 IF current_database() !~ '^dms_phase_content_proof(_[a-z]+)?$'
  OR inet_server_addr() IS NOT NULL
  OR current_setting('cron.launch_active_jobs') IS DISTINCT FROM 'off' THEN
  RAISE EXCEPTION 'Isolated content proof fixture required';
 END IF;
 IF to_regprocedure('erp_private.f07_semantic_refresh_content_proof(bigint,bigint,bigint,text)') IS NULL THEN
  RAISE EXCEPTION 'Exact content proof is unavailable';
 END IF;
END $$;

CREATE FUNCTION pg_temp.ok(answer boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF answer IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
 RAISE NOTICE 'PASS: %', label;
END $$;

SELECT pg_temp.ok(NOT has_function_privilege('authenticated',
 'erp_private.f07_semantic_refresh_content_proof(bigint,bigint,bigint,text)','execute')
 AND NOT has_function_privilege('service_role',
 'erp_private.f07_semantic_refresh_content_proof(bigint,bigint,bigint,text)','execute'),
 'content proof helper is owner-only');

SET LOCAL session_replication_role=replica;
INSERT INTO public.owner_companies(id,company_code,legal_name_en)
 VALUES (934801,'QA_SEM_CONTENT','Synthetic semantic originals');
INSERT INTO public.dms_document_categories(id,category_code,name_en) OVERRIDING SYSTEM VALUE
 VALUES (934801,'QA_SEM_CONTENT','Synthetic semantic originals');
INSERT INTO public.dms_document_types(id,type_code,name_en,category_id) OVERRIDING SYSTEM VALUE
 VALUES (934801,'QA_SEM_CONTENT','Synthetic semantic originals',934801);
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,status,approval_status)
 OVERRIDING SYSTEM VALUE VALUES (934801,'QA-SEM-CONTENT','Synthetic semantic originals',934801,934801,934801,'active','approved');
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE
 VALUES (934801,934801,1,true);
UPDATE public.dms_documents SET current_version_id=934801 WHERE id=934801;
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,
 file_name,mime_type,file_size_bytes,sha256_hash,ocr_status,ocr_text) OVERRIDING SYSTEM VALUE VALUES
 (934801,934801,934801,'original','dms-documents','fixture/934801/a.pdf','a.pdf','application/pdf',100,repeat('a',64),
  'complete',E'First verified original 🧪\nText.'),
 (934802,934801,934801,'original','dms-documents','fixture/934801/b.pdf','b.pdf','application/pdf',100,repeat('b',64),
  'complete','Second verified original.');
INSERT INTO public.dms_document_content(id,document_id,content_text,content_text_source,is_truncated) OVERRIDING SYSTEM VALUE
 VALUES (934801,934801,E'First verified original 🧪\nText.','ocr',false);
SET LOCAL session_replication_role=origin;

SELECT pg_temp.ok(NOT erp_private.f07_semantic_refresh_content_proof(934801,934801,934801,
 erp_private.dms_question_text_hash(E'First verified original 🧪\nText.')),
 'text equality without a verified original does not confer a proof');

SELECT pg_temp.ok(erp_private.dms_question_record('file_ocr','934801',934801,934801,
 erp_private.dms_question_text_hash(E'First verified original 🧪\nText.'),
 jsonb_build_array(jsonb_build_object('fileId',934801,'versionId',934801,'sha256',repeat('a',64))), '[]'),
 'first exact OCR attested');
SELECT pg_temp.ok(erp_private.f07_semantic_refresh_content_proof(934801,934801,934801,
 erp_private.dms_question_text_hash(E'First verified original 🧪\nText.')),
 'exact single-file content proof recovered');
SELECT pg_temp.ok((SELECT count(*)=1 AND bool_and(erp_private.dms_question_current(a))
 FROM erp_private.dms_question_artifacts a WHERE a.document_id=934801 AND a.kind='content_text' AND a.is_latest),
 'native search proof can read the current chain');

UPDATE public.dms_document_content SET content_text='Unrelated text with a genuine current file',
 content_text_source='ocr' WHERE id=934801;
SELECT pg_temp.ok(NOT erp_private.f07_semantic_refresh_content_proof(934801,934801,934801,
 erp_private.dms_question_text_hash('Unrelated text with a genuine current file')),
 'file proof cannot attest unrelated content');

UPDATE public.dms_document_content SET content_text=E'First verified original 🧪\nText.\n\nSecond verified original.',
 content_text_source='system_resync' WHERE id=934801;
SELECT pg_temp.ok(NOT erp_private.f07_semantic_refresh_content_proof(934801,934801,934801,
 erp_private.dms_question_text_hash(E'First verified original 🧪\nText.\n\nSecond verified original.')),
 'reviewed aggregate cannot borrow a proof for its unverified second file');
SELECT pg_temp.ok(erp_private.dms_question_record('file_ocr','934802',934801,934801,
 erp_private.dms_question_text_hash('Second verified original.'),
 jsonb_build_array(jsonb_build_object('fileId',934802,'versionId',934801,'sha256',repeat('b',64))), '[]'),
 'second exact OCR attested');
SELECT pg_temp.ok(erp_private.f07_semantic_refresh_content_proof(934801,934801,934801,
 erp_private.dms_question_text_hash(E'First verified original 🧪\nText.\n\nSecond verified original.')),
 'exact reviewed aggregate obtains two verified parents');
SELECT pg_temp.ok((SELECT count(*)=1 AND bool_and(jsonb_array_length(a.parents)=2 AND erp_private.dms_question_current(a))
 FROM erp_private.dms_question_artifacts a WHERE a.document_id=934801 AND a.kind='content_text' AND a.is_latest),
 'aggregate proof binds both current originals');
UPDATE public.dms_document_files SET sha256_hash=repeat('c',64) WHERE id=934802;
SELECT pg_temp.ok(NOT erp_private.f07_semantic_refresh_content_proof(934801,934801,934801,
 erp_private.dms_question_text_hash(E'First verified original 🧪\nText.\n\nSecond verified original.')),
 'rebound original invalidates its prior proof');
ROLLBACK;
