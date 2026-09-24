import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { establishPasswordFlow } from "./password-flow";
import { safeAuthDestination } from "./navigation";

type LinkInput = { code: string; next?: string | null } | { token_hash: string; type: "invite" | "recovery" };
/** Buffer Auth cookies until the exchanged identity is checked against the existing session. */
export async function confirmAuthLink(input: LinkInput): Promise<string> {
  const store = await cookies();
  const jar = new Map(store.getAll().map(cookie => [cookie.name, cookie.value]));
  const pending: Array<{ name: string; value: string; options: CookieOptions }> = [];
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: values => {
      values.forEach(cookie => { jar.set(cookie.name, cookie.value); pending.push(cookie); });
    } },
  });
  let exchangedToken: string | undefined;
  try {
    const existing = await client.auth.getUser();
    if (existing.error && (existing.error.status ?? 0) >= 500) return "/login?error=auth_unavailable";
    const result = "code" in input ? await client.auth.exchangeCodeForSession(input.code) :
      await client.auth.verifyOtp({ token_hash: input.token_hash, type: input.type });
    if (result.error || !result.data.session || !result.data.user) return "/login?error=invalid_invite_link";
    exchangedToken = result.data.session.access_token;
    if (existing.data.user && existing.data.user.id !== result.data.user.id) {
      await createAdminClient().auth.admin.signOut(exchangedToken, "local");
      return "/login?error=account_mismatch";
    }
    // OTP verification validates the type; PKCE recovery type comes from the SDK verifier state,
    // not an attacker-controlled query parameter.
    const flow = "token_hash" in input ? input.type :
      ("redirectType" in result.data && result.data.redirectType === "recovery" ? "recovery" : null);
    if (flow) await establishPasswordFlow(result.data.session, flow);
    pending.forEach(({ name, value, options }) => store.set(name, value, options));
    return flow ? "/reset-password" : safeAuthDestination("next" in input ? input.next : null);
  } catch {
    if (exchangedToken) await createAdminClient().auth.admin.signOut(exchangedToken, "local").catch(() => {});
    return "/login?error=auth_unavailable";
  }
}
