// @vitest-environment jsdom
// Actual DMS record controller, draft hooks, invalidators and QueryClient.
// Mutations, child UI and workspace/navigation boundaries are synthetic; no native writes.
import "../remediation/f05/setup";
import React from "react";
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {QueryClient, QueryClientProvider, QueryObserver} from "@tanstack/react-query";
import type {ERPRecordWorkspaceFormProps} from "@/components/workspace/erp-record-workspace-form";
import type {DmsDocumentRecordData} from "@/server/actions/dms/documents";
import type {AuthContext} from "@/lib/rbac/check";
import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import {createWorkspaceDraftStore} from "@/lib/workspace/workspace-draft-store";

const m = vi.hoisted(() => ({store: null as ReturnType<typeof createWorkspaceDraftStore> | null, shell: null as ERPRecordWorkspaceFormProps | null,
  create: vi.fn(), update: vi.fn(), link: vi.fn(), replace: vi.fn(), close: vi.fn(), rename: vi.fn(), route: vi.fn(), dirty: vi.fn(), dispatch: vi.fn(),
  path: "/dms/documents/record/11", approvalProps: null as {documentId: number | null; authContext: AuthContext} | null}));
vi.mock("next/navigation", () => ({usePathname: () => m.path, useRouter: () => ({replace: m.replace})}));
vi.mock("@/components/workspace/workspace-provider", () => ({useWorkspaceContext: () => ({state: {activeTabId: "owner", tabs: [{id: "owner", route: m.path}]}, dispatch: m.dispatch})}));
vi.mock("@/components/workspace/workspace-draft-provider", () => ({useWorkspaceDraftStoreContext: () => m.store}));
vi.mock("@/hooks/use-workspace-form-navigation", () => ({useWorkspaceFormNavigation: () => ({activeTab: {id: "owner"}, markDirty: m.dirty, closeTab: m.close, renameTab: m.rename, updateTabRoute: m.route})}));
vi.mock("@/components/workspace/erp-record-workspace-form", () => ({ERPRecordWorkspaceForm: (props: ERPRecordWorkspaceFormProps) => {m.shell = props; return <div>{props.children}</div>;},
  ERPRecordSectionPanel: ({children, id, activeId}: {children: React.ReactNode; id: string; activeId: string}) => id === activeId ? <section>{children}</section> : null}));
vi.mock("sonner", () => ({toast: {error: vi.fn(), success: vi.fn(), warning: vi.fn()}}));
vi.mock("@/server/actions/dms/documents", () => ({createDmsDocument: m.create, updateDmsDocument: m.update}));
vi.mock("@/server/actions/dms/entity-documents", () => ({linkDmsDocumentToEntity: m.link}));
vi.mock("@/features/dms/documents/sections/dms-document-ai-section", () => ({DmsDocumentAiSection: () => null}));
vi.mock("@/features/dms/documents/sections/dms-document-ai-summary-section", () => ({DmsDocumentAiSummarySection: () => null}));
vi.mock("@/features/dms/documents/sections/dms-document-approvals-section", () => ({DmsDocumentApprovalsSection: (props: {documentId: number | null; authContext: AuthContext}) => {m.approvalProps = props; return null;}}));
vi.mock("@/features/dms/documents/sections/dms-document-ask-ai-section", () => ({DmsDocumentAskAiSection: () => null}));
vi.mock("@/features/dms/documents/sections/dms-document-audit-section", () => ({DmsDocumentAuditSection: () => null}));
vi.mock("@/features/dms/documents/sections/dms-document-comments-section", () => ({DmsDocumentCommentsSection: () => null}));
vi.mock("@/features/dms/documents/sections/dms-document-content-section", () => ({DmsDocumentContentSection: () => null}));
vi.mock("@/features/dms/documents/sections/dms-document-expiry-section", () => ({DmsDocumentExpirySection: () => null}));
vi.mock("@/features/dms/documents/sections/dms-document-files-section", () => ({DmsDocumentFilesSection: () => null}));
vi.mock("@/features/dms/documents/sections/dms-document-intelligence-section", () => ({DmsDocumentIntelligenceSection: () => null}));
vi.mock("@/features/dms/documents/sections/dms-document-links-section", () => ({DmsDocumentLinksSection: () => null}));
vi.mock("@/features/dms/documents/sections/dms-document-metadata-section", () => ({DmsDocumentMetadataSection: () => null}));
vi.mock("@/features/dms/documents/sections/dms-document-ocr-section", () => ({DmsDocumentOcrSection: () => null}));
vi.mock("@/features/dms/documents/sections/dms-document-semantic-section", () => ({DmsDocumentSemanticSection: () => null}));
vi.mock("@/features/dms/documents/sections/dms-document-tags-section", () => ({DmsDocumentTagsSection: () => null}));
vi.mock("@/features/dms/documents/sections/dms-document-understanding-section", () => ({DmsDocumentUnderstandingSection: () => null}));
vi.mock("@/features/dms/documents/sections/dms-document-versions-section", () => ({DmsDocumentVersionsSection: () => null}));
vi.mock("@/features/dms/documents/sections/dms-document-overview-section", () => ({DmsDocumentOverviewSection: (props: {
  getDraftDefault: (field: string, fallback: string) => string; doc: {title: string} | null;
  setDocumentTypeId: (id: number) => void; setCategoryId: (id: number) => void;
}) => <><input aria-label="Synthetic document title" name="title" defaultValue={props.getDraftDefault("title", props.doc?.title ?? "")} />
  <button type="button" onClick={() => {props.setDocumentTypeId(1); props.setCategoryId(2);}}>Set synthetic selections</button></>}));

