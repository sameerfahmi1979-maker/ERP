"use client";

/**
 * ERP REALTIME.1A — Core Realtime Sync Hook
 *
 * Subscribes to Supabase Postgres changes on a single table and calls
 * `onEvent` (debounced) whenever an INSERT, UPDATE, or DELETE lands.
 *
 * Rules:
 *  - Uses the browser Supabase client only (anon key + session cookie).
 *  - Never logs raw row payloads.
 *  - Does nothing when NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED !== "true".
 *  - Does nothing when `enabled` is false.
 *  - Cleans up the channel on unmount.
 *  - Only one channel per (table + filter + event) combination.
 */

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export type RealtimeSyncEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

export interface UseRealtimeSyncOptions {
  /** Supabase table name (public schema). */
  table: string;
  /** Postgres change event to listen for. Default: "*" (all events). */
  event?: RealtimeSyncEvent;
  /** Optional Supabase filter, e.g. "party_id=eq.42". */
  filter?: string;
  /** Whether to subscribe. When false the channel is not created. Default: true. */
  enabled?: boolean;
  /** Debounce delay in ms — multiple rapid events collapse into one callback. Default: 300. */
  debounceMs?: number;
  /** Called (debounced) when a matching database change arrives. */
  onEvent: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
}

const REALTIME_ENABLED =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_ERP_REALTIME_SYNC_ENABLED === "true";

export function useRealtimeSync({
  table,
  event = "*",
  filter,
  enabled = true,
  debounceMs = 300,
  onEvent,
}: UseRealtimeSyncOptions): void {
  // Keep a stable ref to onEvent so we don't need it in the effect dep array
  // (avoids re-subscribing every render just because the callback changes).
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!REALTIME_ENABLED || !enabled) return;

    const supabase = createClient();

    // Stable channel name: one channel per (table, filter, event) combination.
    const channelName = `realtime:${table}:${filter ?? "all"}:${event}`;

    // Build the Postgres changes filter object.
    // We use a type assertion because the dynamic `event` variable can be any of the
    // four valid enum values, but TypeScript cannot narrow it from string to the union
    // literal type required by the overloaded `.on()` signature.
    const pgFilter = {
      event: event as "*",
      schema: "public",
      table,
      ...(filter ? { filter } : {}),
    };

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        pgFilter,
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          // Debounce: collapse rapid bursts (e.g. bulk imports) into one callback.
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            // IMPORTANT: Never forward old_record/new_record to the callback consumer.
            // The onEvent callback must only trigger a query invalidation or router.refresh(),
            // never log or display sensitive payload data.
            onEventRef.current(payload);
          }, debounceMs);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, event, filter, enabled, debounceMs]);
}
