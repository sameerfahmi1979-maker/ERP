import {afterEach, expect, it, vi} from "vitest";
import {QueryClient, QueryObserver} from "@tanstack/react-query";
import * as invalidate from "@/lib/query/invalidation";
type Operation = "list" | "attach" | "selected" | "summary";
const all: Operation[] = ["list", "attach", "selected", "summary"], clients: QueryClient[] = [];
const key = (operation: Operation, type = "employee", id = 7, owner = "synthetic-a", params = "{}") => ["dms", "entity-documents-read", owner, type, id, operation, params];
const settle = () => new Promise<void>(done => setTimeout(done, 0));
function client() {const q = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}}); clients.push(q); return q;}
afterEach(() => clients.splice(0).forEach(q => q.clear()));
const cases: {name: string; run: (q: QueryClient) => void; ops: Operation[]; parent?: string}[] = [
  {name: "document list", run: invalidate.invalidateDmsDocuments, ops: all},
  {name: "document metadata", run: q => invalidate.invalidateDmsDocument(q, 11), ops: all},
  {name: "record", run: q => invalidate.invalidateDmsDocumentRecord(q, 11), ops: all},
  {name: "apply metadata", run: q => invalidate.invalidateDmsApplyToErp(q, 11), ops: all},
  {name: "files", run: q => invalidate.invalidateDmsDocumentFiles(q, 11), ops: all},
  {name: "versions", run: q => invalidate.invalidateDmsDocumentVersions(q, 11), ops: all},
  {name: "file replacement", run: q => invalidate.invalidateDmsDocumentFileStorage(q, 11), ops: all},
  {name: "expiry metadata", run: q => invalidate.invalidateDmsDocumentExpiry(q, 11), ops: all},
  {name: "types", run: invalidate.invalidateDmsDocumentTypes, ops: all},
  {name: "admin", run: invalidate.invalidateAllDmsAdmin, ops: all},
  {name: "employee links", run: q => invalidate.invalidateDmsEntityDocuments(q, "employee", 7), ops: all, parent: "employee"},
  {name: "party links", run: q => invalidate.invalidatePartyDmsDocuments(q, 7), ops: all, parent: "party"},
  {name: "attachable pool", run: invalidate.invalidateDmsAvailableForLink, ops: ["attach", "selected"]},
  {name: "AI analysis", run: q => invalidate.invalidateDmsAiAnalysis(q, 11), ops: all},
  {name: "understanding", run: q => invalidate.invalidateDmsDocumentUnderstanding(q, 11), ops: ["attach", "selected"]},
  {name: "OCR", run: q => invalidate.invalidateDmsOcr(q, 11), ops: ["attach", "selected"]},
  {name: "file OCR", run: q => invalidate.invalidateDmsFileOcr(q, 11), ops: ["attach", "selected"]},
];
it.each(cases)("$name refreshes dependent operations/parents only", async ({run, ops, parent}) => {
  const q = client();
  for (const op of all) for (const type of ["employee", "party"]) for (const id of [7, 8]) for (const owner of ["synthetic-a", "synthetic-b"]) q.setQueryData(key(op, type, id, owner), {revision: 1});
  const untouched = [["workspace", "draft", 7], ["reports", "run", 2], ["dms", "unrelated"]]; for (const k of untouched) q.setQueryData(k, {keep: true});
  run(q); await settle();
  for (const op of all) for (const type of ["employee", "party"]) for (const id of [7, 8]) for (const owner of ["synthetic-a", "synthetic-b"]) {
    expect(q.getQueryState(key(op, type, id, owner))?.isInvalidated).toBe(ops.includes(op) && (parent === undefined || parent === type && id === 7));
    expect(q.getQueryData(key(op, type, id, owner))).toEqual({revision: 1});
  }
  for (const k of untouched) expect(q.getQueryState(k)?.isInvalidated).toBe(false);
});
it("same-tick exact-parent and shared attachment invalidations coalesce", async () => {
  const q = client(), k = key("attach"), old = key("attach", "employee", 7, "former"), read = vi.fn(async () => ({revision: 2}));
  q.setQueryData(k, {revision: 1}); q.setQueryData(old, {revision: 1});
  const observer = new QueryObserver(q, {queryKey: k, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {invalidate.invalidateDmsEntityDocuments(q, "employee", 7); invalidate.invalidateDmsAvailableForLink(q); invalidate.invalidateDmsDocumentFiles(q, 11); await settle();
    expect(read).toHaveBeenCalledTimes(1); expect(q.getQueryData(k)).toEqual({revision: 2}); expect(q.getQueryData(old)).toEqual({revision: 1});
  } finally {stop();}
});
it.each([false, true])("confirmed changes retire a preceding initial or warm request, cached=%s", async cached => {
  const q = client(), k = key("list"); if (cached) q.setQueryData(k, {revision: 0});
  let revision = 1, signal!: AbortSignal, finish!: () => void;
  const read = vi.fn(({signal: s}: {signal: AbortSignal}) => revision === 1 ? new Promise(resolve => {signal = s; finish = () => resolve({revision: 1});}) : Promise.resolve({revision}));
  const observer = new QueryObserver(q, {queryKey: k, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {if (cached) {invalidate.invalidateDmsDocumentFiles(q, 11); await settle();} expect(read).toHaveBeenCalledTimes(1);
    revision = 2; invalidate.invalidateDmsEntityDocuments(q, "employee", 7); await settle(); expect(signal.aborted).toBe(true); finish(); await settle();
    expect(read).toHaveBeenCalledTimes(2); expect(q.getQueryData(k)).toEqual({revision: 2});
  } finally {stop();}
});
it("observerless selected metadata is cancelled and cannot repopulate", async () => {
  const q = client(), k = key("selected", "party", 7, "former"); let signal!: AbortSignal, finish!: () => void;
  const read = vi.fn(({signal: s}: {signal: AbortSignal}) => new Promise(resolve => {signal = s; finish = () => resolve({private: "synthetic"});}));
  const pending = q.fetchQuery({queryKey: k, queryFn: read}).catch(() => null);
  invalidate.invalidateDmsAvailableForLink(q); await settle(); expect(signal.aborted).toBe(true); finish(); await pending; await settle();
  expect(read).toHaveBeenCalledTimes(1); expect(q.getQueryData(k)).toBeUndefined();
});
it("disabled and removed owner queries are never resurrected by queued refresh", async () => {
  const q = client(), removed = key("summary"), disabled = key("attach"), read = vi.fn(async () => ({revision: 2}));
  q.setQueryData(removed, {revision: 1}); q.setQueryData(disabled, {revision: 1});
  const observer = new QueryObserver(q, {queryKey: disabled, queryFn: read, enabled: false}), stop = observer.subscribe(() => {});
  try {invalidate.invalidateDmsDocuments(q); q.removeQueries({queryKey: removed, exact: true}); await settle(); expect(read).not.toHaveBeenCalled(); expect(q.getQueryData(removed)).toBeUndefined();}
  finally {stop();}
});
