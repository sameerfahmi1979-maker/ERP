"use client";

/**
 * DEV-ONLY QA harness — Phase 002F.3E.3B.6G.2
 * Customer Basic Tab Lookup Prefetch Wiring.
 *
 * Proves at runtime that:
 *  1. prefetchLookupCategories runs ONE batch action and seeds the SIX
 *     individual ["lookup","values",CODE,null,false] keys.
 *  2. LookupSelect components for the Customer categories read those seeded
 *     keys directly — no per-field server actions fire after seeding.
 *  3. prefetchMasterDataQueries warms countries/currencies/payment terms/
 *     tax types under the exact keys the master hooks read.
 *
 * Two modes:
 *  - "Live prefetch": calls the real batch server action (requires an
 *    authenticated session — run while logged in to the ERP).
 *  - "Offline seed proof": seeds the cache via seedLookupCategoryValues with
 *    synthetic rows; works without a session and proves the seeding/read
 *    mechanism in isolation.
 */

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LookupSelect } from "@/components/erp/lookup-select";
import {
  prefetchLookupCategories,
  prefetchMasterDataQueries,
  seedLookupCategoryValues,
  type PrefetchLookupResult,
} from "@/lib/query/prefetch-lookups";
import {
  CUSTOMER_FORM_PREFETCH,
  CUSTOMER_LOOKUP_CATEGORIES,
} from "@/features/master-data/customers/customer-prefetch";
import type { LookupValue } from "@/features/master-data/lookups/types";

// ── Synthetic rows for the offline proof ──────────────────────────────────────

function mockValue(id: number, categoryCode: string, n: number): LookupValue {
  const now = new Date().toISOString();
  return {
    id,
    category_id: id * 100,
    value_code: `${categoryCode}_V${n}`,
    value_label_en: `${categoryCode.replaceAll("_", " ")} option ${n}`,
    value_label_ar: null,
    description: null,
    parent_value_id: null,
    color_hex: null,
    icon_name: null,
    badge_variant: null,
    sort_order: n,
    is_default: n === 1,
    is_system: false,
    is_locked: false,
    is_active: true,
    effective_from: null,
    effective_to: null,
    metadata_json: {},
    created_at: now,
    created_by: null,
    updated_at: now,
    updated_by: null,
    deactivated_at: null,
    deactivated_by: null,
    deactivation_reason: null,
  };
}

function buildMockBatchResult(): Record<string, LookupValue[]> {
  const out: Record<string, LookupValue[]> = {};
  CUSTOMER_LOOKUP_CATEGORIES.forEach((code, ci) => {
    out[code] = [1, 2, 3].map((n) => mockValue(ci * 1000 + n, code, n));
  });
  return out;
}

// ── Cache inspector ───────────────────────────────────────────────────────────