import {DmsDocumentRecordForm, type DmsEntityContext} from "@/features/dms/documents/dms-document-record-form";

const clients: QueryClient[] = [];
const draftKey = "draft:tab:owner:dms-doc-workspace-form";
const browserKey = ["hr", "employees", "document-browser", "owner-a", "documents", "synthetic-employee-7"];
const inactiveKey = ["hr", "employees", "document-browser", "owner-b", "documents", "synthetic-employee-8"];
const dmsBrowserKey = ["dms", "browser", "owner-a", "search", "{}"];
const dmsFileKey = ["dms", "browser", "owner-a", "files", '{"documentId":11}'];
const dmsInactiveKey = ["dms", "browser", "owner-b", "search", "{}"];
const affectedBrowserKeys = [browserKey, inactiveKey, dmsBrowserKey, dmsFileKey, dmsInactiveKey];
const oldKeys = [["dms", "documents"], ["dms", "documents", 11], ["read", "dms-documents"]];
const unrelatedKey = ["hr", "payroll", "summary", 7];
const entityKeys = ["entity-documents", "entity-document-compliance", "attachable-documents"].map(key => ["dms", key, "employee", 7]);
const auth = {profile: {id: 1, auth_user_id: "synthetic"}, permissionCodes: [], roleCodes: []} as unknown as AuthContext;
const doc = {id: 11, document_no: "SYNTHETIC-DOC-11", title: "Original", document_type_id: 1, category_id: 2,
  owning_company_id: 1, owning_branch_id: 4, party_id: null, status: "draft", confidentiality_level: "internal"} as DmsDocumentRecordData;

function mount(mode: "add" | "edit" | "view" = "edit", entityContext?: DmsEntityContext) {
  const q = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}}); clients.push(q);
  for (const key of [...affectedBrowserKeys, ...oldKeys, ...entityKeys, unrelatedKey]) q.setQueryData(key, {revision: 1});
  m.path = `/dms/documents/record/${mode === "add" ? "new" : 11}`;
  const ui = render(<QueryClientProvider client={q}><DmsDocumentRecordForm mode={mode} doc={mode === "add" ? null : doc} authContext={auth}
    documentTypes={[]} categories={[]} entityContext={entityContext} /></QueryClientProvider>);
  if (mode !== "view") {
    fireEvent.change(screen.getByRole("textbox", {name: "Synthetic document title"}), {target: {value: "Synthetic changed"}});
    fireEvent.click(screen.getByRole("button", {name: "Set synthetic selections"}));
  }
  return {q, ui};
}
async function save(close = false) {await act(async () => {await (close ? m.shell?.onSaveAndClose?.() : m.shell?.onSave?.());});}
function deferred<T>() {let resolve!: (value: T) => void; const promise = new Promise<T>(done => {resolve = done;}); return {promise, resolve};}

