// @vitest-environment jsdom
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
import type {DmsAiSearchResult, DmsSemanticSearchResult, DmsSearchIntent} from "@/lib/dms/ai/types";
const state = vi.hoisted(() => ({read: vi.fn(), legacy: vi.fn(), ai: vi.fn(), semantic: vi.fn(), realPreview: false, openTab: vi.fn()}));
vi.mock("@/lib/reads/client", async () => ({...await vi.importActual("@/lib/reads/client"), readJson: (...args: unknown[]) => state.read(...args)}));
vi.mock("@/server/actions/dms/browser", () => ({searchDmsBrowser: (...args: unknown[]) => state.legacy(...args)}));
vi.mock("@/server/actions/dms/ai-search", () => ({askDmsDocumentsQuestion: (...args: unknown[]) => state.ai(...args)}));
vi.mock("@/server/actions/dms/semantic-search", () => ({semanticSearchDmsDocuments: (...args: unknown[]) => state.semantic(...args)}));
vi.mock("@/features/dms/browser/dms-browser-search-bar", () => ({DmsBrowserSearchBar: ({onSearch}: {onSearch: (s: string) => void}) => <input aria-label="Test search" onChange={e => onSearch(e.target.value)}/> }));
vi.mock("@/features/dms/browser/dms-browser-filter-bar", () => ({DEFAULT_FILTERS: {documentTypeIds: [], status: "", issueDateFrom: "", issueDateTo: "", linkedEntityType: "", semanticOn: false},
  DmsBrowserFilterBar: ({filters, onChange}: {filters: Record<string, unknown>; onChange: (v: unknown) => void}) => <><button onClick={() => onChange({...filters, status: "expired"})}>Expired filter</button><button onClick={() => onChange({...filters, semanticOn: true})}>Semantic filter</button></>}));
