-- Synthetic only: executed after the baseline fixture, never sent to ERP.
SELECT set_config('test.session','true',false),set_config('test.active','true',false),set_config('test.scopes','[[1,11]]',false),set_config('test.permissions','dms.documents.view,dms.documents.preview,hr.employees.view,hr.compliance.view',false);
UPDATE dms_document_content SET content_text_updated_at=now();
UPDATE employees SET full_name_ar='سَامِر فَهْمي' WHERE id=1;
UPDATE employee_dependents SET dependent_name_ar='جاسلين سامر فهمي' WHERE id=10;
INSERT INTO dms_documents(id,document_no,title,document_type_id,owning_company_id,owning_branch_id,confidentiality_level,content_tsv,is_archived,status,updated_at,expiry_date) VALUES
 (108,'SYN-DMS-108','Passport mixed tuple',1,2,11,'company',to_tsvector('simple','passport mixed'),false,'active',now(),NULL),
 (109,'SYN-DMS-109','Passport today',1,1,11,'company',to_tsvector('simple','passport today'),false,'active',now(),(now() AT TIME ZONE 'Asia/Dubai')::date),
 (110,'SYN-DMS-110','Passport overdue',1,1,11,'company',to_tsvector('simple','passport overdue'),false,'active',now(),(now() AT TIME ZONE 'Asia/Dubai')::date-1),
 (111,'SYN-DMS-111','Passport thirty days',1,1,11,'company',to_tsvector('simple','passport thirty'),false,'active',now(),(now() AT TIME ZONE 'Asia/Dubai')::date+30),
 (112,'SYN-DMS-112','Passport thirty-one days',1,1,11,'company',to_tsvector('simple','passport thirtyone'),false,'active',now(),(now() AT TIME ZONE 'Asia/Dubai')::date+31),
 (113,'SYN-DMS-113','Historical record',1,1,11,'company',to_tsvector('simple','historical record'),true,'archived',now(),NULL),
 (114,'SYN-DMS-114','Deleted record',1,1,11,'company',to_tsvector('simple','deleted record'),false,'active',now(),NULL),
 (115,'SYN-DMS-115','Reference mentioned in unrelated text',1,1,11,'company',to_tsvector('simple','SYN-DMS-101'),false,'active',now(),NULL);
UPDATE dms_documents SET deleted_at=now() WHERE id=114;
INSERT INTO dms_document_links(id,document_id,entity_type,entity_id) VALUES(5,107,'employee',1);
INSERT INTO dms_document_links(id,document_id,entity_type,entity_id) VALUES(6,101,'employee',1);
UPDATE dms_documents SET created_at=CASE id WHEN 105 THEN '2026-10-30T00:00:00.000001Z'::timestamptz WHEN 106 THEN '2026-10-30T00:00:00.000002Z'::timestamptz ELSE NULL END WHERE id IN(101,105,106);
INSERT INTO dms_metadata_definitions(id,document_type_id,field_code,field_type,is_active,is_searchable,is_filterable) VALUES(5,1,'blood_group','text',true,true,true);
INSERT INTO dms_document_metadata_values(id,document_id,definition_id,value_text) VALUES(7,107,5,'A+');
INSERT INTO parties(id,party_code,display_name,is_active,updated_at) VALUES(20,'SYN-P20','Synthetic party',true,now());
INSERT INTO work_sites(id,site_code,site_name,owner_company_id,branch_id,updated_at) VALUES(30,'SYN-S30','Synthetic site',1,11,now());
SET ROLE authenticated;
SELECT pg_temp.ok(NOT current_user_has_permission('dms.documents.view') AND current_user_has_permission_any_scope('dms.documents.view'),'scoped capability is distinct from global permission'),
 pg_temp.ok(ai_mod02_identity_text('أحمَد   علي')='احمد علي' AND ai_mod02_identity_text('Sameer, Fahmi')='sameer fahmi','native normalization agrees with shared Arabic and punctuation rules'),
 pg_temp.ok((SELECT entity_id FROM ai_mod02_resolve_subject('سامر فهمي') WHERE entity_type='employee')=1,'authorized Arabic employee alias resolves exact record'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_resolve_subject('سامر فهمي') WHERE entity_type='employee_dependent')=0,'Arabic dependent suffix never substitutes for employee'),
 pg_temp.ok((SELECT entity_id FROM ai_mod02_resolve_subject('جاسلين سامر فهمي') WHERE entity_type='employee_dependent')=10,'dependent Arabic identity resolves independently'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('%'))=0,'punctuation-only input cannot silently become an unfiltered search'),
 pg_temp.ok((SELECT array_agg(id) FROM(SELECT id FROM ai_mod02_search_documents('') WHERE id IN(101,105,106) ORDER BY created_at DESC NULLS FIRST,id DESC)s)=ARRAY[101,106,105]::bigint[],'browser preserves NULLS FIRST and microsecond ordering'),
 pg_temp.ok((SELECT array_agg(id) FROM(SELECT id FROM ai_mod02_search_documents('') WHERE id IN(101,105,106) ORDER BY created_at DESC NULLS LAST,id DESC)s)=ARRAY[106,105,101]::bigint[],'main list preserves NULLS LAST and microsecond ordering'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('',false,'employee',1,ARRAY[1]::bigint[]) WHERE id=101)=1,'duplicate subject links do not duplicate a document'),
 pg_temp.ok((SELECT id FROM ai_mod02_search_documents('SYN-DMS-101'))=101,'exact reference takes precedence over another document mentioning it'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('deleted record'))=0,'soft-deleted source excluded'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_global('historical',ARRAY['dms_document'],'historical'))=0,'global excludes archived sources'),
 pg_temp.ok((SELECT array_agg(id ORDER BY id) FROM ai_mod02_search_documents('',false,NULL,NULL,'{}',NULL,'expired'))=ARRAY[110]::bigint[],'Dubai expiry excludes today from overdue'),
 pg_temp.ok((SELECT array_agg(id ORDER BY id) FROM ai_mod02_search_documents('',false,NULL,NULL,'{}',NULL,'expiring_soon'))=ARRAY[109,111]::bigint[],'Dubai expiry includes today and thirty-day boundary'),
 pg_temp.ok((SELECT array_agg(id ORDER BY id) FROM ai_mod02_search_documents('',false,NULL,NULL,'{}',NULL,'valid'))=ARRAY[109,111,112]::bigint[],'unknown expiry is not valid'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_excerpts(ARRAY[101]::bigint[],'zebra'))=1,'excerpts require current permitted content'),
 pg_temp.ok((SELECT bool_and(length(excerpt)<=120 AND document_version IS NOT NULL AND content_version IS NOT NULL) FROM ai_mod02_search_excerpts(ARRAY[101]::bigint[],'zebra')),'excerpts are bounded and source-version bound'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_excerpts(ARRAY[103]::bigint[],'zebra'))=0,'no cross-company excerpt'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_excerpts(ARRAY(SELECT generate_series(1,101)::bigint),'zebra'))=0,'oversized excerpt request yields no content');
