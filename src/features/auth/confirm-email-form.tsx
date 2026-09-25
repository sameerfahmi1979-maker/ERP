"use client";
import { useState } from "react";
import { confirmEmailLink } from "./confirm-email-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
export function ConfirmEmailForm({ tokenHash, invitation, flow }: { tokenHash?: string; invitation?: string; flow: "invite" | "recovery" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Card className="w-full max-w-md border-t-4 border-t-amber-400"><CardHeader><CardTitle><h1>{flow === "invite" ? "Welcome to your ERP" : "Reset your password"}</h1></CardTitle>
    <CardDescription>{flow === "invite" ? "Your invitation is ready to verify. Continue to create your own password. You do not need an existing password." : "Continue to verify this one-time link and choose a new password."} If you are signed in to a different account, open this link in a private window.</CardDescription></CardHeader>
    <CardContent><form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try { window.location.replace(await confirmEmailLink(invitation ? { invitation } : { token_hash: tokenHash, type: flow })); }
      catch { setError("Verification is unavailable. Please try again, or request a new link."); }
      finally { setBusy(false); }
    }}><Button type="submit" disabled={busy}>{busy ? "Verifying…" : "Continue securely"}</Button>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </form></CardContent></Card>;
}