vi.mock("@/features/dms/browser/dms-browser-results-list", () => ({DmsBrowserResultsList: ({rows, total, onSelect, onLoadMore, hasMore}: {rows: Array<{id: number; title: string}>; total: number; onSelect: (r: unknown) => void; onLoadMore: () => void; hasMore: boolean}) => <div><span>{total} exact matches</span>{rows.map(r => <button key={r.id} onClick={() => onSelect(r)}>{r.title}</button>)}{hasMore && <button onClick={onLoadMore}>Load next page</button>}</div>}));
vi.mock("@/features/dms/browser/dms-browser-preview", async original => {
  const actual = await original<typeof import("@/features/dms/browser/dms-browser-preview")>();
  return {DmsBrowserPreview: (props: Parameters<typeof actual.DmsBrowserPreview>[0]) => state.realPreview
    ? <actual.DmsBrowserPreview {...props}/>
    : props.document ? <div aria-label="Selected preview">{props.document.title}{props.document.files.map(f => <span key={f.fileName}>{f.fileName}</span>)}</div> : null};
});
vi.mock("@/hooks/use-workspace", () => ({useWorkspace: () => ({openTab: state.openTab})}));
vi.mock("@/features/dms/browser/dms-browser-intent-banner", () => ({DmsBrowserIntentBanner: () => null}));
import {DmsBrowserPageClient} from "@/features/dms/browser/dms-browser-page-client";
import {dmsBrowserCriteriaSchema, dmsBrowserIdentity, type DmsBrowserCriteria} from "@/lib/reads/dms-browser-schema";
import {dmsBrowserPrefix} from "@/hooks/use-dms-browser";
import {ReadError} from "@/lib/reads/client";
const ctx = {profile: {id: 1, auth_user_id: "synthetic-one", must_change_password: false}, isAccountActive: true, accountStatus: "active", roleCodes: [], permissionCodes: ["dms.documents.view"], roleAssignments: []} as unknown as AuthContext;
const doc = (id: number, title = `Document ${id}`) => ({id, documentNo: `DOC-${id}`, title, typeNameEn: null, typeCode: null, status: "active", issueDate: null, expiryDate: null, matchSource: "metadata", contentExcerpt: null, files: []});
const dto = (id: number, title?: string) => {const {files: _files, ...row} = doc(id, title); void _files; return row;};
function response(input: unknown, changes: Record<string, unknown> = {}) {
  const criteria = dmsBrowserCriteriaSchema.parse(input), common = {criteria, asOf: new Date().toISOString(), availability: "available"};
  return {success: true, data: criteria.operation === "types" ? {...common, totalCount: 0, rows: [], ...changes}
    : criteria.operation === "files" ? {...common, totalCount: 1, rows: [{id: criteria.documentId * 10, fileName: `Synthetic ${criteria.documentId}.pdf`, mimeType: "application/pdf", fileSizeBytes: 12}], document: dto(criteria.documentId), canPreview: true, canDownload: true, ...changes}
    : {...common, totalCount: 1, rows: [dto(1)], ...changes}};
}
const clients: QueryClient[] = [];
function mount(authContext = ctx) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const ui = (auth: AuthContext) => <QueryClientProvider client={client}><DmsBrowserPageClient authContext={auth}/></QueryClientProvider>;
  const view = render(ui(authContext)); return {...view, client, replace: (auth: AuthContext) => view.rerender(ui(auth))};
}
beforeEach(() => {state.realPreview = false; state.read.mockImplementation((_r, p) => Promise.resolve(response(p))); state.legacy.mockRejectedValue(Error("Legacy action must not be called")); state.ai.mockResolvedValue({success: false}); state.semantic.mockResolvedValue({success: false});});
afterEach(() => {cleanup(); clients.splice(0).forEach(c => c.clear()); vi.clearAllMocks(); state.legacy.mockReset(); state.read.mockReset(); state.ai.mockReset(); state.semantic.mockReset();});
it("actual parent shows a retryable failure instead of a successful zero", async () => {
  state.read.mockImplementation((_r, p: DmsBrowserCriteria) => p.operation === "search" ? Promise.reject(new ReadError("SYNTHETIC_PRIVATE_FAILURE", 503)) : Promise.resolve(response(p))); mount();
  fireEvent.change(screen.getByRole("textbox", {name: "Test search"}), {target: {value: "needle"}});
  expect(await screen.findByRole("button", {name: "Retry search"})).toBeTruthy(); expect(screen.queryByText("0 exact matches")).toBeNull(); expect(screen.queryByText(/SYNTHETIC_PRIVATE/)).toBeNull();
});
it("actual parent cannot replace the latest search with a late old response", async () => {
  let finish!: (v: unknown) => void;
  state.read.mockImplementation((_r, p: DmsBrowserCriteria) => p.operation === "search" && p.query === "old" ? new Promise(resolve => {finish = value => resolve(response(p, {rows: [value]}));}) : Promise.resolve(response(p, p.operation === "search" ? {rows: [dto(2, "Latest")]} : {})));
  mount(); fireEvent.change(screen.getByRole("textbox", {name: "Test search"}), {target: {value: "old"}}); await waitFor(() => expect(finish).toBeTypeOf("function"));
  fireEvent.change(screen.getByRole("textbox", {name: "Test search"}), {target: {value: "new"}}); await screen.findByRole("button", {name: "Latest"});
  await act(async () => finish(dto(9, "RETIRED_PRIVATE")));
  expect(screen.queryByText("RETIRED_PRIVATE")).toBeNull(); expect(screen.getByRole("button", {name: "Latest"})).toBeTruthy();
});
const calls = (operation: string) => state.read.mock.calls.filter(c => c[1].operation === operation);
function enter(query = "needle") {fireEvent.change(screen.getByRole("textbox", {name: "Test search"}), {target: {value: query}});}
async function selected() {enter(); fireEvent.click(await screen.findByRole("button", {name: "Document 1"})); await screen.findByText("Synthetic 1.pdf");}
it("actual browser initially reads only types, then one base page, then only selected file metadata", async () => {
  mount(); await screen.findByRole("button", {name: "Expired filter"}); expect(calls("types")).toHaveLength(1); expect(calls("search")).toHaveLength(0); expect(calls("files")).toHaveLength(0);
  await selected(); expect(calls("search")).toHaveLength(1); expect(calls("files")).toHaveLength(1); expect(calls("files")[0][1]).toMatchObject({documentId: 1, offset: 0, limit: 25}); expect(state.legacy).not.toHaveBeenCalled(); expect(state.ai).not.toHaveBeenCalled(); expect(state.semantic).not.toHaveBeenCalled();
});
it("source failure retries only once automatically and manual retry restarts the exact search", async () => {
  let failed = true; state.read.mockImplementation((_r, p: DmsBrowserCriteria) => failed && p.operation === "search" ? Promise.reject(new ReadError("private", 503)) : Promise.resolve(response(p)));
  mount(); enter(); await screen.findByRole("button", {name: "Retry search"}); expect(calls("search")).toHaveLength(2); failed = false;
  fireEvent.click(screen.getByRole("button", {name: "Retry search"})); await screen.findByRole("button", {name: "Document 1"}); expect(calls("search")).toHaveLength(3); expect(calls("search").at(-1)?.[1]).toMatchObject({query: "needle", offset: 0});
});
it("type failure is not a successful empty selector and has independent retry", async () => {
  let failed = true; state.read.mockImplementation((_r, p: DmsBrowserCriteria) => failed && p.operation === "types" ? Promise.reject(new ReadError("private", 503)) : Promise.resolve(response(p)));
  mount(); await screen.findByRole("button", {name: "Retry document types"}); expect(screen.queryByRole("button", {name: "Expired filter"})).toBeNull(); expect(calls("types")).toHaveLength(2);
  failed = false; fireEvent.click(screen.getByRole("button", {name: "Retry document types"})); await screen.findByRole("button", {name: "Expired filter"}); expect(calls("types")).toHaveLength(3);
});
it.each([401, 403])("same-identity %s clears private rows, preview and caches without automatic retry", async status => {
  let denied = false; state.read.mockImplementation((_r, p: DmsBrowserCriteria) => denied && p.operation === "search" ? Promise.reject(new ReadError("private", status)) : Promise.resolve(response(p)));
  const view = mount(); await selected(); denied = true;
  await act(async () => {await view.client.invalidateQueries({queryKey: [...dmsBrowserPrefix(dmsBrowserIdentity(ctx)), "search"]});});
  await screen.findByText(/Previous records and previews have been cleared/); expect(screen.queryByLabelText("Selected preview")).toBeNull(); expect(screen.queryByRole("button", {name: "Document 1"})).toBeNull(); expect(calls("search")).toHaveLength(2);
  expect(view.client.getQueryCache().findAll({queryKey: dmsBrowserPrefix(dmsBrowserIdentity(ctx))}).some(q => q.state.data !== undefined)).toBe(false);
});
it("new criteria abort and retire an old request even when its transport ignores cancellation", async () => {
  let finish!: (v: unknown) => void, oldInput!: DmsBrowserCriteria, signal!: AbortSignal;
  state.read.mockImplementation((_r, p: DmsBrowserCriteria, s: AbortSignal) => p.operation === "search" && p.query === "old" ? (oldInput = p, signal = s, new Promise(resolve => {finish = resolve;})) : Promise.resolve(response(p)));
  const view = mount(); enter("old"); await waitFor(() => expect(finish).toBeTypeOf("function")); enter("new"); await screen.findByRole("button", {name: "Document 1"}); expect(signal.aborted).toBe(true);
  await act(async () => finish(response(oldInput, {rows: [dto(99, "OLD_PRIVATE")]}))); expect(screen.queryByText("OLD_PRIVATE")).toBeNull();
  expect(view.client.getQueryCache().findAll({queryKey: dmsBrowserPrefix(dmsBrowserIdentity(ctx))}).some(q => JSON.stringify(q.queryKey).includes('\\"query\\":\\"old\\"'))).toBe(false);
});
it.each(["account", "scope"])("%s replacement clears selection and aborts a previous file response", async mode => {
  let finish!: (v: unknown) => void, input!: DmsBrowserCriteria, signal!: AbortSignal;
  state.read.mockImplementation((_r, p: DmsBrowserCriteria, s: AbortSignal) => p.operation === "files" ? (input = p, signal = s, new Promise(resolve => {finish = resolve;})) : Promise.resolve(response(p)));
  const view = mount(); enter(); fireEvent.click(await screen.findByRole("button", {name: "Document 1"})); await waitFor(() => expect(finish).toBeTypeOf("function"));
  view.replace(mode === "account" ? {...ctx, profile: {...ctx.profile!, id: 2, auth_user_id: "second"}} : {...ctx, permissionCodes: [...ctx.permissionCodes, "dms.documents.preview"]});
  await waitFor(() => expect(calls("types")).toHaveLength(2)); expect(signal.aborted).toBe(true);
  await act(async () => finish(response(input))); expect(screen.queryByLabelText("Selected preview")).toBeNull(); expect(view.client.getQueryCache().findAll({queryKey: dmsBrowserPrefix(dmsBrowserIdentity(ctx))})).toHaveLength(0);
});
it("unmount aborts pending reads and a late reply cannot repopulate the private cache", async () => {
  let finish!: (v: unknown) => void, input!: DmsBrowserCriteria, signal!: AbortSignal;
  state.read.mockImplementation((_r, p: DmsBrowserCriteria, s: AbortSignal) => p.operation === "search" ? (input = p, signal = s, new Promise(resolve => {finish = resolve;})) : Promise.resolve(response(p)));
  const view = mount(); enter(); await waitFor(() => expect(finish).toBeTypeOf("function")); view.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => finish(response(input))); expect(view.client.getQueryCache().findAll({queryKey: dmsBrowserPrefix(dmsBrowserIdentity(ctx))})).toHaveLength(0);
});
it("changing the selected document aborts only the old files and late metadata cannot replace the selection", async () => {
  let finish!: (v: unknown) => void, input!: DmsBrowserCriteria, signal!: AbortSignal;
  state.read.mockImplementation((_r, p: DmsBrowserCriteria, s: AbortSignal) => p.operation === "files" && p.documentId === 1 ? (input = p, signal = s, new Promise(resolve => {finish = resolve;})) : Promise.resolve(response(p, p.operation === "search" ? {totalCount: 2, rows: [dto(1), dto(2)]} : {})));
  mount(); enter(); fireEvent.click(await screen.findByRole("button", {name: "Document 1"})); await waitFor(() => expect(finish).toBeTypeOf("function")); fireEvent.click(screen.getByRole("button", {name: "Document 2"})); await screen.findByText("Synthetic 2.pdf"); expect(signal.aborted).toBe(true);
  await act(async () => finish(response(input))); expect(screen.queryByText("Synthetic 1.pdf")).toBeNull(); expect(screen.getByText("Synthetic 2.pdf")).toBeTruthy();
});
it("file failure stays retryable and confirmed unavailability never claims an empty attachment list", async () => {
  let mode = "failure"; state.read.mockImplementation((_r, p: DmsBrowserCriteria) => p.operation === "files" && mode === "failure" ? Promise.reject(new ReadError("private", 503)) : Promise.resolve(p.operation === "files" && mode === "missing" ? {success: true, data: {criteria: p, asOf: new Date().toISOString(), availability: "unavailable"}} : response(p)));
  mount(); enter(); fireEvent.click(await screen.findByRole("button", {name: "Document 1"})); await screen.findByRole("button", {name: "Retry files"}); expect(screen.queryByLabelText("Selected preview")).toBeNull();
  mode = "missing"; fireEvent.click(screen.getByRole("button", {name: "Retry files"})); await screen.findByText(/This document is no longer available/); expect(screen.queryByLabelText("Selected preview")).toBeNull();
});
it("infinite-scroll next pages retain exact totals and deduplicate rapid load attempts", async () => {
  let finish!: (v: unknown) => void, input!: DmsBrowserCriteria;
  const all = Array.from({length: 26}, (_, i) => dto(i + 1));
  state.read.mockImplementation((_r, p: DmsBrowserCriteria) => p.operation === "search" && p.offset === 25 ? (input = p, new Promise(resolve => {finish = resolve;})) : Promise.resolve(response(p, p.operation === "search" ? {totalCount: 26, rows: all.slice(p.offset, p.offset + p.limit)} : {})));
  mount(); enter(); const button = await screen.findByRole("button", {name: "Load next page"}); fireEvent.click(button); fireEvent.click(button); await waitFor(() => expect(finish).toBeTypeOf("function")); expect(calls("search")).toHaveLength(2);
  await act(async () => finish(response(input, {totalCount: 26, rows: all.slice(25)}))); await screen.findByRole("button", {name: "Document 26"}); expect(screen.getByText("26 exact matches")).toBeTruthy(); expect(screen.queryByRole("button", {name: "Load next page"})).toBeNull();
});
it.each(["count", "duplicate"])("%s drift between infinite pages fails explicitly instead of mixing snapshots", async mode => {
  const all = Array.from({length: 26}, (_, i) => dto(i + 1));
  state.read.mockImplementation((_r, p: DmsBrowserCriteria) => Promise.resolve(response(p, p.operation === "search" ? p.offset === 0 ? {totalCount: 26, rows: all.slice(0, 25)} : mode === "count" ? {totalCount: 27, rows: [dto(26), dto(27)]} : {totalCount: 26, rows: [dto(1)]} : {})));
  mount(); enter(); fireEvent.click(await screen.findByRole("button", {name: "Load next page"})); await screen.findByRole("button", {name: "Retry search"}); expect(screen.queryByText("26 exact matches")).toBeNull(); expect(screen.queryByRole("button", {name: "Document 1"})).toBeNull();
});
it("file navigation sends only a selected-document page and clears the old preview while pending", async () => {
  const all = Array.from({length: 26}, (_, i) => ({id: i + 1, fileName: `Page file ${i + 1}.pdf`, mimeType: "application/pdf", fileSizeBytes: 10}));
  state.read.mockImplementation((_r, p: DmsBrowserCriteria) => Promise.resolve(response(p, p.operation === "files" ? {totalCount: 26, rows: all.slice(p.offset, p.offset + p.limit)} : {})));
  mount(); enter(); fireEvent.click(await screen.findByRole("button", {name: "Document 1"})); await screen.findByText("Page file 1.pdf"); fireEvent.click(screen.getByRole("button", {name: "Next files"})); await screen.findByText("Page file 26.pdf");
  expect(screen.queryByText("Page file 1.pdf")).toBeNull(); expect(calls("files").at(-1)?.[1]).toMatchObject({documentId: 1, offset: 25, limit: 25});
});
it("filter changes restart page zero and immediately retire the selected preview", async () => {
  mount(); await selected(); fireEvent.click(screen.getByRole("button", {name: "Expired filter"})); expect(screen.queryByLabelText("Selected preview")).toBeNull(); await waitFor(() => expect(calls("search")).toHaveLength(2));
  expect(calls("search")[1][1]).toMatchObject({query: "needle", status: "expired", offset: 0}); expect(calls("files")).toHaveLength(1);
});
it("a confirmed removed result closes selection and does not reopen when that ID later returns", async () => {
  let present = true;
  state.read.mockImplementation((_r, p: DmsBrowserCriteria) => Promise.resolve(response(p, p.operation === "search" && !present ? {totalCount: 0, rows: []} : {})));
  const view = mount(); await selected(); present = false;
  await act(async () => {await view.client.invalidateQueries({queryKey: [...dmsBrowserPrefix(dmsBrowserIdentity(ctx)), "search"]});});
  await screen.findByText("0 exact matches"); expect(screen.queryByLabelText("Selected preview")).toBeNull();
  present = true;
  await act(async () => {await view.client.invalidateQueries({queryKey: [...dmsBrowserPrefix(dmsBrowserIdentity(ctx)), "search"]});});
  await screen.findByRole("button", {name: "Document 1"}); expect(screen.queryByLabelText("Selected preview")).toBeNull(); expect(calls("files")).toHaveLength(1);
});
it("fresh file replacement hides the old preview while loading and uses only the new response", async () => {
  let replaced = false, finish!: (v: unknown) => void, input!: DmsBrowserCriteria;
  state.read.mockImplementation((_r, p: DmsBrowserCriteria) => replaced && p.operation === "files" ? (input = p, new Promise(resolve => {finish = resolve;})) : Promise.resolve(response(p)));
  const view = mount(); await selected(); replaced = true;
  let refresh!: Promise<void>;
  act(() => {refresh = view.client.invalidateQueries({queryKey: [...dmsBrowserPrefix(dmsBrowserIdentity(ctx)), "files"]});});
  await waitFor(() => expect(finish).toBeTypeOf("function")); expect(screen.queryByText("Synthetic 1.pdf")).toBeNull();
  await act(async () => {finish(response(input, {rows: [{id: 20, fileName: "Replacement.pdf", mimeType: "application/pdf", fileSizeBytes: 9}]})); await refresh;});
  await screen.findByText("Replacement.pdf"); expect(screen.queryByText("Synthetic 1.pdf")).toBeNull();
});
it("a shrunken files page is not a false empty document and returns to the first page", async () => {
  let shrunk = false;
  const all = Array.from({length: 26}, (_, i) => ({id: i + 1, fileName: `Page file ${i + 1}.pdf`, mimeType: "application/pdf", fileSizeBytes: 10}));
  state.read.mockImplementation((_r, p: DmsBrowserCriteria) => Promise.resolve(response(p, p.operation === "files" ? {totalCount: shrunk ? 1 : 26, rows: all.slice(0, shrunk ? 1 : 26).slice(p.offset, p.offset + p.limit)} : {})));
  const view = mount(); enter(); fireEvent.click(await screen.findByRole("button", {name: "Document 1"})); await screen.findByText("Page file 1.pdf"); fireEvent.click(screen.getByRole("button", {name: "Next files"})); await screen.findByText("Page file 26.pdf");
  shrunk = true; await act(async () => {await view.client.invalidateQueries({queryKey: [...dmsBrowserPrefix(dmsBrowserIdentity(ctx)), "files"]});});
  fireEvent.click(await screen.findByRole("button", {name: "First files page"})); await screen.findByText("Page file 1.pdf"); expect(screen.queryByText("Page file 26.pdf")).toBeNull(); expect(calls("files").at(-1)?.[1]).toMatchObject({offset: 0});
});
it("oversized composition is an explicit non-count outcome", async () => {
  state.read.mockImplementation((_r, p: DmsBrowserCriteria) => Promise.resolve(p.operation === "search" ? {success: true, data: {criteria: p, asOf: new Date().toISOString(), availability: "too_large"}} : response(p)));
  mount(); enter(); await screen.findByText(/Too many matching records/); expect(screen.queryByText("0 exact matches")).toBeNull(); expect(calls("files")).toHaveLength(0);
});
it.each(["wrong-request", "private", "partial"])("%s response cannot paint rows or start a file request", async mode => {
  state.read.mockImplementation((_r, p: DmsBrowserCriteria) => {const r = response(p); if (p.operation === "search") {if (mode === "wrong-request") r.data.criteria = {...p, query: "other"}; if (mode === "private") Object.assign(r.data, {content_text: "PRIVATE"}); if (mode === "partial") Object.assign(r.data, {totalCount: 99});} return Promise.resolve(r);});
  mount(); enter(); await screen.findByRole("button", {name: "Retry search"}); expect(screen.queryByRole("button", {name: "Document 1"})).toBeNull(); expect(calls("files")).toHaveLength(0);
});
it("invalid long search never dispatches a base or paid-provider request", async () => {
  mount(); enter("word ".repeat(60)); await screen.findByText(/Search criteria are invalid/); expect(calls("search")).toHaveLength(0); expect(state.ai).not.toHaveBeenCalled(); expect(state.semantic).not.toHaveBeenCalled();
});
it("provider additions stay visibly top-N and do not corrupt the exact base count", async () => {
  state.ai.mockResolvedValue({success: true, data: {intent: null, results: [{documentId: 2, documentNo: "DOC-2", title: "AI suggestion", expiryDate: null, matchReason: "Suggested match"}, {documentId: 1, documentNo: "DOC-1", title: "Duplicate base", expiryDate: null, matchReason: "Base"}]}});
  mount(); enter("find some synthetic documents"); await screen.findByRole("button", {name: /AI suggestion/}); expect(screen.getByText("1 exact matches")).toBeTruthy(); expect(screen.queryByText("3 exact matches")).toBeNull(); expect(screen.queryByRole("button", {name: /Duplicate base/})).toBeNull(); expect(screen.getByText(/not an exact total/)).toBeTruthy(); expect(state.ai).toHaveBeenCalledExactlyOnceWith("find some synthetic documents");
  fireEvent.click(screen.getByRole("button", {name: /AI suggestion/})); await screen.findByText("Synthetic 2.pdf"); expect(calls("files").at(-1)?.[1]).toMatchObject({documentId: 2});
});
type AiResponse = Awaited<ReturnType<typeof import("@/server/actions/dms/ai-search").askDmsDocumentsQuestion>>;
type SemanticResponse = Awaited<ReturnType<typeof import("@/server/actions/dms/semantic-search").semanticSearchDmsDocuments>>;
function providerResponses(label: string, firstId: number) {
  const intent: DmsSearchIntent = {keywords: [label], document_type_hint: null, category_hint: null, person_name_hint: null,
    party_name_hint: null, person_dob_hint: null, date_from: null, date_to: null, expiry_state: null, outcome_hint: null,
    risk_hint: null, metadata_filters: [], confidentiality_max: null};
  const ai: AiResponse = {success: true, data: {intent, results: [{documentId: firstId, documentNo: `DOC-${firstId}`,
    title: `${label}_AI_PRIVATE`, aiSummarySnippet: null, contentSnippet: null, matchReason: `${label} AI reason`,
    riskLevel: null, completenessScore: null, expiryDate: null}]}};
  const semantic: SemanticResponse = {success: true, data: [semanticResult({documentId: firstId + 1, documentNo: `DOC-${firstId + 1}`,
    title: `${label}_SEMANTIC_PRIVATE`, matchReason: `${label} semantic reason`})]};
  return {ai, semantic};
}
const providerLifetimeChanges: Array<"query" | "account" | "scope" | 401 | 403> = ["query", "account", "scope", 401, 403];
it.each(providerLifetimeChanges)("late typed providers cannot append retired rows after %s", async change => {
  const oldQuery = "old synthetic search query", currentQuery = "current synthetic search query";
  const old = providerResponses("RETIRED", 90), current = providerResponses("CURRENT", 92);
  let aiDone!: (v: AiResponse) => void, semanticDone!: (v: SemanticResponse) => void, deniedStatus: number | null = null;
  state.ai.mockImplementation((query: string) => query === oldQuery ? new Promise<AiResponse>(resolve => {aiDone = resolve;}) : Promise.resolve(current.ai));
  state.semantic.mockImplementation((query: string) => query === oldQuery ? new Promise<SemanticResponse>(resolve => {semanticDone = resolve;}) : Promise.resolve(current.semantic));
  state.read.mockImplementation((_r, p: DmsBrowserCriteria) => p.operation === "search" && deniedStatus
    ? Promise.reject(new ReadError("PRIVATE_DENIAL", deniedStatus))
    : Promise.resolve(response(p, p.operation === "search" ? {rows: [dto(1, `Exact ${p.query}`)]} : {})));
  const view = mount(); fireEvent.click(await screen.findByRole("button", {name: "Semantic filter"})); enter(oldQuery);
  await waitFor(() => {expect(aiDone).toBeTypeOf("function"); expect(semanticDone).toBeTypeOf("function");});
  fireEvent.click(await screen.findByRole("button", {name: `Exact ${oldQuery}`})); await screen.findByText("Synthetic 1.pdf");
  if (typeof change === "number") {
    deniedStatus = change;
    await act(async () => {await view.client.invalidateQueries({queryKey: [...dmsBrowserPrefix(dmsBrowserIdentity(ctx)), "search"]});});
    await screen.findByText(/Previous records and previews have been cleared/);
  } else {
    if (change === "account" || change === "scope") {
      view.replace(change === "account" ? {...ctx, profile: {...ctx.profile!, id: 2, auth_user_id: "second"}}
        : {...ctx, permissionCodes: [...ctx.permissionCodes, "dms.documents.preview"]});
      fireEvent.click(await screen.findByRole("button", {name: "Semantic filter"}));
      expect(view.client.getQueryCache().findAll({queryKey: dmsBrowserPrefix(dmsBrowserIdentity(ctx))})).toHaveLength(0);
    }
    enter(currentQuery);
    await screen.findByRole("button", {name: `Exact ${currentQuery}`});
    await screen.findByRole("button", {name: /CURRENT_AI_PRIVATE/});
    await screen.findByRole("button", {name: /CURRENT_SEMANTIC_PRIVATE/});
  }
  const readsBeforeLateResponses = state.read.mock.calls.length;
  await act(async () => {aiDone(old.ai); semanticDone(old.semantic);});
  expect(screen.queryByText("RETIRED_AI_PRIVATE")).toBeNull(); expect(screen.queryByText("RETIRED_SEMANTIC_PRIVATE")).toBeNull();
  expect(screen.queryByLabelText("Selected preview")).toBeNull(); expect(state.read).toHaveBeenCalledTimes(readsBeforeLateResponses);
  if (typeof change === "number") {
    expect(screen.getByText(/Previous records and previews have been cleared/)).toBeTruthy();
    expect(screen.queryByRole("button", {name: `Exact ${oldQuery}`})).toBeNull();
    expect(view.client.getQueryCache().findAll({queryKey: dmsBrowserPrefix(dmsBrowserIdentity(ctx))}).some(q => q.state.data !== undefined)).toBe(false);
    expect(state.ai).toHaveBeenCalledExactlyOnceWith(oldQuery); expect(state.semantic).toHaveBeenCalledExactlyOnceWith(oldQuery);
  } else {
    expect(screen.getByRole("button", {name: `Exact ${currentQuery}`})).toBeTruthy();
    expect(screen.getByRole("button", {name: /CURRENT_AI_PRIVATE/})).toBeTruthy(); expect(screen.getByRole("button", {name: /CURRENT_SEMANTIC_PRIVATE/})).toBeTruthy();
    expect(screen.getByText("1 exact matches")).toBeTruthy(); expect(screen.queryByText(/Some suggestions could not be loaded/)).toBeNull();
  }
});
it("provider failures are honest but cannot erase a successful exact base read", async () => {
  state.ai.mockRejectedValue(Error("PRIVATE_PROVIDER")); mount(); enter("find some synthetic documents"); await screen.findByText(/Some suggestions could not be loaded/);
  expect(screen.getByRole("button", {name: "Document 1"})).toBeTruthy(); expect(screen.getByText("1 exact matches")).toBeTruthy(); expect(screen.queryByText("PRIVATE_PROVIDER")).toBeNull(); expect(state.ai).toHaveBeenCalledTimes(1);
});
const semanticResult = (extra: Partial<DmsSemanticSearchResult> = {}): DmsSemanticSearchResult => ({
  documentId: 2, documentNo: "DOC-2", title: "Semantic suggestion", aiSummarySnippet: null,
  similarity: 0.9, riskLevel: null, completenessScore: null, expiryDate: null, matchReason: "Semantic match reason", ...extra,
});
it.each(["AI reason", ""])("AI action retains its original reason/content excerpt precedence (%s)", async matchReason => {
  const result: DmsAiSearchResult = {documentId: 3, documentNo: "DOC-3", title: "AI precedence suggestion", aiSummarySnippet: "Not the original AI excerpt",
    contentSnippet: "AI content fallback", matchReason, riskLevel: null, completenessScore: null, expiryDate: null};
  state.ai.mockResolvedValue({success: true, data: {intent: null, results: [result]}});
  mount(); enter("find some synthetic documents"); await screen.findByRole("button", {name: /AI precedence suggestion/});
  expect(screen.getByText(matchReason || "AI content fallback")).toBeTruthy(); expect(screen.queryByText("Not the original AI excerpt")).toBeNull();
});
it.each([null, "Semantic summary"])("semantic action's actual array contract renders additive suggestions with summary %s", async aiSummarySnippet => {
  const data: Awaited<ReturnType<typeof import("@/server/actions/dms/semantic-search").semanticSearchDmsDocuments>> = {
    success: true, data: [semanticResult({aiSummarySnippet}), semanticResult({documentId: 1, title: "Duplicate semantic base"})],
  };
  state.semantic.mockResolvedValue(data); mount();
  fireEvent.click(await screen.findByRole("button", {name: "Semantic filter"})); enter();
  fireEvent.click(await screen.findByRole("button", {name: /Semantic suggestion/}));
  await screen.findByText("Synthetic 2.pdf");
  expect(screen.getByText(aiSummarySnippet ?? "Semantic match reason")).toBeTruthy();
  expect(screen.getByText("1 exact matches")).toBeTruthy(); expect(screen.queryByRole("button", {name: /Duplicate semantic base/})).toBeNull();
  expect(screen.queryByText(/Some suggestions could not be loaded/)).toBeNull();
  expect(state.semantic).toHaveBeenCalledExactlyOnceWith("needle"); expect(state.ai).not.toHaveBeenCalled();
  expect(calls("files").at(-1)?.[1]).toMatchObject({documentId: 2});
});
it("a successful empty semantic array is not a provider failure or an exact-base reset", async () => {
  state.semantic.mockResolvedValue({success: true, data: []}); mount();
  fireEvent.click(await screen.findByRole("button", {name: "Semantic filter"})); enter(); await screen.findByRole("button", {name: "Document 1"});
  await waitFor(() => expect(state.semantic).toHaveBeenCalledExactlyOnceWith("needle"));
  expect(screen.queryByText(/Some suggestions could not be loaded/)).toBeNull(); expect(screen.getByText("1 exact matches")).toBeTruthy();
});
it("available-to-unavailable files retire document metadata without treating absence as an empty page", async () => {
  let unavailable = false;
  state.read.mockImplementation((_r, p: DmsBrowserCriteria) => Promise.resolve(p.operation === "files" && unavailable
    ? {success: true, data: {criteria: p, asOf: new Date().toISOString(), availability: "unavailable"}} : response(p)));
  const view = mount(); await selected(); unavailable = true;
  await act(async () => {await view.client.invalidateQueries({queryKey: [...dmsBrowserPrefix(dmsBrowserIdentity(ctx)), "files"]});});
  await screen.findByText(/This document is no longer available/);
  expect(screen.queryByLabelText("Selected preview")).toBeNull(); expect(screen.queryByText("Synthetic 1.pdf")).toBeNull();
  expect(screen.queryByRole("navigation", {name: "Selected document file pages"})).toBeNull();
  expect(screen.getByRole("button", {name: "Document 1"})).toBeTruthy(); expect(screen.getByText("1 exact matches")).toBeTruthy();
});
it("unavailable files carrying private rows are rejected before the preview receives them", async () => {
  state.read.mockImplementation((_r, p: DmsBrowserCriteria) => Promise.resolve(response(p, p.operation === "files" ? {
    availability: "unavailable", document: dto(1, "PRIVATE_UNAVAILABLE_TITLE"),
    rows: [{id: 10, fileName: "PRIVATE_UNAVAILABLE_FILE.pdf", mimeType: "application/pdf", fileSizeBytes: 1}],
  } : {})));
  mount(); enter(); fireEvent.click(await screen.findByRole("button", {name: "Document 1"}));
  await screen.findByRole("button", {name: "Retry files"}); expect(screen.queryByText(/PRIVATE_UNAVAILABLE/)).toBeNull();
  expect(screen.queryByLabelText("Selected preview")).toBeNull();
});

