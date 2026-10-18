// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ERPTableServerRead } from "@/components/erp/table/erp-table-types";
import type { HrBrowserDocument } from "@/lib/reads/hr-document-browser-schema";
import type { DmsBrowserDocument } from "@/server/actions/dms/browser";

// Render the real compact collection/navigation; isolate only persistence and badges.
vi.mock("@/hooks/use-persistent-ui-state", () => ({ usePersistentUiState: (_key: string, initial: unknown) => useState(initial) }));
vi.mock("@/components/ui/badge", () => ({ Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/features/dms/documents/dms-document-status-badge", () => ({ DmsDocumentStatusBadge: ({ status }: { status: string }) => <span>{status}</span> }));
vi.mock("@/features/dms/documents/dms-expiry-badge", () => ({ DmsExpiryBadge: ({ expiryDate }: { expiryDate: string | null }) => expiryDate ? <span>{expiryDate}</span> : null }));
import { HrDocBrowserDocList } from "@/features/hr/document-browser/hr-doc-browser-doc-list";
import { DmsBrowserResultsList } from "@/features/dms/browser/dms-browser-results-list";

const entity = { type: "employee" as const, id: 900001, name: "Synthetic employee", subtitle: "QA-ONLY" };
const document = (n: number): HrBrowserDocument => ({ key: `dms:${n}`, id: n, documentNo: `QA-${n}`, title: `Synthetic document ${n}`, typeNameEn: "Synthetic type", status: "active", issueDate: null, expiryDate: null, source: "dms_link" });
const read = (overrides: Partial<ERPTableServerRead<HrBrowserDocument>> = {}): ERPTableServerRead<HrBrowserDocument> => ({
  pagination: { pageIndex: 0, pageSize: 25 }, sorting: [], globalFilter: "", columnFilters: [], totalCount: 1, filters: [],
  onPaginationChange: vi.fn(), onSortingChange: vi.fn(), onGlobalFilterChange: vi.fn(), onColumnFiltersChange: vi.fn(), ...overrides,
});
const hr = (overrides: Partial<React.ComponentProps<typeof HrDocBrowserDocList>> = {}) => <HrDocBrowserDocList entity={entity} documents={[document(1)]} serverRead={read()} isLoading={false} selectedIndex={0} onSelect={vi.fn()} {...overrides} />;
const dmsDocument: DmsBrowserDocument = { id: 900002, documentNo: "QA-DMS-2", title: "Synthetic DMS document", typeNameEn: "Synthetic type", typeCode: "QA", status: "active", issueDate: null, expiryDate: null, matchSource: "metadata", contentExcerpt: null, files: [] };
const dms = (overrides: Partial<React.ComponentProps<typeof DmsBrowserResultsList>> = {}) => <DmsBrowserResultsList rows={[dmsDocument]} total={1} selectedId={dmsDocument.id} onSelect={vi.fn()} isLoading={false} isLoadingMore={false} hasMore={false} onLoadMore={vi.fn()} query="Synthetic" hasQuery {...overrides} />;
let intersect: IntersectionObserverCallback;
const disconnect = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe() {}
    disconnect = disconnect;
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
function expectCompact(container: HTMLElement) {
  expect(container.querySelector('[data-list-presentation="embedded"]')).not.toBeNull();
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.queryByRole("columnheader")).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: /edit columns|edit filters|rows per page/i })).toBeNull();
}
it("HR renders document details once, without master-list columns or controls", () => {
  const { container } = render(hr()); expectCompact(container);
  expect(screen.getAllByText("Synthetic document 1")).toHaveLength(1);
  expect(screen.getAllByText("Synthetic type")).toHaveLength(1);
  expect(screen.queryByRole("navigation")).toBeNull();
});
it("HR selection uses the permitted row's index, including identity documents without a DMS id", () => {
  const onSelect = vi.fn();
  const identity: HrBrowserDocument = { ...document(2), key: "identity:2", id: null, source: "hr_identity", title: "Synthetic identity" };
  render(hr({ documents: [document(1), identity], serverRead: read({ totalCount: 2 }), onSelect, selectedIndex: 1 }));
  fireEvent.click(screen.getByRole("button", { name: /Synthetic identity/ }));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(1);
  expect(screen.getByRole("button", { name: /Synthetic identity/, pressed: true })).toBeTruthy();
});
it("HR retains server paging for documents beyond the first 25, without duplicating a local slice", () => {
  const onPaginationChange = vi.fn();
  const { rerender } = render(hr({ documents: Array.from({ length: 25 }, (_, i) => document(i + 1)), serverRead: read({ totalCount: 26, onPaginationChange }) }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(onPaginationChange.mock.calls[0][0]({ pageIndex: 0, pageSize: 25 })).toEqual({ pageIndex: 1, pageSize: 25 });
  rerender(hr({ documents: [document(26)], serverRead: read({ totalCount: 26, pagination: { pageIndex: 1, pageSize: 25 } }) }));
  expect(screen.getByRole("button", { name: /Synthetic document 26/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(true);
});
it("HR shows unavailable totals as a read problem, not permitted document contents", () => {
  render(hr({ serverRead: read({ totalCount: null }) }));
  expect(screen.getByRole("alert").textContent).toContain("could not yet be verified");
  expect(screen.queryByText("Synthetic document 1")).toBeNull();
});
it("HR keeps loading, no-owner and verified-empty states distinct", () => {
  const { rerender } = render(hr({ isLoading: true, documents: [], serverRead: read({ totalCount: null }) }));
  expect(screen.getByRole("status").textContent).toContain("Loading");
  rerender(hr({ entity: null })); expect(screen.getByText(/Select an employee or dependent/)).toBeTruthy();
  rerender(hr({ documents: [], serverRead: read({ totalCount: 0 }) })); expect(screen.getByText(/No documents linked yet/)).toBeTruthy();
});
it("HR can clear a restored limiting criterion without bringing back the full grid toolbar", () => {
  const serverRead = read({ globalFilter: "previous search", totalCount: 0 });
  const { container } = render(hr({ documents: [], serverRead })); expectCompact(container);
  fireEvent.click(screen.getByRole("button", { name: "Clear list criteria" }));
  expect(serverRead.onGlobalFilterChange).toHaveBeenCalledWith("");
  expect(serverRead.onColumnFiltersChange).toHaveBeenCalledWith([]);
});
it("DMS keeps its existing compact details-only picker and exposes selected state", () => {
  const onSelect = vi.fn(); const { container } = render(dms({ onSelect })); expectCompact(container);
  expect(screen.getAllByText(dmsDocument.title)).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: /Synthetic DMS document/, pressed: true }));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(dmsDocument);
  expect(screen.queryByRole("button", { name: /delete|download|approve/i })).toBeNull();
});
it("DMS retains guarded load-more and disconnects its observer on unmount", () => {
  const onLoadMore = vi.fn(); const view = render(dms({ hasMore: true, onLoadMore }));
  intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  expect(onLoadMore).toHaveBeenCalledTimes(1);
  view.rerender(dms({ hasMore: true, isLoadingMore: true, onLoadMore }));
  intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  expect(onLoadMore).toHaveBeenCalledTimes(1);
  view.unmount(); expect(disconnect).toHaveBeenCalled();
});
