// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {RecruitmentHistory, RecruitmentReceiptHistory} from "@/features/hr/recruitment/recruitment-history";
import {RequisitionCapacity} from "@/features/hr/recruitment/requisition-capacity";

const transport = vi.hoisted(() => ({read: vi.fn()}));
vi.mock("@/server/actions/hr/recruitment-lifecycle", () => ({
  readRecruitmentLifecycleHistory: transport.read,
  readRecentRecruitmentReceipts: transport.read,
  readRequisitionCapacity: transport.read,
}));
const cases = [
  {kind: "history", button: "Decision history", prefix: "f12-history", result: {success: true, rows: [{id: 1, created_at: "2026-10-24T00:00:00Z", action: "update", revision: "1", actor_id: 8, reason: "PRIVATE SYNTHETIC HISTORY"}], hasMore: false}},
  {kind: "receipts", button: "Check my recorded hiring decisions", prefix: "f12-receipts", result: {success: true, rows: [{created_at: "2026-10-24T00:00:00Z", receipt: {operation_id: "synthetic-operation", kind: "requisition", id: 1, revision: "1"}}], hasMore: false}},
  {kind: "capacity", button: "Check filled", prefix: "f12-capacity", result: {success: true, data: {filled: 2, remaining: 1}}},
] as const;
const clients: QueryClient[] = [];
afterEach(() => {cleanup(); clients.splice(0).forEach(client => client.clear()); transport.read.mockReset();});

it.each(cases.flatMap(entry => ["warm", "late"].map(mode => ({...entry, mode}))))("$kind $mode result is retired on account switch and cannot repopulate the old cache", async ({kind, button, prefix, result, mode}) => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}}); clients.push(client);
  let complete!: (value: unknown) => void;
  transport.read.mockImplementationOnce(() => mode === "warm" ? Promise.resolve(result) : new Promise(resolve => {complete = resolve;}));
  const tree = (identity: string) => <QueryClientProvider client={client}>{kind === "capacity"
    ? <RequisitionCapacity key={identity} id={1} vacancies={3} identity={identity}/>
    : kind === "history" ? <RecruitmentHistory key={identity} candidate={null} kind="requisition" id={1} identity={identity}/>
    : <RecruitmentReceiptHistory key={identity} candidate={null} identity={identity}/>}</QueryClientProvider>;
  const view = render(tree("synthetic-account-A"));
  fireEvent.click(screen.getByRole("button", {name: button}));
  await waitFor(() => expect(transport.read).toHaveBeenCalledTimes(1));
  if (mode === "warm") await waitFor(() => expect(client.getQueryCache().find({queryKey: [prefix, "synthetic-account-A"], exact: false})?.state.data).toEqual(result));
  view.rerender(tree("synthetic-account-B"));
  expect(client.getQueryCache().find({queryKey: [prefix, "synthetic-account-A"], exact: false})).toBeUndefined();
  expect(screen.queryByText(/PRIVATE SYNTHETIC HISTORY|2 filled/)).toBeNull();
  if (mode === "late") await act(async () => complete(result));
  expect(client.getQueryCache().find({queryKey: [prefix, "synthetic-account-A"], exact: false})).toBeUndefined();
  expect(transport.read).toHaveBeenCalledTimes(1);
  const unavailable = {success: false, error: "Synthetic account B denied"};
  transport.read.mockResolvedValueOnce(unavailable);
  fireEvent.click(screen.getByRole("button", {name: button}));
  await screen.findByRole("alert");
  expect(transport.read).toHaveBeenCalledTimes(2);
  expect(client.getQueryCache().find({queryKey: [prefix, "synthetic-account-B"], exact: false})?.state.data).toEqual(unavailable);
  view.unmount();
  expect(client.getQueryCache().find({queryKey: [prefix, "synthetic-account-B"], exact: false})).toBeUndefined();
});
