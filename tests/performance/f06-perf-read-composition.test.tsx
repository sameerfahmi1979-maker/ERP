// @vitest-environment jsdom
// Component integration only: synthetic transport, actual owner boundary and cache.
import React, {useLayoutEffect, useState} from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, render, waitFor} from "@testing-library/react";
import {type QueryClient, useQueryClient} from "@tanstack/react-query";
import {ReadCacheBoundary} from "@/components/layout/read-cache-boundary";
import {useServerPage, type ReadPage, type ServerPageSeed} from "@/hooks/use-server-page";
import {clearPrivateCaches} from "@/lib/query/private-cache";

type Row = {id: number; label: string};
const identity = {authUserId: "synthetic-composition", scopeVersion: "scope-one"};
const params = {page: 1, pageSize: 1};
const page = (id = 1): ReadPage<Row> => ({rows: [{id, label: `Synthetic ${id}`}], totalCount: 1, ...params});
const envelope = (id = 1): ServerPageSeed<Row> => ({identity, params, data: page(id), updatedAt: Date.now()});
let client: QueryClient;
const latest = new Map<string, ReturnType<typeof useServerPage<Row>>>();
function Grid({id = "one", seed, legacy = false, prefix, enabled = true, criteria = params}: {
  id?: string; seed?: ServerPageSeed<Row>; legacy?: boolean; prefix?: readonly unknown[]; enabled?: boolean; criteria?: Record<string, unknown>;
}) {
  // Real SSR props retain their read timestamp across client observer renders.
  // Generating a new one here would falsely claim newer server data on each fetch.
  const [initialSeed] = useState(() => envelope());
  const currentClient = useQueryClient();
  const read = useServerPage<Row>(legacy
    ? {resource: "composition", params: criteria, keyPrefix: prefix, enabled, seed: page(99), seedParams: params, updatedAt: initialSeed.updatedAt}
    : {resource: "composition", params: criteria, keyPrefix: prefix, enabled, seed: seed ?? initialSeed});
  useLayoutEffect(() => {client = currentClient;latest.set(id, read);});
  return <p data-testid={id}>{read.data?.rows[0]?.label ?? "unavailable"}</p>;
}
beforeEach(() => {latest.clear(); vi.stubGlobal("fetch", vi.fn());});
afterEach(() => {cleanup(); clearPrivateCaches(); client?.clear(); vi.unstubAllGlobals();});

it("reuses a matching server-owned PERF seed without an extra first request", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const view = render(<ReadCacheBoundary {...identity}><Grid/></ReadCacheBoundary>);
  await act(async () => {});
  expect(view.getByTestId("one").textContent).toBe("Synthetic 1");
  expect(fetcher).not.toHaveBeenCalled();
});

it("never renders a legacy unowned seed and admits only its fresh authorized result", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>(resolve => {finish = resolve;})); vi.stubGlobal("fetch", fetcher);
  const view = render(<ReadCacheBoundary {...identity}><Grid legacy/></ReadCacheBoundary>);
  expect(view.getByTestId("one").textContent).toBe("unavailable");
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  await act(async () => finish(Response.json({success: true, data: page(2)})));
  await waitFor(() => expect(view.getByTestId("one").textContent).toBe("Synthetic 2"));
  expect(client.getQueryCache().getAll().some(query => JSON.stringify(query.state.data)?.includes("Synthetic 99"))).toBe(false);
});

it("a typed old-owner seed cannot render or fetch under a replacement scope", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const view = render(<ReadCacheBoundary {...identity} scopeVersion="scope-two"><Grid seed={envelope(99)}/></ReadCacheBoundary>);
  await act(async () => {});
  expect(view.getByTestId("one").textContent).toBe("unavailable");
  expect(fetcher).not.toHaveBeenCalled();
  expect(client.getQueryCache().getAll().every(query => query.state.data === undefined)).toBe(true);
});