SELECT set_config('test.permissions','dms.documents.view,hr.employees.view,hr.compliance.view',false);
SELECT pg_temp.ok((SELECT count(*) FROM ai_mod02_search_excerpts(ARRAY[101]::bigint[],'zebra'))=0,'revoked preview permission retires snippets');
DO $$BEGIN
 BEGIN PERFORM * FROM ai_mod02_search_documents('',false,'party',20);RAISE EXCEPTION 'party should deny';EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(true,'explicit party context needs domain capability');END;
 BEGIN PERFORM * FROM ai_mod02_search_documents('',false,'site',30);RAISE EXCEPTION 'site should deny';EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(true,'explicit site context needs domain capability');END;
END$$;
SELECT set_config('test.permissions','dms.documents.view,dms.documents.preview,hr.employees.view,hr.compliance.view,hr.medical.view',false);
SELECT pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('',false,NULL,NULL,'{}',NULL,NULL,'[{"field_code":"blood_group","value":"A+"}]'))=0,'medical capability alone does not reveal an otherwise hidden HR document');
SELECT set_config('test.permissions','dms.documents.view,dms.documents.preview,dms.documents.view.hr,hr.employees.view,hr.compliance.view,hr.medical.view',false);
SELECT pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('',false,NULL,NULL,'{}',NULL,NULL,'[{"field_code":"blood_group","value":"A+"}]'))=1,'clinical metadata requires document and exact employee medical authority');
SELECT set_config('test.scopes','[[2,21]]',false);
SELECT pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('',false,NULL,NULL,'{}',NULL,NULL,'[{"field_code":"blood_group","value":"A+"}]'))=0,'medical capability never overrides another company');
SELECT set_config('test.scopes','[[1,11],[2,21]]',false),set_config('test.permissions','dms.documents.view,hr.employees.view,hr.compliance.view',false);
SELECT pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('passport') WHERE id=103)=1,'union retains independently assigned company/branch'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('passport') WHERE id IN(104,108))=0,'multiple assignments never form a Cartesian product'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_resolve_subject('Sameer Fahmi'))=2,'multiple permitted subjects remain ambiguous');
SELECT set_config('test.scopes','[[1,11]]',false);
SELECT pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('passport') WHERE id=103)=0,'revoking one assignment preserves only the other tuple'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('passport') WHERE id=101)=1,'remaining assignment continues to work');
SELECT pg_temp.ok((SELECT bool_and(NOT p.prosecdef AND p.proconfig @> ARRAY['search_path=""']) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'ai_mod02_%'),'all six new functions are invoker-only with fixed search path'),
 pg_temp.ok((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'ai_mod02_%')=6,'six additive functions only'),
 pg_temp.ok((SELECT bool_and(NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE') AND has_function_privilege('authenticated',p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'ai_mod02_%'),'function execution is not public/anonymous/service-role');
RESET ROLE;
-- Read-only laboratory timings, not a production-volume or browser guarantee.
SET ROLE authenticated;
EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM ai_mod02_search_documents('loadtest certificate') ORDER BY id OFFSET 1000 LIMIT 25;
RESET ROLE;
