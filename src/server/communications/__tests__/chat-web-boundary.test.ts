import { createHash } from "node:crypto";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { POST } from "@/app/api/mobile/communications/v1/route";
import { GET as readFile } from "@/app/api/mobile/communications/v1/attachments/[attachmentId]/route";

const mocks=vi.hoisted(()=>({actor:vi.fn(),rpc:vi.fn(),chat:vi.fn(),sos:vi.fn(),policy:vi.fn(),notes:vi.fn(),file:vi.fn()}));
vi.mock("../access",async load=>({...await load<typeof import("../access")>(),requireCommunicationActor:mocks.actor}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:mocks.rpc})}));
vi.mock("../chat",()=>({dispatchChat:mocks.chat}));
vi.mock("../sos",()=>({dispatchSos:mocks.sos}));
vi.mock("../policy",()=>({dispatchPolicy:mocks.policy}));
vi.mock("../notifications",()=>({dispatchNotifications:mocks.notes}));
vi.mock("../media",()=>({serveAttachment:mocks.file}));

const first={profileId:"1",authUserId:"77d82673-c929-4cf6-be28-ce8329c23c9a",authSessionId:"1cbd5251-dc39-4e00-9ac1-d5c3a3978a70",isGlobalSystemAdmin:false};
const second={...first,profileId:"2",authUserId:"e9a60115-fb95-4117-b7ef-3b2fc27f3d16",authSessionId:"a75e0733-21c1-4af1-a2e6-edd51604f7df"};
const url="https://erp.algt.net/api/mobile/communications/v1",cookie={"cookie":"sb-erp-auth-token=synthetic","origin":"https://erp.algt.net"};
const header=(session:string)=>({"X-ERP-Communication-Session":createHash("sha256").update(session).digest("hex")});
const post=(op:string,headers:HeadersInit)=>POST(new Request(url,{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify({op,args:{}})}));
function useActor(actor:typeof first) {
  mocks.actor.mockResolvedValue(actor);
  mocks.rpc.mockResolvedValue({data:{...actor,canCreateGroup:false,canReviewHistory:false,canCreatePttChannel:false},error:null});
}
beforeEach(()=>{
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL","https://erp.algt.net");
  vi.stubEnv("ERP_COMM_WEB_CACHE_SECRET","dedicated-synthetic-test-secret-32-bytes-plus");
  useActor(first);
});
afterEach(()=>vi.unstubAllEnvs());

describe("cookie workspace session binding",()=>{
  it("derives a stable account wrapping key only for the verified current browser session",async()=>{
    const profile=async(headers:HeadersInit)=>(await (await post("communications.profile",headers)).json()).data;
    const result=await profile({...cookie,...header(first.authSessionId)});
    expect(result.webCache).toMatchObject({version:1,reason:"available",wrappingKey:expect.stringMatching(/^[A-Za-z0-9_-]{43}$/)});
    expect(await profile(cookie)).toMatchObject({webCache:{wrappingKey:null,reason:"session_binding_required"}});
    expect(await profile({authorization:"Bearer aaa.bbb.ccc"})).not.toHaveProperty("webCache");
    expect(await profile({...cookie,...header(first.authSessionId),authorization:"Bearer aaa.bbb.ccc"})).not.toHaveProperty("webCache");
    useActor(second);
    expect((await post("communications.profile",{...cookie,...header(first.authSessionId)})).status).toBe(401);
    const other=await profile({...cookie,...header(second.authSessionId)});
    expect(other.webCache.wrappingKey).not.toBe(result.webCache.wrappingKey);
    const renewed={...first,authSessionId:second.authSessionId};
    useActor(renewed);
    expect((await profile({...cookie,...header(renewed.authSessionId)})).webCache.wrappingKey).toBe(result.webCache.wrappingKey);
    vi.stubEnv("ERP_COMM_WEB_CACHE_SECRET","short");
    expect((await profile({...cookie,...header(renewed.authSessionId)})).webCache).toEqual({version:1,reason:"secret_unconfigured",wrappingKey:null});
  });
  it("rejects old-tab commands and file reads even when the current signed-in account is valid",async()=>{
    useActor(second);
    for (const h of [cookie,{...cookie,...header(first.authSessionId)}]) {
      expect((await post("chat.send",h)).status).toBe(401);
      expect((await readFile(new Request(url+"?mode=participant",{headers:h}),{params:Promise.resolve({attachmentId:first.authSessionId})})).status).toBe(401);
    }
    expect(mocks.chat).not.toHaveBeenCalled();expect(mocks.file).not.toHaveBeenCalled();
  });
  it("wires cookie access to policy and centre operations and enforces native-only SOS/device endpoints",async()=>{
    const same={...cookie,...header(first.authSessionId)},native={authorization:"Bearer aaa.bbb.ccc"};
    expect((await post("policy.status",same)).status).toBe(200);
    expect((await post("notifications.status",same)).status).toBe(200);
    expect(mocks.notes).toHaveBeenCalledTimes(1);expect(mocks.policy).toHaveBeenCalledTimes(1);
    for (const op of ["ptt.state","pttRecording.history","sos.send","notifications.registerDevice","notifications.unregisterDevice","notifications.preview"])
      expect((await post(op,same)).status).toBe(403);
    expect((await post("sos.send",native)).status).toBe(200);
    expect((await post("notifications.preview",native)).status).toBe(200);
    expect(mocks.sos).toHaveBeenCalledTimes(1);expect(mocks.notes).toHaveBeenCalledTimes(2);
  });
});
