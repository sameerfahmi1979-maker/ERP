"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { signOut } from "@/features/auth/actions";
import { navigateAfterIdentityChange } from "@/lib/auth/client-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Props = { mode: "self" | "required" | "recovery"; onCancel?: () => void };

/** A new provider sign-in proves freshness; a token refresh does not. No password is retained here. */
export function PasswordReverification({ mode, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  const continueSecurely = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      const result = await signOut();
      if (!result.success) {
        setError("Sign out could not be confirmed. Try again; your password has not changed.");
        return;
      }
      // Fixed destinations only; no form input, password or external redirect is carried forward.
      const destination = mode === "recovery" ? "/forgot-password"
        : mode === "required" ? "/login?redirectTo=%2Fchange-password-required"
          : "/login?redirectTo=%2Fprofile";
      navigateAfterIdentityChange(destination);
    } catch {
      setError("The connection was interrupted. Try signing out again before continuing.");
    } finally {
      pending.current = false; setBusy(false);
    }
  };

  return <Card className="w-full max-w-md border-t-4 border-t-amber-400">
    <CardHeader className="gap-3">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="h-4 w-4" /> ALGT account security
      </p>
      <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold outline-offset-4">
        {mode === "recovery" ? "Open a new password link" : "Sign in again to continue"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {mode === "recovery" ? "This password-setup session needs to be renewed. Request a new link to choose your password."
          : "For your security, confirm your identity with a fresh sign-in, then return here to choose a new password. This can be required for an older or no-longer-valid session."}
      </p>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      <p className="text-sm">Your password has not changed. We have cleared the new password you entered.</p>
      <p className="text-sm text-muted-foreground">Save any other work first. Continuing signs out this browser and clears its saved workspace drafts.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="button" className="min-h-11 w-full" disabled={busy} onClick={() => void continueSecurely()}>
        {busy ? "Signing out…" : mode === "recovery" ? "Sign out and request a new link" : "Sign out and sign in again"}
      </Button>
      {mode === "self" && onCancel && <Button type="button" className="min-h-11 w-full" variant="outline" disabled={busy} onClick={onCancel}>Cancel password change</Button>}
    </CardContent>
  </Card>;
}
