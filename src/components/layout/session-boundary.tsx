"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearIdentityWorkspace } from "@/lib/auth/client-session";
export function SessionBoundary({ authUserId, scopeVersion, children }: { authUserId: string; scopeVersion?: string; children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    let disposed = false;
    let checking = false;
    let controller:AbortController|null=null;
    const leave = (destination = "/login") => {
      if (disposed) return;
      setBlocked(true); clearIdentityWorkspace(); window.location.replace(destination);
    };
    const check = async () => {
      if (checking || disposed) return;
      checking = true;
      controller=new AbortController();
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin",signal:controller.signal });
        if(disposed)return;
        if (!response.ok) { setBlocked(true); return; }
        const state = await response.json();
        if(disposed)return;
        if (state.authUserId !== authUserId) leave();
        else if (!state.active) leave("/account-disabled");
        else if (state.requiredChange) leave("/change-password-required");
        else if (scopeVersion && state.scopeVersion !== scopeVersion) { setBlocked(true); clearIdentityWorkspace(); window.location.reload(); }
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
    return () => { disposed = true; controller?.abort(); data.subscription.unsubscribe(); channel?.close(); clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [authUserId, scopeVersion]);
  if (blocked) return <main className="p-8" role="alert">Your session needs verification. Please reload or sign in again.</main>;
  return children;
}
