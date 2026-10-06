// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { collectCompletePages } from "@/lib/reads/complete-pages";
import { fetchConfigurationChoices, type ConfigurationResource } from "@/lib/lookups/configuration-fetchers";
import { useBranchesQuery, useOwnerCompaniesQuery, useCostCentersQuery, useProfitCentersQuery } from "@/hooks/lookups/use-org-queries";
import { useCountriesQuery, useEmiratesQuery, useCitiesQuery, useAreasQuery, usePortsQuery } from "@/hooks/lookups/use-geography-queries";
import { prefetchMasterDataQueries } from "@/lib/query/prefetch-lookups";
import { clearPrivateCaches, registerPrivateCache } from "@/lib/query/private-cache";
import { CountrySelect } from "@/components/erp/geography/country-select";
import { EmirateSelect } from "@/components/erp/geography/emirate-select";
import { CitySelect } from "@/components/erp/geography/city-select";
import { AreaZoneSelect } from "@/components/erp/geography/area-zone-select";
import { PortSelect } from "@/components/erp/geography/port-select";
import { OwnerCompanySelect } from "@/components/erp/organizations/owner-company-select";
import { BranchSelect } from "@/components/erp/organizations/branch-select";
import { CostCenterSelect } from "@/components/erp/finance-basics/cost-center-select";
import { ProfitCenterSelect } from "@/components/erp/finance-basics/profit-center-select";
import { CurrencySelect } from "@/components/erp/finance-basics/currency-select";
import { BankSelect } from "@/components/erp/finance-basics/bank-select";
import { PaymentTermSelect } from "@/components/erp/finance-basics/payment-term-select";
import { TaxTypeSelect } from "@/components/erp/finance-basics/tax-type-select";
import { UomCategorySelect } from "@/components/erp/uom/uom-category-select";
import { UnitOfMeasureSelect } from "@/components/erp/uom/unit-of-measure-select";

type Call = { table: string; columns?: string; filters: [string, unknown][]; order: string[]; from?: number; to?: number; signal?: AbortSignal };
const state = vi.hoisted(() => ({ calls: [] as Call[], response: undefined as undefined | ((call: Call) => Promise<unknown>) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ from: (table: string) => {
  const call: Call = { table, filters: [], order: [] };
  const builder = {
    select: (columns: string, options: {count: string}) => { expect(options.count).toBe("exact"); call.columns = columns; return builder; },
    retry: (enabled: boolean) => { expect(enabled).toBe(false); return builder; },
    order: (column: string) => { call.order.push(column); return builder; },
    eq: (column: string, value: unknown) => { call.filters.push([column, value]); return builder; },
    range: (from: number, to: number) => { call.from = from; call.to = to; return builder; },
    abortSignal: (signal: AbortSignal) => { call.signal = signal; return builder; },
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
      state.calls.push(call);
      return (state.response?.(call) ?? Promise.resolve({ data: [], count: 0, error: null, status: 200 })).then(resolve, reject);
    },
  }; return builder;
} }) }));
const client = () => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retryDelay: 1, gcTime: 60_000 } } });
beforeEach(() => { state.calls.length = 0; state.response = undefined; });
afterEach(() => { cleanup(); clearPrivateCaches(); });

