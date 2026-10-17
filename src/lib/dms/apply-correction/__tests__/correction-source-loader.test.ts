import {beforeEach,describe,expect,it,vi} from "vitest";
import {loadCorrectionSource} from "../correction-source-loader";
// Real loader and checked RPC adapter. Display summaries never supply executable values.
const db=vi.hoisted(()=>({from:vi.fn(),select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>db}));
beforeEach(()=>{vi.resetAllMocks();db.from.mockReturnValue(db);db.select.mockReturnValue(db);db.eq.mockReturnValue(db);});
function replies(previous:string|null,exact=false){
 db.maybeSingle.mockResolvedValueOnce({data:{id:90001,apply_run_id:90002,target_table:"dms_documents",target_field:"description",target_record_id:90003,value_type:"text",current_value_summary:previous,applied_value_summary:"Applied display",status:"applied"}});
 db.rpc.mockResolvedValue({data:{originalApplyItemId:90001,originalApplyRunId:90002,documentId:90003,targetModule:"dms_document",targetTable:"dms_documents",targetField:"description",targetRecordId:90003,targetDisplayLabel:"Description",valueType:"text",originalBeforeSummary:previous,originalAppliedSummary:"Applied display",currentValue:"CURRENT FULL ".repeat(40),currentValueSummary:"CURRENT display",originalBeforeValue:exact?previous:null,originalAppliedValue:exact?"Applied FULL ".repeat(30):null,restorePreviousEnabled:exact&&previous!==null,restorePreviousWarning:exact?null:"Historical summaries cannot reconstruct the original.",reapplyAvailable:exact,reviewedSnapshot:"a".repeat(64)}});
}
describe("authoritative correction source loader",()=>{
 it.each(["2024-01-15",null,"","42.5","true","Short text","Truncated...","A".repeat(200)])("never reconstructs historical prior value %s",async previous=>{
  replies(previous);const r=await loadCorrectionSource(90001,90005);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.error.message);
  expect(r.data.restorePreviousEnabled).toBe(false);expect(r.data.originalBeforeValue).toBeNull();expect(r.data.reapplyAvailable).toBe(false);
  expect(r.data.originalBeforeSummary).toBe(previous);expect(db.from).toHaveBeenCalledOnce();
  expect(db.rpc).toHaveBeenCalledWith("f07_dms_apply",{p_action:"correction_source",p_data:{originalApplyItemId:90001}});
 });
 it("preserves exact long governed before/applied/current values",async()=>{
  const full="العربية ".repeat(200);replies(full,true);const r=await loadCorrectionSource(90001,90005);expect(r.ok).toBe(true);if(!r.ok)throw Error(r.error.message);expect(r.data.originalBeforeValue).toBe(full);expect(r.data.restorePreviousEnabled).toBe(true);expect(r.data.currentValue?.length).toBeGreaterThan(200);
 });
 it("rejects an unbound foreign receipt",async()=>{replies("old");const data=(await db.rpc()).data;db.rpc.mockResolvedValue({data:{...data,originalApplyItemId:123}});expect((await loadCorrectionSource(90001,90005)).ok).toBe(false);});
 it("rejects a source read error",async()=>{db.maybeSingle.mockResolvedValue({data:null,error:{message:"synthetic"}});expect(await loadCorrectionSource(90001,90005)).toMatchObject({ok:false,error:{error:"original_item_not_found"}});expect(db.rpc).not.toHaveBeenCalled();});
 it("rejects an unapplied source item",async()=>{db.maybeSingle.mockResolvedValue({data:{id:90001,status:"failed"}});expect(await loadCorrectionSource(90001,90005)).toMatchObject({ok:false,error:{error:"original_item_not_applied"}});expect(db.rpc).not.toHaveBeenCalled();});
});
