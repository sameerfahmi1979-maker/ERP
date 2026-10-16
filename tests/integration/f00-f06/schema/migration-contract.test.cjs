'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {buildManifest, sha256, NEW_MIGRATION} = require('../../../../tooling/integration/f00-f06/schema/migration-manifest.cjs');
const root = path.resolve(__dirname, '../../../..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations', NEW_MIGRATION), 'utf8');
test('chronological source inventory pins all128 exact blobs with interleaved F06/PERF', () => {
  const manifest = buildManifest();
  const saved = JSON.parse(fs.readFileSync(path.join(root, 'docs/integration/f00-f06/schema/MIGRATION_MANIFEST_20261016.json'), 'utf8'));
  assert.deepEqual(saved, manifest, 'Published source manifest must match immutable donors and exact new migration bytes');
  assert.equal(manifest.migrations.length, 128);
  for (let index = 1; index < manifest.migrations.length; index++) assert.ok(manifest.migrations[index - 1].name < manifest.migrations[index].name);
  assert.deepEqual(manifest.counts, {predecessor: 26, F06: 85, PERF: 16, composition: 1, total: 128});
  const groups = manifest.migrations.map(row => row.group);
  const firstPerf = groups.indexOf('PERF');
  assert.ok(groups.slice(firstPerf + 1).includes('F06'));
  assert.ok(manifest.migrations.every(row => /^[a-f\d]{64}$/.test(row.sha256)));
  assert.equal(manifest.migrations.at(-1).sha256, sha256(sql.replace(/\r\n/g, '\n')));
});
test('only new selector and temporary exact-view witness are created; authority is never replaced', () => {
  assert.equal((sql.match(/CREATE VIEW public\./g) || []).length, 1);
  assert.doesNotMatch(sql, /CREATE OR REPLACE|CREATE (?:OR REPLACE )?FUNCTION|ALTER POLICY|ALTER TABLE|DROP POLICY|DISABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /WITH \(security_invoker = true, security_barrier = true\)/);
  assert.match(sql, /LEFT JOIN public\.erp_report_branding_profiles_safe p/);
  assert.match(sql, /erp_private\.can_read_report_template_branding\(t\.branding_profile_id\)/);
  assert.match(sql, /DROP VIEW pg_temp\.perf_expected_safe_branding/);
  assert.match(sql, /already exists; reconcile migration history/);
});
test('new grant is SELECT-only authenticated and does not expose confidential payload fields', () => {
  const view = sql.slice(sql.indexOf('CREATE VIEW public.perf_report_template_selection'));
  assert.match(view, /REVOKE ALL ON public\.perf_report_template_selection FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(view, /GRANT SELECT ON public\.perf_report_template_selection TO authenticated/);
  assert.doesNotMatch(view, /stamp_url|signature_url|body_html|layout_json|style_json|bank|medical|GRANT.*service_role|GRANT.*anon/);
  assert.match(view, /COALESCE\(t\.is_active, false\)/);
  assert.doesNotMatch(view, /WHERE.*is_active|WHERE.*governance_status/);
});
test('guard checks the complete F06 safe projection and helper metadata before new object', () => {
  assert.ok(sql.indexOf('$selection_view_preimage$;') < sql.indexOf('CREATE VIEW public.perf_report_template_selection'));
  for (const marker of ['pg_get_viewdef', 'p.proowner', 'p.prosecdef', 'p.provolatile', 'p.proconfig', 'p.prosrc', 'polroles', 'relrowsecurity']) assert.ok(sql.includes(marker), marker);
  assert.match(sql, /current_user <> 'postgres'/);
  assert.match(sql, /has_table_privilege\('authenticated', 'public\.erp_report_branding_profiles', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'\)/);
  assert.ok(sql.trim().startsWith('BEGIN;'));
  assert.ok(sql.trim().endsWith('COMMIT;'));
});
test('column-only raw branding and template grants cannot bypass table ACL guards', () => {
  for (const [role,relation,privileges] of [
    ['authenticated','erp_report_branding_profiles','SELECT,INSERT,UPDATE,REFERENCES'],
    ['authenticated','erp_report_templates','INSERT,UPDATE,REFERENCES'],
    ['anon','erp_report_branding_profiles','SELECT,INSERT,UPDATE,REFERENCES'],
    ['anon','erp_report_branding_profiles_safe','SELECT,INSERT,UPDATE,REFERENCES'],
    ['anon','erp_report_templates','SELECT,INSERT,UPDATE,REFERENCES'],
  ]) assert.ok(sql.includes(`has_any_column_privilege('${role}', 'public.${relation}', '${privileges}')`));
  const catalog=fs.readFileSync(path.join(root,'tests/integration/f00-f06/schema/catalog-acceptance.sql'),'utf8');
  assert.ok((catalog.match(/has_any_column_privilege/g)||[]).length>=8);
  const witness=fs.readFileSync(path.join(root,'tests/integration/f00-f06/schema/column-grant-rejections.native.test.cjs'),'utf8');
  assert.match(witness,/GRANT SELECT \(signature_url\)/);assert.match(witness,/GRANT UPDATE \(body_html_en\)/);
  assert.match(witness,/ROLLBACK;/);assert.match(witness,/original catalog and column grants identical/);
});
