import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({active:true,session:true,failed:false,roles:[] as Array<Record<string,unknown>>,calls:[] as string[]}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:"private-id",email:"private@example.invalid"}},error:null})},rpc:async()=>({data:state.session,error:null})})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:(table:string)=>{
  state.calls.push(table);
  const builder={select:()=>builder,eq:()=>builder,in:()=>builder,maybeSingle:async()=>({data:{id:10,auth_user_id:"private-id",status:state.active?"active":"suspended",must_change_password:false},error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(resolve({data:table==="user_roles"?state.roles:[],error:state.failed?{message:"PRIVATE"}:null}))};
  return builder;
}})}));
import { getAuthContext } from "@/lib/rbac/check";
beforeEach(()=>{state.active=true;state.session=true;state.failed=false;state.roles=[];state.calls=[];vi.stubEnv("ALGT_PERF_ENABLED","true");vi.stubEnv("ALGT_PERF_LOG_RETENTION_DAYS","1");vi.stubEnv("ALGT_PERF_SAMPLE_PERCENT","100");vi.spyOn(console,"info").mockImplementation(()=>{});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it("returns the same context and query sequence with instrumentation on/off",async()=>{
  const enabled=await getAuthContext();const enabledCalls=[...state.calls];state.calls=[];vi.stubEnv("ALGT_PERF_ENABLED","false");
  expect(await getAuthContext()).toEqual(enabled);expect(state.calls).toEqual(enabledCalls);expect(enabled.isAccountActive).toBe(true);
  const log=JSON.stringify(vi.mocked(console.info).mock.calls);expect(log).toContain("auth.permissions");expect(log).not.toContain("private-id");expect(log).not.toContain("private@example.invalid");
});
it("retains session-revocation denial before the admin bootstrap",async()=>{
  state.session=false;expect((await getAuthContext()).profile).toBeNull();expect(state.calls).toEqual([]);
});
it("does not grant permissions to a suspended account",async()=>{
  state.active=false;const ctx=await getAuthContext();expect(ctx.isAccountActive).toBe(false);expect(ctx.permissionCodes).toEqual([]);expect(state.calls).toEqual(["user_profiles"]);
});
it("preserves permission-resolution errors without logging their details",async()=>{
  state.failed=true;await expect(getAuthContext()).rejects.toThrow("Unable to resolve role assignments");expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("PRIVATE");
});