it("rejects missing counts, changing counts, short pages, duplicates and an oversized choice set", async () => {
  await expect(collectCompletePages(async () => ({ data: [], count: null, error: null }))).rejects.toThrow();
  await expect(collectCompletePages(async () => ({ data: [{id: 1}], count: 2, error: null }))).rejects.toThrow("partial");
  await expect(collectCompletePages(async from => ({ data: [{id: from + 1}], count: from ? 3 : 2, error: null }), { batchSize: 1 })).rejects.toThrow("changed");
  await expect(collectCompletePages(async () => ({ data: [{id: 1}], count: 2, error: null }), { batchSize: 1, identity: row => row.id })).rejects.toThrow("changed");
  await expect(collectCompletePages(async () => ({ data: [], count: 10_001, error: null }), { maxRows: 10_000 })).rejects.toThrow("Too many choices");
});
it("loads beyond the backend cap with bounded ranges, stable ID ordering and lean projections for all fifteen contracts", async () => {
  state.response = async call => ({ data: Array.from({ length: Math.min(500, 1_107 - call.from!) }, (_, offset) => ({ id: call.from! + offset + 1 })), count: 1_107, error: null, status: 200 });
  const resources: ConfigurationResource[] = ["ownerCompanies", "branches", "costCenters", "profitCenters", "countries", "emirates", "cities", "areas", "ports", "currencies", "banks", "paymentTerms", "taxTypes", "uomCategories", "unitsOfMeasure"];
  for (const resource of resources) {
    const data = await fetchConfigurationChoices(resource);
    expect(data).toHaveLength(1_107); expect(data.at(-1)?.id).toBe(1_107);
  }
  expect(state.calls).toHaveLength(45);
  for (const call of state.calls) { expect(call.to! - call.from!).toBe(499); expect(call.order.at(-1)).toBe("id"); expect(call.columns).not.toContain("*"); }
});
it("preserves parent/type predicates for an inactive selected value, and passes cancellation to every read", async () => {
  const controller = new AbortController();
  await fetchConfigurationChoices("branches", {parentId: 2, selectedId: 5}, controller.signal);
  expect(state.calls[0].filters).toEqual([["owner_company_id", 2], ["id", 5]]);
  await fetchConfigurationChoices("ports", {parentId: 4, filter: "SEA", selectedId: 5}, controller.signal);
  expect(state.calls[1].filters).toEqual([["emirate_id", 4], ["port_type_code", "SEA"], ["id", 5]]);
  expect(state.calls.every(call => call.signal === controller.signal)).toBe(true);
  controller.abort(); await expect(fetchConfigurationChoices("countries", {}, controller.signal)).rejects.toMatchObject({name: "AbortError"});
  expect(state.calls).toHaveLength(2);
});
function AllFields() {
  const reads = [useOwnerCompaniesQuery(), useBranchesQuery({ownerCompanyId: 1}), useCostCentersQuery({ownerCompanyId: 1}), useProfitCentersQuery({ownerCompanyId: 1}), useCountriesQuery(), useEmiratesQuery({countryId: 1}), useCitiesQuery({emirateId: 1}), useAreasQuery({cityId: 1}), usePortsQuery({emirateId: 1})];
  return <div data-testid="all">{reads.every(read => !read.isLoading) ? "ready" : "loading"}</div>;
}
it("starts independent organization/geography reads together and coalesces matching mounted consumers", async () => {
  const pending: (() => void)[] = [];
  state.response = () => new Promise(resolve => pending.push(() => resolve({data: [], count: 0, error: null, status: 200})));
  const view = render(<QueryClientProvider client={client()}><AllFields/><AllFields/></QueryClientProvider>);
  await waitFor(() => expect(pending).toHaveLength(9)); expect(state.calls).toHaveLength(9);
  await act(async () => pending.forEach(finish => finish()));
  await waitFor(() => expect(view.getAllByTestId("all").every(node => node.textContent === "ready")).toBe(true));
});
function BranchField({parent = 1, selected = 5}: {parent?: number; selected?: number}) {
  const read = useBranchesQuery({ownerCompanyId: parent, selectedId: selected});
  return <div data-testid="branch">{JSON.stringify({ids: read.data.map(row => row.id), error: read.error})}</div>;
}
it("loads a missing permitted selected branch and never reuses it under a changed company", async () => {
  state.response = async call => {
    const parent = call.filters.find(([key]) => key === "owner_company_id")?.[1];
    const selected = call.filters.some(([key]) => key === "id");
    const data = parent === 2 ? [] : [{id: selected ? 5 : 1, branch_name_en: selected ? "Legacy" : "Active"}];
    return {data, count: data.length, error: null, status: 200};
  };
  const qc = client(), view = render(<QueryClientProvider client={qc}><BranchField/></QueryClientProvider>);
  await waitFor(() => expect(view.getByTestId("branch").textContent).toContain('"ids":[1,5]'));
  expect(state.calls).toHaveLength(2);
  view.rerender(<QueryClientProvider client={qc}><BranchField parent={2}/></QueryClientProvider>);
  expect(view.getByTestId("branch").textContent).toContain('"ids":[]');
  await waitFor(() => expect(state.calls).toHaveLength(4));
  expect(state.calls[3].filters).toEqual([["owner_company_id", 2], ["id", 5]]);
  expect(view.getByTestId("branch").textContent).toContain('"ids":[]');
});
it("never automatically retries denied choices or exposes raw provider errors", async () => {
  state.response = async () => ({data: null, count: null, error: {message: "private SQL details"}, status: 403});
  const view = render(<QueryClientProvider client={client()}><BranchField/></QueryClientProvider>);
  await waitFor(() => expect(view.getByTestId("branch").textContent).toContain("could not be completely loaded"));
  expect(state.calls).toHaveLength(1); expect(view.getByTestId("branch").textContent).not.toContain("private SQL details");
});
it("clearing an identity cache cancels an in-flight read and prevents its late result repopulating it", async () => {
  let finish!: (value: unknown) => void;
  state.response = () => new Promise(resolve => {finish = resolve;});
  const qc = client(), unregister = registerPrivateCache(qc);
  const view=render(<QueryClientProvider client={qc}><BranchField/></QueryClientProvider>);
  await waitFor(() => expect(state.calls).toHaveLength(1));
  await act(async () => clearPrivateCaches());
  expect(state.calls[0].signal?.aborted).toBe(true);
  await act(async () => finish({data: [{id: 1, branch_name_en: "Old identity"}], count: 1, error: null, status: 200}));
  // An observer still mounted in this deliberately isolated test may recreate
  // empty query entries. It must never display or cache the old principal's rows.
  expect(qc.getQueryCache().getAll().every(query=>query.state.data===undefined)).toBe(true);
  expect(view.getByTestId("branch").textContent).not.toContain("Old identity");
  view.unmount();unregister();expect(qc.getQueryCache().getAll()).toHaveLength(0);
});
it("records partial master prefetch failure truthfully while independent successful reads remain usable", async () => {
  const qc = client(), good = vi.fn(async () => [1]), bad = vi.fn(async () => {throw Error("Choices failed");});
  const receipt = await prefetchMasterDataQueries(qc, [{queryKey: ["master", "good"], queryFn: good}, {queryKey: ["master", "bad"], queryFn: bad}]);
  expect(receipt.error).toBe("Choices failed"); expect(receipt.prefetchedKeys).toEqual([["master", "good"]]);
  expect(qc.getQueryData(["master", "good"])).toEqual([1]); expect(qc.getQueryData(["master", "bad"])).toBeUndefined();
  expect(bad).toHaveBeenCalledTimes(2);
});

