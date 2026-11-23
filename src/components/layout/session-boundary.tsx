"use client";

import { useEffect, useState } from "react";
import { clearIdentityWorkspace } from "@/lib/auth/client-session";
import { createClient } from "@/lib/supabase/client";

export function SessionBoundary({ authUserId, scopeVersion, children }: { authUserId: string; scopeVersion?: string; children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let stopped = false;
    let pending: AbortController | null = null;

    const retire = (navigate: () => void) => {
      if (stopped) return;
      stopped = true;
      pending?.abort();
      setBlocked(true);
      clearIdentityWorkspace();
      navigate();
    };
    const leave = (destination = "/login") => retire(() => window.location.replace(destination));

    const check = async () => {
      if (stopped || pending) return;
      pending = new AbortController();
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "same-origin",
          signal: pending.signal,
        });
        if (stopped) return;
        if (!response.ok) {
          setBlocked(true);
          return;
        }

        const state = await response.json();
        if (stopped) return;
        if (state.authUserId !== authUserId) leave();
        else if (!state.active) leave("/account-disabled");
        else if (state.requiredChange) leave("/change-password-required");
        else if (scopeVersion && state.scopeVersion !== scopeVersion) retire(() => window.location.reload());
        else setBlocked(false);
      } catch {
        if (!stopped) setBlocked(true);
      } finally {
        pending = null;
      }
    };

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("algt-auth-state") : null;
    if (channel) channel.onmessage = () => leave();
    const { data } = createClient().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session && session.user.id !== authUserId)) leave();
    });
    const timer = window.setInterval(check, 60000);
    const checkForeground = () => {
      if (!document.hidden) void check();
    };

    window.addEventListener("focus", checkForeground);
    window.addEventListener("online", checkForeground);
    document.addEventListener("visibilitychange", checkForeground);

    return () => {
      stopped = true;
      pending?.abort();
      data.subscription.unsubscribe();
      channel?.close();
      window.clearInterval(timer);
      window.removeEventListener("focus", checkForeground);
      window.removeEventListener("online", checkForeground);
      document.removeEventListener("visibilitychange", checkForeground);
    };
  }, [authUserId, scopeVersion]);

  if (blocked) return <main className="p-8" role="alert">Your session needs verification. Please reload or sign in again.</main>;
  return children;
}
