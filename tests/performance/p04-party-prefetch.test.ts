import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prefetchPartyFormData } from "@/features/master-data/parties/party-form-prefetch";
import { queryKeys } from "@/lib/query/query-keys";

const ports = vi.hoisted(() => ({
  countries: vi.fn(),
  natures: vi.fn(),
  statuses: vi.fn(),
  deferred: vi.fn(),
}));

vi.mock("@/server/actions/master-data/parties", () => ({
  getPartyNatures: ports.natures,
  getPartyStatuses: ports.statuses,
  getPartyTypes: ports.deferred,
  getPartyLicenseTypes: ports.deferred,
  getPartyLicenseStatuses: ports.deferred,
  getPartyTaxStatuses: ports.deferred,
  getPartyContactRoles: ports.deferred,
  getPartyContactDepartments: ports.deferred,
  getPartyAddressTypes: ports.deferred,
  getPartyDocumentTypes: ports.deferred,
  getPartyDocumentStatuses: ports.deferred,
  getPaymentMethods: ports.deferred,
}));
vi.mock("@/server/actions/master-data/party-notes", () => ({ getPartyNoteTypes: ports.deferred }));
vi.mock("@/server/actions/master-data/party-service-categories", () => ({ getServiceCategoriesForSelect: ports.deferred }));
vi.mock("@/lib/lookups/master-data-fetchers", () => ({
  fetchCountries: ports.countries,
  fetchCurrencies: ports.deferred,
  fetchPaymentTerms: ports.deferred,
  fetchTaxTypes: ports.deferred,
}));

const countriesKey = queryKeys.countries(false, false);
const naturesKey = ["party_natures"];
const statusesKey = ["party_statuses"];
const deferredKeys = [
  queryKeys.currencies(false),
  queryKeys.paymentTerms(false),
  queryKeys.taxTypes(false),
  ["party_types"],
  ["party_license_types"],
  ["party_license_statuses"],
  ["party_tax_statuses"],
  ["party_contact_roles"],
  ["party_contact_departments"],
  ["party_address_types"],
  ["party_document_types"],
  ["party_document_statuses"],
  ["party_payment_methods"],
  ["party_note_types"],
  ["service_categories_for_select"],
];
const unavailable = "Party choices could not be loaded. Please retry.";
const clients: QueryClient[] = [];

function createClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } } });
  clients.push(client);
  return client;
}

beforeEach(() => {
  vi.resetAllMocks();
  ports.countries.mockResolvedValue([{ id: 1 }]);
  ports.natures.mockResolvedValue({ success: true, data: [{ id: 2 }] });
  ports.statuses.mockResolvedValue({ success: true, data: [{ id: 3 }] });
});

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

it("seeds only the three Basic Information keys using active country choices", async () => {
  const client = createClient();
  const result = await prefetchPartyFormData(client);

  expect(result).toEqual({
    requestedCount: 3,
    prefetchedKeys: expect.arrayContaining([countriesKey, naturesKey, statusesKey]),
    error: null,
  });
  expect(result.prefetchedKeys).toHaveLength(3);
  expect(client.getQueryCache().getAll()).toHaveLength(3);
  expect(client.getQueryData(countriesKey)).toEqual([{ id: 1 }]);
  expect(client.getQueryData(naturesKey)).toEqual([{ id: 2 }]);
  expect(client.getQueryData(statusesKey)).toEqual([{ id: 3 }]);
  expect(ports.countries).toHaveBeenCalledExactlyOnceWith(false, false, expect.any(AbortSignal));
  expect(ports.deferred).not.toHaveBeenCalled();
  for (const key of deferredKeys) expect(client.getQueryState(key)).toBeUndefined();
});

