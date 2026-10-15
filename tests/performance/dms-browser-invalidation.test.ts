import {afterEach, expect, it, vi} from "vitest";
import {QueryClient, QueryObserver} from "@tanstack/react-query";
import * as invalidation from "@/lib/query/invalidation";

type Operation = "search" | "files" | "types";
const operations: Operation[] = ["search", "files", "types"], clients: QueryClient[] = [];
const key = (op: Operation, owner = "owner-a", criteria = "{}") => ["dms", "browser", owner, op, criteria];
const settle = () => new Promise<void>(done => setTimeout(done, 0));
function client() {const q = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}}); clients.push(q); return q;}
afterEach(() => clients.splice(0).forEach(q => q.clear()));

const cases: {name: string; run: (q: QueryClient) => void; operations: Operation[]}[] = [
  {name: "document list", run: invalidation.invalidateDmsDocuments, operations: ["search", "files"]},
  {name: "document metadata", run: q => invalidation.invalidateDmsDocument(q, 11), operations: ["search", "files"]},
  {name: "record", run: q => invalidation.invalidateDmsDocumentRecord(q, 11), operations: ["search", "files"]},
  {name: "confirmed apply metadata", run: q => invalidation.invalidateDmsApplyToErp(q, 11), operations: ["search", "files"]},
  {name: "files", run: q => invalidation.invalidateDmsDocumentFiles(q, 11), operations: ["search", "files"]},
  {name: "versions", run: q => invalidation.invalidateDmsDocumentVersions(q, 11), operations: ["search", "files"]},
  {name: "file replacement", run: q => invalidation.invalidateDmsDocumentFileStorage(q, 11), operations: ["search", "files"]},
  {name: "entity link", run: q => invalidation.invalidateDmsEntityDocuments(q, "employee", 7), operations: ["search"]},
  {name: "party link", run: q => invalidation.invalidatePartyDmsDocuments(q, 7), operations: ["search"]},
  {name: "expiry metadata", run: q => invalidation.invalidateDmsDocumentExpiry(q, 11), operations: ["search", "files"]},
  {name: "OCR text", run: q => invalidation.invalidateDmsOcr(q, 11), operations: ["search"]},
  {name: "file OCR text", run: q => invalidation.invalidateDmsFileOcr(q, 11), operations: ["search"]},
  {name: "type labels and state", run: invalidation.invalidateDmsDocumentTypes, operations},
  {name: "all DMS admin labels", run: invalidation.invalidateAllDmsAdmin, operations},
];
it.each(cases)("$name refreshes only affected browser operations across principal and criteria variants", async ({run, operations: affected}) => {
  const q = client(), untouched = [["workspace", "draft", 7], ["reports", "run", 2], ["dms", "browser-other"]];
  for (const op of operations) for (const owner of ["owner-a", "owner-b"]) for (const criteria of ["{}", '{"query":"علي"}', '{"documentId":11,"offset":100}']) q.setQueryData(key(op, owner, criteria), {revision: 1});
  for (const k of untouched) q.setQueryData(k, {keep: true});
  run(q); await settle();
  for (const op of operations) for (const owner of ["owner-a", "owner-b"]) for (const criteria of ["{}", '{"query":"علي"}', '{"documentId":11,"offset":100}']) {
    expect(q.getQueryState(key(op, owner, criteria))?.isInvalidated).toBe(affected.includes(op));
    expect(q.getQueryState(key(op, owner, criteria))?.fetchStatus).toBe("idle");
    expect(q.getQueryData(key(op, owner, criteria))).toEqual({revision: 1});
  }
  for (const k of untouched) {expect(q.getQueryState(k)?.isInvalidated).toBe(false); expect(q.getQueryData(k)).toEqual({keep: true});}
});
it("same-tick record/file/version signals coalesce without fetching an inactive principal", async () => {
  const q = client(), active = key("search"), inactive = key("search", "old-owner"), read = vi.fn(async () => ({revision: 2}));
  q.setQueryData(active, {revision: 1}); q.setQueryData(inactive, {revision: 1});
  const observer = new QueryObserver(q, {queryKey: active, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {
    invalidation.invalidateDmsDocuments(q); invalidation.invalidateDmsDocument(q, 11); invalidation.invalidateDmsDocumentFileStorage(q, 11);
    await settle(); expect(read).toHaveBeenCalledTimes(1); expect(q.getQueryData(active)).toEqual({revision: 2}); expect(q.getQueryData(inactive)).toEqual({revision: 1});
  } finally {stop();}
});
it.each([false, true])("a later confirmed change replaces old browser requests, cached=%s", async cached => {
  const q = client(), k = key("files"); if (cached) q.setQueryData(k, {revision: 0});
  let revision = 1, signal!: AbortSignal, finish!: () => void;
  const read = vi.fn(({signal: s}: {signal: AbortSignal}) => revision === 1 ? new Promise<{revision: number}>(done => {signal = s; finish = () => done({revision: 1});}) : Promise.resolve({revision}));
  const observer = new QueryObserver(q, {queryKey: k, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {
    if (cached) {invalidation.invalidateDmsDocumentFiles(q, 11); await settle();}
    expect(read).toHaveBeenCalledTimes(1); revision = 2; invalidation.invalidateDmsDocumentFileStorage(q, 11); await settle();
    expect(signal.aborted).toBe(true); finish(); await settle(); expect(read).toHaveBeenCalledTimes(2); expect(q.getQueryData(k)).toEqual({revision: 2});
  } finally {stop();}
});
it("observerless reads are aborted without refetch and late data cannot return", async () => {
  const q = client(), k = key("search", "retired-owner"); let signal!: AbortSignal, finish!: () => void;
  const read = vi.fn(({signal: s}: {signal: AbortSignal}) => new Promise(resolve => {signal = s; finish = () => resolve({private: "synthetic"});}));
  const promise = q.fetchQuery({queryKey: k, queryFn: read}).catch(() => null);
  invalidation.invalidateDmsDocuments(q); await settle(); expect(signal.aborted).toBe(true); finish(); await promise; await settle();
  expect(read).toHaveBeenCalledTimes(1); expect(q.getQueryData(k)).toBeUndefined();
});
it("queued refresh cannot resurrect removed or disabled owners", async () => {
  const q = client(), removed = key("search", "removed"), disabled = key("files", "disabled"), read = vi.fn(async () => ({revision: 2}));
  q.setQueryData(removed, {revision: 1}); q.setQueryData(disabled, {revision: 1});
  const observer = new QueryObserver(q, {queryKey: disabled, queryFn: read, enabled: false}), stop = observer.subscribe(() => {});
  try {invalidation.invalidateDmsDocuments(q); q.removeQueries({queryKey: removed, exact: true}); await settle(); expect(read).not.toHaveBeenCalled(); expect(q.getQueryData(removed)).toBeUndefined();}
  finally {stop();}
});
