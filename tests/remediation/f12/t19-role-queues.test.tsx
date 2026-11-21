// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkQueueWorkspace } from "@/features/operations/work-queues/work-queue-workspace";
import { workQueuePage, workQueueQuery } from "@/lib/operations/work-queue-contract";

const reads = vi.hoisted(() => ({ scopes: vi.fn(), page: vi.fn() }));
vi.mock("@/server/reads/work-queues", () => ({ readWorkQueueScopes: reads.scopes, readWorkQueue: reads.page }));

const scope = { company: 17, branch: 22, company_name: "Employer A", branch_name: "Branch One", kinds: ["pro", "custody"] };
const row = {
  kind: "pro", source_type: "pro-process", source_id: "123", reference: "PRO #123", title: "Visa follow-up",
  responsible: "PRO", assignee: "Assigned officer", action: "Follow up on documents", state: "waiting_for_document",
  opened_on: "2026-11-10", due_on: "2026-11-17", evidence: "restricted",
  href: "/admin/hr/actions/pro?record=123", age_days: 10, overdue_days: 3,
};
const data = { as_of: "2026-11-20", total: 30, page: 1, page_size: 25, rows: [row] };

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("T19 work queues", () => {
  it("shows accountable work, masked evidence and source links with exact paging", async () => {
    reads.scopes.mockResolvedValue({ status: "ok", data: [scope] });
    reads.page.mockResolvedValue({ status: "ok", data });
    render(await WorkQueueWorkspace({ params: { scope: "17.22", kind: "pro", q: "Visa" } }));
    expect(reads.page).toHaveBeenCalledWith({ company: 17, branch: 22, kind: "pro", query: "Visa", page: 1 });
    expect(screen.getByText("30 matching items")).toBeTruthy();
    expect(screen.getByText("Assigned officer")).toBeTruthy();
    expect(screen.getByText("3 days overdue")).toBeTruthy();
    expect(screen.getByText("Restricted evidence")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Follow up on documents" }).getAttribute("href")).toBe(row.href);
    expect(screen.getByRole("link", { name: "Next page" }).getAttribute("href")).toBe(
      "/admin/operations/work-queues?scope=17.22&kind=pro&q=Visa&page=2",
    );
  });

  it("distinguishes an authorized zero, restricted scope and a failed read", async () => {
    reads.scopes.mockResolvedValue({ status: "ok", data: [scope] });
    reads.page.mockResolvedValueOnce({ status: "ok", data: { ...data, total: 0, rows: [] } });
    render(await WorkQueueWorkspace({ params: {} }));
    expect(screen.getByText("No open work matches these filters.")).toBeTruthy();
    cleanup();

    render(await WorkQueueWorkspace({ params: { scope: "17.55" } }));
    expect(screen.getByRole("alert").textContent).toContain("That scope or queue is restricted.");
    expect(reads.page).toHaveBeenCalledTimes(1);
    cleanup();

    reads.page.mockResolvedValueOnce({ status: "failed" });
    render(await WorkQueueWorkspace({ params: {} }));
    expect(screen.getByRole("alert").textContent).toContain("Work items could not be loaded.");
  });

  it("rejects malformed filters, oversized pages and unreviewed action targets", () => {
    expect(workQueueQuery.safeParse({ company: 17, branch: 22, kind: "all", query: "", page: 2001 }).success).toBe(false);
    expect(workQueueQuery.safeParse({ company: 17, branch: 22, kind: "unknown", query: "", page: 1 }).success).toBe(false);
    expect(workQueuePage.safeParse({ ...data, rows: [{ ...row, href: "//example.test" }] }).success).toBe(false);
    expect(workQueuePage.safeParse({ ...data, rows: [{ ...row, href: "/admin/hr/actions/pro?record=123&return=https://example.test" }] }).success).toBe(false);
  });
});
