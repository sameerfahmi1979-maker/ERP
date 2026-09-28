import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const invitationTokenPattern = /^[A-Za-z0-9_-]{43}$/;
export const hashInvitationToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Called only after the caller authorizes account creation/security management. */
export async function issueAccountInvitation(input: { profileId: number; authUserId: string; email: string; siteUrl: string }) {
  const url = new URL(input.siteUrl);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) throw new Error("Invalid application origin");
  const admin = createAdminClient();
  const identity = await admin.auth.admin.getUserById(input.authUserId);
  if (identity.error || !identity.data.user || identity.data.user.email_confirmed_at ||
    identity.data.user.email?.toLowerCase() !== input.email.toLowerCase()) throw new Error("Invitation identity unavailable");
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await admin.rpc("f03_issue_invitation", {
    p_profile_id: input.profileId, p_auth_user_id: input.authUserId,
    p_email: input.email.toLowerCase(), p_token_hash: hashInvitationToken(token),
  });
  if (error || !data?.[0]?.invitation_id || !data[0].expires_at) throw new Error("Invitation could not be issued");
  url.pathname = "/auth/verify";
  url.search = new URLSearchParams({ invitation: token }).toString();
  return { id: data[0].invitation_id as string, expiresAt: data[0].expires_at as string, actionLink: url.href };
}

/** No provider token is generated until a deliberate POST claims the ERP invitation. */
export async function claimAccountInvitation(token: string, currentUserId?: string) {
  if (!invitationTokenPattern.test(token)) return { error: "invalid_invite_link" } as const;
  const admin = createAdminClient();
  const hash = hashInvitationToken(token);
  const lookup = await admin.from("erp_account_invitations")
    .select("auth_user_id,recipient_email").eq("token_hash", hash).maybeSingle();
  if (lookup.error) return { error: "auth_unavailable" } as const;
  if (!lookup.data) return { error: "invalid_invite_link" } as const;
  // Do not burn a valid invitation or overwrite an unrelated signed-in session.
  if (currentUserId && currentUserId !== lookup.data.auth_user_id) return { error: "account_mismatch" } as const;
  const identity = await admin.auth.admin.getUserById(lookup.data.auth_user_id);
  if (identity.error) return { error: "auth_unavailable" } as const;
  const user = identity.data.user;
  if (!user || user.email_confirmed_at || user.email?.toLowerCase() !== lookup.data.recipient_email ||
    (user.banned_until && Date.parse(user.banned_until) > Date.now())) return { error: "invalid_invite_link" } as const;
  const claim = await admin.rpc("f03_claim_invitation", { p_token_hash: hash });
  if (claim.error) return { error: "auth_unavailable" } as const;
  const invitation = claim.data?.[0];
  if (!invitation) return { error: "invalid_invite_link" } as const;
  // Fail closed after the claim: network ambiguity requires an explicit new invitation, never replay.
  const generated = await admin.auth.admin.generateLink({ type: "invite", email: invitation.recipient_email });
  if (generated.error || !generated.data.properties?.hashed_token || generated.data.user?.id !== invitation.auth_user_id) {
    return { error: "auth_unavailable" } as const;
  }
  return { tokenHash: generated.data.properties.hashed_token, authUserId: invitation.auth_user_id as string, id: invitation.invitation_id as string };
}

/** Resend/disable during an exchange must not publish a newly established session. */
export async function invitationStillUsable(id: string): Promise<boolean> {
  const admin = createAdminClient();
  const row = await admin.from("erp_account_invitations").select("profile_id,auth_user_id,consumed_at,revoked_at,expires_at").eq("id", id).maybeSingle();
  if (row.error || !row.data?.consumed_at || row.data.revoked_at || Date.parse(row.data.expires_at) <= Date.now()) return false;
  const profile = await admin.from("user_profiles").select("id").eq("id", row.data.profile_id)
    .eq("auth_user_id", row.data.auth_user_id).eq("status", "active").eq("must_change_password", true).maybeSingle();
  return !profile.error && !!profile.data;
}
