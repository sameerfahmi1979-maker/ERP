import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createClient as sdk } from "@supabase/supabase-js";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const state = vi.hoisted(() => ({ client: null as any, admin: null as any }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.admin }));
import { withDocumentReadPolicy } from "@/lib/supabase/document-read-policy";
import { getDmsDocuments } from "@/server/actions/dms/documents";
const require = createRequire(import.meta.url), db = require("../f00/local-db.cjs"), api = require("../f00/local-client.cjs");
const marker = "f03-dms-scale-" + randomBytes(5).toString("hex");
const dir = path.resolve("CODEX_AUDIT_13_09_2026/F04_DMS_RELEASE_28_09_2026");
const ledger: any = { marker, target: "algt-f00-local", production_mutations: 0, accounts: [], roles: [], permissions: [], documents: [], observations: [], cleanup: false };
const actors: Record<string, any> = {};
let category: number, type: number;
const save = () => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, marker + ".json"), JSON.stringify(ledger, null, 2)); };
async function insert(table: string, row: any) { const r = await state.admin.from(table).insert(row).select("id").single(); if (r.error) throw r.error; return r.data.id as number; }
beforeAll(async () => {
  db.assertDatabase(); const config = api.keys(); expect(config.API_URL).toBe("http://127.0.0.1:16421");
  state.admin = sdk(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const permissions: { data: { id: number; permission_code: string }[] } = { data: [] };
  for (const code of ["dms.documents.view", "dms.documents.preview", "dms.documents.view.hr"]) {
    const r = await state.admin.from("permissions").select("id").eq("permission_code", code).maybeSingle(); if (r.error) throw r.error;
    const id = r.data?.id ?? await insert("permissions", { permission_code: code, permission_name: code, module_code: "dms", action_code: "view" });
    if (!r.data) ledger.permissions.push(id); permissions.data.push({ id, permission_code: code }); save();
  }
  for (const name of ["global", "metadata", "preview", "none"]) {
    const email = `f00-${marker}-${name}@example.invalid`, password = randomBytes(24).toString("base64url") + "aA9!";
    const user = await state.admin.auth.admin.createUser({ email, password, email_confirm: true }); if (user.error) throw user.error;
    ledger.accounts.push({ name, authId: user.data.user.id, email }); save();
    const p = await state.admin.from("user_profiles").update({ status: "active", must_change_password: false, owner_company_id: 900101, branch_id: 900201, full_name: marker + " " + name }).eq("auth_user_id", user.data.user.id).select("id").single(); if (p.error) throw p.error;
    if (name !== "none") {
      let role;
      if (name === "global") { const r = await state.admin.from("roles").select("id").eq("role_code", "system_admin").single(); if (r.error) throw r.error; role = r.data.id; }
      else {
        role = await insert("roles", { role_code: marker + "-" + name, role_name: marker + " " + name, is_system_role: false }); ledger.roles.push(role); save();
        const caps = name === "metadata" ? ["dms.documents.view"] : ["dms.documents.view", "dms.documents.preview", "dms.documents.view.hr"];
        const r = await state.admin.from("role_permissions").insert(permissions.data.filter((x: any) => caps.includes(x.permission_code)).map((x: any) => ({ role_id: role, permission_id: x.id }))); if (r.error) throw r.error;
      }
      await insert("user_roles", { user_profile_id: p.data.id, role_id: role, owner_company_id: name === "global" ? null : 900101, branch_id: name === "global" ? null : 900201 });
    }
    const client = sdk(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await client.auth.signInWithPassword({ email, password }); if (login.error) throw login.error;
    actors[name] = withDocumentReadPolicy(client);
  }
  category = await insert("dms_document_categories", { category_code: marker, name_en: marker, is_system: false }); ledger.category = category; save();
  type = await insert("dms_document_types", { type_code: marker, name_en: marker, category_id: category, is_system: false }); ledger.type = type; save();
  for (let offset = 0; offset < 702; offset += 100) {
    const rows = Array.from({ length: Math.min(100, 702 - offset) }, (_, index) => {
      const n = offset + index;
      return { document_no: marker + "-" + n, title: marker + " synthetic " + n, document_type_id: type, category_id: category,
        owning_company_id: n === 701 ? 900102 : 900101, owning_branch_id: n === 701 ? 900203 : n === 700 ? 900202 : 900201,
        confidentiality_level: n < 690 ? "internal" : "hr", ai_summary: "PRIVATE SYNTHETIC CONTENT ".repeat(100) };
    });
    const r = await state.admin.from("dms_documents").insert(rows).select("id"); if (r.error) throw r.error;
    ledger.documents.push(...r.data.map((x: any) => x.id)); save();
  }
}, 60000);
afterAll(async () => {
  const failures: string[] = [];
  for (let i = 0; i < ledger.documents.length; i += 100) { const r = await state.admin.from("dms_documents").delete().in("id", ledger.documents.slice(i, i + 100)); if (r.error) failures.push("documents " + i); }
  for (const account of ledger.accounts) { const r = await state.admin.auth.admin.deleteUser(account.authId); if (r.error) failures.push("account " + account.name); }
  for (const role of ledger.roles) { await state.admin.from("role_permissions").delete().eq("role_id", role); const r = await state.admin.from("roles").delete().eq("id", role); if (r.error) failures.push("role " + role); }
  if (type) { const r = await state.admin.from("dms_document_types").delete().eq("id", type); if (r.error) failures.push("type"); }
  if (category) { const r = await state.admin.from("dms_document_categories").delete().eq("id", category); if (r.error) failures.push("category"); }
  for (const id of ledger.permissions) { const r = await state.admin.from("permissions").delete().eq("id", id); if (r.error) failures.push("permission " + id); }
  ledger.cleanup = failures.length === 0; ledger.cleanup_failures = failures; save(); expect(failures).toEqual([]);
}, 60000);
it.runIf(process.env.F03_DMS_PROFILE === "1")("profiles the retained permission functions on synthetic records", async () => {
  const session = await actors.metadata.auth.getSession();
  const payload = JSON.parse(Buffer.from(session.data.session.access_token.split('.')[1], 'base64url').toString());
  const claims = JSON.stringify({ sub: payload.sub, session_id: payload.session_id, role: "authenticated" }).replaceAll("'", "''");
  const setup = `BEGIN READ ONLY; SET LOCAL statement_timeout='8s'; DO $$BEGIN PERFORM set_config('request.jwt.claims','${claims}',true); END$$;`;
  const expressions = ["erp_private.business_principal_is_active()", "public.current_user_is_global_admin()", "erp_private.permission_in_scope('dms.documents.view',900101,900201)", "erp_private.hr_document_evidence_allowed(d.id)", "erp_private.recruitment_document_evidence_allowed(d.id)", "erp_private.document_permission(d.id,'dms.documents.view')"];
  ledger.profiles = [];
  for (const expression of expressions) {
    const plan = db.sql(setup + `EXPLAIN (ANALYZE, FORMAT JSON) SELECT count(*) FILTER (WHERE ${expression}) FROM (SELECT id FROM public.dms_documents WHERE category_id=${category} LIMIT 25) d; ROLLBACK;`, { json: true });
    ledger.profiles.push({ expression, execution_ms: plan[0]["Execution Time"], plan }); save();
  }
});
it("loads the actual administrator list with 702 synthetic records below the production timeout", async () => {
  state.client = actors.global; const start = performance.now(); const r = await getDmsDocuments({ search: marker, excludeArchived: true });
  const elapsed = Math.round(performance.now() - start); ledger.observations.push({ case: "actual admin list", elapsed_ms: elapsed, success: r.success, count: r.data?.length, error: r.error }); save();
  expect(r.success, r.error).toBe(true); expect(r.data).toHaveLength(702); expect(elapsed).toBeLessThan(8000);
  expect(r.data![0]).not.toHaveProperty("summary_embedding"); expect(r.data![0]).not.toHaveProperty("content_tsv");
});
it.each([["metadata", 690], ["preview", 700], ["none", 0]] as const)("preserves %s content and company/branch boundaries at scale", async (name, count) => {
  const start = performance.now();
  const r = await actors[name].from("dms_documents").select("id,ai_summary", { count: "exact" }).eq("category_id", category).order("id");
  const elapsed = Math.round(performance.now() - start); ledger.observations.push({ case: name, elapsed_ms: elapsed, count: r.count, error_code: r.error?.code }); save();
  expect(r.error).toBeNull(); expect(r.count).toBe(count); expect(r.data).toHaveLength(count); expect(elapsed).toBeLessThan(8000);
  if (name === "metadata") expect(r.data.every((x: any) => x.ai_summary === null)).toBe(true);
  if (name === "preview") expect(r.data.every((x: any) => x.ai_summary?.startsWith("PRIVATE SYNTHETIC"))).toBe(true);
});
