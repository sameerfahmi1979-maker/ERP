'use strict';
const assert = require('node:assert/strict');
const {sha256} = require('./migration-manifest.cjs');

// No database action occurs on import. These adversaries are exclusively for
// the coordinator-owned isolated lab, and every transaction must roll back.
const witnesses = Object.freeze([
  {id:'replay', keepSelector:true, mutation:'', expected:'Template selection already exists; reconcile migration history instead of replacing it'},
  {id:'wrong-owner', mutation:'SET LOCAL ROLE supabase_admin;', expected:'Template selection requires the reviewed PostgreSQL migration owner and invoker-view support'},
  {id:'missing-safe-view', mutation:'ALTER VIEW public.erp_report_branding_profiles_safe RENAME TO integration_selection_missing_safe_witness;', expected:'Reviewed F06 template RLS or safe branding view is missing or changed'},
  {id:'widened-safe-view', mutation:`DO $witness$
DECLARE original text; widened text;
BEGIN
  original := pg_get_viewdef('public.erp_report_branding_profiles_safe'::regclass, false);
  widened := replace(original, 'erp_private.can_read_report_branding(p.owner_company_id)', 'true');
  IF widened = original THEN RAISE EXCEPTION 'Witness could not locate the original safe-view authority predicate'; END IF;
  EXECUTE 'CREATE OR REPLACE VIEW public.erp_report_branding_profiles_safe WITH (security_barrier=true) AS ' || widened;
END;
$witness$;`, expected:'Reviewed F06 safe branding projection changed'},
  {id:'altered-helper', mutation:`DO $witness$
DECLARE original text; definition text;
BEGIN
  SELECT prosrc INTO STRICT original FROM pg_proc WHERE oid = 'erp_private.can_read_report_template_branding(bigint)'::regprocedure;
  definition := pg_get_functiondef('erp_private.can_read_report_template_branding(bigint)'::regprocedure);
  IF length(original) < 2 OR strpos(definition, original) = 0 THEN RAISE EXCEPTION 'Witness could not locate original helper body'; END IF;
  EXECUTE replace(definition, original, 'select true;');
END;
$witness$;`, expected:'Reviewed F06 template authority helper changed: erp_private.can_read_report_template_branding(bigint)'},
  {id:'raw-table-grant', mutation:'GRANT SELECT ON public.erp_report_branding_profiles TO authenticated;', expected:'Reviewed F06 read-only template and redacted branding privileges changed'},
  {id:'disabled-rls', mutation:'ALTER TABLE public.erp_report_templates DISABLE ROW LEVEL SECURITY;', expected:'Reviewed F06 template RLS or safe branding view is missing or changed'},
  {id:'extra-permissive-policy', mutation:'CREATE POLICY integration_selection_adversary ON public.erp_report_templates AS PERMISSIVE FOR SELECT TO authenticated USING (true);', expected:'Reviewed F06 template SELECT policy changed'},
].map(Object.freeze));

function migrationBody(source, expectedSha) {
  const sql = source.replace(/\r\n/g,'\n');
  assert.equal(sha256(sql),expectedSha,'Native witness must use the hash-pinned composition migration');
  assert.ok(sql.startsWith('BEGIN;\n') && sql.endsWith('COMMIT;\n'),'Unexpected migration transaction wrappers');
  // Strip outer transaction wrappers only. Every reviewed guard stays exact.
  return sql.slice('BEGIN;\n'.length,-'COMMIT;\n'.length);
}
function witnessSql(witness, body) {
  assert.ok(witnesses.includes(witness),'Only reviewed fixed witnesses may execute');
  assert.ok(!/^\s*(?:COMMIT|END\s+TRANSACTION)\b/im.test(body),'Unexpected inner transaction commit');
  const drop = witness.keepSelector ? '' : 'DROP VIEW public.perf_report_template_selection;\n';
  return `BEGIN;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '60s';\n${drop}${witness.mutation}\n${body}\nROLLBACK;`;
}

// Include view definitions/options, every column ACL/type, complete policies,
// function definitions/executable metadata and owner/grant identities.
const snapshotSql = `BEGIN READ ONLY;
SELECT jsonb_build_object(
  'relations', (SELECT jsonb_agg(jsonb_build_object(
    'catalog',to_jsonb(c)-'relpages'-'reltuples'-'relallvisible'-'relallfrozen',
    'columns',(SELECT jsonb_agg(jsonb_build_array(a.attnum,a.attname,a.atttypid,a.atttypmod,a.attacl,a.attisdropped) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0),
    'view',CASE WHEN c.relkind='v' THEN pg_get_viewdef(c.oid,false) ELSE NULL END) ORDER BY c.oid)
    FROM pg_class c WHERE c.oid IN ('public.erp_report_templates'::regclass,'public.erp_report_branding_profiles'::regclass,'public.erp_report_branding_profiles_safe'::regclass,'public.perf_report_template_selection'::regclass)),
  'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p WHERE p.polrelid IN ('public.erp_report_templates'::regclass,'public.erp_report_branding_profiles'::regclass)),
  'helpers',(SELECT jsonb_agg(jsonb_build_object('catalog',to_jsonb(p),'definition',pg_get_functiondef(p.oid)) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN ('erp_private.can_read_report_template_branding(bigint)'::regprocedure,'erp_private.can_read_report_branding(bigint)'::regprocedure,'erp_private.report_branding_permission(text,bigint)'::regprocedure)),
  'witnessArtifact',(SELECT to_regclass('public.integration_selection_missing_safe_witness')));
ROLLBACK;`;

function runWitness(lab, failureMessage, witness, body) {
  const before = lab.sql(snapshotSql);
  let failure;
  try { lab.sql(witnessSql(witness,body),90000,'postgres'); }
  catch(error) { failure = failureMessage(error); }
  finally { assert.equal(lab.sql(snapshotSql),before,'Native rejection must restore the exact original catalog, ACLs, policies and helper bodies'); }
  assert.ok(failure && failure.includes(`ERROR:  ${witness.expected}`),
    `Expected ${witness.id} migration guard rejection; unrelated SQL errors and unexpected success do not pass`);
}

module.exports = {witnesses,migrationBody,witnessSql,snapshotSql,runWitness};
