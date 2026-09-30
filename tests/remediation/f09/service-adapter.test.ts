import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prepareQueuedDelivery, processQueuedEmail, processQueuedBatch } from "@/lib/email/queue/service";
import { DeliveryPolicyError } from "@/lib/email/queue/policy";
import type { DeliveryClaim } from "@/lib/email/queue/source";
const m=vi.hoisted(()=>({db:vi.fn(),source:vi.fn(),secret:vi.fn(),token:vi.fn(),transport:vi.fn(),send:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:m.db}));
vi.mock("@/lib/email/queue/source",()=>({prepareQueueMessage:m.source}));
vi.mock("@/lib/email/vault",()=>({resolveEmailProviderSecret:m.secret}));
vi.mock("@/lib/email/queue/graph-token",()=>({acquireGraphToken:m.token}));
vi.mock("@/lib/email/queue/graph-transport",()=>({prepareGraphDelivery:m.transport}));
let provider:Record<string,unknown>,rows:Record<string,unknown>[],rpc:ReturnType<typeof vi.fn>;
const q={id:1,lease_owner:"owner",lease_token:"fence",attempt_count:1,max_attempts:3,provider_config_id:9} as DeliveryClaim;
afterEach(()=>{vi.useRealTimers();});
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv("F09_EMAIL_WORKER_ENABLED","true");
 provider={id:9,provider_type:"microsoft_graph",auth_mode:"client_credentials",send_mode:"graph_send_mail",
 tenant_id:"synthetic",client_id:"synthetic",sender_email:"sender@example.invalid",secret_ref:"synthetic"};
 rows=[provider];
 const query:Record<string,unknown>={};for(const key of ["select","eq","is"])query[key]=vi.fn(()=>query);
 query.limit=async()=>({data:rows,error:null});
 rpc=vi.fn(async(name:string)=>({data:name==="f09_claim_email"?[q]:name==="f09_reap_email_leases"?0:name==="f09_admit_email_dispatch"?"allowed":true,error:null}));
 m.db.mockReturnValue({from:()=>query,rpc});
 m.source.mockResolvedValue({to:["synthetic@example.invalid"],subject:"Synthetic",textBody:"Synthetic"});
 m.secret.mockResolvedValue({secret:"synthetic-only",error:null});m.token.mockResolvedValue({ready:true,token:"synthetic-only"});
 m.send.mockResolvedValue({kind:"accepted"});m.transport.mockReturnValue(m.send);
});
it("all delivery is paused without the explicit rollout flag",async()=>{
 vi.stubEnv("F09_EMAIL_WORKER_ENABLED","");
 expect(await processQueuedEmail({id:1})).toBe("paused");
 expect((await processQueuedBatch()).paused).toBe(true);expect(m.db).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();
});
it("shared service claims, prepares, fences and finalizes exactly once",async()=>{
 expect(await processQueuedEmail({id:1})).toBe("accepted");
 expect(rpc.mock.calls.map(c=>c[0])).toEqual(["f09_claim_email","f09_admit_email_dispatch","f09_finish_provider_email"]);
 expect(m.send).toHaveBeenCalledTimes(1);expect(m.source).toHaveBeenCalledWith(q,expect.any(AbortSignal));
});
it("fresh source denial cancels before token/provider dispatch",async()=>{
 m.source.mockRejectedValue(new DeliveryPolicyError());
 expect(await processQueuedEmail({id:1})).toBe("cancelled");expect(m.token).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();
});
it.each([0,2])("zero/ambiguous provider matches (%s) never fall back",async n=>{
 rows=Array.from({length:n},()=>provider);
 expect(await processQueuedEmail({id:1})).toBe("permanent");expect(m.secret).not.toHaveBeenCalled();
});
it.each(["smtp","sendgrid"])("unsupported provider %s does not silently change provider",async type=>{
 provider.provider_type=type;expect(await processQueuedEmail({id:1})).toBe("permanent");expect(m.send).not.toHaveBeenCalled();
});
it("unapproved Graph or authority origins are rejected before secret lookup",async()=>{
 provider.graph_base_url="https://untrusted.example.invalid";
 expect((await prepareQueuedDelivery(q,new AbortController().signal)).ready).toBe(false);expect(m.secret).not.toHaveBeenCalled();
});
it("throttled token acquisition retries without a send and preserves Retry-After",async()=>{
 m.token.mockResolvedValue({ready:false,kind:"retry",retryAfter:"2099-01-01T00:00:00Z"});
 expect(await processQueuedEmail({id:1})).toBe("retry");
 expect(rpc).toHaveBeenLastCalledWith("f09_finish_provider_email",expect.objectContaining({p_retry_after:"2099-01-01T00:00:00Z"}));
 expect(m.send).not.toHaveBeenCalled();
});
it("lost finalization response after acceptance never sends again",async()=>{
 rpc.mockImplementation(async(name:string)=>({data:name==="f09_claim_email"?[q]:name==="f09_admit_email_dispatch"?"allowed":true,error:name==="f09_finish_provider_email"?{code:"synthetic"}:null}));
 await expect(processQueuedEmail({id:1})).rejects.toThrow();expect(m.send).toHaveBeenCalledTimes(1);
});
it("lost send response is held unknown",async()=>{
 m.send.mockRejectedValue(Error("synthetic timeout"));expect(await processQueuedEmail({id:1})).toBe("unknown");
 expect(rpc).toHaveBeenLastCalledWith("f09_finish_provider_email",expect.objectContaining({p_outcome:"unknown"}));
});
it("failed final lease fence prevents any network send",async()=>{
 rpc.mockImplementation(async(name:string)=>({data:name==="f09_claim_email"?[q]:"lease_lost",error:null}));
 expect(await processQueuedEmail({id:1})).toBe("lease_lost");expect(m.send).not.toHaveBeenCalled();
});

