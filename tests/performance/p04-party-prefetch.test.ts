import {beforeEach, expect, it, vi} from "vitest";
import {QueryClient} from "@tanstack/react-query";
const state=vi.hoisted(()=>({action:vi.fn(),master:vi.fn()}));
vi.mock("@/server/actions/master-data/parties",()=>Object.fromEntries(["getPartyNatures","getPartyStatuses","getPartyTypes","getPartyLicenseTypes","getPartyLicenseStatuses","getPartyTaxStatuses","getPartyContactRoles","getPartyContactDepartments","getPartyAddressTypes","getPartyDocumentTypes","getPartyDocumentStatuses","getPaymentMethods"].map(key=>[key,state.action])));
vi.mock("@/server/actions/master-data/party-notes",()=>({getPartyNoteTypes:state.action}));
vi.mock("@/server/actions/master-data/party-service-categories",()=>({getServiceCategoriesForSelect:state.action}));
vi.mock("@/lib/lookups/master-data-fetchers",()=>Object.fromEntries(["fetchCountries","fetchCurrencies","fetchPaymentTerms","fetchTaxTypes"].map(key=>[key,state.master])));
import {prefetchPartyFormData} from "@/features/master-data/parties/party-form-prefetch";
const client=()=>new QueryClient({defaultOptions:{queries:{retryDelay:0,gcTime:0}}});
beforeEach(()=>{vi.resetAllMocks();state.master.mockResolvedValue([{id:1}]);state.action.mockResolvedValue({success:true,data:[{id:2}]});});
it("seeds all 18 actual Party declarations in the existing consumer keys",async()=>{
 const qc=client(), result=await prefetchPartyFormData(qc);
 expect(result.error).toBeNull();expect(result.prefetchedKeys).toHaveLength(18);expect(qc.getQueryData(["party_natures"])).toEqual([{id:2}]);
 expect(state.master.mock.calls.every(args=>args.at(-1) instanceof AbortSignal)).toBe(true);qc.clear();
});
it("does not cache legacy action failures as successful empty choices or expose their details",async()=>{
 state.action.mockResolvedValue({success:false,error:"sensitive upstream detail"});const qc=client(), result=await prefetchPartyFormData(qc);
 expect(result.error).toBe("Party choices could not be loaded. Please retry.");expect(result.prefetchedKeys).toHaveLength(4);
 expect(qc.getQueryData(["party_natures"])).toBeUndefined();expect(qc.getQueryState(["party_natures"])?.status).toBe("error");qc.clear();
});
it("rejects malformed successful action results rather than accepting empty data",async()=>{
 state.action.mockResolvedValue({success:true});const qc=client();expect((await prefetchPartyFormData(qc)).error).not.toBeNull();expect(qc.getQueryData(["party_types"])).toBeUndefined();qc.clear();
});
it("does not populate the previous account cache after cancellation",async()=>{
 let finish!:(value:unknown)=>void;state.action.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const qc=client(), pending=prefetchPartyFormData(qc);await Promise.resolve();await qc.cancelQueries();qc.clear();
 finish({success:true,data:[{id:99}]});const result=await pending;expect(result.error).not.toBeNull();expect(qc.getQueryCache().getAll()).toHaveLength(0);
});
