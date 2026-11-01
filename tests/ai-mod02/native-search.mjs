import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const container='agt-ai-mod02-20261030',evidence='CODEX_AUDIT_13_09_2026/IMPLEMENTATION/AI_MOD_02_20261030';
const info=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
if(info.Config.Labels['algt.task']!=='ai-mod02-20261030'||info.HostConfig.NetworkMode!=='none')throw Error('Wrong isolated target');
const database=`ai_mod02_${Date.now()}`;
execFileSync('docker',['exec',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',`CREATE DATABASE ${database}`],{encoding:'utf8'});
const captured=JSON.parse(readFileSync(`${evidence}/REFRESH_PREFLIGHT.json`,'utf8').replace(/^\uFEFF/,'')).rows[0].jsonb_build_object;
const schema=captured.columns;
const tables=['employees','employee_dependents','employee_identity_documents','employee_access_cards','owner_companies','branches','parties','work_sites','dms_documents','dms_document_links','dms_document_content','dms_document_types','dms_metadata_definitions','dms_document_metadata_values'];
const q=name=>'"'+name.replaceAll('"','""')+'"';
let sql=`CREATE EXTENSION IF NOT EXISTS vector; CREATE SCHEMA erp_private; CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT '00000000-0000-0000-0000-000000000101'::uuid$$;
CREATE FUNCTION public.f03_current_session_valid() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT current_setting('test.session',true)='true'$$;
CREATE FUNCTION erp_private.business_principal_is_active() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT public.f03_current_session_valid() AND current_setting('test.active',true)='true'$$;
CREATE FUNCTION public.current_user_has_permission(code text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT coalesce(current_setting('test.global',true)='true',false) AND code=ANY(string_to_array(current_setting('test.permissions',true),','))$$;
CREATE FUNCTION public.current_user_has_permission_any_scope(code text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT code=ANY(string_to_array(current_setting('test.permissions',true),','))$$;
CREATE FUNCTION erp_private.fixture_scope(company_id bigint,branch_id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(nullif(current_setting('test.scopes',true),''),'[]')::jsonb) a WHERE (a->>0)::bigint=company_id AND (a->>1)::bigint=branch_id)$$;
DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;END$$;
GRANT USAGE ON SCHEMA public,erp_private,auth TO authenticated;
`;
for(const table of tables){const fields=schema.filter(c=>c.table===table);if(!fields.length)throw Error(`Missing actual table ${table}`);sql+=`CREATE TABLE public.${q(table)}(${fields.map(c=>q(c.field)+' '+c.type+(c.field==='id'?' PRIMARY KEY':'')).join(',')});\n`;}
sql+=`CREATE FUNCTION public.f03_has_employee_permission(emp_id bigint,permission_code text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.current_user_has_permission_any_scope(permission_code) AND erp_private.business_principal_is_active() AND EXISTS(SELECT 1 FROM public.employees e WHERE e.id=emp_id AND e.deleted_at IS NULL AND erp_private.fixture_scope(e.owner_company_id,e.branch_id))$$;
CREATE FUNCTION erp_private.document_permission(doc_id bigint,permission_code text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.business_principal_is_active() AND public.current_user_has_permission_any_scope(permission_code) AND EXISTS(SELECT 1 FROM public.dms_documents d WHERE d.id=doc_id AND d.deleted_at IS NULL AND erp_private.fixture_scope(d.owning_company_id,d.owning_branch_id) AND (d.confidentiality_level IN ('internal','company') OR public.current_user_has_permission_any_scope('dms.documents.view.'||d.confidentiality_level)))$$;
CREATE FUNCTION public.f03_has_document_permission(document_id bigint,permission_code text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT erp_private.document_permission(document_id,permission_code)$$;
`;
for(const table of tables){sql+=`ALTER TABLE ${q(table)} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${q(table)} FORCE ROW LEVEL SECURITY; GRANT SELECT ON ${q(table)} TO authenticated;`;
const predicate=table==='employees'?`public.f03_has_employee_permission(id,'hr.employees.view')`:table==='employee_dependents'?`public.f03_has_employee_permission(employee_id,'hr.employees.view')`:table==='dms_documents'?`erp_private.document_permission(id,'dms.documents.view')`:['employee_identity_documents','employee_access_cards'].includes(table)?`public.f03_has_employee_permission(employee_id,'hr.compliance.view')`:table==='dms_document_content'?`erp_private.document_permission(document_id,'dms.documents.preview')`:table==='dms_document_links'?`erp_private.document_permission(document_id,'dms.documents.view')`:'erp_private.business_principal_is_active()';
sql+=`CREATE POLICY fixture_scope ON ${q(table)} FOR SELECT TO authenticated USING (${predicate});\n`;}
// Use the actual deployed F03/PERF projection, not the obsolete per-column 20260923 body.
// Owning HR/recruitment helpers are controlled deny-by-default fixtures, not certification of those modules.
sql+=`CREATE FUNCTION public.current_user_profile_id() RETURNS bigint LANGUAGE sql STABLE AS $$SELECT 1::bigint$$;
CREATE FUNCTION public.current_user_is_global_admin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT coalesce(current_setting('test.global',true)='true',false)$$;
CREATE VIEW public.user_roles AS SELECT 1::bigint user_profile_id,1::bigint role_id,(a->>0)::bigint owner_company_id,(a->>1)::bigint branch_id,true is_active FROM jsonb_array_elements(coalesce(nullif(current_setting('test.scopes',true),''),'[]')::jsonb) a;
CREATE VIEW public.roles AS SELECT 1::bigint id,true is_active;
CREATE VIEW public.permissions AS SELECT n::bigint id,code permission_code,true is_active FROM unnest(string_to_array(current_setting('test.permissions',true),',')) WITH ORDINALITY t(code,n);
CREATE VIEW public.role_permissions AS SELECT 1::bigint role_id,id permission_id FROM public.permissions;
CREATE TABLE public.hr_candidate_documents(dms_document_id bigint,candidate_id bigint,deleted_at timestamptz);
CREATE TABLE public.hr_offers(offer_document_id bigint,candidate_id bigint,owner_company_id bigint,branch_id bigint,deleted_at timestamptz);
CREATE TABLE public.hr_onboarding_tasks(dms_document_id bigint,candidate_id bigint,employee_id bigint,deleted_at timestamptz);
CREATE TABLE public.employee_medical_records(dms_document_id bigint,employee_id bigint,deleted_at timestamptz);
CREATE FUNCTION erp_private.read_hr_candidates() RETURNS TABLE(id bigint) LANGUAGE sql STABLE AS $$SELECT NULL::bigint WHERE false$$;
CREATE FUNCTION erp_private.candidate_permission(bigint,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
CREATE FUNCTION erp_private.recruitment_scope(bigint,bigint,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
CREATE FUNCTION erp_private.onboarding_permission(bigint,bigint,text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
CREATE FUNCTION erp_private.permission_in_scope(code text,company_id bigint,branch_id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT public.current_user_has_permission_any_scope(code) AND erp_private.fixture_scope(company_id,branch_id)$$;
CREATE FUNCTION erp_private.employee_permission(employee_id bigint,code text) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT public.f03_has_employee_permission(employee_id,code)$$;
CREATE FUNCTION public.current_user_can_view_employee(employee_id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT public.f03_has_employee_permission(employee_id,'hr.employees.view')$$;
CREATE FUNCTION public.current_user_can_view_employee_medical(employee_id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT public.f03_has_employee_permission(employee_id,'hr.medical.view')$$;
CREATE FUNCTION erp_private.readable_employee_ids() RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT id FROM public.employees WHERE public.f03_has_employee_permission(id,'hr.employees.view')$$;
CREATE FUNCTION erp_private.perf_hr_document_subjects_allowed(document_id bigint) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT NOT EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=$1 AND l.entity_type='employee' AND NOT public.f03_has_employee_permission(l.entity_id,'hr.employees.view'))$$;
`;
for(const name of ['read_documents_filtered_v2','read_documents_filtered','read_documents']){
 const source=captured.functions.find(f=>f.schema==='erp_private'&&f.name===name);
 if(!source?.definition)throw Error('Missing captured projection '+name);
 sql+=source.definition+';\n';
}
sql+=`CREATE FUNCTION public.f03_read_documents() RETURNS SETOF public.dms_documents LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT * FROM erp_private.read_documents()$$; GRANT EXECUTE ON FUNCTION erp_private.read_documents(),erp_private.document_permission(bigint,text),public.f03_read_documents() TO authenticated;
INSERT INTO dms_document_types(id,name_en,type_code) VALUES(1,'Passport Copy','PASSPORT'),(2,'ISO Certificate','ISO');
INSERT INTO employees(id,employee_code,full_name_en,owner_company_id,branch_id) VALUES(1,'SYN-EMP-1','Sameer Fahmi Example',1,11),(2,'SYN-EMP-2','Sameer Fahmi Elsewhere',2,21),(3,'SYN-EMP-3','Sameer Fahmi Sibling',1,12);
INSERT INTO employee_dependents(id,employee_id,dependent_name_en,dms_document_id) VALUES(10,1,'Jaslene Sameer Fahmi',102);
INSERT INTO dms_documents(id,document_no,title,document_type_id,owning_company_id,owning_branch_id,confidentiality_level,content_tsv,is_archived,status,updated_at) VALUES
 (101,'SYN-DMS-101','Passport employee',1,1,11,'company',to_tsvector('simple','passport Sameer Fahmi employee'),false,'active',now()),
 (102,'SYN-DMS-102','Passport dependent',1,1,11,'company',to_tsvector('simple','passport Jaslene Sameer Fahmi'),false,'active',now()),
 (103,'SYN-DMS-103','Passport other company',1,2,21,'company',to_tsvector('simple','passport Sameer Fahmi'),false,'active',now()),
 (104,'SYN-DMS-104','Passport sibling branch',1,1,12,'company',to_tsvector('simple','passport Sameer Fahmi'),false,'active',now()),
 (105,'SYN-DMS-105','ISO 9001 certificate',2,1,11,'company',to_tsvector('simple','ISO 9001 certificate'),false,'active',now()),
 (106,'SYN-DMS-106','ISO 14001 certifications',2,1,11,'company',to_tsvector('simple','ISO 14001 certifications'),false,'active',now()),
 (107,'SYN-DMS-107','Secret medical',1,1,11,'hr',to_tsvector('simple','Secret medical'),false,'active',now());
INSERT INTO dms_document_links(id,document_id,entity_type,entity_id) VALUES(1,101,'employee',1),(2,102,'employee_dependent',10),(3,103,'employee',2),(4,104,'employee',3);
INSERT INTO employee_identity_documents(id,employee_id,dms_document_id) VALUES(1,1,101);
INSERT INTO dms_document_content(id,document_id,content_text) VALUES(1,101,'private extraction zebra');
INSERT INTO dms_metadata_definitions(id,document_type_id,field_code,field_type,is_active,is_searchable,is_filterable) VALUES
 (1,1,'nationality','text',true,true,true),(2,1,'gender','text',true,true,true),(3,1,'date_of_birth','date',true,true,true),(4,1,'held_field','text',true,false,false);
INSERT INTO dms_document_metadata_values(id,document_id,definition_id,value_text,value_date) VALUES
 (1,101,1,'Nigerian',NULL),(2,101,2,'male',NULL),(3,102,1,'Nigerian',NULL),(4,102,2,'female',NULL),(5,101,3,NULL,'1985-08-09'),(6,101,4,'hidden',NULL);
INSERT INTO owner_companies(id,company_code,trade_name,legal_name_en,updated_at) VALUES(1,'SYN-C1','Synthetic One','Synthetic One',now()),(2,'SYN-C2','Synthetic Two','Synthetic Two',now());
INSERT INTO dms_documents(id,document_no,title,document_type_id,owning_company_id,owning_branch_id,confidentiality_level,content_tsv,is_archived,status,updated_at)
 SELECT 1000+n,'SYN-LOAD-'||n,'ISO loadtest certificate '||n,2,1,11,'company',to_tsvector('simple','ISO loadtest certificate '||n),false,'active',now() FROM generate_series(1,1205) n;
CREATE FUNCTION pg_temp.ok(pass boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF pass IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label;END IF;PERFORM set_config('test.assertions',(coalesce(nullif(current_setting('test.assertions',true),''),'0')::int+1)::text,false);END$$;
SELECT set_config('test.assertions','0',false),set_config('test.session','true',false),set_config('test.active','true',false),set_config('test.scopes','[[1,11]]',false),set_config('test.permissions','dms.documents.view,hr.employees.view,hr.compliance.view',false);
`;
const migration='supabase/migrations/20261030143220_ai_mod02_shared_document_search.sql',migrationText=readFileSync(migration,'utf8');sql+=migrationText;
sql+=`SET ROLE authenticated;
SELECT pg_temp.ok((SELECT count(*) FROM ai_mod02_resolve_subject('Sameer Fahmi'))=1,'unique permitted employee, not dependent/company/sibling'),
 pg_temp.ok((SELECT entity_type FROM ai_mod02_resolve_subject('Jaslene'))='employee_dependent','dependent resolves independently'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('',false,'employee',1,ARRAY[1]::bigint[]))=1,'employee passport exact stored membership'),
 pg_temp.ok((SELECT id FROM ai_mod02_search_documents('',false,'employee_dependent',10,ARRAY[1]::bigint[]))=102,'dependent exact membership'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('iso certificates') WHERE id<1000)=2,'certificate plural variants'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('iso 9001 certificates'))=1,'specific ISO standard conjunctive'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('zebra',true))=0,'metadata permission cannot search private content'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('passport'))=2,'company and branch scope exclusion'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('',false,NULL,NULL,ARRAY[2]::bigint[]) WHERE id<1000)=2,'type constraint'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('',false,NULL,NULL,'{}','employee_dependent'))=1,'linked type narrows');
SELECT set_config('test.permissions','dms.documents.view,dms.documents.preview,hr.employees.view,hr.compliance.view',false);
SELECT pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('zebra',true))=1,'authorized extracted-content search'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('zebra',false))=0,'keyword is not implicitly OCR search');
SELECT pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('',false,NULL,NULL,'{}',NULL,NULL,'[{"field_code":"nationality","value":"Nigerian"},{"field_code":"gender","value":"male"}]'))=1,'metadata filters are conjunctive'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('',false,NULL,NULL,'{}',NULL,NULL,'[{"field_code":"nationality","value":"Nigerian"}]'))=2,'multiple definitions/values stay within the actual document'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('',false,NULL,NULL,'{}',NULL,NULL,'[{"field_code":"date_of_birth","value":"--08-09"}]'))=1,'partial date matches month/day'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('',false,NULL,NULL,'{}',NULL,NULL,'[{"field_code":"date_of_birth","value":"--08"}]'))=1,'partial date matches month'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('loadtest certificate'))=1205,'complete set exceeds provider default 1000'),
 pg_temp.ok((SELECT count(*) FROM (SELECT id FROM ai_mod02_search_documents('loadtest certificate') ORDER BY id OFFSET 1000 LIMIT 25) s)=25,'later page is not truncated'),
 pg_temp.ok((SELECT min(id) FROM (SELECT id FROM ai_mod02_search_documents('loadtest certificate') ORDER BY id OFFSET 1000 LIMIT 25) s)=2001,'stable page ordering'),
 pg_temp.ok((SELECT count(*) FROM (SELECT id FROM ai_mod02_search_documents('loadtest certificate') ORDER BY id OFFSET 1200 LIMIT 25) s)=5,'last page exact'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_global('loadtest',ARRAY['dms_document'],'loadtest certificate'))=1205,'global document scope is complete'),
 pg_temp.ok((SELECT count(*) FROM ai_mod02_search_global('Synthetic',ARRAY['organization'],'',NULL,NULL,'{}'))=0,'AI capability never grants master-domain authority');
DO $$BEGIN
 BEGIN PERFORM * FROM ai_mod02_search_documents('',false,NULL,NULL,'{}',NULL,NULL,'[{"field_code":"unknown","value":"anything"}]');RAISE EXCEPTION 'should hold unknown metadata';EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok(true,'unknown metadata held rather than false no-matches');END;
 BEGIN PERFORM * FROM ai_mod02_search_documents('',false,NULL,NULL,'{}',NULL,NULL,'[{"field_code":"held_field","value":"hidden"}]');RAISE EXCEPTION 'should hold unsearchable metadata';EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok(true,'unsearchable metadata held rather than ignored');END;
 BEGIN PERFORM * FROM ai_mod02_search_documents('',false,'invented',1);RAISE EXCEPTION 'should reject invalid subject';EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok(true,'invalid subject rejected');END;
 BEGIN PERFORM * FROM ai_mod02_search_documents('',false,'employee',2);RAISE EXCEPTION 'should deny other company';EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(true,'explicit out-of-scope subject denied');END;
 BEGIN PERFORM * FROM ai_mod02_search_documents('',false,NULL,NULL,'{}',NULL,NULL,'[{"field_code":"x","value":"y","sql":"select *"}]');RAISE EXCEPTION 'should reject metadata injection';EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok(true,'unknown metadata property rejected');END;
 BEGIN PERFORM * FROM ai_mod02_search_documents('',false,NULL,NULL,'{}',NULL,NULL,'[{"field_code":"blood_group","value":"A+"}]');RAISE EXCEPTION 'should deny clinical filter';EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(true,'clinical metadata requires medical authority');END;
END$$;
SELECT set_config('test.scopes','[[1,11],[1,12]]',false);
SELECT pg_temp.ok((SELECT count(*) FROM ai_mod02_resolve_subject('Sameer Fahmi'))=2,'ambiguous permitted prefix retained for caller clarification');
SELECT set_config('test.scopes','[[1,11]]',false);
SELECT set_config('test.active','false',false);
SELECT pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('passport'))=0,'inactive principal yields no documents');
SELECT set_config('test.active','true',false),set_config('test.permissions','',false);
SELECT pg_temp.ok((SELECT count(*) FROM ai_mod02_search_documents('passport'))=0,'permission revocation yields no documents'),pg_temp.ok((SELECT count(*) FROM ai_mod02_resolve_subject('Sameer'))=0,'no HR existence leak');
SELECT set_config('test.session','false',false);
DO $$BEGIN BEGIN PERFORM * FROM ai_mod02_search_documents('passport');RAISE EXCEPTION 'should deny expired session';EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(true,'expired session denied');END;END$$;
RESET ROLE;
`;
sql+=readFileSync('tests/ai-mod02/native-extra.sql','utf8');
sql+=`SELECT jsonb_build_object('result','passed','assertions',current_setting('test.assertions')::int,'baseline','captured current F03/PERF projection and column shapes; owning identity/recruitment helpers are controlled exact-assignment fixtures');`;
writeFileSync(`${evidence}/NATIVE_SEARCH_PACKET.sql`,sql);
try{const output=execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-At'],{input:sql,encoding:'utf8',maxBuffer:4*1024*1024});writeFileSync(`${evidence}/NATIVE_SEARCH.log`,output);const result=JSON.parse(output.trim().split('\n').findLast(line=>line.startsWith('{"result"')));writeFileSync(`${evidence}/NATIVE_SEARCH_RESULT.json`,JSON.stringify({...result,container:info.Id,database,migration,sha256:createHash('sha256').update(migrationText).digest('hex')},null,2)+'\n');console.log(JSON.stringify(result));}
catch(error){writeFileSync(`${evidence}/NATIVE_SEARCH_FAILURE.log`,String(error.stdout??'')+'\n'+String(error.stderr??error));writeFileSync(`${evidence}/NATIVE_SEARCH_RESULT.json`,JSON.stringify({result:'failed',database,migration,sha256:createHash('sha256').update(migrationText).digest('hex')},null,2)+'\n');console.error(String(error.stderr??error).slice(0,1200));process.exitCode=1;}
