import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { prefetchPartyFormData } from "@/features/master-data/parties/party-form-prefetch";

const ports = vi.hoisted(() => ({
  overview: vi.fn(async () => ({ success: true, data: [] })),
  background: vi.fn(async () => ({ success: true, data: [] })),
  countries: vi.fn(async () => []),
}));
vi.mock("@/lib/lookups/master-data-fetchers", () => ({
  fetchCountries: ports.countries,
  fetchCurrencies: ports.background,
  fetchPaymentTerms: ports.background,
  fetchTaxTypes: ports.background,
}));
vi.mock("@/server/actions/master-data/parties", () => ({
  getPartyNatures: ports.overview,
  getPartyStatuses: ports.overview,
  getPartyTypes: ports.background,
  getPartyLicenseTypes: ports.background,
  getPartyLicenseStatuses: ports.background,
  getPartyTaxStatuses: ports.background,
  getPartyContactRoles: ports.background,
  getPartyContactDepartments: ports.background,
  getPartyAddressTypes: ports.background,
  getPartyDocumentTypes: ports.background,
  getPartyDocumentStatuses: ports.background,
  getPaymentMethods: ports.background,
}));
vi.mock("@/server/actions/master-data/party-notes", () => ({
  getPartyNoteTypes: ports.background,
}));
vi.mock("@/server/actions/master-data/party-service-categories", () => ({
  getServiceCategoriesForSelect: ports.background,
}));

it("prefetches only the initial Party workspace choices and leaves inactive panels unfetched", async () => {
  const client = new QueryClient();
  try {
    const result = await prefetchPartyFormData(client);
    expect(result).toMatchObject({ requestedCount: 3, error: null });
    expect(ports.countries).toHaveBeenCalledOnce();
    expect(ports.overview).toHaveBeenCalledTimes(2);
    expect(ports.background).not.toHaveBeenCalled();
  } finally {
    client.clear();
  }
});
