-- Appended to the isolated AI04 fixture after candidate publication, never hosted.
SELECT set_config('test.open',public.dms_saved_document_review('open','{"documentId":1001}')::text,false);
SELECT pg_temp.ok(current_setting('test.open')::jsonb->'source'->>'documentNo'='SYN-DOC-1001','open uses the stored document number');
SELECT pg_temp.ok(current_setting('test.open')::jsonb->'draft'='null'::jsonb,'no review draft is invented');
SELECT pg_temp.ok(current_setting('test.open')::jsonb->'source'->'files'->0->'path'='null'::jsonb,'private storage paths remain redacted');
SELECT set_config('test.draft',jsonb_build_object('documentId',1001,'jobId',current_setting('test.job')::bigint,'requestId','00000000-0000-4000-8000-000000006001','snapshot',current_setting('test.snapshot'),'expectedRevision',0,'values',jsonb_build_object('selections',jsonb_build_array('title'),'edits',jsonb_build_object('title','SYNTHETIC saved draft'),'refreshDerived',false))::text,false);
SELECT set_config('test.draft.receipt',public.dms_saved_document_review('save_draft',current_setting('test.draft')::jsonb)::text,false);
SELECT pg_temp.ok(public.dms_saved_document_review('save_draft',current_setting('test.draft')::jsonb)=current_setting('test.draft.receipt')::jsonb,'lost draft save retries the original receipt');
SELECT pg_temp.ok(public.dms_saved_document_review('open','{"documentId":1001}')->'draft'->'values'->'edits'->>'title'='SYNTHETIC saved draft','reopen restores the saved working copy');
SELECT pg_temp.ok((SELECT title FROM public.dms_documents WHERE id=1001)='SYNTHETIC accepted title','saving a review draft does not change the document');
SELECT pg_temp.error($q$SELECT public.dms_saved_document_review('save_draft',current_setting('test.draft')::jsonb||'{"values":{"selections":["title"],"edits":{"title":"different"},"refreshDerived":false}}'::jsonb)$q$,'PT409','same draft request cannot change payload');
SELECT pg_temp.error($q$SELECT public.dms_saved_document_review('save_draft',current_setting('test.draft')::jsonb||'{"requestId":"00000000-0000-4000-8000-000000006002"}'::jsonb)$q$,'PT409','stale tab cannot overwrite saved draft');
SELECT pg_temp.error($q$SELECT public.dms_saved_document_review('save_draft',current_setting('test.draft')::jsonb||'{"values":{"selections":["metadata:9999"],"edits":{},"refreshDerived":false}}'::jsonb)$q$,'22023','unknown candidate key rejected');
SELECT pg_temp.error($q$SELECT public.dms_saved_document_review('save_draft',current_setting('test.draft')::jsonb||'{"values":{"selections":["title"],"edits":{"title":"x"},"refreshDerived":false,"approved":true}}'::jsonb)$q$,'22023','draft cannot carry approval fields');
SELECT pg_temp.error($q$SELECT * FROM erp_private.dms_preparation_review_drafts$q$,'42501','private drafts are not directly accessible');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001002","role":"authenticated","session_id":"00000000-0000-4000-8000-000000002002"}',false);
SELECT pg_temp.ok(public.dms_saved_document_review('open','{"documentId":1001}')->'draft'='null'::jsonb,'another administrator cannot read an actor draft');
SELECT pg_temp.error($q$SELECT public.dms_saved_document_review('save_draft',current_setting('test.draft')::jsonb)$q$,'42501','another actor cannot save someone elses review');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001001","role":"authenticated","session_id":"00000000-0000-4000-8000-000000002001"}',false);
RESET ROLE;
UPDATE public.dms_documents SET description='SYNTHETIC concurrent edit' WHERE id=1001;
SET ROLE authenticated;
SELECT pg_temp.ok(public.dms_saved_document_review('open','{"documentId":1001}')->'draft'->'current'='false'::jsonb,'changed source marks saved draft stale');
SELECT pg_temp.error($q$SELECT public.dms_saved_document_review('save_draft',current_setting('test.draft')::jsonb||'{"expectedRevision":1,"requestId":"00000000-0000-4000-8000-000000006002"}'::jsonb)$q$,'PT409','stale source blocks further draft save');
RESET ROLE;
UPDATE public.dms_documents SET description=NULL WHERE id=1001;
-- Status/updated_at participate in the source fingerprint. Create the apply test
-- on a fresh fixture transaction in the existing regression suite.
SET ROLE anon;
SELECT pg_temp.error($q$SELECT public.dms_saved_document_review('open','{"documentId":1001}')$q$,'42501','anonymous review access denied');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*) FROM public.dms_document_files WHERE document_id=1001)=1,'draft operations preserve one original file');
SELECT 'SAVED_REVIEW_PASS assertions='||current_setting('test.assertions');
ROLLBACK;
