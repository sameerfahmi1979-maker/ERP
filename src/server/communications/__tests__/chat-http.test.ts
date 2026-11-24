import { createHash } from "node:crypto";
import JSZip from "jszip";
import { jsPDF } from "jspdf";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake=vi.hoisted(()=>({
  actor:vi.fn(), rpc:vi.fn(), adminRpc:vi.fn(), original:vi.fn(), upload:vi.fn(), permit:vi.fn(), render:vi.fn(),
}));
vi.mock("../export-spool",async load=>{
  const actual=await load<typeof import("../export-spool")>();
  const {mkdtemp,mkdir}=await import("node:fs/promises");
  const {join}=await import("node:path");
  const root=process.platform==="win32" ? "C:/dev/.cache" : (await import("node:os")).tmpdir();
  await mkdir(root,{recursive:true});
  const testVolume=await mkdtemp(join(root,"a08-test-export-"));
  return {...actual,exportSpoolLimits:()=>({root:testVolume,slots:2,bytes:8*1024*1024,recoverySeconds:30})};
});
vi.mock("../media-storage",()=>({boundedChatStorage:()=>({from:()=>({upload:fake.upload})})}));
vi.mock("../access",async load=>({...await load<typeof import("../access")>(),requireCommunicationActor:fake.actor}));
vi.mock("../budget",()=>({reserveCommunicationBudget:fake.permit}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:fake.rpc})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:fake.adminRpc,storage:{from:()=>({
  upload:fake.upload,download:()=>({asStream:fake.original}),
})}})}));
vi.mock("@/lib/pdf/gotenberg",()=>({gotenbergConvertHtml:fake.render}));

import { communicationRoute, communicationJson, CommunicationHttpError, boundedBytes, readCommunicationJson } from "../http";
import { dispatchChat } from "../chat";
import { communicationProfile } from "../profile";
import { chatOperations, MAX_CHAT_FILE_BYTES } from "../contracts";
import { verifiedMediaType } from "../media-format";
import { receiveUpload, serveAttachment, byteRange } from "../media";
import { serveChatExport } from "../chat-export";

const conversation="1fee5575-1765-4413-9053-f7c66b09eabd", attachment="71734d5d-c10c-42e7-98e4-57af1540aa64";
const upload="8cc288e9-76d8-461f-9bdf-dbfbb465bfbd", mutation="d8148641-55af-46e2-886a-3bd82768740f";
const actor={profileId:"23",authUserId:"5c4cf2c5-7d29-403c-9cd7-e3f2d36b5966",authSessionId:"121cabf4-5ecc-487f-aa4f-4206f6055d1d",isGlobalSystemAdmin:false};
const url="https://erp.algt.net/api/mobile/communications/v1";
const document=new jsPDF();
document.text("source material",20,20);
const bytes=Buffer.from(document.output("arraybuffer"));
const sha=createHash("sha256").update(bytes).digest("hex");
const base={bucket:"erp-chat-media",path:upload,filename:"invoice.pdf",mime:"application/pdf",byteLength:bytes.length};
const binding={...base,uploadId:upload,actorId:actor.profileId,sessionId:actor.authSessionId,state:"reserved"};
const attached={...base,id:attachment,revision:"23",sha256:sha};
const receipt={id:mutation,conversationId:conversation,seq:"5",revision:"1"};
const message={...receipt,kind:"text",deleted:false,sentAt:"2026-10-01T20:00:00Z",senderName:"Mona",body:"<script>quote</script>",attachments:[]};
const ok=(data:unknown)=>({data,error:null});
const denied={data:null,error:{code:"PT404",message:"private information"}};
const stream=(value:Buffer)=>new Blob([new Uint8Array(value)]).stream();
const raw=()=>new Request(url,{method:"POST",headers:{"content-type":"application/pdf"},body:bytes});
beforeEach(()=>{
  vi.resetAllMocks();
  fake.actor.mockResolvedValue(actor);
  fake.permit.mockResolvedValue({ok:true,permitId:mutation,expiresAt:new Date(Date.now()+120000),newReservation:true,spool:{bytesPerSlot:"4194304",slotsPerVolume:2,maxVolumes:1,cleanupTailSeconds:180}});
  fake.upload.mockResolvedValue(ok({path:upload}));
  fake.adminRpc.mockImplementation(async name=>{
    if (name==="erp_chat_stage_open") return ok({uploadId:upload,bucket:base.bucket,path:upload,state:"reserved",stageExpiresAt:new Date(Date.now()+60000).toISOString()});
    if (name==="erp_chat_stage_abort") return ok({queued:true});
    return ok({uploadId:upload,state:"verified"});
  });
  fake.original.mockImplementation(async()=>ok(stream(bytes)));
  fake.render.mockResolvedValue({buffer:Buffer.from("rendered transcript")});
});