function CacheInspector() {
  const queryClient = useQueryClient();
  const [entries, setEntries] = React.useState<
    { key: string; status: string; fetchStatus: string; updated: number }[]
  >([]);

  const refresh = React.useCallback(() => {
    const all = queryClient.getQueryCache().findAll();
    setEntries(
      all
        .filter((q) => {
          const head = q.queryKey[0];
          return head === "lookup" || head === "master";
        })
        .map((q) => ({
          key: JSON.stringify(q.queryKey),
          status: q.state.status,
          fetchStatus: q.state.fetchStatus,
          updated: q.state.dataUpdatedAt,
        }))
    );
  }, [queryClient]);

  React.useEffect(() => {
    // Defer: cache events can fire synchronously inside another component's
    // render (e.g. useQuery registering); setState there triggers a React warning.
    queueMicrotask(refresh);
    return queryClient.getQueryCache().subscribe(() => queueMicrotask(refresh));
  }, [queryClient, refresh]);

  return (
    <div className="border rounded-lg p-4 bg-muted/30">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
        Query cache — lookup/master entries ({entries.length})
      </h3>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">Cache empty. Run a prefetch action above.</p>
      ) : (
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {entries.map((e) => (
            <div key={e.key} className="flex items-center gap-2 text-[10px] font-mono">
              <Badge
                variant="outline"
                className={`text-[9px] px-1 py-0 ${
                  e.status === "success"
                    ? "text-emerald-600 border-emerald-500/30"
                    : "text-amber-600 border-amber-500/30"
                }`}
              >
                {e.status}
              </Badge>
              <Badge variant="outline" className="text-[9px] px-1 py-0">
                {e.fetchStatus}
              </Badge>
              <span className="text-muted-foreground truncate max-w-[420px]">{e.key}</span>
              {e.updated > 0 && (
                <span className="text-muted-foreground/60 ml-auto shrink-0">
                  {new Date(e.updated).toLocaleTimeString()}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Harness ───────────────────────────────────────────────────────────────────

export function CustomerPrefetchQAClient() {
  const queryClient = useQueryClient();
  const [lookupResult, setLookupResult] = React.useState<PrefetchLookupResult | null>(null);
  const [masterResult, setMasterResult] = React.useState<string | null>(null);
  const [seedResult, setSeedResult] = React.useState<PrefetchLookupResult | null>(null);
  const [showSelects, setShowSelects] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, string | number | null>>({});

  const runLivePrefetch = async () => {
    setLookupResult(null);
    setMasterResult(null);
    const [lookups, masters] = await Promise.all([
      prefetchLookupCategories(queryClient, CUSTOMER_FORM_PREFETCH.lookupCategories),
      prefetchMasterDataQueries(queryClient, CUSTOMER_FORM_PREFETCH.masterQueries),
    ]);
    setLookupResult(lookups);
    setMasterResult(
      masters.error
        ? `error: ${masters.error}`
        : `${masters.prefetchedKeys.length}/${masters.requestedCount} master lists warmed`
    );
  };

  const runOfflineSeed = () => {
    const result = seedLookupCategoryValues(queryClient, buildMockBatchResult());
    setSeedResult(result);
  };

  const resetCache = () => {
    queryClient.getQueryCache().clear();
    setLookupResult(null);
    setMasterResult(null);
    setSeedResult(null);
    setShowSelects(false);
    setValues({});
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-bold">Customer Prefetch QA — 3B.6G.2 (DEV ONLY)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Declaration: <code>CUSTOMER_FORM_PREFETCH</code> — {CUSTOMER_LOOKUP_CATEGORIES.length} lookup
          categories, {CUSTOMER_FORM_PREFETCH.masterQueries.length} master queries.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void runLivePrefetch()}>
          1a. Live prefetch (needs login)
        </Button>
        <Button size="sm" variant="secondary" onClick={runOfflineSeed}>
          1b. Offline seed proof (no login)
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowSelects(true)}>
          2. Mount the 6 Customer LookupSelects
        </Button>
        <Button size="sm" variant="ghost" onClick={resetCache}>
          Reset cache
        </Button>
      </div>

      {(lookupResult || masterResult || seedResult) && (
        <div className="border rounded-lg p-4 text-xs font-mono space-y-1 bg-muted/30">
          {lookupResult && (
            <p>
              live batch → requested {lookupResult.requestedCodes.length}, seeded{" "}
              {lookupResult.seededCodes.length}, missing {lookupResult.missingCodes.length}, values{" "}
              {lookupResult.seededCount}
              {lookupResult.error ? ` — ERROR: ${lookupResult.error}` : ""}
            </p>
          )}
          {masterResult && <p>live master → {masterResult}</p>}
          {seedResult && (
            <p>
              offline seed → requested {seedResult.requestedCodes.length}, seeded{" "}
              {seedResult.seededCodes.length}, values {seedResult.seededCount}
            </p>
          )}
        </div>
      )}

      {showSelects && (
        <div className="border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold">
            Customer Basic tab LookupSelects (should render together from seeded cache)
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {CUSTOMER_LOOKUP_CATEGORIES.map((code) => (
              <div key={code} className="space-y-1">
                <label className="text-xs text-muted-foreground">{code}</label>
                <LookupSelect
                  categoryCode={code}
                  value={values[code] ?? null}
                  onValueChange={(v) => setValues((prev) => ({ ...prev, [code]: v }))}
                  placeholder={`Select ${code.toLowerCase()}...`}
                  allowClear
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <CacheInspector />
    </div>
  );
}
