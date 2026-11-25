"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { bindTransportSession, clearMessagingSession, offlineMessagingSession } from "@/features/messages/offline-session";
import { clearIdentityWorkspace } from "@/lib/auth/client-session";
import { createClient } from "@/lib/supabase/client";

const OfflineMessages = dynamic(() => import("@/features/messages/messages").then(module => module.Messages));

export function SessionBoundary({ authUserId, scopeVersion, sessionTag, children }: {
  authUserId: string;
  scopeVersion?: string;
  sessionTag?: string;
  children: React.ReactNode;
}) {
  const [blocked, setBlocked] = useState(false);
  const [offline, setOffline] = useState(false);
  const pathname = usePathname();

  useLayoutEffect(() => {
    bindTransportSession(sessionTag);
  }, [sessionTag]);

  useEffect(() => {
    let stopped = false;
    let pending: AbortController | null = null;

    const retire = (navigate: () => void) => {
      if (stopped) return;
      stopped = true;
      pending?.abort();
      setOffline(false);
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
        setOffline(false);
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) clearMessagingSession();
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
        if (!stopped) {
          setOffline(!navigator.onLine);
          setBlocked(true);
        }
      } finally {
        pending = null;
      }
    };

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("algt-auth-state") : null;
    if (channel) channel.onmessage = () => leave();
    const { data } = createClient().auth.onAuthStateChange((event, session) => {
      if (stopped) return;
      if (event === "SIGNED_OUT" || (session && session.user.id !== authUserId)) leave();
      else if (event === "TOKEN_REFRESHED") window.dispatchEvent(new Event("algt-chat-reseal"));
    });
    const timer = window.setInterval(check, 60000);
    const checkForeground = () => {
      if (!document.hidden) void check();
    };
    const onOnline = () => {
      if (stopped) return;
      setOffline(false);
      checkForeground();
    };

    window.addEventListener("focus", checkForeground);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", checkForeground);

    return () => {
      stopped = true;
      pending?.abort();
      data.subscription.unsubscribe();
      channel?.close();
      window.clearInterval(timer);
      window.removeEventListener("focus", checkForeground);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", checkForeground);
    };
  }, [authUserId, scopeVersion]);

  if (blocked && offline && pathname === "/messages") {
    const binding = offlineMessagingSession(authUserId);
    if (binding) return <OfflineMessages {...binding} />;
  }
  if (blocked) return <main className="p-8" role="alert">Your session needs verification. Please reload or sign in again.</main>;
  return children;
}
