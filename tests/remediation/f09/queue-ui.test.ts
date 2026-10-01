// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EmailQueuePageClient } from "@/features/notifications/admin/email-queue-page-client";
import type { EmailQueuePage } from "@/server/actions/notifications/email-queue";
const m = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/server/actions/notifications/email-queue", () => ({ getEmailQueuePage: m.get }));
vi.mock("@/features/notifications/admin/email-queue-process-panel", () => ({ EmailQueueProcessPanel: () => React.createElement("div", null, "Process controls") }));
vi.mock("@/features/notifications/admin/email-queue-table", () => ({ EmailQueueTable: (p: {total: number; loading: boolean; options: {page:number}; onOptions: (o:unknown)=>void}) => React.createElement("div", null,
  React.createElement("span", null, "Matches: " + p.total),
  React.createElement("button", { onClick: () => p.onOptions({ ...p.options, page: 9 }) }, "Page nine"),
  React.createElement("button", { disabled: p.loading }, "Row action")) }));
const data = (total=754): EmailQueuePage => ({ items: [], total, allTotal: total, page: 1, pageSize: 25, statusCounts: { pending: 300 } });
beforeEach(() => { vi.clearAllMocks(); m.get.mockResolvedValue({ success: true, data: data() }); });
afterEach(cleanup);
const mount = (initialPage:EmailQueuePage|null=data(),initialError:string|null=null) => render(React.createElement(EmailQueuePageClient,{initialPage,initialError,canManage:true,canProcess:true}));
it("shows whole-queue totals and requests later pages from the server", async () => {
  mount(); expect(screen.getByText(/754 total, 300 pending/)).toBeTruthy();
  await act(async () => fireEvent.click(screen.getByText("Page nine")));
  expect(m.get).toHaveBeenCalledWith(expect.objectContaining({ page: 9 }));
});
it("uses server filtering and resets to page one", async () => {
  mount(); await act(async () => fireEvent.click(screen.getByText("pending (300)")));
  expect(m.get).toHaveBeenCalledWith(expect.objectContaining({ status: "pending", page: 1 }));
});
it("ignores stale responses that arrive after the latest request", async () => {
  let first:(v:unknown)=>void=()=>{};let second:(v:unknown)=>void=()=>{};
  m.get.mockImplementationOnce(()=>new Promise(resolve=>{first=resolve;})).mockImplementationOnce(()=>new Promise(resolve=>{second=resolve;}));
  mount();fireEvent.click(screen.getByText("Page nine"));fireEvent.click(screen.getByText("Page nine"));
  await act(async()=>{second({success:true,data:data(999)});});
  await act(async()=>{first({success:true,data:data(111)});});
  expect(screen.getByText(/999 total/)).toBeTruthy();expect(screen.queryByText(/111 total/)).toBeNull();
});
it("keeps failures visible and disables actions until successful refresh", async () => {
  m.get.mockRejectedValueOnce(Error("private response"));mount();
  await act(async()=>fireEvent.click(screen.getByLabelText("Refresh queue")));
  expect(screen.getByRole("alert").textContent).toContain("last successful results");
  expect(screen.getByRole("alert").textContent).not.toContain("private response");
  expect((screen.getByText("Row action") as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("group", {name:"Queue processing controls"}) as HTMLFieldSetElement).disabled).toBe(true);
  await act(async()=>fireEvent.click(screen.getByLabelText("Refresh queue")));
  expect(screen.queryByRole("alert")).toBeNull();expect(screen.getByText("Process controls")).toBeTruthy();
});
it("preserves the mounted test-email form during a queue refresh", async () => {
  mount(); const original=screen.getByText("Process controls");
  await act(async()=>fireEvent.click(screen.getByLabelText("Refresh queue")));
  expect(screen.getByText("Process controls")).toBe(original);
});
it("initial read failure is not misrepresented as a successful empty queue", () => {
  mount(null,"Queue unavailable");expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.getByText("Queue counts unavailable")).toBeTruthy();expect(screen.queryByText(/0 total/)).toBeNull();
});
