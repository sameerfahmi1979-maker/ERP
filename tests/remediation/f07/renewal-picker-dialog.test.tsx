// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DmsCompleteRenewalDialog } from "@/features/dms/renewals/dms-complete-renewal-dialog";

const actions = vi.hoisted(() => ({ search: vi.fn(), complete: vi.fn(), live: true }));
vi.mock("@/server/actions/dms/renewals", () => ({
  searchDmsDocumentsForRenewalReplacement: actions.search,
  completeDmsRenewalRequest: actions.complete,
}));
vi.mock("@/hooks/use-workspace-navigation-lock", () => ({ useWorkspaceNavigationLock: vi.fn() }));
vi.mock("@/components/layout/read-cache-boundary", () => {
  const owner = {
    identity: { authUserId: "fixture-actor", scopeVersion: "fixture-scope" },
    generation: 1,
    isLive: () => actions.live,
  };
  return { useReadCacheOwner: () => owner };
});

const candidate = { id: 22, document_no: "DMS-TEST-22", title: "Synthetic replacement", expiry_date: "2028-02-29", status: "active" };
const firstPage = { rows: [candidate], nextBefore: null };

function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const dialog = () => (
    <QueryClientProvider client={client}>
      <DmsCompleteRenewalDialog
        open onOpenChange={vi.fn()} renewalId={8} renewalNo="RNW-TEST" documentId={11}
      />
    </QueryClientProvider>
  );
  const view = render(dialog());
  return () => view.rerender(dialog());
}

beforeEach(() => {
  vi.resetAllMocks();
  actions.live = true;
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows a retryable error and allows selecting the existing document after recovery", async () => {
  actions.search.mockResolvedValueOnce({ success: false, error: "PRIVATE_SQL_DETAIL" })
    .mockResolvedValueOnce({ success: true, data: firstPage });
  mount();
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Could not load replacement documents.");
  expect(alert.textContent).not.toContain("PRIVATE_SQL_DETAIL");
  expect(screen.queryByRole("combobox", { name: "Replacement Document" })).toBeNull();
  const complete = screen.getByRole<HTMLButtonElement>("button", { name: "Complete Renewal" });
  expect(complete.disabled).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  const picker = await screen.findByRole("combobox", { name: "Replacement Document" });
  fireEvent.click(picker);
  fireEvent.click(await screen.findByRole("option", { name: "DMS-TEST-22 - Synthetic replacement" }));
  expect(picker.textContent).toContain("DMS-TEST-22");
  expect(screen.getByLabelText<HTMLInputElement>(/New Expiry Date/).value).toBe("2028-02-29");
  expect(screen.getByLabelText<HTMLInputElement>(/New Expiry Date/).readOnly).toBe(true);
  expect(complete.disabled).toBe(false);
  expect(actions.search.mock.calls).toEqual([[8, "", null], [8, "", null]]);
  expect(actions.complete).not.toHaveBeenCalled();
});

it("keeps a successful empty search distinct from a failed read", async () => {
  actions.search.mockResolvedValue({ success: true, data: { rows: [], nextBefore: null } });
  mount();
  fireEvent.click(await screen.findByRole("combobox", { name: "Replacement Document" }));
  expect(await screen.findByText("No matching documents found.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Complete Renewal" }).disabled).toBe(true);
});

it("pages checked results and sends search text to the server independently of the current page", async () => {
  const old = { ...candidate, id: 1, document_no: "DMS-OLD", title: "Earlier synthetic replacement" };
  actions.search.mockImplementation(async (_renewal, term, before) => ({
    success: true,
    data: term === "Old" || before != null ? { rows: [old], nextBefore: null } : { ...firstPage, nextBefore: 22 },
  }));
  mount();
  const next = await screen.findByRole("button", { name: "Next results" });
  fireEvent.click(next);
  await waitFor(() => expect(actions.search).toHaveBeenCalledWith(8, "", 22));
  fireEvent.click(await screen.findByRole("button", { name: "Previous results" }));
  await waitFor(() => expect(actions.search.mock.lastCall).toEqual([8, "", null]));
  fireEvent.change(screen.getByRole("searchbox", { name: "Search replacement documents" }), { target: { value: "Old" } });
  await waitFor(() => expect(actions.search).toHaveBeenCalledWith(8, "Old", null));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Next results" })).toBeNull());
  fireEvent.click(screen.getByRole("combobox", { name: "Replacement Document" }));
  expect(await screen.findByRole("option", { name: "DMS-OLD - Earlier synthetic replacement" })).toBeTruthy();
  expect(screen.queryByRole("option", { name: "DMS-TEST-22 - Synthetic replacement" })).toBeNull();
});

it("hides a selected record and prevents completion as soon as its read owner is retired", async () => {
  actions.search.mockResolvedValue({ success: true, data: firstPage });
  const rerender = mount();
  const picker = await screen.findByRole("combobox", { name: "Replacement Document" });
  fireEvent.click(picker);
  fireEvent.click(await screen.findByRole("option", { name: "DMS-TEST-22 - Synthetic replacement" }));
  actions.live = false;
  rerender();
  expect(picker.textContent).not.toContain("DMS-TEST-22");
  expect(screen.getByLabelText<HTMLInputElement>(/New Expiry Date/).value).toBe("");
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Complete Renewal" }).disabled).toBe(true);
});

it("refreshes open employee document and compliance reads and the DMS lists after a confirmed renewal", async () => {
  actions.search.mockResolvedValue({ success: true, data: firstPage });
  actions.complete.mockResolvedValue({ success: true });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const keys = [
    ["dms", "entity-documents-read", "test-owner", "employee", 7, "list", "{}"],
    ["dms", "entity-documents-read", "test-owner", "employee", 7, "summary", "{}"],
    ["read", "dms-documents", "test-owner"],
    ["read", "dms-archive", "test-owner"],
  ];
  const subscriptions = keys.map(queryKey => {
    client.setQueryData(queryKey, "before renewal");
    return new QueryObserver(client, { queryKey, queryFn: async () => "after renewal" }).subscribe(() => {});
  });

  try {
    mount(client);
    fireEvent.click(await screen.findByRole("combobox", { name: "Replacement Document" }));
    fireEvent.click(await screen.findByRole("option", { name: "DMS-TEST-22 - Synthetic replacement" }));
    expect(keys.map(key => client.getQueryData(key))).toEqual(keys.map(() => "before renewal"));
    fireEvent.click(screen.getByRole("button", { name: "Complete Renewal" }));
    await waitFor(() => expect(keys.map(key => client.getQueryData(key))).toEqual(keys.map(() => "after renewal")));
    expect(actions.complete).toHaveBeenCalledTimes(1);
  } finally {
    subscriptions.forEach(unsubscribe => unsubscribe());
    client.clear();
  }
});
