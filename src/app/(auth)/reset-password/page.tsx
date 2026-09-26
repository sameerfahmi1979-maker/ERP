import { ResetPasswordForm } from "@/features/auth/reset-password-form";
import { createClient } from "@/lib/supabase/server";
import { getPasswordFlowContext, type PasswordFlowContext } from "@/lib/auth/password-flow";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default async function ResetPasswordPage() {
  let flow: PasswordFlowContext | null = null;
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (!error && user) {
      const claims = await client.auth.getClaims();
      const sessionId = claims.data?.claims.session_id;
      const session = await client.rpc("f03_current_session_valid");
      if (!claims.error && !session.error && session.data === true && typeof sessionId === "string") {
        flow = await getPasswordFlowContext(user.id, sessionId);
      }
    }
  } catch { /* No valid proof: render recovery guidance without changing a session. */ }
  if (!flow) return <Card className="w-full max-w-md"><CardHeader><CardTitle>Password link required</CardTitle>
    <CardDescription>This setup session is missing, expired, or already used. If you started invitation setup but did not finish, request a password-reset email below. You do not need an existing password. Do not reopen the consumed invitation.</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-3"><Link className="text-primary underline" href="/forgot-password">Request a new reset link</Link><Link className="text-primary underline" href="/login">Back to sign in</Link></CardContent></Card>;
  return <ResetPasswordForm flow={flow.type} />;
}
