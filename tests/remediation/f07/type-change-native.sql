-- Appended to the existing AI-MOD-04 synthetic fixture in a disconnected,
-- schema-only test database. The entire migration, fixture and test roll back.
RESET ROLE;
INSERT INTO public.dms_document_types(id,type_code,name_en,category_id,is_active,requires_expiry_tracking) OVERRIDING SYSTEM VALUE
 VALUES(1010,'SYN_TYPE_CHANGE','SYNTHETIC target type',1001,true,true);
INSERT INTO public.dms_metadata_definitions(id,document_type_id,field_code,field_label_en,field_type,is_active,is_required) OVERRIDING SYSTEM VALUE
 VALUES(1010,1010,'issuing_authority','Issuing Authority','text',true,true);
UPDATE public.dms_documents SET status='active' WHERE id=1001;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SET ROLE authenticated;
SELECT pg_temp.ok(public.f03_current_session_valid(),'current active session');
SELECT set_config('test.review',public.dms_type_change('review','{"documentId":1001,"documentTypeId":1010}')::text,false);
SELECT pg_temp.ok(current_setting('test.review')::jsonb->'definitions'->0->>'field_label_en'='Issuing Authority','new required field readable before type save');
SELECT pg_temp.ok((SELECT document_type_id FROM public.dms_documents WHERE id=1001)=1001,'review does not change saved type');
SELECT set_config('test.input',jsonb_build_object('documentId',1001,'documentTypeId',1010,'snapshot',current_setting('test.review')::jsonb->>'snapshot',
 'requestId','00000000-0000-4000-8000-000000007001','values',jsonb_build_array(jsonb_build_object('definition_id',1010,'value_text','SYNTHETIC issuer')),
 'document',jsonb_build_object('title','SYNTHETIC changed type','description',NULL,'document_type_id',1010,'category_id',1001,'status','active','confidentiality_level','internal','owning_company_id',1001,'owning_branch_id',1001,'party_id',NULL,'issue_date','2026-01-01','expiry_date','2027-12-31'))::text,false);