it("existing custom prefix invalidation still refreshes the composed owned read", async () => {
  const fetcher = vi.fn(async () => Response.json({success: true, data: page(2)})); vi.stubGlobal("fetch", fetcher);
  const view = render(<ReadCacheBoundary {...identity}><Grid prefix={["dms", "inbox", "sessions"]}/></ReadCacheBoundary>);
  expect(fetcher).not.toHaveBeenCalled();
  await act(async () => {await client.invalidateQueries({queryKey: ["dms", "inbox", "sessions"]});});
  await waitFor(() => expect(view.getByTestId("one").textContent).toBe("Synthetic 2"));
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("a denial masks the same resource across different custom prefix partitions without fan-out", async () => {
  const fetcher = vi.fn(async () => new Response("", {status: 403})); vi.stubGlobal("fetch", fetcher);
  const view = render(<ReadCacheBoundary {...identity}><Grid id="one" prefix={["dms", "one"]}/><Grid id="two" prefix={["dms", "two"]}/></ReadCacheBoundary>);
  expect(view.getByTestId("two").textContent).toBe("Synthetic 1");
  await act(async () => {await latest.get("one")!.refetch();});
  await waitFor(() => expect(view.getByTestId("one").textContent).toBe("unavailable"));
  expect(view.getByTestId("two").textContent).toBe("unavailable");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("returned refetch handles cannot resurrect a retired owner or repopulate its cache", async () => {
  const fetcher = vi.fn(async () => Response.json({success: true, data: page(2)})); vi.stubGlobal("fetch", fetcher);
  render(<ReadCacheBoundary {...identity}><Grid/></ReadCacheBoundary>);
  let result!: {refetch: () => Promise<unknown>};
  await act(async () => {result = await latest.get("one")!.refetch();});
  await act(async () => clearPrivateCaches());
  await expect(result.refetch()).rejects.toMatchObject({name: "AbortError"});
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(client.getQueryCache().getAll().every(query => query.state.data === undefined)).toBe(true);
});

it.each(["enabled", "seed identity"])("a retired %s retry handle stays retired after its admission returns", async mode => {
  const fetcher = vi.fn(async () => Response.json({success: true, data: page(2)})); vi.stubGlobal("fetch", fetcher);
  const seed = envelope();
  const tree = (withdrawn = false) => <ReadCacheBoundary {...identity}><Grid enabled={mode !== "enabled" || !withdrawn}
    seed={mode === "seed identity" && withdrawn ? {...seed, identity: {...identity, scopeVersion: "obsolete"}} : seed}/></ReadCacheBoundary>;
  const view = render(tree());
  const old = latest.get("one")!.refetch;
  view.rerender(tree(true));
  view.rerender(tree());
  await expect(old()).rejects.toMatchObject({name: "AbortError"});
  expect(fetcher).not.toHaveBeenCalled();
  await act(async () => {await latest.get("one")!.refetch();});
  expect(fetcher).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(view.getByTestId("one").textContent).toBe("Synthetic 2"));
});

it("a later admitted sibling retains the shared read after its first consumer unmounts", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) => {
    void _url; void _init;
    return new Promise<Response>(resolve => {finish = resolve;});
  }); vi.stubGlobal("fetch", fetcher);
  const seed = {...envelope(), updatedAt: Date.now() - 60000};
  const tree = (first = true, second = false) => <ReadCacheBoundary {...identity}>
    {first && <Grid key="first" id="first" seed={seed}/>}{second && <Grid key="second" id="second" seed={seed}/>}</ReadCacheBoundary>;
  const view = render(tree());
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const old = latest.get("first")!.refetch;
  view.rerender(tree(true, true));
  view.rerender(tree(false, true));
  await expect(old()).rejects.toMatchObject({name: "AbortError"});
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(false);
  await act(async () => finish(Response.json({success: true, data: page(2)})));
  await waitFor(() => expect(view.getByTestId("second").textContent).toBe("Synthetic 2"));
});

it.each(["disabled", "mismatched seed"])("the latest %s observer cannot block its admitted sibling's invalidation or retry", async mode => {
  let revision = 1;
  const fetcher = vi.fn(async () => Response.json({success: true, data: page(++revision)})); vi.stubGlobal("fetch", fetcher);
  const seed = envelope();
  const tree = (withdrawn = false) => <ReadCacheBoundary {...identity}>
    <Grid id="active" seed={seed}/><Grid id="last" enabled={mode !== "disabled" || !withdrawn}
      seed={mode === "mismatched seed" && withdrawn ? {...seed, identity: {...identity, scopeVersion: "obsolete"}} : seed}/></ReadCacheBoundary>;
  const view = render(tree());
  view.rerender(tree(true));
  await act(async () => {await client.invalidateQueries({queryKey: ["read", "composition"]});});
  await waitFor(() => expect(view.getByTestId("active").textContent).toBe("Synthetic 2"));
  expect(view.getByTestId("last").textContent).toBe("unavailable");
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => {await latest.get("active")!.refetch();});
  await waitFor(() => expect(view.getByTestId("active").textContent).toBe("Synthetic 3"));
  expect(view.getByTestId("last").textContent).toBe("unavailable");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each(["page", "search"])("a returned retry result cannot expose rows while the current %s criteria is unsettled", async mode => {
  const finish: ((response: Response) => void)[] = [];
  const fetcher = vi.fn(() => new Promise<Response>(resolve => {finish.push(resolve);})); vi.stubGlobal("fetch", fetcher);
  const seed = envelope();
  const tree = (changed = false) => <ReadCacheBoundary {...identity}><Grid seed={seed}
    criteria={!changed ? params : mode === "page" ? {...params, page: 2} : {...params, search: "changed"}}/></ReadCacheBoundary>;
  const view = render(tree());
  let pending!: ReturnType<ReturnType<typeof useServerPage<Row>>["refetch"]>;
  act(() => {pending = latest.get("one")!.refetch();});
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  view.rerender(tree(true));
  let returned!: Awaited<typeof pending>;
  await act(async () => {finish[0](Response.json({success: true, data: page(2)}));returned = await pending;});
  expect(returned.canUseData).toBe(false);
  expect(returned.data).toBeUndefined();
  expect(latest.get("one")!.canUseData).toBe(false);
});
