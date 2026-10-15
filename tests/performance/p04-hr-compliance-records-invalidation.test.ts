import {afterEach, expect, it, vi} from "vitest";
import {QueryClient, QueryObserver} from "@tanstack/react-query";
import * as invalidate from "@/lib/query/invalidation";
import {COMPLIANCE_KINDS, type ComplianceKind} from "@/lib/reads/hr-compliance-records-schema";

const clients: QueryClient[] = [];
const key = (kind: ComplianceKind, employee = 7, owner = "synthetic-a", operation = "page", criteria = "{}") => ["hr", "compliance-records", employee, kind, owner, operation, criteria];
const settle = () => new Promise<void>(done => setTimeout(done, 0));
function client() {const qc = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}}); clients.push(qc); return qc;}
afterEach(() => clients.splice(0).forEach(qc => qc.clear()));
const changes: {name: string; run: (q: QueryClient) => void; kinds: readonly ComplianceKind[]; employee?: number}[] = [
  {name: "identity records", run: q => invalidate.invalidateHrEmployeeIdentityDocuments(q, 7), kinds: ["identity"], employee: 7},
  {name: "insurance records", run: q => invalidate.invalidateHrEmployeeMedicalInsurances(q, 7), kinds: ["insurance"], employee: 7},
  {name: "dependent records", run: q => invalidate.invalidateHrEmployeeDependents(q, 7), kinds: ["dependents"], employee: 7},
  {name: "access cards", run: q => invalidate.invalidateHrEmployeeAccessCards(q, 7), kinds: ["cards"], employee: 7},
  {name: "training records", run: q => invalidate.invalidateHrEmployeeTrainingCertificates(q, 7), kinds: ["training"], employee: 7},
  {name: "medical records", run: q => invalidate.invalidateHrEmployeeMedicalRecords(q, 7), kinds: ["medical"], employee: 7},
  {name: "all compliance", run: q => invalidate.invalidateHrEmployeeCompliance(q, 7), kinds: COMPLIANCE_KINDS, employee: 7},
  {name: "employee admission", run: q => invalidate.invalidateHrEmployee(q, 7), kinds: COMPLIANCE_KINDS, employee: 7},
  {name: "employee status", run: q => invalidate.invalidateHrEmployeeStatusHistory(q, 7), kinds: COMPLIANCE_KINDS, employee: 7},
  {name: "identity type", run: invalidate.invalidateHrIdentityDocumentTypes, kinds: ["identity"]},
  {name: "card type", run: invalidate.invalidateHrAccessCardTypes, kinds: ["cards"]},
  {name: "training category", run: invalidate.invalidateHrTrainingCategories, kinds: ["training"]},
  {name: "training type", run: invalidate.invalidateHrTrainingTypes, kinds: ["training"]},
  {name: "medical type", run: invalidate.invalidateHrMedicalRecordTypes, kinds: ["medical"]},
  {name: "relationship label", run: invalidate.invalidateHrRelationshipTypes, kinds: ["dependents"]},
  {name: "all settings", run: invalidate.invalidateHrSettings, kinds: COMPLIANCE_KINDS},
  {name: "country labels", run: invalidate.invalidateCountries, kinds: ["identity", "dependents"]},
  {name: "emirate labels", run: invalidate.invalidateEmirates, kinds: ["identity"]},
  {name: "city labels", run: invalidate.invalidateCities, kinds: ["identity"]},
  {name: "all geography labels", run: invalidate.invalidateGeography, kinds: ["identity", "dependents"]},
  {name: "sponsor company labels", run: invalidate.invalidateOrganizations, kinds: ["identity"]},
  {name: "site labels", run: invalidate.invalidateCommonMdWorkSites, kinds: ["cards"]},
];
it.each(changes)("$name refreshes only dependent collections/detail variants", async ({run, kinds, employee}) => {
  const qc = client(), all: unknown[][] = [];
  for (const kind of COMPLIANCE_KINDS) for (const person of [7, 8]) for (const owner of ["synthetic-a", "synthetic-b"]) for (const op of ["page", "detail"]) {
    const k = key(kind, person, owner, op, op === "page" ? '{"search":"علي"}' : "111"); all.push(k); qc.setQueryData(k, {revision: 1});
  }
  const draft = ["workspace", "draft", 7], unrelated = ["hr", "payroll", 7]; qc.setQueryData(draft, {keep: true}); qc.setQueryData(unrelated, {keep: true});
  run(qc); await settle();
  for (const k of all) {expect(qc.getQueryState(k)?.isInvalidated).toBe(kinds.includes(k[3] as ComplianceKind) && (employee === undefined || k[2] === employee)); expect(qc.getQueryData(k)).toEqual({revision: 1});}
  expect(qc.getQueryState(draft)?.isInvalidated).toBe(false); expect(qc.getQueryState(unrelated)?.isInvalidated).toBe(false);
});
it("summary-only notifications preserve explicit child refresh ownership", async () => {
  const qc = client(), k = key("identity"); qc.setQueryData(k, {revision: 1}); invalidate.invalidateHrEmployeeComplianceSummary(qc, 7); await settle(); expect(qc.getQueryState(k)?.isInvalidated).toBe(false);
});
it("same-tick individual/all/type signals coalesce and never refetch an inactive principal", async () => {
  const qc = client(), k = key("identity"), inactive = key("identity", 7, "former"), read = vi.fn(async () => ({revision: 2}));
  qc.setQueryData(k, {revision: 1}); qc.setQueryData(inactive, {revision: 1});
  const observer = new QueryObserver(qc, {queryKey: k, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {invalidate.invalidateHrEmployeeIdentityDocuments(qc, 7); invalidate.invalidateHrEmployeeCompliance(qc, 7); invalidate.invalidateHrIdentityDocumentTypes(qc); await settle();
    expect(read).toHaveBeenCalledTimes(1); expect(qc.getQueryData(inactive)).toEqual({revision: 1}); expect(qc.getQueryData(k)).toEqual({revision: 2});
  } finally {stop();}
});
it.each([false, true])("a later confirmed mutation cancels the earlier page/detail request, cached=%s", async cached => {
  const qc = client(), k = key("medical", 7, "current", "detail", "111"); if (cached) qc.setQueryData(k, {revision: 0});
  let revision = 1, signal!: AbortSignal, finish!: () => void;
  const read = vi.fn(({signal: current}: {signal: AbortSignal}) => revision === 1 ? new Promise(resolve => {signal = current; finish = () => resolve({revision: 1});}) : Promise.resolve({revision}));
  const observer = new QueryObserver(qc, {queryKey: k, queryFn: read, staleTime: Infinity}), stop = observer.subscribe(() => {});
  try {if (cached) {invalidate.invalidateHrEmployeeMedicalRecords(qc, 7); await settle();} expect(read).toHaveBeenCalledTimes(1);
    revision = 2; invalidate.invalidateHrEmployeeMedicalRecords(qc, 7); await settle(); expect(signal.aborted).toBe(true); finish(); await settle();
    expect(read).toHaveBeenCalledTimes(2); expect(qc.getQueryData(k)).toEqual({revision: 2});
  } finally {stop();}
});
it("observerless old detail cannot repopulate after confirmed mutation", async () => {
  const qc = client(), k = key("dependents", 7, "former", "detail", "111"); let signal!: AbortSignal, finish!: () => void;
  const read = vi.fn(({signal: current}: {signal: AbortSignal}) => new Promise(resolve => {signal = current; finish = () => resolve({private: "synthetic"});}));
  const pending = qc.fetchQuery({queryKey: k, queryFn: read}).catch(() => null);
  invalidate.invalidateHrEmployeeDependents(qc, 7); await settle(); expect(signal.aborted).toBe(true); finish(); await pending; await settle();
  expect(read).toHaveBeenCalledTimes(1); expect(qc.getQueryData(k)).toBeUndefined();
});
it("queued invalidation never re-creates removed or disabled owner queries", async () => {
  const qc = client(), removed = key("cards"), disabled = key("cards", 8), read = vi.fn(async () => ({revision: 2}));
  qc.setQueryData(removed, {revision: 1}); qc.setQueryData(disabled, {revision: 1});
  const observer = new QueryObserver(qc, {queryKey: disabled, queryFn: read, enabled: false}), stop = observer.subscribe(() => {});
  try {invalidate.invalidateHrAccessCardTypes(qc); qc.removeQueries({queryKey: removed, exact: true}); await settle(); expect(read).not.toHaveBeenCalled(); expect(qc.getQueryData(removed)).toBeUndefined();}
  finally {stop();}
});