function realPreviewResponse(p: DmsBrowserCriteria, fileChanges: Record<string, unknown> = {}) {
  return response(p, p.operation === "files" ? {totalCount: 2, rows: [
    {id: p.documentId * 10 + 1, fileName: "First " + p.documentId + ".pdf", mimeType: "application/pdf", fileSizeBytes: 11},
    {id: p.documentId * 10 + 2, fileName: "Second " + p.documentId + ".pdf", mimeType: "application/pdf", fileSizeBytes: 12},
  ], ...fileChanges} : p.operation === "search" ? {totalCount: 2, rows: [dto(1), dto(2)]} : {});
}
function useRealPreview() {
  state.realPreview = true;
  localStorage.removeItem("dms-browser-col-widths-v1");
  state.read.mockImplementation((_r, p: DmsBrowserCriteria) => Promise.resolve(realPreviewResponse(p)));
}
function expectFileUrls(id: number, preview = true, download = true) {
  expect(document.querySelector("iframe")?.getAttribute("src") ?? null).toBe(preview ? `/api/dms/file?fileId=${id}&disposition=inline` : null);
  expect(screen.queryByRole("link", {name: "Download"})?.getAttribute("href") ?? null).toBe(download ? `/api/dms/file?fileId=${id}&disposition=attachment` : null);
}
function expectNoFileUrls() {
  expect(document.querySelectorAll('iframe[src*="/api/dms/file"], img[src*="/api/dms/file"], a[href*="/api/dms/file"]')).toHaveLength(0);
}
async function selectActualSecondFile() {
  enter();
  fireEvent.click(await screen.findByRole("button", {name: "Document 1"}));
  fireEvent.click(await screen.findByRole("button", {name: "Second 1.pdf"}));
  expectFileUrls(12);
}
it("actual preview keeps file 2 and its verified URLs through a real divider drag without another metadata read", async () => {
  useRealPreview();
  const view = mount();
  await selectActualSecondFile();
  const query = view.client.getQueryCache().find({queryKey: [...dmsBrowserPrefix(dmsBrowserIdentity(ctx)), "files"], exact: false});
  expect(query?.state.fetchStatus).toBe("idle");
  const verifiedPage = query!.state.data, reads = calls("files").length;
  const divider = screen.getByRole("separator"), column = divider.previousElementSibling as HTMLElement;
  const initialWidth = Number.parseInt(column.style.width);
  fireEvent.mouseDown(divider, {clientX: 400});
  fireEvent.mouseMove(document, {clientX: 475});
  fireEvent.mouseUp(document);
  expect(column.style.width).toBe(initialWidth + 75 + "px");
  expect(document.body.style.cursor).toBe("");
  expect(query!.state.data).toBe(verifiedPage);
  expect(calls("files")).toHaveLength(reads);
  expectFileUrls(12);
  expect(state.ai).not.toHaveBeenCalled();
  expect(state.semantic).not.toHaveBeenCalled();
});
it("actual preview resets to the new document's first file rather than retaining a previous document selection", async () => {
  useRealPreview();
  mount();
  await selectActualSecondFile();
  fireEvent.click(screen.getByRole("button", {name: "Document 2"}));
  await screen.findByRole("button", {name: "First 2.pdf"});
  expectFileUrls(21);
  expect(screen.queryByRole("button", {name: "Second 1.pdf"})).toBeNull();
  expect(calls("files")).toHaveLength(2);
});
it("actual preview hides all byte URLs during a refresh and resets only after the new verified file page", async () => {
  useRealPreview();
  const view = mount();
  await selectActualSecondFile();
  let finish!: (value: unknown) => void, input!: DmsBrowserCriteria;
  state.read.mockImplementation((_r, p: DmsBrowserCriteria) => p.operation === "files"
    ? (input = p, new Promise(resolve => {finish = resolve;})) : Promise.resolve(realPreviewResponse(p)));
  let refresh!: Promise<void>;
  act(() => {refresh = view.client.invalidateQueries({queryKey: [...dmsBrowserPrefix(dmsBrowserIdentity(ctx)), "files"]});});
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  expectNoFileUrls();
  await act(async () => {
    finish(realPreviewResponse(input, {rows: [
      {id: 13, fileName: "Replacement first.pdf", mimeType: "application/pdf", fileSizeBytes: 13},
      {id: 14, fileName: "Replacement second.pdf", mimeType: "application/pdf", fileSizeBytes: 14},
    ]}));
    await refresh;
  });
  await screen.findByRole("button", {name: "Replacement first.pdf"});
  expectFileUrls(13);
  expect(screen.queryByRole("button", {name: "Second 1.pdf"})).toBeNull();
  expect(calls("files")).toHaveLength(2);
});
it.each(["failed", "unavailable", 401, 403] as const)("actual preview removes old byte URLs when fresh files are %s", async mode => {
  useRealPreview();
  const view = mount();
  await selectActualSecondFile();
  state.read.mockImplementation((_r, p: DmsBrowserCriteria) => p.operation !== "files" ? Promise.resolve(realPreviewResponse(p)) :
    mode === "unavailable" ? Promise.resolve({success: true, data: {criteria: p, asOf: new Date().toISOString(), availability: "unavailable"}}) :
      Promise.reject(new ReadError("PRIVATE_FILE_FAILURE", mode === "failed" ? 503 : mode)));
  await act(async () => {await view.client.invalidateQueries({queryKey: [...dmsBrowserPrefix(dmsBrowserIdentity(ctx)), "files"]});});
  if (mode === "failed") await screen.findByRole("button", {name: "Retry files"});
  else await screen.findByText(mode === "unavailable" ? /This document is no longer available/ : /Previous records and previews have been cleared/);
  expectNoFileUrls();
  expect(screen.queryByText("PRIVATE_FILE_FAILURE")).toBeNull();
  expect(screen.queryByRole("button", {name: "Second 1.pdf"})).toBeNull();
});
it.each([[false, false], [false, true], [true, false], [true, true]])("actual parent preserves independent refreshed preview=%s/download=%s capabilities", async (canPreview, canDownload) => {
  useRealPreview();
  const view = mount();
  await selectActualSecondFile();
  state.read.mockImplementation((_r, p: DmsBrowserCriteria) => Promise.resolve(realPreviewResponse(p, {canPreview, canDownload})));
  await act(async () => {await view.client.invalidateQueries({queryKey: [...dmsBrowserPrefix(dmsBrowserIdentity(ctx)), "files"]});});
  await screen.findByRole("button", {name: "First 1.pdf"});
  expectFileUrls(11, canPreview, canDownload);
  if (!canPreview) expect(screen.getByText(/does not allow inline preview/)).toBeTruthy();
  expect(calls("files")).toHaveLength(2);
});