it("retains independent successes and retries a failed action without exposing its details", async () => {
  ports.natures.mockResolvedValue({ success: false, error: "sensitive upstream detail" });
  const client = createClient();
  const result = await prefetchPartyFormData(client);

  expect(result.error).toBe(unavailable);
  expect(JSON.stringify(result)).not.toContain("sensitive upstream detail");
  expect(result.prefetchedKeys).toHaveLength(2);
  expect(result.prefetchedKeys).toEqual(expect.arrayContaining([countriesKey, statusesKey]));
  expect(client.getQueryData(countriesKey)).toEqual([{ id: 1 }]);
  expect(client.getQueryData(statusesKey)).toEqual([{ id: 3 }]);
  expect(client.getQueryData(naturesKey)).toBeUndefined();
  expect(client.getQueryState(naturesKey)?.status).toBe("error");

  ports.natures.mockClear();
  ports.natures.mockResolvedValue({ success: true, data: [{ id: 2 }] });
  expect((await prefetchPartyFormData(client)).error).toBeNull();
  expect(client.getQueryData(naturesKey)).toEqual([{ id: 2 }]);
  expect(ports.natures).toHaveBeenCalledTimes(1);
  expect(ports.countries).toHaveBeenCalledTimes(1);
  expect(ports.statuses).toHaveBeenCalledTimes(1);
});

it("rejects a malformed successful action result and keeps the other choices", async () => {
  ports.statuses.mockResolvedValue({ success: true });
  const client = createClient();
  const result = await prefetchPartyFormData(client);

  expect(result.error).toBe(unavailable);
  expect(result.prefetchedKeys).toHaveLength(2);
  expect(result.prefetchedKeys).toEqual(expect.arrayContaining([countriesKey, naturesKey]));
  expect(client.getQueryData(statusesKey)).toBeUndefined();
  expect(client.getQueryState(statusesKey)?.status).toBe("error");
  expect(client.getQueryData(naturesKey)).toEqual([{ id: 2 }]);
});

it("sanitizes a thrown country failure while retaining both Party choices", async () => {
  ports.countries.mockRejectedValue(Error("PRIVATE provider connection detail"));
  const client = createClient();
  const result = await prefetchPartyFormData(client);

  expect(result.error).toBe(unavailable);
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
  expect(result.prefetchedKeys).toHaveLength(2);
  expect(result.prefetchedKeys).toEqual(expect.arrayContaining([naturesKey, statusesKey]));
  expect(client.getQueryData(countriesKey)).toBeUndefined();
  expect(client.getQueryState(countriesKey)?.status).toBe("error");
  expect(client.getQueryData(naturesKey)).toEqual([{ id: 2 }]);
  expect(client.getQueryData(statusesKey)).toEqual([{ id: 3 }]);
});

it("forwards the query signal and discards every late choice after account cancellation", async () => {
  const countries = Promise.withResolvers<unknown>();
  const natures = Promise.withResolvers<unknown>();
  const statuses = Promise.withResolvers<unknown>();
  ports.countries.mockReturnValueOnce(countries.promise);
  ports.natures.mockReturnValueOnce(natures.promise);
  ports.statuses.mockReturnValueOnce(statuses.promise);

  const previousClient = createClient();
  const pending = prefetchPartyFormData(previousClient);
  const signal = ports.countries.mock.calls[0][2] as AbortSignal;
  expect(signal).toBeInstanceOf(AbortSignal);
  expect(signal.aborted).toBe(false);
  expect(ports.natures).toHaveBeenCalledTimes(1);
  expect(ports.statuses).toHaveBeenCalledTimes(1);

  await previousClient.cancelQueries();
  expect(signal.aborted).toBe(true);
  previousClient.clear();

  const currentClient = createClient();
  expect((await prefetchPartyFormData(currentClient)).error).toBeNull();
  countries.resolve([{ id: 99 }]);
  natures.resolve({ success: true, data: [{ id: 99 }] });
  statuses.resolve({ success: true, data: [{ id: 99 }] });
  expect(await pending).toEqual({ requestedCount: 3, prefetchedKeys: [], error: unavailable });
  expect(previousClient.getQueryCache().getAll()).toHaveLength(0);
  expect(currentClient.getQueryData(countriesKey)).toEqual([{ id: 1 }]);
  expect(currentClient.getQueryData(naturesKey)).toEqual([{ id: 2 }]);
  expect(currentClient.getQueryData(statusesKey)).toEqual([{ id: 3 }]);
});
