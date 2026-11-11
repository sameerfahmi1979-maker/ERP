// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComplianceDmsRenewal } from "@/lib/hr/compliance/renewal-review";
import type { AuthContext } from "@/lib/rbac/check";
import { ComplianceRenewalEvidence, ComplianceRenewals, OriginalEvidenceAction } from "@/features/hr/employees/compliance/compliance-renewals";

const state = vi.hoisted(() => ({ read: vi.fn(), enabled: true }));
vi.mock("@/server/actions/hr/compliance-renewals", () => ({ readComplianceDmsRenewals: state.read }));
vi.mock("@/hooks/use-read-lifetime", () => ({ useReadLifetime: () => ({ enabled: state.enabled, active: state.enabled }) }));
vi.mock("@/lib/reads/hr-read-identity", () => ({ hrReadIdentity: () => "synthetic-user" }));

const renewal: ComplianceDmsRenewal = {
  kind: "access-card", category: "access-card", sourceId: 10, originalNo: "QA-OLD", replacementId: 40,
  replacementNo: "QA-NEW", replacementTitle: "Synthetic replacement", replacementExpiry: "2027-02-25",
};
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function show() {
  render(<QueryClientProvider client={client}>
    <ComplianceRenewals employeeId={1} authContext={{} as AuthContext}>
      <section aria-label="Matching pass">
        <ComplianceRenewalEvidence kind="access-card" sourceId={10}>24 Sep 2026 · Expired</ComplianceRenewalEvidence>
        <OriginalEvidenceAction kind="access-card" sourceId={10}><button>Verify old evidence</button></OriginalEvidenceAction>
      </section>
      <section aria-label="Other pass">
        <ComplianceRenewalEvidence kind="access-card" sourceId={11}>Unrelated expiry</ComplianceRenewalEvidence>
      </section>
      <section aria-label="Dependent">
        <ComplianceRenewalEvidence kind="dependent" sourceId={12} category="dependent-passport">Old passport expiry</ComplianceRenewalEvidence>
        <ComplianceRenewalEvidence kind="dependent" sourceId={12} category="dependent-visa">Current visa expiry</ComplianceRenewalEvidence>
      </section>
    </ComplianceRenewals>
  </QueryClientProvider>);
  return within(screen.getByRole("region", { name: "Matching pass" }));
}

afterEach(() => { cleanup(); client.clear(); vi.resetAllMocks(); state.enabled = true; });

it("replaces the expired card details on load without asking HR to review or confirm", async () => {
  state.read.mockResolvedValue({ data: [renewal] });
  const row = show();
  const file = await row.findByRole("link", { name: /QA-NEW/ });
  expect(file.getAttribute("href")).toBe("/dms/documents/record/40?mode=view");
  expect(row.getByText(/DMS expiry 25 Feb 2027/)).toBeTruthy();
  expect(row.queryByText(/Expired/)).toBeNull();
  expect(row.queryByRole("button")).toBeNull();
  expect(screen.getByText("Unrelated expiry")).toBeTruthy();
  expect(state.read).toHaveBeenCalledExactlyOnceWith(1);
});

it("changes only the matching dependent credential", async () => {
  state.read.mockResolvedValue({ data: [{ ...renewal, kind: "dependent", category: "dependent-passport", sourceId: 12 }] });
  show();
  const row = within(screen.getByRole("region", { name: "Dependent" }));
  expect(await row.findByText(/Passport · Renewed in DMS/)).toBeTruthy();
  expect(row.queryByText("Old passport expiry")).toBeNull();
  expect(row.getByText("Current visa expiry")).toBeTruthy();
});

it("preserves original facts when DMS is unavailable and reports the read failure", async () => {
  state.read.mockResolvedValue({ error: "Synthetic read failure" });
  const row = show();
  expect(await screen.findByText(/Could not load DMS renewals/)).toBeTruthy();
  expect(row.getByText(/Expired/)).toBeTruthy();
  expect(row.queryByRole("link")).toBeNull();
});

it("keeps the inactive workspace from reading renewal details", () => {
  state.enabled = false;
  const row = show();
  expect(row.getByText(/Expired/)).toBeTruthy();
  expect(state.read).not.toHaveBeenCalled();
});
