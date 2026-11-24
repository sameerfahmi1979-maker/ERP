"use client";
import { useEffect, useLayoutEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearIdentityWorkspace } from "@/lib/auth/client-session";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { clearMessagingSession, offlineMessagingSession, bindTransportSession } from "@/features/messages/offline-session";
const OfflineMessages = dynamic(() => import("@/features/messages/messages").then(m => m.Messages));
export function SessionBoundary({ authUserId, scopeVersion, sessionTag, children }: { authUserId: string; scopeVersion?: string; sessionTag?:string; children: React.ReactNode }) {
  useLayoutEffect(()=>{bindTransportSession(sessionTag);},[sessionTag]);
  const [blocked, setBlocked] = useState(false);
  const [offline, setOffline] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    let disposed = false;
    let checking = false;
    let controller:AbortController|null=null;
    const leave = (destination = "/login") => {
      if (disposed) return;
      clearMessagingSession(); setOffline(false); setBlocked(true); clearIdentityWorkspace(); window.location.replace(destination);
    };
    const check = async () => {
      if (checking || disposed) return;
      checking = true;
      controller=new AbortController();
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin",signal:controller.signal });
        if(disposed)return;
        setOffline(false);
        if (!response.ok) { if([401,403].includes(response.status))clearMessagingSession(); setBlocked(true); return; }
        const state = await response.json();
        if(disposed)return;
        if (state.authUserId !== authUserId) leave();
        else if (!state.active) leave("/account-disabled");
        else if (state.requiredChange) leave("/change-password-required");
        else if (scopeVersion && state.scopeVersion !== scopeVersion) { setBlocked(true); clearIdentityWorkspace(); window.location.reload(); }
        else if (!disposed) setBlocked(false);
      } catch { if (!disposed) { setOffline(!navigator.onLine); setBlocked(true); } }
      finally { checking = false; }
    };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("algt-auth-state") : null;
    if (channel) channel.onmessage = () => leave();
    const { data } = createClient().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session && session.user.id !== authUserId)) leave();
      else if(event==="TOKEN_REFRESHED")window.dispatchEvent(new Event("algt-chat-reseal"));
    });
    const timer = window.setInterval(check, 60000);
    const onFocus = () => { void check(); };
    window.addEventListener("focus", onFocus);
    const onOnline = () => { setOffline(false); void check(); };
    window.addEventListener("online", onOnline);
    return () => { disposed = true; controller?.abort(); data.subscription.unsubscribe(); channel?.close(); clearInterval(timer); window.removeEventListener("focus", onFocus); window.removeEventListener("online", onOnline); };
  }, [authUserId, scopeVersion]);
  if (blocked && offline && pathname === "/messages") {
    const binding = offlineMessagingSession(authUserId);
    if (binding) return <OfflineMessages {...binding}/>;
  }
  if (blocked) return <main className="p-8" role="alert">Your session needs verification. Please reload or sign in again.</main>;
  return children;
}
