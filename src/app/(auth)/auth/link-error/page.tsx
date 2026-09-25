import Link from "next/link";
import { loadRuntimeAppBranding } from "@/lib/branding/load-runtime-app-branding";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AuthLinkErrorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const branding = await loadRuntimeAppBranding();
  const mismatch = query.reason === "account_mismatch";
  const unavailable = query.reason === "auth_unavailable";
  const recovery = query.flow === "recovery";
  const support = branding.supportEmail?.trim();
  const safeSupport = support && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(support) ? support : null;
  return <Card className="w-full max-w-md border-t-4 border-t-amber-400">
    <CardHeader>
      <p className="mb-2 text-sm font-medium text-muted-foreground">{branding.appName} · Account setup</p>
      <CardTitle><h1>{mismatch ? "A different account is signed in" : unavailable ? "We couldn’t complete verification" : recovery ? "This reset link is no longer available" : "This invitation is no longer available"}</h1></CardTitle>
      <CardDescription role="alert">{mismatch
        ? "Your current account has not been replaced. Open the invitation in a private browser window to continue with the invited account."
        : unavailable ? "Verification could not be completed safely. Request a fresh link before trying again."
        : "The link may have expired, already been used or been replaced by a newer email. You cannot set a password with this link."}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      {!mismatch && <p className="text-sm">{recovery ? "Request a new password-reset email and open the most recent message." : "Ask your ERP administrator to resend your invitation. A new invitation gives you 24 hours to begin activation; it does not require an existing password."}</p>}
      {recovery && <Link className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-4" href="/forgot-password">Request a new reset link</Link>}
      {!recovery && safeSupport && <a className="inline-flex min-h-11 items-center rounded-md bg-primary px-5 font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-4" href={`mailto:${safeSupport}?subject=ERP%20invitation%20assistance`}>Contact your administrator</a>}
      <p className="text-sm text-muted-foreground">Never forward your activation link or share your password.</p>
      <Link className="inline-flex min-h-11 items-center text-sm underline underline-offset-4" href="/login">Already set your password? Go to sign in</Link>
    </CardContent>
  </Card>;
}