beforeEach(() => {vi.clearAllMocks(); m.store = createWorkspaceDraftStore(); m.shell = null; m.approvalProps = null;
  m.create.mockImplementation(async (_payload: unknown, contract: WorkspaceSaveContract) => ({success: true, data: {id: 11, document_no: "SYNTHETIC-DOC-11", operation_id: contract.operationId, replayed: false}}));
  m.update.mockResolvedValue({success: true}); m.link.mockResolvedValue({success: true, data: {id: 91}});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {cleanup(); clients.splice(0).forEach(q => q.clear()); vi.restoreAllMocks();});

it.each(["add", "edit"] as const)("actual %s confirmed document save refreshes browser and old record keys without changing payload or draft success", async mode => {
  const {q} = mount(mode); expect(m.store!.getDraft(draftKey)?.title).toBe("Synthetic changed"); await save();
  for (const key of [...affectedBrowserKeys, ...oldKeys]) expect(q.getQueryState(key)?.isInvalidated).toBe(true);
  expect(q.getQueryState(unrelatedKey)?.isInvalidated).toBe(false); expect(q.getQueryData(inactiveKey)).toEqual({revision: 1});
  expect(m.store!.hasDraft(draftKey)).toBe(false); expect(m.shell?.isDirty).toBe(false);
  const write = mode === "add" ? m.create : m.update; expect(write).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledWith({...(mode === "edit" ? {id: 11} : {}), title: "Synthetic changed", description: null, document_type_id: 1,
    category_id: 2, status: "draft", confidentiality_level: "internal", issue_date: null, expiry_date: null,
    owning_company_id: mode === "edit" ? 1 : null, owning_branch_id: mode === "edit" ? 4 : null, party_id: null},
    ...(mode === "add" ? [{operationId: expect.stringMatching(/^[0-9a-f-]{36}$/), revision: null}] : []));
  expect(m.link).not.toHaveBeenCalled(); expect(m.close).not.toHaveBeenCalled(); expect(m.replace).toHaveBeenCalledTimes(mode === "add" ? 1 : 0);
});
it("the actual document parent passes its exact principal and document into the lazy approval section", async () => {
  mount("view"); expect(m.approvalProps).toBeNull();
  await act(async () => m.shell?.onSectionChange("approvals"));
  expect(m.approvalProps?.documentId).toBe(11); expect(m.approvalProps?.authContext).toBe(auth);
  expect(m.update).not.toHaveBeenCalled();
});
it("an incomplete creation receipt retains the draft and retries only the original payload and operation", async () => {
  m.create.mockResolvedValueOnce({success: true, data: {id: 11, document_no: "SYNTHETIC-DOC-11"}});
  const {q} = mount("add"); await save();
  const original = structuredClone(m.create.mock.calls[0]);
  for (const key of [...affectedBrowserKeys, ...oldKeys]) expect(q.getQueryState(key)?.isInvalidated).toBe(false);
  expect(m.store!.getDraft(draftKey)?.title).toBe("Synthetic changed"); expect(m.replace).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox", {name: "Synthetic document title"}), {target: {value: "Late input must not replace submitted values"}});
  await save(); expect(m.create).toHaveBeenCalledTimes(2); expect(m.create.mock.calls[1]).toEqual(original);
  expect(q.getQueryState(browserKey)?.isInvalidated).toBe(true); expect(m.update).not.toHaveBeenCalled();
});
it("a pending write leaves browser data and current draft untouched until confirmed", async () => {
  const pending = deferred<unknown>(); m.update.mockReturnValue(pending.promise); const {q} = mount(); let saved: unknown;
  act(() => {saved = m.shell?.onSave?.();}); expect(m.shell?.isSubmitting).toBe(true);
  for (const key of affectedBrowserKeys) expect(q.getQueryState(key)?.isInvalidated).toBe(false);
  expect(m.store!.hasDraft(draftKey)).toBe(true);
  await act(async () => {pending.resolve({success: true}); await saved;});
  for (const key of affectedBrowserKeys) expect(q.getQueryState(key)?.isInvalidated).toBe(true);
  expect(m.shell?.isSubmitting).toBe(false);
});
it.each(["rejected", "conflict", "response-loss"])("actual %s write preserves draft and does not refresh or close", async outcome => {
  if (outcome === "response-loss") m.update.mockRejectedValue(Error("synthetic response unavailable"));
  else m.update.mockResolvedValue({success: false, error: outcome === "conflict" ? "Record changed" : "Permission denied", conflict: outcome === "conflict"});
  const {q} = mount(); await save(true);
  for (const key of [...affectedBrowserKeys, ...oldKeys, ...entityKeys]) expect(q.getQueryState(key)?.isInvalidated).toBe(false);
  expect(m.store!.getDraft(draftKey)?.title).toBe("Synthetic changed"); expect(m.shell?.isDirty).toBe(true);
  expect(m.close).not.toHaveBeenCalled(); expect(m.replace).not.toHaveBeenCalled(); expect(m.update).toHaveBeenCalledTimes(1);
});
it("save-and-close keeps the established successful force-close behavior", async () => {
  const {q} = mount(); await save(true); expect(q.getQueryState(browserKey)?.isInvalidated).toBe(true);
  expect(m.close).toHaveBeenCalledExactlyOnceWith("owner", {force: true}); expect(m.dirty).toHaveBeenCalledWith("owner", false);
});
it("view mode has no save dispatch and leaves cached reads unchanged", () => {
  const {q} = mount("view"); expect(m.shell?.onSave).toBeUndefined(); expect(m.shell?.onSaveAndClose).toBeUndefined();
  expect(q.getQueryState(browserKey)?.isInvalidated).toBe(false); expect(m.update).not.toHaveBeenCalled();
});
it.each([browserKey, dmsBrowserKey])("confirmed auto-link refreshes %j again after its own completion, replacing an earlier create-only read", async (...queryKey) => {
  const link = deferred<unknown>(), oldRead = deferred<{revision: number}>(); m.link.mockReturnValue(link.promise);
  const {q} = mount("add", {entityType: "employee", entityId: 7}); let revision = 2, oldSignal: AbortSignal | undefined;
  const read = vi.fn(({signal}: {signal: AbortSignal}) => {if (revision === 2) {oldSignal = signal; return oldRead.promise;} return Promise.resolve({revision});});
  const observer = new QueryObserver(q, {queryKey, queryFn: read, staleTime: Infinity}); const stop = observer.subscribe(() => {}); let saved: unknown;
  try {
    await act(async () => {saved = m.shell?.onSave?.(); await Promise.resolve();});
    expect(m.link).toHaveBeenCalledExactlyOnceWith(11, "employee", 7, {is_primary: true}); expect(read).toHaveBeenCalledTimes(1);
    for (const key of entityKeys) expect(q.getQueryState(key)?.isInvalidated).toBe(false);
    revision = 3; await act(async () => {link.resolve({success: true, data: {id: 91}}); await saved; await Promise.resolve();});
    await act(async () => {oldRead.resolve({revision: 2}); await Promise.resolve();});
    expect(read).toHaveBeenCalledTimes(2); expect(oldSignal?.aborted).toBe(true); expect(q.getQueryData(queryKey)).toEqual({revision: 3});
    for (const key of entityKeys) expect(q.getQueryState(key)?.isInvalidated).toBe(true);
    expect(q.getQueryData(inactiveKey)).toEqual({revision: 1}); expect(m.create).toHaveBeenCalledTimes(1); expect(m.replace).toHaveBeenCalledTimes(1);
  } finally {stop();}
});
it.each(["returned-failure", "thrown-failure"])("%s auto-link preserves the known document write without pretending the entity link succeeded", async outcome => {
  if (outcome === "returned-failure") m.link.mockResolvedValue({success: false, error: "Synthetic link denied"});
  else m.link.mockRejectedValue(Error("Synthetic link response unavailable"));
  const {q} = mount("add", {entityType: "employee", entityId: 7}); await save();
  expect(q.getQueryState(browserKey)?.isInvalidated).toBe(true); expect(m.create).toHaveBeenCalledTimes(1); expect(m.link).toHaveBeenCalledTimes(1);
  for (const key of entityKeys) expect(q.getQueryState(key)?.isInvalidated).toBe(false);
  // F06 keeps the accepted creation identity even when optional linking fails.
  // Both paths open that document; neither dispatches a replacement creation.
  expect(m.replace).toHaveBeenCalledExactlyOnceWith('/dms/documents/record/11?mode=edit');
});
