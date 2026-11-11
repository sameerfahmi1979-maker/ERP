// @vitest-environment jsdom
import "./setup";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ConfiguredRow, EditColumns, useListColumns, type ListColumn } from "@/components/erp/table/list-controls";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { useLoadedListView, LoadedListTools } from "@/components/erp/table/loaded-list-view";
import { WorkspaceUiMemoryProvider } from "@/hooks/use-persistent-ui-state";
import { worklistColumnStorageKey } from "@/lib/ui/worklist-column-ids";
import { fitWorklistColumns } from "@/lib/ui/fit-worklist-columns";

vi.mock("next/navigation", () => ({ usePathname: () => "/private-route/12345" }));
vi.mock("@/components/erp/export/erp-export-menu", () => ({ ERPExportMenu: () => null }));

const OWNER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const DOCS_KEY = worklistColumnStorageKey(OWNER, "dms-documents")!;
const REPORT_KEY = worklistColumnStorageKey(OWNER, "admin.reports.history")!;
const columns: ListColumn[] = [
  { id: "selection", label: "Selection", width: 44, visible: true, required: true, resizable: false, position: "start" },
  { id: "code", label: "Code", width: 110, visible: true, required: true },
  { id: "title", label: "Title", width: 240, visible: true },
  { id: "status", label: "Status", width: 90, visible: true },
];

function Shell({ owner = OWNER, children }: { owner?: string; children: ReactNode }) {
  return <FluentProvider theme={webLightTheme}>
    <WorkspaceUiMemoryProvider key={owner} principalId={owner}>{children}</WorkspaceUiMemoryProvider>
  </FluentProvider>;
}

function CustomList({ id = "dms-documents", definitions = columns }: { id?: string; definitions?: ListColumn[] }) {
  const layout = useListColumns(id, definitions);
  return <>
    <EditColumns columns={layout.columns} defaults={layout.defaults} onApply={layout.setColumns} />
    <table><colgroup>{layout.visible.map(column => <col key={column.id} data-column={column.id} style={{ width: column.width }} />)}</colgroup>
      <tbody><ConfiguredRow columns={layout.columns}>
        <td data-column="selection">Pick</td><td data-column="code">DOC</td>
        <td data-column="title">Private synthetic title</td><td data-column="status">Active</td><td>Open</td>
      </ConfiguredRow></tbody></table>
  </>;
}

const edit = () => fireEvent.click(screen.getByRole("button", { name: "Edit columns" }));
const apply = () => fireEvent.click(screen.getByRole("button", { name: "Apply" }));
const reset = () => fireEvent.click(screen.getByRole("button", { name: "Restore defaults" }));
const cells = () => screen.getAllByRole("cell").map(cell => cell.textContent);
const width = (name: string, value: string) => fireEvent.change(screen.getByRole("spinbutton", { name: `${name} width` }), { target: { value } });

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("saves custom worklist order, visibility and widths and restores them after a fresh shell mounts", () => {
  const first = render(<Shell><CustomList /></Shell>);
  edit();
  fireEvent.click(screen.getByRole("checkbox", { name: "Status" }));
  fireEvent.click(screen.getByRole("button", { name: "Move Title up" }));
  width("Title", "320");
  expect(localStorage.getItem(DOCS_KEY)).toBeNull();
  apply();
  const saved = JSON.parse(localStorage.getItem(DOCS_KEY)!);
  expect(saved.map((column: ListColumn) => column.id)).toEqual(["selection", "title", "code", "status"]);
  expect(saved[1]).toEqual({ id: "title", visible: true, width: 320 });
  expect(saved[3].visible).toBe(false);
  expect(localStorage.getItem(DOCS_KEY)).not.toContain("Private synthetic title");
  first.unmount();
  const reopened = render(<Shell><CustomList /></Shell>);
  expect(cells()).toEqual(["Pick", "Private synthetic title", "DOC", "Open"]);
  expect(reopened.container.querySelector<HTMLElement>('col[data-column="title"]')?.style.width).toBe("320px");
  expect(reopened.container.querySelector<HTMLElement>('col[data-column="selection"]')?.style.width).toBe("44px");
});

