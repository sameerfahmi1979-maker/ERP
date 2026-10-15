// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({openTab: vi.fn()}));
vi.mock("@/hooks/use-workspace", () => ({useWorkspace: () => ({openTab: state.openTab})}));
vi.mock("@/features/dms/documents/dms-document-status-badge", () => ({DmsDocumentStatusBadge: () => null}));
vi.mock("@/features/dms/documents/dms-expiry-badge", () => ({DmsExpiryBadge: () => null}));
import {DmsBrowserPreview} from "@/features/dms/browser/dms-browser-preview";
import type {DmsBrowserDocument} from "@/server/actions/dms/browser";
const doc: DmsBrowserDocument = {id: 7, documentNo: "SYN-7", title: "Synthetic document", typeNameEn: "Test", typeCode: "TEST", status: "active", issueDate: null, expiryDate: null,
  matchSource: "metadata", contentExcerpt: null, files: [{id: 71, fileName: "Synthetic.pdf", mimeType: "application/pdf", fileSizeBytes: 50}]};
afterEach(() => {cleanup(); state.openTab.mockClear();});
it("default caller retains the existing protected inline/download paths and full-record workspace route", () => {
  render(<DmsBrowserPreview document={doc}/>);
  expect(screen.getByTitle("Synthetic.pdf").getAttribute("src")).toBe("/api/dms/file?fileId=71&disposition=inline");
  expect(screen.getByRole("link", {name: "Download"}).getAttribute("href")).toBe("/api/dms/file?fileId=71&disposition=attachment");
  fireEvent.click(screen.getByRole("button", {name: "Open Full Record"})); expect(state.openTab).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({route: "/dms/documents/record/7", entityId: 7}));
});
it.each([[false, false], [false, true], [true, false], [true, true]])("independent preview=%s/download=%s controls never infer either grant from metadata visibility", (canPreview, canDownload) => {
  render(<DmsBrowserPreview document={doc} canPreview={canPreview} canDownload={canDownload}/>);
  expect(!!document.querySelector("iframe")).toBe(canPreview); expect(!!screen.queryByRole("link", {name: "Download"})).toBe(canDownload);
  if (!canPreview) expect(screen.getByText(/does not allow inline preview/)).toBeTruthy();
});
it("a page of files displays the independently verified total, not its page length", () => {
  render(<DmsBrowserPreview document={doc} totalFiles={31}/>); expect(screen.getByText("31 files")).toBeTruthy(); expect(screen.queryByText("1 file")).toBeNull();
});
it("document replacement retires the previous selected file and all previous byte URLs", () => {
  const second = {...doc, files: [...doc.files, {id: 72, fileName: "Second.pdf", mimeType: "application/pdf", fileSizeBytes: 10}]};
  const view = render(<DmsBrowserPreview document={second}/>); fireEvent.click(screen.getByRole("button", {name: "Second.pdf"})); expect(document.querySelector('iframe[title="Second.pdf"]')?.getAttribute("src")).toContain("fileId=72");
  view.rerender(<DmsBrowserPreview document={{...doc, id: 8, files: [{...doc.files[0], id: 81, fileName: "New.pdf"}]}}/>);
  expect(screen.queryByTitle("Second.pdf")).toBeNull(); expect(screen.getByTitle("New.pdf").getAttribute("src")).toContain("fileId=81");
});
it("confirmed empty files is distinct from an unselected preview", () => {
  const view = render(<DmsBrowserPreview document={{...doc, files: []}} totalFiles={0}/>); expect(screen.getByText(/no files attached/)).toBeTruthy();
  view.rerender(<DmsBrowserPreview document={null}/>); expect(screen.queryByText(/no files attached/)).toBeNull(); expect(screen.queryByRole("link", {name: "Download"})).toBeNull();
});
