"use server";
import { loginSchema } from "@/lib/validation/auth";
import { createClient } from "@/lib/supabase/server";
import { allowSecurityRequest } from "@/lib/auth/security-email";
export async function signIn(input: unknown): Promise<{ success: boolean }> {
  try {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success || !await allowSecurityRequest("login", parsed.data.email)) return { success: false };
    const { data, error } = await (await createClient()).auth.signInWithPassword(parsed.data);
    return { success: !error && !!data.user };
  } catch { return { success: false }; }
}
