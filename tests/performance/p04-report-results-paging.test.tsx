// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, expect, it, vi} from "vitest";
import type {ERPTableConfig} from "@/components/erp/table/erp-table-types";
import {ReportResultsTable} from "@/features/report-center/report-results-table";
import type {ReportScreenPage, ReportScreenPageQuery} from "@/lib/report-center/types";

vi.mock("@/components/erp/table/erp-data-table", () => ({
  ERPDataTable: ({data, serverRead, isLoading}: ERPTableConfig<Record<string, unknown>>) => <div>
    <button onClick={() => serverRead?.onPaginationChange(previous => ({...previous, pageIndex: previous.pageIndex + 1}))}>Next</button>
    <button onClick={() => serverRead?.onPaginationChange(previous => ({...previous, pageIndex: 0}))}>First</button>
    <button onClick={() => serverRead?.onSortingChange([{id: "name", desc: true}])}>Sort descending</button>
    <input aria-label="Search" value={serverRead?.globalFilter}
      onChange={event => serverRead?.onGlobalFilterChange(event.target.value)} />
    <span data-testid="total">{serverRead?.totalCount ?? "pending"}</span>
    <span data-testid="result">{isLoading ? "loading" : data.map(row => row.name).join(",")}</span>
  </div>,
}));

const columns = ["name"];
const page: ReportScreenPage = {pageIndex: 0, pageSize: 25, totalCount: 501, receipt: "synthetic", filters: [{id: "name", type: "text"}], sortDescFirst: []};
function result(label: string, pageIndex = 0, totalCount = 501) {
  return {data: {columns, rows: [{name: label}]}, page: {...page, pageIndex, totalCount}};
}
afterEach(cleanup);

it("keeps an exact result count and rechecks authority when returning to the first page", async () => {
  const initial = result("initial row");
  const load = vi.fn(async (query: ReportScreenPageQuery) => result(query.pageIndex ? "next row" : "rechecked first row", query.pageIndex));
  render(<ReportResultsTable data={initial.data} initialPage={page} loadPage={load} isLoading={false} />);
  expect(screen.getByTestId("result").textContent).toBe("initial row");
  expect(screen.getByTestId("total").textContent).toBe("501");
  expect(load).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name: "Next"}));
  expect(screen.getByTestId("result").textContent).toBe("loading");
  await waitFor(() => expect(screen.getByTestId("result").textContent).toBe("next row"));
  expect(load).toHaveBeenLastCalledWith(expect.objectContaining({pageIndex: 1, pageSize: 25}), expect.any(Function));
  fireEvent.click(screen.getByRole("button", {name: "First"}));
  await waitFor(() => expect(screen.getByTestId("result").textContent).toBe("rechecked first row"));
  expect(load).toHaveBeenCalledTimes(2);
});

it("sends whole-result search and sort criteria and ignores stale completions", async () => {
  let resolveOld!: (value: ReturnType<typeof result>) => void;
  const old = new Promise<ReturnType<typeof result>>(resolve => {resolveOld = resolve;});
  const load = vi.fn<(query: ReportScreenPageQuery, isCurrent: () => boolean) => Promise<ReturnType<typeof result>>>()
    .mockReturnValueOnce(old).mockResolvedValueOnce(result("current row", 0, 1));
  render(<ReportResultsTable data={result("initial row").data} initialPage={page} loadPage={load} isLoading={false} />);
  fireEvent.change(screen.getByLabelText("Search"), {target: {value: "old criteria"}});
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText("Search"), {target: {value: "current criteria"}});
  fireEvent.click(screen.getByRole("button", {name: "Sort descending"}));
  await waitFor(() => expect(screen.getByTestId("result").textContent).toBe("current row"));
  expect(load).toHaveBeenLastCalledWith(expect.objectContaining({globalFilter: "current criteria", sorting: [{id: "name", desc: true}]}), expect.any(Function));
  expect(load.mock.calls[0][1]()).toBe(false);
  await act(async () => resolveOld(result("discarded row")));
  expect(screen.getByTestId("result").textContent).toBe("current row");
  expect(screen.getByTestId("total").textContent).toBe("1");
});
