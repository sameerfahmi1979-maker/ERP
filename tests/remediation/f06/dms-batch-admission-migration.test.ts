import fs from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

// Text-contract tests only. These do not parse/apply SQL, import a native
// harness, or substitute for live catalog/RLS/transaction/race acceptance.
const path = "supabase/migrations/20261005083645_f06_atomic_batch_admission.sql";
const sql = fs.readFileSync(path, "utf8").replace(/\r/g, "");
const previous = fs.readFileSync("supabase/migrations/20261004181125_f06_numbered_batch_draft_consumer.sql", "utf8");
const body = (name: string) => {
  const match = new RegExp(`create(?: or replace)? function ${name.replaceAll(".", "\\.")}\\(`, "i").exec(sql);
  expect(match, `missing ${name}`).not.toBeNull();
  const start = match!.index;
  const end = sql.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + 3);
};
const admission = body("public.admit_dms_upload_batch");
const receipt = body("public.read_dms_upload_batch_admission");
const source = body("erp_private.batch_source");
const identity = body("erp_private.batch_identity_guard");
const graph = body("erp_private.batch_graph_guard");
const audit = body("erp_private.batch_audit_guard");
const canonical = body("erp_private.batch_manifest_bytes");
const numbered = body("public.create_numbered_dms_batch_draft");
const snapshot = body("erp_private.batch_draft_snapshot");
const before = (text: string, first: string, second: string) => {
  expect(text.indexOf(first), first).toBeGreaterThanOrEqual(0);
  expect(text.indexOf(second), second).toBeGreaterThan(text.indexOf(first));
};

