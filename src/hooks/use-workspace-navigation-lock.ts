"use client";

import { useEffect } from "react";
import { toast } from "sonner";

type NavigationEvent = Event & {
  destination: { url: string };
  navigationType: string;
  hashChange: boolean;
  downloadRequest: string | null;
};

/** Respect browser escape rules: never rewrite history or trap a forced departure. */
export function useWorkspaceNavigationLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const warn = () => toast.warning("Finish or cancel this dialog, and wait for its save before leaving. Unsaved dialog entries are not restored after leaving this page.");
    const leavingRecord = (href: string) => {
      const target = new URL(href, location.href);
      // Authentication redirects must always win over draft retention.
      if (/^\/(login|logout|auth|reset-password|change-password)(\/|$)/.test(target.pathname)) return false;
      return target.origin === location.origin && target.pathname !== location.pathname;
    };
    const onNavigate = (event: Event) => {
      const nav = event as NavigationEvent;
      if (!nav.cancelable || nav.navigationType === "reload" || nav.hashChange || nav.downloadRequest != null || !leavingRecord(nav.destination.url)) return;
      nav.preventDefault();
      warn();
    };
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download") || !leavingRecord(anchor.href)) return;
      event.preventDefault();
      event.stopPropagation();
      warn();
    };
    const navigation = (window as unknown as { navigation?: EventTarget }).navigation;
    navigation?.addEventListener("navigate", onNavigate);
    document.addEventListener("click", onClick, true);
    return () => {
      navigation?.removeEventListener("navigate", onNavigate);
      document.removeEventListener("click", onClick, true);
    };
  }, [locked]);
}
