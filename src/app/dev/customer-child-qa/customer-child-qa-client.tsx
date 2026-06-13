"use client";

/**
 * DEV-ONLY QA harness — Phase 002F.3E.3B.6G.3
 * Customer Child Tables TanStack Query Migration.
 *
 * Runtime-proves with the PRODUCTION hooks:
 *  1. Enabled gating — a child hook mounted with customerId = null fires NO
 *     query (cache stays empty); with a real id it fires exactly once.
 *  2. Lazy probes — hooks fire only when their probe component mounts
 *     (mirrors the drawer's lazy-mounted sections).
 *  3. Targeted invalidation — invalidateCustomerContacts(qc, 1) marks ONLY
 *     ["child","customer_contacts",1] invalidated; addresses/banks untouched.
 */

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useCustomerContactsQuery,
  useCustomerAddressesQuery,
  useCustomerBankDetailsQuery,
} from "@/features/master-data/customers/hooks/use-customer-child-queries";
import {
  invalidateCustomerContacts,
  invalidateCustomerAddresses,
  invalidateCustomerBankDetails,
} from "@/lib/query/invalidation";
import { queryKeys } from "@/lib/query/query-keys";

const QA_CUSTOMER_ID = 1;

// ── Probe components (mount = drawer tab activation) ─────────────────────────

function ContactsProbe({ customerId }: { customerId: number | null }) {
  const q = useCustomerContactsQuery(customerId);
  return (
    <div className="text-xs font-mono">
      contacts(customerId={String(customerId)}) → loading={String(q.isLoading)}, fetching=
      {String(q.isFetching)}, items={q.items.length}, error={q.error ?? "none"}
    </div>
  );
}

function AddressesProbe({ customerId }: { customerId: number | null }) {
  const q = useCustomerAddressesQuery(customerId);
  return (
    <div className="text-xs font-mono">
      addresses(customerId={String(customerId)}) → loading={String(q.isLoading)}, fetching=
      {String(q.isFetching)}, items={q.items.length}, error={q.error ?? "none"}
    </div>
  );
}

function BankDetailsProbe({ customerId }: { customerId: number | null }) {
  const q = useCustomerBankDetailsQuery(customerId);
  return (
    <div className="text-xs font-mono">
      bankDetails(customerId={String(customerId)}) → loading={String(q.isLoading)}, fetching=
      {String(q.isFetching)}, items={q.items.length}, error={q.error ?? "none"}
    </div>
  );
}

// ── Cache inspector (child keys only) ─────────────────────────────────────────

function ChildCacheInspector() {
  const queryClient = useQueryClient();
  const [entries, setEntries] = React.useState<
    { key: string; status: string; fetchStatus: string; invalidated: boolean }[]
  >([]);

  const refresh = React.useCallback(() => {
    const all = queryClient.getQueryCache().findAll({ queryKey: ["child"] });
    setEntries(
      all.map((q) => ({
        key: JSON.stringify(q.queryKey),
        status: q.state.status,
        fetchStatus: q.state.fetchStatus,
        invalidated: q.state.isInvalidated,
      }))
    );
  }, [queryClient]);

  React.useEffect(() => {
    queueMicrotask(refresh);
    return queryClient.getQueryCache().subscribe(() => queueMicrotask(refresh));
  }, [queryClient, refresh]);

  return (
    <div className="border rounded-lg p-4 bg-muted/30">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
        Child query cache ({entries.length})
      </h3>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No child queries yet — proves nothing fires before probe mount.
        </p>
      ) : (
        <div className="space-y-1">
          {entries.map((e) => (
            <div key={e.key} className="flex items-center gap-2 text-[10px] font-mono">
              <Badge variant="outline" className="text-[9px] px-1 py-0">{e.status}</Badge>
              <Badge variant="outline" className="text-[9px] px-1 py-0">{e.fetchStatus}</Badge>
              {e.invalidated && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-500/40">
                  invalidated
                </Badge>
              )}
              <span className="text-muted-foreground truncate">{e.key}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Harness ───────────────────────────────────────────────────────────────────

export function CustomerChildQAClient() {
  const queryClient = useQueryClient();
  const [mountNullId, setMountNullId] = React.useState(false);
  const [mountContacts, setMountContacts] = React.useState(false);
  const [mountAddresses, setMountAddresses] = React.useState(false);
  const [mountBanks, setMountBanks] = React.useState(false);

  const seedMockChildCaches = () => {
    queryClient.setQueryData(queryKeys.child.customerContacts(QA_CUSTOMER_ID), []);
    queryClient.setQueryData(queryKeys.child.customerAddresses(QA_CUSTOMER_ID), []);
    queryClient.setQueryData(queryKeys.child.customerBankDetails(QA_CUSTOMER_ID), []);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-bold">Customer Child Tables QA — 3B.6G.3 (DEV ONLY)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Uses the production child hooks and invalidation helpers against customerId={QA_CUSTOMER_ID}.
        </p>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">A. Enabled gating + lazy probes</h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setMountNullId(true)}>
            Mount probe with customerId=null (must NOT fetch)
          </Button>
          <Button size="sm" onClick={() => setMountContacts(true)}>Mount contacts probe</Button>
          <Button size="sm" onClick={() => setMountAddresses(true)}>Mount addresses probe</Button>
          <Button size="sm" onClick={() => setMountBanks(true)}>Mount bank details probe</Button>
        </div>
        <div className="border rounded-lg p-3 space-y-1 min-h-10">
          {mountNullId && <ContactsProbe customerId={null} />}
          {mountContacts && <ContactsProbe customerId={QA_CUSTOMER_ID} />}
          {mountAddresses && <AddressesProbe customerId={QA_CUSTOMER_ID} />}
          {mountBanks && <BankDetailsProbe customerId={QA_CUSTOMER_ID} />}
          {!mountNullId && !mountContacts && !mountAddresses && !mountBanks && (
            <p className="text-xs text-muted-foreground">No probes mounted.</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">B. Targeted invalidation</h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={seedMockChildCaches}>
            Seed 3 child caches (mock empty rows)
          </Button>
          <Button size="sm" variant="outline" onClick={() => invalidateCustomerContacts(queryClient, QA_CUSTOMER_ID)}>
            Invalidate contacts ONLY
          </Button>
          <Button size="sm" variant="outline" onClick={() => invalidateCustomerAddresses(queryClient, QA_CUSTOMER_ID)}>
            Invalidate addresses ONLY
          </Button>
          <Button size="sm" variant="outline" onClick={() => invalidateCustomerBankDetails(queryClient, QA_CUSTOMER_ID)}>
            Invalidate bank details ONLY
          </Button>
        </div>
      </div>

      <ChildCacheInspector />
    </div>
  );
}
