import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { createHash } from "node:crypto";
vi.mock("server-only",()=>({}));
const mock=vi.hoisted(()=>({admit:vi.fn(),rpc:vi.fn(),download:vi.fn()}));
vi.mock("../http",async original=>({...await original<typeof import("../http")>(),admitOperation:mock.admit,userRpc:mock.rpc}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({storage:{from:()=>({download:mock.download})}})}));
vi.mock("@/lib/config/server-features",()=>({getAdminConfig:()=>({url:"https://fixture.invalid",serviceKey:"local-fixture"})}));
import { replayPttRecording,uploadPttRecording } from "../ptt-recordings";

const id="aeccd741-b6f2-4f61-9821-3fdb892728c9", key="8964e818-41ed-4f6c-8203-fc8d08d041b5";
const actor={profileId:"3",authUserId:key,authSessionId:id,isGlobalSystemAdmin:false};
const body=Buffer.alloc(16044);
body.write("RIFF");body.writeUInt32LE(body.length-8,4);body.write("WAVEfmt ",8);body.writeUInt32LE(16,16);
body.writeUInt16LE(1,20);body.writeUInt16LE(1,22);body.writeUInt32LE(8000,24);body.writeUInt32LE(16000,28);
body.writeUInt16LE(2,32);body.writeUInt16LE(16,34);body.write("data",36);body.writeUInt32LE(16000,40);
const hash=createHash("sha256").update(body).digest("hex");
function upload(){return new Request("https://erp.example/ptt/uploads/"+id,{method:"POST",body:new Uint8Array(body),
  headers:{"content-type":"audio/wav","content-length":String(body.length),"x-ptt-channel":key,"x-ptt-epoch":id,"x-ptt-sha256":hash}});}
const get=()=>new Request("https://erp.example/ptt/recordings/"+id+"?mode=participant");
function read(bytes:Buffer){mock.download.mockReturnValue({asStream:async()=>({data:new Response(new Uint8Array(bytes)).body,error:null})});}
beforeEach(()=>{vi.resetAllMocks();mock.admit.mockResolvedValue({permitId:key,expiresAt:new Date(Date.now()+60000)});
  read(body);vi.stubGlobal("fetch",vi.fn(async()=>new Response(null,{status:201})));});
afterEach(()=>vi.unstubAllGlobals());
describe("private PTT relay",()=>{
  it("binds paid stage, checks actual stored PCM and finalizes only confirmed bytes",async()=>{
    mock.rpc.mockResolvedValueOnce({state:"ready"}).mockResolvedValueOnce({objectId:key}).mockResolvedValueOnce({state:"ready"}).mockResolvedValueOnce({state:"sent"});
    const response=await uploadPttRecording(upload(),id,actor);
    expect(await response.json()).toEqual({success:true,data:{state:"sent"}});
    expect(mock.rpc.mock.calls.at(-1)?.[1]).toMatchObject({p_request:{op:"pttRecording.finalize",args:{objectId:key,recordingId:id,byteSize:body.length,durationMs:1000,sha256:hash}}});
    expect(mock.admit.mock.calls.every(args=>args[1]==="ptt_replay" && args[3]===true)).toBe(true);
    expect(mock.download.mock.calls[0][0]).toBe(key+".wav");
  });
  it("does not finalize a mismatched staged original",async()=>{
    const changed=Buffer.from(body);changed[44]^=1;read(changed);
    mock.rpc.mockResolvedValueOnce({state:"ready"}).mockResolvedValueOnce({objectId:key}).mockResolvedValueOnce({state:"ready"});
    await expect(uploadPttRecording(upload(),id,actor)).rejects.toMatchObject({code:"conflict"});
    expect(mock.rpc.mock.calls.map(args=>args[1].p_request.op)).not.toContain("pttRecording.finalize");
  });
  it("returns private audio only after a second access check",async()=>{
    const plan={id,objectId:key,byteSize:body.length,sha256:hash};
    mock.rpc.mockResolvedValue(plan);const response=await replayPttRecording(get(),id,actor);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(body);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-disposition")).toBeNull();
    mock.rpc.mockResolvedValueOnce(plan).mockRejectedValueOnce(new Error("Access revoked"));
    await expect(replayPttRecording(get(),id,actor)).rejects.toThrow("Access revoked");
  });
});
