'use strict';
// Fixed SQL builders only. Importing this module never connects or executes SQL.
const assert=require('node:assert/strict');
const {sha256}=require('./migration-manifest.cjs');
const exact='Branding ACL requires exact historical MAINTAIN-only browser grants';
const boundary='Branding ACL raw relation boundary changed';
const witnesses=Object.freeze([
 {id:'replay',replay:true,mutation:'',expected:exact},
 {id:'wrong-owner',mutation:'SET LOCAL ROLE supabase_admin;',expected:'Branding ACL requires reviewed postgres owner'},
 {id:'missing-maintain',mutation:'REVOKE MAINTAIN ON public.erp_report_branding_profiles FROM anon;',expected:exact},
 {id:'restore-artifact-dxt',mutation:'GRANT TRUNCATE,REFERENCES,TRIGGER ON public.erp_report_branding_profiles TO anon;',expected:exact},
 {id:'unexpected-select',mutation:'GRANT SELECT ON public.erp_report_branding_profiles TO authenticated;',expected:exact},
 {id:'public-maintain',mutation:'GRANT MAINTAIN ON public.erp_report_branding_profiles TO PUBLIC;',expected:exact},
 {id:'column-select',mutation:'GRANT SELECT(signature_url) ON public.erp_report_branding_profiles TO authenticated;',expected:'Branding ACL unexpected column grant'},
 {id:'column-update',mutation:'GRANT UPDATE(signature_url) ON public.erp_report_branding_profiles TO anon;',expected:'Branding ACL unexpected column grant'},
 {id:'service-drift',mutation:'REVOKE UPDATE ON public.erp_report_branding_profiles FROM service_role;',expected:exact},
 {id:'disabled-rls',mutation:'ALTER TABLE public.erp_report_branding_profiles DISABLE ROW LEVEL SECURITY;',expected:boundary},
 {id:'disabled-force-rls',mutation:'ALTER TABLE public.erp_report_branding_profiles NO FORCE ROW LEVEL SECURITY;',expected:boundary},
 {id:'selection-already-present',mutation:'CREATE VIEW public.perf_report_template_selection AS SELECT 1 AS integration_witness;',expected:'Branding ACL must precede template selection'},
 {id:'template-maintain',mutation:'GRANT MAINTAIN ON public.erp_report_templates TO authenticated;',expected:'Branding ACL browser privilege remains'},
 {id:'safe-view-maintain',mutation:'GRANT MAINTAIN ON public.erp_report_branding_profiles_safe TO anon;',expected:'Branding ACL browser privilege remains'},
 // The predefined role has implicit MAINTAIN rights, absent from table ACLs.
 {id:'implicit-pg-maintain',mutation:`DO $role_witness$ BEGIN
 IF session_user<>'supabase_admin' OR current_user<>'postgres' THEN
  RAISE EXCEPTION 'Maintenance witness requires supabase_admin session and postgres role';
 END IF; END $role_witness$;
 RESET ROLE;
 GRANT pg_maintain TO authenticated;
 SET LOCAL ROLE postgres;`,expected:'Branding ACL effective maintenance authority remains'},
].map(Object.freeze));
function migrationBody(source,expectedSha){
 const sql=source.replace(/\r\n/g,'\n');assert.equal(sha256(sql),expectedSha,'Branding source hash mismatch');
 assert.match(sql,/^-- Historical PG17 baseline/);
 const start=sql.indexOf('\nBEGIN;\n');assert.ok(start>=0&&sql.endsWith('COMMIT;\n'));
 const body=sql.slice(0,start+1)+sql.slice(start+'\nBEGIN;\n'.length,-'COMMIT;\n'.length);
 assert.doesNotMatch(body,/^\s*(?:COMMIT|BEGIN|END\s+TRANSACTION)\s*;/im);return body;
}
function positiveSql(source,expectedSha){return `BEGIN;\n${migrationBody(source,expectedSha)}\nROLLBACK;`;}
function witnessSql(witness,source,expectedSha){
 assert.ok(witnesses.includes(witness),'Only fixed reviewed branding witnesses are allowed');
 const body=migrationBody(source,expectedSha);
 return `BEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='30s';\n${witness.replay?body:''}\n${witness.mutation}\n${body}\nROLLBACK;`;
}
// Check independently before/after each transaction, including failures during
// mutation setup. Output hashes only for rows; no signatures or branding data.
const snapshotSql=`BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
SELECT jsonb_build_object(
 'schemas',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.oid) FROM pg_namespace n WHERE n.nspname IN('public','erp_private')),
 'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','erp_private')),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p),
 'relations',(SELECT jsonb_agg(to_jsonb(c)-'relpages'-'reltuples'-'relallvisible'-'relallfrozen' ORDER BY c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','erp_private')),
 'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','erp_private')),
 'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_default_acl d),
 'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r),
 'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member) FROM pg_auth_members m),
 'branding',(SELECT md5(coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.id)::text,'[]')) FROM public.erp_report_branding_profiles b),
 'templates',(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text,'[]')) FROM public.erp_report_templates t));
ROLLBACK;`;
module.exports={witnesses,migrationBody,positiveSql,witnessSql,snapshotSql};