it("keeps the saved layout on Cancel and removes the override only after applying reset", () => {
  render(<Shell><CustomList /></Shell>);
  edit(); width("Title", "330"); apply();
  const saved = localStorage.getItem(DOCS_KEY);
  edit(); reset();
  expect((screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(localStorage.getItem(DOCS_KEY)).toBe(saved);
  edit(); reset(); apply();
  expect(localStorage.getItem(DOCS_KEY)).toBeNull();
  cleanup();
  const reopened = render(<Shell><CustomList /></Shell>);
  expect(reopened.container.querySelector<HTMLElement>('col[data-column="title"]')?.style.width).toBe("240px");
});

it("isolates different accounts and lists and restores the first account on sign-in", () => {
  const ui = render(<Shell><CustomList /></Shell>);
  edit(); fireEvent.click(screen.getByRole("checkbox", { name: "Status" })); apply();
  ui.rerender(<Shell owner={OTHER}><CustomList /></Shell>);
  expect(cells()).toContain("Active");
  ui.rerender(<Shell><CustomList id="hr-employees" /></Shell>);
  expect(cells()).toContain("Active");
  ui.rerender(<Shell><CustomList /></Shell>);
  expect(cells()).not.toContain("Active");
});

it("reconciles an old layout against the live permitted schema and safely ignores invalid storage", () => {
  localStorage.setItem(DOCS_KEY, JSON.stringify([
    { id: "retired", width: 123, visible: true },
    { id: "code", width: 4, visible: false },
    { id: "title", width: "invalid", visible: false },
    { id: "status", width: 900, visible: false },
    { id: "status", width: 200, visible: true },
  ]));
  const permitted = columns.filter(column => column.id !== "status");
  const ui = render(<Shell><CustomList definitions={permitted} /></Shell>);
  expect(cells()).toEqual(["Pick", "DOC", "Private synthetic title", "Open"]);
  expect(ui.container.querySelector<HTMLElement>('col[data-column="code"]')?.style.width).toBe("80px");
  edit(); width("Title", "300"); apply();
  const saved = localStorage.getItem(DOCS_KEY)!;
  expect(saved).not.toMatch(/retired|status|invalid|label/);
  ui.unmount();
  localStorage.setItem(DOCS_KEY, "malformed");
  render(<Shell><CustomList /></Shell>);
  expect(cells()).toContain("Active");
});

it("falls back to session memory when the browser denies storage access", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  const ui = render(<Shell><CustomList /></Shell>);
  edit(); width("Title", "270"); apply();
  expect(ui.container.querySelector<HTMLElement>('col[data-column="title"]')?.style.width).toBe("270px");
  ui.rerender(<Shell>{null}</Shell>);
  ui.rerender(<Shell><CustomList /></Shell>);
  expect(ui.container.querySelector<HTMLElement>('col[data-column="title"]')?.style.width).toBe("270px");
});

const genericRows = [{ id: 1, name: "Private synthetic report", count: 2, status: "Ready" }];
const genericColumns = [
  { accessorKey: "name", header: "Name", size: 170 },
  { accessorKey: "count", header: "Rows", size: 70 },
  { accessorKey: "status", header: "Status", size: 95 },
];
function ReportList() {
  return <ERPDataTable tableId="admin.reports.history" columns={genericColumns} data={genericRows} />;
}

it("restores narrow ERP table defaults and persists only a completed resize and column choices", () => {
  const ui = render(<Shell><ReportList /></Shell>);
  const rowsHeader = screen.getByRole("columnheader", { name: "Rows" });
  const handle = rowsHeader.querySelector<HTMLElement>(".cursor-col-resize")!;
  fireEvent.mouseDown(handle, { clientX: 100, button: 0 });
  fireEvent.mouseMove(document, { clientX: 130 });
  expect(localStorage.getItem(REPORT_KEY)).toBeNull();
  fireEvent.mouseUp(document, { clientX: 130 });
  expect(rowsHeader.style.width).toBe("100px");
  expect(localStorage.getItem(REPORT_KEY)).toContain('"width":100');
  fireEvent.change(screen.getByRole("textbox", { name: "Search..." }), { target: { value: "Private" } });
  edit(); fireEvent.click(screen.getByRole("checkbox", { name: "Status" })); apply();
  expect(Object.keys(localStorage)).toEqual([REPORT_KEY]);
  expect(localStorage.getItem(REPORT_KEY)).not.toMatch(/Private|12345/);
  ui.unmount();
  render(<Shell><ReportList /></Shell>);
  expect(screen.queryByRole("columnheader", { name: "Status" })).toBeNull();
  expect(screen.getByRole("columnheader", { name: "Rows" }).style.width).toBe("100px");
  edit(); reset();
  expect((screen.getByRole("spinbutton", { name: "Rows width" }) as HTMLInputElement).value).toBe("70");
  apply();
  expect(screen.getByRole("columnheader", { name: "Rows" }).style.width).toBe("70px");
  expect(localStorage.getItem(REPORT_KEY)).toBeNull();
});

it("shares Batch Review columns by list type and excludes embedded and unknown views from disk", () => {
  function Batch({ id, embedded = false }: { id: string; embedded?: boolean }) {
    const view = useLoadedListView(id, genericRows, [
      { id: "name", path: "name", label: "Name" }, { id: "status", path: "status", label: "Status" },
    ], { columnPreferenceId: "batch-review", presentation: embedded ? "embedded" : "worklist" });
    return <><LoadedListTools view={view} /><output>{view.visible.map(column => column.id).join(",")}</output></>;
  }
  const first = render(<Shell><Batch id="batch-review:12345" /></Shell>);
  edit(); fireEvent.click(screen.getByRole("checkbox", { name: "Status" })); apply();
  expect(Object.keys(localStorage)).toEqual([worklistColumnStorageKey(OWNER, "dms:batch-review:v1")]);
  first.unmount();
  const second = render(<Shell><Batch id="batch-review:67890" /></Shell>);
  expect(screen.getByRole("status").textContent).toBe("name");
  second.rerender(<Shell><Batch id="batch-review:67890" embedded /></Shell>);
  expect(screen.getByRole("status").textContent).toBe("name,status");
  expect(screen.queryByRole("button", { name: "Edit columns" })).toBeNull();
  second.unmount();
  render(<Shell><CustomList id="unknown:record:12345" /></Shell>);
  edit(); width("Title", "310"); apply();
  expect(Object.keys(localStorage)).toHaveLength(1);
});

it("fits at usable widths, keeps fixed controls and falls back to the minimum width without mutating preferences", () => {
  const source = [...columns, { id: "actions", width: 240, label: "Actions", visible: true }];
  const initial = structuredClone(source);
  for (const width of [510, 511, 620, 700]) {
    const fit = fitWorklistColumns(source, width);
    expect(fit.reduce((sum, column) => sum + column.width, 0)).toBe(width);
    expect(fit.map(column => column.id)).toEqual(source.map(column => column.id));
    expect(fit[0].width).toBe(44);
    expect(fit[4].width).toBeGreaterThanOrEqual(128);
  }
  const minimum = fitWorklistColumns(source, 300);
  expect(minimum.map(column => column.width)).toEqual([44, 80, 80, 80, 128]);
  expect(fitWorklistColumns(source, 1400)).toBe(source);
  expect(source).toEqual(initial);
});

it("responds to viewport changes, reaches the final columns and keeps the saved layout intact", () => {
  let width = 360;
  let resize = () => {};
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.getAttribute("aria-label")?.includes("scrollable table") ? width : 0;
  });
  vi.stubGlobal("ResizeObserver", class {
    constructor(private readonly callback: () => void) {}
    observe(node: HTMLElement) {
      if (node.getAttribute("aria-label")?.includes("scrollable table")) resize = this.callback;
    }
    unobserve() {}
    disconnect() {}
  });
  const saved = JSON.stringify([
    { id: "name", visible: true, width: 220 },
    { id: "status", visible: false, width: 95 },
    { id: "count", visible: true, width: 190 },
  ]);
  localStorage.setItem(REPORT_KEY, saved);
  render(<Shell><ReportList /></Shell>);
  const region = screen.getByRole("region", { name: /scrollable table/ });
  const table = screen.getByRole("table");
  const fit = screen.getByRole("button", { name: "Fit to screen" });
  expect(fit.getAttribute("aria-pressed")).toBe("true");
  expect(table.style.minWidth).toBe("360px");
  expect(screen.queryByRole("columnheader", { name: "Status" })).toBeNull();
  expect(region.querySelector('[data-slot="table-container"]')).toBeNull();

  width = 160;
  act(resize);
  expect(table.style.minWidth).toBe("190px");
  const scrollTo = vi.fn();
  Object.defineProperty(region, "scrollTo", { value: scrollTo });
  Object.defineProperty(region, "scrollWidth", { value: 190 });
  fireEvent.click(screen.getByRole("button", { name: "Last columns" }));
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 190 });
  fireEvent.click(screen.getByRole("button", { name: "First columns" }));
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 0 });
  region.style.direction = "rtl";
  fireEvent.click(screen.getByRole("button", { name: "Last columns" }));
  expect(scrollTo).toHaveBeenLastCalledWith({ left: -190 });

  fireEvent.click(fit);
  expect(fit.getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByRole("columnheader", { name: "Rows" }).style.width).toBe("190px");
  expect(table.style.minWidth).toBe("450px");
  expect(localStorage.getItem(REPORT_KEY)).toBe(saved);
  fireEvent.click(fit);
  width = 450;
  act(resize);
  expect(screen.queryByRole("button", { name: "Last columns" })).toBeNull();
  expect(localStorage.getItem(REPORT_KEY)).toBe(saved);

  width = 360;
  act(resize);
  const rowsHeader = screen.getByRole("columnheader", { name: "Rows" });
  const fittedRowsWidth = Number.parseInt(rowsHeader.style.width, 10);
  const handle = rowsHeader.querySelector<HTMLElement>(".cursor-col-resize")!;
  fireEvent.mouseDown(handle, { clientX: 100, button: 0 });
  fireEvent.mouseMove(document, { clientX: 120 });
  fireEvent.mouseUp(document, { clientX: 120 });
  expect(fit.getAttribute("aria-pressed")).toBe("false");
  expect(JSON.parse(localStorage.getItem(REPORT_KEY)!)).toEqual([
    { id: "select", visible: true, width: 40 },
    { id: "name", visible: true, width: 220 },
    { id: "status", visible: false, width: 95 },
    { id: "count", visible: true, width: fittedRowsWidth + 20 },
  ]);
});
