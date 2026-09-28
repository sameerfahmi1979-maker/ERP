"use server";
import { z } from "zod";
import { confirmAuthLink } from "@/lib/auth/confirm-link";
const schema = z.union([
  z.object({ invitation: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict(),
  z.object({ token_hash: z.string().min(32).max(256).regex(/^[a-zA-Z0-9_-]+$/), type: z.enum(["invite", "recovery"]) }).strict(),
]);
export async function confirmEmailLink(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return "/auth/link-error?reason=invalid_invite_link";
  return confirmAuthLink(parsed.data);
}
