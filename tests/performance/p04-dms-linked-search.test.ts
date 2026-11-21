import {beforeEach,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
const s=vi.hoisted(()=>({fail:false,ops:[] as [string,unknown[]][]}));
vi.mock("@/lib/logger",()=>({logger:{warn:vi.fn()}}));
import {searchDmsLinkEntityOptionsForType} from "@/lib/dms/search-link-entity-options";
const client={from:(table:string)=>{s.ops.push(["from",[table]]);const q=new Proxy({}, {get:(_,key)=>key==="then"?(resolve:(x:unknown)=>unknown)=>Promise.resolve({data:[],error:s.fail?{message:"private"}:null}).then(resolve):(...args:unknown[])=>{s.ops.push([String(key),args]);return q;}});return q;}} as unknown as SupabaseClient;
beforeEach(()=>{s.fail=false;s.ops=[];});
const types=["employee","employee_compliance","employee_contract","employee_leave_request","party","party_license","party_tax_registration","company","branch","bank","site","employee_dependent","employee_identity_document","employee_medical_insurance","employee_access_card","employee_medical_record"];
it.each(types)("%s uses ordinary scoped stable bounded choices and propagates errors",async type=>{expect(await searchDmsLinkEntityOptionsForType(client,type,"%_",25)).toEqual([]);expect(s.ops).toContainEqual(["limit",[25]]);expect(s.ops).toContainEqual(["order",["id",{ascending:true}]]);expect(JSON.stringify(s.ops)).toContain("\\\\%");s.fail=true;await expect(searchDmsLinkEntityOptionsForType(client,type)).rejects.toThrow("unavailable");});
it.each([0,51,-1,1.5,NaN])("rejects invalid limit %s",async limit=>{await expect(searchDmsLinkEntityOptionsForType(client,"employee","",limit)).rejects.toThrow();expect(s.ops).toHaveLength(0);});
it("does not silently truncate search strings",async()=>{await expect(searchDmsLinkEntityOptionsForType(client,"employee","a".repeat(201))).rejects.toThrow();expect(s.ops).toHaveLength(0);});
it.each(["vehicle", "equipment"])("%s directs the user to Fleet Asset without a database read", async (type) => {
  const rpc = vi.fn();
  const from = vi.fn();
  const fleetClient = { rpc, from } as unknown as SupabaseClient;

  await expect(searchDmsLinkEntityOptionsForType(fleetClient, type)).rejects.toThrow("Select Fleet Asset");
  expect(rpc).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
});

it("uses the scoped Fleet Asset picker and preserves a masked plate", async () => {
  const rpc = vi.fn().mockResolvedValue({
    data: [{ id: 41, name: "Synthetic tractor", asset_no: "QA-FLEET-41", plate: null }],
    error: null,
  });
  const from = vi.fn();
  const fleetClient = { rpc, from } as unknown as SupabaseClient;

  await expect(searchDmsLinkEntityOptionsForType(fleetClient, "fleet_asset", " tractor ", 17)).resolves.toEqual([
    { id: 41, label: "Synthetic tractor", code: "QA-FLEET-41", description: null },
  ]);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("t05_search_fleet_assets", {
    p_query: "tractor",
    p_limit: 17,
    p_link_picker: true,
  });
  expect(from).not.toHaveBeenCalled();
});

it("distinguishes a failed Fleet Asset lookup from verified empty results", async () => {
  const rpc = vi.fn()
    .mockResolvedValueOnce({ data: [], error: null })
    .mockResolvedValueOnce({ data: null, error: { message: "private diagnostic" } });
  const fleetClient = { rpc } as unknown as SupabaseClient;

  await expect(searchDmsLinkEntityOptionsForType(fleetClient, "fleet_asset")).resolves.toEqual([]);
  await expect(searchDmsLinkEntityOptionsForType(fleetClient, "fleet_asset")).rejects.toThrow(
    /^Linked entity search is unavailable$/,
  );
});