const controls = [
  ["country", CountrySelect, {}], ["region", EmirateSelect, {countryId: 1}], ["city", CitySelect, {emirateId: 1}],
  ["area", AreaZoneSelect, {cityId: 1}], ["port", PortSelect, {emirateId: 1}], ["company", OwnerCompanySelect, {}],
  ["branch", BranchSelect, {ownerCompanyId: 1}], ["cost centre", CostCenterSelect, {ownerCompanyId: 1}], ["profit centre", ProfitCenterSelect, {ownerCompanyId: 1}],
  ["currency", CurrencySelect, {}], ["bank", BankSelect, {countryId: 1}], ["payment term", PaymentTermSelect, {}],
  ["tax type", TaxTypeSelect, {}], ["unit category", UomCategorySelect, {}],
] as const;
const active = {id: 1, name_en: "Synthetic active", name_ar: "اختيار تجريبي", legal_name_en: "Synthetic active", legal_name_ar: "اختيار تجريبي", branch_name_en: "Synthetic active", branch_name_ar: "اختيار تجريبي", cost_center_name_en: "Synthetic active", cost_center_name_ar: "اختيار تجريبي", profit_center_name_en: "Synthetic active", profit_center_name_ar: "اختيار تجريبي", currency_name_en: "Synthetic active", currency_name_ar: "اختيار تجريبي", bank_name_en: "Synthetic active", bank_name_ar: "اختيار تجريبي", term_name_en: "Synthetic active", term_name_ar: "اختيار تجريبي", tax_name_en: "Synthetic active", tax_name_ar: "اختيار تجريبي", category_name_en: "Synthetic active", category_name_ar: "اختيار تجريبي", unit_name_en: "Synthetic active", unit_name_ar: "اختيار تجريبي", symbol: ""};
it.each(controls)("%s actual selector retains its value and Arabic label without an extra selected read", async (_name, Control, props) => {
 state.response = async () => ({data: [active], count: 1, error: null, status: 200});
 const changed = vi.fn(), view = render(<QueryClientProvider client={client()}><Control {...props} value={1} onValueChange={changed} language="ar" name="tracked-selection"/></QueryClientProvider>);
 await waitFor(() => expect(view.getByRole("combobox").textContent).toContain("اختيار تجريبي"));
 expect(state.calls).toHaveLength(1); expect(changed).not.toHaveBeenCalled();
 expect((view.container.querySelector('input[name="tracked-selection"]') as HTMLInputElement).value).toBe("1");
});
it.each(controls)("%s actual selector distinguishes failure from empty, retains the draft and retries", async (_name, Control, props) => {
 state.response = async () => ({data: null, count: null, error: {message: "private details"}, status: 503});
 const changed = vi.fn(), view = render(<QueryClientProvider client={client()}><Control {...props} value={1} onValueChange={changed} name="tracked-selection"/></QueryClientProvider>);
 await waitFor(() => expect(view.getByRole("alert").textContent).toContain("not an empty result"));
 expect(state.calls).toHaveLength(2); expect(view.getByRole("combobox").closest("[inert]")).toBeTruthy();
 expect((view.container.querySelector('input[name="tracked-selection"]') as HTMLInputElement).value).toBe("1");
 state.response = async () => ({data: [active], count: 1, error: null, status: 200});
 fireEvent.click(view.getByRole("button", {name: "Retry loading"}));
 await waitFor(() => expect(view.queryByRole("alert")).toBeNull());
 expect(view.getByRole("combobox").textContent).toContain("Synthetic active"); expect(changed).not.toHaveBeenCalled();
});
it("unit selector preserves its existing retry UI and loads a scoped inactive selection", async () => {
  state.response = async call => { const selected=call.filters.some(([key])=>key==="id"); return {data:selected?[{...active,id:8}]:[],count:selected?1:0,error:null,status:200}; };
  const change=vi.fn(), view=render(<QueryClientProvider client={client()}><UnitOfMeasureSelect categoryId={2} value={8} onValueChange={change} name="unit"/></QueryClientProvider>);
  await waitFor(()=>expect(view.getByRole("combobox").textContent).toContain("Synthetic active"));
  expect(state.calls[1].filters).toEqual([["uom_category_id",2],["id",8]]);expect(change).not.toHaveBeenCalled();
  expect((view.container.querySelector('input[name="unit"]') as HTMLInputElement).value).toBe("8");
});
