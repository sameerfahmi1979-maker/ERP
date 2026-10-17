// @vitest-environment jsdom
// Actual protected read boundary and hooks; synthetic transports only.
import React, {useLayoutEffect} from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, render, waitFor} from "@testing-library/react";
import {type QueryClient, useQueryClient} from "@tanstack/react-query";
import {ReadCacheBoundary} from "@/components/layout/read-cache-boundary";
import {clearPrivateCaches} from "@/lib/query/private-cache";
import {useConfigurationChoices} from "@/hooks/lookups/use-configuration-choices";
import {useLookupValuesQuery, useLookupBatchQuery} from "@/hooks/lookups/use-lookup-queries";

const state = vi.hoisted(() => ({calls: 0, defer: false, pending: [] as (() => void)[]}));
const row = {id: 1, value_code: "ONE", value_label_en: "Synthetic one", value_label_ar: null, name: "Synthetic one"};
vi.mock("@/lib/supabase/client", () => ({createClient: () => ({from: () => {
  const query: Record<string, unknown> = {
    then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) => {
      state.calls++;
      const result = {data: [row], count: 1, error: null, status: 200};
      return (state.defer ? new Promise(done => state.pending.push(() => done(result))) : Promise.resolve(result)).then(resolve, reject);
    },
  };
  for (const method of ["select", "retry", "order", "eq", "range", "abortSignal"]) query[method] = () => query;
  return query;
}})}));

type Kind = "configuration" | "lookup" | "batch";
const identity = {authUserId: "synthetic-lookup-owner", scopeVersion: "one"};
let clients: QueryClient[] = [];
let refetch: () => Promise<unknown>;
function Receipt({data, retry}: {data: unknown; retry: () => Promise<unknown>}) {
  const client = useQueryClient();
  useLayoutEffect(() => {if (!clients.includes(client)) clients.push(client); refetch = retry;}, [client, retry]);
  return <p data-testid="choices">{JSON.stringify(data)}</p>;
}
function ConfigurationGrid() {
  const read = useConfigurationChoices<{id: number; name: string}>("countries", ["master", "countries"], {}, item => ({value: item.id, label: item.name}));
  return <Receipt data={read.data} retry={read.refetch}/>;
}
function LookupGrid() {const read = useLookupValuesQuery("TEST"); return <Receipt data={read.data} retry={read.refetch}/>;}
function BatchGrid() {const read = useLookupBatchQuery(["TEST"]); return <Receipt data={read.data} retry={read.refetch}/>;}
const grids = {configuration: ConfigurationGrid, lookup: LookupGrid, batch: BatchGrid};
function tree(kind: Kind, owner = identity) {
  const Grid = grids[kind];
  return <ReadCacheBoundary {...owner}><Grid/></ReadCacheBoundary>;
}
beforeEach(() => {
  clients = []; state.calls = 0; state.defer = false; state.pending = [];
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    state.calls++;
    const result = () => Response.json({success: true, data: url.endsWith("lookup-batch") ? {TEST: [row]} : [row]});
    return state.defer ? new Promise(resolve => state.pending.push(() => resolve(result()))) : Promise.resolve(result());
  }));
});
afterEach(() => {cleanup(); clearPrivateCaches(); clients.forEach(client => client.clear()); vi.unstubAllGlobals();});

it.each((["configuration", "lookup", "batch"] as const).flatMap(kind =>
  (["clear", "unmount", "scope", "account"] as const).map(mode => [kind, mode] as const)
))("%s retained retry cannot recreate cache or fetch after %s", async (kind, mode) => {
  const view = render(tree(kind));
  await waitFor(() => expect(view.getByTestId("choices").textContent).toContain("Synthetic one"));
  const staleRetry = refetch, oldClient = clients[0];
  if (mode === "clear") await act(async () => clearPrivateCaches());
  if (mode === "unmount") view.unmount();
  if (mode === "scope" || mode === "account") {
    view.rerender(tree(kind, mode === "scope" ? {...identity, scopeVersion: "two"} : {...identity, authUserId: "synthetic-other"}));
    await waitFor(() => expect(view.getByTestId("choices").textContent).toContain("Synthetic one"));
  }
  const calls = state.calls;
  await act(async () => {await staleRetry();});
  expect(state.calls).toBe(calls);
  expect(oldClient.getQueryCache().getAll().every(query => query.state.data === undefined)).toBe(true);
});

it.each(["configuration", "lookup", "batch"] as const)("%s late retry result cannot refill the retired owner's cache", async kind => {
  const view = render(tree(kind));
  await waitFor(() => expect(view.getByTestId("choices").textContent).toContain("Synthetic one"));
  state.defer = true;
  let pending!: Promise<unknown>;
  act(() => {pending = refetch();});
  await waitFor(() => expect(state.pending).toHaveLength(1));
  await act(async () => clearPrivateCaches());
  await act(async () => {state.pending.forEach(finish => finish()); await pending;});
  expect(clients[0].getQueryCache().getAll().every(query => query.state.data === undefined)).toBe(true);
  expect(view.getByTestId("choices").textContent).not.toContain("Synthetic one");
});

it.each(["configuration", "lookup", "batch"] as const)("%s preserves coalescing when the dispatching sibling unmounts", async kind => {
  state.defer = true;
  const Grid = grids[kind];
  const content = (both: boolean) => <ReadCacheBoundary {...identity}>{both && <Grid key="first"/>}<Grid key="second"/></ReadCacheBoundary>;
  const view = render(content(true));
  await waitFor(() => expect(state.pending).toHaveLength(1));
  view.rerender(content(false));
  await act(async () => state.pending.forEach(finish => finish()));
  await waitFor(() => expect(view.getByTestId("choices").textContent).toContain("Synthetic one"));
  expect(state.calls).toBe(1);
});
