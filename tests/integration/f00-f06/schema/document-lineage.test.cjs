'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {sha256}=require('../../../../tooling/integration/f00-f06/schema/migration-manifest.cjs');
const {buildDependencyManifest,assertDependencyManifest,BRIDGE,DEPENDENCY_MANIFEST,STATEMENT,NOTIFICATION,CANDIDATE}=require('../../../../tooling/integration/f00-f06/schema/dependency-manifest.cjs');
const {witnesses,migrationBody,witnessSql,snapshotSql}=require('../../../../tooling/integration/f00-f06/schema/document-lineage-witnesses.cjs');
const root=path.resolve(__dirname,'../../../..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations',BRIDGE),'utf8').replace(/\r\n/g,'\n');
const manifest=JSON.parse(fs.readFileSync(path.join(root,DEPENDENCY_MANIFEST),'utf8'));
const digest=manifest.migrations.find(r=>r.name===BRIDGE).sha256;
const definitions=[...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w.]+)\s*\([^;]*?\bAS\s+(\$[\w]*\$)([\s\S]*?)\2;/gi)];
test('explicit129 manifest is reproducible and retains only the two reviewed original relocations',()=>{
 assert.deepEqual(buildDependencyManifest(),manifest);assertDependencyManifest(manifest);
 assert.equal(manifest.migrations.length,129);
 assert.deepEqual(manifest.migrations.slice(110,114).map(r=>r.name),[BRIDGE,STATEMENT,NOTIFICATION,CANDIDATE]);
 assert.deepEqual(manifest.relocations.map(r=>r.name),[STATEMENT,NOTIFICATION]);
 assert.ok(manifest.migrations[110].name>manifest.migrations[111].name,'Bridge must not be silently backdated');
 const f06=manifest.migrations.filter(r=>r.group==='F06').map(r=>r.originalOrder);
 assert.deepEqual(f06,[...f06].sort((a,b)=>a-b));
});
for(const mutation of ['chronological-sort','wrong-edge','missing-bridge','wrong-donor','changed-old-body','extra-relocation'])test(`dependency admission rejects ${mutation}`,()=>{
 const m=structuredClone(manifest);
 if(mutation==='chronological-sort')m.migrations.sort((a,b)=>a.name.localeCompare(b.name));
 if(mutation==='wrong-edge')m.dependencyEdges[0].before=STATEMENT;
 if(mutation==='missing-bridge')m.migrations.splice(110,1);
 if(mutation==='wrong-donor')m.migrations[115].commit='0'.repeat(40);
 if(mutation==='changed-old-body')m.migrations[111].sha256='0'.repeat(64);
 if(mutation==='extra-relocation')[m.migrations[114],m.migrations[115]]=[m.migrations[115],m.migrations[114]];
 assert.throws(()=>assertDependencyManifest(m));
});
test('exactly six selected function bodies satisfy original111 and no table/policy/original-wrapper rewrites exist',()=>{
 assert.deepEqual(Object.fromEntries(definitions.map(m=>[m[1],crypto.createHash('md5').update(m[3]).digest('hex')])),{
  'erp_private.document_permission':'1c6c7a6c40749c9bea0e28cc99e03595',
  'erp_private.perf_hr_document_subjects_allowed':'6d025f4b9359e7685d1085f2179b40b0',
  'erp_private.perf_recruitment_document_subjects_allowed':'68539a4aa725e86fa64e50e60b114f90',
  'erp_private.read_documents_filtered_v2':'0740033a5d712f7e883dbff80680e2cb',
  'erp_private.read_documents_filtered':'c95a1a5ba0facbcb902b429be8a29a12',
  'erp_private.read_documents':'6bc7814a408d77990df6e20bb2c58033',
 });
 assert.doesNotMatch(sql,/CREATE (?:OR REPLACE )?(?:FUNCTION public\.|VIEW)|ALTER TABLE|(?:CREATE|ALTER|DROP) POLICY|DISABLE ROW LEVEL SECURITY|INSERT INTO|DELETE FROM/i);
 assert.doesNotMatch(sql,/CREATE (?:OR REPLACE )?FUNCTION erp_private\.(?:hr_document_evidence_allowed|recruitment_document_evidence_allowed)\(/);
});
test('exact post110 helpers, private schema, grants, subject non-nullness and full policy preimages gate mutation',()=>{
 const pre=sql.slice(0,sql.indexOf('END $lineage_preimage$;'));
 for(const field of ['current_user','nspowner','has_schema_privilege','to_regprocedure','md5(actual.prosrc)','actual.proowner','actual.prosecdef',
  'actual.proretset','actual.prorettype','actual.prolang','actual.prokind','actual.proisstrict','actual.proleakproof','actual.proparallel',
  'actual.pronargdefaults','actual.prosqlbody','actual.probin','actual.prosupport','actual.provariadic','actual.provolatile','actual.proconfig','expected.acl',
  'attnotnull','relrowsecurity','expected.policies'])assert.ok(pre.includes(field),field);
 assert.match(pre,/2190943612f7b95620a97b76fb50fc84/);assert.match(pre,/0f0eab71e21aa2f965c08bd6f5f31810/);
 assert.match(sql,/to_jsonb\(p\)-'prosrc'/);assert.match(sql,/current_setting\('integration_lineage.unchanged'\)::jsonb/);
});
test('every selected reader preserves the live principal, scope tuple and seven protected field masks',()=>{
 const core=definitions.find(m=>m[1]==='erp_private.read_documents_filtered_v2')[3];
 for(const marker of ['business_principal_is_active()','actor.uid IS NOT NULL AND actor.active','ur.is_active AND r.is_active AND p.is_active',
  's.owner_company_id=d.owning_company_id','s.branch_id=d.owning_branch_id','perf_recruitment_document_subjects_allowed(d.id)',
  'perf_hr_document_subjects_allowed(d.id)','readable_employee_ids()','current_user_can_view_employee_medical','employee_dependents',
  'document_ids IS NULL OR d.id=ANY(document_ids)','document_statuses IS NULL OR d.status=ANY(document_statuses)',
  'excluded_statuses IS NULL OR d.status<>ALL(excluded_statuses)',
  "'ai_summary','content_tsv','summary_embedding','ai_summary_error','summary_embedding_error','ai_warnings_json','ai_risk_reasons_json'"])
  assert.ok(core.includes(marker),marker);
 const grants=sql.slice(sql.indexOf('-- Existing replaced-function ACLs'),sql.indexOf('DO $lineage_postimage$'));
 assert.match(grants,/FROM PUBLIC,anon,authenticated,service_role/);
 assert.match(grants,/GRANT EXECUTE ON FUNCTION erp_private.read_documents_filtered\(bigint\[\],text\[\]\),/);
 assert.doesNotMatch(grants,/GRANT[\s\S]*perf_hr_document|GRANT[\s\S]*perf_recruitment_document|TO (?:anon|service_role|PUBLIC)/);
});
test('original111 expansion produces exact0c4be body required by original113, while original121 requires old0740 body',()=>{
 // Original migration bytes come from the immutable donor, not an autocrlf checkout.
 const expansion=execFileSync('git',['show',`${manifest.source.PERF}:supabase/migrations/${CANDIDATE}`],{cwd:root,encoding:'utf8'});
 const replacement=expansion.match(/\$predicate\$([\s\S]*?)\$predicate\$/)[1];
 const before=definitions.find(m=>m[1]==='erp_private.read_documents_filtered_v2')[3];
 const after=before.replace('AND erp_private.perf_recruitment_document_subjects_allowed(d.id)',replacement)
  .replace('WITH principal AS MATERIALIZED (','WITH visible_candidates AS MATERIALIZED (SELECT id FROM erp_private.read_hr_candidates()), principal AS MATERIALIZED (');
 assert.equal(crypto.createHash('md5').update(after).digest('hex'),'0c4be0e6b69b7fa8bb2ba0c446d3aae5');
 const notification=fs.readFileSync(path.join(root,'supabase/migrations',NOTIFICATION),'utf8');
 assert.match(notification,/0740033a5d712f7e883dbff80680e2cb/);
 assert.ok(manifest.migrations.findIndex(r=>r.name===NOTIFICATION)<manifest.migrations.findIndex(r=>r.name===CANDIDATE));
});
test('thirteen fixed rejection witnesses retain exact original bridge guards and always roll back',()=>{
 assert.equal(witnesses.length,13);assert.equal(new Set(witnesses.map(w=>w.id)).size,13);
 const body=migrationBody(sql,digest);
 for(const w of witnesses){const text=witnessSql(w,sql,digest);assert.ok(text.startsWith('BEGIN;')&&text.endsWith('ROLLBACK;'));
  assert.ok(text.includes(body));assert.doesNotMatch(text,/^\s*COMMIT\s*;/im);assert.ok(body.includes(w.expected.split(':')[0]));}
 assert.throws(()=>witnessSql({...witnesses[0]},sql,digest));assert.throws(()=>migrationBody(sql,'0'.repeat(64)));
 assert.ok(snapshotSql.startsWith('BEGIN READ ONLY;')&&snapshotSql.endsWith('ROLLBACK;'));
 for(const key of ['schemas','functions','policies','relations','columns','documents','links','candidates'])assert.ok(snapshotSql.includes(`'${key}'`));
 assert.equal(sha256(sql),digest);
});

test('PL/pgSQL ACL guards parenthesize CASE so its THEN cannot terminate the surrounding IF',()=>{
 const catalog=fs.readFileSync(path.join(root,'tests/integration/f00-f06/schema/document-lineage-catalog-acceptance.sql'),'utf8');
 const compiler=fs.readFileSync(path.join(root,'tests/integration/f00-f06/schema/document-lineage-case-compiler.readonly.sql'),'utf8');
 const condition="acl IS DISTINCT FROM (CASE WHEN expected.owner_only THEN ARRAY['postgres=X/postgres'] ELSE ARRAY['authenticated=X/postgres','postgres=X/postgres'] END)::text[]";
 for(const source of [sql,catalog,compiler]){
  assert.equal(source.split(condition).length-1,1,'Actual comparison must match the native compiler witness');
  assert.doesNotMatch(source,/acl IS DISTINCT FROM CASE/);
 }
 assert.match(compiler,/BEGIN READ ONLY;/);assert.match(compiler,/ROLLBACK;/);
 assert.match(compiler,/\(true,true\),\(false,true\),\(true,false\),\(false,false\)/);
 assert.doesNotMatch(compiler,/CREATE|ALTER|INSERT|UPDATE|DELETE|COMMIT|EXECUTE/i);
});

test('all lineage DO procedural variables are disjoint from SQL relation/function aliases',()=>{
 const catalog=fs.readFileSync(path.join(root,'tests/integration/f00-f06/schema/document-lineage-catalog-acceptance.sql'),'utf8');
 const blocks=[...`${sql}\n${catalog}`.matchAll(/DO\s+(\$\w+\$)\s*DECLARE([\s\S]*?)\bBEGIN\b([\s\S]*?)END\s+\1;/g)];
 assert.equal(blocks.length,3,'Inspect both migration guard blocks and the final catalog block');
 for(const block of blocks){
  const variables=block[2].split(';').map(part=>part.trim().match(/^(\w+)\s/)).filter(Boolean).map(m=>m[1]);
  assert.ok(variables.length>=3);
  const aliases=[...block[3].matchAll(/\b(?:FROM|JOIN)\s+(?:pg_\w+\s+|unnest\([^)]*\)\s*)(?:AS\s+)?(\w+)/gi)]
   .map(m=>m[1]).filter(name=>!['WHERE','ORDER','LOOP'].includes(name.toUpperCase()));
  assert.ok(aliases.length>0);
  assert.deepEqual(variables.filter(name=>aliases.includes(name)),[],block[1]+' variable/SQL alias ambiguity');
 }
 const post=blocks.find(block=>block[1]==='$lineage_postimage$');
 assert.match(post[2],/v_actual_proc record/);assert.doesNotMatch(post[2],/\bp record/);
 assert.match(post[3],/INTO STRICT v_actual_proc FROM pg_proc/);
 assert.match(post[3],/jsonb_agg\(to_jsonb\(p\) ORDER BY p\.oid\) FROM pg_proc p/);
});