SELECT pg_temp.error($q$SELECT public.dms_type_change('save',current_setting('test.input')::jsonb||'{"values":[]}'::jsonb)$q$,'22023','missing issuer rejected');
SELECT pg_temp.ok((SELECT document_type_id=1001 AND title='SYNTHETIC accepted title' FROM public.dms_documents WHERE id=1001),'missing metadata rolls back header as well');
SELECT pg_temp.error($q$SELECT public.dms_type_change('save',jsonb_set(current_setting('test.input')::jsonb,'{document,owning_company_id}','1002'))$q$,'22023','type operation cannot transfer ownership');
SELECT pg_temp.error($q$SELECT public.dms_type_change('save',current_setting('test.input')::jsonb||'{"values":[{"definition_id":1001,"value_text":"Wrong type"}]}'::jsonb)$q$,'22023','foreign type field denied');
SELECT pg_temp.error($q$SELECT public.dms_type_change('save',current_setting('test.input')::jsonb||jsonb_build_object('snapshot',repeat('0',64)))$q$,'PT409','stale source rejected');
RESET ROLE;
UPDATE public.dms_metadata_definitions SET help_text_en='SYNTHETIC revised rule' WHERE id=1010;
SET ROLE authenticated;
SELECT pg_temp.error($q$SELECT public.dms_type_change('save',current_setting('test.input')::jsonb)$q$,'PT409','target definition change invalidates review');
SELECT set_config('test.input',jsonb_set(current_setting('test.input')::jsonb,'{snapshot}',public.dms_type_change('review','{"documentId":1001,"documentTypeId":1010}')->'snapshot')::text,false);
SELECT set_config('test.receipt',public.dms_type_change('save',current_setting('test.input')::jsonb)::text,false);
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.ok((SELECT document_type_id=1010 AND title='SYNTHETIC changed type' AND status='active' FROM public.dms_documents WHERE id=1001),'active type/header commit with metadata');
SELECT pg_temp.ok((SELECT value_text FROM public.dms_document_metadata_values WHERE document_id=1001 AND definition_id=1010)='SYNTHETIC issuer','issuer committed');
SELECT pg_temp.ok((SELECT value_text FROM public.dms_document_metadata_values WHERE document_id=1001 AND definition_id=1001)='OLD','original metadata retained');
SELECT pg_temp.ok((SELECT count(*) FROM public.dms_document_files WHERE document_id=1001)=1 AND (SELECT document_no FROM public.dms_documents WHERE id=1001)='SYN-DOC-1001','original file and document number retained');
SELECT pg_temp.ok(public.dms_type_change('save',current_setting('test.input')::jsonb)=current_setting('test.receipt')::jsonb,'lost response replays same receipt');
SELECT pg_temp.error($q$SELECT public.dms_type_change('save',jsonb_set(current_setting('test.input')::jsonb,'{document,title}','"Different"'))$q$,'PT409','request cannot be reused with changed values');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*) FROM erp_private.dms_type_change_receipts)=1,'single retained operation');
UPDATE public.user_roles SET is_active=false WHERE user_profile_id=1001;
SET ROLE authenticated;
SELECT pg_temp.error($q$SELECT public.dms_type_change('save',current_setting('test.input')::jsonb)$q$,'42501','revoked actor cannot retrieve replay');
RESET ROLE;
UPDATE public.user_roles SET is_active=true WHERE user_profile_id=1001;
UPDATE public.dms_documents SET approval_status='pending_approval' WHERE id=1002;
SET ROLE authenticated;
SELECT pg_temp.error($q$SELECT public.dms_type_change('review','{"documentId":1002,"documentTypeId":1010}')$q$,'PT409','pending approval stays locked');
RESET ROLE;
SET session_replication_role=replica;
INSERT INTO auth.users(id,email) VALUES('00000000-0000-4000-8000-000000001004','type-change-4@example.invalid');
INSERT INTO auth.sessions(id,user_id,created_at,updated_at) VALUES('00000000-0000-4000-8000-000000002004','00000000-0000-4000-8000-000000001004',now(),now());
INSERT INTO public.user_profiles(id,auth_user_id,user_code,full_name,status,must_change_password) OVERRIDING SYSTEM VALUE VALUES(1004,'00000000-0000-4000-8000-000000001004','SYN-TYPE-4','SYNTHETIC branch reviewer','active',false);
INSERT INTO public.roles(id,role_code,role_name,is_active) OVERRIDING SYSTEM VALUE VALUES(1004,'syn_type_scoped','SYNTHETIC ordinary scope',true);
INSERT INTO public.user_roles(id,user_profile_id,role_id,owner_company_id,branch_id,is_active) OVERRIDING SYSTEM VALUE VALUES(1004,1004,1004,1001,1001,true);
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,is_active,administrator_scope)
 SELECT code,'SYNTHETIC '||code,'DMS','view',true,'branch' FROM unnest(ARRAY['dms.documents.view','dms.documents.edit'])code ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id) SELECT 1004,id FROM public.permissions WHERE permission_code IN('dms.documents.view','dms.documents.edit');
INSERT INTO public.branches(id,owner_company_id,branch_code,branch_name_en,status) OVERRIDING SYSTEM VALUE VALUES(1003,1001,'SYN_TYPE_SIBLING','SYNTHETIC sibling branch','active');
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status,created_by,updated_by) OVERRIDING SYSTEM VALUE
 VALUES(1004,'SYN-DOC-1004','SYNTHETIC sibling source',1001,1001,1001,1003,'internal','draft',1001,1001),
 (1005,'SYN-DOC-1005','SYNTHETIC confidential source',1001,1001,1001,1001,'hr','draft',1001,1001);
SET session_replication_role=origin;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001004","role":"authenticated","session_id":"00000000-0000-4000-8000-000000002004"}',false);
SET ROLE authenticated;
SELECT pg_temp.ok(public.dms_type_change('review','{"documentId":1003,"documentTypeId":1010}')->>'documentId'='1003','ordinary explicit branch editor allowed');
SELECT pg_temp.error($q$SELECT public.dms_type_change('review','{"documentId":1002,"documentTypeId":1010}')$q$,'42501','other company denied');
SELECT pg_temp.error($q$SELECT public.dms_type_change('review','{"documentId":1004,"documentTypeId":1010}')$q$,'42501','sibling branch denied');
SELECT pg_temp.error($q$SELECT public.dms_type_change('review','{"documentId":1005,"documentTypeId":1010}')$q$,'42501','sensitive source denied');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',false);
SET ROLE anon;
SELECT pg_temp.error($q$SELECT public.dms_type_change('review','{"documentId":1001,"documentTypeId":1010}')$q$,'42501','anonymous denied');
RESET ROLE;
SELECT 'TYPE_CHANGE_PASS:'||current_setting('test.assertions');
ROLLBACK;
