'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {sha256,NEW_MIGRATION}=require('../../../../tooling/integration/f00-f06/schema/migration-manifest.cjs');
const {buildDependencyManifest}=require('../../../../tooling/integration/f00-f06/schema/dependency-manifest.cjs');
const {buildBrandingAclManifest,assertBrandingAclManifest,ACL_MIGRATION,ACL_MANIFEST}=require('../../../../tooling/integration/f00-f06/schema/branding-acl-manifest.cjs');
const {witnesses,migrationBody,positiveSql,witnessSql,snapshotSql}=require('../../../../tooling/integration/f00-f06/schema/branding-acl-witnesses.cjs');
const root=path.resolve(__dirname,'../../../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
const sql=read(`supabase/migrations/${ACL_MIGRATION}`);
const catalog=read('tests/integration/f00-f06/schema/branding-acl-catalog-acceptance.sql');
const manifest=JSON.parse(read(ACL_MANIFEST));
const digest=manifest.migrations.find(r=>r.name===ACL_MIGRATION).sha256;
test('130 manifest is exact and preserves all129 source identities and order',()=>{
 assert.deepEqual(buildBrandingAclManifest(),manifest);assertBrandingAclManifest(manifest);
 assert.equal(manifest.counts.total,130);assert.equal(manifest.migrations.length,130);
 assert.equal(manifest.migrations[128].name,ACL_MIGRATION);assert.equal(manifest.migrations[129].name,NEW_MIGRATION);
 const without=manifest.migrations.filter(r=>r.name!==ACL_MIGRATION).map(({order,...r})=>r);
 assert.deepEqual(without,buildDependencyManifest().migrations.map(({order,...r})=>r));
 assert.equal(manifest.previousDependencyManifest.count,129);
 assert.equal(manifest.migrations[128].commit,null);assert.equal(manifest.migrations[128].originalOrder,null);
 assert.equal(manifest.digest,sha256(manifest.migrations.map(r=>`${r.name} ${r.sha256}\n`).join('')));
});
for(const variant of ['missing','chronological','wrong-edge','alter-old','wrong-donor','extra','version'])test(`130 admission rejects ${variant}`,()=>{
 const m=structuredClone(manifest);
 if(variant==='missing')m.migrations.splice(128,1);
 if(variant==='chronological')m.migrations.sort((a,b)=>a.name.localeCompare(b.name));
 if(variant==='wrong-edge')m.dependencyEdges.at(-1).after=ACL_MIGRATION;
 if(variant==='alter-old')m.migrations[127].sha256='0'.repeat(64);
 if(variant==='wrong-donor')m.migrations[0].commit='0'.repeat(40);
 if(variant==='extra')m.migrations.push({...m.migrations[0],order:131});
 if(variant==='version')m.version=2;
 assert.throws(()=>assertBrandingAclManifest(m));
});
test('only exact PG17 m-only source, owner, RLS, absent column grants and denied effective reads admit mutation',()=>{
 const pre=sql.slice(0,sql.indexOf("EXECUTE 'REVOKE ALL"));
 for(const marker of ['current_user','server_version_num',"integer<170000","integer>=180000",'relkind',"'postgres'::regrole",'relrowsecurity','relforcerowsecurity',
  "ARRAY['anon=m/postgres','authenticated=m/postgres'","'postgres=arwdDxtm/postgres','service_role=arwdDxtm/postgres'",'attacl IS NOT NULL',
  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER','SELECT,INSERT,UPDATE,REFERENCES','security_barrier=true','security_invoker=true',
  "to_regclass('public.perf_report_template_selection') IS NOT NULL"])assert.ok(pre.includes(marker),marker);
 assert.match(sql,/REVOKE ALL ON TABLE public\.erp_report_branding_profiles FROM PUBLIC, anon, authenticated RESTRICT/);
 assert.equal(sql.match(/EXECUTE 'REVOKE /g).length,1);
 assert.doesNotMatch(sql.replace(/^\s*--[^\n]*/gm,''),/\b(?:GRANT|INSERT INTO|UPDATE public\.|DELETE FROM|CREATE (?:FUNCTION|POLICY|TABLE|VIEW)|ALTER TABLE|CASCADE)\b/);
});
test('postimage preserves owner/service ACL and protected schema, columns, policy, projection, authority and memberships',()=>{
 const post=sql.slice(sql.indexOf("EXECUTE 'REVOKE ALL"));
 assert.match(post,/ARRAY\['postgres=arwdDxtm\/postgres','service_role=arwdDxtm\/postgres'\]/);
 for(const marker of ["'rawRelation'","to_jsonb(c)-'relacl'","'columns'","'policies'","'readRelations'","'safeProjection'","'authority'","'defaults'","'roles'","'memberships'",
  'v_after IS DISTINCT FROM v_before'])assert.ok(sql.includes(marker),marker);
 assert.equal(sql.match(/EXECUTE v_snapshot_sql INTO v_(?:before|after)/g).length,2);
});
test('both SQL layers check implicit pg_maintain and inherited/PUBLIC authority only after hard version guard',()=>{
 for(const source of [sql,catalog]){
  assert.ok(source.indexOf('server_version_num')<source.indexOf("EXECUTE 'SELECT pg_catalog.has_table_privilege"));
  assert.match(source,/aclexplode\(c\.relacl\)/);assert.match(source,/a\.privilege_type='MAINTAIN'/);
  assert.match(source,/\(CASE WHEN a\.grantee=0 THEN true\s+ELSE pg_has_role\(v_role,a\.grantee,'USAGE'\) END\)/);
  assert.match(source,/EXECUTE 'SELECT pg_catalog\.has_table_privilege\(\$1,\$2,''MAINTAIN''\)'\s+INTO v_has_maintain USING v_role,v_oid/);
  assert.match(source,/v_has_maintain IS DISTINCT FROM false/);
  for(const name of ['erp_report_branding_profiles','erp_report_templates','erp_report_branding_profiles_safe'])assert.ok(source.includes(`'public.${name}'::regclass::oid`));
 }
 assert.ok(catalog.includes("'public.perf_report_template_selection'::regclass::oid"));
 assert.match(catalog,/^--[^\n]*\nBEGIN READ ONLY;/);assert.match(catalog,/ROLLBACK;\n$/);
 assert.doesNotMatch(catalog,/^\s*(?:REVOKE|GRANT|ALTER|INSERT|UPDATE|DELETE|COMMIT)\b/im);
 assert.deepEqual([...catalog.matchAll(/EXECUTE '([^\n]*)'/g)].map(m=>m[1]),["SELECT pg_catalog.has_table_privilege($1,$2,''MAINTAIN'')"]);
});
test('SQL procedural variables cannot collide with relation/function aliases',()=>{
 for(const source of [sql,catalog]){
  const declarations=source.match(/DECLARE([\s\S]*?)\nBEGIN/)[1];
  const names=[...declarations.matchAll(/\b(v_\w+)\s+(?:record|text|jsonb|oid|boolean)/g)].map(m=>m[1]);
  assert.ok(names.length>=5);
  for(const name of names)assert.doesNotMatch(source,new RegExp(`(?:FROM|JOIN)\\s+[^;\\n]+\\s+${name}\\b`,'i'));
 }
});
test('15 bounded rejection builders retain exact source identity and rollback only',()=>{
 assert.equal(witnesses.length,15);assert.equal(new Set(witnesses.map(w=>w.id)).size,15);
 const body=migrationBody(sql,digest);assert.equal(sha256(sql),digest);
 assert.equal(positiveSql(sql,digest),`BEGIN;\n${body}\nROLLBACK;`);
 for(const w of witnesses){const text=witnessSql(w,sql,digest);
  assert.ok(text.startsWith('BEGIN;')&&text.endsWith('ROLLBACK;'));assert.ok(text.includes(body));
  assert.doesNotMatch(text,/^\s*COMMIT\s*;/im);assert.ok(body.includes(w.expected));
 }
 assert.throws(()=>witnessSql({...witnesses[0]},sql,digest));assert.throws(()=>migrationBody(sql,'0'.repeat(64)));
 assert.throws(()=>migrationBody(`${sql}-- changed\n`,digest));
 const implicit=witnesses.find(w=>w.id==='implicit-pg-maintain');
 assert.match(implicit.mutation,/session_user<>'supabase_admin' OR current_user<>'postgres'/);
 assert.match(implicit.mutation,/RESET ROLE;\s+GRANT pg_maintain TO authenticated;\s+SET LOCAL ROLE postgres;/);
 assert.equal(implicit.expected,'Branding ACL effective maintenance authority remains');
});
test('independent snapshot covers role/default/column mutations and hashes confidential rows',()=>{
 assert.ok(snapshotSql.startsWith('BEGIN READ ONLY;')&&snapshotSql.endsWith('ROLLBACK;'));
 for(const key of ['schemas','functions','policies','relations','columns','defaults','roles','memberships','branding','templates'])assert.ok(snapshotSql.includes(`'${key}'`));
 assert.match(snapshotSql,/'branding',\(SELECT md5\(/);assert.match(snapshotSql,/'templates',\(SELECT md5\(/);
 assert.doesNotMatch(snapshotSql,/\b(?:REVOKE|GRANT|ALTER|INSERT|DELETE|COMMIT)\b/);
});
