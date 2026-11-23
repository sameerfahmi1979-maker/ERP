import "server-only";
import { cache } from "react";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const sessionFingerprint = cache(async (authUserId: string) => {
  const client = await createClient();
  const claims = (await client.auth.getClaims()).data?.claims;
  if (claims?.sub !== authUserId || typeof claims.session_id !== "string") return undefined;
  return createHash("sha256").update(claims.session_id).digest("hex");
});
