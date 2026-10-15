import {beforeEach,expect,it,vi} from "vitest";
import {syntheticAuthContext} from "./fixtures/auth-context";
const s=vi.hoisted(()=>({calls:[] as string[],fail:false}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:(table:string)=>{s.calls.push(table);const q:Record<string,unknown>={};for(const m of ["select","in","is","order","range"])q[m]=()=>q;q.then=(resolve:(r:unknown)=>unknown)=>Promise.resolve({data:[],count:s.fail?null:0,error:s.fail?{message:"PRIVATE"}:null}).then(resolve);return q;}})}));
import {readHomeDashboard} from "@/server/reads/home-dashboard";
beforeEach(()=>{s.calls=[];s.fail=false;});
it("preserves genuine zero counts and has no sample fallback or nonexistent legacy tables",async()=>{
  const r=await readHomeDashboard(syntheticAuthContext(["dashboard.view","hr.employees.view","parties.view","dms.documents.view","audit.view"]));
  expect(r.employees).toEqual({status:"ready",value:0});expect(r.documentsPending).toEqual({status:"ready",value:0});expect(r.parties).toEqual({status:"ready",value:0});expect(r.activity).toEqual({status:"ready",rows:[]});
  expect(s.calls.sort()).toEqual(["audit_logs","dms_ai_job_queue","employees","parties"].sort());
});
it("restricted capabilities perform no private business reads",async()=>{
  expect(await readHomeDashboard(syntheticAuthContext(["dashboard.view"]))).toMatchObject({employees:{status:"restricted"},documentsPending:{status:"restricted"},parties:{status:"restricted"},activity:{status:"restricted"}});expect(s.calls).toHaveLength(0);
});
it("a failed source is unavailable rather than zero or private diagnostics",async()=>{
  s.fail=true;const r=await readHomeDashboard(syntheticAuthContext(["dashboard.view","hr.employees.view"]));expect(r.employees).toEqual({status:"failed"});expect(JSON.stringify(r)).not.toContain("PRIVATE");
});
it("rejects an unadmitted dashboard before any query",async()=>{await expect(readHomeDashboard(syntheticAuthContext([]))).rejects.toThrow("Permission denied");expect(s.calls).toHaveLength(0);});
