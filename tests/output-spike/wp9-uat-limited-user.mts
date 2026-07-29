/**
 * OUTPUT.5 (WP9) — Authenticated limited-user security probes.
 *
 * Creates a throwaway auth user with the "Read Only User" role, signs in with
 * a real password grant, and attempts direct API access to protected output
 * framework surfaces with the user's own JWT (NOT service role). Everything
 * must be denied except the public verification RPC. The user is deleted at
 * the end regardless of outcome.
 *
 * Run: npx tsx tests/output-spike/wp9-uat-limited-user.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const OUT_DIR = join(process.cwd(), "tests", "output-spike", "evidence", "wp9-uat");
mkdirSync(OUT_DIR, { recursive: true });

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
const add = (name: string, pass: boolean, detail = "") => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

const EMAIL = "wp9.uat.limited@algt.net";
const PASSWORD = randomBytes(18).toString("base64url") + "aA1!";

let authUserId: string | null = null;
let profileId: number | null = null;

try {
  // ── setup: auth user + profile + Read Only role ────────────────────────────
  const created = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error) throw new Error(`createUser: ${created.error.message}`);
  authUserId = created.data.user.id;

  // A DB trigger auto-creates the profile for new auth users — adopt it.
  const { data: prof, error: profErr } = await admin
    .from("user_profiles")
    .update({ full_name: "WP9 UAT Limited", status: "active", owner_company_id: 1 })
    .eq("auth_user_id", authUserId)
    .select("id")
    .single();
  if (profErr) throw new Error(`profile: ${profErr.message}`);
  profileId = prof.id;

  const { data: role } = await admin.from("roles").select("id").eq("role_name", "Read Only User").single();
  if (role) {
    await admin.from("user_roles").insert({ user_profile_id: profileId, role_id: role.id, is_active: true });
  }
  add("setup: limited user created with Read Only role", true, EMAIL);

  // ── sign in with real password grant ──────────────────────────────────────
  const userClient = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const signIn = await userClient.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  add("limited user can authenticate", !signIn.error, signIn.error?.message ?? "JWT obtained");

  // ── probes with the limited user's own JWT ─────────────────────────────────
  {
    const { data, error } = await userClient.from("erp_generated_pdf_documents").select("id, serial_no").limit(5);
    add("limited user cannot read issued documents table", !!error || (data ?? []).length === 0,
      error ? error.message.slice(0, 60) : `${data?.length ?? 0} rows`);
  }
  {
    const { data, error } = await userClient.from("erp_output_public_links").select("public_token").limit(5);
    add("limited user cannot read public links (tokens)", !!error || (data ?? []).length === 0,
      error ? error.message.slice(0, 60) : `${data?.length ?? 0} rows`);
  }
  {
    const { data: anyDoc } = await admin
      .from("erp_generated_pdf_documents")
      .select("storage_path")
      .eq("lifecycle_state", "issued")
      .not("output_code", "is", null)
      .limit(1)
      .single();
    const { data, error } = await userClient.storage.from("erp-generated-pdfs").download(anyDoc!.storage_path);
    add("limited user cannot download stored official PDF", !!error || !data,
      error ? error.message.slice(0, 60) : "downloaded!");
  }
  {
    const { error } = await userClient
      .from("erp_generated_pdf_documents")
      .update({ revoked_at: new Date().toISOString(), revoke_reason: "tamper attempt" })
      .eq("id", 7);
    const { data: check } = await admin
      .from("erp_generated_pdf_documents")
      .select("revoked_at")
      .eq("id", 7)
      .single();
    add("limited user cannot revoke via direct table write", check?.revoked_at == null,
      error ? error.message.slice(0, 60) : "no error but write must be no-op");
  }
  {
    const { error } = await userClient
      .from("erp_output_class_policies")
      .update({ approval_required: false })
      .eq("document_class", "A");
    const { data: check } = await admin
      .from("erp_output_class_policies")
      .select("approval_required")
      .eq("document_class", "A")
      .single();
    add("limited user cannot weaken class policy", check?.approval_required === true,
      error ? error.message.slice(0, 60) : "no error but write must be no-op");
  }
  {
    const { error } = await userClient.from("erp_report_registry")
      .update({ approval_required_override: false })
      .eq("report_code", "HR_NOC");
    const { data: check } = await admin
      .from("erp_report_registry")
      .select("approval_required_override")
      .eq("report_code", "HR_NOC")
      .single();
    add("limited user cannot remove HR_NOC approval override", check?.approval_required_override === true,
      error ? error.message.slice(0, 60) : "no error but write must be no-op");
  }
  {
    // Public verification remains available to any caller — metadata only.
    const { data: link } = await admin
      .from("erp_output_public_links")
      .select("public_token")
      .eq("status", "valid")
      .limit(1)
      .single();
    const { data, error } = await userClient.rpc("get_public_verification_by_token", {
      p_token: link!.public_token,
    });
    const row = Array.isArray(data) ? data[0] : data;
    add("public verification RPC still works for authenticated user", !error && !!row,
      error?.message ?? "metadata returned");
  }
} finally {
  // ── teardown ────────────────────────────────────────────────────────────────
  if (profileId != null) {
    await admin.from("user_roles").delete().eq("user_profile_id", profileId);
    await admin.from("user_profiles").delete().eq("id", profileId);
  }
  if (authUserId) await admin.auth.admin.deleteUser(authUserId);
  console.log("teardown: UAT user removed");
}

const failed = checks.filter((c) => !c.pass);
writeFileSync(join(OUT_DIR, "wp9-limited-user-results.json"), JSON.stringify(checks, null, 2));
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length > 0) process.exit(1);
