"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearIdentityWorkspace } from "@/lib/auth/client-session";
export function SessionBoundary({ authUserId, children }: { authUserId: string; children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    let disposed = false;
    let checking = false;
    const leave = (destination = "/login") => {
      if (disposed) return;
      setBlocked(true); clearIdentityWorkspace(); window.location.replace(destination);
    };
    const check = async () => {
      if (checking || disposed) return;
      checking = true;
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) { setBlocked(true); return; }
        const state = await response.json();
        if (state.authUserId !== authUserId) leave();
        else if (!state.active) leave("/account-disabled");
        else if (state.requiredChange) leave("/change-password-required");
        else if (!disposed) setBlocked(false);
      } catch { if (!disposed) setBlocked(true); }
      finally { checking = false; }
    };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("algt-auth-state") : null;
    if (channel) channel.onmessage = () => leave();
    const { data } = createClient().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session && session.user.id !== authUserId)) leave();
    });
    const timer = window.setInterval(check, 60000);
    const onFocus = () => { void check(); };
    window.addEventListener("focus", onFocus);
    return () => { disposed = true; data.subscription.unsubscribe(); channel?.close(); clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [authUserId]);
  if (blocked) return <main className="p-8" role="alert">Your session needs verification. Please reload or sign in again.</main>;
  return children;
}
