"use client";

/**
 * ERP GLOBAL UI.4E — useWorkspaceScrollState
 *
 * Remembers scroll position of opened lists, forms, and record content when
 * switching workspace tabs or remounting.
 *
 * Usage:
 *   const scrollRef = useRef<HTMLDivElement>(null);
 *   useWorkspaceScrollState({
 *     key: "record-body",
 *     ref: scrollRef,
 *     scope: "record",
 *     recordType: "party",
 *     recordId: party.id,
 *   });
 *
 * On mount: restores scrollTop / scrollLeft.
 * On scroll: debounces and saves scrollTop / scrollLeft.
 * On unmount: saves current scroll.
 *
 * SSR-safe — all scroll access is guarded by typeof window.
 */

import { useEffect, useRef, useMemo, type RefObject } from "react";
import {
  buildPageStateKey,
  type WorkspacePageStateScope,
} from "@/lib/workspace/workspace-page-state";
import { usePersistentUiState } from "./use-persistent-ui-state";

interface ScrollPosition {
  scrollTop: number;
  scrollLeft: number;
}

interface UseWorkspaceScrollStateOptions {
  key: string;
  ref: RefObject<HTMLElement | null>;
  enabled?: boolean;
  scope?: WorkspacePageStateScope;
  recordType?: string;
  recordId?: string | number;
  identifier?: string;
}

const DEBOUNCE_MS = 200;

export function useWorkspaceScrollState(
  options: UseWorkspaceScrollStateOptions
): void {
  const {
    key,
    ref,
    enabled = true,
    scope = "record",
    recordType,
    recordId,
    identifier,
  } = options;

  const resolvedIdentifier = useMemo(() => {
    if (scope === "record" && recordType && recordId !== undefined && recordId !== null) {
      return `${recordType}:${recordId}`;
    }
    return identifier ?? "unknown";
  }, [scope, recordType, recordId, identifier]);

  const storageKey = useMemo(
    () => buildPageStateKey(scope, resolvedIdentifier, key),
    [scope, resolvedIdentifier, key]
  );

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saved,setSaved]=usePersistentUiState<ScrollPosition>(storageKey,{scrollTop:0,scrollLeft:0});
  const savedRef=useRef(saved);
  useEffect(()=>{savedRef.current=saved;},[saved]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const el = ref.current;
    if (!el) return;

    // Restore scroll position
    el.scrollTop = savedRef.current.scrollTop;
    el.scrollLeft = savedRef.current.scrollLeft;

    const handleScroll = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setSaved({
          scrollTop: el.scrollTop,
          scrollLeft: el.scrollLeft,
        });
      }, DEBOUNCE_MS);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      el.removeEventListener("scroll", handleScroll);
      // Save final scroll on unmount
      if (timerRef.current) clearTimeout(timerRef.current);
      setSaved({
        scrollTop: el.scrollTop,
        scrollLeft: el.scrollLeft,
      });
    };
  // storageKey changes when recordId changes — re-attach
  }, [enabled, ref, storageKey, setSaved]);
}
