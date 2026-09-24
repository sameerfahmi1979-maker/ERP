"use server";
import { z } from "zod";
import { confirmAuthLink } from "@/lib/auth/confirm-link";
const schema = z.object({ token_hash: z.string().min(32).max(256).regex(/^[a-zA-Z0-9_-]+$/), type: z.enum(["invite", "recovery"]) });
export async function confirmEmailLink(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return "/login?error=invalid_invite_link";
  return confirmAuthLink(parsed.data);
}
