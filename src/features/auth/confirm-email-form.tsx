"use client";
import { useState } from "react";
import { confirmEmailLink } from "./confirm-email-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
export function ConfirmEmailForm({ tokenHash, flow }: { tokenHash: string; flow: "invite" | "recovery" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Card className="w-full max-w-md"><CardHeader><CardTitle>{flow === "invite" ? "Accept invitation" : "Reset your password"}</CardTitle>
    <CardDescription>Continue to verify this one-time link and choose your password. If you are signed in to a different account, sign out first.</CardDescription></CardHeader>
    <CardContent><form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try { window.location.assign(await confirmEmailLink({ token_hash: tokenHash, type: flow })); }
      catch { setError("Verification is unavailable. Please try again, or request a new link."); }
      finally { setBusy(false); }
    }}><Button type="submit" disabled={busy}>{busy ? "Verifying…" : "Continue securely"}</Button>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </form></CardContent></Card>;
}
