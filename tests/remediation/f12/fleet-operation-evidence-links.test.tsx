import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { readOperation } = vi.hoisted(() => ({ readOperation: vi.fn() }));
vi.mock("@/server/actions/fleet/operations", () => ({
  getFleetOperation: readOperation,
  getOperationsChoices: vi.fn(),
}));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: async () => ({ permissionCodes: [] }) }));
vi.mock("@/features/fleet/operation-forms", () => ({
  FleetOperationControls: () => null,
  FinishTripOrder: () => null,
}));
import FleetOperationPage from "@/app/(protected)/modules/fleet/operations/[id]/page";

const operation = {
  id: 10, number: "SYN-010", subject: "Synthetic rental", kind: "rental", status: "review",
  reference: "SYN", authorization: null, customer: null, supplier: null, rental_mode: null,
  can_manage: false, can_commercial: true, assignments: [], rental_events: [], history: [],
  usage: [{ id: 21, state: "signed", from: "2026-11-20T07:00:00+04:00",
    until: "2026-11-20T08:00:00+04:00", evidence_current: true, document: 31 }],
  terms: [{ id: 22, approved: true, currency: "AED", rate: 0, ceiling: 0,
    document: 32, version: 42, file: 52 }],
  statements: [{ id: 23, approved: true, quantity: 1, amount: 0,
    usage: [{ id: 21, document: 33, version: 43, file: 53, reference: "Synthetic original" }] }],
};

beforeEach(() => vi.resetAllMocks());

describe("Fleet retained evidence links", () => {
  it("links to the implemented DMS record or to the exact retained file", async () => {
    readOperation.mockResolvedValue(operation);
    const html = renderToStaticMarkup(await FleetOperationPage({ params: Promise.resolve({ id: "10" }) }));
    expect(html).toContain('href="/dms/documents/record/31"');
    expect(html).toContain('href="/api/dms/file?fileId=52"');
    expect(html).toContain('href="/api/dms/file?fileId=53"');
  });

  it("keeps absent and commercially masked evidence out of the browser", async () => {
    readOperation.mockResolvedValue({
      ...operation, can_commercial: false, usage: [{ ...operation.usage[0], document: null }],
    });
    const html = renderToStaticMarkup(await FleetOperationPage({ params: Promise.resolve({ id: "10" }) }));
    expect(html).not.toContain("/dms/documents/");
    expect(html).not.toContain("/api/dms/file");
  });
});

