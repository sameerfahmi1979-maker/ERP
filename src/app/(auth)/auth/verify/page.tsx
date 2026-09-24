import { redirect } from "next/navigation";
import { ConfirmEmailForm } from "@/features/auth/confirm-email-form";
export const dynamic = "force-dynamic";
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  if (typeof query.token_hash !== "string" || !/^[a-zA-Z0-9_-]{32,256}$/.test(query.token_hash) || (query.type !== "invite" && query.type !== "recovery")) redirect("/login?error=invalid_invite_link");
  // GET never consumes a link: automated email scanners cannot complete the flow.
  return <ConfirmEmailForm tokenHash={query.token_hash} flow={query.type} />;
}
