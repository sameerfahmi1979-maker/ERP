// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DmsCompleteRenewalDialog } from "@/features/dms/renewals/dms-complete-renewal-dialog";

const actions = vi.hoisted(() => ({ search: vi.fn(), complete: vi.fn() }));
vi.mock("@/server/actions/dms/renewals", () => ({
  searchDmsDocumentsForRenewalReplacement: actions.search,
  completeDmsRenewalRequest: actions.complete,
}));
vi.mock("@/server/actions/dms/document-links", () => ({
  getDmsDocumentLinks: async () => ({ success: true, data: [] }),
}));
vi.mock("@/hooks/use-workspace-navigation-lock", () => ({ useWorkspaceNavigationLock: vi.fn() }));

const candidate = { id: 22, document_no: "DMS-TEST-22", title: "Synthetic replacement", expiry_date: "2028-02-29", status: "active" };

function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={client}>
      <DmsCompleteRenewalDialog
        open onOpenChange={vi.fn()} renewalId={8} renewalNo="RNW-TEST" documentId={11} documentTypeId={9}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
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
    .mockResolvedValueOnce({ success: true, data: [candidate] });
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
  const search = await screen.findByPlaceholderText("Search by document no. or title...");
  fireEvent.change(search, { target: { value: "DMS-TEST-22" } });
  fireEvent.click(await screen.findByRole("option", { name: "DMS-TEST-22 - Synthetic replacement" }));
  expect(picker.textContent).toContain("DMS-TEST-22");
  expect(screen.getByLabelText<HTMLInputElement>(/New Expiry Date/).value).toBe("2028-02-29");
  expect(complete.disabled).toBe(false);
  expect(actions.search.mock.calls).toEqual([[9, 11], [9, 11]]);
  expect(actions.complete).not.toHaveBeenCalled();
});

it("keeps a successful empty search distinct from a failed read", async () => {
  actions.search.mockResolvedValue({ success: true, data: [] });
  mount();
  fireEvent.click(await screen.findByRole("combobox", { name: "Replacement Document" }));
  expect(await screen.findByText("No matching documents found.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Complete Renewal" }).disabled).toBe(true);
});

it("refreshes open employee document and compliance reads and the DMS lists after a confirmed renewal", async () => {
  actions.search.mockResolvedValue({ success: true, data: [candidate] });
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
