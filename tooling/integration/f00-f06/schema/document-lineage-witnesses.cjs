'use strict';
// SQL builders only: no connection, fixture writes or database execution on import.
const assert=require('node:assert/strict');
const {sha256}=require('./migration-manifest.cjs');
const witnesses=Object.freeze([
 {id:'replay',replay:true,mutation:'',expected:'Document lineage already present or partial; reconcile history'},
 {id:'wrong-owner',mutation:'SET LOCAL ROLE supabase_admin;',expected:'Document lineage requires reviewed postgres owner'},
 {id:'private-schema-create',mutation:'GRANT CREATE ON SCHEMA erp_private TO authenticated;',expected:'Document lineage private schema authority drift'},
 {id:'partial-helper',mutation:"CREATE FUNCTION erp_private.perf_hr_document_subjects_allowed(bigint) RETURNS boolean LANGUAGE sql AS 'SELECT true';",expected:'Document lineage already present or partial; reconcile history'},
 {id:'changed-body',mutation:`DO $w$ DECLARE original text; definition text; BEGIN
 SELECT prosrc INTO STRICT original FROM pg_proc WHERE oid='erp_private.document_permission(bigint,text)'::regprocedure;
 definition:=pg_get_functiondef('erp_private.document_permission(bigint,text)'::regprocedure);
 EXECUTE replace(definition,original,original||E'\\n-- changed witness'); END $w$;`,expected:'Document lineage prerequisite drift: erp_private.document_permission(bigint,text)'},
 {id:'changed-helper-owner',mutation:'ALTER FUNCTION erp_private.employee_permission(bigint,text) OWNER TO supabase_admin;',expected:'Document lineage prerequisite drift: erp_private.employee_permission(bigint,text)'},
 {id:'function-grant',mutation:'GRANT EXECUTE ON FUNCTION erp_private.document_permission(bigint,text) TO anon;',expected:'Document lineage prerequisite drift: erp_private.document_permission(bigint,text)'},
 {id:'function-grant-option',mutation:'GRANT EXECUTE ON FUNCTION erp_private.document_permission(bigint,text) TO authenticated WITH GRANT OPTION;',expected:'Document lineage prerequisite drift: erp_private.document_permission(bigint,text)'},
 {id:'changed-search-path',mutation:"ALTER FUNCTION erp_private.document_permission(bigint,text) SET search_path='public';",expected:'Document lineage prerequisite drift: erp_private.document_permission(bigint,text)'},
 {id:'changed-security-mode',mutation:'ALTER FUNCTION erp_private.document_permission(bigint,text) SECURITY INVOKER;',expected:'Document lineage prerequisite drift: erp_private.document_permission(bigint,text)'},
 {id:'nullable-subject',mutation:'ALTER TABLE public.dms_document_links ALTER COLUMN entity_id DROP NOT NULL;',expected:'Document lineage required non-null subject changed: dms_document_links.entity_id'},
 {id:'disabled-rls',mutation:'ALTER TABLE public.dms_documents DISABLE ROW LEVEL SECURITY;',expected:'Document lineage policy/RLS prerequisite drift: public.dms_documents'},
 {id:'extra-permissive-policy',mutation:'CREATE POLICY integration_lineage_extra ON public.dms_documents FOR SELECT TO authenticated USING(true);',expected:'Document lineage policy/RLS prerequisite drift: public.dms_documents'},
].map(Object.freeze));
function migrationBody(source,expectedSha){
 const sql=source.replace(/\r\n/g,'\n');assert.equal(sha256(sql),expectedSha,'Bridge source hash mismatch');
 assert.match(sql,/^-- Explicit dependency composition/);
 const start=sql.indexOf('\nBEGIN;\n');assert.ok(start>=0 && sql.endsWith('COMMIT;\n'));
 const body=sql.slice(0,start+1)+sql.slice(start+'\nBEGIN;\n'.length,-'COMMIT;\n'.length);
 assert.doesNotMatch(body,/^\s*(?:COMMIT|BEGIN|END\s+TRANSACTION)\s*;/im);
 return body;
}
function witnessSql(witness,source,expectedSha){
 assert.ok(witnesses.includes(witness),'Only fixed reviewed witnesses are allowed');
 const body=migrationBody(source,expectedSha);
 return `BEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='30s';\n${witness.replay?body:''}\n${witness.mutation}\n${body}\nROLLBACK;`;
}
// Compare before and after every rejected transaction; no row contents emitted.
const snapshotSql=`BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SELECT jsonb_build_object(
 'schemas',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.oid) FROM pg_namespace n WHERE n.nspname IN('public','erp_private')),
 'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','erp_private')),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p),
 'relations',(SELECT jsonb_agg(to_jsonb(c)-'relpages'-'reltuples'-'relallvisible'-'relallfrozen' ORDER BY c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','erp_private')),
 'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','erp_private')),
 'documents',(SELECT md5(coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id)::text,'[]')) FROM public.dms_documents d),
 'links',(SELECT md5(coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id)::text,'[]')) FROM public.dms_document_links d),
 'candidates',(SELECT md5(coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id)::text,'[]')) FROM public.hr_candidate_documents d));
ROLLBACK;`;
module.exports={witnesses,migrationBody,witnessSql,snapshotSql};