describe("atomic batch migration source contract (offline only)", () => {
  it("is one complete additive transaction at the main-generated filename", () => {
    expect(sql.trimStart()).toMatch(/^begin;/);
    expect(sql.trimEnd()).toMatch(/notify pgrst,'reload schema';\ncommit;$/);
    expect(sql.match(/^begin;/gm)).toHaveLength(1);
    expect(sql.match(/^commit;/gm)).toHaveLength(1);
    expect(sql).toContain("set local lock_timeout='5s'");
    expect(sql).toContain("set local statement_timeout='60s'");
    expect(createHash("sha256").update(previous).digest("hex")).toBe("336d620ed4354ee56cac99b3dc49f862201c43239bf6bd41932a52fa26d90c6a");
  });
  it("does not backfill legacy, modify shared RBAC/allocator, or grant business bypass", () => {
    expect(sql).not.toMatch(/update public\.dms_upload_batches|update public\.(?:auth|user_profiles|roles|permissions|role_permissions|user_roles)|insert into erp_private|disable (?:trigger|row level)|session_replication_role|grant (?:all|insert|update|delete|select|usage)|alter default privileges|lock table|storage\.|net\.|http\(/i);
    expect(sql).not.toMatch(/create(?: or replace)? function public\.(?:allocate_numbering_reference|current_user_)/i);
    expect(sql).not.toContain("exception when");
    expect(sql).not.toContain("current_setting('app.");
  });
  it("requires all-null legacy anchors and complete modern anchors without NULL loopholes", () => {
    const shape = sql.slice(sql.indexOf("add constraint f06_batch_anchor_shape"), sql.indexOf("create unique index"));
    for (const column of ["admission_auth_user_id", "admission_operation_id", "admission_manifest", "admission_fingerprint"]) {
      expect(shape).toContain(`${column} is null`);
      expect(shape).toContain(`${column} is not null`);
    }
    expect(shape).toContain("admission_version is not null and admission_version=1");
    expect(shape).toContain("owning_branch_id is null or owning_company_id is not null");
    expect(shape).toContain("uploaded_by is not null");
  });
  it("uses local modern markers for unique indexes and history-preserving references", () => {
    expect(sql).toContain("(admission_auth_user_id,admission_operation_id)\n where admission_version is not null");
    expect(sql).toContain("(batch_id,admission_position) where admission_position is not null");
    expect(sql).toContain("(temp_storage_path) where admission_position is not null");
    expect(sql).not.toMatch(/on delete (?:cascade|set null)/i);
    expect(sql).toContain("references auth.users(id) on delete restrict");
  });
  it.each(["version", "context", "files", "revision"])("requires strict RPC key %s", key => {
    expect(admission).toContain("array['version','context','files','revision']");
    expect(admission).toContain(key);
  });
  it("validates parsed-value integer bounds before casts and emits compact scalar JSON", () => {
    expect(body("erp_private.batch_integer")).toContain("numeric=trunc((v::text)::numeric)");
    for (const token of ["9007199254740991", "52428800", "between 1 and 10", "between 1 and 500", "convert_to(v::text,'UTF8')", "to_json(name)::text", "numeric)::bigint::text"]) expect(canonical).toContain(token);
    expect(canonical).toContain("(v->'context')-array['type','id']");
    expect(canonical).not.toMatch(/lower\(name\)|btrim\(name\)|normalize\(/);
    expect(admission).toContain("p_request->'revision' is distinct from 'null'::jsonb");
    expect(admission).toContain("manifest:=p_request-'revision'");
  });
  it.each(["pdf", "jpg", "jpeg", "png", "tif", "tiff", "webp", "doc", "docx", "xls", "xlsx"])("SQL has an explicit extension arm for %s", extension => {
    expect(canonical).toContain(`when '${extension}' then`);
    expect(canonical).toContain("expected is null or mime is distinct from expected");
  });
  it("uses the finite whitespace/control set and preserves original scalar spelling", () => {
    expect(canonical).toContain("cp between 0 and 31 or cp between 127 and 159 or cp between 55296 and 57343");
    expect(canonical).toContain("32,160,5760,8232,8233,8239,8287,12288,65279");
    expect(canonical).toContain("cp between 8192 and 8202");
    expect(canonical).toContain("^[0-9a-f]{64}$");
    expect(canonical).not.toContain("md5(");
  });
  it("locks self user/session/profile then complete supplying relations before parents", () => {
    const authority = body("erp_private.lock_batch_admission_authority");
    const relations = ["from auth.users", "from auth.sessions", "from public.user_profiles", "from public.user_roles ur", "perform 1 from public.user_roles", "perform 1 from public.roles", "perform 1 from public.role_permissions", "perform 1 from public.permissions"];
    for (let i = 1; i < relations.length; i++) before(authority, relations[i - 1], relations[i]);
    expect(authority).toContain("user_id=uid and id::text=sid for share");
    expect(authority).toContain("jsonb_agg(to_jsonb(w))");
    expect(authority.match(/from jsonb_array_elements\(witnesses\).*order by id loop/g)).toHaveLength(4);
    expect(authority).toContain("current_setting('transaction_isolation')<>'read committed'");
    expect(authority.lastIndexOf("select p.id,p.owner_company_id,p.branch_id")).toBeGreaterThan(authority.indexOf("from public.permissions"));
    expect(authority).toContain("ur.id=(w.value->>'assignment')::bigint");
    expect(authority).toContain("r.id=(w.value->>'role')::bigint and ur.role_id=r.id");
    expect(authority).toContain("rp.id=(w.value->>'pair')::bigint and rp.role_id=r.id");
    expect(authority).toContain("p.id=(w.value->>'permission')::bigint and rp.permission_id=p.id");
    expect(authority).toContain("or not dms_allowed or (needs_party and not party_allowed)");
    expect(authority).not.toMatch(/insert into|delete from|update public/);
  });
  it("retains existing scoped/global-admin authority instead of unioned grants", () => {
    const allowed = body("erp_private.batch_scope_allowed");
    expect(allowed).toContain("actor=public.current_user_profile_id()");
    expect(allowed).toContain("permission_in_scope('dms.documents.upload',company,branch)");
    expect(allowed).toContain("permission_in_scope('dms.admin',company,branch)");
    expect(allowed).not.toContain("current_user_has_permission(");
    const scope = fs.readFileSync("supabase/migrations/20260923070453_f03_employee_subject_scopes.sql", "utf8");
    expect(scope).toContain("public.current_user_is_global_admin() OR EXISTS(");
  });
  it("captured party witness matches both NULL scopes of the actual global capability", () => {
    const authority = body("erp_private.lock_batch_admission_authority");
    const party = authority.slice(authority.indexOf("coalesce(bool_or(", authority.indexOf("coalesce(bool_or(") + 1), authority.indexOf("into dms_allowed,party_allowed"));
    expect(party).toContain("r.role_code in ('system_admin','group_admin') and ur.owner_company_id is null and ur.branch_id is null");
    expect(party).toContain("p.permission_code in ('master_data.parties.view','master_data.party_master.view')\n    and ur.owner_company_id is null and ur.branch_id is null");
    const foundation = fs.readFileSync("supabase/migrations/20260922061949_f01_security_containment.sql", "utf8");
    const permission = foundation.slice(foundation.indexOf("FUNCTION public.current_user_has_permission(permission_code text)"), foundation.indexOf("FUNCTION public.current_user_has_permission_globally"));
    expect(permission).toContain("and ur.owner_company_id is null");
    expect(permission).toContain("and ur.branch_id is null");
  });
  it("checks company→branch→flag→party with separate invoker party visibility", () => {
    const fresh = body("erp_private.batch_fresh_context");
    const relations = ["public.owner_companies", "public.branches", "public.erp_ai_feature_flags", "public.parties"];
    for (let i = 1; i < relations.length; i++) before(fresh, relations[i - 1], relations[i]);
    expect(fresh).toContain("owner_company_id=company and is_active");
    expect(fresh).toContain("feature_code='DMS_BATCH_INTAKE' and is_enabled");
    expect(fresh).not.toContain("numbering.rules.generate");
    expect(identity.match(/from public.parties where id=/g)).toHaveLength(2);
  });
  it("uses row-valued header policies and preserves F03 restrictive policies", () => {
    const policies = sql.slice(sql.indexOf("drop policy dms_upload_batches_insert"), sql.indexOf("create function erp_private.batch_identity_guard"));
    expect(policies).toContain("admission_auth_user_id=auth.uid() and created_by=public.current_user_profile_id()");
    expect(policies).toContain("batch_scope_allowed(created_by,owning_company_id,owning_branch_id)");
    expect(policies).not.toContain("batch_source(");
    expect(sql).not.toMatch(/(?:drop|alter) policy f03_/);
    expect(sql).not.toMatch(/create policy.*for delete/i);
  });
  it("rejects supplied generated identity and checks F03's final pinned tuple", () => {
    expect(identity).toContain("new.batch_code is not null");
    expect(identity).toContain("new.session_code is not null or new.temp_storage_path is not null");
    expect(identity).toContain("new.owning_company_id is distinct from b.owning_company_id");
    expect(identity).toContain("new.owning_branch_id is distinct from b.owning_branch_id");
    expect("f06_batch_member_identity" > "f03_upload_intake_scope").toBe(true);
    expect(sql).toContain("create trigger f06_batch_member_identity before insert or update or delete");
    expect(identity).toContain("upper(replace(gen_random_uuid()::text,'-',''))");
  });
  it("starts an unbound 14-day graph and protects complete immutable identity even without Auth", () => {
    for (const field of ["new.id", "new.created_at", "new.uploaded_at", "new.document_id", "new.sha256_hash", "new.file_size_bytes", "new.mime_type", "new.admission_position", "new.total_files", "new.entity_type", "new.entity_id"]) expect(identity).toContain(field);
    expect(identity).toContain("new.expires_at:=transaction_timestamp()+interval '14 days'");
    expect(identity).toContain("new.expires_at is null or new.expires_at>old.expires_at");
    expect(identity).toContain("old.document_id is not null and new.document_id is distinct from old.document_id");
    expect(identity).toContain("new.approved_at is not null");
    expect(identity).not.toContain("elsif auth.uid() is not null");
  });
  it("keeps legacy full retained membership null-safe with exact count", () => {
    const legacy = body("erp_private.batch_legacy_allowed");
    expect(legacy).toContain("(select count(*) from public.dms_upload_sessions where batch_id=batch)<>b.total_files");
    expect(legacy).toContain("u.uploaded_by is distinct from b.created_by");
    expect(legacy).toContain("u.owning_company_id is distinct from s.owning_company_id");
    expect(legacy).toContain("u.owning_branch_id is distinct from s.owning_branch_id");
    expect(legacy).not.toMatch(/deleted_at|bool_and|count\(distinct/i);
  });
  it("mandatory create audits are ordinary invoker writes with no best-effort handler", () => {
    const creator = body("erp_private.batch_create_audit");
    expect(creator).toContain("security invoker");
    expect(creator).toContain("insert into public.audit_logs");
    expect(creator).toContain("b.admission_operation_id");
    expect(creator).not.toMatch(/exception when|security definer/);
    expect(sql).toContain("create trigger f06_batch_audit after insert");
    expect(sql).toContain("create trigger f06_batch_member_audit after insert");
  });
  it("special audit facts cannot be forged, changed, reclassified or deleted", () => {
    for (const field of ["actor_user_profile_id", "owner_company_id", "branch_id", "module_code", "action", "entity_reference", "old_values", "new_values", "created_at", "ip_address", "user_agent"]) expect(audit).toContain(`new.${field}`);
    expect(audit).toContain("old.new_values->>'event' in");
    expect(audit).toContain("b.admission_auth_user_id is distinct from auth.uid()");
    expect(sql).toContain("create unique index f06_batch_create_audit");
  });
  it("trigger-only definer checks full graph/audits and has no write or direct execute grant", () => {
    expect(graph).toContain("security definer");
    expect(graph).toContain("count(*) from public.dms_upload_sessions where batch_id=bid");
    expect(graph).toContain("created_at=b.created_at");
    expect(graph).not.toMatch(/insert into|update public|delete from|deleted_at is null/);
    for (const fn of ["batch_identity_guard", "batch_create_audit", "batch_graph_guard", "batch_audit_guard"]) {
      expect(sql).toContain(`revoke all on function erp_private.${fn}() from public,anon,authenticated,service_role`);
      expect(sql).not.toContain(`grant execute on function erp_private.${fn}`);
    }
    expect(sql.match(/deferrable initially deferred for each row execute function erp_private.batch_graph_guard\(\)/g)).toHaveLength(2);
  });
  it("serializes exact Auth+operation and checks replay before fresh admission", () => {
    expect(admission).toContain("'dms-batch-admission/v1:'||auth.uid()::text||':'||p_operation::text");
    before(admission, "pg_advisory_xact_lock", "select id,admission_manifest");
    before(admission, "if bid is not null then", "lock_batch_admission_authority(");
    expect(admission).toContain("existing is distinct from manifest");
    expect(admission).not.toMatch(/delete from|update public|allocate_numbering|storage\.|logAudit/);
  });
  it("forces only its named constraints before the new receipt and propagates failures", () => {
    before(admission, "public.f06_batch_members_complete deferred", "insert into public.dms_upload_batches");
    before(admission, "insert into public.dms_upload_sessions", "public.f06_batch_members_complete immediate");
    expect(admission.lastIndexOf("receipt:=public.read_dms_upload_batch_admission")).toBeGreaterThan(admission.indexOf("public.f06_batch_members_complete immediate"));
    expect(admission).not.toMatch(/set constraints all|exception when/);
  });
  it("receipt is invoker, original Auth/profile bound and reconstructs every retained member", () => {
    expect(receipt).toContain("security invoker");
    expect(receipt).toContain("admission_auth_user_id=auth.uid() and created_by=public.current_user_profile_id()");
    expect(source).toContain("order by admission_position nulls last,id");
    expect(source).toContain("n<>b.total_files");
    expect(source).not.toMatch(/deleted_at is null|for update|for share/);
    expect(receipt).not.toMatch(/batch_fresh_context|expires_at|status in|for update|for share/);
    for (const key of ["version", "operation_id", "auth_user_id", "profile_id", "fingerprint", "manifest", "batch_id", "batch_code", "company_id", "branch_id", "members"]) expect(receipt).toContain(`'${key}'`);
  });
  it("eligibility exposes only the fresh-signable subset, not a partial immutable receipt", () => {
    const eligible = body("public.dms_upload_batch_eligibility");
    expect(eligible).toContain("document_id is null and deleted_at is null and temp_cleaned_at is null");
    expect(eligible).toContain("expires_at>clock_timestamp()");
    expect(eligible).toContain("status in ('completed','cancelled')");
    expect(eligible).toContain("jsonb_agg(admission_position order by admission_position)");
    expect(eligible).toContain("receipt is distinct from public.read_dms_upload_batch_admission");
    expect(eligible).not.toMatch(/update public|insert into|for update|for share/);
  });
  it("discovery is original-owner only, bounded and never infers an operation from files", () => {
    const discovery = body("public.discover_dms_upload_batch_admissions");
    expect(discovery).toContain("admission_auth_user_id=auth.uid() and created_by=public.current_user_profile_id()");
    expect(discovery).toContain("order by id desc limit 20");
    expect(discovery).toContain("read_dms_upload_batch_admission(r.admission_operation_id)");
    expect(discovery).not.toMatch(/sha256_hash=|original_filename=|security definer/);
  });
  it("relationship is ordinary RLS, precedes unready analysis and strengthens opaque fingerprint", () => {
    expect(body("erp_private.batch_draft_relationship")).toContain("security invoker");
    before(snapshot, "batch_draft_relationship(p_session,true)", "'kind','analysis_required'");
    expect(snapshot).toContain("'batch',batch_source");
    expect(snapshot).toContain("select r.* into a");
    expect(snapshot).not.toMatch(/for share|for update|insert into|allocate_numbering/);
  });
  it("preserves session→reference→analysis→batch-context→taxonomy lock order", () => {
    const stages = ["perform 1 from public.dms_upload_sessions", "select id,document_id", "batch_draft_relationship(session_id,s.document_id is null)", "allocate_numbering_reference", "perform 1 from public.dms_ai_extraction_results", "lock_batch_draft_context", "lock_dms_creation_taxonomy"];
    for (let i = 1; i < stages.length; i++) before(numbered, stages[i - 1], stages[i]);
    const locks = body("erp_private.lock_batch_source_context_rows");
    before(locks, "from public.dms_upload_batches", "from public.parties");
    expect(locks).not.toMatch(/insert into|update public|delete from|for update/);
    const wrapper = body("erp_private.lock_batch_draft_context");
    expect(wrapper).toContain("security invoker");
    expect(wrapper.match(/batch_draft_relationship/g)).toHaveLength(2);
  });
  it("consumed replay validates structure without imposing fresh-work lifecycle", () => {
    const consumed = numbered.slice(numbered.indexOf("if allocation->>'generation_status'='consumed'"), numbered.indexOf(" else\n  if allocation"));
    expect(consumed).toContain("batch_draft_relationship(session_id,false)");
    expect(consumed).toContain("s.document_id is distinct from draft_id");
    expect(consumed).not.toContain("batch_draft_snapshot");
    const relationship = body("erp_private.batch_draft_relationship");
    before(relationship, "source:=erp_private.batch_source", "if p_fresh then");
    expect(relationship).toContain("if p_fresh then");
    expect(source).toContain("b.entity_id between 1 and 9007199254740991)) is not true then");
  });
  it("retains exact numbered transaction and final upload/review/preview checks", () => {
    for (const fragment of ["insert into public.dms_documents", "update public.dms_upload_sessions", "update public.dms_ai_extraction_results", "insert into public.dms_intake_review_values", "insert into public.dms_document_events", "finish_numbering_reservation", "insert into public.audit_logs"]) expect(numbered).toContain(fragment);
    for (const capability of ["upload", "review_ai", "preview"]) expect(numbered).toContain(`f03_has_document_permission(draft_id,'dms.documents.${capability}')`);
    expect(numbered.lastIndexOf("batch_draft_relationship(session_id,false)")).toBeGreaterThan(numbered.indexOf("insert into public.audit_logs"));
  });
  it.each([
    "admit_dms_upload_batch(uuid,jsonb)", "read_dms_upload_batch_admission(uuid)",
    "dms_upload_batch_eligibility(uuid)", "discover_dms_upload_batch_admissions(bigint)",
    "create_numbered_dms_batch_draft(uuid,jsonb)",
  ])("public %s remains authenticated-only", fn => {
    expect(sql).toContain(`revoke all on function public.${fn} from public,anon,service_role;`);
    expect(sql).toContain(`grant execute on function public.${fn} to authenticated;`);
    expect(body(`public.${fn.split("(")[0]}`)).toContain("security invoker set search_path=''");
  });
  it("native canonical reader requires explicit native77c admission and leaves N01-N18 unwired", () => {
    const native = fs.readFileSync("tests/remediation/f06/dms-batch-admission.local.test.ts", "utf8");
    expect(native).toContain("MAIN_NATIVE_WIRING_OPEN");
    expect(native).toContain('describe.skip("MAIN_NATIVE_WIRING_OPEN');
    expect(native).toContain('process.env.ALGT_F06_DMS_CANONICAL_W38 === "1"');
    expect(native).toContain('describe.skipIf(!canonicalEnabled)');
    expect(native).toContain('expect(process.env.ALGT_F06_NATIVE_TARGET).toBe("native77c")');
    expect(native).toContain('expect(process.env.ALGT_F06_LOCAL_TARGET).toBeUndefined()');
    for (const guard of ["startup-qualified.json", "startup-intent.json", "begin read only", "statement_timeout='8s'", "lock_timeout='3s'", "containerId", "serverStarted", "databaseOid", "fs.fsyncSync", "fullCanonicalAdmission: false", "nativeN01N18: false"]) expect(native).toContain(guard);
    expect(native).toContain("PASS_READ_ONLY_CANONICAL_TRANCHE");
    expect(native).toContain("canonicalBatchManifest(manifest)");
    expect(native).toContain("batchFingerprint(manifest)");
    expect(native).toContain("encode(sha256(convert_to(bytes,'UTF8')),'hex')");
    expect(native).toContain("actual[i], v.id).toEqual");
    for (const guard of ["175e3c64ad822b0ffcf3c82da90dfb8219183b2b060c68a229a6e7b16d422052", "toHaveLength(77)", "expect(replay.applied).toEqual(manifest)", "signal.addEventListener", "bodyActive", "Date.now() >= deadline", "canonical-body-unresolved", "journal retained open", "written < 1"]) expect(native).toContain(guard);
    expect(native).not.toMatch(/from ["'][^"']*(?:local-db|local-lock-race|candidate-replay|n03-)/);
    expect(native).not.toMatch(/fetch\(|createClient\(|request\.jwt|set_config\(|PGHOST|DATABASE_URL|SUPABASE_URL/);
    expect(native).not.toMatch(/docker\(\["(?:run|start|create|rm|stop|restart)"/);
    for (let i = 1; i <= 18; i++) expect(native).toContain(`N${String(i).padStart(2, "0")}`);
  });
});
