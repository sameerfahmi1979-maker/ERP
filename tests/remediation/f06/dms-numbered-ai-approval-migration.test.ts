// Offline source-contract regression only; not evidence of SQL compilation or RLS acceptance.
import fs from 'node:fs';
import {expect,it} from 'vitest';
const sql=fs.readFileSync('supabase/migrations/20261004193518_f06_numbered_ai_intake_approval.sql','utf8');
const legacy=fs.readFileSync('supabase/migrations/20260922061949_f01_security_containment.sql','utf8');
function body(name:string){const match=sql.match(new RegExp(`create (?:or replace )?function ${name.replaceAll('.','\\.')}\\([\\s\\S]*?\\$\\$;`,'i'));if(!match)throw Error(name);return match[0];}
it('duplicate-child checks qualify element columns independently of the PL/pgSQL loop variable',()=>{const validate=body('erp_private.validate_ai_approval_request');expect(validate.match(/child\(value\) group by child\.value/g)).toHaveLength(3);expect(validate).not.toContain(') v group by v');});
it.each(['prepare_numbered_ai_intake','reserve_numbered_ai_intake','finish_numbered_ai_intake'])('%s keeps caller RLS and denies service/anonymous execution',name=>{expect(body('public.'+name)).toMatch(/security invoker/);expect(sql).toMatch(new RegExp(`revoke all on function public.${name}[^;]+from public,anon,service_role;`));});
it('stage one never inserts a document, binds document_id, or consumes the reservation',()=>{const reserve=body('public.reserve_numbered_ai_intake'),plan=body('erp_private.ai_approval_plan');expect(reserve).not.toMatch(/insert into public.dms_documents|set document_id|finish_numbering_reservation/);expect(plan).not.toMatch(/insert into public.dms_documents|update public.dms_documents/);expect(reserve).toContain("'reserved','dms_documents',null");expect(plan).toContain("nextval(pg_get_serial_sequence('public.dms_documents','id'))");});
it('separates source lock wait from current caller-visible read',()=>{expect(body('public.reserve_numbered_ai_intake')).toMatch(/perform id from public.dms_upload_sessions[^;]+for update;\s*perform id from public.dms_upload_sessions[^;]+for update;/);});
it('actor/operation/request/source identity is protected and SHA256-bound',()=>{expect(sql).toContain('primary key(actor_id,operation_id)');expect(sql).toContain('upload_session_id bigint not null unique');expect(sql).toContain("'F06 AI approval '||encode(sha256(convert_to(p_request::text,'UTF8')),'hex')");expect(sql.match(/md5\(/gi)).toHaveLength(1);expect(body('erp_private.ai_approval_plan')).toContain('h text:=encode(sha256');});
it('direct plan bookkeeping binds the exact allocator tuple and authoritative DMS rule',()=>{const plan=body('erp_private.ai_approval_plan');expect(plan).toContain('join public.global_numbering_rules rule on rule.id=r.numbering_rule_id');expect(plan).toContain("g.rule_code is distinct from 'MASTER_DMS_DOCUMENT'");expect(plan).toContain("g.allocation_hash is distinct from md5(jsonb_build_array(null::bigint,'MASTER_DMS_DOCUMENT'::text,null::text,");expect(plan).toContain("'reserved'::text,'dms_documents'::text,null::bigint,'F06 AI approval '||h)::text)");expect(plan).not.toMatch(/current_setting|set_config/);});
it('direct private plan and final invoker finish validate current snapshot before mutation',()=>{const plan=body('erp_private.ai_approval_plan'),finish=body('public.finish_numbered_ai_intake');expect(plan.indexOf('current_snapshot:=erp_private.ai_approval_snapshot')).toBeLessThan(plan.indexOf('insert into erp_private.ai_approval_plans'));expect(plan).toContain("(p_request->'prepared')-array['content_sha256','storage_year'] is distinct from current_snapshot-'storage_year'");expect(finish.indexOf('erp_private.ai_approval_snapshot')).toBeLessThan(finish.indexOf('insert into public.dms_documents'));});
it('parenthesizes extracted JSON before key subtraction in every validation/snapshot comparison',()=>{expect(sql).not.toContain("p_request->'prepared'-array");expect(sql.match(/\(p_request->'prepared'\)-array/g)).toHaveLength(5);});
it('source pinned authority remains independent from the selected destination',()=>{const authority=body('erp_private.assert_ai_approval_authority');for(const code of ['dms.documents.upload','dms.documents.preview','dms.documents.review_ai'])expect(authority).toContain(`permission_in_scope('${code}',s.owning_company_id,s.owning_branch_id)`);expect(authority).toContain("permission_in_scope('dms.documents.upload',company,branch)");expect(sql).toContain("owner_company_id=(p_request->>'owningCompanyId')::bigint");});
it('the narrow destination helper has an explicit private owner and execution boundary',()=>{
 const name='erp_private.ai_approval_destination_snapshot',destination=body(name);
 expect(destination).toContain("security definer set search_path=''");
 expect(sql).toContain(`alter function ${name}(jsonb) owner to postgres;`);
 expect(sql).toContain(`revoke all on function ${name}(jsonb) from public,anon,service_role;`);
 expect(sql).toContain(`grant execute on function ${name}(jsonb) to authenticated;`);
 expect(destination).not.toMatch(/current_setting|set_config|request\.jwt|auth\.jwt|execute\s+format/i);
});
it('direct destination calls validate and recheck full current authority around privileged reads',()=>{
 const destination=body('erp_private.ai_approval_destination_snapshot');
 const validate=destination.indexOf('perform erp_private.validate_ai_approval_request(p_request,false);');
 const checks=[...destination.matchAll(/perform erp_private\.assert_ai_approval_authority\(p_request\);/g)].map(match=>match.index!);
 expect(validate).toBeGreaterThan(-1);expect(checks).toHaveLength(2);
 expect(validate).toBeLessThan(checks[0]);
 expect(checks[0]).toBeLessThan(destination.indexOf('from public.owner_companies'));
 expect(checks[1]).toBeGreaterThan(destination.indexOf('from public.branches'));
 expect(checks[1]).toBeLessThan(destination.indexOf("return jsonb_build_object('company',company,'branch',branch)"));
});
it('destination admission is not a source-row or bound-document permission bypass',()=>{
 const authority=body('erp_private.assert_ai_approval_authority');
 expect(authority).toContain('auth.uid() is null or not erp_private.business_principal_is_active()');
 expect(authority).toContain("public.current_user_has_permission('numbering.rules.generate')");
 expect(authority).toContain('not erp_private.upload_row_allowed(s.uploaded_by,s.owning_company_id,s.owning_branch_id,null)');
 expect(authority).toContain('not erp_private.upload_session_allowed(s.id)');
 for(const code of ['upload','edit','preview'])expect(authority).toContain(`permission_in_scope('dms.documents.${code}',company,branch)`);
 expect(authority).toContain("permission_in_scope('dms.documents.view',company,branch) or erp_private.permission_in_scope('dms.admin',company,branch)");
 expect(authority).toContain("permission_in_scope('dms.documents.view.'||confidentiality,company,branch)");
 for(const code of ['upload','edit','preview','review_ai'])expect(authority).toContain(`public.f03_has_document_permission(s.document_id,'dms.documents.${code}')`);
 expect(authority).not.toMatch(/organizations\.(view|manage)|branches\.(view|manage)/);
});
it('destination output contains only the exact selected active identity and revision fields',()=>{
 const destination=body('erp_private.ai_approval_destination_snapshot');
 const projections=[...destination.matchAll(/select jsonb_build_object\(([^;]+?)\) into (company|branch)/g)]
  .map(match=>({target:match[2],keys:[...match[1].matchAll(/'([^']+)'/g)].map(key=>key[1])}));
 expect(projections).toEqual([
  {target:'company',keys:['id','status','workspace_revision']},
  {target:'branch',keys:['id','owner_company_id','status','workspace_revision']},
 ]);
 expect(destination).toContain("where c.id=(p_request->>'owningCompanyId')::bigint and c.status='active'");
 expect(destination).toContain("where b.id=(p_request->>'owningBranchId')::bigint and b.status='active' and b.owner_company_id=(p_request->>'owningCompanyId')::bigint");
 expect(destination).toContain("if company is null then raise exception 'Destination company unavailable'");
 expect(destination).toContain("if branch is null then raise exception 'Destination branch unavailable'");
 expect(destination).not.toMatch(/select\s+\*|to_jsonb\(|dms_upload_sessions|temp_storage_path|sha256_hash|legal_name|address|bank|contact/i);
});
it('destination snapshots cannot allocate, lock, mutate, or swallow a failed authority check',()=>{
 const destination=body('erp_private.ai_approval_destination_snapshot');
 expect(destination).not.toMatch(/\b(?:insert|update|delete|merge|truncate|nextval)\b|allocate_numbering|finish_numbering|for\s+(?:share|update)|exception\s+when/i);
 expect(body('erp_private.validate_ai_approval_request')).toContain("(p_request->>'owningBranchId' is not null and p_request->>'owningCompanyId' is null)");
});
it('caller-visible source and child reads remain invoker and hash the narrow destination result',()=>{
 const snapshot=body('erp_private.ai_approval_snapshot'),links=body('erp_private.ai_approval_link_target');
 expect(snapshot).toContain('security invoker');expect(links).toContain('security invoker');
 expect(snapshot).toContain('context:=erp_private.ai_approval_destination_snapshot(p_request)||');
 expect(snapshot).toContain("'context_fingerprint',encode(sha256(convert_to(context::text,'UTF8')),'hex')");
 expect(snapshot).not.toMatch(/from public\.(?:owner_companies|branches)\b/);
 expect(links).toContain("('company','owner_companies','status=''active''')");
 expect(links).toContain("execute format('select to_jsonb(t) from public.%I t where id=$1 and %s',target,predicate) into value using p_id;");
 expect(snapshot).toContain("erp_private.ai_approval_link_target(item->>'entityType',(item->>'entityId')::bigint)");
});
it('service attestation proves content/object identity without JWT impersonation or business writes',()=>{const proof=body('public.attest_numbered_ai_intake');expect(proof).toContain("auth.role() is distinct from 'service_role'");expect(proof).toContain('provider_actor_session_valid');expect(proof).toContain('plan.storage_path');expect(proof).toContain("date_trunc('milliseconds',o.updated_at)");expect(proof).toContain('p_version,o.updated_at,p_sha256');expect(proof).not.toMatch(/set_config|request.jwt|insert into public\.|update public\.|finish_numbering|allocate_numbering/);});
it.each(['ai_approval_plans','ai_approval_verified_copies'])('private %s owner and ACL do not depend on migration executor',name=>{expect(sql).toContain(`alter table erp_private.${name} owner to postgres;`);expect(sql).toContain(`alter table erp_private.${name} enable row level security;`);expect(sql).toContain(`revoke all on erp_private.${name} from public,anon,authenticated,service_role;`);});
it('completion cannot be manufactured from source status alone',()=>{const complete=body('erp_private.complete_ai_approval');for(const table of ['dms_documents','dms_document_files','dms_document_versions','dms_document_metadata_values','dms_document_tags','dms_document_links','dms_expiry_reminders','dms_ai_extraction_results','dms_upload_sessions','dms_approve_runs','global_numbering_generated_references','dms_document_events','audit_logs'])expect(complete).toContain(`public.${table}`);expect(complete).toContain('actual is distinct from expected');expect(complete).toContain('actual is distinct from metadata');});
it('mandatory children fail the transaction and final authority follows audit waits',()=>{const finish=body('public.finish_numbered_ai_intake');expect(finish).not.toMatch(/exception when|on conflict.*do nothing/i);for(const table of ['dms_document_metadata_values','dms_document_tags','dms_document_links','dms_expiry_reminders'])expect(finish).toContain(`insert into public.${table}`);expect(finish.lastIndexOf('assert_ai_approval_authority')).toBeGreaterThan(finish.indexOf('insert into public.audit_logs'));expect(finish).toContain('return erp_private.complete_ai_approval');});
it('the existing legacy function differs only by explicit single-file rejection',()=>{const pattern=/CREATE OR REPLACE FUNCTION public\.approve_dms_ai_intake\(p_payload jsonb\)[\s\S]*?\$function\$[\s\S]*?\$function\$;/;const old=legacy.match(pattern)?.[0].replaceAll('\r\n','\n');const current=sql.match(pattern)?.[0].replaceAll('\r\n','\n').replace(/  -- F06: only the retained batch-draft path[\s\S]*?  END IF;\n/,'');expect(current).toBe(old);expect(sql).toContain("IF v_mode IS DISTINCT FROM 'existing_batch_draft' THEN");});
it('no policy, generic allocator, batch consumer, or upload69 rewrite is introduced',()=>{const beforeLegacy=sql.slice(0,sql.indexOf('CREATE OR REPLACE FUNCTION public.approve_dms_ai_intake'));expect(beforeLegacy).not.toMatch(/(?:create|alter|drop) policy|create or replace function public\.(?:allocate_numbering|create_numbered_dms_batch|finish_numbered_dms_upload)/i);});
