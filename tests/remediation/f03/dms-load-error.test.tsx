// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const state = vi.hoisted(() => ({ refresh: vi.fn(), allowed: true,
  docs: { success: true, data: [] as unknown[], error: undefined as string | undefined },
  sessions: { success: true, data: [] },
  defaults: { success: true, data: { categories: [], documentTypes: [] } } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }), redirect: () => { throw new Error("denied"); } }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: async () => ({}), hasPermission: () => state.allowed, isGlobalAdmin: () => false }));
vi.mock("@/server/actions/dms/documents", () => ({ getDmsDocuments: async () => state.docs, getArchivedDocuments: async () => state.docs, getDmsNewDocumentDefaults: async () => state.defaults }));
vi.mock("@/server/reads/dms-documents",()=>({readDmsDocumentPage:async()=>({...state.docs,data:{rows:state.docs.data,totalCount:state.docs.data.length}})}));
vi.mock("@/server/reads/dms-list-choices",()=>({readDmsListChoices:async()=>state.defaults}));
vi.mock("@/components/erp/page-header", () => ({ ERPPageHeader: () => null }));
vi.mock("@/features/dms/documents/dms-documents-table", () => ({ DmsDocumentsTable: () => <p>No documents found</p> }));
vi.mock("@/features/dms/archive/dms-archive-table", () => ({ DmsArchiveTable: () => <p>No archived documents found</p> }));
vi.mock("@/server/actions/dms/upload-sessions", () => ({ getDmsUploadSessions: async () => state.sessions }));
vi.mock("@/server/actions/dms/batch-intake", () => ({ isDmsBatchIntakeEnabled: async () => false }));
vi.mock("@/server/actions/dms/ai-intake", () => ({ isDmsAiAutoStartEnabled: async () => false }));
vi.mock("@/features/dms/upload/dms-upload-inbox-page-client", () => ({ DmsUploadInboxPageClient: () => <p>No documents found</p> }));
import DocumentsPage from "@/app/(protected)/dms/documents/page";
import ArchivePage from "@/app/(protected)/dms/archive/page";
import InboxPage from "@/app/(protected)/dms/inbox/page";
const Inbox = () => InboxPage({ searchParams: Promise.resolve({}) });
beforeEach(() => { state.allowed = true; state.refresh.mockClear(); state.docs = { success: true, data: [], error: undefined }; state.defaults.success = true; state.sessions.success = true; });
afterEach(cleanup);
it.each([DocumentsPage, ArchivePage, Inbox])("shows safe failure, not an empty list, and supports retry", async (Page) => {
  state.docs = { success: false, data: [], error: "private database diagnostic 57014" };
  render(await Page());
  expect(screen.getByRole("alert").textContent).toContain("Documents could not be loaded");
  expect(screen.queryByText(/No (archived )?documents found/)).toBeNull();
  expect(document.body.textContent).not.toContain("57014");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(state.refresh).toHaveBeenCalledOnce();
});
it.each([DocumentsPage, ArchivePage, Inbox])("does not hide failed lookup loading", async (Page) => {
  state.defaults.success = false; render(await Page()); expect(screen.getByRole("alert")).toBeTruthy();
});
it.each([DocumentsPage, ArchivePage, Inbox])("keeps legitimate empty results separate from failures", async (Page) => {
  render(await Page()); expect(screen.queryByRole("alert")).toBeNull(); expect(screen.getByText(/No (archived )?documents found/)).toBeTruthy();
});
it.each([DocumentsPage, ArchivePage, Inbox])("does not replace permission denial with retry", async (Page) => {
  state.allowed = false; await expect(Page()).rejects.toThrow("denied");
});
it("does not hide failed upload-session loading", async () => {
  state.sessions.success = false; render(await Inbox()); expect(screen.getByRole("alert")).toBeTruthy();
});
