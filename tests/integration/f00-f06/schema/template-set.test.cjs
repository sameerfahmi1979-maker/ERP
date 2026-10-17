'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../../..');
const M=require('../../../../tooling/integration/f00-f06/schema/template-set-manifest.cjs');
const D=require('../../../../tooling/integration/f00-f06/schema/template-set-differential.cjs');
const {sha256}=require('../../../../tooling/integration/f00-f06/schema/migration-manifest.cjs');
const sql=fs.readFileSync(path.join(root,'supabase/migrations',M.MIGRATION),'utf8').replace(/\r\n/g,'\n');
function input(name='scoped'){
 const company=970101,foreign=970102,roleId=970102,brand=970101;
 const branding=Array.from({length:5},(_,i)=>({id:brand+i,owner_company_id:i===1?foreign:i===2?null:company,is_active:i!==3,deleted_at:i===4?'2026-10-16':null}));
 const templates=Array.from({length:1113},(_,i)=>({id:971001+i,template_code:`F00F06_TEMPLATE_20261016_${i}`,branding_profile_id:brand,is_active:true,deleted_at:null,governance_status:i===1112?'draft':'approved'}));
 const ids=templates.map(t=>t.id),letters=ids.slice(0,-1),roleCode='F00F06_TEMPLATE_20261016_COMPANY_REPORT';
 const model={branding,templates,companies:[{id:company},{id:foreign}],branches:[{id:970101,owner_company_id:company,status:'active'},{id:970102,owner_company_id:company,status:'active'}],roles:[{id:roleId,role_code:roleCode,is_system_role:false}],
  assignments:{scoped:[{roleId,roleCode,ownerCompanyId:company,branchId:null,permissionCodes:['reports.view']}]},
  expected:Object.fromEntries(D.NAMES.map(n=>[n,{reportCenterIds:['noRole','branchOnly'].includes(n)?[]:ids,employeeLetterIds:['noRole','branchOnly'].includes(n)?[]:letters}]))};
 const authUserId='10000000-0000-4000-8000-000000000001',sessionId='20000000-0000-4000-8000-000000000001';
 const claims={sub:authUserId,session_id:sessionId,role:'authenticated',exp:1999999999};
 const actor={name,authUserId,sessionId,profileId:100,bearer:`TEST_ONLY.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.NOT_A_VALID_SIGNATURE`};
 return {actor,model,missingBrandingId:979999};
}
function row(i,permitted=true){
 const denied=!permitted||['noRole','branchOnly'].includes(i.actor.name),ids=denied?[]:i.model.templates.map(t=>t.id),letters=denied?[]:ids.slice(0,-1);
 const points=[null,...i.model.branding.map(b=>b.id),i.missingBrandingId].map(id=>({id,old:!denied&&id===970101,new:!denied&&id===970101}));
 return {actor:i.actor.name,probeCount:7,modelCount:1113,principal:true,points,authorizedBrandingIds:denied?[]:[970101],expectedIds:ids,
  actualTableIds:[...ids],actualViewIds:[...ids],expectedSelectableIds:[...ids],actualSelectableIds:[...ids],expectedLetterIds:letters,actualLetterIds:[...letters]};
}
test('new131 manifest preserves all130 exact identities/order and appends CLI filename',()=>{
 const built=M.buildTemplateSetManifest(),old=JSON.parse(fs.readFileSync(path.join(root,built.previousTemplateManifest.path),'utf8'));
 assert.equal(built.counts.total,131);assert.deepEqual(built.migrations.slice(0,130),old.migrations);
 assert.equal(built.migrations[130].name,M.MIGRATION);assert.equal(built.migrations[130].sha256,sha256(sql));
 assert.deepEqual(built.dependencyEdges.at(-1),{before:old.migrations.at(-1).name,after:M.MIGRATION});
 assert.doesNotThrow(()=>M.assertTemplateSetManifest(built));const wrong=structuredClone(built);wrong.migrations.reverse();assert.throws(()=>M.assertTemplateSetManifest(wrong));
});
test('migration wraps one guarded append, never edits old authority bodies or timeouts',()=>{
 assert.match(sql,/^--[\s\S]*\nBEGIN;/);assert.ok(sql.endsWith('COMMIT;\n'));
 assert.equal((sql.match(/CREATE (?:OR REPLACE )?FUNCTION /g)||[]).length,1);
 assert.match(sql,/CREATE FUNCTION erp_private\.readable_report_template_branding_ids\(\)/);
 assert.doesNotMatch(sql,/ALTER ROLE|DISABLE ROW LEVEL SECURITY|DISABLE TRIGGER|CREATE OR REPLACE FUNCTION|ALTER SYSTEM|service_role.*TO authenticated/i);
 assert.match(sql,/already exists; reconcile migration history/);assert.match(sql,/count\(\*\).*pg_policy[\s\S]*<>2/);
});
test('private helper preserves point gate, live identity, inactive history and strict execution ACL',()=>{
 const body=sql.split('AS $function$')[1].split('$function$')[0];
 assert.match(body,/SELECT p\.id/);assert.match(body,/\(SELECT auth\.uid\(\)\) IS NOT NULL/);
 assert.match(body,/\(SELECT erp_private\.business_principal_is_active\(\)\)/);
 assert.match(body,/erp_private\.can_read_report_template_branding\(p\.id\)/);
 assert.doesNotMatch(body,/p\.is_active|signature_url|stamp_url|body_html|user_metadata|LIMIT|owner_company_id\s*=/);
 assert.match(sql,/LANGUAGE sql STABLE SECURITY DEFINER\nSET search_path = ''/);
 assert.match(sql,/REVOKE ALL ON FUNCTION[^;]+FROM PUBLIC,anon,authenticated,service_role;/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION[^;]+TO authenticated;/);
});
test('template policy has uncorrelated set plus independent NULL initplan and view removes only duplicate gate',()=>{
 const policy=sql.split('ALTER POLICY rpt_templates_select')[1].split('-- The exact')[0];
 assert.match(policy,/branding_profile_id IS NULL AND \(SELECT erp_private\.can_read_report_template_branding\(NULL::bigint\)\)/);
 assert.match(policy,/branding_profile_id IN \(SELECT allowed\.id FROM erp_private\.readable_report_template_branding_ids\(\) AS allowed\(id\)\)/);
 assert.doesNotMatch(policy,/can_read_report_template_branding\(branding_profile_id\)/);
 const view=sql.split('CREATE OR REPLACE VIEW public.perf_report_template_selection')[1].split('DO $template_set_postimage$')[0];
 assert.match(view,/security_invoker=true,security_barrier=true/);assert.match(view,/LEFT JOIN public\.erp_report_branding_profiles_safe/);
 assert.match(view,/branding_profile_id IS NULL OR p\.id IS NOT NULL/);assert.doesNotMatch(view,/can_read_report_template_branding|signature_url|stamp_url|body_html/);
});
test('qualification successor is read-only and cannot count an unrelated helper/view as acceptance',()=>{
 const catalog=fs.readFileSync(path.join(__dirname,'template-set-catalog-acceptance.sql'),'utf8');
 assert.match(catalog,/BEGIN READ ONLY;/);assert.match(catalog,/ROLLBACK;/);assert.match(catalog,/statement_timeout='8s'/);
 assert.match(catalog,/IS DISTINCT FROM\s*'\(\(deleted_atISNULL\)AND\(SELECT/);assert.match(catalog,/d8ab7c06726c22ed06abd7207d9b1965/);
 assert.match(catalog,/p\.proretset/);assert.match(catalog,/has_any_column_privilege/);
});
test('successor catalog preserves Boolean grouping and exact view semantics',()=>{
 const catalog=fs.readFileSync(path.join(__dirname,'template-set-catalog-acceptance.sql'),'utf8');
 assert.match(catalog,/regexp_replace\(pg_get_expr\(polqual,polrelid\),'\\s\+'/);
 assert.match(catalog,/9142719031a0fe4936bdd98f97684519/);
 const intended='(deleted AND principal AND (nullBranch OR membership))';
 const leaking='((deleted AND principal AND nullBranch) OR membership)';
 assert.equal(intended.replace(/[\s()]/g,''),leaking.replace(/[\s()]/g,''));
 assert.notEqual(intended.replace(/\s+/g,''),leaking.replace(/\s+/g,''));
});
for(const name of D.NAMES)test(`${name} full1113-row differential admits positives/denials without vacuous closure`,()=>{
 const i=input(name),r=row(i);assert.equal(D.assertObservation(i,r),r);
 const query=D.readOnlySql(i);assert.match(query,/BEGIN READ ONLY/);assert.match(query,/statement_timeout='8s'/);
 assert.match(query,/old_truth AS MATERIALIZED/);assert.match(query,/new_ids AS MATERIALIZED/);
 assert.equal((query.match(/can_read_report_template_branding\(id\)/g)||[]).length,1);
 assert.doesNotMatch(query,/can_read_report_template_branding\(t\./);assert.match(query,/SET LOCAL ROLE authenticated/);
});
test('missing selected rows, NULL mistakes, privacy-independent table leaks and no-role helper leaks fail',()=>{
 for(const change of [r=>r.actualTableIds.pop(),r=>r.actualViewIds.pop(),r=>r.points[0].new=true,r=>r.actualLetterIds.pop()]){
  const i=input(),r=row(i);change(r);assert.throws(()=>D.assertObservation(i,r));
 }
 const i=input('noRole'),r=row(i);r.authorizedBrandingIds=[970101];assert.throws(()=>D.assertObservation(i,r));
 const positive=input();assert.throws(()=>D.assertObservation(positive,row(positive,false)),/Positive baseline/);
});
test('claims and model are admitted before SQL assembly; privileged/injected identities fail',()=>{
 for(const mutate of [i=>i.actor.sessionId="x';select1",i=>i.model.templates.pop(),i=>i.missingBrandingId=970101,i=>i.model.roles[0].is_system_role=true]){
  const i=input();mutate(i);assert.throws(()=>D.readOnlySql(i));
 }
 const i=input(),claims=JSON.parse(Buffer.from(i.actor.bearer.split('.')[1],'base64url'));claims.role='service_role';i.actor.bearer='x.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.x';
 assert.throws(()=>D.readOnlySql(i));
});
for(const state of D.STATES)test(`${state} witness is bounded tracked rollback and recomputes on next statement`,()=>{
 const i=input(),query=D.stateSql(i,state);assert.match(query,/^BEGIN;/);assert.ok(query.endsWith('ROLLBACK;'));
 assert.equal((query.match(/old_truth AS MATERIALIZED/g)||[]).length,2);assert.match(query,/affected<>1/);
 assert.match(query,/SET LOCAL ROLE postgres/);assert.equal((query.match(/SET LOCAL ROLE authenticated/g)||[]).length,2);
 assert.doesNotMatch(query,/COMMIT;|DISABLE TRIGGER|session_replication_role|ALTER ROLE|DELETE FROM auth/);
 assert.throws(()=>D.stateSql(input('global'),state),/positive company-scoped/);
});
test('state transition needs positive before and actual next-statement authority change',()=>{
 const i=input(),before=row(i),after=row(i,false);after.principal=false;
 assert.doesNotThrow(()=>D.assertStateTransition(i,'inactive-profile',before,after));
 assert.throws(()=>D.assertStateTransition(i,'inactive-profile',before,before));
 assert.throws(()=>D.assertStateTransition(i,'inactive-profile',after,after));
});
test('password setup uses only trusted empty claims then restores the exact genuine observer identity',()=>{
 const query=D.stateSql(input(),'password-required'),cleared=query.indexOf('SET LOCAL "request.jwt.claims" = \'{}\';');
 assert.ok(cleared>query.indexOf('SET LOCAL ROLE postgres;'));assert.ok(cleared<query.indexOf('SET must_change_password=true'));
 const after=query.slice(query.indexOf('SET must_change_password=true'));
 assert.match(after,/SET LOCAL ROLE authenticated;\nSET LOCAL "request.jwt.claims" = '\{"sub":/);
 assert.doesNotMatch(query,/role["']\s*:\s*["'](?:service_role|postgres)|DISABLE TRIGGER|session_replication_role/);
});
test('company witness retires exactly two tracked branches first and rejects additional finance dependencies',()=>{
 const query=D.stateSql(input(),'inactive-company');assert.match(query,/count\(\*\) FROM public\.branches WHERE owner_company_id=970101\)<>2/);
 assert.match(query,/public\.cost_centers/);assert.match(query,/public\.profit_centers/);assert.match(query,/affected<>2/);
 assert.ok(query.indexOf('UPDATE public.branches')<query.indexOf('UPDATE public.owner_companies'));
 const i=input();i.model.branches.push({id:970103,owner_company_id:970101,status:'active'});assert.throws(()=>D.stateSql(i,'inactive-company'));
 assert.throws(()=>D.stateSql(input(),'arbitrary-state'));
});
test('guard witnesses keep exact original migration source, ten fixed mutations and rollback only',()=>{
 assert.equal(D.REJECTIONS.length,10);
 for(const witness of D.REJECTIONS){const query=D.rollbackMigrationSql(sql,sha256(sql),witness);
  assert.match(query,/^BEGIN;/);assert.ok(query.endsWith('ROLLBACK;'));assert.doesNotMatch(query,/^COMMIT;/m);
  assert.ok(query.includes(witness.error.split(':')[0]));assert.ok(query.includes(witness.mutation));
 }
 assert.throws(()=>D.rollbackMigrationSql(sql,'0'.repeat(64)),/reviewed migration/);
 assert.throws(()=>D.rollbackMigrationSql(sql,sha256(sql),{mutation:'SELECT1'}),/fixed rejection/);
});
test('genuine signed JWT user metadata cannot terminate a DO block or alter its authority guard',()=>{
 const i=input(),claims=JSON.parse(Buffer.from(i.actor.bearer.split('.')[1],'base64url'));
 claims.user_metadata={note:"$caller$; RESET ROLE; SELECT 'bad'; --",other:'$state_preimage$'};
 i.actor.bearer='x.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.x';
 const query=D.readOnlySql(i),setting=query.split('\n').find(line=>line.startsWith('SET LOCAL "request.jwt.claims"'));
 assert.ok(query.indexOf('SET LOCAL standard_conforming_strings=on;')<query.indexOf('SET LOCAL "request.jwt.claims"'));
 assert.ok(setting);assert.ok(setting.includes("SELECT ''bad''"));
 const body=query.slice(query.indexOf('DO $caller$'),query.indexOf('END $caller$;')+'END $caller$;'.length);
 assert.doesNotMatch(body,/RESET ROLE|user_metadata|bad/);
 assert.equal((body.match(/\$caller\$/g)||[]).length,2);
});
test('assignment role codes cannot inject a DO terminator or disagree with the frozen role/company',()=>{
 for(const mutate of [i=>i.model.assignments.scoped[0].roleCode='$state_preimage$;RESET ROLE;',
  i=>i.model.assignments.scoped[0].ownerCompanyId=979999,
  i=>{i.model.assignments.scoped[0].roleCode='F00F06_TEMPLATE_20261016_$state_preimage$';i.model.roles[0].role_code=i.model.assignments.scoped[0].roleCode;}]){
  const i=input();mutate(i);assert.throws(()=>D.stateSql(i,'inactive-profile'));
 }
});
