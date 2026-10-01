// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EmailQueueProcessPanel } from "@/features/notifications/admin/email-queue-process-panel";
const m = vi.hoisted(() => ({ process: vi.fn(), queue: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/server/actions/notifications/email-queue", () => ({ processEmailQueue: m.process, queueEmail: m.queue }));
vi.mock("sonner", () => ({ toast: { error: m.error, info: m.info, success: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("lost processing response reports uncertainty, unlocks and refreshes without replay", async () => {
  m.process.mockRejectedValue(Error("private error")); const refresh=vi.fn();
  render(React.createElement(EmailQueueProcessPanel,{canManage:true,pendingCount:5,onRefresh:refresh}));
  await act(async()=>fireEvent.click(screen.getByText("Process Queue")));
  expect(m.process).toHaveBeenCalledTimes(1);expect(refresh).toHaveBeenCalledTimes(1);
  expect(m.error).toHaveBeenCalledWith(expect.stringContaining("inspect delivery outcomes"));
  expect((screen.getByText("Process Queue") as HTMLButtonElement).disabled).toBe(false);
});
it("guards rapid duplicate processing clicks and labels pending items honestly", async () => {
  let resolve:(value:unknown)=>void=()=>{};m.process.mockImplementation(()=>new Promise(r=>{resolve=r;}));
  render(React.createElement(EmailQueueProcessPanel,{canManage:true,pendingCount:5,onRefresh:vi.fn()}));
  expect(screen.getByText(/including paused and future items/)).toBeTruthy();
  fireEvent.click(screen.getByText("Process Queue"));fireEvent.click(screen.getByText("Process Queue"));
  expect(m.process).toHaveBeenCalledTimes(1);
  await act(async()=>{resolve({success:true,data:{paused:true}});});
  expect(m.info).toHaveBeenCalledWith(expect.stringContaining("no messages were sent"));
});
