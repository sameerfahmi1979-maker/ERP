import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { Session } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

const COOKIE = "erp-password-flow";
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

/** Called only with a session returned by a successful provider token exchange. */
export async function establishPasswordFlow(session: Session, flow: "invite" | "recovery") {
  const claims = JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString("utf8")) as { session_id?: string; sub?: string };
  if (!claims.session_id || claims.sub !== session.user.id) throw new Error("Invalid password setup session");
  const token = randomBytes(32).toString("base64url");
  const { error } = await createAdminClient().from("erp_auth_flow_grants").insert({
    token_hash: digest(token), auth_user_id: session.user.id, session_id: claims.session_id, flow_type: flow,
  });
  if (error) throw new Error("Password setup could not be established");
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/reset-password", maxAge: 900 });
}

export type PasswordFlowContext = { hash: string; type: "invite" | "recovery" };

/** Read presentation context only from the same verified, unconsumed server grant. */
export async function getPasswordFlowContext(userId: string, sessionId: string): Promise<PasswordFlowContext | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const hash = digest(token);
  const { data, error } = await createAdminClient().from("erp_auth_flow_grants")
    .select("token_hash,flow_type").eq("token_hash", hash).eq("auth_user_id", userId).eq("session_id", sessionId)
    .is("consumed_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !data || (data.flow_type !== "invite" && data.flow_type !== "recovery")) return null;
  return { hash, type: data.flow_type };
}

export async function getPasswordFlow(userId: string, sessionId: string): Promise<string | null> {
  return (await getPasswordFlowContext(userId, sessionId))?.hash ?? null;
}

export async function clearPasswordFlow() {
  (await cookies()).set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/reset-password", maxAge: 0 });
}

export function buildPasswordEmailLink(siteUrl: string, tokenHash: string, flow: "invite" | "recovery"): string {
  const url = new URL(siteUrl);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Invalid application origin");
  url.pathname = "/auth/verify";
  url.search = new URLSearchParams({ token_hash: tokenHash, type: flow }).toString();
  return url.href;
}
