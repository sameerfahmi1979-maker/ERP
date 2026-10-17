import fs from 'node:fs';
import {expect,it} from 'vitest';
const sql=fs.readFileSync('supabase/migrations/20261004181125_f06_numbered_batch_draft_consumer.sql','utf8');
const preparation=sql.slice(sql.indexOf('create function erp_private.batch_draft_snapshot'),sql.indexOf('create function public.prepare_numbered'));
const writer=sql.slice(sql.indexOf('create function public.create_numbered_dms_batch_draft'));
const locks=sql.slice(sql.indexOf('create function erp_private.lock_batch_draft_context'),sql.indexOf('create function public.create_numbered_dms_batch_draft'));
it('preparation is read-only and never allocates',()=>{expect(preparation).toContain('security invoker');expect(preparation).not.toMatch(/\b(insert into|update public\.|delete from|allocate_numbering_reference|for update|for share)\b/i);});
it('only row-lock context helper is elevated, with no business write or rowdata return',()=>{expect(locks).toContain('returns void');expect(locks).toContain('security definer');expect(locks).not.toMatch(/\b(insert into|update public\.|delete from)\b/i);expect(locks.indexOf('public.dms_upload_batches')).toBeLessThan(locks.indexOf('public.parties'));expect(locks.match(/upload_session_permission/g)).toHaveLength(2);});
it('writer remains invoker and no RLS/grant bypass is installed',()=>{expect(writer).toContain('security invoker');expect(sql).not.toMatch(/create policy|disable row|grant (insert|update|select|all)|lock table/i);expect(sql.match(/alter policy/gi)).toHaveLength(4);expect(sql).not.toContain('md5(');});
it('review policies preserve exact F01 conditions and only scope the existing action checks',()=>{
 const foundation=fs.readFileSync('supabase/migrations/20260922061949_f01_security_containment.sql','utf8');
 const normalize=(value:string)=>value.replace(/\s+/g,' ').trim().toLowerCase();
 for(const action of ['select','insert','update','delete']){
  const old=foundation.match(new RegExp(`CREATE POLICY f01_intake_${action} ON public\\.dms_intake_review_values FOR ${action} TO authenticated ([^;]+);`,'i'))?.[1];
  const current=sql.match(new RegExp(`alter policy f01_intake_${action} on public\\.dms_intake_review_values ([^;]+);`,'i'))?.[1];
  expect(old).toBeDefined();expect(current).toBeDefined();
  const expected=old!.replace(/public\.current_user_has_permission\('([^']+)'\)/g,"erp_private.upload_session_permission(s.id,'$1')");
  expect(normalize(current!)).toBe(normalize(expected));
 }
 const helper=fs.readFileSync('supabase/migrations/20260924114601_f03_intake_capability_scope.sql','utf8');
 expect(helper).toContain('erp_private.upload_row_allowed(s.uploaded_by,s.owning_company_id,s.owning_branch_id,s.document_id)');
 expect(helper).toContain('erp_private.permission_in_scope($2,s.owning_company_id,s.owning_branch_id)');
 expect(helper).toContain('erp_private.document_permission(s.document_id,$2)');
});
it('locks source before allocator and rechecks full projection after taxonomy lock',()=>{expect(writer.indexOf('for update')).toBeLessThan(writer.indexOf('allocate_numbering_reference'));expect(writer.indexOf('lock_dms_creation_taxonomy')).toBeLessThan(writer.lastIndexOf('batch_draft_snapshot'));expect(writer).toContain("encode(sha256(convert_to(p_request::text,'UTF8')),'hex')");expect(preparation).toContain('select r.* into a');expect(preparation).toContain('to_jsonb(a)');});
it('atomic unit includes intended children, completion, event, audit and final admission',()=>{for(const fragment of ['insert into public.dms_documents','update public.dms_upload_sessions','update public.dms_ai_extraction_results','insert into public.dms_intake_review_values','insert into public.dms_document_events','finish_numbering_reservation','insert into public.audit_logs'])expect(writer).toContain(fragment);expect(writer.lastIndexOf('business_principal_is_active')).toBeGreaterThan(writer.indexOf('insert into public.audit_logs'));expect(writer).not.toMatch(/returning\s+id/i);expect(writer).not.toContain('exception when');});
it('scope and original request bind replay; no source/provider/storage work in SQL',()=>{expect(writer).toContain('created_by=actor');expect(writer).toContain('s.document_id is distinct from draft_id');expect(writer).toContain('actor,s.owning_company_id,s.owning_branch_id');expect(sql).not.toMatch(/storage\.|http\(|net\.|create_dms_document|generate_document_number/);});
it('only authenticated executes every public entry and context helper',()=>{for(const fn of ['prepare_numbered_dms_batch_draft(bigint)','create_numbered_dms_batch_draft(uuid,jsonb)']){expect(sql).toContain(`revoke all on function public.${fn} from public,anon,service_role`);expect(sql).toContain(`grant execute on function public.${fn} to authenticated`);}});
it('feature admission exposes only the one gated boolean, not settings privileges',()=>{const flag=sql.slice(sql.indexOf('create function erp_private.batch_draft_enabled'),sql.indexOf('-- A projection only'));expect(flag).toContain('returns boolean');expect(flag).toContain('security definer');expect(flag).toContain('business_principal_is_active');expect(flag).toContain("upload_session_permission(p_session,'dms.documents.upload')");expect(flag).toContain("current_user_has_permission('numbering.rules.generate')");expect(flag).toContain("feature_code='DMS_BATCH_INTAKE'");expect(flag).not.toMatch(/\b(insert into|update public\.|delete from)\b/i);expect(preparation).not.toContain('public.erp_ai_feature_flags');});
it('review-field save does not invent a missing natural-key unique constraint',()=>{
 const foundation=fs.readFileSync('supabase/migrations/20260615040000_erp_dms_11_ai_first_intake.sql','utf8');
 const table=foundation.slice(foundation.indexOf('CREATE TABLE IF NOT EXISTS public.dms_intake_review_values'),foundation.indexOf('ALTER TABLE public.dms_intake_review_values'));
 expect(table).toContain('PRIMARY KEY');expect(table).not.toMatch(/\bunique\b/i);
 const fields=writer.slice(writer.indexOf('for item in select * from jsonb_each'),writer.indexOf('insert into public.dms_document_events'));
 expect(fields).not.toMatch(/on conflict/i);expect(fields).toContain('update public.dms_intake_review_values');expect(fields).toContain('get diagnostics affected=row_count');expect(fields).toContain("if affected>1 then raise exception 'Ambiguous existing document review field' using errcode='PT409'");expect(fields).toContain('if affected=0 then');expect(fields.indexOf('update public.dms_intake_review_values')).toBeLessThan(fields.indexOf('insert into public.dms_intake_review_values'));
 expect(sql).not.toMatch(/create unique index|add constraint/i);
});
it('source row-lock wait and receipt projection use separate invoker statements',()=>{
 const lock=writer.indexOf('perform 1 from public.dms_upload_sessions where id=session_id and deleted_at is null for update;');
 const read=writer.indexOf('select id,document_id,owning_company_id,owning_branch_id into s');
 expect(lock).toBeGreaterThan(0);expect(read).toBeGreaterThan(lock);expect(writer.indexOf('allocate_numbering_reference')).toBeGreaterThan(read);
 expect(writer.slice(lock,read)).toContain('for update;');expect(writer.slice(read,writer.indexOf('allocation:='))).toContain('for update;');
 expect(writer.indexOf("if allocation->>'generation_status'='consumed'")).toBeLessThan(writer.indexOf('current_snapshot:='));
});
it('late independent review and preview plus bound-result RLS revalidate after audit',()=>{
 const final=writer.slice(writer.lastIndexOf('if public.current_user_profile_id()'));
 expect(writer.lastIndexOf('if public.current_user_profile_id()')).toBeGreaterThan(writer.indexOf('insert into public.audit_logs'));
 expect(final).toContain("f03_has_document_permission(draft_id,'dms.documents.review_ai')");expect(final).toContain("f03_has_document_permission(draft_id,'dms.documents.preview')");
 expect(final).toContain('from public.dms_ai_extraction_results a');expect(final).toContain('a.upload_session_id=session_id and a.document_id=draft_id');
});

// W23 is a separate forward contract. These are source checks, NOT native RLS,
// snapshot, trigger-order or lock-wait proof; all historical assertions above stay.
import {createHash} from 'node:crypto';
const durable=fs.readFileSync('supabase/migrations/20261005153627_f06_durable_batch_draft_recovery.sql','utf8');
const durableFunction=(name:string)=>{
 const expression=new RegExp(`create(?: or replace)? function ${name.replaceAll('.','\\.')}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,'i');
 const match=durable.match(expression);expect(match,`missing ${name}`).not.toBeNull();return match?.[0]??'';
};
const durableAt=(value:string,token:string)=>{const index=value.indexOf(token);expect(index,`missing ${token}`).toBeGreaterThanOrEqual(0);return index;};
const durableBetween=(value:string,first:string,last:string)=>{const start=durableAt(value,first),end=durableAt(value,last);expect(end).toBeGreaterThan(start);return value.slice(start,end);};
it('W23 preserves historical SQL bytes and stays one bounded forward transaction',()=>{
 for(const [file,pin] of [['20261004181125_f06_numbered_batch_draft_consumer.sql','336d620ed4354ee56cac99b3dc49f862201c43239bf6bd41932a52fa26d90c6a'],['20261005083645_f06_atomic_batch_admission.sql','41df2415cb2aedb063d16aed60eeefa335dcaa094fcfc74fa618da4218eee956']])expect(createHash('sha256').update(fs.readFileSync(`supabase/migrations/${file}`)).digest('hex')).toBe(pin);
 expect(durable.trim().startsWith('begin;')).toBe(true);expect(durable.trim().endsWith('commit;')).toBe(true);
 expect(durable).toContain("set local lock_timeout='5s';");expect(durable).toContain("set local statement_timeout='60s';");
 expect(durable).toContain("notify pgrst,'reload schema';");
 expect(durable).not.toMatch(/alter default privileges|set (?:local )?transaction|create schema|grant .*schema|drop (?:table|function|trigger|policy)/i);
});
it.each([['erp_private.batch_draft_preparation_guard','new.upload_session_id'],['public.prepare_recoverable_dms_batch_draft','p_session']])('W23 %s refuses a zero-row source lock before its fresh read', (name,session)=>{
 const body=durableFunction(name);
 expect(body).toContain(`perform 1 from public.dms_upload_sessions where id=${session} and deleted_at is null for update;\n if not found then raise exception 'Batch recovery unavailable' using errcode='42501';end if;`);
});
it('W23 adds a nullable immutable operation without rewriting old rows',()=>{
 expect(durable).toContain('add column batch_draft_operation_id uuid;');
 expect(durable).toContain('where batch_draft_operation_id is not null');
 expect(durable).toContain('create unique index f06_batch_draft_operation_unique on public.dms_upload_sessions(batch_draft_operation_id)\n where batch_draft_operation_id is not null;');
 expect(durable).not.toMatch(/update public\.dms_upload_sessions set batch_draft_operation_id|batch_draft_operation_id uuid default/i);
 const identity=durableFunction('erp_private.batch_identity_guard');
 expect(durableAt(identity,'new.batch_draft_operation_id is distinct from old.batch_draft_operation_id')).toBeLessThan(durableAt(identity,"if tg_op='UPDATE' and old.admission_position"));
 expect(identity).toContain('new.batch_draft_operation_id:=gen_random_uuid()');
 expect(identity).toContain("tg_op='INSERT' and new.batch_draft_operation_id is not null");
 expect(durableAt(identity,"tg_op='INSERT' and new.batch_draft_operation_id is not null")).toBeLessThan(durableAt(identity,'if b.admission_version is null then'));
 expect(durableAt(identity,"if not erp_private.business_principal_is_active()")).toBeLessThan(durableAt(identity,'new.batch_draft_operation_id:=gen_random_uuid()'));
});
it('W23 requires generated markers only on newly inserted graphs',()=>{
 const graph=durableFunction('erp_private.batch_graph_guard');
 expect(graph).toContain("tg_op='INSERT' and s.batch_draft_operation_id is null");
 expect(durable).not.toMatch(/drop trigger f03_upload_intake_scope|disable trigger|session_replication_role/i);
});
it('W23 seal history has four restrictive immediate FKs and no surrogate/default identities',()=>{
 const table=durableBetween(durable,'create table erp_private.dms_batch_draft_preparations','alter table erp_private.dms_batch_draft_preparations owner');
 expect(table.match(/on update restrict on delete restrict not deferrable/gi)).toHaveLength(4);
 for(const target of ['public.dms_upload_sessions','auth.users','public.user_profiles','public.dms_upload_batches'])expect(table).toContain(`references ${target}(id)`);
 expect(table).toContain('draft_operation_id uuid not null unique');expect(table).toContain('request_json jsonb not null');
 expect(table).not.toMatch(/\b(default|serial|identity|sequence)\b/i);
 expect(table.split('\n').filter(line=>/^ [a-z_]+ (?:bigint|uuid|text|integer|jsonb|timestamptz)\b/.test(line)).map(line=>line.trim().split(' ')[0])).toEqual(['upload_session_id','draft_operation_id','auth_user_id','profile_id','batch_id','admission_operation_id','admission_fingerprint','admission_position','request_json','created_at']);
 expect(durableBetween(table,'create table erp_private.dms_batch_draft_preparations (',' constraint f06_batch_preparation_shape')).toBe(`create table erp_private.dms_batch_draft_preparations (
 upload_session_id bigint primary key references public.dms_upload_sessions(id) on update restrict on delete restrict not deferrable,
 draft_operation_id uuid not null unique,
 auth_user_id uuid not null references auth.users(id) on update restrict on delete restrict not deferrable,
 profile_id bigint not null references public.user_profiles(id) on update restrict on delete restrict not deferrable,
 batch_id bigint not null references public.dms_upload_batches(id) on update restrict on delete restrict not deferrable,
 admission_operation_id uuid not null,
 admission_fingerprint text not null,
 admission_position integer not null,
 request_json jsonb not null,
 created_at timestamptz not null,
`);
 for(const shape of ['9007199254740991','admission_position between 0 and 9',"admission_fingerprint ~ '^[0-9a-f]{64}$'","request_json->'allowDuplicate'='false'::jsonb","request_json-array['uploadSessionId','allowDuplicate','prepared']='{}'::jsonb",') is true)'])expect(table).toContain(shape);
});
it('W23 contains the only approved one-bit definer exception',()=>{
 const helper=durableFunction('erp_private.batch_draft_preparation_exists');
 expect(helper).toContain("returns boolean language plpgsql stable security definer set search_path=''");
 for(const token of ['business_principal_is_active','current_user_profile_id','admission_auth_user_id','uploaded_by',"current_user_has_permission('numbering.rules.generate')","upload_session_permission(p_session,'dms.documents.upload')","current_setting('transaction_isolation')<>'read committed'"])expect(helper).toContain(token);
 expect(helper).toContain('return exists(select 1 from erp_private.dms_batch_draft_preparations');
 expect(helper).not.toMatch(/request_json|batch_source\(|read_dms_upload_batch_admission|\b(insert into|update public\.|delete from|execute )\b/i);
 expect(durable).toContain('alter function erp_private.batch_draft_preparation_exists(bigint) owner to postgres;');
 const initial=durableBetween(helper,' if p_session is null',' select * into s');
 expect(initial).toContain("or auth.uid() is null or actor is null or not erp_private.business_principal_is_active()\n  or not public.current_user_has_permission('numbering.rules.generate')\n  or not erp_private.upload_session_permission(p_session,'dms.documents.upload') then");
 expect(helper.match(/return /g)).toHaveLength(1);
 expect(durableAt(helper,'b.admission_auth_user_id is distinct from auth.uid()')).toBeLessThan(durableAt(helper,'return exists('));
 const source=durableBetween(helper,' select * into s',' return exists(');
 expect(source).toContain('s.batch_draft_operation_id is null or s.uploaded_by is distinct from actor');
 expect(source).toContain('b.admission_version is distinct from 1 or b.admission_auth_user_id is distinct from auth.uid()');
 expect(source).toContain('or b.created_by is distinct from actor or b.admission_operation_id is null');
 expect(source).toContain('or b.owning_company_id is distinct from s.owning_company_id or b.owning_branch_id is distinct from s.owning_branch_id');
 expect(source).toContain('or not erp_private.batch_scope_allowed(actor,b.owning_company_id,b.owning_branch_id)');
 expect(source.match(/raise exception 'Batch recovery unavailable' using errcode='42501'/g)).toHaveLength(3);
});
it('W23 preparation policies use row values and stored confidentiality without recursive seal reads',()=>{
 const policies=durableBetween(durable,'create policy f06_batch_preparation_select','create function erp_private.batch_draft_preparation_guard');
 expect(policies).toContain('for select to authenticated using');expect(policies).toContain('for insert to authenticated with check');
 for(const token of ['auth_user_id=auth.uid()','profile_id=public.current_user_profile_id()',"request_json#>>'{prepared,confidentiality_level}'",'public.dms_ai_extraction_results','batch_draft_operation_id','admission_fingerprint'])expect(policies).toContain(token);
 expect(policies).not.toMatch(/from erp_private\.dms_batch_draft_preparations|security definer|for (update|delete)/i);
 const select=policies.match(/for select to authenticated using ([\s\S]*?);/)?.[1];
 const insert=policies.match(/for insert to authenticated with check ([\s\S]*?);/)?.[1];
 expect(select).toBeDefined();expect(insert).toBe(select);
 expect(select).toContain("and erp_private.business_principal_is_active()\n and public.current_user_has_permission('numbering.rules.generate')\n and erp_private.upload_session_permission(upload_session_id,'dms.documents.upload')");
 expect(select).toBe(`(
 current_setting('transaction_isolation')='read committed'
 and auth_user_id=auth.uid() and profile_id=public.current_user_profile_id()
 and erp_private.business_principal_is_active()
 and public.current_user_has_permission('numbering.rules.generate')
 and erp_private.upload_session_permission(upload_session_id,'dms.documents.upload')
 and exists (
  select 1 from public.dms_upload_sessions s join public.dms_upload_batches b on b.id=s.batch_id
  where s.id=dms_batch_draft_preparations.upload_session_id and s.deleted_at is null
   and s.batch_draft_operation_id=dms_batch_draft_preparations.draft_operation_id
   and s.uploaded_by=dms_batch_draft_preparations.profile_id
   and s.batch_id=dms_batch_draft_preparations.batch_id
   and s.admission_position=dms_batch_draft_preparations.admission_position
   and b.admission_version=1 and b.deleted_at is null
   and b.created_by=dms_batch_draft_preparations.profile_id
   and b.admission_auth_user_id=dms_batch_draft_preparations.auth_user_id
   and b.admission_operation_id=dms_batch_draft_preparations.admission_operation_id
   and b.admission_fingerprint=dms_batch_draft_preparations.admission_fingerprint
   and s.owning_company_id is not distinct from b.owning_company_id
   and s.owning_branch_id is not distinct from b.owning_branch_id
   and dms_batch_draft_preparations.request_json#>'{prepared,owning_company_id}'=coalesce(to_jsonb(s.owning_company_id),'null'::jsonb)
   and dms_batch_draft_preparations.request_json#>'{prepared,owning_branch_id}'=coalesce(to_jsonb(s.owning_branch_id),'null'::jsonb)
   and dms_batch_draft_preparations.request_json#>>'{prepared,session_code}'=s.session_code
   and dms_batch_draft_preparations.request_json#>'{prepared,party_id}'=coalesce(to_jsonb(b.entity_id),'null'::jsonb)
   and (b.entity_id is null or (b.entity_type='party' and exists(select 1 from public.parties p where p.id=b.entity_id)))
   and (erp_private.permission_in_scope('dms.documents.view',s.owning_company_id,s.owning_branch_id)
    or erp_private.permission_in_scope('dms.admin',s.owning_company_id,s.owning_branch_id))
   and (dms_batch_draft_preparations.request_json#>>'{prepared,confidentiality_level}' in ('internal','company')
    or (dms_batch_draft_preparations.request_json#>>'{prepared,confidentiality_level}' in ('hr','finance','legal','executive')
     and erp_private.permission_in_scope('dms.documents.view.'||(dms_batch_draft_preparations.request_json#>>'{prepared,confidentiality_level}'),s.owning_company_id,s.owning_branch_id)))
   and (s.document_id is null or public.f03_has_document_permission(s.document_id,'dms.documents.view'))
   and exists(select 1 from public.dms_ai_extraction_results a where a.id=s.ai_result_id
    and a.id=(dms_batch_draft_preparations.request_json#>>'{prepared,analysis_result_id}')::bigint
    and a.upload_session_id=s.id and a.document_id is not distinct from s.document_id)
 )
)`);
});
it('W23 guards direct insert after source lock and every transition row after immediate FK waits',()=>{
 const guard=durableFunction('erp_private.batch_draft_preparation_guard');
 expect(guard).toContain("returns trigger language plpgsql security invoker set search_path='' as $$");
 expect(guard).toContain("if tg_level='STATEMENT'");expect(guard).toContain("tg_when<>'AFTER'");
 expect(guard).toContain('from batch_draft_inserted');expect(guard).toContain('left join erp_private.dms_batch_draft_preparations');
 expect(guard).toContain("tg_op in ('UPDATE','DELETE')");expect(guard).toContain('new.request_json is not null');
 expect(durableAt(guard,'for update;')).toBeLessThan(durableAt(guard,'recovery:=public.read_dms_batch_draft_recovery'));
 expect(guard).toContain("current_setting('transaction_isolation')<>'read committed'");
 expect(durable).toContain('referencing new table as batch_draft_inserted for each statement');
 expect(durable).not.toMatch(/create constraint trigger f06_batch_draft_preparation|on conflict/i);
 const statement=durableBetween(guard," if tg_level='STATEMENT' then"," if tg_op in ('UPDATE','DELETE')");
 expect(statement).toContain('checked.has_seal is distinct from true or checked.visible_row is null');
 expect(statement).toContain('checked.visible_row is distinct from checked.inserted_row');
 expect(statement).toContain("raise exception 'Batch preparation unavailable' using errcode='42501'");
 expect(statement).toContain('to_jsonb(n) as inserted_row,to_jsonb(p) as visible_row');
 expect(statement).toContain('return null;');
 expect(statement.replace(/--[^\n]*/g,'')).not.toMatch(/\bwhere\b|inner join|for update|for share|batch_draft_snapshot|insert into|delete from|update public/);
 expect(durableAt(guard,"if tg_op in ('UPDATE','DELETE')")).toBeLessThan(durableAt(guard,'if current_setting'));
 expect(durable).toContain('before insert or update or delete on erp_private.dms_batch_draft_preparations\n for each row execute function erp_private.batch_draft_preparation_guard();');
 expect(durable).toContain('after insert on erp_private.dms_batch_draft_preparations\n referencing new table as batch_draft_inserted for each statement execute function erp_private.batch_draft_preparation_guard();');
 const row=guard.slice(durableAt(guard," if tg_op in ('UPDATE','DELETE')"));
 expect(row).toContain("if tg_op in ('UPDATE','DELETE') then raise exception 'Preparation history is immutable' using errcode='23514';end if;");
 for(const field of ['draft_operation_id','auth_user_id','profile_id','batch_id','admission_operation_id','admission_fingerprint','admission_position','request_json','created_at']){
  expect(row).toContain(`new.${field} is not null`);expect(row).toContain(`new.${field}:=`);
 }
 expect(row).toContain("if member->>'kind'='prepared' then raise exception 'Preparation already exists' using errcode='23505'");
});
it('W23 recovery is read-only invoker with complete admission and one-statement existence/payload pairs',()=>{
 const read=durableFunction('public.read_dms_batch_draft_recovery');
 expect(read).toContain("returns jsonb language plpgsql security invoker set search_path='' as $$");
 expect(read).toContain("current_setting('transaction_isolation')<>'read committed'");
 expect(read).toContain('public.read_dms_upload_batch_admission(p_admission_operation)');
 expect(read).toContain('erp_private.batch_draft_preparation_exists(s.id)');
 expect(read).toContain('left join erp_private.dms_batch_draft_preparations');
 for(const kind of ['historical','unprepared','prepared'])expect(read).toContain(`'${kind}'`);
 expect(read).toContain('jsonb_array_length');expect(read).toContain('Mixed batch recovery history');
 expect(read).not.toMatch(/\b(insert into|update public\.|delete from|for update|for share|allocate_numbering_reference|batch_draft_snapshot)\b/i);
 const paired=durableBetween(read,' select jsonb_agg',' if graph is null');
 expect(paired).toContain('erp_private.batch_draft_preparation_exists(s.id)');expect(paired).toContain("'seal',to_jsonb(p)");
 expect(paired).toContain('from public.dms_upload_sessions s\n left join erp_private.dms_batch_draft_preparations p');
 const truth=durableBetween(read,"   if entry->'has_seal'='true'::jsonb then",'  members:=');
 expect(truth).toContain("if sealed is null or sealed='null'::jsonb then raise exception 'Batch preparation unavailable' using errcode='42501'");
 expect(truth).toContain("elsif entry->'has_seal'='false'::jsonb and sealed='null'::jsonb then");
 expect(truth).toContain("else raise exception 'Invalid preparation visibility' using errcode='PT409'");
 expect(truth).not.toMatch(/coalesce\([^;]*has_seal|exception when/);
 expect(read).toContain("'request',sealed->'request_json'");
 expect(read).toContain("jsonb_array_length(graph)<>jsonb_array_length(receipt->'members')");
 for(const field of ['position','id','code'])expect(read).toContain(`entry->'${field}' is distinct from expected->'${field}'`);
 expect(read).toContain("if (entry->>'marker')::uuid=any(operations) then raise exception 'Duplicate draft operation'");
 for(const anchor of ['upload_session_id','draft_operation_id','auth_user_id','profile_id','batch_id','admission_operation_id','admission_fingerprint','admission_position'])expect(truth).toContain(`sealed->'${anchor}' is distinct from`);
 const historical=durableBetween(read,"  if entry->'marker'='null'::jsonb then",'   governed:=');
 expect(historical).toContain("member:=member||jsonb_build_object('kind','historical')");expect(historical).not.toContain("'request'");
});
it('W23 prepare is source-first invoker, returns retained seals before fresh work and rechecks after INSERT',()=>{
 const prepare=durableFunction('public.prepare_recoverable_dms_batch_draft');
 expect(prepare).toContain("returns jsonb language plpgsql security invoker set search_path='' as $$");
 expect(prepare).toContain('security invoker');expect(prepare).toContain("current_setting('transaction_isolation')<>'read committed'");
 expect(durableAt(prepare,'for update;')).toBeLessThan(durableAt(prepare,'recovery:=public.read_dms_batch_draft_recovery'));
 expect(durableAt(prepare,"member->>'kind'='prepared'")).toBeLessThan(durableAt(prepare,'batch_draft_snapshot'));
 expect(prepare).toContain('insert into erp_private.dms_batch_draft_preparations(upload_session_id) values(p_session);');
 expect(prepare.lastIndexOf('public.read_dms_batch_draft_recovery')).toBeGreaterThan(prepare.indexOf('insert into'));
 expect(prepare).not.toMatch(/allocate_numbering_reference|gen_random_uuid|on conflict/i);
 expect(prepare).toContain("if s.batch_draft_operation_id is null then raise exception 'Historical preparation requires its retained request' using errcode='PT409'");
 const after=prepare.slice(durableAt(prepare,' insert into erp_private.dms_batch_draft_preparations'));
 expect(after).toContain("if member is null or member->>'kind' is distinct from 'prepared' or member->>'draft_operation_id' is distinct from operation::text then");
});
it('W23 consumer enforces the original sealed pair before allocator and after the final wait',()=>{
 const consumer=durableFunction('public.create_numbered_dms_batch_draft');
 expect(consumer).toContain('owning_branch_id,batch_draft_operation_id into s');
 expect(durableAt(consumer,'public.read_dms_batch_draft_recovery')).toBeLessThan(durableAt(consumer,'allocation:='));
 expect(consumer.lastIndexOf('public.read_dms_batch_draft_recovery')).toBeGreaterThan(durableAt(consumer,'insert into public.audit_logs'));
 expect(consumer).toContain("member->'request' is distinct from p_request");
 expect(consumer).toContain("member->>'draft_operation_id' is distinct from p_operation::text");
 expect(consumer).toContain("'F06 batch draft creation '||encode(sha256(convert_to(p_request::text,'UTF8')),'hex')");
 expect(consumer).toContain('if s.batch_draft_operation_id is not null then');
 expect(consumer).not.toContain('gen_random_uuid');
});
it('W23 preserves the full historical consumer outside exactly four governed checks and two declarations',()=>{
 const consumer=durableFunction('public.create_numbered_dms_batch_draft');
 const check=durableBetween(consumer,' if s.batch_draft_operation_id is not null then',' allocation:=');
 expect(consumer.split(check)).toHaveLength(5);
 expect(check).toContain("current_setting('transaction_isolation')<>'read committed'");
 expect(check).toContain("member->>'kind' is distinct from 'prepared'");
 expect(check).toContain("member->'request' is distinct from p_request");
 expect(check).toContain("member->>'draft_operation_id' is distinct from p_operation::text");
 const old74=fs.readFileSync('supabase/migrations/20261005083645_f06_atomic_batch_admission.sql','utf8').replaceAll('\r\n','\n');
 const previous=old74.match(/create or replace function public\.create_numbered_dms_batch_draft\([\s\S]*?end \$\$;/)?.[0];
 expect(previous).toBeDefined();
 const inverse=consumer.split(check).join('').replace(' admission_op uuid; recovery jsonb; member jsonb;\n','').replace('owning_branch_id,batch_draft_operation_id into s','owning_branch_id into s');
 expect(inverse).toBe(previous);
 const checks=[...consumer.matchAll(/ if s\.batch_draft_operation_id is not null then/g)].map(match=>match.index!);
 expect(checks[0]).toBeLessThan(durableAt(consumer,'allocation:='));
 expect(checks[1]).toBeGreaterThan(durableAt(consumer,'allocation:='));expect(checks[1]).toBeLessThan(durableAt(consumer,"if allocation->>'generation_status'='consumed'"));
 expect(checks[2]).toBeGreaterThan(durableAt(consumer,'lock_dms_creation_taxonomy'));expect(checks[2]).toBeLessThan(durableAt(consumer,'insert into public.dms_documents'));
 expect(checks[3]).toBeGreaterThan(durableAt(consumer,'insert into public.audit_logs'));expect(checks[3]).toBeLessThan(durableAt(consumer,"return jsonb_build_object('documentId'"));
});
it('W23 only grants authenticated SELECT/INSERT and exact recovery entries, with no private numbering change',()=>{
 expect(durable).toContain('enable row level security');
 expect(durable).toContain('revoke all on erp_private.dms_batch_draft_preparations from public,anon,authenticated,service_role;');
 expect(durable).toContain('grant select,insert on erp_private.dms_batch_draft_preparations to authenticated;');
 for(const fn of ['public.read_dms_batch_draft_recovery(uuid)','public.prepare_recoverable_dms_batch_draft(bigint)','erp_private.batch_draft_preparation_exists(bigint)']){
  expect(durable).toContain(`revoke all on function ${fn} from public,anon,service_role;`);
  expect(durable).toContain(`grant execute on function ${fn} to authenticated;`);
 }
 expect(durable).not.toMatch(/grant all|grant update|grant delete|grant .*sequence|alter .*numbering|disable row|set_config|storage\.|http\(|net\./i);
 const entries=['erp_private.batch_draft_preparation_exists(bigint)','public.read_dms_batch_draft_recovery(uuid)','public.prepare_recoverable_dms_batch_draft(bigint)','public.create_numbered_dms_batch_draft(uuid,jsonb)'];
 expect(durable.match(/^grant [^;]+;/gm)).toEqual([...entries.map(fn=>`grant execute on function ${fn} to authenticated;`),'grant select,insert on erp_private.dms_batch_draft_preparations to authenticated;']);
 const revokes=[...entries.map(fn=>`revoke all on function ${fn} from public,anon,service_role;`),...['batch_identity_guard','batch_graph_guard','batch_draft_preparation_guard'].map(fn=>`revoke all on function erp_private.${fn}() from public,anon,authenticated,service_role;`),'revoke all on erp_private.dms_batch_draft_preparations from public,anon,authenticated,service_role;'];
 expect((durable.match(/^revoke [^;]+;/gm)??[]).sort()).toEqual(revokes.sort());
 expect(durableAt(durable,'revoke all on erp_private.dms_batch_draft_preparations')).toBeLessThan(durableAt(durable,'grant select,insert on erp_private.dms_batch_draft_preparations'));
 expect(durable).toContain('alter table erp_private.dms_batch_draft_preparations owner to postgres;');
 expect([...durable.matchAll(/^create(?: or replace)? function ([^(]+)\(/gm)].map(match=>match[1])).toEqual(['erp_private.batch_identity_guard','erp_private.batch_graph_guard','erp_private.batch_draft_preparation_exists','erp_private.batch_draft_preparation_guard','public.read_dms_batch_draft_recovery','public.prepare_recoverable_dms_batch_draft','public.create_numbered_dms_batch_draft']);
});
it('W23 preserves identity/graph bodies except the registered generated-marker invariants',()=>{
 const old=fs.readFileSync('supabase/migrations/20261005083645_f06_atomic_batch_admission.sql','utf8').replaceAll('\r\n','\n');
 const oldFunction=(name:string)=>old.match(new RegExp(`create function erp_private\\.${name}\\([\\s\\S]*?end \\$\\$;`))?.[0]?.replace(/^create function/,'create or replace function');
 const identity=durableFunction('erp_private.batch_identity_guard');
 const invariants=durableBetween(identity,' -- Marker invariance applies',' if tg_op=\'UPDATE\' and old.admission_position');
 const issue=durableBetween(identity,' if not erp_private.business_principal_is_active()',' new.session_code:=');
 expect(identity.replace(invariants,'').replace(issue,'')).toBe(oldFunction('batch_identity_guard'));
 const graph=durableFunction('erp_private.batch_graph_guard');
 expect(graph.replace("(tg_op='INSERT' and s.batch_draft_operation_id is null) or ",'')).toBe(oldFunction('batch_graph_guard'));
});