it.each(["deferred","rejected"] as const)("provider admission %s does not send",async state=>{
 rpc.mockImplementation(async(name:string)=>({data:name==="f09_claim_email"?[q]:name==="f09_admit_email_dispatch"?state:true,error:null}));
 expect(await processQueuedEmail({id:1})).toBe(state==="deferred"?"deferred":"cancelled");
 expect(m.send).not.toHaveBeenCalled();
 if(state==="deferred")expect(rpc.mock.calls.map(c=>c[0])).not.toContain("f09_finish_provider_email");
});
it("passes the exact prepared provider snapshot to atomic admission",async()=>{
 await processQueuedEmail({id:1});
 expect(rpc).toHaveBeenCalledWith("f09_admit_email_dispatch",expect.objectContaining({p_provider_id:9,p_expected:provider}));
});
it("malformed admission response fails closed without sending",async()=>{
 rpc.mockImplementation(async(name:string)=>({data:name==="f09_claim_email"?[q]:"unexpected",error:null}));
 await expect(processQueuedEmail({id:1})).rejects.toThrow("Invalid provider admission");
 expect(m.send).not.toHaveBeenCalled();
});
it("bounds reaper response loss before attempting any claim",async()=>{
 vi.useFakeTimers(); rpc.mockImplementation(()=>new Promise(()=>{}));
 const assertion=expect(processQueuedBatch()).rejects.toThrow("deadline");
 await vi.advanceTimersByTimeAsync(5001);await assertion;
 expect(rpc.mock.calls.map(c=>c[0])).toEqual(["f09_reap_email_leases"]);expect(m.send).not.toHaveBeenCalled();
});
it("does not start another batch claim after its start budget expires",async()=>{
 vi.useFakeTimers(); m.send.mockImplementation(async()=>{await new Promise(resolve=>setTimeout(resolve,15000));return {kind:"accepted"};});
 const result=processQueuedBatch({limit:100});
 await vi.advanceTimersByTimeAsync(30001);
 expect((await result).accepted).toBe(2);expect(m.send).toHaveBeenCalledTimes(2);
 expect(rpc.mock.calls.filter(c=>c[0]==="f09_claim_email")).toHaveLength(2);
});
