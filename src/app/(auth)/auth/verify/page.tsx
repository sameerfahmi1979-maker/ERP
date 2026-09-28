import { redirect } from "next/navigation";
import { ConfirmEmailForm } from "@/features/auth/confirm-email-form";
export const dynamic = "force-dynamic";
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  if (query.invitation !== undefined) {
    if (typeof query.invitation !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(query.invitation) || query.token_hash !== undefined || query.type !== undefined) redirect("/auth/link-error?reason=invalid_invite_link&flow=invite");
    return <ConfirmEmailForm invitation={query.invitation} flow="invite" />;
  }
  if (query.type === "invite") redirect("/auth/link-error?reason=invalid_invite_link&flow=invite");
  if (typeof query.token_hash !== "string" || !/^[a-zA-Z0-9_-]{32,256}$/.test(query.token_hash) || (query.type !== "invite" && query.type !== "recovery")) redirect("/auth/link-error?reason=invalid_invite_link");
  // GET never consumes a link: automated email scanners cannot complete the flow.
  return <ConfirmEmailForm tokenHash={query.token_hash} flow={query.type} />;
}