test('owner-change witness requires an admin session, changes ownership there, then restores the guarded postgres role',()=>{
 const witness=witnesses.find(w=>w.id==='changed-helper-owner');
 assert.equal(witness.expected,'Document lineage prerequisite drift: erp_private.employee_permission(bigint,text)');
 assert.match(witness.mutation,/session_user<>'supabase_admin' OR current_user<>'postgres'/);
 const reset=witness.mutation.indexOf('RESET ROLE;'),alter=witness.mutation.indexOf('ALTER FUNCTION erp_private.employee_permission(bigint,text) OWNER TO supabase_admin;');
 const restore=witness.mutation.indexOf('SET LOCAL ROLE postgres;');
 assert.ok(reset>witness.mutation.indexOf('END $owner_witness$;')&&reset<alter&&alter<restore);
 assert.ok(witness.mutation.trimEnd().endsWith('SET LOCAL ROLE postgres;'));
 const text=witnessSql(witness,sql,digest);
 assert.ok(text.indexOf('SET LOCAL ROLE postgres;')<text.indexOf('DO $lineage_preimage$'));
 assert.match(text,/^BEGIN;/);assert.match(text,/ROLLBACK;$/);assert.doesNotMatch(witness.mutation,/COMMIT|GRANT|SET SESSION AUTHORIZATION/);
});