describe("shared authorization and command transport",()=>{
  it("rejects missing and malformed bearer credentials",async()=>{
    const work=vi.fn();
    for (const h of [{},{authorization:"Bearer bad"},{authorization:"Basic a",cookie:"sb-ref-auth-token=a"}]) {
      const r=await communicationRoute(new Request(url,{headers:h as HeadersInit}),work);
      expect(r.status).toBe(401);
    }
    expect(work).not.toHaveBeenCalled();
  });
  it("rejects foreign cookie origins and contradictory sessions before work",async()=>{
    const work=vi.fn();
    const headers={"authorization":"Bearer aaa.bbb.ccc","cookie":"sb-ref-auth-token.0=abc","origin":"https://foreign.test","X-ERP-Communication-Session":createHash("sha256").update(actor.authSessionId).digest("hex")};
    expect((await communicationRoute(new Request(url,{method:"POST",headers}),work)).status).toBe(403);
    headers.origin=process.env.NEXT_PUBLIC_SITE_URL ?? "https://erp.algt.net";
    fake.actor.mockResolvedValueOnce(actor).mockResolvedValueOnce({...actor,authSessionId:mutation});
    expect((await communicationRoute(new Request(url,{method:"POST",headers}),work)).status).toBe(401);
    expect(work).not.toHaveBeenCalled();
    const r=await communicationRoute(new Request(url,{method:"POST",headers}),async a=>communicationJson({id:a.profileId}));
    expect(await r.json()).toEqual({success:true,data:{id:"23"}});
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
  it("denies forged actors, internal commands, omitted mode, reversed range and oversized files",async()=>{
    for (const command of [{op:"chat.actor",args:{}},{op:"chat.messages",args:{conversationId:conversation}},
      {op:"chat.send",args:{conversationId:conversation,clientMutationId:mutation,body:"ok",actorId:"999"}},
      {op:"chat.search",args:{query:"a",mode:"review",from:"2026-11-10T00:00:00Z",until:"2026-10-10T00:00:00Z"}}])
      await expect(dispatchChat(command,actor)).rejects.toMatchObject({status:400});
    const body={clientMutationId:mutation,conversationId:conversation,byteLength:MAX_CHAT_FILE_BYTES,filename:"v.m4a",mime:"audio/mp4",kind:"voice"};
    expect(chatOperations["chat.uploadBegin"].safeParse(body).success).toBe(true);
    await expect(dispatchChat({op:"chat.uploadBegin",args:{...body,byteLength:MAX_CHAT_FILE_BYTES+1}},actor)).rejects.toMatchObject({status:413});
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("requires strict system administration, typed arguments and a bound permit for history maintenance", async () => {
    const command = { op: "chat.historyCapacity", args: { slotCount: 2 } };
    const admin = { ...actor, isGlobalSystemAdmin: true };
    await expect(dispatchChat(command, actor)).rejects.toMatchObject({ status: 403 });
    for (const slotCount of [0, 4097, "2", 1.5]) {
      await expect(dispatchChat({ ...command, args: { slotCount } }, admin)).rejects.toMatchObject({ status: 400 });
    }
    await expect(dispatchChat({ op: "chat.scopeReconcile", args: { episodeId: 2 } }, admin)).rejects.toMatchObject({ status: 400 });
    expect(fake.permit).not.toHaveBeenCalled();
    fake.rpc.mockResolvedValueOnce(ok({ prepared: 2 }));
    await expect(dispatchChat(command, admin)).resolves.toEqual({ prepared: 2 });
    expect(fake.permit.mock.calls[0][0].binding.command).toEqual(command);
    expect(fake.rpc.mock.calls[0]).toEqual(["erp_chat_v1", { p_request: { ...command, _budgetPermitId: mutation } }]);
  });
  it("uses the same actor-scoped RPC on retry and denies revocation before returning historical results",async()=>{
    const command={op:"chat.send",args:{conversationId:conversation,body:"Hello",clientMutationId:mutation}};
    fake.rpc.mockResolvedValueOnce(ok(receipt)).mockResolvedValueOnce(denied);
    expect(await dispatchChat(command,actor)).toEqual(receipt);
    await expect(dispatchChat(command,actor)).rejects.toMatchObject({status:404});
    expect(fake.rpc.mock.calls[0]).toEqual(["erp_chat_v1",{p_request:{...command,_budgetPermitId:mutation}}]);
    expect(fake.rpc.mock.calls[1]).toEqual(fake.rpc.mock.calls[0]);
    expect(fake.permit.mock.calls[0][0].operationId).not.toBe(fake.permit.mock.calls[1][0].operationId);
    expect(fake.permit.mock.calls[1][0].binding).toEqual({actorSessionId:actor.authSessionId,command});
  });
  it("returns navigation eligibility when operations are held and returns a truthful cost error on send",async()=>{
    fake.rpc.mockResolvedValue(ok({profileId:actor.profileId,isGlobalSystemAdmin:false,canReviewHistory:false,canCreateGroup:true,canCreatePttChannel:false,authSessionId:actor.authSessionId}));
    const p=await communicationProfile({},actor);
    expect(p.chat.eligible && p.ptt.eligible).toBe(true);
    expect(p).not.toHaveProperty("authSessionId");
    expect(fake.permit).not.toHaveBeenCalled();
    fake.permit.mockResolvedValue({ok:false,reason:"feature_disabled"});
    await expect(dispatchChat({op:"chat.activity",args:{conversationId:conversation}},actor)).rejects.toThrow("feature_disabled");
    expect(fake.rpc).toHaveBeenCalledTimes(3);
  });
  it.each([true,false])("uses current authenticated budget-monitor authority for the owner entry (%s)",async canMonitor=>{
    fake.rpc.mockImplementation(async(name:string)=>ok(name==="erp_comm_budget_operator"
      ? {scope:"communications",canMonitor,canApprove:canMonitor}
      : {profileId:actor.profileId,isGlobalSystemAdmin:false,canReviewHistory:false,canCreateGroup:true,canCreatePttChannel:false}));
    const p=await communicationProfile({},actor);
    expect(p).toHaveProperty("budget",{eligible:canMonitor});
    expect(fake.rpc).toHaveBeenCalledWith("erp_comm_budget_operator",{p_profile:actor.profileId,p_session:actor.authSessionId,
      p_op:"budget.status",p_args:{scope:"communications"}});
    expect(fake.permit).not.toHaveBeenCalled();
  });
  it("hides the budget entry on unavailable or malformed authority without hiding existing workspaces",async()=>{
    const caps={profileId:actor.profileId,isGlobalSystemAdmin:false,canReviewHistory:false,canCreateGroup:true,canCreatePttChannel:false};
    for(const budget of [{scope:"communications",canMonitor:"true"},{scope:"another",canMonitor:true},null]){
      fake.rpc.mockImplementation(async(name:string)=>ok(name==="erp_comm_budget_operator"?budget:caps));
      const p=await communicationProfile({},actor);
      expect(p).toHaveProperty("budget",{eligible:false});
      expect(p.chat.eligible&&p.ptt.eligible).toBe(true);
    }
    fake.rpc.mockImplementation(async(name:string)=>{if(name==="erp_comm_budget_operator")throw Error("Unavailable");return ok(caps);});
    expect(await communicationProfile({},actor)).toHaveProperty("budget",{eligible:false});
  });
  it("bounds the actual body even with no content length and rejects invalid UTF-8",async()=>{
    await expect(boundedBytes(stream(Buffer.alloc(9)),8)).rejects.toMatchObject({status:413});
    const req=new Request(url,{method:"POST",headers:{"content-type":"application/json"},body:new Uint8Array([255])});
    await expect(readCommunicationJson(req)).rejects.toMatchObject({status:400});
  });
});

describe("private byte handling",()=>{
  it("verifies container kind and Office content without accepting arbitrary archives",async()=>{
    const z=new JSZip();
    z.file("word/document.xml","<w:document/>");
    z.file("_rels/.rels","<Relationships/>");
    z.file("[Content_Types].xml",'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    const office=await z.generateAsync({type:"nodebuffer",compression:"DEFLATE"});
    expect(verifiedMediaType(office,"meeting.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toContain("wordprocessing");
    expect(()=>verifiedMediaType(office,"meeting.xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toThrow();
    expect(()=>verifiedMediaType(bytes,"meeting.png","image/png")).toThrow();
    expect(()=>verifiedMediaType(bytes.subarray(0,-4),"meeting.pdf","application/pdf")).toThrow();
    expect(()=>verifiedMediaType(Buffer.alloc(0),"meeting.pdf","application/pdf")).toThrow();
  });
  it("accepts the exact per-file transfer limit and cancels a stream that exceeds it",async()=>{
    const chunk=new Uint8Array(1024*1024);
    const body=(extra:boolean)=>new ReadableStream<Uint8Array>({start(controller){
      for(let n=0;n<50;n++) controller.enqueue(chunk);
      if(extra) controller.enqueue(new Uint8Array(1));
      controller.close();
    }});
    expect((await boundedBytes(body(false),MAX_CHAT_FILE_BYTES)).length).toBe(MAX_CHAT_FILE_BYTES);
    await expect(boundedBytes(body(true),MAX_CHAT_FILE_BYTES)).rejects.toMatchObject({status:413});
  });
  it("checks recorded-audio structure and rejects truncated or mislabeled data",()=>{
    const sample=Buffer.alloc(46);
    sample.write("RIFF");sample.writeUInt32LE(38,4);sample.write("WAVEfmt ",8);
    sample.writeUInt32LE(16,16);sample.writeUInt16LE(1,20);sample.writeUInt16LE(1,22);
    sample.writeUInt32LE(8000,24);sample.writeUInt32LE(16000,28);sample.writeUInt16LE(2,32);
    sample.writeUInt16LE(16,34);sample.write("data",36);sample.writeUInt32LE(2,40);
    expect(verifiedMediaType(sample,"voice.wav","audio/wav")).toBe("audio/wav");
    expect(()=>verifiedMediaType(sample.subarray(0,-1),"voice.wav","audio/wav")).toThrow();
    expect(()=>verifiedMediaType(sample,"voice.webm","audio/webm")).toThrow();
  });
  it("attests stored originals with trusted session, exact bytes and digest",async()=>{
    fake.rpc.mockResolvedValue(ok(binding));
    const r=await receiveUpload(raw(),upload,actor);
    expect(await r.json()).toEqual({success:true,data:{uploadId:upload,state:"verified"}});
    expect(fake.upload.mock.calls[0][2].upsert).toBe(false);
    expect(fake.adminRpc.mock.calls.at(-1)).toEqual(["erp_chat_upload_verified",{p_permit:mutation,p_upload:upload,p_actor:"23",p_session:actor.authSessionId,p_size:bytes.length,p_mime:base.mime,p_sha256:sha}]);
  });
  it("fails a retry with different immutable bytes, and revocation during transfer",async()=>{
    fake.rpc.mockResolvedValue(ok(binding));
    fake.upload.mockResolvedValue({error:{message:"already exists"}});
    fake.original.mockResolvedValueOnce(ok(stream(Buffer.alloc(bytes.length))));
    await expect(receiveUpload(raw(),upload,actor)).rejects.toMatchObject({status:409});
    fake.rpc.mockResolvedValueOnce(ok(binding)).mockResolvedValueOnce(ok(binding)).mockResolvedValueOnce(denied);
    await expect(receiveUpload(raw(),upload,actor)).rejects.toMatchObject({status:404});
    expect(fake.adminRpc.mock.calls.map(call=>call[0])).toContain("erp_chat_stage_abort");
    expect(fake.adminRpc.mock.calls.map(call=>call[0])).not.toContain("erp_chat_upload_verified");
  });
  it("requires a funded cleanup obligation before the first private storage write",async()=>{
    fake.rpc.mockResolvedValue(ok(binding));
    fake.adminRpc.mockResolvedValueOnce({data:null,error:{code:"PT503"}});
    await expect(receiveUpload(raw(),upload,actor)).rejects.toMatchObject({status:503});
    expect(fake.upload).not.toHaveBeenCalled();
    expect(fake.permit.mock.calls.at(-1)?.[0].binding).toEqual({actorSessionId:actor.authSessionId,command:{
      op:"chat.stageOpen",args:{uploadId:upload,actorId:actor.profileId,sessionId:actor.authSessionId},
    }});
  });
  it("queues failed writes for cleanup even when the original actor has since been revoked",async()=>{
    fake.rpc.mockResolvedValue(ok(binding));
    fake.upload.mockRejectedValueOnce(Error("transfer timed out"));
    fake.original.mockResolvedValueOnce({data:null,error:{code:"503"}});
    await expect(receiveUpload(raw(),upload,actor)).rejects.toMatchObject({status:503});
    expect(fake.adminRpc.mock.calls.at(-1)).toEqual(["erp_chat_stage_abort",{p_upload:upload,p_actor:actor.profileId,p_session:actor.authSessionId}]);
    expect(fake.adminRpc.mock.calls.some(([n])=>n==="erp_chat_upload_verified")).toBe(false);
  });
  it("recovers a committed verification receipt after a lost response without queuing deletion",async()=>{
    fake.rpc.mockResolvedValueOnce(ok(binding)).mockResolvedValueOnce(ok(binding)).mockResolvedValueOnce(ok(binding)).mockResolvedValueOnce(ok({...binding,state:"attached"}));
    const common=fake.adminRpc.getMockImplementation()!;
    fake.adminRpc.mockImplementation(async (name,...args)=>name==="erp_chat_upload_verified" ? {data:null,error:{code:"PT503"}} : common(name,...args));
    const r=await receiveUpload(raw(),upload,actor);
    expect(await r.json()).toEqual({success:true,data:{uploadId:upload,state:"attached"}});
    expect(fake.adminRpc.mock.calls.some(([n])=>n==="erp_chat_stage_abort")).toBe(false);
  });
  it("checks final access and bytes before returning even a small range",async()=>{
    fake.rpc.mockResolvedValueOnce(ok(attached)).mockResolvedValueOnce(denied);
    const req=new Request(url,{headers:{range:"bytes=0-3"}});
    await expect(serveAttachment(req,attachment,"participant",actor)).rejects.toMatchObject({status:404});
    fake.rpc.mockResolvedValue(ok(attached));
    const r=await serveAttachment(req,attachment,"participant",actor);
    expect([r.status,await r.text(),r.headers.get("content-range")]).toEqual([206,"%PDF","bytes 0-3/"+bytes.length]);
    expect(byteRange("bytes=-2",9)).toEqual({start:7,end:8});
    expect(()=>byteRange("bytes=18-20",9)).toThrow(CommunicationHttpError);
  });
});

describe("snapshot ZIP",{timeout:45000},()=>{
  it("refuses a configured spool larger than the verified finite cost envelope",async()=>{
    fake.permit.mockResolvedValueOnce({ok:true,permitId:mutation,expiresAt:new Date(Date.now()+120000),newReservation:true,spool:{bytesPerSlot:"1",slotsPerVolume:1,maxVolumes:1,cleanupTailSeconds:60}});
    await expect(serveChatExport({conversationId:conversation,mode:"participant"},actor)).rejects.toMatchObject({status:503});
    expect(fake.rpc).not.toHaveBeenCalled();expect(fake.render).not.toHaveBeenCalled();
  });
  it("renders escaped content and packages only participant-visible bytes",async()=>{
    const deleted={...message,id:attachment,seq:"6",deleted:true,body:"retained original",attachments:[{id:attachment,filename:"sensitive.pdf"}]};
    fake.rpc.mockImplementation(async(name:string,args:{p_limit:number})=>
      name==="erp_chat_export_page" ? ok({revision:"8",items:args.p_limit===1?[message]:[message,deleted],nextSeq:null}) : denied);
    const response=await serveChatExport({conversationId:conversation,mode:"participant"},actor);
    expect(response.headers.get("content-type")).toBe("application/zip");
    const archive=await JSZip.loadAsync(await response.arrayBuffer());
    expect(Object.keys(archive.files)).toEqual(["transcript.pdf"]);
    const html=fake.render.mock.calls[0][0].html;
    expect(html).toContain("&lt;script&gt;quote&lt;/script&gt;");
    expect(html).toContain("Message deleted");
    expect(html).not.toMatch(/retained original|sensitive.pdf/);
  });
  it("returns an authorized reviewer original and rechecks membership before release",async()=>{
    const row={...message,deleted:true,body:"retained original",attachments:[{id:attachment,filename:"invoice.pdf"}]};
    const batch=ok({revision:"8",items:[row],nextSeq:null});
    fake.rpc.mockImplementation(async name=>name==="erp_chat_attachment_bind"?ok(attached):batch);
    const input={conversationId:conversation,mode:"review"};
    const response=await serveChatExport(input,actor);
    const zip=await JSZip.loadAsync(await response.arrayBuffer());
    expect(await zip.file("attachments/"+attachment+"-invoice.pdf")?.async("nodebuffer")).toEqual(bytes);
    expect(fake.render.mock.calls[0][0].html).toContain("retained original");
    fake.rpc.mockReset().mockResolvedValueOnce(batch).mockResolvedValueOnce(ok(attached)).mockResolvedValueOnce(ok(attached)).mockResolvedValueOnce(denied);
    await expect(serveChatExport(input,actor)).rejects.toMatchObject({status:404});
  });
  it("merges bounded transcript parts in order without creating a plaintext file",async()=>{
    const rows=Array.from({length:8},(_,n)=>({...message,seq:String(n+1),body:"a".repeat(31000)}));
    fake.rpc.mockImplementation(async(_,p)=>ok({revision:"8",items:p.p_limit===1?[rows[0]]:rows,nextSeq:null}));
    fake.render.mockResolvedValueOnce({buffer:Buffer.from("first rendered part")}).mockResolvedValueOnce({buffer:Buffer.from("second rendered part")});
    const merged=vi.fn<typeof fetch>(async(url,init)=>{
      expect(String(url)).toMatch(/\/forms\/pdfengines\/merge$/);
      const data=await new Request(url,init).formData();
      const files=data.getAll("files") as File[];
      expect(files.map(file=>file.name)).toEqual(["00000000.pdf","00000001.pdf"]);
      expect(await Promise.all(files.map(file=>file.text()))).toEqual(["first rendered part","second rendered part"]);
      return new Response(new Uint8Array(bytes),{headers:{"content-type":"application/pdf"}});
    });
    const response=await serveChatExport({conversationId:conversation,mode:"participant"},actor,merged);
    const zip=await JSZip.loadAsync(await response.arrayBuffer());
    expect(await zip.file("transcript.pdf")?.async("nodebuffer")).toEqual(bytes);
    expect(merged).toHaveBeenCalledTimes(1);
  });
  it("detects changed independently protected DMS access on a final page projection",async()=>{
    fake.rpc.mockResolvedValueOnce(ok({revision:"8",items:[{...message,dmsRef:{token:"secret"}}],nextSeq:null}))
      .mockResolvedValueOnce(ok({revision:"8",items:[message],nextSeq:null}));
    await expect(serveChatExport({conversationId:conversation,mode:"participant"},actor)).rejects.toMatchObject({status:409});
    expect(fake.render.mock.calls[0][0].html).not.toContain("secret");
  });
});
