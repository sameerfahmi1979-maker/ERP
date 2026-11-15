// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { DmsBrowserSearchBar } from "@/features/dms/browser/dms-browser-search-bar";
import { DmsBrowserResizeHandle } from "@/features/dms/browser/dms-browser-resize-handle";
import { DEFAULT_FILTERS, DmsBrowserFilterBar } from "@/features/dms/browser/dms-browser-filter-bar";
import { DmsBatchUploadProgress } from "@/features/dms/upload/dms-batch-upload-progress";
import { DmsLoadingStatus } from "@/features/dms/dms-loading-status";
import { getExpiryState } from "@/features/dms/documents/dms-expiry-badge";
import { dmsBusinessDate, dmsDaysUntilExpiry, msUntilDmsBusinessMidnight } from "@/lib/dms/expiry-calendar";
import { DmsLinkEntitySelect } from "@/features/dms/documents/dms-link-entity-select";

const remote = vi.hoisted(() => vi.fn());
vi.mock("@/lib/reads/client", async original => ({
  ...await original<typeof import("@/lib/reads/client")>(),
  readJson: remote,
}));

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });
const search = (onSearch: (value: string) => void, owner = "one") =>
  <DmsBrowserSearchBar key={owner} onSearch={onSearch} isLoading={false} isAiSearching={false} />;

it("exposes the resize range and clamps usable keyboard adjustments", () => {
  const onResize = vi.fn();
  render(<DmsBrowserResizeHandle width={290} min={280} max={600} onResize={onResize} onMouseDown={vi.fn()} />);
  const handle = screen.getByRole("separator", { name: "Resize document results" });
  expect(handle.tabIndex).toBe(0);
  expect(handle.getAttribute("aria-valuenow")).toBe("290");
  for (const key of ["ArrowLeft", "ArrowRight", "Home", "End", "Tab", "constructor"]) fireEvent.keyDown(handle, {key});
  expect(onResize.mock.calls).toEqual([[280], [314], [280], [600]]);
});

it("erases legacy shared history and keeps new terms only in the current owner subtree", () => {
  localStorage.setItem("dms-browser-search-history-v1", '["private legacy term"]');
  const onSearch = vi.fn();
  const ui = render(search(onSearch));
  const input = screen.getByRole("textbox", { name: "Search documents" });
  fireEvent.focus(input);
  expect(screen.queryByText("private legacy term")).toBeNull();
  expect(localStorage.getItem("dms-browser-search-history-v1")).toBeNull();
  fireEvent.change(input, { target: { value: "private first owner" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  fireEvent.focus(input);
  expect(screen.getByRole("button", { name: "private first owner", exact: true })).toBeTruthy();
  ui.rerender(search(onSearch, "second"));
  fireEvent.focus(screen.getByRole("textbox", { name: "Search documents" }));
  expect(screen.queryByText("private first owner")).toBeNull();
});

it("retires a pending search after Clear or after the current account unmounts", () => {
  vi.useFakeTimers();
  const onSearch = vi.fn();
  const ui = render(search(onSearch));
  const input = screen.getByRole("textbox", { name: "Search documents" });
  fireEvent.change(input, { target: { value: "retired by clear" } });
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  act(() => vi.advanceTimersByTime(350));
  expect(onSearch.mock.calls).toEqual([[""]]);
  fireEvent.change(input, { target: { value: "retired by account change" } });
  ui.rerender(search(onSearch, "second"));
  act(() => vi.advanceTimersByTime(350));
  expect(onSearch.mock.calls).toEqual([[""]]);
});

it("gives filter clear and disclosure their own controls and restores focus on Escape", () => {
  const onChange = vi.fn();
  render(<DmsBrowserFilterBar docTypes={[]} filters={{ ...DEFAULT_FILTERS, status: "active" }} onChange={onChange} />);
  const disclosure = screen.getByRole("button", { name: "Active", exact: true });
  const clear = screen.getByRole("button", { name: "Clear status filter" });
  expect(disclosure.contains(clear)).toBe(false);
  fireEvent.click(disclosure);
  expect(disclosure.getAttribute("aria-expanded")).toBe("true");
  fireEvent.keyDown(screen.getByRole("button", { name: "Expired" }), { key: "Escape" });
  expect(disclosure.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(disclosure);
  fireEvent.click(clear);
  expect(onChange).toHaveBeenCalledWith(DEFAULT_FILTERS);
});

it("announces pending work and shows the batch error before offering a confirmed review", () => {
  const ui = render(<DmsLoadingStatus label="Loading documents…" />);
  expect(screen.getByRole("status").textContent).toBe("Loading documents…");
  ui.rerender(<DmsBatchUploadProgress files={[{ name: "first.pdf", phase: "pending" }]} batchCode="TEST" onOpenQueue={vi.fn()} />);
  expect(screen.getByRole("status").textContent).toBe("Processing batch…");
  expect(screen.queryByRole("button", { name: "Open Review Queue" })).toBeNull();
  ui.rerender(<DmsBatchUploadProgress files={[{ name: "first.pdf", phase: "failed", error: "Retain original file" }]} batchCode="TEST" onOpenQueue={vi.fn()} />);
  expect(screen.getByText("Retain original file")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Open Review Queue" })).toBeNull();
});

it("keeps the linked-record query input mounted through debounce and loading", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView ??= vi.fn();
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  let resolve!: (value: unknown) => void;
  remote.mockImplementation((_key, input: {search?: string}) =>
    input.search ? new Promise(done => {resolve = done;}) : Promise.resolve({success:true,data:[]}));
  const ui = render(<QueryClientProvider client={client}>
    <DmsLinkEntitySelect entityType="employee" value={null} onValueChange={vi.fn()} />
  </QueryClientProvider>);
  fireEvent.click(screen.getByRole("combobox", {name:"Linked employee"}));
  const input = await screen.findByRole("combobox", {name:"", hidden:false});
  input.focus();
  fireEvent.change(input, {target:{value:"a"}});
  fireEvent.change(input, {target:{value:"ab"}});
  expect(document.activeElement).toBe(input);
  await waitFor(() => expect(resolve).toBeTypeOf("function"));
  expect(screen.getByRole("status").textContent).toBe("Loading results…");
  expect(document.activeElement).toBe(input);
  await act(async () => resolve({success:true,data:[{id:3,label:"Synthetic employee"}]}));
  await screen.findByText("Synthetic employee");
  expect(document.activeElement).toBe(input);
  ui.unmount();
  client.clear();
});

it("uses Dubai midnight for expiry filters and badges, including today and upcoming day ranges", () => {
  const before = Date.parse("2026-11-14T19:59:59.999Z");
  const after = before + 1;
  expect(msUntilDmsBusinessMidnight(before)).toBe(1);
  expect(dmsBusinessDate(before)).toBe("2026-11-14");
  expect(dmsBusinessDate(after)).toBe("2026-11-15");
  expect(dmsBusinessDate(after, 30)).toBe("2026-12-15");
  expect(dmsDaysUntilExpiry("2026-11-14", dmsBusinessDate(before))).toBe(0);
  expect(getExpiryState("2026-11-14", dmsBusinessDate(before))).toBe("expiring_7");
  expect(getExpiryState("2026-11-14", dmsBusinessDate(after))).toBe("expired");
});
