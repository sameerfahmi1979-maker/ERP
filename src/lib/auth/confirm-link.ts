import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { establishPasswordFlow } from "./password-flow";
import { safeAuthDestination } from "./navigation";
import { claimAccountInvitation, invitationStillUsable } from "./invitations";

type LinkInput = { code: string; next?: string | null } | { token_hash: string; type: "invite" | "recovery" } | { invitation: string };
/** Buffer Auth cookies until the exchanged identity is checked against the existing session. */
export async function confirmAuthLink(input: LinkInput): Promise<string> {
  const errorPath = (reason: string) => `/auth/link-error?reason=${reason}&flow=${"invitation" in input || ("type" in input && input.type === "invite") ? "invite" : "recovery"}`;
  // Retire the old public provider-invite path: invitation acceptance must go through
  // the ERP ledger's expiry/revocation checks. Provider recovery links remain supported.
  if ("token_hash" in input && input.type === "invite") return errorPath("invalid_invite_link");
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
    if (existing.error && (existing.error.status ?? 0) >= 500) return errorPath("auth_unavailable");
    const invitation = "invitation" in input ? await claimAccountInvitation(input.invitation, existing.data.user?.id) : null;
    if (invitation && "error" in invitation) return errorPath(invitation.error!);
    const proof = invitation && "tokenHash" in invitation ? invitation : null;
    const result = proof ? await client.auth.verifyOtp({ token_hash: proof.tokenHash, type: "invite" }) :
      "code" in input ? await client.auth.exchangeCodeForSession(input.code) :
      "token_hash" in input ? await client.auth.verifyOtp({ token_hash: input.token_hash, type: input.type }) : null;
    if (!result || result.error || !result.data.session || !result.data.user) return errorPath("invalid_invite_link");
    exchangedToken = result.data.session.access_token;
    if (proof && (result.data.user.id !== proof.authUserId || !await invitationStillUsable(proof.id))) {
      await createAdminClient().auth.admin.signOut(exchangedToken, "local");
      return errorPath("invalid_invite_link");
    }
    if (existing.data.user && existing.data.user.id !== result.data.user.id) {
      await createAdminClient().auth.admin.signOut(exchangedToken, "local");
      return errorPath("account_mismatch");
    }
    // OTP verification validates the type; PKCE recovery type comes from the SDK verifier state,
    // not an attacker-controlled query parameter.
    const flow = proof ? "invite" : "token_hash" in input ? input.type :
      ("redirectType" in result.data && result.data.redirectType === "recovery" ? "recovery" : null);
    if (flow) await establishPasswordFlow(result.data.session, flow);
    pending.forEach(({ name, value, options }) => store.set(name, value, options));
    return flow ? "/reset-password" : safeAuthDestination("next" in input ? input.next : null);
  } catch {
    if (exchangedToken) await createAdminClient().auth.admin.signOut(exchangedToken, "local").catch(() => {});
    return errorPath("auth_unavailable");
  }
}
