'use strict';
// Adversarial DDL ONLY in the coordinator's newly reserved isolated lab.
// Every witness, including an unexpectedly successful application, ROLLS BACK.
const {test,before} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {guardedLab,guardFailureMessage} = require('../../../../tooling/integration/f00-f06/schema/guarded-lab.cjs');
const {NEW_MIGRATION,sha256} = require('../../../../tooling/integration/f00-f06/schema/migration-manifest.cjs');
const root = path.resolve(__dirname,'../../../..');
const sql = fs.readFileSync(path.join(root,'supabase/migrations',NEW_MIGRATION),'utf8').replace(/\r\n/g,'\n');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'docs/integration/f00-f06/schema/MIGRATION_MANIFEST_20261016.json'),'utf8'));
assert.equal(sha256(sql),manifest.migrations.find(row => row.name === NEW_MIGRATION).sha256);
assert.ok(sql.startsWith('BEGIN;\n') && sql.endsWith('COMMIT;\n'));
// Remove transaction wrappers ONLY; the reviewed preconditions/body are exact.
const body = sql.slice('BEGIN;\n'.length,-'COMMIT;\n'.length);
const snapshotSql = `BEGIN READ ONLY; SELECT jsonb_build_object(
'relations',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'name',c.relname,'owner',c.relowner,'acl',c.relacl,'options',c.reloptions,'rls',c.relrowsecurity,
'columns',(SELECT jsonb_agg(jsonb_build_array(a.attnum,a.attname,a.atttypid,a.attacl) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0),
'view',CASE WHEN c.relkind='v' THEN pg_get_viewdef(c.oid,false) ELSE NULL END) ORDER BY c.oid) FROM pg_class c WHERE c.oid IN
('public.erp_report_templates'::regclass,'public.erp_report_branding_profiles'::regclass,'public.erp_report_branding_profiles_safe'::regclass,'public.perf_report_template_selection'::regclass)),
'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p WHERE p.polrelid IN ('public.erp_report_templates'::regclass,'public.erp_report_branding_profiles'::regclass)),
'helpers',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'owner',p.proowner,'acl',p.proacl,'config',p.proconfig,'body',p.prosrc,'definer',p.prosecdef) ORDER BY p.oid)
FROM pg_proc p WHERE p.oid IN ('erp_private.can_read_report_template_branding(bigint)'::regprocedure,'erp_private.can_read_report_branding(bigint)'::regprocedure,'erp_private.report_branding_permission(text,bigint)'::regprocedure)));
ROLLBACK;`;
let lab;
before(async () => {lab=await guardedLab();});
const witnesses = [
  ['raw SELECT signature','GRANT SELECT (signature_url) ON public.erp_report_branding_profiles TO authenticated'],
  ['raw INSERT signature','GRANT INSERT (signature_url) ON public.erp_report_branding_profiles TO authenticated'],
  ['raw UPDATE stamp','GRANT UPDATE (stamp_url) ON public.erp_report_branding_profiles TO authenticated'],
  ['raw REFERENCES id','GRANT REFERENCES (id) ON public.erp_report_branding_profiles TO authenticated'],
  ['template INSERT name','GRANT INSERT (template_name) ON public.erp_report_templates TO authenticated'],
  ['template UPDATE body','GRANT UPDATE (body_html_en) ON public.erp_report_templates TO authenticated'],
  ['template REFERENCES id','GRANT REFERENCES (id) ON public.erp_report_templates TO authenticated'],
  ['anonymous raw SELECT signature','GRANT SELECT (signature_url) ON public.erp_report_branding_profiles TO anon'],
  ['anonymous safe SELECT id','GRANT SELECT (id) ON public.erp_report_branding_profiles_safe TO anon'],
  ['anonymous template SELECT id','GRANT SELECT (id) ON public.erp_report_templates TO anon'],
];
for (const [label,grant] of witnesses) test(`column-only privilege adversary: ${label}`,() => {
  const beforeSnapshot=lab.sql(snapshotSql);
  let failure;
  try {lab.sql(`BEGIN; DROP VIEW public.perf_report_template_selection; ${grant};\n${body}\nROLLBACK;`,60000,'postgres');}
  catch(error) {failure=guardFailureMessage(error);}
  finally {assert.equal(lab.sql(snapshotSql),beforeSnapshot,'Adversarial guard attempt must leave original catalog and column grants identical');}
  assert.ok(failure && /Reviewed F06 read-only template and redacted branding privileges changed/.test(failure),
    `Expected privilege guard rejection for ${label}; an unrelated SQL failure does not pass`);
});
