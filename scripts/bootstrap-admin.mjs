/**
 * Server-only bootstrap script for the first system administrator.
 *
 * Prerequisites:
 * 1. Migration applied to Supabase Cloud
 * 2. .env.local contains NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * 3. Supabase Auth user already exists (signup completed)
 *
 * Usage:
 *   node scripts/bootstrap-admin.mjs your.email@company.com
 */
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];

if (!email) {
  console.error("Usage: node scripts/bootstrap-admin.mjs <auth-email>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: usersData, error: listError } = await admin.auth.admin.listUsers();

if (listError) {
  console.error("Failed to list auth users:", listError.message);
  process.exit(1);
}

const authUser = usersData.users.find(
  (user) => user.email?.toLowerCase() === email.toLowerCase(),
);

if (!authUser) {
  console.error(`No Supabase Auth user found for email: ${email}`);
  process.exit(1);
}

const { data: profile, error: profileError } = await admin
  .from("user_profiles")
  .select("id")
  .eq("auth_user_id", authUser.id)
  .maybeSingle();

if (profileError) {
  console.error("Failed to load user profile:", profileError.message);
  process.exit(1);
}

let profileId = profile?.id;

if (!profileId) {
  const { data: created, error: createError } = await admin
    .from("user_profiles")
    .insert({
      auth_user_id: authUser.id,
      full_name: authUser.user_metadata?.full_name ?? email.split("@")[0],
      display_name: authUser.user_metadata?.display_name ?? email.split("@")[0],
      status: "active",
    })
    .select("id")
    .single();

  if (createError) {
    console.error("Failed to create user profile:", createError.message);
    process.exit(1);
  }

  profileId = created.id;
}

const { data: role, error: roleError } = await admin
  .from("roles")
  .select("id")
  .eq("role_code", "system_admin")
  .single();

if (roleError || !role) {
  console.error("system_admin role not found. Apply migration first.");
  process.exit(1);
}

const { error: assignError } = await admin.from("user_roles").upsert(
  {
    user_profile_id: profileId,
    role_id: role.id,
    is_active: true,
  },
  { onConflict: "user_profile_id,role_id,owner_company_id,branch_id" },
);

if (assignError) {
  console.error("Failed to assign system_admin role:", assignError.message);
  process.exit(1);
}

console.log(`Bootstrap complete for profile ID ${profileId} (${email}).`);
