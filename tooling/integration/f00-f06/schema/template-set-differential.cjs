'use strict';
// Inert SQL builders/assertions. No transport, credentials, target defaults,
// provisioning or execution. The coordinator must verify genuine Auth + app
// sessions and exact owned-fixture preimages before using any returned SQL.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const NAMES=Object.freeze(['global','scoped','branchOnly','combined','noRole']);
const STATES=Object.freeze(['inactive-profile','password-required','revoked-session','inactive-assignment',
 'inactive-role','inactive-permission','scope-moved','inactive-company','inactive-branding','deleted-branding']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const q=value=>value===null?'NULL':typeof value==='boolean'?(value?'TRUE':'FALSE'):
 typeof value==='number'?String(id(value)):`'${String(value).replaceAll("'","''")}'`;
function id(value){assert.ok(Number.isSafeInteger(value)&&value>0,'Positive safe integer required');return value;}
function admit(input){
 const {actor,model,missingBrandingId}=input;assert.ok(NAMES.includes(actor.name));
 assert.match(actor.authUserId,uuid);assert.match(actor.sessionId,uuid);id(actor.profileId);id(missingBrandingId);
 assert.equal(model.branding.length,5);assert.equal(model.templates.length,1113);
 for(const rows of [model.branding,model.templates,model.roles,model.companies]){
  assert.equal(new Set(rows.map(r=>id(r.id))).size,rows.length);
 }
 assert.ok(!model.branding.some(p=>p.id===missingBrandingId));
 for(const t of model.templates){assert.match(t.template_code,/^F00F06_TEMPLATE_20261016_/);assert.ok(t.branding_profile_id===null||model.branding.some(p=>p.id===t.branding_profile_id));}
 assert.ok(model.roles.every(r=>r.is_system_role===false&&/^F00F06_TEMPLATE_20261016_[A-Z0-9_]+$/.test(r.role_code)));
 for(const assignments of Object.values(model.assignments))for(const assignment of assignments){
  const role=model.roles.find(r=>r.id===id(assignment.roleId));
  assert.ok(role&&role.role_code===assignment.roleCode,'Assignment must match the exact admitted synthetic role');
  assert.match(assignment.roleCode,/^F00F06_TEMPLATE_20261016_[A-Z0-9_]+$/);
  assert.ok(assignment.ownerCompanyId===null||model.companies.some(c=>c.id===id(assignment.ownerCompanyId)));
  if(assignment.branchId!==null)id(assignment.branchId);
 }
 let claims;try{claims=JSON.parse(Buffer.from(actor.bearer.split('.')[1],'base64url').toString());}catch{throw Error('Genuine verified actor bearer required');}
 assert.equal(claims.role,'authenticated');assert.equal(claims.sub,actor.authUserId);assert.equal(claims.session_id,actor.sessionId);
 assert.ok(Number.isSafeInteger(claims.exp)&&claims.exp>0);
 // Use exact decoded claims from the independently verified bearer, never an
 // invented user/session/role. This module cannot prove its signature itself.
 return {actor,model,missingBrandingId,claims};
}
function identitySql(value){return `SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = ${q(JSON.stringify(value.claims))};
DO $caller$ BEGIN IF current_user<>'authenticated' OR auth.uid() IS DISTINCT FROM ${q(value.actor.authUserId)}::uuid
 OR (auth.jwt()->>'session_id') IS DISTINCT FROM ${q(value.actor.sessionId)} THEN RAISE EXCEPTION 'Differential caller identity changed'; END IF; END $caller$;`;}
function observationQuery(input){
 const {actor,model,missingBrandingId}=admit(input);
 const probes=[...model.branding.map(p=>p.id),null,missingBrandingId];
 const templates=model.templates.map(t=>`(${t.id},${q(t.branding_profile_id)}::bigint,${q(t.deleted_at!==null)},${q(t.is_active)},${q(t.governance_status)})`).join(',');
 const brands=model.branding.map(p=>`(${p.id},${q(p.is_active)})`).join(',');
 return `WITH probes(id) AS (VALUES ${probes.map(v=>`(${q(v)}::bigint)`).join(',')}),
 old_truth AS MATERIALIZED (SELECT id,erp_private.can_read_report_template_branding(id) IS TRUE AS permitted FROM probes),
 new_ids AS MATERIALIZED (SELECT id FROM erp_private.readable_report_template_branding_ids() allowed(id)),
 model(id,branding_id,deleted,active,governance) AS (VALUES ${templates}),
 brands(id,active) AS (VALUES ${brands}),
 expected AS MATERIALIZED (SELECT m.id,(m.active AND (m.branding_id IS NULL OR b.active)) AS selectable,m.governance
   FROM model m JOIN old_truth truth ON truth.id IS NOT DISTINCT FROM m.branding_id
   LEFT JOIN brands b ON b.id=m.branding_id WHERE NOT m.deleted AND truth.permitted),
 table_ids AS MATERIALIZED (SELECT t.id FROM public.erp_report_templates t WHERE t.id IN(SELECT id FROM model)),
 view_rows AS MATERIALIZED (SELECT v.id,v.selectable,v.governance_status FROM public.perf_report_template_selection v WHERE v.id IN(SELECT id FROM model))
SELECT jsonb_build_object('actor',${q(actor.name)},'probeCount',(SELECT count(*) FROM old_truth),'modelCount',(SELECT count(*) FROM model),
 'principal',erp_private.business_principal_is_active(),
 'points',(SELECT jsonb_agg(jsonb_build_object('id',o.id,'old',o.permitted,'new',CASE WHEN o.id IS NULL
    THEN (SELECT erp_private.can_read_report_template_branding(NULL::bigint)) IS TRUE ELSE o.id IN(SELECT id FROM new_ids) END) ORDER BY o.id NULLS FIRST) FROM old_truth o),
 'authorizedBrandingIds',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) FROM new_ids WHERE id IN(SELECT id FROM probes)),
 'expectedIds',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) FROM expected),
 'actualTableIds',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) FROM table_ids),
 'actualViewIds',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) FROM view_rows),
 'expectedSelectableIds',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) FROM expected WHERE selectable),
 'actualSelectableIds',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) FROM view_rows WHERE selectable),
 'expectedLetterIds',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) FROM expected WHERE selectable AND governance IN('approved','published')),
 'actualLetterIds',(SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) FROM view_rows WHERE selectable AND governance_status IN('approved','published')));`;
}
function readOnlySql(input){const v=admit(input);return `BEGIN READ ONLY;\nSET LOCAL standard_conforming_strings=on;\nSET LOCAL statement_timeout='8s';\n${identitySql(v)}\n${observationQuery(input)}\nROLLBACK;`;}
function assertObservation(input,row,{baseline=true,denied=false}={}){
 const {actor,model}=admit(input);assert.equal(row.actor,actor.name);assert.equal(row.probeCount,7);assert.equal(row.modelCount,1113);
 const probes=[null,...model.branding.map(p=>p.id),input.missingBrandingId].sort((a,b)=>a===null?-1:b===null?1:a-b);
 assert.deepEqual(row.points.map(p=>p.id),probes);for(const p of row.points)assert.equal(p.new,p.old,`Old/new authority differs for ${p.id}`);
 assert.deepEqual(row.authorizedBrandingIds,row.points.filter(p=>p.id!==null&&p.old).map(p=>p.id));
 for(const actual of ['actualTableIds','actualViewIds'])assert.deepEqual(row[actual],row.expectedIds);
 assert.deepEqual(row.actualSelectableIds,row.expectedSelectableIds);assert.deepEqual(row.actualLetterIds,row.expectedLetterIds);
 if(baseline){
  assert.equal(row.principal,true,'A positive current session is mandatory even for no-role denial');
  if(['branchOnly','noRole'].includes(actor.name)){assert.deepEqual(row.expectedIds,[]);assert.deepEqual(row.authorizedBrandingIds,[]);}
  else{assert.ok(row.expectedIds.length>1000,'Positive baseline prevents vacuous denial');
   assert.deepEqual([...row.actualSelectableIds].sort((a,b)=>a-b),[...model.expected[actor.name].reportCenterIds].sort((a,b)=>a-b));
   assert.deepEqual([...row.actualLetterIds].sort((a,b)=>a-b),[...model.expected[actor.name].employeeLetterIds].sort((a,b)=>a-b));}
 }
 if(denied){assert.deepEqual(row.expectedIds,[]);assert.deepEqual(row.authorizedBrandingIds,[]);}
 return row;
}
function stateMutation(input,state){
 const {actor,model}=admit(input);assert.equal(actor.name,'scoped','State witnesses require the positive company-scoped actor');
 assert.ok(STATES.includes(state));
 const assignment=model.assignments.scoped;assert.equal(assignment.length,1);
 const roleId=id(assignment[0].roleId),companyId=id(assignment[0].ownerCompanyId),foreignId=id(model.companies.find(c=>c.id!==companyId).id);
 const brandingId=id(model.branding.find(p=>p.owner_company_id===companyId&&p.is_active&&p.deleted_at===null).id);
 const active=`DO $state_preimage$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'State witness requires reviewed coordinator role'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=${actor.profileId} AND auth_user_id=${q(actor.authUserId)}::uuid AND status='active' AND must_change_password=false)
 OR (SELECT count(*) FROM public.user_roles WHERE user_profile_id=${actor.profileId})<>1
 OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_profile_id=${actor.profileId} AND role_id=${roleId} AND owner_company_id=${companyId} AND branch_id IS NULL AND is_active)
 OR NOT EXISTS(SELECT 1 FROM public.roles WHERE id=${roleId} AND role_code=${q(assignment[0].roleCode)} AND NOT is_system_role AND is_active)
 OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=${q(actor.sessionId)}::uuid AND user_id=${q(actor.authUserId)}::uuid AND (not_after IS NULL OR not_after>now()))
 THEN RAISE EXCEPTION 'State witness exact positive actor preimage changed'; END IF;
 END $state_preimage$;`;
 const mutations={
  'inactive-profile':`UPDATE public.user_profiles SET status='inactive' WHERE id=${actor.profileId};`,
  'password-required':`UPDATE public.user_profiles SET must_change_password=true WHERE id=${actor.profileId};`,
  'revoked-session':`UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=${q(actor.sessionId)}::uuid AND user_id=${q(actor.authUserId)}::uuid;`,
  'inactive-assignment':`UPDATE public.user_roles SET is_active=false WHERE user_profile_id=${actor.profileId} AND role_id=${roleId};`,
  'inactive-role':`UPDATE public.roles SET is_active=false WHERE id=${roleId};`,
  'inactive-permission':`UPDATE public.permissions SET is_active=false WHERE permission_code='reports.view' AND id IN(SELECT permission_id FROM public.role_permissions WHERE role_id=${roleId});`,
  'scope-moved':`UPDATE public.user_roles SET owner_company_id=${foreignId} WHERE user_profile_id=${actor.profileId} AND role_id=${roleId};`,
  'inactive-branding':`UPDATE public.erp_report_branding_profiles SET is_active=false WHERE id=${brandingId};`,
  'deleted-branding':`UPDATE public.erp_report_branding_profiles SET deleted_at=now() WHERE id=${brandingId};`
 };
 if(state==='inactive-company'){
  const branches=model.branches.filter(b=>b.owner_company_id===companyId);assert.equal(branches.length,2);
  const branchIds=branches.map(b=>id(b.id));assert.equal(new Set(branchIds).size,2);assert.ok(branches.every(b=>b.status==='active'));
  return active+`\nDO $company_state$ DECLARE affected integer; BEGIN
   IF (SELECT count(*) FROM public.branches WHERE owner_company_id=${companyId})<>2
    OR (SELECT count(*) FROM public.branches WHERE owner_company_id=${companyId} AND id IN(${branchIds.join(',')}) AND status='active')<>2
    OR NOT EXISTS(SELECT 1 FROM public.owner_companies WHERE id=${companyId} AND status='active')
    OR EXISTS(SELECT 1 FROM public.cost_centers WHERE owner_company_id=${companyId} AND is_active)
    OR EXISTS(SELECT 1 FROM public.profit_centers WHERE owner_company_id=${companyId} AND is_active) THEN
      RAISE EXCEPTION 'Company witness requires exactly two tracked active branches and no finance dependencies'; END IF;
   UPDATE public.branches SET status='inactive' WHERE owner_company_id=${companyId} AND id IN(${branchIds.join(',')}) AND status='active';
   GET DIAGNOSTICS affected=ROW_COUNT; IF affected<>2 THEN RAISE EXCEPTION 'Company witness must retire exactly two tracked branches'; END IF;
   UPDATE public.owner_companies SET status='inactive' WHERE id=${companyId} AND status='active';
   GET DIAGNOSTICS affected=ROW_COUNT; IF affected<>1 THEN RAISE EXCEPTION 'Company witness must retire exactly one tracked company'; END IF;
   END $company_state$;`;
 }
 // Explicitly authorized synthetic setup only: trusted postgres writes with no
 // claimed application actor, never a forged privileged JWT. stateSql restores
 // the original genuine authenticated claims before the measured observation.
 const trustedSetup=state==='password-required'?`\nSET LOCAL "request.jwt.claims" = '{}';`:'';
 return active+trustedSetup+`\nDO $state_mutation$ DECLARE affected integer; BEGIN ${mutations[state]} GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'State witness must change exactly one tracked row'; END IF; END $state_mutation$;`;
}
function stateSql(input,state){
 const v=admit(input);const mutated=structuredClone(input);
 if(state==='inactive-branding')mutated.model.branding.find(p=>p.owner_company_id===v.model.assignments.scoped[0].ownerCompanyId&&p.is_active&&p.deleted_at===null).is_active=false;
 return `BEGIN;\nSET LOCAL standard_conforming_strings=on;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='8s';\n${identitySql(v)}\n${observationQuery(input)}
SET LOCAL ROLE postgres;\n${stateMutation(input,state)}
${identitySql(v)}\n${observationQuery(mutated)}\nROLLBACK;`;
}
function assertStateTransition(input,state,before,after){
 assert.ok(STATES.includes(state));assertObservation(input,before);
 const mutated=structuredClone(input);if(state==='inactive-branding')mutated.model.branding.find(p=>p.owner_company_id===input.model.assignments.scoped[0].ownerCompanyId&&p.is_active&&p.deleted_at===null).is_active=false;
 assertObservation(mutated,after,{baseline:false,denied:!['scope-moved','inactive-branding','deleted-branding'].includes(state)});
 if(['inactive-profile','password-required','revoked-session'].includes(state))assert.equal(after.principal,false);
 if(state==='inactive-branding'){assert.deepEqual(after.actualViewIds,before.actualViewIds);assert.ok(after.actualSelectableIds.length<before.actualSelectableIds.length);}
 else assert.notDeepEqual(after.actualViewIds,before.actualViewIds,'Next statement must recompute changed authority');
 return after;
}
const REJECTIONS=Object.freeze([
 {id:'replay',mutation:'',replay:true,error:'Template branding set already exists; reconcile migration history'},
 {id:'wrong-owner',mutation:'SET LOCAL ROLE authenticated;',error:'Template branding set requires reviewed postgres/PG17 context'},
 {id:'changed-point',mutation:`CREATE OR REPLACE FUNCTION erp_private.can_read_report_template_branding(profile_id bigint)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS 'SELECT true;';`,error:'Template branding authority preimage changed: erp_private.can_read_report_template_branding(bigint)'},
 {id:'broad-policy',mutation:'ALTER POLICY rpt_templates_select ON public.erp_report_templates USING(true);',error:'Template branding exact template policy preimage changed'},
 {id:'missing-principal',mutation:'DROP POLICY f03_principal ON public.erp_report_templates;',error:'Template branding exact template policy preimage changed'},
 {id:'disabled-rls',mutation:'ALTER TABLE public.erp_report_templates DISABLE ROW LEVEL SECURITY;',error:'Template branding relation preimage changed: erp_report_templates'},
 {id:'raw-table-grant',mutation:'GRANT SELECT ON public.erp_report_branding_profiles TO authenticated;',error:'Template branding relation preimage changed: erp_report_branding_profiles'},
 {id:'raw-column-grant',mutation:'GRANT SELECT(signature_url) ON public.erp_report_branding_profiles TO authenticated;',error:'Template branding relation preimage changed: erp_report_branding_profiles'},
 {id:'selector-invoker',mutation:'ALTER VIEW public.perf_report_template_selection SET(security_invoker=false);',error:'Template branding relation preimage changed: perf_report_template_selection'},
 {id:'safe-barrier',mutation:'ALTER VIEW public.erp_report_branding_profiles_safe SET(security_barrier=false);',error:'Template branding relation preimage changed: erp_report_branding_profiles_safe'},
].map(Object.freeze));
function rollbackMigrationSql(source,expectedSha,rejection=null){
 const normalized=source.replace(/\r\n/g,'\n');assert.match(expectedSha,/^[0-9a-f]{64}$/);
 assert.equal(crypto.createHash('sha256').update(normalized).digest('hex'),expectedSha,'Only exact reviewed migration bytes are allowed');
 assert.ok(normalized.endsWith('COMMIT;\n'));assert.equal((normalized.match(/^BEGIN;$/gm)||[]).length,1);
 const body=normalized.replace(/^BEGIN;\n/m,'').slice(0,-'COMMIT;\n'.length);
 assert.doesNotMatch(body,/^\s*(?:COMMIT|BEGIN|END\s+TRANSACTION)\s*;/im);
 if(rejection!==null)assert.ok(REJECTIONS.includes(rejection),'Only fixed rejection mutations are allowed');
 return `BEGIN;\n${rejection?.replay?body:''}\n${rejection?.mutation??''}\n${body}\nROLLBACK;`;
}
module.exports={NAMES,STATES,REJECTIONS,admit,observationQuery,readOnlySql,assertObservation,stateMutation,stateSql,assertStateTransition,rollbackMigrationSql};
