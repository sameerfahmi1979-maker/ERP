"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signOut } from "./actions";
import { navigateAfterIdentityChange } from "@/lib/auth/client-session";
export function SignOutButton() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <div><Button variant="outline" disabled={busy} onClick={async () => {
    setBusy(true); setError("");
    try { const result = await signOut(); if (result.success) navigateAfterIdentityChange(); else setError(result.error ?? "Sign out failed."); }
    catch { setError("Sign out could not be confirmed. Please retry."); }
    finally { setBusy(false); }
  }}>Sign out</Button>{error && <p role="alert">{error}</p>}</div>;
}
